/**
 * rpg-constants.ts — Numeric and string constants for the RPG rendering system.
 *
 * Extracted from rpg-render.ts to keep the constant pool navigable.
 * Imports PLAYER_BASE_ATK from rpg-state.ts solely to initialise PLAYER_ATK_INIT;
 * rpg-render.ts therefore has an indirect dependency on rpg-state.ts for this value
 * via the rpg-constants → rpg-state chain.
 */
import { PLAYER_BASE_ATK } from '../../sim/rpg/rpg-state';

export const RPG_TRAIL_CAPACITY   = 60;
export const MAX_RPG_SPEED        = 3.0;
export const RPG_VELOCITY_DAMPING = 0.88;
export const RPG_MOTE_SIZE        = 3;
export const RPG_MOTE_COLOR       = '#ffd764';
export const RPG_MOTE_GLOW        = '#ffe599';
export const TRAIL_SPEED_THRESHOLD = 0.15;
export const GLOW_PULSE_SPEED      = 2.5;
export const GLOW_MOVE_RAMP_UP   = 0.007;
export const GLOW_MOVE_RAMP_DOWN = 0.004;

export const PLAYER_HP_INIT  = 100;
export const PLAYER_ATK_INIT = PLAYER_BASE_ATK;
export const PLAYER_DEF_INIT =   5;

export const JOYSTICK_OUTER_RADIUS = 28;
export const JOYSTICK_THUMB_RADIUS = 12;

export const LASER_ENEMY_SIZE        =   4;
export const LASER_ENEMY_COLOR       = '#ff3333';
export const LASER_ENEMY_GLOW        = '#ff6666';
export const LASER_HP_INIT           =  20;
export const LASER_ATK_INIT          =  10;
export const LASER_DEF_INIT          =   5;
export const LASER_ATTACK_RADIUS     =  80;
export const LASER_DECEL_DURATION_MS = 500;
export const LASER_DASH_SPEED        =   8.0;
export const LASER_DASH_DISTANCE     = 100;
export const LASER_COOLDOWN_MS       = 1250;
export const LASER_OVERSHOOT_DAMPING = 0.72;
export const LASER_OVERSHOOT_STOP    = 0.15;
export const LASER_TRAIL_ERASE_MS    = 450;
export const LASER_PATROL_SPEED_MAX  = 0.7;
export const LASER_PATROL_DAMPING    = 0.97;
export const LASER_PATROL_TURN_MS    = 2500;

export const PLAYER_HIT_RADIUS = 4;

export const LASER_DECEL_FACTOR             = 0.80;
export const ATTACK_TRAIL_CURVE_VARIATION   = 0.35;
export const ATTACK_TRAIL_LENGTH_SCALE      = 1.1;
export const ATTACK_TRAIL_ALPHA             = 0.9;
export const ATTACK_TRAIL_ERASE_FADE        = 0.5;
export const PATROL_TURN_DELAY_MIN_FACTOR   = 0.6;
export const PATROL_TURN_DELAY_RANGE_FACTOR = 0.8;

export const INTER_WAVE_DELAY_MS = 2500;
export const DEATH_ANIM_DURATION_MS = 1800;
export const DEATH_HOLD_DURATION_MS = 400;
export const RESTART_FADE_IN_MS     = 700;
export const DEATH_BURST_COUNT      = 20;
/** Colors used for the radial death burst particles. */
export const DEATH_PARTICLE_COLORS  = ['#ffd764', '#ffe599', '#ffcc33', '#ffffff'] as const;

// ── Player attack constants ────────────────────────────────────────
/** Cooldown (ms) when no weapon is equipped. */
export const PLAYER_BASE_COOLDOWN_MS  = 1200;
/** Attack range (px) when no weapon is equipped. */
export const PLAYER_BASE_RANGE_PX     = 50;
/** Duration (ms) for the hit-flash visual effect. */
export const HIT_EFFECT_DURATION_MS   = 220;
/** Sentinel weapon id used in `weaponAttackTimers` when no weapon is equipped. */
export const BASE_ATTACK_TIMER_KEY    = '__base__';
/** Duration (ms) for the shot-line visual effect. */
export const SHOT_LINE_DURATION_MS    = 120;
/** Target frame time in ms at 60 FPS — used to normalise dt-scaled physics. */
export const TARGET_FRAME_MS          = 16.667;
/** Flicker on/off interval (ms) while the player has invincibility frames (~8 Hz). */
export const IFRAME_FLICKER_INTERVAL_MS = 62.5;

// ── Damage numbers ─────────────────────────────────────────────
/** How long a damage number stays visible (ms). */
export const DAMAGE_NUM_DURATION_MS   = 900;
/** Minimum font size for a nearly-zero-damage hit (internal canvas px). 3× original. */
export const DAMAGE_NUM_MIN_FONT_PX   = 12;
/** Maximum font size for a 100 %-health hit (internal canvas px). 3× original. */
export const DAMAGE_NUM_MAX_FONT_PX   = 42;
/** Initial travel speed of a damage number (px per dt unit). */
export const DAMAGE_NUM_INITIAL_SPEED = 1.8;
/** Per-frame velocity damping factor (at 60 fps scale). */
export const DAMAGE_NUM_DECEL         = 0.88;

