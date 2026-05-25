/**
 * rpg-constants.ts — Core numeric and string constants for the RPG rendering system.
 *
 * Covers player, mote, joystick, laser/sapphire starter enemies, attack timings,
 * damage numbers, invincibility frames, boss constants, fluid simulation forces,
 * and lucky mote drops.
 *
 * Weapon-system-specific constants (chain whip, laser beam, vortex, sword,
 * poison bolt, emerald missiles, sunstone mines, companion ships) live in
 * rpg-weapon-constants.ts to keep this file focused on the core game loop.
 *
 * Imports PLAYER_BASE_ATK from rpg-state.ts solely to initialise PLAYER_ATK_INIT;
 * rpg-render.ts therefore has an indirect dependency on rpg-state.ts for this value
 * via the rpg-constants → rpg-state chain.
 */
import { PLAYER_BASE_ATK } from '../../sim/rpg/rpg-state';

/**
 * Fixed logical width of the RPG game world in canvas pixels.
 *
 * All RPG gameplay objects (player, enemies, terrain, projectiles, particles)
 * live in [0, RPG_LOGICAL_WIDTH] × [0, RPG_LOGICAL_HEIGHT] world coordinates.
 * This value NEVER changes at runtime — it is the single authoritative arena size.
 *
 * The canvas backing store is always this width.  The `#rpg-area` wrapper div
 * is CSS-scaled by `resizeRpgArea()` to fit the available container while
 * preserving this aspect ratio (letterbox / pillarbox).
 */
export const RPG_LOGICAL_WIDTH  = 360;
/**
 * Fixed logical height of the RPG game world in canvas pixels.
 * Together with RPG_LOGICAL_WIDTH this gives a 9:16 portrait aspect ratio —
 * the natural orientation for the RPG tab on phones.
 */
export const RPG_LOGICAL_HEIGHT = 640;

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
/** Minimum distance (px) player must move before adding a new trail point — prevents bunching at high refresh rates. */
export const MIN_TRAIL_DISTANCE  = 1.5;

export const PLAYER_HP_INIT    = 100;
export const PLAYER_ATK_INIT   = PLAYER_BASE_ATK;
export const PLAYER_DEF_INIT   =   5;  // base defence in % (percentage of damage blocked)
export const PLAYER_REGEN_INIT =   1;  // base HP regen in %/s of maxHp

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
/**
 * The weapon ID of the Diamond Blade (Diamond Sword).
 * When this weapon is equipped it replaces the default Sand Blade melee attack.
 * All other equipped weapons coexist with the Sand Blade.
 */
export const DIAMOND_BLADE_ID         = 'diamond_bastion';
/** Duration (ms) for the shot-line visual effect. */
export const SHOT_LINE_DURATION_MS    = 120;
/** Target frame time in ms at 60 FPS — used to normalise dt-scaled physics. */
export const TARGET_FRAME_MS          = 16.667;
/** Flicker on/off interval (ms) while the player has invincibility frames (~8 Hz). */
export const IFRAME_FLICKER_INTERVAL_MS = 62.5;

// ── Damage numbers ─────────────────────────────────────────────
/** How long a damage number stays visible (ms). */
export const DAMAGE_NUM_DURATION_MS   = 900;
/** Minimum font size for a nearly-zero-damage hit (internal canvas px). */
export const DAMAGE_NUM_MIN_FONT_PX   = 9;
/** Maximum font size for a 100 %-health hit (internal canvas px). */
export const DAMAGE_NUM_MAX_FONT_PX   = 32;
/** Initial travel speed of a damage number (px per dt unit). Tripled from original. */
export const DAMAGE_NUM_INITIAL_SPEED = 5.4;
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
/**
 * Safety margin applied to melee weapon reach when computing the auto-move stop distance.
 * Auto-move stops at (swordLength × margin) px, which is slightly inside the actual weapon
 * range. This ensures the player is always close enough to attack even when the enemy is
 * pressed against a wall or corner (where a mathematically ideal distance can be blocked).
 *
 * For sand blade tier 1 (reach=30px): stop at 30 × 0.82 ≈ 24.6 px
 * For diamond blade tier 1 (reach=30px): same formula applies
 */
