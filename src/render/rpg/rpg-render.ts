/**
 * rpg-render.ts — RPG tab rendering system.
 *
 * Manages an independent canvas that dynamically fills its container with:
 *   - A player-controllable sand mote (3x3 pixels, always-glowing)
 *   - Touch joystick (mobile) and WASD / Arrow key (desktop) controls
 *   - Auto-move mode: player moves toward nearest enemy when enabled
 *   - A smoothly interpolated comet-glow effect behind the player mote
 *   - Laser enemies (2x2 red motes) with patrol, attack-detect, dash, and cooldown phases
 *   - A bezier lineDash attack-trail effect during the enemy dash
 *   - A DOM stats panel (HP / ATK / DEF / WAVE / BOOST / weapon) above the navigation bar
 *   - A data-driven wave system (see src/data/rpg/wave-definitions.ts)
 *   - A smooth death to restart loop with visual transition effects
 *   - Player auto-attack: shoots the closest enemy each cooldown tick.
 *     Weapon effects: single (closest), multi (N closest), aoe (all in radius),
 *     piercing (closest, partial DEF bypass).
 *   - Equipped-weapon visual particle: a mote of the weapon's tier color
 *     perpetually orbits the player to communicate the equipped weapon.
 *   - Orbiting projectile upgrade: a comet projectile orbits the player,
 *     damaging enemies on contact (requires 'orbit_projectile' upgrade).
 *
 * Internal resolution is computed dynamically from the container at each
 * resize() call so the canvas fills the full gameplay area without
 * pillarboxing/letterboxing, matching the width of the stats bar.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import {
  getXpPerKill, getXpAtkBonus, getXpDefBonus, formatXp, getRpgSpeedMultiplier, getRpgUpgradeLevel,
  PLAYER_BASE_ATK, getScaledWeaponDamage, getScaledWeaponCooldown, getWaveStatScale,
} from '../../sim/rpg/rpg-state';
import { getWaveDefinition } from '../../data/rpg/wave-definitions';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import { createRpgFluid } from './rpg-fluid';

// ── Dynamic internal resolution ───────────────────────────────────
// These are updated by resize() to match the container's client dimensions.
// The default values kick in before the first resize() call.
let INTERNAL_WIDTH  = 320;
let INTERNAL_HEIGHT = 568;

const RPG_TRAIL_CAPACITY   = 60;
const MAX_RPG_SPEED        = 3.0;
const RPG_VELOCITY_DAMPING = 0.88;
const RPG_MOTE_SIZE        = 3;
const RPG_MOTE_COLOR       = '#ffd764';
const RPG_MOTE_GLOW        = '#ffe599';
const TRAIL_SPEED_THRESHOLD = 0.15;
const GLOW_PULSE_SPEED      = 2.5;
const GLOW_MOVE_RAMP_UP   = 0.007;
const GLOW_MOVE_RAMP_DOWN = 0.004;

const PLAYER_HP_INIT  = 100;
const PLAYER_ATK_INIT = PLAYER_BASE_ATK;
const PLAYER_DEF_INIT =   5;

const JOYSTICK_OUTER_RADIUS = 28;
const JOYSTICK_THUMB_RADIUS = 12;

const LASER_ENEMY_SIZE        =   4;
const LASER_ENEMY_COLOR       = '#ff3333';
const LASER_ENEMY_GLOW        = '#ff6666';
const LASER_HP_INIT           =  20;
const LASER_ATK_INIT          =  10;
const LASER_DEF_INIT          =   5;
const LASER_ATTACK_RADIUS     =  80;
const LASER_DECEL_DURATION_MS = 500;
const LASER_DASH_SPEED        =   8.0;
const LASER_DASH_DISTANCE     = 100;
const LASER_COOLDOWN_MS       = 1250;
const LASER_OVERSHOOT_DAMPING = 0.72;
const LASER_OVERSHOOT_STOP    = 0.15;
const LASER_TRAIL_ERASE_MS    = 450;
const LASER_PATROL_SPEED_MAX  = 0.7;
const LASER_PATROL_DAMPING    = 0.97;
const LASER_PATROL_TURN_MS    = 2500;

const PLAYER_HIT_RADIUS = 4;

const LASER_DECEL_FACTOR             = 0.80;
const ATTACK_TRAIL_CURVE_VARIATION   = 0.35;
const ATTACK_TRAIL_LENGTH_SCALE      = 1.1;
const ATTACK_TRAIL_ALPHA             = 0.9;
const ATTACK_TRAIL_ERASE_FADE        = 0.5;
const PATROL_TURN_DELAY_MIN_FACTOR   = 0.6;
const PATROL_TURN_DELAY_RANGE_FACTOR = 0.8;

const INTER_WAVE_DELAY_MS = 2500;
const DEATH_ANIM_DURATION_MS = 1800;
const DEATH_HOLD_DURATION_MS = 400;
const RESTART_FADE_IN_MS     = 700;
const DEATH_BURST_COUNT      = 20;
/** Colors used for the radial death burst particles. */
const DEATH_PARTICLE_COLORS  = ['#ffd764', '#ffe599', '#ffcc33', '#ffffff'] as const;

// ── Player attack constants ────────────────────────────────────────
/** Cooldown (ms) when no weapon is equipped. */
const PLAYER_BASE_COOLDOWN_MS  = 1200;
/** Attack range (px) when no weapon is equipped. */
const PLAYER_BASE_RANGE_PX     = 50;
/** Duration (ms) for the hit-flash visual effect. */
const HIT_EFFECT_DURATION_MS   = 220;
/** Sentinel weapon id used in `weaponAttackTimers` when no weapon is equipped. */
const BASE_ATTACK_TIMER_KEY    = '__base__';
/** Duration (ms) for the shot-line visual effect. */
const SHOT_LINE_DURATION_MS    = 120;
/** Target frame time in ms at 60 FPS — used to normalise dt-scaled physics. */
const TARGET_FRAME_MS          = 16.667;
/** Flicker on/off interval (ms) while the player has invincibility frames (~8 Hz). */
const IFRAME_FLICKER_INTERVAL_MS = 62.5;

// ── Damage numbers ─────────────────────────────────────────────
/** How long a damage number stays visible (ms). */
const DAMAGE_NUM_DURATION_MS   = 900;
/** Minimum font size for a nearly-zero-damage hit (internal canvas px). 3× original. */
const DAMAGE_NUM_MIN_FONT_PX   = 12;
/** Maximum font size for a 100 %-health hit (internal canvas px). 3× original. */
const DAMAGE_NUM_MAX_FONT_PX   = 42;
/** Initial travel speed of a damage number (px per dt unit). */
const DAMAGE_NUM_INITIAL_SPEED = 1.8;
/** Per-frame velocity damping factor (at 60 fps scale). */
const DAMAGE_NUM_DECEL         = 0.88;

// ── Invincibility frames ────────────────────────────────────────
/** Minimum iframes duration after any hit (ms). */
const PLAYER_IFRAME_MIN_MS     = 280;
/** Additional iframes earned for a full-HP (100 %) hit (ms). */
const PLAYER_IFRAME_MAX_ADD_MS = 1200;

// ── Knockback ───────────────────────────────────────────────────
/** Maximum knockback speed applied at 100 % relative damage. */
const PLAYER_KNOCKBACK_MAX     = 7.0;

// ── Auto-move ──────────────────────────────────────────────────
/** Minimum joystick displacement (canvas px) to count as active manual control. */
const AUTO_MOVE_JOYSTICK_DEAD_ZONE = 1.0;

// ── Equipped-weapon visual particle ───────────────────────────
/** Angular speed of the equipped-weapon orbit particle (radians per second). */
const WEAPON_PARTICLE_ORBIT_SPEED  = 2.2;
/** Orbit radius for the equipped-weapon particle (internal px). */
const WEAPON_PARTICLE_ORBIT_RADIUS = 12;
/** Minimum speed so the particle never appears frozen. */
const WEAPON_PARTICLE_MIN_SPEED    = 0.5;

// ── Orbiting projectile upgrade ───────────────────────────────
/** Angular speed of the orbit projectile (radians per second). Rotation is counter-clockwise (angle is decremented each frame). */
const ORBIT_PROJ_SPEED_RAD   = 7.0;  // 2× original speed
/** Orbit radius for the orbit projectile (internal px). */
const ORBIT_PROJ_RADIUS      = 20;
/** Size (px) of the orbit projectile mote. */
const ORBIT_PROJ_SIZE        = 3;
/** Trail capacity for the orbit projectile. */
const ORBIT_PROJ_TRAIL_CAP   = 20;
/** Trail capacity for the equipped-weapon orbit particle. */
const WEAPON_ORBIT_TRAIL_CAP = 20;
/** Hit radius for orbit projectile — enemy collision detection. */
const ORBIT_PROJ_HIT_RADIUS  = 5;
/** Damage dealt per orbit-projectile hit. */
const ORBIT_PROJ_DAMAGE      = 15;
/** Cooldown between orbit-projectile hits on the same enemy (ms). */
const ORBIT_PROJ_HIT_CD_MS   = 500;
/** Font string for damage number rendering. */
const DAMAGE_NUM_FONT_FAMILY = '"Pixelify Sans", monospace';

// ── Sapphire enemy constants ───────────────────────────────────
const SAPPHIRE_ENEMY_SIZE      =   6;
const SAPPHIRE_ENEMY_COLOR     = '#5b9aff';
const SAPPHIRE_ENEMY_GLOW      = '#88bbff';
const SAPPHIRE_HP_INIT         = 250;
const SAPPHIRE_ATK_INIT        =  15;
const SAPPHIRE_DEF_INIT        =   8;
const SAPPHIRE_SHIELD_RADIUS   =  18;  // circle shield radius (px)
const SAPPHIRE_SHIELD_HP_INIT  = 120;
const SAPPHIRE_PATROL_SPEED    =   0.45;
const SAPPHIRE_PATROL_TURN_MS  = 3200;
const SAPPHIRE_MISSILE_CD_MS   = 4000;  // ms between missiles
const SAPPHIRE_MISSILE_JITTER  =  800;  // ±random offset to missile CD

// ── Sapphire missile constants ─────────────────────────────────
const MISSILE_SIZE              =   3;
const MISSILE_SPEED             =   1.2;   // initial speed (px/frame at 60fps)
const MISSILE_SEEK_STR          =   0.025; // fraction of remaining error corrected per frame
const MISSILE_MAX_SPEED         =   1.8;
const MISSILE_HP_INIT           =  30;
const MISSILE_ATK_INIT          =  18;
const MISSILE_TRAIL_CAP         =  40;
const MISSILE_COLOR             = '#ff7733';
const MISSILE_GLOW              = '#ffaa55';
/** Fraction of MISSILE_TRAIL_CAP used for the dash segment in the trail lineDash effect. */
const MISSILE_TRAIL_DASH_RATIO  =   0.6;
/** Minimum shield damage — shields always take at least this much damage per hit. */
const MINIMUM_SHIELD_DAMAGE     =   1;
/** Small epsilon used to guard against division-by-zero in speed normalisation. */
const SPEED_EPSILON             =   0.001;

// ── Sand gatling projectile constants ──────────────────────────
const SAND_PROJ_SPEED      =   5.0;
const SAND_PROJ_SIZE       =   2;
const SAND_PROJ_LIFE_MS    = 800;
const SAND_PROJ_COLOR      = '#ddc080';
const SAND_PROJ_GLOW       = '#ffe8a0';

// ── Quartz chain whip constants ────────────────────────────────
const CHAIN_NODES           =   5;
/** Radius of node 0 (closest to player, smallest). */
const CHAIN_MIN_RADIUS      =   2;
/** Radius of node CHAIN_NODES-1 (tip, farthest from player, largest). */
const CHAIN_MAX_RADIUS      =   6;
const CHAIN_NODE_COLOR      = '#a0d8ef';
const CHAIN_NODE_GLOW       = '#c8eeff';
const CHAIN_LINE_COLOR      = '#88c8e8';
const CHAIN_LASH_MS         = 280;   // ms for tip to lash toward target
const CHAIN_RETRACT_MS      = 320;   // ms in retracting phase before returning to idle
/** Damage ticks per I-frame interval (ms). */
const CHAIN_HIT_CD_MS       =  62.5;
// ── Softbody whip physics constants ──
/** Rest spacing (px) between adjacent nodes. */
const CHAIN_REST_LENGTH     =  10;
/** Spring stiffness between adjacent nodes. */
const CHAIN_SPRING_K        =   0.40;
/** Anchor spring pulling node 0 toward the player (idle). */
const CHAIN_ANCHOR_K        =   0.60;
/** Anchor spring during retract phase (stronger pull). */
const CHAIN_RETRACT_ANCHOR_K = 2.0;
/** Per-dt velocity damping factor (applied as pow(DAMPING, dt)). */
const CHAIN_DAMPING         =   0.85;
/** Initial speed given to the tip node when a lash is triggered (px/dt). */
const CHAIN_LASH_SPEED      =  20;
/** Inertia of node 0 (closest to player, most responsive). */
const CHAIN_MIN_INERTIA     =   0.8;
/** Inertia of tip node (farthest, least responsive / most momentum). */
const CHAIN_MAX_INERTIA     =   4.0;

// ── Ruby laser beam constants ──────────────────────────────────
const LASER_BEAM_VISIBLE_MS  = 400;   // how long the beam stays on screen
const LASER_BEAM_COLOR       = '#ff2222';
const LASER_BEAM_GLOW        = '#ff8888';
const LASER_BEAM_WIDTH       =   2.5;

// ── Emerald enemy constants ────────────────────────────────────
const EMERALD_ENEMY_SIZE     =   5;
const EMERALD_ENEMY_COLOR    = '#22dd66';
const EMERALD_ENEMY_GLOW     = '#55ff99';
const EMERALD_HP_INIT        =  90;
const EMERALD_ATK_INIT       =  14;
const EMERALD_DEF_INIT       =   4;
const EMERALD_PATROL_SPEED   =   0.55;
const EMERALD_PATROL_TURN_MS = 2200;
const EMERALD_ATTACK_RADIUS  = 110;    // px — detect range that triggers blink
const EMERALD_CHARGE_MS      = 380;    // ms charging before blink
const EMERALD_BLINK_OFFSET   =   8;   // px offset from player center after blink
const EMERALD_COOLDOWN_MS    = 2500;  // ms cooldown after a blink attack
const EMERALD_GHOST_FADE_MS  = 420;   // ms for ghost afterimage to fade out
const EMERALD_PATROL_DAMPING = 0.97;

// ── Amber enemy constants ──────────────────────────────────────
const AMBER_ENEMY_SIZE       =   7;
const AMBER_ENEMY_COLOR      = '#ffaa22';
const AMBER_ENEMY_GLOW       = '#ffcc66';
const AMBER_HP_INIT          = 380;
const AMBER_ATK_INIT         =  20;
const AMBER_DEF_INIT         =   8;
const AMBER_PATROL_SPEED     =   0.35;
const AMBER_PATROL_TURN_MS   = 3500;
const AMBER_PATROL_DAMPING   =   0.97;
const AMBER_MISSILE_CD_MS    = 3800;  // ms between fan bursts
const AMBER_MISSILE_JITTER   =  700;  // ±random offset to burst CD
const AMBER_SHARD_SPREAD_RAD =   0.38; // ±spread angle (radians) for fan
const AMBER_SHARD_COUNT      =   3;

// ── Amber shard (projectile) constants ────────────────────────
const AMBER_SHARD_SPEED      =   1.4;
const AMBER_SHARD_MAX_SPEED  =   2.0;
const AMBER_SHARD_SEEK_STR   =   0.018;
const AMBER_SHARD_SIZE       =   3;
const AMBER_SHARD_HP_INIT    =  25;
const AMBER_SHARD_ATK_INIT   =  22;
const AMBER_SHARD_TRAIL_CAP  =  35;
const AMBER_SHARD_COLOR      = '#ff8833';
const AMBER_SHARD_GLOW       = '#ffaa55';

// ── Void enemy constants ───────────────────────────────────────
const VOID_ENEMY_SIZE        =   8;
const VOID_ENEMY_COLOR       = '#9933ff';
const VOID_ENEMY_GLOW        = '#bb66ff';
const VOID_HP_INIT           = 750;
const VOID_ATK_INIT          =  28;
const VOID_DEF_INIT          =  14;
const VOID_PURSUE_SPEED      =   0.60; // constant homing speed (px/frame)
const VOID_CONTACT_RADIUS    =   9;   // px — contact damage distance
const VOID_CONTACT_CD_MS     = 1200;  // ms between contact damage ticks
const VOID_AURA_PULSE_MS     = 1400;  // ms for one full aura pulse cycle
const VOID_AURA_RADIUS       =  14;   // px — aura ring radius

// ── Quartz enemy constants ─────────────────────────────────────
const QUARTZ_ENEMY_SIZE        =   5;
const QUARTZ_ENEMY_COLOR       = '#f5f0eb';
const QUARTZ_ENEMY_GLOW        = '#faf8f5';
const QUARTZ_HP_INIT           =  35;
const QUARTZ_ATK_INIT          =   8;
const QUARTZ_DEF_INIT          =   3;
const QUARTZ_PREFERRED_DIST    =  90;
const QUARTZ_APPROACH_SPEED    =   0.6;
const QUARTZ_STRAFE_SPEED      =   0.5;
const QUARTZ_SPIKE_CD_MS       = 2200;
const QUARTZ_SPIKE_JITTER      =  400;
// ── Quartz spike (projectile) constants ────────────────────────
const QUARTZ_SPIKE_SPEED       =   1.0;
const QUARTZ_SPIKE_SIZE        =   3;
const QUARTZ_SPIKE_HP_INIT     =  20;
const QUARTZ_SPIKE_ATK_INIT    =  12;
const QUARTZ_SPIKE_LIFE_MS     = 3000;
const QUARTZ_SPIKE_COLOR       = '#f0e8d8';
const QUARTZ_SPIKE_GLOW        = '#faf8f5';

// ── Ruby enemy constants ───────────────────────────────────────
const RUBY_ENEMY_SIZE          =   5;
const RUBY_ENEMY_COLOR         = '#dc3232';
const RUBY_ENEMY_GLOW          = '#ff6b6b';
const RUBY_HP_INIT             = 120;
const RUBY_ATK_INIT            =  18;
const RUBY_DEF_INIT            =   5;
const RUBY_PATROL_SPEED        =   0.8;
const RUBY_BOLT_CD_MS          = 1200;
const RUBY_BOLT_JITTER         =  300;
const RUBY_PREFERRED_DIST      =  60;
// ── Ruby bolt (projectile) constants ──────────────────────────
const RUBY_BOLT_SPEED          =   2.8;
const RUBY_BOLT_SIZE           =   2;
const RUBY_BOLT_HP_INIT        =  15;
const RUBY_BOLT_ATK_INIT       =  15;
const RUBY_BOLT_LIFE_MS        = 1500;
const RUBY_BOLT_COLOR          = '#ff4444';
const RUBY_BOLT_GLOW           = '#ff8888';

// ── Sunstone enemy constants ───────────────────────────────────
const SUNSTONE_ENEMY_SIZE      =   7;
const SUNSTONE_ENEMY_COLOR     = '#ff8c3c';
const SUNSTONE_ENEMY_GLOW      = '#ffb366';
const SUNSTONE_HP_INIT         = 200;
const SUNSTONE_ATK_INIT        =  16;
const SUNSTONE_DEF_INIT        =   6;
const SUNSTONE_PREFERRED_DIST  = 120;
const SUNSTONE_ORBIT_SPEED     =   0.4;
const SUNSTONE_PULSE_CD_MS     = 3500;
const SUNSTONE_PULSE_JITTER    =  600;

// ── Citrine enemy constants ────────────────────────────────────
const CITRINE_ENEMY_SIZE       =   5;
const CITRINE_ENEMY_COLOR      = '#e6c850';
const CITRINE_ENEMY_GLOW       = '#f0d870';
const CITRINE_HP_INIT          = 150;
const CITRINE_ATK_INIT         =  22;
const CITRINE_DEF_INIT         =   4;
const CITRINE_PATROL_SPEED     =   0.9;
const CITRINE_PATROL_TURN_MS   = 1800;
const CITRINE_BOLT_CD_MS       = 2800;
const CITRINE_BOLT_JITTER      =  400;
// ── Citrine bolt (homing) constants ───────────────────────────
const CITRINE_BOLT_SPEED       =   1.5;
const CITRINE_BOLT_MAX_SPEED   =   2.4;
const CITRINE_BOLT_SEEK        =   0.035;
const CITRINE_BOLT_SIZE        =   3;
const CITRINE_BOLT_HP_INIT     =  20;
const CITRINE_BOLT_ATK_INIT    =  20;
const CITRINE_BOLT_TRAIL_CAP   =  30;
const CITRINE_BOLT_COLOR       = '#e6c850';
const CITRINE_BOLT_GLOW        = '#ffe080';

// ── Iolite enemy constants ─────────────────────────────────────
const IOLITE_ENEMY_SIZE        =   8;
const IOLITE_ENEMY_COLOR       = '#6464b4';
const IOLITE_ENEMY_GLOW        = '#8888cc';
const IOLITE_HP_INIT           = 500;
const IOLITE_ATK_INIT          =  24;
const IOLITE_DEF_INIT          =  12;
const IOLITE_PATROL_SPEED      =   0.3;
const IOLITE_PATROL_TURN_MS    = 4000;
const IOLITE_BEAM_CD_MS        = 4000;
const IOLITE_BEAM_JITTER       =  800;
const IOLITE_BEAM_RANGE        = 120;
const IOLITE_BEAM_COUNT        =   5;
const IOLITE_BEAM_SPREAD_RAD   =   1.047; // ~60 degrees each side

// ── Amethyst enemy constants ───────────────────────────────────
const AMETHYST_ENEMY_SIZE      =   7;
const AMETHYST_ENEMY_COLOR     = '#b464c8';
const AMETHYST_ENEMY_GLOW      = '#d088e0';
const AMETHYST_HP_INIT         = 800;
const AMETHYST_ATK_INIT        =  28;
const AMETHYST_DEF_INIT        =  15;
const AMETHYST_SHIELD_HP_INIT  = 400;
const AMETHYST_PATROL_SPEED    =   0.4;
const AMETHYST_PATROL_TURN_MS  = 3500;
const AMETHYST_BURST_CD_MS     = 3200;
const AMETHYST_BURST_JITTER    =  500;
const AMETHYST_BURST_COUNT     =   8;
// ── Amethyst shard constants ───────────────────────────────────
const AMETHYST_SHARD_SPEED     =   1.8;
const AMETHYST_SHARD_SIZE      =   3;
const AMETHYST_SHARD_HP_INIT   =  25;
const AMETHYST_SHARD_ATK_INIT  =  24;
const AMETHYST_SHARD_LIFE_MS   = 1800;
const AMETHYST_SHARD_COLOR     = '#c87ae0';
const AMETHYST_SHARD_GLOW      = '#d88af0';

// ── Diamond enemy constants ────────────────────────────────────
const DIAMOND_ENEMY_SIZE       =   9;
const DIAMOND_ENEMY_COLOR      = '#e8f0fa';
const DIAMOND_ENEMY_GLOW       = '#ffffff';
const DIAMOND_HP_INIT          = 1500;
const DIAMOND_ATK_INIT         =  35;
const DIAMOND_DEF_INIT         =  20;
const DIAMOND_PHASE_INVULN_MS  = 2000;
const DIAMOND_PHASE_VULN_MS    = 4000;
const DIAMOND_PATROL_SPEED     =   0.5;
const DIAMOND_ORBIT_SPEED      =   0.3;
const DIAMOND_SHARD_CD_MS      = 2500;
const DIAMOND_SHARD_COUNT      =   6;
const DIAMOND_SHARD_COLOR      = '#c0e0ff';
const DIAMOND_SHARD_GLOW       = '#ffffff';
// ── Diamond shard constants ────────────────────────────────────
const DIAMOND_SHARD_SPEED      =   2.2;
const DIAMOND_SHARD_SIZE       =   3;
const DIAMOND_SHARD_HP_INIT    =  30;
const DIAMOND_SHARD_ATK_INIT   =  30;
const DIAMOND_SHARD_LIFE_MS    = 1400;

// ── Nullstone enemy constants ──────────────────────────────────
const NULLSTONE_ENEMY_SIZE         =  10;
const NULLSTONE_ENEMY_COLOR        = '#1e1e28';
const NULLSTONE_ENEMY_GLOW         = '#9664c8';
const NULLSTONE_HP_INIT            = 2500;
const NULLSTONE_ATK_INIT           =   42;
const NULLSTONE_DEF_INIT           =   25;
const NULLSTONE_GRAVITY_STRENGTH   =   0.0015;
const NULLSTONE_GRAVITY_RADIUS     =  200;
const NULLSTONE_ABSORB_MS          = 2500;
const NULLSTONE_ABSORB_CD_MS       = 5000;
const NULLSTONE_PATROL_SPEED       =   0.25;
const NULLSTONE_PATROL_TURN_MS     = 5000;
const NULLSTONE_TENDRIL_CD_MS      = 3000;
const NULLSTONE_TENDRIL_COUNT      =   3;
// ── Void tendril (nullstone projectile) constants ──────────────
const VOID_TENDRIL_SPEED       =   1.8;
const VOID_TENDRIL_SIZE        =   4;
const VOID_TENDRIL_HP_INIT     =  40;
const VOID_TENDRIL_ATK_INIT    =  35;
const VOID_TENDRIL_LIFE_MS     = 2000;
const VOID_TENDRIL_COLOR       = '#4d2280';
const VOID_TENDRIL_GLOW        = '#9664c8';

// ── Fluid background force scales ─────────────────────────────
// Multiplier applied to entity velocity (px/frame → px/s) before injection.
// Lower values = gentler disturbance; higher = more reactive.
/** Converts entity velocity from px/frame units to px/s for fluid injection. */
const FLUID_VEL_FRAME_TO_PX_S = 1000 / TARGET_FRAME_MS;  // = ~60 at 60 fps
const FLUID_PLAYER_STRENGTH    = 0.18;
const FLUID_ENEMY_STRENGTH     = 0.22;
const FLUID_PROJECTILE_STRENGTH = 0.25;
const FLUID_MISSILE_STRENGTH   = 0.35;
const FLUID_LASER_BEAM_STRENGTH = 0.55;
const FLUID_EXPLOSION_STRENGTH = 0.90;
// Laser enemy colours decoded as r,g,b for fluid injection.
const FLUID_LASER_R = 255, FLUID_LASER_G =  51, FLUID_LASER_B =  51;
// Sapphire enemy colour.
const FLUID_SAPPH_R =  91, FLUID_SAPPH_G = 154, FLUID_SAPPH_B = 255;
// Player colour.
const FLUID_PLAYER_R = 255, FLUID_PLAYER_G = 215, FLUID_PLAYER_B = 100;
// Missile colour.
const FLUID_MISSILE_R = 255, FLUID_MISSILE_G = 119, FLUID_MISSILE_B =  51;
// Sand projectile colour.
const FLUID_SAND_R = 221, FLUID_SAND_G = 192, FLUID_SAND_B = 128;
// Chain whip colour.
const FLUID_CHAIN_R = 160, FLUID_CHAIN_G = 216, FLUID_CHAIN_B = 239;
// Laser beam colour.
const FLUID_BEAM_R = 255, FLUID_BEAM_G =  34, FLUID_BEAM_B =  34;
// Emerald enemy colour.
const FLUID_EMERALD_R =  34, FLUID_EMERALD_G = 221, FLUID_EMERALD_B = 102;
// Amber enemy colour.
const FLUID_AMBER_R = 255, FLUID_AMBER_G = 170, FLUID_AMBER_B =  34;
// Void enemy colour.
const FLUID_VOID_R = 153, FLUID_VOID_G =  51, FLUID_VOID_B = 255;
// Quartz enemy colour.
const FLUID_QUARTZ_R = 245, FLUID_QUARTZ_G = 240, FLUID_QUARTZ_B = 235;
// Ruby enemy colour.
const FLUID_RUBY_R = 220, FLUID_RUBY_G =  50, FLUID_RUBY_B =  50;
// Sunstone enemy colour.
const FLUID_SUNSTONE_R = 255, FLUID_SUNSTONE_G = 140, FLUID_SUNSTONE_B =  60;
// Citrine enemy colour.
const FLUID_CITRINE_R = 230, FLUID_CITRINE_G = 200, FLUID_CITRINE_B =  80;
// Iolite enemy colour.
const FLUID_IOLITE_R = 100, FLUID_IOLITE_G = 100, FLUID_IOLITE_B = 180;
// Amethyst enemy colour.
const FLUID_AMETHYST_R = 180, FLUID_AMETHYST_G = 100, FLUID_AMETHYST_B = 200;
// Diamond enemy colour.
const FLUID_DIAMOND_R = 232, FLUID_DIAMOND_G = 240, FLUID_DIAMOND_B = 250;
// Nullstone enemy colour.
const FLUID_NULLSTONE_R =  30, FLUID_NULLSTONE_G =  30, FLUID_NULLSTONE_B =  40;