// ── Invincibility frames ────────────────────────────────────────
/** Minimum iframes duration after any hit (ms). */
export const PLAYER_IFRAME_MIN_MS     = 280;
/** Additional iframes earned for a full-HP (100 %) hit (ms). */
export const PLAYER_IFRAME_MAX_ADD_MS = 1200;

// ── Knockback ───────────────────────────────────────────────────
/** Maximum knockback speed applied at 100 % relative damage. */
export const PLAYER_KNOCKBACK_MAX     = 7.0;

// ── Auto-move ──────────────────────────────────────────────────
/** Minimum joystick displacement (canvas px) to count as active manual control. */
export const AUTO_MOVE_JOYSTICK_DEAD_ZONE = 1.0;

// ── Equipped-weapon visual particle ───────────────────────────
/** Angular speed of the equipped-weapon orbit particle (radians per second). */
export const WEAPON_PARTICLE_ORBIT_SPEED  = 2.2;
/** Orbit radius for the equipped-weapon particle (internal px). */
export const WEAPON_PARTICLE_ORBIT_RADIUS = 12;
/** Minimum speed so the particle never appears frozen. */
export const WEAPON_PARTICLE_MIN_SPEED    = 0.5;

// ── Orbiting projectile upgrade ───────────────────────────────
/** Angular speed of the orbit projectile (radians per second). Rotation is counter-clockwise (angle is decremented each frame). */
export const ORBIT_PROJ_SPEED_RAD   = 7.0;  // 2× original speed
/** Orbit radius for the orbit projectile (internal px). */
export const ORBIT_PROJ_RADIUS      = 20;
/** Size (px) of the orbit projectile mote. */
export const ORBIT_PROJ_SIZE        = 3;
/** Trail capacity for the orbit projectile. */
export const ORBIT_PROJ_TRAIL_CAP   = 20;
/** Trail capacity for the equipped-weapon orbit particle. */
export const WEAPON_ORBIT_TRAIL_CAP = 20;
/** Hit radius for orbit projectile — enemy collision detection. */
export const ORBIT_PROJ_HIT_RADIUS  = 5;
/** Damage dealt per orbit-projectile hit. */
export const ORBIT_PROJ_DAMAGE      = 15;
/** Cooldown between orbit-projectile hits on the same enemy (ms). */
export const ORBIT_PROJ_HIT_CD_MS   = 500;
/** Font string for damage number rendering. */
export const DAMAGE_NUM_FONT_FAMILY = '"Pixelify Sans", monospace';

// ── Sapphire enemy constants ───────────────────────────────────
export const SAPPHIRE_ENEMY_SIZE      =   6;
export const SAPPHIRE_ENEMY_COLOR     = '#5b9aff';
export const SAPPHIRE_ENEMY_GLOW      = '#88bbff';
export const SAPPHIRE_HP_INIT         = 250;
export const SAPPHIRE_ATK_INIT        =  15;
export const SAPPHIRE_DEF_INIT        =   8;
export const SAPPHIRE_SHIELD_RADIUS   =  18;  // circle shield radius (px)
export const SAPPHIRE_SHIELD_HP_INIT  = 120;
export const SAPPHIRE_PATROL_SPEED    =   0.45;
export const SAPPHIRE_PATROL_TURN_MS  = 3200;
export const SAPPHIRE_MISSILE_CD_MS   = 4000;  // ms between missiles
export const SAPPHIRE_MISSILE_JITTER  =  800;  // ±random offset to missile CD

// ── Sapphire missile constants ─────────────────────────────────
export const MISSILE_SIZE              =   3;
export const MISSILE_SPEED             =   1.2;   // initial speed (px/frame at 60fps)
export const MISSILE_SEEK_STR          =   0.025; // fraction of remaining error corrected per frame
export const MISSILE_MAX_SPEED         =   1.8;
export const MISSILE_HP_INIT           =  30;
export const MISSILE_ATK_INIT          =  18;
export const MISSILE_TRAIL_CAP         =  40;
export const MISSILE_COLOR             = '#ff7733';
export const MISSILE_GLOW              = '#ffaa55';
/** Fraction of MISSILE_TRAIL_CAP used for the dash segment in the trail lineDash effect. */
export const MISSILE_TRAIL_DASH_RATIO  =   0.6;
/** Minimum shield damage — shields always take at least this much damage per hit. */
export const MINIMUM_SHIELD_DAMAGE     =   1;
/** Small epsilon used to guard against division-by-zero in speed normalisation. */
export const SPEED_EPSILON             =   0.001;

// ── Sand gatling projectile constants ──────────────────────────
export const SAND_PROJ_SPEED      =   5.0;
export const SAND_PROJ_SIZE       =   2;
export const SAND_PROJ_LIFE_MS    = 800;
export const SAND_PROJ_COLOR      = '#ddc080';
export const SAND_PROJ_GLOW       = '#ffe8a0';