export const AUTO_MOVE_MELEE_STOP_MARGIN = 0.82;
/**
 * Auto-move stop distance (px) for the chain whip.
 * The chain whip's nominal range is 75px, but visually and mechanically it lashes out
 * and can hit enemies at very close range. Auto-move aims to position the player
 * almost on top of enemies so the whip reliably contacts them.
 */
export const AUTO_MOVE_CHAIN_WHIP_STOP_PX = 10;

// ── Equipped-weapon visual particle ───────────────────────────
/** Angular speed of the equipped-weapon orbit particle (radians per second). */
export const WEAPON_PARTICLE_ORBIT_SPEED  = 2.2;
/** Orbit radius for the equipped-weapon particle (internal px). Increased slightly for visual clarity. */
export const WEAPON_PARTICLE_ORBIT_RADIUS = 13;
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
/** Maximum missile lifetime in ms — missile self-destructs if it has not hit the player after this long. */
export const MISSILE_MAX_LIFETIME_MS   = 6000;
/** Minimum shield damage — shields always take at least this much damage per hit. */
export const MINIMUM_SHIELD_DAMAGE     =   1;
/** Small epsilon used to guard against division-by-zero in speed normalisation. */
export const SPEED_EPSILON             =   0.001;

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

/** Radius (px) of the prismatic safe-zone circle at the bottom of the canvas during boss waves. */
export const BOSS_BOTTOM_SAFE_ZONE_R = 22;

/** UCAS glyph label displayed when a boss wave is cleared (angular aesthetic glyphs). */
export const BOSS_GLYPH_LABEL = String.fromCodePoint(0x1469, 0x14B1, 0x1553, 0x140A); // ᑩᒱᕓᐊ

// ── Fluid background force scales ─────────────────────────────
// Multiplier applied to entity velocity (px/frame → px/s) before injection.
// Lower values = gentler disturbance; higher = more reactive.
/** Converts entity velocity from px/frame units to px/s for fluid injection. */
export const FLUID_VEL_FRAME_TO_PX_S = 1000 / TARGET_FRAME_MS;  // = ~60 at 60 fps
export const FLUID_PLAYER_STRENGTH    = 0.06;
export const FLUID_ENEMY_STRENGTH     = 0.08;
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
// Procedural creature kill explosions share a common warm-white fluid colour.
export const FLUID_PROC_R = 220, FLUID_PROC_G = 210, FLUID_PROC_B = 190;

// ── Lucky mote drop constants ──────────────────────────────────
/** Visual radius (px) of a lucky mote. */
export const LUCKY_MOTE_RADIUS              =  4;
/** Pulsing golden glow border color on lucky motes. */
export const LUCKY_MOTE_BORDER_COLOR        = '#ffd764';
/** Distance (px) at which a lucky mote starts magnetizing toward the player. */
export const LUCKY_MOTE_MAGNET_DIST         = 55;
/** Distance (px) at which a lucky mote is collected by the player. */
export const LUCKY_MOTE_COLLECT_DIST        =  6;
/** Magnetism acceleration (px per dt unit at 60fps) — kept gentle to avoid violent snapping. */
export const LUCKY_MOTE_MAGNET_SPEED        =  1.8;
/** Percentage bonus applied to the matching mote tier on collection (e.g. 0.5 = +0.5%). */
export const LUCKY_MOTE_BONUS_PCT           =  0.5;
/** Initial random drift speed at spawn (px/frame). */
export const LUCKY_MOTE_SPAWN_SPEED         =  0.9;
/** Velocity damping per dt tick — stronger than before to prevent velocity buildup. */
export const LUCKY_MOTE_DAMPING             =  0.88;
/** Duration of the lucky mote popup text (ms). */
export const LUCKY_POPUP_DURATION_MS        = 1100;
/** Initial speed of the popup text (px/frame at 60fps). */
export const LUCKY_POPUP_SPEED              =  2.2;
/** Per-frame velocity decay for popup text. */
export const LUCKY_POPUP_DECEL             =  0.87;
/** Pulse animation speed (radians per second) for lucky mote border glow. */
export const LUCKY_PULSE_SPEED             =  3.8;