interface RpgMote {
  x: number; y: number;
  vx: number; vy: number;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

interface RpgJoystick {
  isActive: boolean; pointerId: number;
  baseX: number; baseY: number;
  thumbX: number; thumbY: number;
}

interface RpgKeyState {
  left: boolean; right: boolean;
  up: boolean; down: boolean;
}

interface RpgPlayerStats {
  hp: number; maxHp: number;
  atk: number; def: number;
}

type LaserPhase = 'idle' | 'decelerate' | 'dash' | 'overshoot' | 'cooldown';

interface AttackTrailState {
  active: boolean;
  startX: number; startY: number;
  endX:   number; endY:   number;
  controlAngle: number;
  trailStartMs: number;
  trailEndMs:   number;
}

interface LaserEnemy {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  phase: LaserPhase;
  phaseElapsedMs: number;
  dashDirX: number; dashDirY: number;
  dashTraveled: number;
  lockedTargetX: number; lockedTargetY: number;
  attackTrail: AttackTrailState;
  patrolTimerMs: number;
  hasHitPlayer: boolean;
}

type RpgPhase = 'alive' | 'dying' | 'restarting';

interface DeathParticle {
  x: number; y: number;
  vx: number; vy: number;
  alpha: number;
  size: number;
  color: string;
}

interface SpawnEntry {
  enemyTypeId: string;
  timerMs: number;
}

/** Visual flash drawn at the point an enemy is hit by the player. */
interface HitEffect {
  x: number; y: number;
  timerMs: number;
  color: string;
}

/** Visual line drawn from the player toward a struck enemy. */
interface ShotLine {
  x1: number; y1: number;
  x2: number; y2: number;
  timerMs: number;
  color: string;
}

/** Floating text showing damage dealt or "BLOCKED". */
interface DamageNumber {
  x: number; y: number;
  vx: number; vy: number;
  text: string;
  fontPx: number;
  color: string;
  timerMs: number;
}

/** Visual-only orbit particle for the equipped weapon. */
interface WeaponOrbitParticle {
  /** Current angle in radians (advances each frame). */
  angle: number;
  /** Current computed position (updated from angle + player position). */
  x: number; y: number;
  /** Comet trail positions. */
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
  /** Tier color for this particle. */
  color: string;
  /** Glow color. */
  glowColor: string;
  /** Size in pixels (= weapon tier). */
  size: number;
}

/** Orbit projectile that damages enemies. */
interface OrbitProjectile {
  /** Current angle in radians. */
  angle: number;
  /** Computed position. */
  x: number; y: number;
  /** Comet trail. */
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
  /** Per-target cooldown tracking (uses object identity as key). */
  hitCooldowns: Map<object, number>;
}

// ── Sapphire enemy and missile interfaces ─────────────────────

interface SapphireEnemy {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  shieldHp: number; maxShieldHp: number;
  missileTimerMs: number;
  patrolTimerMs: number;
}

interface SapphireMissile {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
  hasHitPlayer: boolean;
}

// ── Sand gatling projectile ────────────────────────────────────

interface SandProjectile {
  x: number; y: number;
  vx: number; vy: number;
  lifeMs: number;
  /** Damage to deal on hit (pre-scaled: weapon tier × player ATK already applied at spawn). */
  scaledDamage: number;
}

// ── Quartz chain whip ──────────────────────────────────────────

type ChainPhase = 'idle' | 'lashing' | 'retracting';

interface ChainWhipState {
  phase: ChainPhase;
  phaseMs: number;
  cooldownMs: number;
  /** Tip lash target in world space. */
  targetX: number; targetY: number;
  /**
   * Node positions.
   * Index 0 = closest to player (smallest, least inertia).
   * Index CHAIN_NODES-1 = tip / attacker (largest, most inertia).
   */
  nodesX: Float64Array; nodesY: Float64Array;
  /** Node velocities for softbody physics. */
  nodesVx: Float64Array; nodesVy: Float64Array;
  /** Per-target hit cooldown for persistent damage. */
  hitCooldowns: Map<object, number>;
}

// ── Ruby laser beam visual ─────────────────────────────────────

interface LaserBeamEffect {
  active: boolean;
  startX: number; startY: number;
  endX: number; endY: number;
  dirX: number; dirY: number;
  timerMs: number;
}

// ── Emerald enemy (blink-striker) ─────────────────────────────

type EmeraldPhase = 'patrol' | 'charging' | 'blinking' | 'cooldown';

interface EmeraldEnemy {
  readonly kind: 'emerald';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  phase: EmeraldPhase;
  phaseMs: number;
  patrolTimerMs: number;
  /** Origin of the last blink — fades as a ghost afterimage. */
  ghostX: number; ghostY: number; ghostAlpha: number;
  hasHitPlayer: boolean;
}

// ── Amber enemy (fan-gunner) ───────────────────────────────────

interface AmberEnemy {
  readonly kind: 'amber';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  missileTimerMs: number;
  patrolTimerMs: number;
}

/** Amber shard — homing projectile fired in a fan spread by amber enemies. */
interface AmberShard {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
  hasHitPlayer: boolean;
}

// ── Void enemy (slow bruiser) ──────────────────────────────────

interface VoidEnemy {
  readonly kind: 'void';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  contactCdMs: number;   // ms until next contact damage tick
  pulseMs: number;       // accumulator for aura pulse animation
}

// ── Quartz enemy (crystal orbiter) ────────────────────────────

interface QuartzEnemy {
  readonly kind: 'quartz';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  spikeTimerMs: number;
  strafeDirFlipMs: number;
  strafeDir: 1 | -1;
}

interface QuartzSpike {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Ruby enemy (fast patroller) ────────────────────────────────

interface RubyEnemy {
  readonly kind: 'ruby';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  boltTimerMs: number;
  patrolTimerMs: number;
  consecutiveShots: number;
}

interface RubyBolt {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Sunstone enemy (orbiter) ───────────────────────────────────

interface SunstoneEnemy {
  readonly kind: 'sunstone';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  pulseTimerMs: number;
  orbitAngle: number;
}

// ── Citrine enemy (fast patrol + homing bolts) ─────────────────

interface CitrineEnemy {
  readonly kind: 'citrine';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  boltTimerMs: number;
  patrolTimerMs: number;
}

interface CitrineBolt {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

// ── Iolite enemy (tanky beam-blaster) ─────────────────────────

interface IoliteEnemy {
  readonly kind: 'iolite';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  beamTimerMs: number;
  patrolTimerMs: number;
}

// ── Amethyst enemy (crystal-shielder ring-burst) ──────────────

interface AmethystEnemy {
  readonly kind: 'amethyst';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  shieldHp: number; maxShieldHp: number;
  burstTimerMs: number;
  patrolTimerMs: number;
}

interface AmethystShard {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Diamond enemy (phase-shifter) ─────────────────────────────

interface DiamondEnemy {
  readonly kind: 'diamond';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  phaseInvuln: boolean;
  phaseTimerMs: number;
  shardTimerMs: number;
  orbitAngle: number;
}

interface DiamondShard {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Nullstone enemy (gravity well) ────────────────────────────

interface NullstoneEnemy {
  readonly kind: 'nullstone';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  isAbsorbing: boolean;
  absorbTimerMs: number;
  absorbCdMs: number;
  tendrilTimerMs: number;
  patrolTimerMs: number;
  pulseMs: number;
}

interface VoidTendril {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

export interface RpgRender {
  canvas: HTMLCanvasElement;
  statsPanel: HTMLElement;
  update(deltaMs: number, autoMoveEnabled?: boolean): void;
  resize(container: HTMLElement): void;
  setActive(active: boolean): void;
  /** Re-reads rpgSimState.equippedWeaponIds and immediately updates playerStats ATK/DEF + weapon particles. */
  notifyEquip(): void;
}

function makeAttackTrail(): AttackTrailState {
  return { active: false, startX: 0, startY: 0, endX: 0, endY: 0,
           controlAngle: 0, trailStartMs: 0, trailEndMs: Infinity };
}

function makeLaserEnemy(x: number, y: number, waveNumber: number): LaserEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(LASER_HP_INIT * scale), maxHp: Math.ceil(LASER_HP_INIT * scale),
    atk: Math.ceil(LASER_ATK_INIT * scale), def: Math.ceil(LASER_DEF_INIT * scale),
    phase: 'idle', phaseElapsedMs: 0,
    dashDirX: 0, dashDirY: 0, dashTraveled: 0,
    lockedTargetX: 0, lockedTargetY: 0,
    attackTrail: makeAttackTrail(),
    patrolTimerMs: Math.random() * LASER_PATROL_TURN_MS,
    hasHitPlayer: false,
  };
}

function makeSapphireEnemy(x: number, y: number, waveNumber: number): SapphireEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(SAPPHIRE_HP_INIT * scale), maxHp: Math.ceil(SAPPHIRE_HP_INIT * scale),
    atk: Math.ceil(SAPPHIRE_ATK_INIT * scale), def: Math.ceil(SAPPHIRE_DEF_INIT * scale),
    shieldHp: Math.ceil(SAPPHIRE_SHIELD_HP_INIT * scale), maxShieldHp: Math.ceil(SAPPHIRE_SHIELD_HP_INIT * scale),
    missileTimerMs: SAPPHIRE_MISSILE_CD_MS + Math.random() * SAPPHIRE_MISSILE_JITTER,
    patrolTimerMs: Math.random() * SAPPHIRE_PATROL_TURN_MS,
  };
}

function makeSapphireMissile(x: number, y: number, vx: number, vy: number): SapphireMissile {
  return {
    x, y, vx, vy,
    hp: MISSILE_HP_INIT, maxHp: MISSILE_HP_INIT,
    atk: MISSILE_ATK_INIT,
    trailX: new Float64Array(MISSILE_TRAIL_CAP),
    trailY: new Float64Array(MISSILE_TRAIL_CAP),
    trailHead: 0, trailCount: 0,
    hasHitPlayer: false,
  };
}

function makeEmeraldEnemy(x: number, y: number, waveNumber: number): EmeraldEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'emerald',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(EMERALD_HP_INIT * scale), maxHp: Math.ceil(EMERALD_HP_INIT * scale),
    atk: Math.ceil(EMERALD_ATK_INIT * scale), def: Math.ceil(EMERALD_DEF_INIT * scale),
    phase: 'patrol', phaseMs: 0,
    patrolTimerMs: Math.random() * EMERALD_PATROL_TURN_MS,
    ghostX: x, ghostY: y, ghostAlpha: 0,
    hasHitPlayer: false,
  };
}

function makeAmberEnemy(x: number, y: number, waveNumber: number): AmberEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'amber',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(AMBER_HP_INIT * scale), maxHp: Math.ceil(AMBER_HP_INIT * scale),
    atk: Math.ceil(AMBER_ATK_INIT * scale), def: Math.ceil(AMBER_DEF_INIT * scale),
    missileTimerMs: AMBER_MISSILE_CD_MS + Math.random() * AMBER_MISSILE_JITTER,
    patrolTimerMs: Math.random() * AMBER_PATROL_TURN_MS,
  };
}

function makeAmberShard(x: number, y: number, vx: number, vy: number): AmberShard {
  return {
    x, y, vx, vy,
    hp: AMBER_SHARD_HP_INIT, maxHp: AMBER_SHARD_HP_INIT,
    atk: AMBER_SHARD_ATK_INIT,
    trailX: new Float64Array(AMBER_SHARD_TRAIL_CAP),
    trailY: new Float64Array(AMBER_SHARD_TRAIL_CAP),
    trailHead: 0, trailCount: 0,
    hasHitPlayer: false,
  };
}

function makeVoidEnemy(x: number, y: number, waveNumber: number): VoidEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'void',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(VOID_HP_INIT * scale), maxHp: Math.ceil(VOID_HP_INIT * scale),
    atk: Math.ceil(VOID_ATK_INIT * scale), def: Math.ceil(VOID_DEF_INIT * scale),
    contactCdMs: 0,
    pulseMs: Math.random() * VOID_AURA_PULSE_MS,
  };
}

function makeQuartzEnemy(x: number, y: number, waveNumber: number): QuartzEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'quartz',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(QUARTZ_HP_INIT * scale), maxHp: Math.ceil(QUARTZ_HP_INIT * scale),
    atk: Math.ceil(QUARTZ_ATK_INIT * scale), def: Math.ceil(QUARTZ_DEF_INIT * scale),
    spikeTimerMs: QUARTZ_SPIKE_CD_MS + Math.random() * QUARTZ_SPIKE_JITTER,
    strafeDirFlipMs: 2000 + Math.random() * 2000,
    strafeDir: (Math.random() < 0.5 ? 1 : -1) as 1 | -1,
  };
}

function makeQuartzSpike(x: number, y: number, vx: number, vy: number): QuartzSpike {
  return {
    x, y, vx, vy,
    hp: QUARTZ_SPIKE_HP_INIT, maxHp: QUARTZ_SPIKE_HP_INIT,
    atk: QUARTZ_SPIKE_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: QUARTZ_SPIKE_LIFE_MS,
  };
}

function makeRubyEnemy(x: number, y: number, waveNumber: number): RubyEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'ruby',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(RUBY_HP_INIT * scale), maxHp: Math.ceil(RUBY_HP_INIT * scale),
    atk: Math.ceil(RUBY_ATK_INIT * scale), def: Math.ceil(RUBY_DEF_INIT * scale),
    boltTimerMs: RUBY_BOLT_CD_MS + Math.random() * RUBY_BOLT_JITTER,
    patrolTimerMs: Math.random() * 2000,
    consecutiveShots: 0,
  };
}

function makeRubyBolt(x: number, y: number, vx: number, vy: number): RubyBolt {
  return {
    x, y, vx, vy,
    hp: RUBY_BOLT_HP_INIT, maxHp: RUBY_BOLT_HP_INIT,
    atk: RUBY_BOLT_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: RUBY_BOLT_LIFE_MS,
  };
}

function makeSunstoneEnemy(x: number, y: number, waveNumber: number): SunstoneEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'sunstone',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(SUNSTONE_HP_INIT * scale), maxHp: Math.ceil(SUNSTONE_HP_INIT * scale),
    atk: Math.ceil(SUNSTONE_ATK_INIT * scale), def: Math.ceil(SUNSTONE_DEF_INIT * scale),
    pulseTimerMs: SUNSTONE_PULSE_CD_MS + Math.random() * SUNSTONE_PULSE_JITTER,
    orbitAngle: Math.random() * Math.PI * 2,
  };
}

function makeCitrineEnemy(x: number, y: number, waveNumber: number): CitrineEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'citrine',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(CITRINE_HP_INIT * scale), maxHp: Math.ceil(CITRINE_HP_INIT * scale),
    atk: Math.ceil(CITRINE_ATK_INIT * scale), def: Math.ceil(CITRINE_DEF_INIT * scale),
    boltTimerMs: CITRINE_BOLT_CD_MS + Math.random() * CITRINE_BOLT_JITTER,
    patrolTimerMs: Math.random() * CITRINE_PATROL_TURN_MS,
  };
}

function makeCitrineBolt(x: number, y: number, vx: number, vy: number): CitrineBolt {
  return {
    x, y, vx, vy,
    hp: CITRINE_BOLT_HP_INIT, maxHp: CITRINE_BOLT_HP_INIT,
    atk: CITRINE_BOLT_ATK_INIT,
    hasHitPlayer: false,
    trailX: new Float64Array(CITRINE_BOLT_TRAIL_CAP),
    trailY: new Float64Array(CITRINE_BOLT_TRAIL_CAP),
    trailHead: 0, trailCount: 0,
  };
}

function makeIoliteEnemy(x: number, y: number, waveNumber: number): IoliteEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'iolite',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(IOLITE_HP_INIT * scale), maxHp: Math.ceil(IOLITE_HP_INIT * scale),
    atk: Math.ceil(IOLITE_ATK_INIT * scale), def: Math.ceil(IOLITE_DEF_INIT * scale),
    beamTimerMs: IOLITE_BEAM_CD_MS + Math.random() * IOLITE_BEAM_JITTER,
    patrolTimerMs: Math.random() * IOLITE_PATROL_TURN_MS,
  };
}

function makeAmethystEnemy(x: number, y: number, waveNumber: number): AmethystEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'amethyst',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(AMETHYST_HP_INIT * scale), maxHp: Math.ceil(AMETHYST_HP_INIT * scale),
    atk: Math.ceil(AMETHYST_ATK_INIT * scale), def: Math.ceil(AMETHYST_DEF_INIT * scale),
    shieldHp: Math.ceil(AMETHYST_SHIELD_HP_INIT * scale),
    maxShieldHp: Math.ceil(AMETHYST_SHIELD_HP_INIT * scale),
    burstTimerMs: AMETHYST_BURST_CD_MS + Math.random() * AMETHYST_BURST_JITTER,
    patrolTimerMs: Math.random() * AMETHYST_PATROL_TURN_MS,
  };
}

function makeAmethystShard(x: number, y: number, vx: number, vy: number): AmethystShard {
  return {
    x, y, vx, vy,
    hp: AMETHYST_SHARD_HP_INIT, maxHp: AMETHYST_SHARD_HP_INIT,
    atk: AMETHYST_SHARD_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: AMETHYST_SHARD_LIFE_MS,
  };
}

function makeDiamondEnemy(x: number, y: number, waveNumber: number): DiamondEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'diamond',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(DIAMOND_HP_INIT * scale), maxHp: Math.ceil(DIAMOND_HP_INIT * scale),
    atk: Math.ceil(DIAMOND_ATK_INIT * scale), def: Math.ceil(DIAMOND_DEF_INIT * scale),
    phaseInvuln: false,
    phaseTimerMs: DIAMOND_PHASE_VULN_MS,
    shardTimerMs: DIAMOND_SHARD_CD_MS + Math.random() * 500,
    orbitAngle: Math.random() * Math.PI * 2,
  };
}

function makeDiamondShard(x: number, y: number, vx: number, vy: number): DiamondShard {
  return {
    x, y, vx, vy,
    hp: DIAMOND_SHARD_HP_INIT, maxHp: DIAMOND_SHARD_HP_INIT,
    atk: DIAMOND_SHARD_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: DIAMOND_SHARD_LIFE_MS,
  };
}

function makeNullstoneEnemy(x: number, y: number, waveNumber: number): NullstoneEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'nullstone',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(NULLSTONE_HP_INIT * scale), maxHp: Math.ceil(NULLSTONE_HP_INIT * scale),
    atk: Math.ceil(NULLSTONE_ATK_INIT * scale), def: Math.ceil(NULLSTONE_DEF_INIT * scale),
    isAbsorbing: false,
    absorbTimerMs: NULLSTONE_ABSORB_MS,
    absorbCdMs: NULLSTONE_ABSORB_CD_MS,
    tendrilTimerMs: NULLSTONE_TENDRIL_CD_MS + Math.random() * 1000,
    patrolTimerMs: Math.random() * NULLSTONE_PATROL_TURN_MS,
    pulseMs: Math.random() * 2000,
  };
}

function makeVoidTendril(x: number, y: number, vx: number, vy: number): VoidTendril {
  return {
    x, y, vx, vy,
    hp: VOID_TENDRIL_HP_INIT, maxHp: VOID_TENDRIL_HP_INIT,
    atk: VOID_TENDRIL_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: VOID_TENDRIL_LIFE_MS,
  };
}