// ── Quartz chain whip constants ────────────────────────────────
export const CHAIN_NODES           =   5;
/** Radius of node 0 (closest to player, smallest). */
export const CHAIN_MIN_RADIUS      =   2;
/** Radius of node CHAIN_NODES-1 (tip, farthest from player, largest). */
export const CHAIN_MAX_RADIUS      =   6;
export const CHAIN_NODE_COLOR      = '#a0d8ef';
export const CHAIN_NODE_GLOW       = '#c8eeff';
export const CHAIN_LINE_COLOR      = '#88c8e8';
export const CHAIN_LASH_MS         = 280;   // ms for tip to lash toward target
export const CHAIN_RETRACT_MS      = 320;   // ms in retracting phase before returning to idle
/** Damage ticks per I-frame interval (ms). */
export const CHAIN_HIT_CD_MS       =  62.5;
// ── Softbody whip physics constants ──
/** Rest spacing (px) between adjacent nodes. */
export const CHAIN_REST_LENGTH     =  10;
/** Spring stiffness between adjacent nodes. */
export const CHAIN_SPRING_K        =   0.40;
/** Anchor spring pulling node 0 toward the player (idle). */
export const CHAIN_ANCHOR_K        =   0.60;
/** Anchor spring during retract phase (stronger pull). */
export const CHAIN_RETRACT_ANCHOR_K = 2.0;
/** Per-dt velocity damping factor (applied as pow(DAMPING, dt)). */
export const CHAIN_DAMPING         =   0.85;
/** Initial speed given to the tip node when a lash is triggered (px/dt). */
export const CHAIN_LASH_SPEED      =  20;
/** Inertia of node 0 (closest to player, most responsive). */
export const CHAIN_MIN_INERTIA     =   0.8;
/** Inertia of tip node (farthest, least responsive / most momentum). */
export const CHAIN_MAX_INERTIA     =   4.0;

// ── Ruby laser beam constants ──────────────────────────────────
export const LASER_BEAM_VISIBLE_MS  = 400;   // how long the beam stays on screen
export const LASER_BEAM_COLOR       = '#ff2222';
export const LASER_BEAM_GLOW        = '#ff8888';
export const LASER_BEAM_WIDTH       =   2.5;

// ── Nullstone vortex weapon constants ─────────────────────────
export const VORTEX_PULL_STRENGTH      = 0.6;    // px/frame gravity pull toward vortex center
export const VORTEX_DAMAGE_INTERVAL_MS = 1000;   // ms between damage ticks
export const VORTEX_SPAWN_DIST         = 60;     // px from player center at spawn
export const VORTEX_COLOR              = '#9664c8';
export const VORTEX_GLOW               = '#c496f0';
export const VORTEX_SPIN_RATE          = 2.0;    // rad/s

// ── Diamond sword constants ────────────────────────────────────
/** Duration of the single swipe animation (ms). Much faster than before. */
export const SWORD_SWING_MS   = 60;
export const SWORD_COLOR      = '#b8e8ff';
export const SWORD_GLOW       = '#e0f4ff';
/**
 * Pastel prismatic colors for the diamond sword shards.
 * Very light blue base with a rainbow sheen.
 */
export const SWORD_PRISMATIC_COLORS: readonly string[] = [
  '#c8e8ff', // very light blue (base)
  '#d4d8ff', // lavender blue
  '#e0ccff', // soft violet
  '#f0ccff', // light mauve
  '#ffd4f0', // soft pink
  '#ffd8d0', // light peach
  '#fff4cc', // pale yellow
  '#d8ffcc', // mint green
  '#ccf4f0', // ice blue
  '#cce8ff', // sky blue
];
/** Number of prismatic polygon shards making up the blade. */
export const SWORD_SHARD_COUNT      = 7;
/** Base radius (px) of each shard polygon. */
export const SWORD_SHARD_SIZE_BASE  = 1.5;
/** Spring stiffness for the blade hinge — pulls swordAngle toward the rest angle. */
export const SWORD_HINGE_SPRING_K   = 0.07;
/** Per-frame angular-velocity damping for the hinge. */
export const SWORD_HINGE_DAMPING    = 0.88;
/** How closely shard[0] (handle) follows the hinge angle per frame (0-1). */
export const SWORD_SHARD_FOLLOW_BASE  = 0.55;
/** How much the follow-rate decreases per shard index (tip = most lag). */
export const SWORD_SHARD_FOLLOW_DECAY = 0.06;
/** Duration (ms) of the prismatic beam visual after a hit. */
export const SWORD_BEAM_DURATION_MS   = 280;
/** Duration (ms) of the disconnected swipe-arc visual. */
export const SWORD_SWIPE_VISUAL_MS    = 160;
/** Arc width is exactly π radians (180°) for the full right-to-left / left-to-right sweep. */
export const SWORD_SWIPE_ARC_HALF_RAD = Math.PI / 2;
/** Fluid force strength from sword drag (added each frame per shard). */
export const SWORD_FLUID_DRAG_STR    = 0.4;
/** Fluid force strength during a swipe (per arc sample). */
export const SWORD_FLUID_SWIPE_STR   = 2.0;
/** Default cooldown (ms) when no weapon def is found. Reduced for fast alternating cuts. */
export const SWORD_DEFAULT_COOLDOWN_MS = 220;
/** Rest angle of the sword when idle (0 = right of player). */
export const SWORD_IDLE_ANGLE = 0;
/** Number of consecutive same-enemy hits required to trigger the spin combo. */
export const SWORD_COMBO_THRESHOLD = 4;
/** Number of full 360° rotations during the spin combo. */
export const SWORD_COMBO_SPIN_TURNS = 3;
/** Total duration (ms) of the spin combo animation (3 fast spins). */
export const SWORD_COMBO_SPIN_MS = 450;
/** Damage multiplier per rotation tick during the spin combo (3 ticks × 1× = 3× total). */
export const SWORD_COMBO_DAMAGE_MULT = 1;
/** Range multiplier during the spin combo. */
export const SWORD_COMBO_RANGE_MULT = 2;

/**
 * Polygon shard shapes for the prismatic diamond blade.
 * Each shape is a list of [cos-offset, sin-offset] multipliers (radius-relative).
 * Applied as vertex = (cx + cos_off*r, cy + sin_off*r), then rotated by blade angle.
 */
export const SWORD_SHARD_SHAPES: ReadonlyArray<ReadonlyArray<readonly [number, number]>> = [
  // Tall diamond (4-gon)
  [[0, -1.4], [0.6, 0], [0, 1.4], [-0.6, 0]],
  // Wide triangle
  [[0, -1], [1.1, 0.8], [-1.1, 0.8]],
  // Thin rhombus (rotated diamond)
  [[0.4, -1.1], [1.0, 0], [0.4, 1.1], [-0.6, 0]],
  // Compact hexagon
  [[0.5, -0.9], [1.0, 0], [0.5, 0.9], [-0.5, 0.9], [-1.0, 0], [-0.5, -0.9]],
  // Elongated diamond
  [[0, -1.6], [0.5, 0], [0, 1.6], [-0.5, 0]],
  // Inverted triangle
  [[-1.1, -0.8], [1.1, -0.8], [0, 1.0]],
  // Small asymmetric shard
  [[0.3, -1.2], [1.1, 0.3], [-0.1, 1.0], [-0.9, -0.1]],
] as const;

// ── Iolite poison bolt constants ───────────────────────────────
export const POISON_ARMOR_IGNORE_PER_TIER = 0.1;   // armorIgnore = tier * this
export const POISON_DURATION_BASE_TIER    = 8;      // (base - tier) * POISON_DURATION_MS_PER_TIER
export const POISON_DURATION_MS_PER_TIER  = 10000;  // ms per tier offset
export const POISON_TOTAL_MULTIPLIER      = 10;     // poisonTotal = rawDamage * tier * this
export const POISON_BOLT_SPEED       = 2.0;   // px/frame (slow, magical)
export const POISON_BOLT_SIZE        = 3;
export const POISON_BOLT_COLOR       = '#8844ff';
export const POISON_BOLT_GLOW        = '#aa88ff';
export const POISON_BOLT_LIFE_MS     = 5000;  // max life before expiry
export const POISON_BOLT_TRAIL_CAP   = 30;
export const POISON_TICK_INTERVAL_MS = 2000;  // ms between poison ticks

// ── Emerald enemy constants ────────────────────────────────────
export const EMERALD_ENEMY_SIZE     =   5;
export const EMERALD_ENEMY_COLOR    = '#22dd66';
export const EMERALD_ENEMY_GLOW     = '#55ff99';
export const EMERALD_HP_INIT        =  90;
export const EMERALD_ATK_INIT       =  14;
export const EMERALD_DEF_INIT       =   4;
export const EMERALD_PATROL_SPEED   =   0.55;
export const EMERALD_PATROL_TURN_MS = 2200;
export const EMERALD_ATTACK_RADIUS  = 110;    // px — detect range that triggers blink
export const EMERALD_CHARGE_MS      = 380;    // ms charging before blink
export const EMERALD_BLINK_OFFSET   =   8;   // px offset from player center after blink
export const EMERALD_COOLDOWN_MS    = 2500;  // ms cooldown after a blink attack
export const EMERALD_GHOST_FADE_MS  = 420;   // ms for ghost afterimage to fade out
export const EMERALD_PATROL_DAMPING = 0.97;

// ── Amber enemy constants ──────────────────────────────────────
export const AMBER_ENEMY_SIZE       =   7;
export const AMBER_ENEMY_COLOR      = '#ffaa22';
export const AMBER_ENEMY_GLOW       = '#ffcc66';
export const AMBER_HP_INIT          = 380;
export const AMBER_ATK_INIT         =  20;
export const AMBER_DEF_INIT         =   8;
export const AMBER_PATROL_SPEED     =   0.35;
export const AMBER_PATROL_TURN_MS   = 3500;
export const AMBER_PATROL_DAMPING   =   0.97;
export const AMBER_MISSILE_CD_MS    = 3800;  // ms between fan bursts
export const AMBER_MISSILE_JITTER   =  700;  // ±random offset to burst CD
export const AMBER_SHARD_SPREAD_RAD =   0.38; // ±spread angle (radians) for fan
export const AMBER_SHARD_COUNT      =   3;