export function createRpgRender(container: HTMLElement, rpgSimState: RpgSimState): RpgRender {

  const canvas = document.createElement('canvas');
  canvas.id = 'rpg-canvas';
  canvas.style.imageRendering = 'pixelated';
  canvas.style.touchAction = 'none';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;
  let widthPx  = INTERNAL_WIDTH;
  let heightPx = INTERNAL_HEIGHT;

  // ── Euler fluid background ─────────────────────────────────────
  const fluid = createRpgFluid();

  function doResize(cont: HTMLElement): void {
    const w = cont.clientWidth  || INTERNAL_WIDTH;
    const h = cont.clientHeight || INTERNAL_HEIGHT;
    if (w !== widthPx || h !== heightPx) {
      // Update module-level defaults so newly spawned entities use correct bounds.
      INTERNAL_WIDTH  = w;
      INTERNAL_HEIGHT = h;
      widthPx  = w;
      heightPx = h;
    }
    canvas.width  = widthPx;
    canvas.height = heightPx;
    fluid.resize(widthPx, heightPx);
  }
  doResize(container);

  const mote: RpgMote = {
    x: widthPx / 2, y: heightPx / 2, vx: 0, vy: 0,
    trailX: new Float64Array(RPG_TRAIL_CAPACITY),
    trailY: new Float64Array(RPG_TRAIL_CAPACITY),
    trailHead: 0, trailCount: 0,
  };

  const joystick: RpgJoystick = { isActive: false, pointerId: -1, baseX: 0, baseY: 0, thumbX: 0, thumbY: 0 };
  const keys: RpgKeyState = { left: false, right: false, up: false, down: false };
  const playerStats: RpgPlayerStats = { hp: PLAYER_HP_INIT, maxHp: PLAYER_HP_INIT, atk: PLAYER_ATK_INIT, def: PLAYER_DEF_INIT };

  let glowMovementIntensity = 0;
  let currentWave      = 0;
  let interWaveTimerMs = 0;
  let isInterWave      = true;
  const enemies: LaserEnemy[]    = [];
  const spawnQueue: SpawnEntry[] = [];
  let glowTimeS = 0;
  let _isActive = false;
  let rpgPhase: RpgPhase = 'alive';
  let phaseTimerMs     = 0;
  let deathAlpha       = 1;
  let screenDarken     = 0;
  let restartFadeAlpha = 0;
  const deathParticles: DeathParticle[] = [];

  // ── Player attack state ────────────────────────────────────────
  const hitEffects: HitEffect[] = [];
  const shotLines:  ShotLine[]  = [];
  const damageNumbers: DamageNumber[] = [];
  let playerIFramesMs = 0;

  // ── Sapphire enemies, missiles, and new weapon state ──────────
  const sapphireEnemies: SapphireEnemy[]  = [];
  const sapphireMissiles: SapphireMissile[] = [];
  const sandProjectiles: SandProjectile[] = [];
  /** Chain whip states keyed by weaponId (for each equipped chainWhip weapon). */
  const chainWhipStates: Map<string, ChainWhipState> = new Map();
  let laserBeamEffect: LaserBeamEffect | null = null;

  // ── New enemy type arrays ──────────────────────────────────────
  const emeraldEnemies: EmeraldEnemy[] = [];
  const amberEnemies: AmberEnemy[]     = [];
  const amberShards: AmberShard[]      = [];
  const voidEnemies: VoidEnemy[]       = [];

  // ── Crystal hierarchy enemy arrays ────────────────────────────
  const quartzEnemies: QuartzEnemy[]       = [];
  const quartzSpikes: QuartzSpike[]        = [];
  const rubyEnemies: RubyEnemy[]           = [];
  const rubyBolts: RubyBolt[]              = [];
  const sunstoneEnemies: SunstoneEnemy[]   = [];
  const citrineEnemies: CitrineEnemy[]     = [];
  const citrineBolts: CitrineBolt[]        = [];
  const ioliteEnemies: IoliteEnemy[]       = [];
  const amethystEnemies: AmethystEnemy[]   = [];
  const amethystShards: AmethystShard[]    = [];
  const diamondEnemies: DiamondEnemy[]     = [];
  const diamondShards: DiamondShard[]      = [];
  const nullstoneEnemies: NullstoneEnemy[] = [];
  const voidTendrils: VoidTendril[]        = [];

  const BOSS_GLYPH_LABEL = String.fromCodePoint(0x1469, 0x14B1, 0x1553, 0x140A); // ᑩᒱᕓᐊ — UCAS characters chosen for aesthetic angular appearance

  // ── Equipped weapon visual particles (one per equipped weapon) ────
  const weaponOrbitParticles: WeaponOrbitParticle[] = [];

  // ── Per-weapon attack timers ───────────────────────────────────
  const weaponAttackTimers: Map<string, number> = new Map();

  function buildWeaponOrbitParticle(weaponId: string, startAngle: number): WeaponOrbitParticle | null {
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    if (!weaponDef) return null;
    const tierDef = TIER_BY_ID.get(weaponDef.costTierId);
    const color     = tierDef?.color     ?? '#ffd764';
    const glowColor = tierDef?.glowColor ?? '#ffe599';
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const size = Math.max(1, tier);
    return {
      angle: startAngle,
      x: mote.x + Math.cos(startAngle) * WEAPON_PARTICLE_ORBIT_RADIUS,
      y: mote.y + Math.sin(startAngle) * WEAPON_PARTICLE_ORBIT_RADIUS,
      trailX: new Float64Array(WEAPON_ORBIT_TRAIL_CAP),
      trailY: new Float64Array(WEAPON_ORBIT_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
      color, glowColor, size,
    };
  }

  // ── Orbiting projectile upgrade ───────────────────────────────
  let orbitProjectile: OrbitProjectile | null = null;

  function buildOrbitProjectile(): OrbitProjectile | null {
    const hasUpgrade = getRpgUpgradeLevel(rpgSimState, 'orbit_projectile') >= 1;
    if (!hasUpgrade) return null;
    return {
      angle: Math.PI,   // start on the opposite side from weapon particle
      x: mote.x - ORBIT_PROJ_RADIUS,
      y: mote.y,
      trailX: new Float64Array(ORBIT_PROJ_TRAIL_CAP),
      trailY: new Float64Array(ORBIT_PROJ_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
      hitCooldowns: new Map(),
    };
  }

  function applyEquipmentStats(): void {
    // Aggregate DEF from all equipped weapons.
    let totalDefBonus = 0;
    for (const weaponId of rpgSimState.equippedWeaponIds) {
      const weaponDef = WEAPON_BY_ID.get(weaponId);
      if (weaponDef) totalDefBonus += weaponDef.stats.defBonus;
    }
    playerStats.def = PLAYER_DEF_INIT + totalDefBonus + getXpDefBonus(rpgSimState.xp);
    // Player ATK is the base multiplier (not including per-weapon tier damage).
    playerStats.atk = PLAYER_ATK_INIT + getXpAtkBonus(rpgSimState.xp);

    // Rebuild weapon orbit particles (one per equipped weapon, evenly spaced).
    weaponOrbitParticles.length = 0;
    const equippedIds = Array.from(rpgSimState.equippedWeaponIds);
    const angleStep = equippedIds.length > 0 ? (2 * Math.PI) / equippedIds.length : 0;
    for (let i = 0; i < equippedIds.length; i++) {
      const p = buildWeaponOrbitParticle(equippedIds[i], i * angleStep);
      if (p) weaponOrbitParticles.push(p);
    }

    // Remove chain whip states for weapons that are no longer equipped.
    for (const weaponId of Array.from(chainWhipStates.keys())) {
      if (!rpgSimState.equippedWeaponIds.has(weaponId)) chainWhipStates.delete(weaponId);
    }
    // Remove attack timers for unequipped weapons.
    for (const weaponId of Array.from(weaponAttackTimers.keys())) {
      if (!rpgSimState.equippedWeaponIds.has(weaponId)) weaponAttackTimers.delete(weaponId);
    }

    orbitProjectile = buildOrbitProjectile();
  }

  // ── Player attack helpers ──────────────────────────────────────

  /** Deals damage from the player to one laser enemy, respecting DEF and a DEF pierce ratio.
   *  Returns the actual damage dealt (0 if DEF fully absorbed the hit). */
  function damageEnemy(enemy: LaserEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  /**
   * Deals damage to a sapphire enemy, handling the shield.
   * bypassShield = true means the ruby laser is firing — ignore the shield.
   * Returns { dmg, wasShield } where dmg is the effective damage applied.
   */
  function damageSapphireEnemy(
    enemy: SapphireEnemy,
    rawDamage: number,
    defPierceRatio: number,
    bypassShield: boolean,
  ): number {
    if (!bypassShield && enemy.shieldHp > 0) {
      // Shields always absorb at least MINIMUM_SHIELD_DAMAGE, making chip damage possible.
      const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
      enemy.shieldHp = Math.max(0, enemy.shieldHp - dmg);
      return dmg;
    }
    // Hit the enemy body.
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  /** Deals damage to a missile (no DEF, no shield). Returns actual damage dealt. */
  function damageMissile(missile: SapphireMissile, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    missile.hp = Math.max(0, missile.hp - dmg);
    return dmg;
  }

  /** Deals damage to an emerald enemy. Returns actual damage dealt. */
  function damageEmeraldEnemy(enemy: EmeraldEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  /** Deals damage to an amber enemy. Returns actual damage dealt. */
  function damageAmberEnemy(enemy: AmberEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  /** Deals damage to an amber shard (no DEF). Returns actual damage dealt. */
  function damageAmberShard(shard: AmberShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    return dmg;
  }

  /** Deals damage to a void enemy (high DEF). Returns actual damage dealt. */
  function damageVoidEnemy(enemy: VoidEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageQuartzEnemy(enemy: QuartzEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageQuartzSpike(spike: QuartzSpike, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    spike.hp = Math.max(0, spike.hp - dmg);
    return dmg;
  }

  function damageRubyEnemy(enemy: RubyEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageRubyBolt(bolt: RubyBolt, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    bolt.hp = Math.max(0, bolt.hp - dmg);
    return dmg;
  }

  function damageSunstoneEnemy(enemy: SunstoneEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageCitrineEnemy(enemy: CitrineEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageCitrineBolt(bolt: CitrineBolt, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    bolt.hp = Math.max(0, bolt.hp - dmg);
    return dmg;
  }

  function damageIoliteEnemy(enemy: IoliteEnemy, rawDamage: number, defPierceRatio: number): number {
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageAmethystEnemy(enemy: AmethystEnemy, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number {
    if (!bypassShield && enemy.shieldHp > 0) {
      const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
      enemy.shieldHp = Math.max(0, enemy.shieldHp - dmg);
      return dmg;
    }
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageAmethystShard(shard: AmethystShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    return dmg;
  }

  function damageDiamondEnemy(enemy: DiamondEnemy, rawDamage: number, defPierceRatio: number): number {
    if (enemy.phaseInvuln) return 0;
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageDiamondShard(shard: DiamondShard, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    shard.hp = Math.max(0, shard.hp - dmg);
    return dmg;
  }

  function damageNullstoneEnemy(enemy: NullstoneEnemy, rawDamage: number, defPierceRatio: number): number {
    if (enemy.isAbsorbing) return 0;
    const effectiveDef = enemy.def * (1 - defPierceRatio);
    const dmg = Math.max(0, rawDamage - effectiveDef);
    if (dmg > 0) enemy.hp -= dmg;
    return dmg;
  }

  function damageVoidTendril(tendril: VoidTendril, rawDamage: number): number {
    const dmg = Math.max(MINIMUM_SHIELD_DAMAGE, rawDamage);
    tendril.hp = Math.max(0, tendril.hp - dmg);
    return dmg;
  }

  /**
   * Spawns a floating damage/blocked number at (x, y) travelling in (dirX, dirY).
   * `ratio` is dmg / maxHp clamped to [0, 1] and controls font size.
   */
  function spawnDamageNumber(
    x: number, y: number,
    dirX: number, dirY: number,
    text: string,
    ratio: number,
    color: string,
  ): void {
    const clampedRatio = Math.min(1, Math.max(0, ratio));
    const fontPx = DAMAGE_NUM_MIN_FONT_PX + clampedRatio * (DAMAGE_NUM_MAX_FONT_PX - DAMAGE_NUM_MIN_FONT_PX);
    const initialSpeed  = DAMAGE_NUM_INITIAL_SPEED * (0.5 + clampedRatio * 0.5);
    damageNumbers.push({
      x, y,
      vx: dirX * initialSpeed,
      vy: dirY * initialSpeed,
      text,
      fontPx: Math.max(DAMAGE_NUM_MIN_FONT_PX, fontPx),
      color,
      timerMs: DAMAGE_NUM_DURATION_MS,
    });
  }

  /** Registers a hit-flash and shot-line visual for one target position, and spawns a damage number. */
  function spawnHitVisualsAt(tx: number, ty: number, maxHp: number, dmg: number, color: string): void {
    hitEffects.push({ x: tx, y: ty, timerMs: HIT_EFFECT_DURATION_MS, color });
    shotLines.push({ x1: mote.x, y1: mote.y, x2: tx, y2: ty, timerMs: SHOT_LINE_DURATION_MS, color });
    const dx = tx - mote.x, dy = ty - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    let dirX = dist > 0.01 ? dx / dist : 0;
    let dirY = dist > 0.01 ? dy / dist : -1;
    // Apply ±15° random angle deviation with triangular distribution (lower probability at extremes).
    // Summing two uniform [0,1] random numbers and subtracting 1 gives a triangular distribution
    // on [-1, 1], making extreme angles (±15°) less likely than small deviations near 0.
    const deviation = (Math.random() + Math.random() - 1) * (Math.PI / 12);
    const cosD = Math.cos(deviation), sinD = Math.sin(deviation);
    const rotX = dirX * cosD - dirY * sinD;
    const rotY = dirX * sinD + dirY * cosD;
    dirX = rotX; dirY = rotY;
    if (dmg <= 0) {
      spawnDamageNumber(tx, ty, dirX, dirY, 'BLOCKED', 0.25, '#74c0fc');
    } else {
      spawnDamageNumber(tx, ty, dirX, dirY, String(Math.round(dmg)), dmg / maxHp, '#ffffff');
    }
  }

  /** Registers a hit-flash and shot-line visual for one laser enemy, and spawns a damage number. */
  function spawnHitVisuals(enemy: LaserEnemy, dmg: number, color: string): void {
    spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, color);
  }

  // ── Closest-target helpers ─────────────────────────────────────

  /** Represents any targetable entity. */
  type TargetKind = 'laser' | 'sapphire' | 'missile' | 'emerald' | 'amber' | 'ambershard' | 'void'
    | 'quartz' | 'quartzspike' | 'ruby' | 'rubybolt' | 'sunstone' | 'citrine' | 'citrinebolt'
    | 'iolite' | 'amethyst' | 'amethystshard' | 'diamond' | 'diamondshard' | 'nullstone' | 'voidtendril';
  interface ClosestTarget {
    kind: TargetKind;
    x: number; y: number;
    distSq: number;
    laser?: LaserEnemy;
    sapphire?: SapphireEnemy;
    missile?: SapphireMissile;
    emerald?: EmeraldEnemy;
    amber?: AmberEnemy;
    ambershard?: AmberShard;
    void?: VoidEnemy;
    quartz?: QuartzEnemy;
    quartzspike?: QuartzSpike;
    ruby?: RubyEnemy;
    rubybolt?: RubyBolt;
    sunstone?: SunstoneEnemy;
    citrine?: CitrineEnemy;
    citrinebolt?: CitrineBolt;
    iolite?: IoliteEnemy;
    amethyst?: AmethystEnemy;
    amethystshard?: AmethystShard;
    diamond?: DiamondEnemy;
    diamondshard?: DiamondShard;
    nullstone?: NullstoneEnemy;
    voidtendril?: VoidTendril;
  }

  /**
   * Returns the closest targetable entity within rangeSq squared distance.
   * Returns null if nothing is in range.
   */
  function findClosestTarget(rangeSq: number): ClosestTarget | null {
    let best: ClosestTarget | null = null;
    let bestSq = rangeSq;

    for (const e of enemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'laser', x: e.x, y: e.y, distSq: d, laser: e }; }
    }
    for (const e of sapphireEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'sapphire', x: e.x, y: e.y, distSq: d, sapphire: e }; }
    }
    for (const m of sapphireMissiles) {
      const dx = m.x - mote.x, dy = m.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'missile', x: m.x, y: m.y, distSq: d, missile: m }; }
    }
    for (const e of emeraldEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'emerald', x: e.x, y: e.y, distSq: d, emerald: e }; }
    }
    for (const e of amberEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'amber', x: e.x, y: e.y, distSq: d, amber: e }; }
    }
    for (const s of amberShards) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'ambershard', x: s.x, y: s.y, distSq: d, ambershard: s }; }
    }
    for (const e of voidEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'void', x: e.x, y: e.y, distSq: d, void: e }; }
    }
    for (const e of quartzEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'quartz', x: e.x, y: e.y, distSq: d, quartz: e }; }
    }
    for (const s of quartzSpikes) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'quartzspike', x: s.x, y: s.y, distSq: d, quartzspike: s }; }
    }
    for (const e of rubyEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'ruby', x: e.x, y: e.y, distSq: d, ruby: e }; }
    }
    for (const b of rubyBolts) {
      const dx = b.x - mote.x, dy = b.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'rubybolt', x: b.x, y: b.y, distSq: d, rubybolt: b }; }
    }
    for (const e of sunstoneEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'sunstone', x: e.x, y: e.y, distSq: d, sunstone: e }; }
    }
    for (const e of citrineEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'citrine', x: e.x, y: e.y, distSq: d, citrine: e }; }
    }
    for (const b of citrineBolts) {
      const dx = b.x - mote.x, dy = b.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'citrinebolt', x: b.x, y: b.y, distSq: d, citrinebolt: b }; }
    }
    for (const e of ioliteEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'iolite', x: e.x, y: e.y, distSq: d, iolite: e }; }
    }
    for (const e of amethystEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'amethyst', x: e.x, y: e.y, distSq: d, amethyst: e }; }
    }
    for (const s of amethystShards) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'amethystshard', x: s.x, y: s.y, distSq: d, amethystshard: s }; }
    }
    for (const e of diamondEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'diamond', x: e.x, y: e.y, distSq: d, diamond: e }; }
    }
    for (const s of diamondShards) {
      const dx = s.x - mote.x, dy = s.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'diamondshard', x: s.x, y: s.y, distSq: d, diamondshard: s }; }
    }
    for (const e of nullstoneEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'nullstone', x: e.x, y: e.y, distSq: d, nullstone: e }; }
    }
    for (const t of voidTendrils) {
      const dx = t.x - mote.x, dy = t.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = { kind: 'voidtendril', x: t.x, y: t.y, distSq: d, voidtendril: t }; }
    }
    return best;
  }

  /** Returns the closest enemy body (not projectiles) within rangeSq. */
  function findClosestEnemy(rangeSq: number): LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
    | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy | null {
    let bestSq = rangeSq;
    let best: LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy
      | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy | null = null;
    for (const e of enemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of sapphireEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of emeraldEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of amberEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of voidEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of quartzEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of rubyEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of sunstoneEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of citrineEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of ioliteEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of amethystEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of diamondEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    for (const e of nullstoneEnemies) {
      const dx = e.x - mote.x, dy = e.y - mote.y;
      const d = dx * dx + dy * dy;
      if (d <= bestSq) { bestSq = d; best = e; }
    }
    return best;
  }

  // ── Sand gatling projectile system ─────────────────────────────

  function spawnSandProjectile(targetX: number, targetY: number, damage: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    sandProjectiles.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * SAND_PROJ_SPEED,
      vy: (dy / dist) * SAND_PROJ_SPEED,
      lifeMs: SAND_PROJ_LIFE_MS,
      scaledDamage: damage,
    });
  }

  function updateSandProjectiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);

    for (let i = sandProjectiles.length - 1; i >= 0; i--) {
      const p = sandProjectiles[i];
      const damage = p.scaledDamage;
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { sandProjectiles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;

      // Inject sand-projectile motion into fluid.
      fluid.addForce({
        x: p.x, y: p.y,
        vx: p.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: p.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_SAND_R, g: FLUID_SAND_G, b: FLUID_SAND_B,
        strength: FLUID_PROJECTILE_STRENGTH,
      });

      // Bounds check
      if (p.x < 0 || p.x > widthPx || p.y < 0 || p.y > heightPx) {
        sandProjectiles.splice(i, 1); continue;
      }

      // Collision with laser enemies
      let hit = false;
      for (const e of enemies) {
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < (LASER_ENEMY_SIZE * 2) ** 2) {
          const dmg = damageEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with sapphire enemies
      for (const e of sapphireEnemies) {
        const hitR = SAPPHIRE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageSapphireEnemy(e, damage, 0, false);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with missiles
      for (const m of sapphireMissiles) {
        const dx = p.x - m.x, dy = p.y - m.y;
        if (dx * dx + dy * dy < (MISSILE_SIZE * 2.5) ** 2) {
          const dmg = damageMissile(m, damage);
          spawnHitVisualsAt(m.x, m.y, m.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); break;
        }
      }
      if (hit) continue;

      // Collision with emerald enemies
      for (const e of emeraldEnemies) {
        const hitR = EMERALD_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageEmeraldEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amber enemies
      for (const e of amberEnemies) {
        const hitR = AMBER_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageAmberEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amber shards
      for (const s of amberShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (AMBER_SHARD_SIZE * 2.5) ** 2) {
          const dmg = damageAmberShard(s, damage);
          spawnHitVisualsAt(s.x, s.y, s.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with void enemies
      for (const e of voidEnemies) {
        const hitR = VOID_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageVoidEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); break;
        }
      }
      if (hit) continue;

      // Collision with quartz enemies
      for (const e of quartzEnemies) {
        const hitR = QUARTZ_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageQuartzEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with quartz spikes
      for (const s of quartzSpikes) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (QUARTZ_SPIKE_SIZE * 2.5) ** 2) {
          damageQuartzSpike(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with ruby enemies
      for (const e of rubyEnemies) {
        const hitR = RUBY_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageRubyEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with ruby bolts
      for (const b of rubyBolts) {
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy < (RUBY_BOLT_SIZE * 2.5) ** 2) {
          damageRubyBolt(b, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with sunstone enemies
      for (const e of sunstoneEnemies) {
        const hitR = SUNSTONE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageSunstoneEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with citrine enemies
      for (const e of citrineEnemies) {
        const hitR = CITRINE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageCitrineEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with citrine bolts
      for (const b of citrineBolts) {
        const dx = p.x - b.x, dy = p.y - b.y;
        if (dx * dx + dy * dy < (CITRINE_BOLT_SIZE * 2.5) ** 2) {
          damageCitrineBolt(b, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with iolite enemies
      for (const e of ioliteEnemies) {
        const hitR = IOLITE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageIoliteEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amethyst enemies
      for (const e of amethystEnemies) {
        const hitR = AMETHYST_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageAmethystEnemy(e, damage, 0, false);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with amethyst shards
      for (const s of amethystShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (AMETHYST_SHARD_SIZE * 2.5) ** 2) {
          damageAmethystShard(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with diamond enemies
      for (const e of diamondEnemies) {
        const hitR = DIAMOND_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageDiamondEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with diamond shards
      for (const s of diamondShards) {
        const dx = p.x - s.x, dy = p.y - s.y;
        if (dx * dx + dy * dy < (DIAMOND_SHARD_SIZE * 2.5) ** 2) {
          damageDiamondShard(s, damage);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with nullstone enemies
      for (const e of nullstoneEnemies) {
        const hitR = NULLSTONE_ENEMY_SIZE + SAND_PROJ_SIZE;
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageNullstoneEnemy(e, damage, 0);
          spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, SAND_PROJ_COLOR);
          sandProjectiles.splice(i, 1); hit = true; break;
        }
      }
      if (hit) continue;

      // Collision with void tendrils
      for (const t of voidTendrils) {
        const dx = p.x - t.x, dy = p.y - t.y;
        if (dx * dx + dy * dy < (VOID_TENDRIL_SIZE * 2.5) ** 2) {
          damageVoidTendril(t, damage);
          sandProjectiles.splice(i, 1); break;
        }
      }
    }
  }

  function drawSandProjectiles(): void {
    if (sandProjectiles.length === 0) return;
    ctx.save();
    for (const p of sandProjectiles) {
      const alpha = p.lifeMs / SAND_PROJ_LIFE_MS;
      ctx.globalAlpha = alpha * 0.9;
      ctx.shadowBlur  = SAND_PROJ_SIZE * 4; ctx.shadowColor = SAND_PROJ_GLOW;
      ctx.fillStyle   = SAND_PROJ_GLOW;
      const gr = SAND_PROJ_SIZE * 1.5;
      ctx.fillRect(Math.floor(p.x - gr), Math.floor(p.y - gr), Math.ceil(gr * 2), Math.ceil(gr * 2));
      ctx.shadowBlur = 0;
      ctx.fillStyle  = SAND_PROJ_COLOR;
      ctx.fillRect(Math.floor(p.x - SAND_PROJ_SIZE / 2), Math.floor(p.y - SAND_PROJ_SIZE / 2), SAND_PROJ_SIZE, SAND_PROJ_SIZE);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Quartz chain whip system ───────────────────────────────────

  /**
   * Returns the radius of chain node at index i.
   * i=0 (closest to player) is smallest; i=CHAIN_NODES-1 (tip) is largest.
   */
  function chainNodeRadius(i: number): number {
    return CHAIN_MIN_RADIUS + (CHAIN_MAX_RADIUS - CHAIN_MIN_RADIUS) * i / (CHAIN_NODES - 1);
  }

  /**
   * Returns 1/inertia for node at index i.
   * Higher inverseMass = more responsive to forces.
   * i=0 (closest to player) has lowest inertia → most responsive (highest inverseMass).
   * i=CHAIN_NODES-1 (tip) has highest inertia → least responsive (lowest inverseMass).
   */
  function chainNodeInvMass(i: number): number {
    const inertia = CHAIN_MIN_INERTIA + (CHAIN_MAX_INERTIA - CHAIN_MIN_INERTIA) * i / (CHAIN_NODES - 1);
    return 1.0 / inertia;
  }

  function buildChainWhip(weaponId: string): ChainWhipState {
    const nodesX  = new Float64Array(CHAIN_NODES);
    const nodesY  = new Float64Array(CHAIN_NODES);
    const nodesVx = new Float64Array(CHAIN_NODES);
    const nodesVy = new Float64Array(CHAIN_NODES);
    for (let i = 0; i < CHAIN_NODES; i++) { nodesX[i] = mote.x; nodesY[i] = mote.y; }
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    return {
      phase: 'idle',
      phaseMs: 0,
      cooldownMs: weaponDef?.stats.cooldownMs ?? 2500,
      targetX: mote.x, targetY: mote.y,
      nodesX, nodesY, nodesVx, nodesVy,
      hitCooldowns: new Map(),
    };
  }

  function updateChainWhipCooldowns(ws: ChainWhipState, deltaMs: number): void {
    for (const [key, cd] of ws.hitCooldowns) {
      const next = cd - deltaMs;
      if (next <= 0) ws.hitCooldowns.delete(key);
      else ws.hitCooldowns.set(key, next);
    }
  }

  /**
   * Advances the softbody spring physics for all chain nodes.
   * anchorK controls how strongly node 0 is pulled toward the player.
   */
  function stepChainPhysics(ws: ChainWhipState, dt: number, anchorK: number): void {
    // Node 0: spring anchor toward player (rest length 0)
    ws.nodesVx[0] += (mote.x - ws.nodesX[0]) * anchorK * chainNodeInvMass(0) * dt;
    ws.nodesVy[0] += (mote.y - ws.nodesY[0]) * anchorK * chainNodeInvMass(0) * dt;

    // Spring forces between adjacent pairs
    for (let i = 0; i < CHAIN_NODES - 1; i++) {
      const sdx = ws.nodesX[i + 1] - ws.nodesX[i];
      const sdy = ws.nodesY[i + 1] - ws.nodesY[i];
      const sdist = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sdist < 0.001) continue;
      const stretch = sdist - CHAIN_REST_LENGTH;
      const fx = (sdx / sdist) * stretch * CHAIN_SPRING_K;
      const fy = (sdy / sdist) * stretch * CHAIN_SPRING_K;
      ws.nodesVx[i]     += fx * chainNodeInvMass(i)     * dt;
      ws.nodesVy[i]     += fy * chainNodeInvMass(i)     * dt;
      ws.nodesVx[i + 1] -= fx * chainNodeInvMass(i + 1) * dt;
      ws.nodesVy[i + 1] -= fy * chainNodeInvMass(i + 1) * dt;
    }

    // Integrate positions + apply damping
    const dampFactor = Math.pow(CHAIN_DAMPING, dt);
    for (let i = 0; i < CHAIN_NODES; i++) {
      ws.nodesVx[i] *= dampFactor;
      ws.nodesVy[i] *= dampFactor;
      ws.nodesX[i] += ws.nodesVx[i] * dt;
      ws.nodesY[i] += ws.nodesVy[i] * dt;
    }
  }

  function updateChainWhip(weaponId: string, deltaMs: number): void {
    const weaponDef = WEAPON_BY_ID.get(weaponId);
    if (!weaponDef || weaponDef.stats.effect?.kind !== 'chainWhip') {
      chainWhipStates.delete(weaponId);
      return;
    }
    if (!chainWhipStates.has(weaponId)) chainWhipStates.set(weaponId, buildChainWhip(weaponId));
    const ws = chainWhipStates.get(weaponId)!;
    const range = weaponDef.stats.range;
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const contactDamage = getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk);

    updateChainWhipCooldowns(ws, deltaMs);

    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);

    if (ws.phase === 'idle') {
      // Soft anchor during idle — nodes settle back toward player
      stepChainPhysics(ws, dt, CHAIN_ANCHOR_K);
      ws.phaseMs += deltaMs;
      if (ws.phaseMs >= ws.cooldownMs) {
        const target = findClosestEnemy(range * range);
        if (target) {
          ws.targetX = target.x; ws.targetY = target.y;
          // Give the tip (CHAIN_NODES-1) a sudden velocity toward the target
          const tipX = ws.nodesX[CHAIN_NODES - 1], tipY = ws.nodesY[CHAIN_NODES - 1];
          const tdx = ws.targetX - tipX, tdy = ws.targetY - tipY;
          const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
          if (tdist > 0.01) {
            ws.nodesVx[CHAIN_NODES - 1] = (tdx / tdist) * CHAIN_LASH_SPEED;
            ws.nodesVy[CHAIN_NODES - 1] = (tdy / tdist) * CHAIN_LASH_SPEED;
          }
          ws.phase = 'lashing'; ws.phaseMs = 0;
        } else {
          ws.phaseMs = ws.cooldownMs;
        }
      }
    } else if (ws.phase === 'lashing') {
      ws.phaseMs += deltaMs;
      stepChainPhysics(ws, dt, CHAIN_ANCHOR_K);

      // Contact damage: check all nodes against all enemies
      const applyContactDamage = (tx: number, ty: number, target: LaserEnemy | SapphireEnemy | EmeraldEnemy | AmberEnemy | VoidEnemy | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy): void => {
        const nodeR = chainNodeRadius(CHAIN_NODES - 1); // use tip radius for hit detection
        const r = nodeR + LASER_ENEMY_SIZE;
        const dx = tx - target.x, dy = ty - target.y;
        if (dx * dx + dy * dy < r * r) {
          if (!ws.hitCooldowns.has(target)) {
            let dmg = 0;
            // Sapphire is the only enemy type with `shieldHp` but without a `kind` discriminator.
            // Amethyst also has `shieldHp` but carries `kind: 'amethyst'`, so the `!('kind' in target)` check correctly excludes it.
            if ('shieldHp' in target && !('kind' in target)) {
              dmg = damageSapphireEnemy(target as SapphireEnemy, contactDamage, 0, false);
            } else if ('kind' in target) {
              const t = target as EmeraldEnemy | AmberEnemy | VoidEnemy | QuartzEnemy | RubyEnemy | SunstoneEnemy | CitrineEnemy | IoliteEnemy | AmethystEnemy | DiamondEnemy | NullstoneEnemy;
              switch (t.kind) {
                case 'emerald':   dmg = damageEmeraldEnemy(t, contactDamage, 0); break;
                case 'amber':     dmg = damageAmberEnemy(t, contactDamage, 0); break;
                case 'void':      dmg = damageVoidEnemy(t, contactDamage, 0); break;
                case 'quartz':    dmg = damageQuartzEnemy(t, contactDamage, 0); break;
                case 'ruby':      dmg = damageRubyEnemy(t, contactDamage, 0); break;
                case 'sunstone':  dmg = damageSunstoneEnemy(t, contactDamage, 0); break;
                case 'citrine':   dmg = damageCitrineEnemy(t, contactDamage, 0); break;
                case 'iolite':    dmg = damageIoliteEnemy(t, contactDamage, 0); break;
                case 'amethyst':  dmg = damageAmethystEnemy(t, contactDamage, 0, false); break;
                case 'diamond':   dmg = damageDiamondEnemy(t, contactDamage, 0); break;
                case 'nullstone': dmg = damageNullstoneEnemy(t, contactDamage, 0); break;
              }
            } else {
              dmg = damageEnemy(target as LaserEnemy, contactDamage, 0);
            }
            ws.hitCooldowns.set(target, CHAIN_HIT_CD_MS);
            hitEffects.push({ x: target.x, y: target.y, timerMs: HIT_EFFECT_DURATION_MS, color: CHAIN_NODE_COLOR });
            spawnDamageNumber(target.x, target.y, 0, -1, String(Math.round(dmg)), dmg / target.maxHp, CHAIN_NODE_COLOR);
          }
        }
      };
      for (let ni = 0; ni < CHAIN_NODES; ni++) {
        const nx = ws.nodesX[ni], ny = ws.nodesY[ni];
        for (const e of enemies)          applyContactDamage(nx, ny, e);
        for (const e of sapphireEnemies)  applyContactDamage(nx, ny, e);
        for (const e of emeraldEnemies)   applyContactDamage(nx, ny, e);
        for (const e of amberEnemies)     applyContactDamage(nx, ny, e);
        for (const e of voidEnemies)      applyContactDamage(nx, ny, e);
        for (const e of quartzEnemies)    applyContactDamage(nx, ny, e);
        for (const e of rubyEnemies)      applyContactDamage(nx, ny, e);
        for (const e of sunstoneEnemies)  applyContactDamage(nx, ny, e);
        for (const e of citrineEnemies)   applyContactDamage(nx, ny, e);
        for (const e of ioliteEnemies)    applyContactDamage(nx, ny, e);
        for (const e of amethystEnemies)  applyContactDamage(nx, ny, e);
        for (const e of diamondEnemies)   applyContactDamage(nx, ny, e);
        for (const e of nullstoneEnemies) applyContactDamage(nx, ny, e);
      }

      // Inject fluid force along the chain length
      const tipDx = ws.targetX - mote.x;
      const tipDy = ws.targetY - mote.y;
      const tipDist = Math.sqrt(tipDx * tipDx + tipDy * tipDy);
      if (tipDist > 0.1) {
        for (let ni = 0; ni < CHAIN_NODES; ni++) {
          fluid.addForce({
            x: ws.nodesX[ni], y: ws.nodesY[ni],
            vx: (tipDx / tipDist) * FLUID_VEL_FRAME_TO_PX_S * 1.5,
            vy: (tipDy / tipDist) * FLUID_VEL_FRAME_TO_PX_S * 1.5,
            r: FLUID_CHAIN_R, g: FLUID_CHAIN_G, b: FLUID_CHAIN_B,
            strength: 1.2,
          });
        }
      }

      if (ws.phaseMs >= CHAIN_LASH_MS) { ws.phase = 'retracting'; ws.phaseMs = 0; }
    } else if (ws.phase === 'retracting') {
      ws.phaseMs += deltaMs;
      // Use stronger anchor spring to pull nodes back toward player
      stepChainPhysics(ws, dt, CHAIN_RETRACT_ANCHOR_K);
      if (ws.phaseMs >= CHAIN_RETRACT_MS) { ws.phase = 'idle'; ws.phaseMs = 0; }
    }
  }

  function drawChainWhip(ws: ChainWhipState): void {
    if (ws.phase === 'idle' && ws.phaseMs < ws.cooldownMs * 0.1) return;
    ctx.save();
    ctx.lineWidth = 1.5;
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    // Draw chain links (lines between nodes)
    ctx.strokeStyle = CHAIN_LINE_COLOR;
    ctx.shadowBlur  = 4; ctx.shadowColor = CHAIN_NODE_GLOW;
    ctx.globalAlpha = 0.75;
    ctx.beginPath();
    ctx.moveTo(ws.nodesX[0], ws.nodesY[0]);
    for (let i = 1; i < CHAIN_NODES; i++) ctx.lineTo(ws.nodesX[i], ws.nodesY[i]);
    ctx.stroke();
    ctx.shadowBlur = 0;
    // Draw node circles with graduated sizes
    for (let i = 0; i < CHAIN_NODES; i++) {
      const r = chainNodeRadius(i);
      ctx.globalAlpha = 0.9;
      ctx.shadowBlur  = r * 3; ctx.shadowColor = CHAIN_NODE_GLOW;
      ctx.fillStyle   = CHAIN_NODE_GLOW;
      ctx.beginPath();
      ctx.arc(ws.nodesX[i], ws.nodesY[i], r * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle  = CHAIN_NODE_COLOR;
      ctx.beginPath();
      ctx.arc(ws.nodesX[i], ws.nodesY[i], r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Ruby laser beam system ─────────────────────────────────────

  function fireLaserBeam(targetX: number, targetY: number, weaponId: string): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    const dirX = dx / dist, dirY = dy / dist;
    laserBeamEffect = { active: true, startX: mote.x, startY: mote.y, dirX, dirY, timerMs: LASER_BEAM_VISIBLE_MS, endX: 0, endY: 0 };

    // Compute the endpoint (extend to canvas edge)
    let tMax = Infinity;
    if (dirX > 0)  tMax = Math.min(tMax, (widthPx  - mote.x) / dirX);
    if (dirX < 0)  tMax = Math.min(tMax, -mote.x / dirX);
    if (dirY > 0)  tMax = Math.min(tMax, (heightPx - mote.y) / dirY);
    if (dirY < 0)  tMax = Math.min(tMax, -mote.y / dirY);
    const endX = mote.x + dirX * tMax;
    const endY = mote.y + dirY * tMax;

    const weaponDef = WEAPON_BY_ID.get(weaponId);
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const baseDamage = getScaledWeaponDamage(weaponDef?.stats.damage ?? 80, tier, playerStats.atk);

    // Hit every laser enemy on the beam path
    for (const e of enemies) {
      // Point-to-line distance
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= LASER_ENEMY_SIZE * 2) {
        const dmg = damageEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit every sapphire enemy on the beam path (bypasses shield)
    for (const e of sapphireEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= SAPPHIRE_SHIELD_RADIUS + 2) {
        const dmg = damageSapphireEnemy(e, baseDamage, 1.0, true);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit missiles on the beam path
    for (const m of sapphireMissiles) {
      const ex = m.x - mote.x, ey = m.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= MISSILE_SIZE * 2) {
        damageMissile(m, baseDamage);
      }
    }

    // Hit emerald enemies on the beam path
    for (const e of emeraldEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= EMERALD_ENEMY_SIZE * 2) {
        const dmg = damageEmeraldEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amber enemies on the beam path
    for (const e of amberEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMBER_ENEMY_SIZE * 2) {
        const dmg = damageAmberEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amber shards on the beam path
    for (const s of amberShards) {
      const ex = s.x - mote.x, ey = s.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMBER_SHARD_SIZE * 2) {
        damageAmberShard(s, baseDamage);
      }
    }

    // Hit void enemies on the beam path
    for (const e of voidEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= VOID_ENEMY_SIZE * 2) {
        const dmg = damageVoidEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit quartz enemies on the beam path
    for (const e of quartzEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= QUARTZ_ENEMY_SIZE * 2) {
        const dmg = damageQuartzEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit ruby enemies on the beam path
    for (const e of rubyEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= RUBY_ENEMY_SIZE * 2) {
        const dmg = damageRubyEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit sunstone enemies on the beam path
    for (const e of sunstoneEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= SUNSTONE_ENEMY_SIZE * 2) {
        const dmg = damageSunstoneEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit citrine enemies on the beam path
    for (const e of citrineEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= CITRINE_ENEMY_SIZE * 2) {
        const dmg = damageCitrineEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit iolite enemies on the beam path
    for (const e of ioliteEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= IOLITE_ENEMY_SIZE * 2) {
        const dmg = damageIoliteEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amethyst enemies on the beam path (bypasses shield)
    for (const e of amethystEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMETHYST_ENEMY_SIZE * 2) {
        const dmg = damageAmethystEnemy(e, baseDamage, 1.0, true);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit diamond enemies on the beam path
    for (const e of diamondEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= DIAMOND_ENEMY_SIZE * 2) {
        const dmg = damageDiamondEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit nullstone enemies on the beam path
    for (const e of nullstoneEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= NULLSTONE_ENEMY_SIZE * 2) {
        const dmg = damageNullstoneEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Store end coords for drawing
    laserBeamEffect.startX = mote.x; laserBeamEffect.startY = mote.y;
    laserBeamEffect.endX = endX;
    laserBeamEffect.endY = endY;

    // Inject beam force along its length: sample multiple points from muzzle
    // to edge, creating a strong directional fluid channel in the beam color.
    const beamLen = tMax;
    const beamSteps = Math.max(4, Math.floor(beamLen / 20));
    for (let k = 0; k <= beamSteps; k++) {
      const t = k / beamSteps;
      fluid.addForce({
        x: mote.x + dirX * beamLen * t,
        y: mote.y + dirY * beamLen * t,
        vx: dirX * FLUID_VEL_FRAME_TO_PX_S * 3.0,
        vy: dirY * FLUID_VEL_FRAME_TO_PX_S * 3.0,
        r: FLUID_BEAM_R, g: FLUID_BEAM_G, b: FLUID_BEAM_B,
        strength: FLUID_LASER_BEAM_STRENGTH,
      });
    }
  }

  function updateLaserBeamEffect(deltaMs: number): void {
    if (!laserBeamEffect || !laserBeamEffect.active) return;
    laserBeamEffect.timerMs -= deltaMs;
    if (laserBeamEffect.timerMs <= 0) laserBeamEffect.active = false;
  }

  function drawLaserBeamEffect(): void {
    if (!laserBeamEffect || !laserBeamEffect.active) return;
    const endX = laserBeamEffect.endX;
    const endY = laserBeamEffect.endY;
    const t = laserBeamEffect.timerMs / LASER_BEAM_VISIBLE_MS;
    ctx.save();
    ctx.globalAlpha = t * 0.9;
    ctx.lineCap = 'round';
    // Glow pass
    ctx.shadowBlur = 12; ctx.shadowColor = LASER_BEAM_GLOW;
    ctx.strokeStyle = LASER_BEAM_GLOW; ctx.lineWidth = LASER_BEAM_WIDTH * 3;
    ctx.beginPath(); ctx.moveTo(laserBeamEffect.startX, laserBeamEffect.startY); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.shadowBlur = 0;
    // Core pass
    ctx.strokeStyle = LASER_BEAM_COLOR; ctx.lineWidth = LASER_BEAM_WIDTH;
    ctx.beginPath(); ctx.moveTo(laserBeamEffect.startX, laserBeamEffect.startY); ctx.lineTo(endX, endY); ctx.stroke();
    ctx.globalAlpha = 1; ctx.restore();
  }

  // ── Sapphire enemy system ──────────────────────────────────────

  function spawnMissileFromEnemy(enemy: SapphireEnemy): void {
    const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const dirX = dist > 0.01 ? dx / dist : 0;
    const dirY = dist > 0.01 ? dy / dist : 1;
    sapphireMissiles.push(makeSapphireMissile(
      enemy.x, enemy.y,
      dirX * MISSILE_SPEED, dirY * MISSILE_SPEED,
    ));
    // Inject a gun-fire impulse in the launch direction.
    fluid.addForce({
      x: enemy.x, y: enemy.y,
      vx: dirX * FLUID_VEL_FRAME_TO_PX_S * 2.0,
      vy: dirY * FLUID_VEL_FRAME_TO_PX_S * 2.0,
      r: FLUID_MISSILE_R, g: FLUID_MISSILE_G, b: FLUID_MISSILE_B,
      strength: FLUID_PROJECTILE_STRENGTH * 1.5,
    });
  }

  function updateSapphireEnemies(deltaMs: number, _nowMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of sapphireEnemies) {
      // Patrol
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * SAPPHIRE_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * SAPPHIRE_PATROL_SPEED;
        enemy.patrolTimerMs = SAPPHIRE_PATROL_TURN_MS * (0.5 + Math.random() * 0.8);
      }
      enemy.vx *= Math.pow(LASER_PATROL_DAMPING, dt);
      enemy.vy *= Math.pow(LASER_PATROL_DAMPING, dt);
      enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
      // Clamp to bounds
      const half = SAPPHIRE_ENEMY_SIZE / 2;
      if (enemy.x < half)             { enemy.x = half;             enemy.vx =  Math.abs(enemy.vx) * 0.5; }
      if (enemy.x > widthPx  - half)  { enemy.x = widthPx  - half;  enemy.vx = -Math.abs(enemy.vx) * 0.5; }
      if (enemy.y < half)             { enemy.y = half;             enemy.vy =  Math.abs(enemy.vy) * 0.5; }
      if (enemy.y > heightPx - half)  { enemy.y = heightPx - half;  enemy.vy = -Math.abs(enemy.vy) * 0.5; }

      // Inject sapphire-enemy movement into fluid.
      const sespd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (sespd > 0.04) {
        fluid.addForce({
          x: enemy.x, y: enemy.y,
          vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
          vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_SAPPH_R, g: FLUID_SAPPH_G, b: FLUID_SAPPH_B,
          strength: FLUID_ENEMY_STRENGTH,
        });
      }

      // Missile firing
      enemy.missileTimerMs -= deltaMs;
      if (enemy.missileTimerMs <= 0) {
        spawnMissileFromEnemy(enemy);
        enemy.missileTimerMs = SAPPHIRE_MISSILE_CD_MS + (Math.random() - 0.5) * SAPPHIRE_MISSILE_JITTER;
      }
    }
  }

  function updateSapphireMissiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = sapphireMissiles.length - 1; i >= 0; i--) {
      const m = sapphireMissiles[i];
      if (m.hp <= 0) { sapphireMissiles.splice(i, 1); continue; }

      // Heat-seeking toward player
      const dx = mote.x - m.x, dy = mote.y - m.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.01) {
        const seekDirX = dx / dist, seekDirY = dy / dist;
        m.vx += seekDirX * MISSILE_SEEK_STR;
        m.vy += seekDirY * MISSILE_SEEK_STR;
      }
      // Cap speed
      const speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
      if (speed > MISSILE_MAX_SPEED) {
        m.vx = (m.vx / speed) * MISSILE_MAX_SPEED;
        m.vy = (m.vy / speed) * MISSILE_MAX_SPEED;
      }

      m.x += m.vx * dt; m.y += m.vy * dt;

      // Inject missile motion into fluid every frame — produces the curved
      // heat-seeker trail required by the acceptance criteria.
      fluid.addForce({
        x: m.x, y: m.y,
        vx: m.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: m.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_MISSILE_R, g: FLUID_MISSILE_G, b: FLUID_MISSILE_B,
        strength: FLUID_MISSILE_STRENGTH,
      });

      // Record trail
      m.trailX[m.trailHead] = m.x; m.trailY[m.trailHead] = m.y;
      m.trailHead = (m.trailHead + 1) % MISSILE_TRAIL_CAP;
      if (m.trailCount < MISSILE_TRAIL_CAP) m.trailCount++;

      // Hit player
      if (!m.hasHitPlayer) {
        const pdx = mote.x - m.x, pdy = mote.y - m.y;
        if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          m.hasHitPlayer = true;
          if (playerIFramesMs <= 0) {
            const rawDmg = m.atk - playerStats.def;
            const dmg = Math.max(0, rawDmg);
            if (dmg <= 0) {
              spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
            } else {
              playerStats.hp = Math.max(0, playerStats.hp - dmg);
              const ratio = Math.min(1, dmg / playerStats.maxHp);
              const dirX = m.vx / (speed + SPEED_EPSILON), dirY = m.vy / (speed + SPEED_EPSILON);
              mote.vx += dirX * PLAYER_KNOCKBACK_MAX * ratio;
              mote.vy += dirY * PLAYER_KNOCKBACK_MAX * ratio;
              playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
              spawnDamageNumber(mote.x, mote.y, dirX, dirY, String(Math.round(dmg)), ratio, '#ff6666');
            }
          }
          sapphireMissiles.splice(i, 1);
        }
      }

      // Despawn if far out of bounds
      const margin = 20;
      if (m.x < -margin || m.x > widthPx + margin || m.y < -margin || m.y > heightPx + margin) {
        sapphireMissiles.splice(i, 1);
      }
    }
  }

  function drawSapphireEnemies(): void {
    for (const enemy of sapphireEnemies) {
      // Draw shield circle
      const shieldAlpha = enemy.shieldHp / enemy.maxShieldHp;
      if (enemy.shieldHp > 0) {
        ctx.save();
        ctx.globalAlpha = 0.25 + shieldAlpha * 0.35;
        ctx.shadowBlur  = SAPPHIRE_SHIELD_RADIUS * 2; ctx.shadowColor = SAPPHIRE_ENEMY_GLOW;
        ctx.strokeStyle = SAPPHIRE_ENEMY_GLOW; ctx.lineWidth = 1.5;
        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, SAPPHIRE_SHIELD_RADIUS, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.globalAlpha = shieldAlpha * 0.18;
        ctx.fillStyle = SAPPHIRE_ENEMY_GLOW;
        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, SAPPHIRE_SHIELD_RADIUS, 0, Math.PI * 2); ctx.fill();
        ctx.globalAlpha = 1;
        ctx.restore();
      }
      // HP bar
      const barW = SAPPHIRE_SHIELD_RADIUS * 2;
      const barH = 2;
      const barX = enemy.x - barW / 2;
      const barY = enemy.y + SAPPHIRE_SHIELD_RADIUS + 3;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = SAPPHIRE_ENEMY_COLOR;
      ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), barH);
      // Shield HP bar (below HP bar)
      if (enemy.shieldHp > 0) {
        ctx.fillStyle = '#333'; ctx.fillRect(barX, barY + barH + 1, barW, barH);
        ctx.fillStyle = '#88ccff';
        ctx.fillRect(barX, barY + barH + 1, barW * (enemy.shieldHp / enemy.maxShieldHp), barH);
      }
      ctx.globalAlpha = 1;
      ctx.restore();
      // Enemy body (square)
      const half = SAPPHIRE_ENEMY_SIZE / 2;
      ctx.shadowBlur = SAPPHIRE_ENEMY_SIZE * 5; ctx.shadowColor = SAPPHIRE_ENEMY_GLOW;
      ctx.fillStyle = SAPPHIRE_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), SAPPHIRE_ENEMY_SIZE, SAPPHIRE_ENEMY_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  function drawSapphireMissiles(): void {
    if (sapphireMissiles.length === 0) return;
    ctx.save();
    for (const m of sapphireMissiles) {
      // Draw trail using lineDash style similar to laser attack trail
      if (m.trailCount >= 2) {
        const dashLen = MISSILE_TRAIL_CAP * MISSILE_TRAIL_DASH_RATIO;
        const startIdx = (m.trailHead - m.trailCount + MISSILE_TRAIL_CAP) % MISSILE_TRAIL_CAP;
        const lastIdx  = (m.trailHead - 1 + MISSILE_TRAIL_CAP) % MISSILE_TRAIL_CAP;
        const sx = m.trailX[startIdx], sy = m.trailY[startIdx];
        const ex = m.trailX[lastIdx],  ey = m.trailY[lastIdx];
        ctx.save();
        ctx.setLineDash([dashLen, dashLen]);
        ctx.lineDashOffset = -(dashLen * (1 - m.trailCount / MISSILE_TRAIL_CAP));
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.7; ctx.shadowBlur = 5; ctx.shadowColor = MISSILE_GLOW;
        ctx.strokeStyle = MISSILE_GLOW; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = MISSILE_COLOR; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      // Missile body
      const half = MISSILE_SIZE / 2;
      ctx.globalAlpha = 1;
      ctx.shadowBlur = MISSILE_SIZE * 5; ctx.shadowColor = MISSILE_GLOW;
      ctx.fillStyle = MISSILE_GLOW;
      const gh = half * 2;
      ctx.fillRect(Math.floor(m.x - gh), Math.floor(m.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
      ctx.fillStyle = MISSILE_COLOR;
      ctx.fillRect(Math.floor(m.x - half), Math.floor(m.y - half), MISSILE_SIZE, MISSILE_SIZE);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
  }

  /**
   * Fires the specified weapon at the nearest enemy within range.
   * Handles all WeaponEffect variants. Call removeDeadEnemies() after this.
   */
  function performWeaponAttack(weaponId: string): void {
    const totalTargets = enemies.length + sapphireEnemies.length + sapphireMissiles.length
      + emeraldEnemies.length + amberEnemies.length + amberShards.length + voidEnemies.length
      + quartzEnemies.length + quartzSpikes.length + rubyEnemies.length + rubyBolts.length
      + sunstoneEnemies.length + citrineEnemies.length + citrineBolts.length
      + ioliteEnemies.length + amethystEnemies.length + amethystShards.length
      + diamondEnemies.length + diamondShards.length + nullstoneEnemies.length + voidTendrils.length;
    if (totalTargets === 0) return;
    const weaponDef  = WEAPON_BY_ID.get(weaponId);
    const range      = weaponDef?.stats.range ?? PLAYER_BASE_RANGE_PX;
    const tier       = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const rawDamage  = weaponDef
      ? getScaledWeaponDamage(weaponDef.stats.damage, tier, playerStats.atk)
      : playerStats.atk;
    const effect     = weaponDef?.stats.effect ?? { kind: 'single' as const };
    const shotColor  = '#ffd764';

    // ── Gatling gun ────────────────────────────────────────────
    if (effect.kind === 'gatling') {
      const target = findClosestTarget(range * range);
      if (target) spawnSandProjectile(target.x, target.y, rawDamage);
      return;
    }

    // ── Chain whip ─────────────────────────────────────────────
    if (effect.kind === 'chainWhip') {
      // The chain whip handles its own lash triggering in updateChainWhip().
      return;
    }

    // ── Ruby laser beam ────────────────────────────────────────
    if (effect.kind === 'laserBeam') {
      const target = findClosestTarget(range * range);
      if (target) fireLaserBeam(target.x, target.y, weaponId);
      return;
    }

    if (effect.kind === 'aoe') {
      const aoeRadius = effect.aoeRadius;
      for (const enemy of enemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageEnemy(enemy, rawDamage, 0);
          spawnHitVisuals(enemy, dmg, '#e6c850');
        }
      }
      for (const enemy of sapphireEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageSapphireEnemy(enemy, rawDamage, 0, false);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of emeraldEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageEmeraldEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of amberEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageAmberEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of voidEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageVoidEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of quartzEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageQuartzEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of rubyEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageRubyEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of sunstoneEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageSunstoneEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of citrineEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageCitrineEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of ioliteEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageIoliteEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of amethystEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageAmethystEnemy(enemy, rawDamage, 0, false);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of diamondEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageDiamondEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      for (const enemy of nullstoneEnemies) {
        const dx = enemy.x - mote.x, dy = enemy.y - mote.y;
        if (dx * dx + dy * dy <= aoeRadius * aoeRadius) {
          const dmg = damageNullstoneEnemy(enemy, rawDamage, 0);
          spawnHitVisualsAt(enemy.x, enemy.y, enemy.maxHp, dmg, '#e6c850');
        }
      }
      fluid.addExplosion(mote.x, mote.y, FLUID_EXPLOSION_STRENGTH,
        FLUID_PLAYER_R, FLUID_PLAYER_G, FLUID_PLAYER_B);
      return;
    }

    if (effect.kind === 'multi') {
      type SortEntry = {
        distSq: number;
        laser?: LaserEnemy; sapphire?: SapphireEnemy; missile?: SapphireMissile;
        emerald?: EmeraldEnemy; amber?: AmberEnemy; ambershard?: AmberShard; void?: VoidEnemy;
        quartz?: QuartzEnemy; quartzspike?: QuartzSpike; ruby?: RubyEnemy; rubybolt?: RubyBolt;
        sunstone?: SunstoneEnemy; citrine?: CitrineEnemy; citrinebolt?: CitrineBolt;
        iolite?: IoliteEnemy; amethyst?: AmethystEnemy; amethystshard?: AmethystShard;
        diamond?: DiamondEnemy; diamondshard?: DiamondShard; nullstone?: NullstoneEnemy; voidtendril?: VoidTendril;
      };
      const rangeSq = range * range;
      const inRange: SortEntry[] = [];
      for (const e of enemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, laser: e });
      }
      for (const e of sapphireEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, sapphire: e });
      }
      for (const m of sapphireMissiles) {
        const dx = m.x - mote.x, dy = m.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, missile: m });
      }
      for (const e of emeraldEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, emerald: e });
      }
      for (const e of amberEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, amber: e });
      }
      for (const s of amberShards) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, ambershard: s });
      }
      for (const e of voidEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, void: e });
      }
      for (const e of quartzEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, quartz: e });
      }
      for (const s of quartzSpikes) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, quartzspike: s });
      }
      for (const e of rubyEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, ruby: e });
      }
      for (const b of rubyBolts) {
        const dx = b.x - mote.x, dy = b.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, rubybolt: b });
      }
      for (const e of sunstoneEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, sunstone: e });
      }
      for (const e of citrineEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, citrine: e });
      }
      for (const b of citrineBolts) {
        const dx = b.x - mote.x, dy = b.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, citrinebolt: b });
      }
      for (const e of ioliteEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, iolite: e });
      }
      for (const e of amethystEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, amethyst: e });
      }
      for (const s of amethystShards) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, amethystshard: s });
      }
      for (const e of diamondEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, diamond: e });
      }
      for (const s of diamondShards) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, diamondshard: s });
      }
      for (const e of nullstoneEnemies) {
        const dx = e.x - mote.x, dy = e.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, nullstone: e });
      }
      for (const t of voidTendrils) {
        const dx = t.x - mote.x, dy = t.y - mote.y;
        const d = dx * dx + dy * dy;
        if (d <= rangeSq) inRange.push({ distSq: d, voidtendril: t });
      }
      inRange.sort((a, b) => a.distSq - b.distSq);
      const targets = inRange.slice(0, effect.targetCount);
      for (const t of targets) {
        if (t.laser) {
          const dmg = damageEnemy(t.laser, rawDamage, 0);
          spawnHitVisuals(t.laser, dmg, '#50b464');
        } else if (t.sapphire) {
          const dmg = damageSapphireEnemy(t.sapphire, rawDamage, 0, false);
          spawnHitVisualsAt(t.sapphire.x, t.sapphire.y, t.sapphire.maxHp, dmg, '#50b464');
        } else if (t.missile) {
          damageMissile(t.missile, rawDamage);
        } else if (t.emerald) {
          const dmg = damageEmeraldEnemy(t.emerald, rawDamage, 0);
          spawnHitVisualsAt(t.emerald.x, t.emerald.y, t.emerald.maxHp, dmg, '#50b464');
        } else if (t.amber) {
          const dmg = damageAmberEnemy(t.amber, rawDamage, 0);
          spawnHitVisualsAt(t.amber.x, t.amber.y, t.amber.maxHp, dmg, '#50b464');
        } else if (t.ambershard) {
          damageAmberShard(t.ambershard, rawDamage);
        } else if (t.void) {
          const dmg = damageVoidEnemy(t.void, rawDamage, 0);
          spawnHitVisualsAt(t.void.x, t.void.y, t.void.maxHp, dmg, '#50b464');
        } else if (t.quartz) {
          const dmg = damageQuartzEnemy(t.quartz, rawDamage, 0);
          spawnHitVisualsAt(t.quartz.x, t.quartz.y, t.quartz.maxHp, dmg, '#50b464');
        } else if (t.quartzspike) {
          damageQuartzSpike(t.quartzspike, rawDamage);
        } else if (t.ruby) {
          const dmg = damageRubyEnemy(t.ruby, rawDamage, 0);
          spawnHitVisualsAt(t.ruby.x, t.ruby.y, t.ruby.maxHp, dmg, '#50b464');
        } else if (t.rubybolt) {
          damageRubyBolt(t.rubybolt, rawDamage);
        } else if (t.sunstone) {
          const dmg = damageSunstoneEnemy(t.sunstone, rawDamage, 0);
          spawnHitVisualsAt(t.sunstone.x, t.sunstone.y, t.sunstone.maxHp, dmg, '#50b464');
        } else if (t.citrine) {
          const dmg = damageCitrineEnemy(t.citrine, rawDamage, 0);
          spawnHitVisualsAt(t.citrine.x, t.citrine.y, t.citrine.maxHp, dmg, '#50b464');
        } else if (t.citrinebolt) {
          damageCitrineBolt(t.citrinebolt, rawDamage);
        } else if (t.iolite) {
          const dmg = damageIoliteEnemy(t.iolite, rawDamage, 0);
          spawnHitVisualsAt(t.iolite.x, t.iolite.y, t.iolite.maxHp, dmg, '#50b464');
        } else if (t.amethyst) {
          const dmg = damageAmethystEnemy(t.amethyst, rawDamage, 0, false);
          spawnHitVisualsAt(t.amethyst.x, t.amethyst.y, t.amethyst.maxHp, dmg, '#50b464');
        } else if (t.amethystshard) {
          damageAmethystShard(t.amethystshard, rawDamage);
        } else if (t.diamond) {
          const dmg = damageDiamondEnemy(t.diamond, rawDamage, 0);
          spawnHitVisualsAt(t.diamond.x, t.diamond.y, t.diamond.maxHp, dmg, '#50b464');
        } else if (t.diamondshard) {
          damageDiamondShard(t.diamondshard, rawDamage);
        } else if (t.nullstone) {
          const dmg = damageNullstoneEnemy(t.nullstone, rawDamage, 0);
          spawnHitVisualsAt(t.nullstone.x, t.nullstone.y, t.nullstone.maxHp, dmg, '#50b464');
        } else if (t.voidtendril) {
          damageVoidTendril(t.voidtendril, rawDamage);
        }
      }
      return;
    }

    // single / piercing
    const defPierceRatio = effect.kind === 'piercing' ? effect.defPierceRatio : 0;
    const closestT = findClosestTarget(range * range);
    if (!closestT) return;
    if (closestT.laser) {
      const dmg = damageEnemy(closestT.laser, rawDamage, defPierceRatio);
      spawnHitVisuals(closestT.laser, dmg, effect.kind === 'piercing' ? '#74c0fc' : shotColor);
    } else if (closestT.sapphire) {
      const dmg = damageSapphireEnemy(closestT.sapphire, rawDamage, defPierceRatio, false);
      spawnHitVisualsAt(closestT.sapphire.x, closestT.sapphire.y, closestT.sapphire.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : SAPPHIRE_ENEMY_GLOW);
    } else if (closestT.missile) {
      damageMissile(closestT.missile, rawDamage);
    } else if (closestT.emerald) {
      const dmg = damageEmeraldEnemy(closestT.emerald, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.emerald.x, closestT.emerald.y, closestT.emerald.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : EMERALD_ENEMY_GLOW);
    } else if (closestT.amber) {
      const dmg = damageAmberEnemy(closestT.amber, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.amber.x, closestT.amber.y, closestT.amber.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : AMBER_ENEMY_GLOW);
    } else if (closestT.ambershard) {
      damageAmberShard(closestT.ambershard, rawDamage);
    } else if (closestT.void) {
      const dmg = damageVoidEnemy(closestT.void, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.void.x, closestT.void.y, closestT.void.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : VOID_ENEMY_GLOW);
    } else if (closestT.quartz) {
      const dmg = damageQuartzEnemy(closestT.quartz, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.quartz.x, closestT.quartz.y, closestT.quartz.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : QUARTZ_ENEMY_GLOW);
    } else if (closestT.quartzspike) {
      damageQuartzSpike(closestT.quartzspike, rawDamage);
    } else if (closestT.ruby) {
      const dmg = damageRubyEnemy(closestT.ruby, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.ruby.x, closestT.ruby.y, closestT.ruby.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : RUBY_ENEMY_GLOW);
    } else if (closestT.rubybolt) {
      damageRubyBolt(closestT.rubybolt, rawDamage);
    } else if (closestT.sunstone) {
      const dmg = damageSunstoneEnemy(closestT.sunstone, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.sunstone.x, closestT.sunstone.y, closestT.sunstone.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : SUNSTONE_ENEMY_GLOW);
    } else if (closestT.citrine) {
      const dmg = damageCitrineEnemy(closestT.citrine, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.citrine.x, closestT.citrine.y, closestT.citrine.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : CITRINE_ENEMY_GLOW);
    } else if (closestT.citrinebolt) {
      damageCitrineBolt(closestT.citrinebolt, rawDamage);
    } else if (closestT.iolite) {
      const dmg = damageIoliteEnemy(closestT.iolite, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.iolite.x, closestT.iolite.y, closestT.iolite.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : IOLITE_ENEMY_GLOW);
    } else if (closestT.amethyst) {
      const dmg = damageAmethystEnemy(closestT.amethyst, rawDamage, defPierceRatio, false);
      spawnHitVisualsAt(closestT.amethyst.x, closestT.amethyst.y, closestT.amethyst.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : AMETHYST_ENEMY_GLOW);
    } else if (closestT.amethystshard) {
      damageAmethystShard(closestT.amethystshard, rawDamage);
    } else if (closestT.diamond) {
      const dmg = damageDiamondEnemy(closestT.diamond, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.diamond.x, closestT.diamond.y, closestT.diamond.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : DIAMOND_ENEMY_GLOW);
    } else if (closestT.diamondshard) {
      damageDiamondShard(closestT.diamondshard, rawDamage);
    } else if (closestT.nullstone) {
      const dmg = damageNullstoneEnemy(closestT.nullstone, rawDamage, defPierceRatio);
      spawnHitVisualsAt(closestT.nullstone.x, closestT.nullstone.y, closestT.nullstone.maxHp, dmg,
        effect.kind === 'piercing' ? '#74c0fc' : NULLSTONE_ENEMY_GLOW);
    } else if (closestT.voidtendril) {
      damageVoidTendril(closestT.voidtendril, rawDamage);
    }
  }

  /** Removes any enemies whose HP has reached zero or below, awarding XP for each. */
  function removeDeadEnemies(): void {
    let totalXpFromKills = 0;
    for (let i = enemies.length - 1; i >= 0; i--) {
      if (enemies[i].hp <= 0) {
        fluid.addExplosion(
          enemies[i].x, enemies[i].y,
          FLUID_EXPLOSION_STRENGTH,
          FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B,
        );
        totalXpFromKills += getXpPerKill(currentWave);
        enemies.splice(i, 1);
      }
    }
    for (let i = sapphireEnemies.length - 1; i >= 0; i--) {
      if (sapphireEnemies[i].hp <= 0) {
        fluid.addExplosion(
          sapphireEnemies[i].x, sapphireEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.4,
          FLUID_SAPPH_R, FLUID_SAPPH_G, FLUID_SAPPH_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 3;
        sapphireEnemies.splice(i, 1);
      }
    }
    for (let i = sapphireMissiles.length - 1; i >= 0; i--) {
      if (sapphireMissiles[i].hp <= 0) {
        fluid.addExplosion(
          sapphireMissiles[i].x, sapphireMissiles[i].y,
          FLUID_EXPLOSION_STRENGTH * 0.6,
          FLUID_MISSILE_R, FLUID_MISSILE_G, FLUID_MISSILE_B,
        );
        sapphireMissiles.splice(i, 1);
      }
    }
    for (let i = emeraldEnemies.length - 1; i >= 0; i--) {
      if (emeraldEnemies[i].hp <= 0) {
        fluid.addExplosion(
          emeraldEnemies[i].x, emeraldEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.1,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 2;
        emeraldEnemies.splice(i, 1);
      }
    }
    for (let i = amberEnemies.length - 1; i >= 0; i--) {
      if (amberEnemies[i].hp <= 0) {
        fluid.addExplosion(
          amberEnemies[i].x, amberEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.5,
          FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 4;
        amberEnemies.splice(i, 1);
      }
    }
    for (let i = amberShards.length - 1; i >= 0; i--) {
      if (amberShards[i].hp <= 0) {
        fluid.addExplosion(
          amberShards[i].x, amberShards[i].y,
          FLUID_EXPLOSION_STRENGTH * 0.5,
          FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B,
        );
        amberShards.splice(i, 1);
      }
    }
    for (let i = voidEnemies.length - 1; i >= 0; i--) {
      if (voidEnemies[i].hp <= 0) {
        fluid.addExplosion(
          voidEnemies[i].x, voidEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 2.0,
          FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 6;
        voidEnemies.splice(i, 1);
      }
    }
    for (let i = quartzEnemies.length - 1; i >= 0; i--) {
      if (quartzEnemies[i].hp <= 0) {
        fluid.addExplosion(
          quartzEnemies[i].x, quartzEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH,
          FLUID_QUARTZ_R, FLUID_QUARTZ_G, FLUID_QUARTZ_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 1.5;
        quartzEnemies.splice(i, 1);
      }
    }
    for (let i = quartzSpikes.length - 1; i >= 0; i--) {
      if (quartzSpikes[i].hp <= 0 || quartzSpikes[i].lifeMs <= 0) quartzSpikes.splice(i, 1);
    }
    for (let i = rubyEnemies.length - 1; i >= 0; i--) {
      if (rubyEnemies[i].hp <= 0) {
        fluid.addExplosion(
          rubyEnemies[i].x, rubyEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.2,
          FLUID_RUBY_R, FLUID_RUBY_G, FLUID_RUBY_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 2.5;
        rubyEnemies.splice(i, 1);
      }
    }
    for (let i = rubyBolts.length - 1; i >= 0; i--) {
      if (rubyBolts[i].hp <= 0 || rubyBolts[i].lifeMs <= 0) rubyBolts.splice(i, 1);
    }
    for (let i = sunstoneEnemies.length - 1; i >= 0; i--) {
      if (sunstoneEnemies[i].hp <= 0) {
        fluid.addExplosion(
          sunstoneEnemies[i].x, sunstoneEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.6,
          FLUID_SUNSTONE_R, FLUID_SUNSTONE_G, FLUID_SUNSTONE_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 3;
        sunstoneEnemies.splice(i, 1);
      }
    }
    for (let i = citrineEnemies.length - 1; i >= 0; i--) {
      if (citrineEnemies[i].hp <= 0) {
        fluid.addExplosion(
          citrineEnemies[i].x, citrineEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 1.8,
          FLUID_CITRINE_R, FLUID_CITRINE_G, FLUID_CITRINE_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 3.5;
        citrineEnemies.splice(i, 1);
      }
    }
    for (let i = citrineBolts.length - 1; i >= 0; i--) {
      if (citrineBolts[i].hp <= 0) citrineBolts.splice(i, 1);
    }
    for (let i = ioliteEnemies.length - 1; i >= 0; i--) {
      if (ioliteEnemies[i].hp <= 0) {
        fluid.addExplosion(
          ioliteEnemies[i].x, ioliteEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 2.2,
          FLUID_IOLITE_R, FLUID_IOLITE_G, FLUID_IOLITE_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 5;
        ioliteEnemies.splice(i, 1);
      }
    }
    for (let i = amethystEnemies.length - 1; i >= 0; i--) {
      if (amethystEnemies[i].hp <= 0) {
        fluid.addExplosion(
          amethystEnemies[i].x, amethystEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 2.5,
          FLUID_AMETHYST_R, FLUID_AMETHYST_G, FLUID_AMETHYST_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 6;
        amethystEnemies.splice(i, 1);
      }
    }
    for (let i = amethystShards.length - 1; i >= 0; i--) {
      if (amethystShards[i].hp <= 0 || amethystShards[i].lifeMs <= 0) amethystShards.splice(i, 1);
    }
    for (let i = diamondEnemies.length - 1; i >= 0; i--) {
      if (diamondEnemies[i].hp <= 0) {
        fluid.addExplosion(
          diamondEnemies[i].x, diamondEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 3.0,
          FLUID_DIAMOND_R, FLUID_DIAMOND_G, FLUID_DIAMOND_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 8;
        diamondEnemies.splice(i, 1);
      }
    }
    for (let i = diamondShards.length - 1; i >= 0; i--) {
      if (diamondShards[i].hp <= 0 || diamondShards[i].lifeMs <= 0) diamondShards.splice(i, 1);
    }
    for (let i = nullstoneEnemies.length - 1; i >= 0; i--) {
      if (nullstoneEnemies[i].hp <= 0) {
        fluid.addExplosion(
          nullstoneEnemies[i].x, nullstoneEnemies[i].y,
          FLUID_EXPLOSION_STRENGTH * 4.0,
          FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B,
        );
        totalXpFromKills += getXpPerKill(currentWave) * 10;
        nullstoneEnemies.splice(i, 1);
      }
    }
    for (let i = voidTendrils.length - 1; i >= 0; i--) {
      if (voidTendrils[i].hp <= 0 || voidTendrils[i].lifeMs <= 0) voidTendrils.splice(i, 1);
    }
    if (totalXpFromKills > 0) {
      rpgSimState.xp += totalXpFromKills;
      applyEquipmentStats();
    }
  }

  /** Advances hit-flash and shot-line timers, pruning expired entries. */
  function updateShotVisuals(deltaMs: number): void {
    for (let i = hitEffects.length - 1; i >= 0; i--) {
      hitEffects[i].timerMs -= deltaMs;
      if (hitEffects[i].timerMs <= 0) hitEffects.splice(i, 1);
    }
    for (let i = shotLines.length - 1; i >= 0; i--) {
      shotLines[i].timerMs -= deltaMs;
      if (shotLines[i].timerMs <= 0) shotLines.splice(i, 1);
    }
  }

  /** Advances damage-number positions (decelerating velocity) and iframes timer. */
  function updateDamageNumbers(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const decelFactor = Math.pow(DAMAGE_NUM_DECEL, dt);
    for (let i = damageNumbers.length - 1; i >= 0; i--) {
      const dn = damageNumbers[i];
      dn.timerMs -= deltaMs;
      if (dn.timerMs <= 0) { damageNumbers.splice(i, 1); continue; }
      dn.x += dn.vx * dt;
      dn.y += dn.vy * dt;
      dn.vx *= decelFactor;
      dn.vy *= decelFactor;
    }
    if (playerIFramesMs > 0) playerIFramesMs = Math.max(0, playerIFramesMs - deltaMs);
  }

  const statsPanel = document.createElement('div');
  statsPanel.id = 'rpg-stats-panel';
  statsPanel.style.display = 'none';

  function makeStatWidget(label: string, extraClass: string): { root: HTMLElement; labelEl: HTMLSpanElement; valueEl: HTMLSpanElement } {
    const root = document.createElement('div');
    root.className = 'rpg-stat';
    const labelEl = document.createElement('span');
    labelEl.className = 'rpg-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'rpg-stat-value' + (extraClass ? (' ' + extraClass) : '');
    root.appendChild(labelEl);
    root.appendChild(valueEl);
    statsPanel.appendChild(root);
    return { root, labelEl, valueEl };
  }

  const hpWidget      = makeStatWidget('HP',     'rpg-stat-value--hp');
  const atkWidget     = makeStatWidget('ATK',    '');
  const defWidget     = makeStatWidget('DEF',    '');
  const waveWidget    = makeStatWidget('WAVE',   'rpg-stat-value--wave');
  const boostWidget   = makeStatWidget('BOOST',  'rpg-stat-value--boost');
  const xpWidget      = makeStatWidget('XP',     'rpg-stat-value--xp');
  const weaponWidget  = makeStatWidget('WEAPON', 'rpg-stat-value--weapon');

  function updateStatsPanelDom(): void {
    hpWidget.valueEl.textContent   = Math.max(0, Math.ceil(playerStats.hp)) + ' / ' + playerStats.maxHp;
    atkWidget.valueEl.textContent  = String(playerStats.atk);
    defWidget.valueEl.textContent  = String(playerStats.def);
    const isBossWave = currentWave > 0 && currentWave % 100 === 0;
    waveWidget.labelEl.textContent = isBossWave ? BOSS_GLYPH_LABEL : 'WAVE';
    if (isBossWave) {
      waveWidget.labelEl.style.fontFamily = 'monospace';
    } else {
      waveWidget.labelEl.style.removeProperty('fontFamily');
    }
    waveWidget.valueEl.textContent = isBossWave ? String(currentWave / 100) : String(currentWave);
    boostWidget.valueEl.textContent = rpgSimState.highestWaveReached > 0
      ? '+' + Math.pow(rpgSimState.highestWaveReached, 1.2).toFixed(1) + '%'
      : '+0.0%';
    xpWidget.valueEl.textContent   = formatXp(rpgSimState.xp);

    const equippedIds = Array.from(rpgSimState.equippedWeaponIds);
    if (equippedIds.length > 0) {
      const labels = equippedIds.map(id => {
        const wd = WEAPON_BY_ID.get(id);
        const tier = rpgSimState.weaponTiersByWeaponId.get(id) ?? 1;
        return wd ? `${wd.name} T${tier}` : id;
      });
      weaponWidget.valueEl.textContent = labels.join(', ');
      const firstDef = WEAPON_BY_ID.get(equippedIds[0]);
      const tierDef = firstDef ? TIER_BY_ID.get(firstDef.costTierId) : undefined;
      weaponWidget.valueEl.style.color = tierDef?.color ?? '#c9a84c';
    } else {
      weaponWidget.valueEl.textContent = 'None';
      weaponWidget.valueEl.style.color = '';
    }
  }
  updateStatsPanelDom();

  function toCanvasCoords(clientX: number, clientY: number): { x: number; y: number } {
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width  > 0 ? widthPx  / rect.width  : 1;
    const scaleY = rect.height > 0 ? heightPx / rect.height : 1;
    return { x: (clientX - rect.left) * scaleX, y: (clientY - rect.top) * scaleY };
  }

  canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    e.preventDefault(); e.stopPropagation();
    canvas.setPointerCapture(e.pointerId);
    const pos = toCanvasCoords(e.clientX, e.clientY);
    joystick.isActive = true; joystick.pointerId = e.pointerId;
    joystick.baseX = pos.x; joystick.baseY = pos.y;
    joystick.thumbX = pos.x; joystick.thumbY = pos.y;
  }, { passive: false });

  canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!joystick.isActive || e.pointerId !== joystick.pointerId) return;
    e.preventDefault();
    const pos = toCanvasCoords(e.clientX, e.clientY);
    const dx = pos.x - joystick.baseX;
    const dy = pos.y - joystick.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > JOYSTICK_OUTER_RADIUS) {
      joystick.thumbX = joystick.baseX + (dx / dist) * JOYSTICK_OUTER_RADIUS;
      joystick.thumbY = joystick.baseY + (dy / dist) * JOYSTICK_OUTER_RADIUS;
    } else {
      joystick.thumbX = pos.x; joystick.thumbY = pos.y;
    }
  }, { passive: false });

  function endJoystick(pointerId: number): void {
    if (pointerId !== joystick.pointerId) return;
    joystick.isActive = false; joystick.pointerId = -1;
  }
  canvas.addEventListener('pointerup',     (e: PointerEvent) => endJoystick(e.pointerId));
  canvas.addEventListener('pointercancel', (e: PointerEvent) => endJoystick(e.pointerId));

  function handleKeyDown(e: KeyboardEvent): void {
    if (!_isActive) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA':  keys.left  = true; break;
      case 'ArrowRight': case 'KeyD': keys.right = true; break;
      case 'ArrowUp': case 'KeyW':    keys.up    = true; break;
      case 'ArrowDown': case 'KeyS':  keys.down  = true; break;
      default: return;
    }
    if (e.code.startsWith('Arrow')) e.preventDefault();
  }
  function handleKeyUp(e: KeyboardEvent): void {
    if (!_isActive) return;
    switch (e.code) {
      case 'ArrowLeft': case 'KeyA':  keys.left  = false; break;
      case 'ArrowRight': case 'KeyD': keys.right = false; break;
      case 'ArrowUp': case 'KeyW':    keys.up    = false; break;
      case 'ArrowDown': case 'KeyS':  keys.down  = false; break;
    }
  }
  document.addEventListener('keydown', handleKeyDown);
  document.addEventListener('keyup',   handleKeyUp);

  /** Keeps an enemy within the arena, bouncing velocity. Uses a fixed margin of 2.5px. */
  function clampEnemyToBounds(enemy: { x: number; y: number; vx: number; vy: number }): void {
    const half = 2.5; // Conservative margin that works for all enemy sizes
    if (enemy.x < half)            { enemy.x = half;            enemy.vx =  Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > widthPx  - half) { enemy.x = widthPx  - half; enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)            { enemy.y = half;            enemy.vy =  Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > heightPx - half) { enemy.y = heightPx - half; enemy.vy = -Math.abs(enemy.vy) * 0.5; }
  }

  function spawnEnemyById(enemyTypeId: string): void {
    const minDist = 80;
    let spawnX = 0, spawnY = 0, attempts = 0;
    const wn = currentWave;
    if (enemyTypeId === 'laser') {
      const half = LASER_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - LASER_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - LASER_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      enemies.push(makeLaserEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'sapphire') {
      const half = SAPPHIRE_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - SAPPHIRE_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - SAPPHIRE_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      sapphireEnemies.push(makeSapphireEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'emerald') {
      const half = EMERALD_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - EMERALD_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - EMERALD_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      emeraldEnemies.push(makeEmeraldEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'amber') {
      const half = AMBER_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - AMBER_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - AMBER_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      amberEnemies.push(makeAmberEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'void') {
      // Void enemies spawn at edges so they approach from a distance.
      const edge = Math.floor(Math.random() * 4);
      if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
      else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
      else if (edge === 2) { spawnX = 0;        spawnY = Math.random() * heightPx; }
      else                 { spawnX = widthPx;  spawnY = Math.random() * heightPx; }
      voidEnemies.push(makeVoidEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'quartz') {
      const half = QUARTZ_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - QUARTZ_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - QUARTZ_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      quartzEnemies.push(makeQuartzEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'ruby') {
      const half = RUBY_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - RUBY_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - RUBY_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      rubyEnemies.push(makeRubyEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'sunstone') {
      const half = SUNSTONE_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - SUNSTONE_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - SUNSTONE_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      sunstoneEnemies.push(makeSunstoneEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'citrine') {
      const half = CITRINE_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - CITRINE_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - CITRINE_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      citrineEnemies.push(makeCitrineEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'iolite') {
      const half = IOLITE_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - IOLITE_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - IOLITE_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      ioliteEnemies.push(makeIoliteEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'amethyst') {
      const half = AMETHYST_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - AMETHYST_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - AMETHYST_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      amethystEnemies.push(makeAmethystEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'diamond') {
      const half = DIAMOND_ENEMY_SIZE / 2;
      do {
        spawnX = half + Math.random() * (widthPx  - DIAMOND_ENEMY_SIZE);
        spawnY = half + Math.random() * (heightPx - DIAMOND_ENEMY_SIZE);
        const dx = spawnX - mote.x; const dy = spawnY - mote.y;
        if (dx * dx + dy * dy >= minDist * minDist) break;
        attempts++;
      } while (attempts < 20);
      diamondEnemies.push(makeDiamondEnemy(spawnX, spawnY, wn));
    } else if (enemyTypeId === 'nullstone') {
      // Nullstone spawns at edges to approach from a distance.
      const edge = Math.floor(Math.random() * 4);
      if      (edge === 0) { spawnX = Math.random() * widthPx;  spawnY = 0; }
      else if (edge === 1) { spawnX = Math.random() * widthPx;  spawnY = heightPx; }
      else if (edge === 2) { spawnX = 0;       spawnY = Math.random() * heightPx; }
      else                 { spawnX = widthPx; spawnY = Math.random() * heightPx; }
      nullstoneEnemies.push(makeNullstoneEnemy(spawnX, spawnY, wn));
    }
  }

  function startNextWave(): void {
    currentWave += 1;
    if (currentWave > rpgSimState.highestWaveReached) {
      rpgSimState.highestWaveReached = currentWave;
    }
    const waveDef = getWaveDefinition(currentWave);
    spawnQueue.length = 0;
    for (const spawn of waveDef.spawns) {
      for (let i = 0; i < spawn.count; i++) {
        spawnQueue.push({ enemyTypeId: spawn.enemyTypeId, timerMs: spawn.spawnDelay * i });
      }
    }
    isInterWave = false;
  }

  function checkWaveCompletion(): void {
    if (isInterWave || spawnQueue.length > 0
        || enemies.length > 0 || sapphireEnemies.length > 0
        || emeraldEnemies.length > 0 || amberEnemies.length > 0 || voidEnemies.length > 0
        || quartzEnemies.length > 0 || rubyEnemies.length > 0 || sunstoneEnemies.length > 0
        || citrineEnemies.length > 0 || ioliteEnemies.length > 0 || amethystEnemies.length > 0
        || diamondEnemies.length > 0 || nullstoneEnemies.length > 0) return;
    isInterWave = true;
    interWaveTimerMs = INTER_WAVE_DELAY_MS;
  }

  function tickSpawnQueue(deltaMs: number): void {
    if (isInterWave) return;
    for (let i = spawnQueue.length - 1; i >= 0; i--) {
      spawnQueue[i].timerMs -= deltaMs;
      if (spawnQueue[i].timerMs <= 0) {
        spawnEnemyById(spawnQueue[i].enemyTypeId);
        spawnQueue.splice(i, 1);
      }
    }
  }

  function updateEnemyIdle(enemy: LaserEnemy, dt: number, deltaMs: number): void {
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * LASER_PATROL_SPEED_MAX;
      enemy.vy = Math.sin(angle) * LASER_PATROL_SPEED_MAX;
      enemy.patrolTimerMs = LASER_PATROL_TURN_MS * (PATROL_TURN_DELAY_MIN_FACTOR + Math.random() * PATROL_TURN_DELAY_RANGE_FACTOR);
    }
    const dampFactor = Math.pow(LASER_PATROL_DAMPING, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    clampEnemyToBounds(enemy);
    const dx = mote.x - enemy.x; const dy = mote.y - enemy.y;
    if (dx * dx + dy * dy < LASER_ATTACK_RADIUS * LASER_ATTACK_RADIUS) {
      enemy.lockedTargetX = mote.x; enemy.lockedTargetY = mote.y;
      enemy.phase = 'decelerate'; enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyDecelerate(enemy: LaserEnemy, dt: number, deltaMs: number): void {
    enemy.phaseElapsedMs += deltaMs;
    const dampFactor = Math.pow(LASER_DECEL_FACTOR, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    clampEnemyToBounds(enemy);
    if (enemy.phaseElapsedMs >= LASER_DECEL_DURATION_MS) {
      enemy.vx = 0; enemy.vy = 0;
      const dx = enemy.lockedTargetX - enemy.x; const dy = enemy.lockedTargetY - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.1) { enemy.dashDirX = dx / dist; enemy.dashDirY = dy / dist; }
      else { const a = Math.random() * Math.PI * 2; enemy.dashDirX = Math.cos(a); enemy.dashDirY = Math.sin(a); }
      enemy.dashTraveled = 0; enemy.hasHitPlayer = false;
      enemy.phase = 'dash'; enemy.phaseElapsedMs = 0;
      enemy.attackTrail = {
        active: true,
        startX: enemy.x, startY: enemy.y,
        endX: enemy.x + enemy.dashDirX * LASER_DASH_DISTANCE,
        endY: enemy.y + enemy.dashDirY * LASER_DASH_DISTANCE,
        controlAngle: (Math.random() - 0.5) * ATTACK_TRAIL_CURVE_VARIATION,
        trailStartMs: performance.now(), trailEndMs: Infinity,
      };
    }
  }

  function updateEnemyDash(enemy: LaserEnemy, dt: number, nowMs: number): void {
    const stepDist = LASER_DASH_SPEED * dt;
    enemy.x += enemy.dashDirX * stepDist; enemy.y += enemy.dashDirY * stepDist;
    enemy.dashTraveled += stepDist;
    clampEnemyToBounds(enemy);
    if (!enemy.hasHitPlayer) {
      const dx = enemy.x - mote.x; const dy = enemy.y - mote.y;
      if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        enemy.hasHitPlayer = true;
        if (playerIFramesMs <= 0) {
          const rawDmg = enemy.atk - playerStats.def;
          const dmg = Math.max(0, rawDmg);
          if (dmg <= 0) {
            // DEF fully absorbed the hit — show "BLOCKED", no HP loss.
            spawnDamageNumber(mote.x, mote.y, enemy.dashDirX, enemy.dashDirY, 'BLOCKED', 0.25, '#74c0fc');
          } else {
            playerStats.hp = Math.max(0, playerStats.hp - dmg);
            const ratio = Math.min(1, dmg / playerStats.maxHp);
            // Knockback: push player in the direction the attack came from.
            mote.vx += enemy.dashDirX * PLAYER_KNOCKBACK_MAX * ratio;
            mote.vy += enemy.dashDirY * PLAYER_KNOCKBACK_MAX * ratio;
            // Invincibility frames scale with relative damage.
            playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
            // Damage number floats in attack direction (opposite side from attacker).
            spawnDamageNumber(mote.x, mote.y, enemy.dashDirX, enemy.dashDirY,
              String(Math.round(dmg)), ratio, '#ff6666');
          }
        }
      }
    }
    if (enemy.dashTraveled >= LASER_DASH_DISTANCE) {
      enemy.attackTrail.trailEndMs = nowMs;
      enemy.vx = enemy.dashDirX * LASER_DASH_SPEED;
      enemy.vy = enemy.dashDirY * LASER_DASH_SPEED;
      enemy.phase = 'overshoot'; enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyOvershoot(enemy: LaserEnemy, dt: number): void {
    const dampFactor = Math.pow(LASER_OVERSHOOT_DAMPING, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    clampEnemyToBounds(enemy);
    if (Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy) < LASER_OVERSHOOT_STOP) {
      enemy.vx = 0; enemy.vy = 0;
      enemy.phase = 'cooldown'; enemy.phaseElapsedMs = 0;
    }
  }

  function updateEnemyCooldown(enemy: LaserEnemy, deltaMs: number): void {
    enemy.phaseElapsedMs += deltaMs;
    if (enemy.phaseElapsedMs >= LASER_COOLDOWN_MS) { enemy.phase = 'idle'; enemy.phaseElapsedMs = 0; }
  }

  function updateEnemies(deltaMs: number, nowMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of enemies) {
      switch (enemy.phase) {
        case 'idle':       updateEnemyIdle(enemy, dt, deltaMs);       break;
        case 'decelerate': updateEnemyDecelerate(enemy, dt, deltaMs); break;
        case 'dash':       updateEnemyDash(enemy, dt, nowMs);         break;
        case 'overshoot':  updateEnemyOvershoot(enemy, dt);           break;
        case 'cooldown':   updateEnemyCooldown(enemy, deltaMs);       break;
      }
      // Inject laser-enemy movement into fluid.
      const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (espd > 0.05) {
        fluid.addForce({
          x: enemy.x, y: enemy.y,
          vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
          vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_LASER_R, g: FLUID_LASER_G, b: FLUID_LASER_B,
          strength: FLUID_ENEMY_STRENGTH,
        });
      }
    }
  }

  /** Flag set at the start of each update() call; drives auto-move logic. */
  let _autoMoveEnabled = false;

  function updatePhysics(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const speedMul = getRpgSpeedMultiplier(rpgSimState);
    const effectiveMaxSpeed = MAX_RPG_SPEED * speedMul;

    if (joystick.isActive) {
      const dx = joystick.thumbX - joystick.baseX;
      const dy = joystick.thumbY - joystick.baseY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > AUTO_MOVE_JOYSTICK_DEAD_ZONE) {
        // Manual joystick input overrides auto-move.
        const speed = (dist / JOYSTICK_OUTER_RADIUS) * effectiveMaxSpeed;
        mote.vx = (dx / dist) * speed;
        mote.vy = (dy / dist) * speed;
      } else {
        mote.vx *= RPG_VELOCITY_DAMPING;
        mote.vy *= RPG_VELOCITY_DAMPING;
      }
    } else {
      const dirX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
      const dirY = (keys.down  ? 1 : 0) - (keys.up   ? 1 : 0);
      const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
      const hasKeyInput = dirLen > 0;
      if (hasKeyInput) {
        // Keyboard input also overrides auto-move while held.
        mote.vx = (dirX / dirLen) * effectiveMaxSpeed;
        mote.vy = (dirY / dirLen) * effectiveMaxSpeed;
      } else if (_autoMoveEnabled && (enemies.length > 0 || sapphireEnemies.length > 0
          || emeraldEnemies.length > 0 || amberEnemies.length > 0 || voidEnemies.length > 0
          || quartzEnemies.length > 0 || rubyEnemies.length > 0 || sunstoneEnemies.length > 0
          || citrineEnemies.length > 0 || ioliteEnemies.length > 0 || amethystEnemies.length > 0
          || diamondEnemies.length > 0 || nullstoneEnemies.length > 0)) {
        // Auto-move: find nearest enemy and steer toward it, stopping when
        // the player is within the shortest range of any equipped weapon.
        let autoMoveStopRange = PLAYER_BASE_RANGE_PX;
        let hasWeapon = false;
        for (const weaponId of rpgSimState.equippedWeaponIds) {
          const wd = WEAPON_BY_ID.get(weaponId);
          if (wd) {
            autoMoveStopRange = hasWeapon ? Math.min(autoMoveStopRange, wd.stats.range) : wd.stats.range;
            hasWeapon = true;
          }
        }

        let nearestDistSq = Infinity;
        let nearestX = 0, nearestY = 0;
        for (const enemy of enemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of sapphireEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of emeraldEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of amberEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of voidEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of quartzEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of rubyEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of sunstoneEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of citrineEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of ioliteEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of amethystEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of diamondEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        for (const enemy of nullstoneEnemies) {
          const ex = enemy.x - mote.x, ey = enemy.y - mote.y;
          const d = ex * ex + ey * ey;
          if (d < nearestDistSq) { nearestDistSq = d; nearestX = enemy.x; nearestY = enemy.y; }
        }
        if (nearestDistSq < Infinity) {
          const ex = nearestX - mote.x, ey = nearestY - mote.y;
          const d = Math.sqrt(ex * ex + ey * ey);
          if (d > autoMoveStopRange) {
            mote.vx = (ex / d) * effectiveMaxSpeed;
            mote.vy = (ey / d) * effectiveMaxSpeed;
          } else {
            mote.vx *= RPG_VELOCITY_DAMPING;
            mote.vy *= RPG_VELOCITY_DAMPING;
          }
        }
      } else {
        mote.vx *= RPG_VELOCITY_DAMPING;
        mote.vy *= RPG_VELOCITY_DAMPING;
      }
    }

    mote.x += mote.vx * dt; mote.y += mote.vy * dt;
    const half = RPG_MOTE_SIZE / 2;
    if (mote.x < half)            { mote.x = half;            mote.vx = 0; }
    if (mote.x > widthPx  - half) { mote.x = widthPx  - half; mote.vx = 0; }
    if (mote.y < half)            { mote.y = half;            mote.vy = 0; }
    if (mote.y > heightPx - half) { mote.y = heightPx - half; mote.vy = 0; }
    mote.trailX[mote.trailHead] = mote.x;
    mote.trailY[mote.trailHead] = mote.y;
    mote.trailHead = (mote.trailHead + 1) % RPG_TRAIL_CAPACITY;
    if (mote.trailCount < RPG_TRAIL_CAPACITY) mote.trailCount++;
    // Movement glow smoothing via LERP
    const speed = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
    if (speed > TRAIL_SPEED_THRESHOLD) {
      glowMovementIntensity = Math.min(1, glowMovementIntensity + GLOW_MOVE_RAMP_UP * deltaMs);
    } else {
      glowMovementIntensity = Math.max(0, glowMovementIntensity - GLOW_MOVE_RAMP_DOWN * deltaMs);
    }
    // Inject player movement into the fluid (only when meaningfully moving).
    if (speed > TRAIL_SPEED_THRESHOLD) {
      fluid.addForce({
        x: mote.x, y: mote.y,
        vx: mote.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: mote.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_PLAYER_R, g: FLUID_PLAYER_G, b: FLUID_PLAYER_B,
        strength: FLUID_PLAYER_STRENGTH,
      });
    }
  }

  /** Updates all equipped-weapon visual orbit particles. */
  function updateWeaponOrbitParticles(deltaMs: number): void {
    if (weaponOrbitParticles.length === 0) return;
    const dt = deltaMs / 1000;
    const angleStep = weaponOrbitParticles.length > 0 ? (2 * Math.PI) / weaponOrbitParticles.length : 0;
    for (let idx = 0; idx < weaponOrbitParticles.length; idx++) {
      const p = weaponOrbitParticles[idx];
      p.angle += WEAPON_PARTICLE_ORBIT_SPEED * dt;
      // Keep evenly spaced when multiple weapons are equipped
      const targetAngle = idx * angleStep + (Date.now() / 1000) * WEAPON_PARTICLE_ORBIT_SPEED;
      const angleDelta = ((targetAngle - p.angle + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      p.angle += angleDelta * 0.05;
      const newX = mote.x + Math.cos(p.angle) * WEAPON_PARTICLE_ORBIT_RADIUS;
      const newY = mote.y + Math.sin(p.angle) * WEAPON_PARTICLE_ORBIT_RADIUS;
      const dx = newX - p.x, dy = newY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < WEAPON_PARTICLE_MIN_SPEED * dt) p.angle += 0.05;
      p.x = newX; p.y = newY;
      p.trailX[p.trailHead] = p.x;
      p.trailY[p.trailHead] = p.y;
      p.trailHead = (p.trailHead + 1) % WEAPON_ORBIT_TRAIL_CAP;
      if (p.trailCount < WEAPON_ORBIT_TRAIL_CAP) p.trailCount++;
    }
  }

  /** Updates the orbiting projectile: angle, trail, and enemy collision. */
  function updateOrbitProjectile(deltaMs: number): void {
    const op = orbitProjectile;
    if (!op) return;
    const dt = deltaMs / 1000;
    op.angle -= ORBIT_PROJ_SPEED_RAD * dt;  // counter-clockwise, doubled speed
    op.x = mote.x + Math.cos(op.angle) * ORBIT_PROJ_RADIUS;
    op.y = mote.y + Math.sin(op.angle) * ORBIT_PROJ_RADIUS;
    op.trailX[op.trailHead] = op.x;
    op.trailY[op.trailHead] = op.y;
    op.trailHead = (op.trailHead + 1) % ORBIT_PROJ_TRAIL_CAP;
    if (op.trailCount < ORBIT_PROJ_TRAIL_CAP) op.trailCount++;

    // Advance per-enemy hit cooldowns.
    for (const [enemy, cdMs] of op.hitCooldowns) {
      const newCd = cdMs - deltaMs;
      if (newCd <= 0) op.hitCooldowns.delete(enemy);
      else            op.hitCooldowns.set(enemy, newCd);
    }

    // Collision detection with laser enemies.
    for (const enemy of enemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x;
      const dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = Math.max(0, ORBIT_PROJ_DAMAGE - enemy.def);
        if (dmg > 0) enemy.hp -= dmg;
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        const ratio = dmg / enemy.maxHp;
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), ratio, '#ffaa44');
      }
    }
    // Collision detection with sapphire enemies (hits shield first).
    for (const enemy of sapphireEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageSapphireEnemy(enemy, ORBIT_PROJ_DAMAGE, 0, false);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with missiles.
    for (const m of sapphireMissiles) {
      if (op.hitCooldowns.has(m)) continue;
      const dx = op.x - m.x, dy = op.y - m.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        damageMissile(m, ORBIT_PROJ_DAMAGE);
        op.hitCooldowns.set(m, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: m.x, y: m.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
      }
    }
    // Collision detection with emerald enemies.
    for (const enemy of emeraldEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageEmeraldEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with amber enemies.
    for (const enemy of amberEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageAmberEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with amber shards.
    for (const s of amberShards) {
      if (op.hitCooldowns.has(s)) continue;
      const dx = op.x - s.x, dy = op.y - s.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        damageAmberShard(s, ORBIT_PROJ_DAMAGE);
        op.hitCooldowns.set(s, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: s.x, y: s.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
      }
    }
    // Collision detection with void enemies.
    for (const enemy of voidEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageVoidEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with quartz enemies.
    for (const enemy of quartzEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageQuartzEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with ruby enemies.
    for (const enemy of rubyEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageRubyEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with sunstone enemies.
    for (const enemy of sunstoneEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageSunstoneEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with citrine enemies.
    for (const enemy of citrineEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageCitrineEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with iolite enemies.
    for (const enemy of ioliteEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageIoliteEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with amethyst enemies.
    for (const enemy of amethystEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageAmethystEnemy(enemy, ORBIT_PROJ_DAMAGE, 0, false);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with diamond enemies.
    for (const enemy of diamondEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageDiamondEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
    // Collision detection with nullstone enemies.
    for (const enemy of nullstoneEnemies) {
      if (op.hitCooldowns.has(enemy)) continue;
      const dx = op.x - enemy.x, dy = op.y - enemy.y;
      if (dx * dx + dy * dy < ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS) {
        const dmg = damageNullstoneEnemy(enemy, ORBIT_PROJ_DAMAGE, 0);
        op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
        hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: '#ffaa44' });
        spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), dmg / enemy.maxHp, '#ffaa44');
      }
    }
  }

  /**
   * Applies raw enemy ATK damage to the player after subtracting player DEF,
   * subject to iframes. Mutates playerStats.hp and playerIFramesMs.
   */
  function dealDamageToPlayer(atkValue: number): void {
    if (playerIFramesMs > 0) return;
    const rawDmg = atkValue - playerStats.def;
    const dmg = Math.max(0, rawDmg);
    if (dmg <= 0) {
      spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
    } else {
      playerStats.hp = Math.max(0, playerStats.hp - dmg);
      const ratio = Math.min(1, dmg / playerStats.maxHp);
      playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
      spawnDamageNumber(mote.x, mote.y, 0, -1, String(Math.round(dmg)), ratio, '#ff6666');
    }
  }

  function triggerDeath(): void {
    rpgPhase = 'dying'; phaseTimerMs = 0; deathAlpha = 1;
    deathParticles.length = 0;
    for (let i = 0; i < DEATH_BURST_COUNT; i++) {
      const angle = (i / DEATH_BURST_COUNT) * Math.PI * 2 + Math.random() * 0.35;
      const speed = 0.8 + Math.random() * 1.8;
      deathParticles.push({
        x: mote.x, y: mote.y,
        vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed,
        alpha: 1, size: 1.5 + Math.random() * 2,
        color: DEATH_PARTICLE_COLORS[Math.floor(Math.random() * DEATH_PARTICLE_COLORS.length)],
      });
    }
  }

  function doRestart(): void {
    playerStats.hp = playerStats.maxHp;
    enemies.length = 0; spawnQueue.length = 0;
    sapphireEnemies.length = 0; sapphireMissiles.length = 0;
    emeraldEnemies.length = 0;
    amberEnemies.length = 0; amberShards.length = 0;
    voidEnemies.length = 0;
    quartzEnemies.length = 0; quartzSpikes.length = 0;
    rubyEnemies.length = 0; rubyBolts.length = 0;
    sunstoneEnemies.length = 0;
    citrineEnemies.length = 0; citrineBolts.length = 0;
    ioliteEnemies.length = 0;
    amethystEnemies.length = 0; amethystShards.length = 0;
    diamondEnemies.length = 0; diamondShards.length = 0;
    nullstoneEnemies.length = 0; voidTendrils.length = 0;
    sandProjectiles.length = 0;
    chainWhipStates.clear();
    laserBeamEffect = null;
    mote.x = widthPx / 2; mote.y = heightPx / 2;
    mote.vx = mote.vy = 0; mote.trailHead = 0; mote.trailCount = 0;
    deathParticles.length = 0; glowMovementIntensity = 0;
    currentWave = 0; isInterWave = true;
    interWaveTimerMs = INTER_WAVE_DELAY_MS * 0.4;
    screenDarken = 0;
    weaponAttackTimers.clear();
    hitEffects.length = 0; shotLines.length = 0;
    damageNumbers.length = 0; playerIFramesMs = 0;
    fluid.reset();
    applyEquipmentStats();
  }

  // ── Emerald enemy system (blink-striker) ──────────────────────

  function updateEmeraldEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of emeraldEnemies) {
      // Fade ghost afterimage
      if (enemy.ghostAlpha > 0) {
        enemy.ghostAlpha = Math.max(0, enemy.ghostAlpha - deltaMs / EMERALD_GHOST_FADE_MS);
      }

      if (enemy.phase === 'patrol') {
        // Random patrol movement
        enemy.patrolTimerMs -= deltaMs;
        if (enemy.patrolTimerMs <= 0) {
          const angle = Math.random() * Math.PI * 2;
          enemy.vx = Math.cos(angle) * EMERALD_PATROL_SPEED;
          enemy.vy = Math.sin(angle) * EMERALD_PATROL_SPEED;
          enemy.patrolTimerMs = EMERALD_PATROL_TURN_MS * (0.5 + Math.random() * 0.8);
        }
        const dampFactor = Math.pow(EMERALD_PATROL_DAMPING, dt);
        enemy.vx *= dampFactor; enemy.vy *= dampFactor;
        enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
        // Clamp
        const half = EMERALD_ENEMY_SIZE / 2;
        if (enemy.x < half)            { enemy.x = half;            enemy.vx =  Math.abs(enemy.vx) * 0.5; }
        if (enemy.x > widthPx  - half) { enemy.x = widthPx  - half; enemy.vx = -Math.abs(enemy.vx) * 0.5; }
        if (enemy.y < half)            { enemy.y = half;             enemy.vy =  Math.abs(enemy.vy) * 0.5; }
        if (enemy.y > heightPx - half) { enemy.y = heightPx - half; enemy.vy = -Math.abs(enemy.vy) * 0.5; }

        // Fluid from patrol movement
        const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
        if (espd > 0.04) {
          fluid.addForce({
            x: enemy.x, y: enemy.y,
            vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
            vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
            r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
            strength: FLUID_ENEMY_STRENGTH,
          });
        }

        // Detect player
        const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
        if (dx * dx + dy * dy < EMERALD_ATTACK_RADIUS * EMERALD_ATTACK_RADIUS) {
          enemy.phase = 'charging'; enemy.phaseMs = 0; enemy.hasHitPlayer = false;
          enemy.vx = 0; enemy.vy = 0;
        }

      } else if (enemy.phase === 'charging') {
        enemy.phaseMs += deltaMs;
        // Brief charge-up — enemy freezes and pulses
        if (enemy.phaseMs >= EMERALD_CHARGE_MS) {
          // Blink: store ghost at current position, teleport near player
          enemy.ghostX = enemy.x; enemy.ghostY = enemy.y; enemy.ghostAlpha = 1;
          const angle = Math.random() * Math.PI * 2;
          enemy.x = mote.x + Math.cos(angle) * EMERALD_BLINK_OFFSET;
          enemy.y = mote.y + Math.sin(angle) * EMERALD_BLINK_OFFSET;
          // Clamp to bounds after blink
          const half = EMERALD_ENEMY_SIZE / 2;
          enemy.x = Math.max(half, Math.min(widthPx  - half, enemy.x));
          enemy.y = Math.max(half, Math.min(heightPx - half, enemy.y));
          enemy.phase = 'blinking'; enemy.phaseMs = 0;
          // Flash of fluid at both origin and destination
          fluid.addForce({
            x: enemy.ghostX, y: enemy.ghostY,
            vx: (mote.x - enemy.ghostX) * 0.02 * FLUID_VEL_FRAME_TO_PX_S,
            vy: (mote.y - enemy.ghostY) * 0.02 * FLUID_VEL_FRAME_TO_PX_S,
            r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
            strength: 1.2,
          });
        }

      } else if (enemy.phase === 'blinking') {
        // One-frame blink — deliver contact damage then go to cooldown
        if (!enemy.hasHitPlayer) {
          enemy.hasHitPlayer = true;
          if (playerIFramesMs <= 0) {
            const rawDmg = enemy.atk - playerStats.def;
            const dmg = Math.max(0, rawDmg);
            if (dmg <= 0) {
              spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
            } else {
              playerStats.hp = Math.max(0, playerStats.hp - dmg);
              const ratio = Math.min(1, dmg / playerStats.maxHp);
              playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
              spawnDamageNumber(mote.x, mote.y, 0, -1, String(Math.round(dmg)), ratio, '#ff6666');
            }
          }
        }
        enemy.phase = 'cooldown'; enemy.phaseMs = 0;

      } else if (enemy.phase === 'cooldown') {
        enemy.phaseMs += deltaMs;
        if (enemy.phaseMs >= EMERALD_COOLDOWN_MS) {
          enemy.phase = 'patrol'; enemy.phaseMs = 0;
          enemy.patrolTimerMs = EMERALD_PATROL_TURN_MS * Math.random();
        }
      }
    }
  }

  function drawEmeraldEnemies(): void {
    for (const enemy of emeraldEnemies) {
      // Draw ghost afterimage at blink origin
      if (enemy.ghostAlpha > 0.02) {
        const half = EMERALD_ENEMY_SIZE / 2;
        ctx.save();
        ctx.globalAlpha = enemy.ghostAlpha * 0.5;
        ctx.shadowBlur  = EMERALD_ENEMY_SIZE * 6; ctx.shadowColor = EMERALD_ENEMY_GLOW;
        ctx.fillStyle   = EMERALD_ENEMY_GLOW;
        ctx.fillRect(Math.floor(enemy.ghostX - half), Math.floor(enemy.ghostY - half), EMERALD_ENEMY_SIZE, EMERALD_ENEMY_SIZE);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
        ctx.restore();
      }
      // HP bar
      const barW = EMERALD_ENEMY_SIZE * 2.5;
      const barH = 2;
      const barX = enemy.x - barW / 2;
      const barY = enemy.y + EMERALD_ENEMY_SIZE / 2 + 3;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = EMERALD_ENEMY_COLOR;
      ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1;
      ctx.restore();
      // Body — pulses brighter during charging phase
      const chargeGlow = enemy.phase === 'charging' ? (enemy.phaseMs / EMERALD_CHARGE_MS) * 0.6 : 0;
      const half = EMERALD_ENEMY_SIZE / 2;
      ctx.shadowBlur  = EMERALD_ENEMY_SIZE * (5 + chargeGlow * 8); ctx.shadowColor = EMERALD_ENEMY_GLOW;
      ctx.fillStyle   = EMERALD_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), EMERALD_ENEMY_SIZE, EMERALD_ENEMY_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  // ── Amber enemy system (fan-gunner) ───────────────────────────

  function spawnAmberFanBurst(enemy: AmberEnemy): void {
    const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const baseDirX = dist > 0.01 ? dx / dist : 0;
    const baseDirY = dist > 0.01 ? dy / dist : 1;
    const baseAngle = Math.atan2(baseDirY, baseDirX);
    for (let i = 0; i < AMBER_SHARD_COUNT; i++) {
      const spread = (i - (AMBER_SHARD_COUNT - 1) / 2) * AMBER_SHARD_SPREAD_RAD;
      const angle = baseAngle + spread;
      const vx = Math.cos(angle) * AMBER_SHARD_SPEED;
      const vy = Math.sin(angle) * AMBER_SHARD_SPEED;
      amberShards.push(makeAmberShard(enemy.x, enemy.y, vx, vy));
    }
    fluid.addForce({
      x: enemy.x, y: enemy.y,
      vx: baseDirX * FLUID_VEL_FRAME_TO_PX_S * 2.0,
      vy: baseDirY * FLUID_VEL_FRAME_TO_PX_S * 2.0,
      r: FLUID_AMBER_R, g: FLUID_AMBER_G, b: FLUID_AMBER_B,
      strength: FLUID_PROJECTILE_STRENGTH * 1.5,
    });
  }

  function updateAmberEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of amberEnemies) {
      // Patrol
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * AMBER_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * AMBER_PATROL_SPEED;
        enemy.patrolTimerMs = AMBER_PATROL_TURN_MS * (0.5 + Math.random() * 0.8);
      }
      const dampFactor = Math.pow(AMBER_PATROL_DAMPING, dt);
      enemy.vx *= dampFactor; enemy.vy *= dampFactor;
      enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
      const half = AMBER_ENEMY_SIZE / 2;
      if (enemy.x < half)            { enemy.x = half;            enemy.vx =  Math.abs(enemy.vx) * 0.5; }
      if (enemy.x > widthPx  - half) { enemy.x = widthPx  - half; enemy.vx = -Math.abs(enemy.vx) * 0.5; }
      if (enemy.y < half)            { enemy.y = half;             enemy.vy =  Math.abs(enemy.vy) * 0.5; }
      if (enemy.y > heightPx - half) { enemy.y = heightPx - half; enemy.vy = -Math.abs(enemy.vy) * 0.5; }

      // Fluid from movement
      const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (espd > 0.04) {
        fluid.addForce({
          x: enemy.x, y: enemy.y,
          vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
          vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_AMBER_R, g: FLUID_AMBER_G, b: FLUID_AMBER_B,
          strength: FLUID_ENEMY_STRENGTH,
        });
      }

      // Fan-burst timer
      enemy.missileTimerMs -= deltaMs;
      if (enemy.missileTimerMs <= 0) {
        spawnAmberFanBurst(enemy);
        enemy.missileTimerMs = AMBER_MISSILE_CD_MS + (Math.random() - 0.5) * AMBER_MISSILE_JITTER;
      }
    }
  }

  function updateAmberShards(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = amberShards.length - 1; i >= 0; i--) {
      const s = amberShards[i];
      if (s.hp <= 0) { amberShards.splice(i, 1); continue; }

      // Heat-seeking toward player
      const dx = mote.x - s.x, dy = mote.y - s.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.01) {
        s.vx += (dx / dist) * AMBER_SHARD_SEEK_STR;
        s.vy += (dy / dist) * AMBER_SHARD_SEEK_STR;
      }
      const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
      if (speed > AMBER_SHARD_MAX_SPEED) {
        s.vx = (s.vx / speed) * AMBER_SHARD_MAX_SPEED;
        s.vy = (s.vy / speed) * AMBER_SHARD_MAX_SPEED;
      }
      s.x += s.vx * dt; s.y += s.vy * dt;

      // Fluid trail
      fluid.addForce({
        x: s.x, y: s.y,
        vx: s.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: s.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_AMBER_R, g: FLUID_AMBER_G, b: FLUID_AMBER_B,
        strength: FLUID_MISSILE_STRENGTH * 0.7,
      });

      // Trail recording
      s.trailX[s.trailHead] = s.x; s.trailY[s.trailHead] = s.y;
      s.trailHead = (s.trailHead + 1) % AMBER_SHARD_TRAIL_CAP;
      if (s.trailCount < AMBER_SHARD_TRAIL_CAP) s.trailCount++;

      // Player hit
      if (!s.hasHitPlayer) {
        const pdx = mote.x - s.x, pdy = mote.y - s.y;
        if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          s.hasHitPlayer = true;
          if (playerIFramesMs <= 0) {
            const rawDmg = s.atk - playerStats.def;
            const dmg = Math.max(0, rawDmg);
            if (dmg <= 0) {
              spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
            } else {
              playerStats.hp = Math.max(0, playerStats.hp - dmg);
              const ratio = Math.min(1, dmg / playerStats.maxHp);
              const curSpeed = speed + SPEED_EPSILON;
              mote.vx += (s.vx / curSpeed) * PLAYER_KNOCKBACK_MAX * ratio;
              mote.vy += (s.vy / curSpeed) * PLAYER_KNOCKBACK_MAX * ratio;
              playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
              spawnDamageNumber(mote.x, mote.y, s.vx / curSpeed, s.vy / curSpeed, String(Math.round(dmg)), ratio, '#ff6666');
            }
          }
          amberShards.splice(i, 1); continue;
        }
      }

      // Despawn if out of bounds
      const margin = 20;
      if (s.x < -margin || s.x > widthPx + margin || s.y < -margin || s.y > heightPx + margin) {
        amberShards.splice(i, 1);
      }
    }
  }

  function drawAmberEnemies(): void {
    for (const enemy of amberEnemies) {
      const barW = AMBER_ENEMY_SIZE * 2.5;
      const barH = 2;
      const barX = enemy.x - barW / 2;
      const barY = enemy.y + AMBER_ENEMY_SIZE / 2 + 3;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = AMBER_ENEMY_COLOR;
      ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1;
      ctx.restore();
      const half = AMBER_ENEMY_SIZE / 2;
      ctx.shadowBlur  = AMBER_ENEMY_SIZE * 5; ctx.shadowColor = AMBER_ENEMY_GLOW;
      ctx.fillStyle   = AMBER_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), AMBER_ENEMY_SIZE, AMBER_ENEMY_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  function drawAmberShards(): void {
    if (amberShards.length === 0) return;
    ctx.save();
    for (const s of amberShards) {
      // Trail
      if (s.trailCount >= 2) {
        const dashLen = AMBER_SHARD_TRAIL_CAP * 0.6;
        const startIdx = (s.trailHead - s.trailCount + AMBER_SHARD_TRAIL_CAP) % AMBER_SHARD_TRAIL_CAP;
        const lastIdx  = (s.trailHead - 1 + AMBER_SHARD_TRAIL_CAP) % AMBER_SHARD_TRAIL_CAP;
        ctx.save();
        ctx.setLineDash([dashLen, dashLen]);
        ctx.lineDashOffset = -(dashLen * (1 - s.trailCount / AMBER_SHARD_TRAIL_CAP));
        ctx.lineCap = 'round'; ctx.lineJoin = 'round';
        ctx.globalAlpha = 0.65; ctx.shadowBlur = 4; ctx.shadowColor = AMBER_SHARD_GLOW;
        ctx.strokeStyle = AMBER_SHARD_GLOW; ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(s.trailX[startIdx], s.trailY[startIdx]);
        ctx.lineTo(s.trailX[lastIdx],  s.trailY[lastIdx]);
        ctx.stroke();
        ctx.shadowBlur = 0;
        ctx.strokeStyle = AMBER_SHARD_COLOR; ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(s.trailX[startIdx], s.trailY[startIdx]);
        ctx.lineTo(s.trailX[lastIdx],  s.trailY[lastIdx]);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
      }
      // Shard body
      const half = AMBER_SHARD_SIZE / 2;
      ctx.globalAlpha = 1;
      ctx.shadowBlur = AMBER_SHARD_SIZE * 5; ctx.shadowColor = AMBER_SHARD_GLOW;
      ctx.fillStyle = AMBER_SHARD_GLOW;
      const gh = half * 2;
      ctx.fillRect(Math.floor(s.x - gh), Math.floor(s.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
      ctx.shadowBlur = 0;
      ctx.fillStyle = AMBER_SHARD_COLOR;
      ctx.fillRect(Math.floor(s.x - half), Math.floor(s.y - half), AMBER_SHARD_SIZE, AMBER_SHARD_SIZE);
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
  }

  // ── Void enemy system (slow bruiser) ──────────────────────────

  function updateVoidEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of voidEnemies) {
      enemy.pulseMs = (enemy.pulseMs + deltaMs) % VOID_AURA_PULSE_MS;

      // Constant pursuit of player
      const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 0.01) {
        enemy.vx = (dx / dist) * VOID_PURSUE_SPEED;
        enemy.vy = (dy / dist) * VOID_PURSUE_SPEED;
      } else {
        enemy.vx = 0; enemy.vy = 0;
      }
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;

      // Clamp to bounds
      const half = VOID_ENEMY_SIZE / 2;
      if (enemy.x < half)            { enemy.x = half; }
      if (enemy.x > widthPx  - half) { enemy.x = widthPx  - half; }
      if (enemy.y < half)            { enemy.y = half; }
      if (enemy.y > heightPx - half) { enemy.y = heightPx - half; }

      // Fluid from movement
      const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (espd > 0.04) {
        fluid.addForce({
          x: enemy.x, y: enemy.y,
          vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
          vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_VOID_R, g: FLUID_VOID_G, b: FLUID_VOID_B,
          strength: FLUID_ENEMY_STRENGTH * 1.3,
        });
      }

      // Contact damage (with cooldown per tick)
      if (enemy.contactCdMs > 0) {
        enemy.contactCdMs = Math.max(0, enemy.contactCdMs - deltaMs);
      }
      if (enemy.contactCdMs <= 0) {
        const cdx = mote.x - enemy.x, cdy = mote.y - enemy.y;
        if (cdx * cdx + cdy * cdy < VOID_CONTACT_RADIUS * VOID_CONTACT_RADIUS) {
          if (playerIFramesMs <= 0) {
            const rawDmg = enemy.atk - playerStats.def;
            const dmg = Math.max(0, rawDmg);
            if (dmg <= 0) {
              spawnDamageNumber(mote.x, mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
            } else {
              playerStats.hp = Math.max(0, playerStats.hp - dmg);
              const ratio = Math.min(1, dmg / playerStats.maxHp);
              playerIFramesMs = PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS;
              spawnDamageNumber(mote.x, mote.y, 0, -1, String(Math.round(dmg)), ratio, '#ff6666');
            }
          }
          enemy.contactCdMs = VOID_CONTACT_CD_MS;
        }
      }
    }
  }

  function drawVoidEnemies(): void {
    for (const enemy of voidEnemies) {
      // Pulsing aura rings
      const pulseT = enemy.pulseMs / VOID_AURA_PULSE_MS;
      const auraAlpha = Math.sin(pulseT * Math.PI * 2) * 0.3 + 0.35;
      ctx.save();
      ctx.globalAlpha = auraAlpha * 0.4;
      ctx.shadowBlur  = VOID_AURA_RADIUS * 2; ctx.shadowColor = VOID_ENEMY_GLOW;
      ctx.strokeStyle = VOID_ENEMY_GLOW; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, VOID_AURA_RADIUS * (1 + pulseT * 0.3), 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
      ctx.globalAlpha = auraAlpha * 0.15;
      ctx.fillStyle = VOID_ENEMY_GLOW;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, VOID_AURA_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.globalAlpha = 1;
      ctx.restore();
      // HP bar
      const barW = VOID_ENEMY_SIZE * 3;
      const barH = 2;
      const barX = enemy.x - barW / 2;
      const barY = enemy.y + VOID_AURA_RADIUS + 3;
      ctx.save();
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(barX, barY, barW, barH);
      ctx.fillStyle = VOID_ENEMY_COLOR;
      ctx.fillRect(barX, barY, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1;
      ctx.restore();
      // Body
      const half = VOID_ENEMY_SIZE / 2;
      ctx.shadowBlur  = VOID_ENEMY_SIZE * 6; ctx.shadowColor = VOID_ENEMY_GLOW;
      ctx.fillStyle   = VOID_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), VOID_ENEMY_SIZE, VOID_ENEMY_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  // ── Quartz enemy system ────────────────────────────────────────

  function updateQuartzEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of quartzEnemies) {
      const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist > QUARTZ_PREFERRED_DIST + 20) {
        enemy.vx += (dx / dist) * QUARTZ_APPROACH_SPEED;
        enemy.vy += (dy / dist) * QUARTZ_APPROACH_SPEED;
      } else if (dist < QUARTZ_PREFERRED_DIST - 20) {
        enemy.vx -= (dx / dist) * QUARTZ_APPROACH_SPEED;
        enemy.vy -= (dy / dist) * QUARTZ_APPROACH_SPEED;
      } else {
        const perpX = -dy / dist, perpY = dx / dist;
        enemy.vx += perpX * QUARTZ_STRAFE_SPEED * enemy.strafeDir;
        enemy.vy += perpY * QUARTZ_STRAFE_SPEED * enemy.strafeDir;
      }
      const speed = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (speed > 2.0) { enemy.vx = (enemy.vx / speed) * 2.0; enemy.vy = (enemy.vy / speed) * 2.0; }
      enemy.vx *= 0.85; enemy.vy *= 0.85;
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      clampEnemyToBounds(enemy);
      enemy.strafeDirFlipMs -= deltaMs;
      if (enemy.strafeDirFlipMs <= 0) {
        enemy.strafeDir = (enemy.strafeDir === 1 ? -1 : 1) as 1 | -1;
        enemy.strafeDirFlipMs = 2000 + Math.random() * 2000;
      }
      enemy.spikeTimerMs -= deltaMs;
      if (enemy.spikeTimerMs <= 0) {
        enemy.spikeTimerMs = QUARTZ_SPIKE_CD_MS + Math.random() * QUARTZ_SPIKE_JITTER;
        const sdx = mote.x - enemy.x, sdy = mote.y - enemy.y;
        const slen = Math.sqrt(sdx * sdx + sdy * sdy) || 1;
        quartzSpikes.push(makeQuartzSpike(enemy.x, enemy.y, (sdx / slen) * QUARTZ_SPIKE_SPEED, (sdy / slen) * QUARTZ_SPIKE_SPEED));
      }
    }
  }

  function updateQuartzSpikes(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = quartzSpikes.length - 1; i >= 0; i--) {
      const s = quartzSpikes[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.lifeMs -= deltaMs;
      if (s.lifeMs <= 0 || s.x < 0 || s.x > widthPx || s.y < 0 || s.y > heightPx) {
        quartzSpikes.splice(i, 1); continue;
      }
      if (!s.hasHitPlayer) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          s.hasHitPlayer = true;
          dealDamageToPlayer(s.atk);
        }
      }
    }
  }

  function drawQuartzEnemies(): void {
    for (const enemy of quartzEnemies) {
      const half = QUARTZ_ENEMY_SIZE / 2;
      ctx.save();
      ctx.translate(Math.floor(enemy.x), Math.floor(enemy.y));
      ctx.rotate(Math.PI / 4);
      ctx.shadowBlur = QUARTZ_ENEMY_SIZE * 4; ctx.shadowColor = QUARTZ_ENEMY_GLOW;
      ctx.fillStyle = QUARTZ_ENEMY_COLOR;
      ctx.fillRect(-half, -half, QUARTZ_ENEMY_SIZE, QUARTZ_ENEMY_SIZE);
      ctx.shadowBlur = 0;
      ctx.restore();
      const barW = QUARTZ_ENEMY_SIZE * 2.5; const barH = 2;
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + QUARTZ_ENEMY_SIZE + 2, barW, barH);
      ctx.fillStyle = QUARTZ_ENEMY_COLOR;
      ctx.fillRect(enemy.x - barW / 2, enemy.y + QUARTZ_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  function drawQuartzSpikes(): void {
    for (const s of quartzSpikes) {
      ctx.save();
      ctx.translate(Math.floor(s.x), Math.floor(s.y));
      ctx.rotate(Math.PI / 4);
      const half = QUARTZ_SPIKE_SIZE / 2;
      ctx.shadowBlur = QUARTZ_SPIKE_SIZE * 3; ctx.shadowColor = QUARTZ_SPIKE_GLOW;
      ctx.fillStyle = QUARTZ_SPIKE_COLOR;
      ctx.fillRect(-half, -half, QUARTZ_SPIKE_SIZE, QUARTZ_SPIKE_SIZE);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ── Ruby enemy system ──────────────────────────────────────────

  function updateRubyEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of rubyEnemies) {
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * RUBY_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * RUBY_PATROL_SPEED;
        enemy.patrolTimerMs = 800 + Math.random() * 1200;
      }
      const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      if (dist > RUBY_PREFERRED_DIST) {
        enemy.vx = (dx / dist) * RUBY_PATROL_SPEED;
        enemy.vy = (dy / dist) * RUBY_PATROL_SPEED;
      }
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      clampEnemyToBounds(enemy);
      enemy.boltTimerMs -= deltaMs;
      if (enemy.boltTimerMs <= 0) {
        enemy.boltTimerMs = RUBY_BOLT_CD_MS + Math.random() * RUBY_BOLT_JITTER;
        const bdx = mote.x - enemy.x, bdy = mote.y - enemy.y;
        const blen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
        enemy.consecutiveShots++;
        const burstCount = enemy.consecutiveShots >= 3 ? 3 : 2;
        if (enemy.consecutiveShots >= 3) enemy.consecutiveShots = 0;
        for (let b = 0; b < burstCount; b++) {
          const spread = (b - (burstCount - 1) / 2) * 0.15;
          const cos = Math.cos(spread), sin = Math.sin(spread);
          const bvx = ((bdx / blen) * cos - (bdy / blen) * sin) * RUBY_BOLT_SPEED;
          const bvy = ((bdx / blen) * sin + (bdy / blen) * cos) * RUBY_BOLT_SPEED;
          rubyBolts.push(makeRubyBolt(enemy.x, enemy.y, bvx, bvy));
        }
      }
    }
  }

  function updateRubyBolts(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = rubyBolts.length - 1; i >= 0; i--) {
      const b = rubyBolts[i];
      b.x += b.vx * dt; b.y += b.vy * dt;
      b.lifeMs -= deltaMs;
      if (b.lifeMs <= 0 || b.x < 0 || b.x > widthPx || b.y < 0 || b.y > heightPx) {
        rubyBolts.splice(i, 1); continue;
      }
      if (!b.hasHitPlayer) {
        const dx = b.x - mote.x, dy = b.y - mote.y;
        if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          b.hasHitPlayer = true;
          dealDamageToPlayer(b.atk);
        }
      }
    }
  }

  function drawRubyEnemies(): void {
    for (const enemy of rubyEnemies) {
      const half = RUBY_ENEMY_SIZE / 2;
      ctx.shadowBlur = RUBY_ENEMY_SIZE * 5; ctx.shadowColor = RUBY_ENEMY_GLOW;
      ctx.fillStyle = RUBY_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), RUBY_ENEMY_SIZE, RUBY_ENEMY_SIZE);
      ctx.shadowBlur = 0;
      const barW = RUBY_ENEMY_SIZE * 2.5; const barH = 2;
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + RUBY_ENEMY_SIZE + 2, barW, barH);
      ctx.fillStyle = RUBY_ENEMY_COLOR;
      ctx.fillRect(enemy.x - barW / 2, enemy.y + RUBY_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  function drawRubyBolts(): void {
    for (const b of rubyBolts) {
      const half = RUBY_BOLT_SIZE / 2;
      ctx.shadowBlur = RUBY_BOLT_SIZE * 4; ctx.shadowColor = RUBY_BOLT_GLOW;
      ctx.fillStyle = RUBY_BOLT_COLOR;
      ctx.fillRect(Math.floor(b.x - half), Math.floor(b.y - half), RUBY_BOLT_SIZE, RUBY_BOLT_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  // ── Sunstone enemy system ─────────────────────────────────────

  function updateSunstoneEnemies(deltaMs: number): void {
    for (const enemy of sunstoneEnemies) {
      enemy.orbitAngle += SUNSTONE_ORBIT_SPEED * (deltaMs / 1000);
      enemy.x = mote.x + Math.cos(enemy.orbitAngle) * SUNSTONE_PREFERRED_DIST;
      enemy.y = mote.y + Math.sin(enemy.orbitAngle) * SUNSTONE_PREFERRED_DIST;
      const half = SUNSTONE_ENEMY_SIZE / 2;
      enemy.x = Math.max(half, Math.min(widthPx - half, enemy.x));
      enemy.y = Math.max(half, Math.min(heightPx - half, enemy.y));
      enemy.pulseTimerMs -= deltaMs;
      if (enemy.pulseTimerMs <= 0) {
        enemy.pulseTimerMs = SUNSTONE_PULSE_CD_MS + Math.random() * SUNSTONE_PULSE_JITTER;
        const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= SUNSTONE_PREFERRED_DIST + 20) {
          dealDamageToPlayer(enemy.atk);
          hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: SUNSTONE_ENEMY_GLOW });
        }
      }
    }
  }

  function drawSunstoneEnemies(): void {
    for (const enemy of sunstoneEnemies) {
      const half = SUNSTONE_ENEMY_SIZE / 2;
      ctx.save();
      ctx.shadowBlur = SUNSTONE_ENEMY_SIZE * 5; ctx.shadowColor = SUNSTONE_ENEMY_GLOW;
      ctx.fillStyle = SUNSTONE_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), SUNSTONE_ENEMY_SIZE, SUNSTONE_ENEMY_SIZE);
      ctx.globalAlpha = 0.3; ctx.strokeStyle = SUNSTONE_ENEMY_GLOW; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, SUNSTONE_ENEMY_SIZE * 1.6, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      ctx.restore();
      const barW = SUNSTONE_ENEMY_SIZE * 3; const barH = 2;
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + SUNSTONE_ENEMY_SIZE + 2, barW, barH);
      ctx.fillStyle = SUNSTONE_ENEMY_COLOR;
      ctx.fillRect(enemy.x - barW / 2, enemy.y + SUNSTONE_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  // ── Citrine enemy system ──────────────────────────────────────

  function updateCitrineEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of citrineEnemies) {
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        enemy.patrolTimerMs = CITRINE_PATROL_TURN_MS * (0.5 + Math.random());
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * CITRINE_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * CITRINE_PATROL_SPEED;
      }
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      clampEnemyToBounds(enemy);
      enemy.boltTimerMs -= deltaMs;
      if (enemy.boltTimerMs <= 0) {
        enemy.boltTimerMs = CITRINE_BOLT_CD_MS + Math.random() * CITRINE_BOLT_JITTER;
        const bdx = mote.x - enemy.x, bdy = mote.y - enemy.y;
        const blen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
        citrineBolts.push(makeCitrineBolt(enemy.x, enemy.y, (bdx / blen) * CITRINE_BOLT_SPEED, (bdy / blen) * CITRINE_BOLT_SPEED));
      }
    }
  }

  function updateCitrineBolts(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = citrineBolts.length - 1; i >= 0; i--) {
      const b = citrineBolts[i];
      // Homing seek toward player
      const dx = mote.x - b.x, dy = mote.y - b.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      b.vx += (dx / dist) * CITRINE_BOLT_SEEK;
      b.vy += (dy / dist) * CITRINE_BOLT_SEEK;
      const speed = Math.sqrt(b.vx * b.vx + b.vy * b.vy);
      if (speed > CITRINE_BOLT_MAX_SPEED) { b.vx = (b.vx / speed) * CITRINE_BOLT_MAX_SPEED; b.vy = (b.vy / speed) * CITRINE_BOLT_MAX_SPEED; }
      // Trail recording
      b.trailX[b.trailHead] = b.x; b.trailY[b.trailHead] = b.y;
      b.trailHead = (b.trailHead + 1) % CITRINE_BOLT_TRAIL_CAP;
      if (b.trailCount < CITRINE_BOLT_TRAIL_CAP) b.trailCount++;
      b.x += b.vx * dt; b.y += b.vy * dt;
      if (b.x < 0 || b.x > widthPx || b.y < 0 || b.y > heightPx) {
        citrineBolts.splice(i, 1); continue;
      }
      if (!b.hasHitPlayer) {
        const pdx = b.x - mote.x, pdy = b.y - mote.y;
        if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          b.hasHitPlayer = true;
          dealDamageToPlayer(b.atk);
        }
      }
    }
  }

  function drawCitrineEnemies(): void {
    for (const enemy of citrineEnemies) {
      const half = CITRINE_ENEMY_SIZE / 2;
      ctx.shadowBlur = CITRINE_ENEMY_SIZE * 5; ctx.shadowColor = CITRINE_ENEMY_GLOW;
      ctx.fillStyle = CITRINE_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), CITRINE_ENEMY_SIZE, CITRINE_ENEMY_SIZE);
      ctx.shadowBlur = 0;
      const barW = CITRINE_ENEMY_SIZE * 2.5; const barH = 2;
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + CITRINE_ENEMY_SIZE + 2, barW, barH);
      ctx.fillStyle = CITRINE_ENEMY_COLOR;
      ctx.fillRect(enemy.x - barW / 2, enemy.y + CITRINE_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  function drawCitrineBolts(): void {
    for (const b of citrineBolts) {
      // Draw trail
      if (b.trailCount >= 2) {
        ctx.save();
        for (let i = 0; i < b.trailCount; i++) {
          const t = i / b.trailCount;
          const bufIdx = (b.trailHead - b.trailCount + i + CITRINE_BOLT_TRAIL_CAP) % CITRINE_BOLT_TRAIL_CAP;
          ctx.globalAlpha = t * 0.35;
          ctx.fillStyle = CITRINE_BOLT_COLOR;
          const ts = CITRINE_BOLT_SIZE * 0.7;
          ctx.fillRect(Math.floor(b.trailX[bufIdx] - ts / 2), Math.floor(b.trailY[bufIdx] - ts / 2), Math.ceil(ts), Math.ceil(ts));
        }
        ctx.globalAlpha = 1; ctx.restore();
      }
      const half = CITRINE_BOLT_SIZE / 2;
      ctx.shadowBlur = CITRINE_BOLT_SIZE * 4; ctx.shadowColor = CITRINE_BOLT_GLOW;
      ctx.fillStyle = CITRINE_BOLT_COLOR;
      ctx.fillRect(Math.floor(b.x - half), Math.floor(b.y - half), CITRINE_BOLT_SIZE, CITRINE_BOLT_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  // ── Iolite enemy system ───────────────────────────────────────

  function updateIoliteEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of ioliteEnemies) {
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        enemy.patrolTimerMs = IOLITE_PATROL_TURN_MS * (0.5 + Math.random());
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * IOLITE_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * IOLITE_PATROL_SPEED;
      }
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      clampEnemyToBounds(enemy);
      enemy.beamTimerMs -= deltaMs;
      if (enemy.beamTimerMs <= 0) {
        enemy.beamTimerMs = IOLITE_BEAM_CD_MS + Math.random() * IOLITE_BEAM_JITTER;
        const bdx = mote.x - enemy.x, bdy = mote.y - enemy.y;
        const baseAngle = Math.atan2(bdy, bdx);
        for (let b = 0; b < IOLITE_BEAM_COUNT; b++) {
          const spreadAngle = baseAngle + (b - Math.floor(IOLITE_BEAM_COUNT / 2)) * (IOLITE_BEAM_SPREAD_RAD / (IOLITE_BEAM_COUNT - 1));
          const bdirX = Math.cos(spreadAngle), bdirY = Math.sin(spreadAngle);
          const pdx2 = mote.x - enemy.x, pdy2 = mote.y - enemy.y;
          const tProj = pdx2 * bdirX + pdy2 * bdirY;
          if (tProj >= 0 && tProj <= IOLITE_BEAM_RANGE) {
            const perpDist = Math.abs(pdx2 * bdirY - pdy2 * bdirX);
            if (perpDist <= PLAYER_HIT_RADIUS) {
              dealDamageToPlayer(enemy.atk);
            }
          }
          shotLines.push({ x1: enemy.x, y1: enemy.y, x2: enemy.x + bdirX * IOLITE_BEAM_RANGE, y2: enemy.y + bdirY * IOLITE_BEAM_RANGE, timerMs: 200, color: IOLITE_ENEMY_GLOW });
        }
      }
    }
  }

  function drawIoliteEnemies(): void {
    for (const enemy of ioliteEnemies) {
      const half = IOLITE_ENEMY_SIZE / 2;
      ctx.save();
      ctx.shadowBlur = IOLITE_ENEMY_SIZE * 5; ctx.shadowColor = IOLITE_ENEMY_GLOW;
      ctx.fillStyle = IOLITE_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), IOLITE_ENEMY_SIZE, IOLITE_ENEMY_SIZE);
      ctx.shadowBlur = 0;
      ctx.restore();
      const barW = IOLITE_ENEMY_SIZE * 3; const barH = 2;
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + IOLITE_ENEMY_SIZE + 2, barW, barH);
      ctx.fillStyle = IOLITE_ENEMY_COLOR;
      ctx.fillRect(enemy.x - barW / 2, enemy.y + IOLITE_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  // ── Amethyst enemy system ─────────────────────────────────────

  function updateAmethystEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of amethystEnemies) {
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        enemy.patrolTimerMs = AMETHYST_PATROL_TURN_MS * (0.5 + Math.random());
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * AMETHYST_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * AMETHYST_PATROL_SPEED;
      }
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      clampEnemyToBounds(enemy);
      enemy.burstTimerMs -= deltaMs;
      if (enemy.burstTimerMs <= 0) {
        enemy.burstTimerMs = AMETHYST_BURST_CD_MS + Math.random() * AMETHYST_BURST_JITTER;
        for (let b = 0; b < AMETHYST_BURST_COUNT; b++) {
          const angle = (b / AMETHYST_BURST_COUNT) * Math.PI * 2;
          amethystShards.push(makeAmethystShard(enemy.x, enemy.y, Math.cos(angle) * AMETHYST_SHARD_SPEED, Math.sin(angle) * AMETHYST_SHARD_SPEED));
        }
      }
    }
  }

  function updateAmethystShards(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = amethystShards.length - 1; i >= 0; i--) {
      const s = amethystShards[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.lifeMs -= deltaMs;
      if (s.lifeMs <= 0 || s.x < 0 || s.x > widthPx || s.y < 0 || s.y > heightPx) {
        amethystShards.splice(i, 1); continue;
      }
      if (!s.hasHitPlayer) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          s.hasHitPlayer = true;
          dealDamageToPlayer(s.atk);
        }
      }
    }
  }

  function drawAmethystEnemies(): void {
    for (const enemy of amethystEnemies) {
      if (enemy.shieldHp > 0) {
        const shieldRatio = enemy.shieldHp / enemy.maxShieldHp;
        ctx.save();
        ctx.globalAlpha = 0.3 + shieldRatio * 0.4;
        ctx.strokeStyle = AMETHYST_ENEMY_GLOW; ctx.lineWidth = 2;
        ctx.shadowBlur = AMETHYST_ENEMY_SIZE * 4; ctx.shadowColor = AMETHYST_ENEMY_GLOW;
        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, AMETHYST_ENEMY_SIZE * 1.8, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
      }
      const half = AMETHYST_ENEMY_SIZE / 2;
      ctx.shadowBlur = AMETHYST_ENEMY_SIZE * 5; ctx.shadowColor = AMETHYST_ENEMY_GLOW;
      ctx.fillStyle = AMETHYST_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), AMETHYST_ENEMY_SIZE, AMETHYST_ENEMY_SIZE);
      ctx.shadowBlur = 0;
      const barW = AMETHYST_ENEMY_SIZE * 3; const barH = 2;
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + AMETHYST_ENEMY_SIZE + 2, barW, barH);
      ctx.fillStyle = AMETHYST_ENEMY_COLOR;
      ctx.fillRect(enemy.x - barW / 2, enemy.y + AMETHYST_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  function drawAmethystShards(): void {
    for (const s of amethystShards) {
      const half = AMETHYST_SHARD_SIZE / 2;
      ctx.save();
      ctx.translate(Math.floor(s.x), Math.floor(s.y));
      ctx.rotate(Math.PI / 4);
      ctx.shadowBlur = AMETHYST_SHARD_SIZE * 3; ctx.shadowColor = AMETHYST_SHARD_GLOW;
      ctx.fillStyle = AMETHYST_SHARD_COLOR;
      ctx.fillRect(-half, -half, AMETHYST_SHARD_SIZE, AMETHYST_SHARD_SIZE);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ── Diamond enemy system ──────────────────────────────────────

  function updateDiamondEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of diamondEnemies) {
      enemy.phaseTimerMs -= deltaMs;
      if (enemy.phaseTimerMs <= 0) {
        if (enemy.phaseInvuln) {
          enemy.phaseInvuln = false;
          enemy.phaseTimerMs = DIAMOND_PHASE_VULN_MS;
        } else {
          enemy.phaseInvuln = true;
          enemy.phaseTimerMs = DIAMOND_PHASE_INVULN_MS;
        }
      }
      if (enemy.phaseInvuln) {
        enemy.orbitAngle += DIAMOND_ORBIT_SPEED * (deltaMs / 1000);
        enemy.x = mote.x + Math.cos(enemy.orbitAngle) * 80;
        enemy.y = mote.y + Math.sin(enemy.orbitAngle) * 80;
        const half = DIAMOND_ENEMY_SIZE / 2;
        enemy.x = Math.max(half, Math.min(widthPx - half, enemy.x));
        enemy.y = Math.max(half, Math.min(heightPx - half, enemy.y));
      } else {
        const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;
        enemy.vx = (dx / dist) * DIAMOND_PATROL_SPEED;
        enemy.vy = (dy / dist) * DIAMOND_PATROL_SPEED;
        enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
        clampEnemyToBounds(enemy);
        enemy.shardTimerMs -= deltaMs;
        if (enemy.shardTimerMs <= 0) {
          enemy.shardTimerMs = DIAMOND_SHARD_CD_MS + Math.random() * 500;
          for (let b = 0; b < DIAMOND_SHARD_COUNT; b++) {
            const angle = (b / DIAMOND_SHARD_COUNT) * Math.PI * 2;
            diamondShards.push(makeDiamondShard(enemy.x, enemy.y, Math.cos(angle) * DIAMOND_SHARD_SPEED, Math.sin(angle) * DIAMOND_SHARD_SPEED));
          }
        }
      }
    }
  }

  function updateDiamondShards(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = diamondShards.length - 1; i >= 0; i--) {
      const s = diamondShards[i];
      s.x += s.vx * dt; s.y += s.vy * dt;
      s.lifeMs -= deltaMs;
      if (s.lifeMs <= 0 || s.x < 0 || s.x > widthPx || s.y < 0 || s.y > heightPx) {
        diamondShards.splice(i, 1); continue;
      }
      if (!s.hasHitPlayer) {
        const dx = s.x - mote.x, dy = s.y - mote.y;
        if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          s.hasHitPlayer = true;
          dealDamageToPlayer(s.atk);
        }
      }
    }
  }

  function drawDiamondEnemies(): void {
    for (const enemy of diamondEnemies) {
      const half = DIAMOND_ENEMY_SIZE / 2;
      ctx.save();
      ctx.translate(Math.floor(enemy.x), Math.floor(enemy.y));
      ctx.rotate(Math.PI / 4);
      const glowColor = enemy.phaseInvuln ? '#aaddff' : DIAMOND_ENEMY_GLOW;
      ctx.shadowBlur = DIAMOND_ENEMY_SIZE * (enemy.phaseInvuln ? 10 : 5);
      ctx.shadowColor = glowColor;
      ctx.fillStyle = enemy.phaseInvuln ? '#aaddff' : DIAMOND_ENEMY_COLOR;
      ctx.globalAlpha = enemy.phaseInvuln ? 0.6 : 1;
      ctx.fillRect(-half, -half, DIAMOND_ENEMY_SIZE, DIAMOND_ENEMY_SIZE);
      ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      ctx.restore();
      const barW = DIAMOND_ENEMY_SIZE * 3; const barH = 2;
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + DIAMOND_ENEMY_SIZE + 2, barW, barH);
      ctx.fillStyle = DIAMOND_ENEMY_COLOR;
      ctx.fillRect(enemy.x - barW / 2, enemy.y + DIAMOND_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  function drawDiamondShards(): void {
    for (const s of diamondShards) {
      const half = DIAMOND_SHARD_SIZE / 2;
      ctx.save();
      ctx.translate(Math.floor(s.x), Math.floor(s.y));
      ctx.rotate(Math.PI / 4);
      ctx.shadowBlur = DIAMOND_SHARD_SIZE * 4; ctx.shadowColor = DIAMOND_SHARD_GLOW;
      ctx.fillStyle = DIAMOND_SHARD_COLOR;
      ctx.fillRect(-half, -half, DIAMOND_SHARD_SIZE, DIAMOND_SHARD_SIZE);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  }

  // ── Nullstone enemy system ────────────────────────────────────

  function updateNullstoneEnemies(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (const enemy of nullstoneEnemies) {
      enemy.pulseMs += deltaMs;
      // Gravity pull on player
      const gdx = enemy.x - mote.x, gdy = enemy.y - mote.y;
      const gdist = Math.sqrt(gdx * gdx + gdy * gdy);
      if (gdist > 0 && gdist < NULLSTONE_GRAVITY_RADIUS) {
        mote.vx += (gdx / gdist) * NULLSTONE_GRAVITY_STRENGTH * gdist * dt;
        mote.vy += (gdy / gdist) * NULLSTONE_GRAVITY_STRENGTH * gdist * dt;
      }
      // Absorb / immunity cycling
      if (enemy.isAbsorbing) {
        enemy.absorbTimerMs -= deltaMs;
        if (enemy.absorbTimerMs <= 0) { enemy.isAbsorbing = false; enemy.absorbCdMs = NULLSTONE_ABSORB_CD_MS; }
      } else {
        enemy.absorbCdMs -= deltaMs;
        if (enemy.absorbCdMs <= 0) { enemy.isAbsorbing = true; enemy.absorbTimerMs = NULLSTONE_ABSORB_MS; }
      }
      // Patrol
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        enemy.patrolTimerMs = NULLSTONE_PATROL_TURN_MS * (0.5 + Math.random());
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * NULLSTONE_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * NULLSTONE_PATROL_SPEED;
      }
      enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;
      clampEnemyToBounds(enemy);
      // Tendril attack
      enemy.tendrilTimerMs -= deltaMs;
      if (enemy.tendrilTimerMs <= 0) {
        enemy.tendrilTimerMs = NULLSTONE_TENDRIL_CD_MS + Math.random() * 1000;
        const tdx = mote.x - enemy.x, tdy = mote.y - enemy.y;
        const tlen = Math.sqrt(tdx * tdx + tdy * tdy) || 1;
        for (let t = 0; t < NULLSTONE_TENDRIL_COUNT; t++) {
          const spread = (t - Math.floor(NULLSTONE_TENDRIL_COUNT / 2)) * 0.4;
          const cos = Math.cos(spread), sin = Math.sin(spread);
          const tvx = ((tdx / tlen) * cos - (tdy / tlen) * sin) * VOID_TENDRIL_SPEED;
          const tvy = ((tdx / tlen) * sin + (tdy / tlen) * cos) * VOID_TENDRIL_SPEED;
          voidTendrils.push(makeVoidTendril(enemy.x, enemy.y, tvx, tvy));
        }
      }
    }
  }

  function updateVoidTendrils(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    for (let i = voidTendrils.length - 1; i >= 0; i--) {
      const t = voidTendrils[i];
      t.x += t.vx * dt; t.y += t.vy * dt;
      t.lifeMs -= deltaMs;
      if (t.lifeMs <= 0 || t.x < 0 || t.x > widthPx || t.y < 0 || t.y > heightPx) {
        voidTendrils.splice(i, 1); continue;
      }
      if (!t.hasHitPlayer) {
        const dx = t.x - mote.x, dy = t.y - mote.y;
        if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
          t.hasHitPlayer = true;
          dealDamageToPlayer(t.atk);
        }
      }
    }
  }

  function drawNullstoneEnemies(): void {
    for (const enemy of nullstoneEnemies) {
      // Gravity field ring
      const pulseT = (enemy.pulseMs % 2000) / 2000;
      ctx.save();
      ctx.globalAlpha = 0.15 * (1 - pulseT);
      ctx.strokeStyle = NULLSTONE_ENEMY_GLOW; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(enemy.x, enemy.y, NULLSTONE_GRAVITY_RADIUS * pulseT, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1; ctx.restore();
      // Absorb glow
      if (enemy.isAbsorbing) {
        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.shadowBlur = NULLSTONE_ENEMY_SIZE * 8; ctx.shadowColor = NULLSTONE_ENEMY_GLOW;
        ctx.strokeStyle = NULLSTONE_ENEMY_GLOW; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(enemy.x, enemy.y, NULLSTONE_ENEMY_SIZE * 1.8, 0, Math.PI * 2); ctx.stroke();
        ctx.shadowBlur = 0; ctx.globalAlpha = 1; ctx.restore();
      }
      // Body
      const half = NULLSTONE_ENEMY_SIZE / 2;
      ctx.shadowBlur = NULLSTONE_ENEMY_SIZE * 6; ctx.shadowColor = NULLSTONE_ENEMY_GLOW;
      ctx.fillStyle = NULLSTONE_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), NULLSTONE_ENEMY_SIZE, NULLSTONE_ENEMY_SIZE);
      ctx.shadowBlur = 0;
      const barW = NULLSTONE_ENEMY_SIZE * 3; const barH = 2;
      ctx.save(); ctx.globalAlpha = 0.7;
      ctx.fillStyle = '#222'; ctx.fillRect(enemy.x - barW / 2, enemy.y + NULLSTONE_ENEMY_SIZE + 2, barW, barH);
      ctx.fillStyle = NULLSTONE_ENEMY_COLOR;
      ctx.fillRect(enemy.x - barW / 2, enemy.y + NULLSTONE_ENEMY_SIZE + 2, barW * (enemy.hp / enemy.maxHp), barH);
      ctx.globalAlpha = 1; ctx.restore();
    }
  }

  function drawVoidTendrils(): void {
    for (const t of voidTendrils) {
      const half = VOID_TENDRIL_SIZE / 2;
      ctx.shadowBlur = VOID_TENDRIL_SIZE * 3; ctx.shadowColor = VOID_TENDRIL_GLOW;
      ctx.fillStyle = VOID_TENDRIL_COLOR;
      ctx.fillRect(Math.floor(t.x - half), Math.floor(t.y - half), VOID_TENDRIL_SIZE, VOID_TENDRIL_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  function drawAttackTrail(enemy: LaserEnemy, nowMs: number): void {
    const trail = enemy.attackTrail;
    if (!trail.active) return;
    const isDashing = trail.trailEndMs === Infinity;
    let drawProgress: number, eraseProgress: number;
    if (isDashing) {
      drawProgress = Math.min(enemy.dashTraveled / LASER_DASH_DISTANCE, 1.0);
      eraseProgress = 0;
    } else {
      drawProgress = 1.0;
      eraseProgress = Math.min((nowMs - trail.trailEndMs) / LASER_TRAIL_ERASE_MS, 1.0);
      if (eraseProgress >= 1.0) { trail.active = false; return; }
    }
    const sx = trail.startX, sy = trail.startY, tx = trail.endX, ty = trail.endY;
    const ddx = tx - sx, ddy = ty - sy;
    const L = Math.sqrt(ddx * ddx + ddy * ddy);
    if (L < 1) return;
    const midX = (sx + tx) * 0.5, midY = (sy + ty) * 0.5;
    const perpX = -ddy / L, perpY = ddx / L;
    const curveOffset = L * Math.tan(trail.controlAngle);
    const controlX = midX + perpX * curveOffset, controlY = midY + perpY * curveOffset;
    const dashLen    = L * ATTACK_TRAIL_LENGTH_SCALE;
    const dashOffset = isDashing ? dashLen * (1 - drawProgress) : -(dashLen * eraseProgress);
    const alpha = isDashing ? ATTACK_TRAIL_ALPHA : ATTACK_TRAIL_ALPHA * (1 - eraseProgress * ATTACK_TRAIL_ERASE_FADE);
    ctx.save();
    ctx.setLineDash([dashLen, dashLen]);
    ctx.lineDashOffset = dashOffset;
    ctx.lineCap = 'round'; ctx.lineJoin = 'round';
    ctx.globalAlpha = alpha;
    ctx.shadowBlur = 5; ctx.shadowColor = LASER_ENEMY_GLOW;
    ctx.strokeStyle = LASER_ENEMY_GLOW; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = LASER_ENEMY_COLOR; ctx.lineWidth = 1.2;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.quadraticCurveTo(controlX, controlY, tx, ty); ctx.stroke();
    ctx.restore();
  }

  function drawEnemies(nowMs: number): void {
    for (const enemy of enemies) {
      drawAttackTrail(enemy, nowMs);
      const half = LASER_ENEMY_SIZE / 2;
      ctx.shadowBlur = LASER_ENEMY_SIZE * 5; ctx.shadowColor = LASER_ENEMY_GLOW;
      ctx.fillStyle = LASER_ENEMY_COLOR;
      ctx.fillRect(Math.floor(enemy.x - half), Math.floor(enemy.y - half), LASER_ENEMY_SIZE, LASER_ENEMY_SIZE);
      ctx.shadowBlur = 0;
    }
  }

  function drawDeathParticles(): void {
    for (const p of deathParticles) {
      ctx.globalAlpha = p.alpha; ctx.shadowBlur = p.size * 3; ctx.shadowColor = p.color;
      ctx.fillStyle = p.color;
      ctx.fillRect(Math.floor(p.x - p.size / 2), Math.floor(p.y - p.size / 2), Math.ceil(p.size), Math.ceil(p.size));
    }
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  }

  /** Draws thin tracer lines from the player toward each recently struck enemy. */
  function drawShotLines(): void {
    if (shotLines.length === 0) return;
    ctx.save();
    ctx.lineCap = 'round';
    for (const line of shotLines) {
      const t = line.timerMs / SHOT_LINE_DURATION_MS;
      ctx.globalAlpha = t * 0.7;
      ctx.strokeStyle = line.color;
      ctx.shadowBlur  = 3; ctx.shadowColor = line.color;
      ctx.lineWidth   = 1;
      ctx.beginPath();
      ctx.moveTo(line.x1, line.y1);
      ctx.lineTo(line.x2, line.y2);
      ctx.stroke();
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Draws a small expanding square flash at each recently hit enemy position. */
  function drawHitEffects(): void {
    if (hitEffects.length === 0) return;
    ctx.save();
    for (const h of hitEffects) {
      const t    = h.timerMs / HIT_EFFECT_DURATION_MS;
      const size = 3 + (1 - t) * 5;
      const half = size / 2;
      ctx.globalAlpha = t * 0.9;
      ctx.shadowBlur  = size * 3; ctx.shadowColor = h.color; ctx.fillStyle = h.color;
      ctx.fillRect(Math.floor(h.x - half), Math.floor(h.y - half), Math.ceil(size), Math.ceil(size));
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Draws floating damage numbers and "BLOCKED" labels. */
  function drawDamageNumbers(): void {
    if (damageNumbers.length === 0) return;
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (const dn of damageNumbers) {
      const t = dn.timerMs / DAMAGE_NUM_DURATION_MS;
      // Fade in sharply, then hold, then fade out in the last third.
      const alpha = t > 0.33 ? 1.0 : t / 0.33;
      ctx.globalAlpha = alpha;
      const fontPx = Math.max(1, Math.round(dn.fontPx));
      ctx.font = `bold ${fontPx}px ${DAMAGE_NUM_FONT_FAMILY}`;
      ctx.shadowBlur  = fontPx * 2;
      ctx.shadowColor = dn.color;
      ctx.fillStyle   = dn.color;
      ctx.fillText(dn.text, Math.round(dn.x), Math.round(dn.y));
    }
    ctx.shadowBlur = 0; ctx.globalAlpha = 1;
    ctx.restore();
  }

  /** Draws one equipped-weapon visual orbit particle with comet trail. */
  function drawWeaponOrbitParticle(p: WeaponOrbitParticle): void {
    ctx.save();
    // Draw trail first
    if (p.trailCount >= 2) {
      for (let i = 0; i < p.trailCount; i++) {
        const t      = i / p.trailCount;
        const bufIdx = (p.trailHead - p.trailCount + i + WEAPON_ORBIT_TRAIL_CAP) % WEAPON_ORBIT_TRAIL_CAP;
        const trailSize = p.size * t * 1.2;
        if (trailSize < 0.3) continue;
        const half = trailSize / 2;
        ctx.globalAlpha = t * 0.5;
        ctx.shadowBlur = trailSize * 5; ctx.shadowColor = p.glowColor; ctx.fillStyle = p.glowColor;
        ctx.fillRect(Math.floor(p.trailX[bufIdx] - half), Math.floor(p.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
        ctx.shadowBlur = 0;
      }
    }
    // Draw main particle
    const half = p.size / 2;
    ctx.globalAlpha = 0.9;
    ctx.shadowBlur = p.size * 5; ctx.shadowColor = p.glowColor; ctx.fillStyle = p.glowColor;
    ctx.fillRect(Math.floor(p.x - half * 1.8), Math.floor(p.y - half * 1.8), Math.ceil(p.size * 1.8), Math.ceil(p.size * 1.8));
    ctx.shadowBlur = 0;
    ctx.fillStyle = p.color;
    ctx.fillRect(Math.floor(p.x - half), Math.floor(p.y - half), Math.ceil(p.size), Math.ceil(p.size));
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
  }

  /** Draws the orbiting projectile with comet trail. */
  function drawOrbitProjectile(): void {
    const op = orbitProjectile;
    if (!op) return;
    const projColor   = '#ffaa44';
    const projGlow    = '#ffcc88';
    ctx.save();
    // Trail
    if (op.trailCount >= 2) {
      for (let i = 0; i < op.trailCount; i++) {
        const t      = i / op.trailCount;
        const bufIdx = (op.trailHead - op.trailCount + i + ORBIT_PROJ_TRAIL_CAP) % ORBIT_PROJ_TRAIL_CAP;
        const trailSize = ORBIT_PROJ_SIZE * t * 1.3;
        if (trailSize < 0.3) continue;
        const half = trailSize / 2;
        ctx.globalAlpha = t * 0.45;
        ctx.shadowBlur = trailSize * 6; ctx.shadowColor = projGlow; ctx.fillStyle = projGlow;
        const gh = half * 2.2;
        ctx.fillRect(Math.floor(op.trailX[bufIdx] - gh), Math.floor(op.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
        ctx.shadowBlur = 0;
        ctx.globalAlpha = t * 0.7;
        ctx.fillStyle = projColor;
        ctx.fillRect(Math.floor(op.trailX[bufIdx] - half), Math.floor(op.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
    }
    // Main projectile body
    const half = ORBIT_PROJ_SIZE / 2;
    ctx.globalAlpha = 1;
    ctx.shadowBlur = ORBIT_PROJ_SIZE * 5; ctx.shadowColor = projGlow; ctx.fillStyle = projGlow;
    const gh = half * 2.2;
    ctx.fillRect(Math.floor(op.x - gh), Math.floor(op.y - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
    ctx.shadowBlur = 0;
    ctx.fillStyle = projColor;
    ctx.fillRect(Math.floor(op.x - half), Math.floor(op.y - half), ORBIT_PROJ_SIZE, ORBIT_PROJ_SIZE);
    ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    ctx.restore();
  }

  function drawWaveClearBanner(): void {
    if (!isInterWave || currentWave === 0) return;
    const t = 1 - interWaveTimerMs / INTER_WAVE_DELAY_MS;
    const fadeIn  = Math.min(t / 0.15, 1);
    const fadeOut = t > 0.75 ? Math.max(0, 1 - (t - 0.75) / 0.15) : 1;
    const alpha   = fadeIn * fadeOut * 0.85;
    if (alpha < 0.01) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgba(10, 10, 18, 0.75)';
    ctx.fillRect(0, heightPx / 2 - 32, widthPx, 64);
    ctx.fillStyle = '#ffd764'; ctx.font = 'bold 14px "Poiret One", sans-serif';
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.shadowBlur = 8; ctx.shadowColor = '#ffe599';
    const isBoss = currentWave > 0 && currentWave % 100 === 0;
    const bannerText = isBoss
      ? `${BOSS_GLYPH_LABEL} ${currentWave / 100} Cleared!`
      : `Wave ${currentWave} Cleared!`;
    ctx.fillText(bannerText, widthPx / 2, heightPx / 2 - 8);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#c9a84c'; ctx.font = '10px "Poiret One", sans-serif';
    ctx.fillText('Next wave incoming\u2026', widthPx / 2, heightPx / 2 + 10);
    ctx.restore();
  }

  function draw(nowMs: number): void {
    ctx.clearRect(0, 0, widthPx, heightPx);
    ctx.fillStyle = '#0a0a12';
    ctx.fillRect(0, 0, widthPx, heightPx);

    // Fluid background — rendered first so all gameplay elements appear above it.
    fluid.render(ctx);

    drawEnemies(nowMs);
    drawSapphireEnemies();
    drawSapphireMissiles();
    drawEmeraldEnemies();
    drawAmberEnemies();
    drawAmberShards();
    drawVoidEnemies();
    drawQuartzEnemies();
    drawQuartzSpikes();
    drawRubyEnemies();
    drawRubyBolts();
    drawSunstoneEnemies();
    drawCitrineEnemies();
    drawCitrineBolts();
    drawIoliteEnemies();
    drawAmethystEnemies();
    drawAmethystShards();
    drawDiamondEnemies();
    drawDiamondShards();
    drawNullstoneEnemies();
    drawVoidTendrils();
    drawShotLines();
    drawSandProjectiles();
    drawLaserBeamEffect();

    // Player comet trail — smoothly gated by glowMovementIntensity
    if (glowMovementIntensity > 0.02 && mote.trailCount >= 2) {
      const trailLen = mote.trailCount;
      for (let i = 0; i < trailLen; i++) {
        const t      = i / trailLen;
        const bufIdx = (mote.trailHead - trailLen + i + RPG_TRAIL_CAPACITY) % RPG_TRAIL_CAPACITY;
        const trailSize = RPG_MOTE_SIZE * t * 1.3;
        if (trailSize < 0.3) continue;
        const half = trailSize / 2;
        ctx.globalAlpha = t * 0.45 * glowMovementIntensity;
        ctx.shadowBlur  = trailSize * 6; ctx.shadowColor = RPG_MOTE_GLOW; ctx.fillStyle = RPG_MOTE_GLOW;
        const gh = half * 2.2;
        ctx.fillRect(Math.floor(mote.trailX[bufIdx] - gh), Math.floor(mote.trailY[bufIdx] - gh), Math.ceil(gh * 2), Math.ceil(gh * 2));
        ctx.shadowBlur = 0;
        ctx.globalAlpha = t * 0.7 * glowMovementIntensity;
        ctx.fillStyle   = RPG_MOTE_COLOR;
        ctx.fillRect(Math.floor(mote.trailX[bufIdx] - half), Math.floor(mote.trailY[bufIdx] - half), Math.ceil(trailSize), Math.ceil(trailSize));
      }
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
    }

    const playerVisible = rpgPhase === 'alive' || rpgPhase === 'dying';
    if (playerVisible) {
      const pa = rpgPhase === 'dying' ? deathAlpha : 1;
      const pulseT   = (Math.sin(glowTimeS * GLOW_PULSE_SPEED) + 1) * 0.5;
      // Dampen the stationary glow while the player is moving — the comet
      // trail already gives strong visual feedback during motion.
      const glowDampeningFactor = 1 - glowMovementIntensity * 0.65;
      // During iframes: tint the glow blue and flicker the sprite at ~8 Hz.
      const inIFrames = playerIFramesMs > 0;
      const iFrameFlicker = inIFrames && (Math.floor(playerIFramesMs / IFRAME_FLICKER_INTERVAL_MS) % 2 === 0);
      const moteGlowColor  = inIFrames ? '#74c0fc' : RPG_MOTE_GLOW;
      const moteBodyColor  = inIFrames ? '#b0d4ff' : RPG_MOTE_COLOR;
      const glowSize = RPG_MOTE_SIZE * (2.2 + pulseT * 1.4 * glowDampeningFactor);
      const glowHalf = glowSize / 2;
      ctx.globalAlpha = (0.18 + pulseT * 0.22) * glowDampeningFactor * pa;
      ctx.shadowBlur  = glowSize * 3; ctx.shadowColor = moteGlowColor; ctx.fillStyle = moteGlowColor;
      ctx.fillRect(Math.floor(mote.x - glowHalf), Math.floor(mote.y - glowHalf), Math.ceil(glowSize), Math.ceil(glowSize));
      ctx.globalAlpha = 1; ctx.shadowBlur = 0;
      if (!iFrameFlicker) {
        ctx.globalAlpha = pa;
        ctx.shadowBlur  = RPG_MOTE_SIZE * 5; ctx.shadowColor = moteGlowColor; ctx.fillStyle = moteBodyColor;
        const mh = RPG_MOTE_SIZE / 2;
        ctx.fillRect(Math.floor(mote.x - mh), Math.floor(mote.y - mh), RPG_MOTE_SIZE, RPG_MOTE_SIZE);
        ctx.shadowBlur = 0; ctx.globalAlpha = 1;
      }
    }

    drawHitEffects();
    drawDamageNumbers();
    if (deathParticles.length > 0) drawDeathParticles();

    // Draw weapon orbit particles, orbit projectile, and special weapon visuals above the player.
    if (rpgPhase === 'alive') {
      for (const p of weaponOrbitParticles) drawWeaponOrbitParticle(p);
      drawOrbitProjectile();
      for (const ws of chainWhipStates.values()) drawChainWhip(ws);
    }

    if (joystick.isActive && rpgPhase === 'alive') {
      ctx.save();
      ctx.globalAlpha = 0.35; ctx.strokeStyle = '#c9a84c'; ctx.lineWidth = 1;
      ctx.beginPath(); ctx.arc(joystick.baseX, joystick.baseY, JOYSTICK_OUTER_RADIUS, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 0.55; ctx.fillStyle = '#c9a84c';
      ctx.shadowBlur = JOYSTICK_THUMB_RADIUS * 2; ctx.shadowColor = 'rgba(201, 168, 76, 0.6)';
      ctx.beginPath(); ctx.arc(joystick.thumbX, joystick.thumbY, JOYSTICK_THUMB_RADIUS, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0; ctx.restore();
    }

    if (rpgPhase === 'alive') drawWaveClearBanner();

    if (screenDarken > 0) {
      ctx.globalAlpha = screenDarken; ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, widthPx, heightPx); ctx.globalAlpha = 1;
    }
    if (rpgPhase === 'restarting') {
      ctx.globalAlpha = 1 - restartFadeAlpha; ctx.fillStyle = '#000000';
      ctx.fillRect(0, 0, widthPx, heightPx); ctx.globalAlpha = 1;
    }
  }

  function updateDying(deltaMs: number): void {
    phaseTimerMs += deltaMs;
    const t = Math.min(phaseTimerMs / DEATH_ANIM_DURATION_MS, 1);
    deathAlpha   = Math.max(0, 1 - t * 1.25);
    screenDarken = Math.min(t * 0.85, 0.85);
    for (const p of deathParticles) {
      p.x += p.vx * deltaMs * 0.06; p.y += p.vy * deltaMs * 0.06;
      p.alpha = Math.max(0, 1 - t * 1.5);
      p.vx *= 0.97; p.vy *= 0.97;
    }
    if (phaseTimerMs >= DEATH_ANIM_DURATION_MS + DEATH_HOLD_DURATION_MS) {
      screenDarken = 1;
      doRestart();
      rpgPhase = 'restarting'; phaseTimerMs = 0; restartFadeAlpha = 0;
    }
  }

  function updateRestarting(deltaMs: number): void {
    phaseTimerMs    += deltaMs;
    restartFadeAlpha = Math.min(1, phaseTimerMs / RESTART_FADE_IN_MS);
    screenDarken     = 0;
    if (phaseTimerMs >= RESTART_FADE_IN_MS) rpgPhase = 'alive';
  }

  return {
    canvas,
    statsPanel,

    update(deltaMs: number, autoMoveEnabled = false): void {
      const nowMs = performance.now();
      glowTimeS += deltaMs / 1000;
      _autoMoveEnabled = autoMoveEnabled;

      if (rpgPhase === 'dying') {
        updateDying(deltaMs);
        fluid.step(deltaMs);
        draw(nowMs);
        updateStatsPanelDom();
        return;
      }
      if (rpgPhase === 'restarting') {
        updateRestarting(deltaMs);
        fluid.step(deltaMs);
        draw(nowMs);
        updateStatsPanelDom();
        return;
      }

      if (isInterWave) {
        interWaveTimerMs -= deltaMs;
        if (interWaveTimerMs <= 0) startNextWave();
      } else {
        tickSpawnQueue(deltaMs);
        checkWaveCompletion();
      }

      updatePhysics(deltaMs);
      updateEnemies(deltaMs, nowMs);
      updateSapphireEnemies(deltaMs, nowMs);
      updateSapphireMissiles(deltaMs);
      updateEmeraldEnemies(deltaMs);
      updateAmberEnemies(deltaMs);
      updateAmberShards(deltaMs);
      updateVoidEnemies(deltaMs);
      updateQuartzEnemies(deltaMs);
      updateQuartzSpikes(deltaMs);
      updateRubyEnemies(deltaMs);
      updateRubyBolts(deltaMs);
      updateSunstoneEnemies(deltaMs);
      updateCitrineEnemies(deltaMs);
      updateCitrineBolts(deltaMs);
      updateIoliteEnemies(deltaMs);
      updateAmethystEnemies(deltaMs);
      updateAmethystShards(deltaMs);
      updateDiamondEnemies(deltaMs);
      updateDiamondShards(deltaMs);
      updateNullstoneEnemies(deltaMs);
      updateVoidTendrils(deltaMs);
      updateWeaponOrbitParticles(deltaMs);
      updateOrbitProjectile(deltaMs);
      updateSandProjectiles(deltaMs);
      // Update chain whip for all equipped chainWhip weapons
      for (const weaponId of rpgSimState.equippedWeaponIds) {
        const wd = WEAPON_BY_ID.get(weaponId);
        if (wd?.stats.effect?.kind === 'chainWhip') updateChainWhip(weaponId, deltaMs);
      }
      updateLaserBeamEffect(deltaMs);
      removeDeadEnemies();
      checkWaveCompletion();

      // ── Per-weapon auto-attack timers ─────────────────────────────
      for (const weaponId of rpgSimState.equippedWeaponIds) {
        const weaponDef = WEAPON_BY_ID.get(weaponId);
        // Chain whip fires itself via updateChainWhip's internal cooldown
        if (weaponDef?.stats.effect?.kind === 'chainWhip') continue;
        const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
        const cooldownMs = weaponDef
          ? getScaledWeaponCooldown(weaponDef.stats.cooldownMs, tier)
          : PLAYER_BASE_COOLDOWN_MS;
        const current = weaponAttackTimers.get(weaponId) ?? 0;
        const next = current - deltaMs;
        if (next <= 0) {
          weaponAttackTimers.set(weaponId, cooldownMs);
          performWeaponAttack(weaponId);
          removeDeadEnemies();
          checkWaveCompletion();
        } else {
          weaponAttackTimers.set(weaponId, next);
        }
      }
      // If no weapons equipped, use base attack with default cooldown
      if (rpgSimState.equippedWeaponIds.size === 0) {
        const current = weaponAttackTimers.get(BASE_ATTACK_TIMER_KEY) ?? 0;
        const next = current - deltaMs;
        if (next <= 0) {
          weaponAttackTimers.set(BASE_ATTACK_TIMER_KEY, PLAYER_BASE_COOLDOWN_MS);
          performWeaponAttack(BASE_ATTACK_TIMER_KEY);
          removeDeadEnemies();
          checkWaveCompletion();
        } else {
          weaponAttackTimers.set(BASE_ATTACK_TIMER_KEY, next);
        }
      }
      updateShotVisuals(deltaMs);
      updateDamageNumbers(deltaMs);

      if (playerStats.hp <= 0) triggerDeath();
      updateStatsPanelDom();
      fluid.step(deltaMs);
      draw(nowMs);
    },

    resize(cont: HTMLElement): void {
      doResize(cont);
      const half = RPG_MOTE_SIZE / 2;
      mote.x = Math.max(half, Math.min(widthPx  - half, mote.x));
      mote.y = Math.max(half, Math.min(heightPx - half, mote.y));
    },

    setActive(active: boolean): void {
      _isActive = active;
      if (!active) { keys.left = keys.right = keys.up = keys.down = false; }
      if (active) {
        applyEquipmentStats();
        if (currentWave === 0 && rpgPhase === 'alive') {
          isInterWave = true;
          interWaveTimerMs = INTER_WAVE_DELAY_MS * 0.4;
        }
      }
    },

    notifyEquip(): void {
      applyEquipmentStats();
    },
  };
}