// ── Amber shard (projectile) constants ────────────────────────
export const AMBER_SHARD_SPEED      =   1.4;
export const AMBER_SHARD_MAX_SPEED  =   2.0;
export const AMBER_SHARD_SEEK_STR   =   0.018;
export const AMBER_SHARD_SIZE       =   3;
export const AMBER_SHARD_HP_INIT    =  25;
export const AMBER_SHARD_ATK_INIT   =  22;
export const AMBER_SHARD_TRAIL_CAP  =  35;
export const AMBER_SHARD_COLOR      = '#ff8833';
export const AMBER_SHARD_GLOW       = '#ffaa55';

// ── Void enemy constants ───────────────────────────────────────
export const VOID_ENEMY_SIZE        =   8;
export const VOID_ENEMY_COLOR       = '#9933ff';
export const VOID_ENEMY_GLOW        = '#bb66ff';
export const VOID_HP_INIT           = 750;
export const VOID_ATK_INIT          =  28;
export const VOID_DEF_INIT          =  14;
export const VOID_PURSUE_SPEED      =   0.60; // constant homing speed (px/frame)
export const VOID_CONTACT_RADIUS    =   9;   // px — contact damage distance
export const VOID_CONTACT_CD_MS     = 1200;  // ms between contact damage ticks
export const VOID_AURA_PULSE_MS     = 1400;  // ms for one full aura pulse cycle
export const VOID_AURA_RADIUS       =  14;   // px — aura ring radius

// ── Quartz enemy constants ─────────────────────────────────────
export const QUARTZ_ENEMY_SIZE        =   5;
export const QUARTZ_ENEMY_COLOR       = '#f5f0eb';
export const QUARTZ_ENEMY_GLOW        = '#faf8f5';
export const QUARTZ_HP_INIT           =  35;
export const QUARTZ_ATK_INIT          =   8;
export const QUARTZ_DEF_INIT          =   3;
export const QUARTZ_PREFERRED_DIST    =  90;
export const QUARTZ_APPROACH_SPEED    =   0.6;
export const QUARTZ_STRAFE_SPEED      =   0.5;
export const QUARTZ_SPIKE_CD_MS       = 2200;
export const QUARTZ_SPIKE_JITTER      =  400;
// ── Quartz spike (projectile) constants ────────────────────────
export const QUARTZ_SPIKE_SPEED       =   1.0;
export const QUARTZ_SPIKE_SIZE        =   3;
export const QUARTZ_SPIKE_HP_INIT     =  20;
export const QUARTZ_SPIKE_ATK_INIT    =  12;
export const QUARTZ_SPIKE_LIFE_MS     = 3000;
export const QUARTZ_SPIKE_COLOR       = '#f0e8d8';
export const QUARTZ_SPIKE_GLOW        = '#faf8f5';

// ── Ruby enemy constants ───────────────────────────────────────
export const RUBY_ENEMY_SIZE          =   5;
export const RUBY_ENEMY_COLOR         = '#dc3232';
export const RUBY_ENEMY_GLOW          = '#ff6b6b';
export const RUBY_HP_INIT             = 120;
export const RUBY_ATK_INIT            =  18;
export const RUBY_DEF_INIT            =   5;
export const RUBY_PATROL_SPEED        =   0.8;
export const RUBY_BOLT_CD_MS          = 1200;
export const RUBY_BOLT_JITTER         =  300;
export const RUBY_PREFERRED_DIST      =  60;
// ── Ruby bolt (projectile) constants ──────────────────────────
export const RUBY_BOLT_SPEED          =   2.8;
export const RUBY_BOLT_SIZE           =   2;
export const RUBY_BOLT_HP_INIT        =  15;
export const RUBY_BOLT_ATK_INIT       =  15;
export const RUBY_BOLT_LIFE_MS        = 1500;
export const RUBY_BOLT_COLOR          = '#ff4444';
export const RUBY_BOLT_GLOW           = '#ff8888';

// ── Sunstone enemy constants ───────────────────────────────────
export const SUNSTONE_ENEMY_SIZE      =   7;
export const SUNSTONE_ENEMY_COLOR     = '#ff8c3c';
export const SUNSTONE_ENEMY_GLOW      = '#ffb366';
export const SUNSTONE_HP_INIT         = 200;
export const SUNSTONE_ATK_INIT        =  16;
export const SUNSTONE_DEF_INIT        =   6;
export const SUNSTONE_PREFERRED_DIST  = 120;
export const SUNSTONE_ORBIT_SPEED     =   0.4;
export const SUNSTONE_PULSE_CD_MS     = 3500;
export const SUNSTONE_PULSE_JITTER    =  600;

// ── Citrine enemy constants ────────────────────────────────────
export const CITRINE_ENEMY_SIZE       =   5;
export const CITRINE_ENEMY_COLOR      = '#e6c850';
export const CITRINE_ENEMY_GLOW       = '#f0d870';
export const CITRINE_HP_INIT          = 150;
export const CITRINE_ATK_INIT         =  22;
export const CITRINE_DEF_INIT         =   4;
export const CITRINE_PATROL_SPEED     =   0.9;
export const CITRINE_PATROL_TURN_MS   = 1800;
export const CITRINE_BOLT_CD_MS       = 2800;
export const CITRINE_BOLT_JITTER      =  400;
// ── Citrine bolt (homing) constants ───────────────────────────
export const CITRINE_BOLT_SPEED       =   1.5;
export const CITRINE_BOLT_MAX_SPEED   =   2.4;
export const CITRINE_BOLT_SEEK        =   0.035;
export const CITRINE_BOLT_SIZE        =   3;
export const CITRINE_BOLT_HP_INIT     =  20;
export const CITRINE_BOLT_ATK_INIT    =  20;
export const CITRINE_BOLT_TRAIL_CAP   =  30;
export const CITRINE_BOLT_COLOR       = '#e6c850';
export const CITRINE_BOLT_GLOW        = '#ffe080';

// ── Iolite enemy constants ─────────────────────────────────────
export const IOLITE_ENEMY_SIZE        =   8;
export const IOLITE_ENEMY_COLOR       = '#6464b4';
export const IOLITE_ENEMY_GLOW        = '#8888cc';
export const IOLITE_HP_INIT           = 500;
export const IOLITE_ATK_INIT          =  24;
export const IOLITE_DEF_INIT          =  12;
export const IOLITE_PATROL_SPEED      =   0.3;
export const IOLITE_PATROL_TURN_MS    = 4000;
export const IOLITE_BEAM_CD_MS        = 4000;
export const IOLITE_BEAM_JITTER       =  800;
export const IOLITE_BEAM_RANGE        = 120;
export const IOLITE_BEAM_COUNT        =   5;
export const IOLITE_BEAM_SPREAD_RAD   =   1.047; // ~60 degrees each side

// ── Amethyst enemy constants ───────────────────────────────────
export const AMETHYST_ENEMY_SIZE      =   7;
export const AMETHYST_ENEMY_COLOR     = '#b464c8';
export const AMETHYST_ENEMY_GLOW      = '#d088e0';
export const AMETHYST_HP_INIT         = 800;
export const AMETHYST_ATK_INIT        =  28;
export const AMETHYST_DEF_INIT        =  15;
export const AMETHYST_SHIELD_HP_INIT  = 400;
export const AMETHYST_PATROL_SPEED    =   0.4;
export const AMETHYST_PATROL_TURN_MS  = 3500;
export const AMETHYST_BURST_CD_MS     = 3200;
export const AMETHYST_BURST_JITTER    =  500;
export const AMETHYST_BURST_COUNT     =   8;
// ── Amethyst shard constants ───────────────────────────────────
export const AMETHYST_SHARD_SPEED     =   1.8;
export const AMETHYST_SHARD_SIZE      =   3;
export const AMETHYST_SHARD_HP_INIT   =  25;
export const AMETHYST_SHARD_ATK_INIT  =  24;
export const AMETHYST_SHARD_LIFE_MS   = 1800;
export const AMETHYST_SHARD_COLOR     = '#c87ae0';
export const AMETHYST_SHARD_GLOW      = '#d88af0';

// ── Diamond enemy constants ────────────────────────────────────
export const DIAMOND_ENEMY_SIZE       =   9;
export const DIAMOND_ENEMY_COLOR      = '#e8f0fa';
export const DIAMOND_ENEMY_GLOW       = '#ffffff';
export const DIAMOND_HP_INIT          = 1500;
export const DIAMOND_ATK_INIT         =  35;
export const DIAMOND_DEF_INIT         =  20;
export const DIAMOND_PHASE_INVULN_MS  = 2000;
export const DIAMOND_PHASE_VULN_MS    = 4000;
export const DIAMOND_PATROL_SPEED     =   0.5;
export const DIAMOND_ORBIT_SPEED      =   0.3;
export const DIAMOND_SHARD_CD_MS      = 2500;
export const DIAMOND_SHARD_COUNT      =   6;
export const DIAMOND_SHARD_COLOR      = '#c0e0ff';
export const DIAMOND_SHARD_GLOW       = '#ffffff';
// ── Diamond shard constants ────────────────────────────────────
export const DIAMOND_SHARD_SPEED      =   2.2;
export const DIAMOND_SHARD_SIZE       =   3;
export const DIAMOND_SHARD_HP_INIT    =  30;
export const DIAMOND_SHARD_ATK_INIT   =  30;
export const DIAMOND_SHARD_LIFE_MS    = 1400;

// ── Nullstone enemy constants ──────────────────────────────────
export const NULLSTONE_ENEMY_SIZE         =  10;
export const NULLSTONE_ENEMY_COLOR        = '#1e1e28';
export const NULLSTONE_ENEMY_GLOW         = '#9664c8';
export const NULLSTONE_HP_INIT            = 2500;
export const NULLSTONE_ATK_INIT           =   42;
export const NULLSTONE_DEF_INIT           =   25;
export const NULLSTONE_GRAVITY_STRENGTH   =   0.0015;
export const NULLSTONE_GRAVITY_RADIUS     =  200;
export const NULLSTONE_ABSORB_MS          = 2500;
export const NULLSTONE_ABSORB_CD_MS       = 5000;
export const NULLSTONE_PATROL_SPEED       =   0.25;
export const NULLSTONE_PATROL_TURN_MS     = 5000;
export const NULLSTONE_TENDRIL_CD_MS      = 3000;
export const NULLSTONE_TENDRIL_COUNT      =   3;
// ── Void tendril (nullstone projectile) constants ──────────────
export const VOID_TENDRIL_SPEED       =   1.8;
export const VOID_TENDRIL_SIZE        =   4;
export const VOID_TENDRIL_HP_INIT     =  40;
export const VOID_TENDRIL_ATK_INIT    =  35;
export const VOID_TENDRIL_LIFE_MS     = 2000;
export const VOID_TENDRIL_COLOR       = '#4d2280';
export const VOID_TENDRIL_GLOW        = '#9664c8';

// ── XP multipliers per enemy type ─────────────────────────────
export const LASER_XP_MULT     = 1;
export const SAPPHIRE_XP_MULT  = 3;
export const EMERALD_XP_MULT   = 2;
export const AMBER_XP_MULT     = 4;
export const VOID_XP_MULT      = 6;
export const QUARTZ_XP_MULT    = 1.5;
export const RUBY_XP_MULT      = 2.5;
export const SUNSTONE_XP_MULT  = 3;
export const CITRINE_XP_MULT   = 3.5;
export const IOLITE_XP_MULT    = 5;
export const AMETHYST_XP_MULT  = 6;
export const DIAMOND_XP_MULT   = 8;
export const NULLSTONE_XP_MULT = 10;
export const FRACTERYL_XP_MULT = 14;
export const EIGENSTEIN_XP_MULT = 18;

// ── Fracteryl enemy constants (tier 11) ───────────────────────────
export const FRACTERYL_HP_INIT           = 3200;
export const FRACTERYL_ATK_INIT          = 65;
export const FRACTERYL_DEF_INIT          = 35;
export const FRACTERYL_ENEMY_SIZE        = 11;
export const FRACTERYL_BURST_CD_MS       = 2800;
export const FRACTERYL_BURST_JITTER      = 800;
export const FRACTERYL_PATROL_TURN_MS    = 2500;
export const FRACTERYL_SHARD_HP_INIT     = 30;
export const FRACTERYL_SHARD_ATK_INIT    = 22;
export const FRACTERYL_SHARD_LIFE_MS     = 1800;
export const FRACTERYL_ENEMY_COLOR       = '#cc44ff';
export const FRACTERYL_ENEMY_GLOW        = '#ee88ff';

// ── Eigenstein enemy constants (tier 12) ──────────────────────────
export const EIGENSTEIN_HP_INIT          = 4500;
export const EIGENSTEIN_ATK_INIT         = 80;
export const EIGENSTEIN_DEF_INIT         = 45;
export const EIGENSTEIN_ENEMY_SIZE       = 12;
export const EIGENSTEIN_BEAM_CD_MS       = 3500;
export const EIGENSTEIN_BEAM_JITTER      = 1000;
export const EIGENSTEIN_BEAM_CHARGE_MS   = 900;
export const EIGENSTEIN_BEAM_FIRE_MS     = 300;
export const EIGENSTEIN_PATROL_TURN_MS   = 3000;
export const EIGENSTEIN_ENEMY_COLOR      = '#44ccff';
export const EIGENSTEIN_ENEMY_GLOW       = '#88eeff';

// ── Danmaku boss system constants ─────────────────────────────────
export const DANMAKU_WARN_MS             = 1200;
export const DANMAKU_BULLET_SPEED        = 1.8;
export const DANMAKU_SAFE_ANGLE_WIDTH    = Math.PI * 0.45;
export const DANMAKU_RING_COUNT          = 24;
export const DANMAKU_TELEPORT_MARGIN     = 40;

// ── Boss constants ─────────────────────────────────────────────
export const BOSS_SIZE_BASE    = 14;
export const BOSS_HP_INIT      = 3000;
export const BOSS_ATK_INIT     = 50;
export const BOSS_DEF_INIT     = 30;
export const BOSS_SHIELD_INIT  = 1500;
export const BOSS_PROJ_LIFE_MS = 3500;
export const BOSS_PROJ_SIZE    = 5;
export const BOSS_PHASE2_HP_RATIO = 0.66;
export const BOSS_PHASE3_HP_RATIO = 0.33;
export const BOSS_PHASE_TRANSITION_MS = 800;
export const BOSS_ATTACK1_CD_BASE = 1800;
export const BOSS_ATTACK1_CD_P1   = 1300;
export const BOSS_ATTACK1_CD_P2   = 900;
export const BOSS_ATTACK2_CD_BASE = 3500;
export const BOSS_ATTACK2_CD_P1   = 2500;
export const BOSS_ATTACK2_CD_P2   = 1800;
export const BOSS_PROJ_SPEED      = 1.4;
export const BOSS_PROJ_SPEED_FAST = 2.2;
export const BOSS_GRAV_STRENGTH   = 0.0025;
export const BOSS_GRAV_RADIUS     = 250;
export const BOSS_INVULN_ON_MS    = 2500;
export const BOSS_INVULN_OFF_MS   = 3500;
export const BOSS_INVULN_ON_P1    = 2000;
export const BOSS_INVULN_OFF_P1   = 2500;
export const BOSS_INVULN_ON_P2    = 1800;
export const BOSS_INVULN_OFF_P2   = 1500;
export const BOSS_COLORS: string[] = [
  '', '#f5f0eb', '#dc3232', '#ff8c3c', '#e6c850',
  '#6464b4', '#b464c8', '#e8f0fa', '#1e1e28', '#9664c8', '#ffd764',
  '#cc44ff', '#44ccff',
];
export const BOSS_GLOW_COLORS: string[] = [
  '', '#faf8f5', '#ff6b6b', '#ffb366', '#f0d870',
  '#8888cc', '#d088e0', '#ffffff', '#9664c8', '#c090ff', '#ffe599',
  '#ee88ff', '#88eeff',
];
export const BOSS_NAMES: string[] = [
  '', 'Quartz Sovereign', 'Ruby King', 'Sunstone Herald', 'Citrine Weaver',
  'Iolite Colossus', 'Amethyst Breaker', 'Diamond Eternal', 'Nullstone Devourer',
  'Void Nexus', 'Equation Incarnate',
  'Fracteryl Manifestation', 'Eigenstein Entity',
];

// ── Fluid background force scales ─────────────────────────────
// Multiplier applied to entity velocity (px/frame → px/s) before injection.
// Lower values = gentler disturbance; higher = more reactive.
/** Converts entity velocity from px/frame units to px/s for fluid injection. */
export const FLUID_VEL_FRAME_TO_PX_S = 1000 / TARGET_FRAME_MS;  // = ~60 at 60 fps
export const FLUID_PLAYER_STRENGTH    = 0.18;
export const FLUID_ENEMY_STRENGTH     = 0.22;
export const FLUID_PROJECTILE_STRENGTH = 0.25;
export const FLUID_MISSILE_STRENGTH   = 0.35;
export const FLUID_LASER_BEAM_STRENGTH = 0.55;
export const FLUID_EXPLOSION_STRENGTH = 0.90;
// Laser enemy colours decoded as r,g,b for fluid injection.
export const FLUID_LASER_R = 255, FLUID_LASER_G =  51, FLUID_LASER_B =  51;
// Sapphire enemy colour.
export const FLUID_SAPPH_R =  91, FLUID_SAPPH_G = 154, FLUID_SAPPH_B = 255;
// Player colour.
export const FLUID_PLAYER_R = 255, FLUID_PLAYER_G = 215, FLUID_PLAYER_B = 100;
// Missile colour.
export const FLUID_MISSILE_R = 255, FLUID_MISSILE_G = 119, FLUID_MISSILE_B =  51;
// Sand projectile colour.
export const FLUID_SAND_R = 221, FLUID_SAND_G = 192, FLUID_SAND_B = 128;
// Chain whip colour.
export const FLUID_CHAIN_R = 160, FLUID_CHAIN_G = 216, FLUID_CHAIN_B = 239;
// Laser beam colour.
export const FLUID_BEAM_R = 255, FLUID_BEAM_G =  34, FLUID_BEAM_B =  34;
// Emerald enemy colour.
export const FLUID_EMERALD_R =  34, FLUID_EMERALD_G = 221, FLUID_EMERALD_B = 102;
// Amber enemy colour.
export const FLUID_AMBER_R = 255, FLUID_AMBER_G = 170, FLUID_AMBER_B =  34;
// Void enemy colour.
export const FLUID_VOID_R = 153, FLUID_VOID_G =  51, FLUID_VOID_B = 255;
// Quartz enemy colour.
export const FLUID_QUARTZ_R = 245, FLUID_QUARTZ_G = 240, FLUID_QUARTZ_B = 235;
// Ruby enemy colour.
export const FLUID_RUBY_R = 220, FLUID_RUBY_G =  50, FLUID_RUBY_B =  50;
// Sunstone enemy colour.
export const FLUID_SUNSTONE_R = 255, FLUID_SUNSTONE_G = 140, FLUID_SUNSTONE_B =  60;
// Citrine enemy colour.
export const FLUID_CITRINE_R = 230, FLUID_CITRINE_G = 200, FLUID_CITRINE_B =  80;
// Iolite enemy colour.
export const FLUID_IOLITE_R = 100, FLUID_IOLITE_G = 100, FLUID_IOLITE_B = 180;
// Amethyst enemy colour.
export const FLUID_AMETHYST_R = 180, FLUID_AMETHYST_G = 100, FLUID_AMETHYST_B = 200;
// Diamond enemy colour.
export const FLUID_DIAMOND_R = 232, FLUID_DIAMOND_G = 240, FLUID_DIAMOND_B = 250;
// Nullstone enemy colour.
export const FLUID_NULLSTONE_R =  30, FLUID_NULLSTONE_G =  30, FLUID_NULLSTONE_B =  40;
// Fracteryl enemy colour.
export const FLUID_FRACTERYL_R = 204, FLUID_FRACTERYL_G =  68, FLUID_FRACTERYL_B = 255;
// Eigenstein enemy colour.
export const FLUID_EIGENSTEIN_R =  68, FLUID_EIGENSTEIN_G = 204, FLUID_EIGENSTEIN_B = 255;


