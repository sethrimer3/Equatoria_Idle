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
/** Minimum distance (px) player must move before adding a new trail point — prevents bunching at high refresh rates. */
export const MIN_TRAIL_DISTANCE  = 1.5;

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
  // Crossguard: rectangle perpendicular to the blade
  // (x = along blade, y = perpendicular).  The 4px half-height spans ~5px
  // at typical tier-1 scale, giving a visible bar across the handle.
  // Width doubled (0.2 → 0.4) for a more prominent crossguard.
  [[0.4, -4.0], [-0.4, -4.0], [-0.4, 4.0], [0.4, 4.0]],
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

/**
 * Sand-colored palette for the starter sand blade (no weapon equipped).
 * Warm tans, golds, and ambers mirroring desert sand hues.
 */
export const SAND_BLADE_COLORS: readonly string[] = [
  '#ddc080', // sand tan
  '#e8c864', // gold sand
  '#d09040', // deep amber
  '#ffe4a0', // pale sand
  '#c8a850', // warm ochre
  '#f0c870', // bright gold
  '#c8b058', // dusty amber
  '#e4d890', // light straw
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

// ── Emerald player missile (heat-seeking) ─────────────────────
export const EMERALD_MISSILE_SPEED        =   1.4;    // initial speed (px/frame at 60fps)
export const EMERALD_MISSILE_MAX_SPEED    =   3.0;    // max homing speed
export const EMERALD_MISSILE_SEEK_STR     =   0.04;   // homing correction per frame
export const EMERALD_MISSILE_SIZE         =   3;
export const EMERALD_MISSILE_TRAIL_CAP    =   50;
export const EMERALD_MISSILE_COLOR        = '#22ff88'; // vivid emerald green
export const EMERALD_MISSILE_GLOW         = '#88ffcc'; // bright teal glow
export const EMERALD_MISSILE_HIT_RADIUS   =   6;
/** px from an enemy centre that triggers the sub-missile cone burst. */
export const EMERALD_MISSILE_PROXIMITY_PX = 30;
/** px range within which a missile "sees" enemies (no-target timer resets). */
export const EMERALD_MISSILE_DETECT_PX    = 90;
/** ms with no enemy in detect range before the missile starts fizzling. */
export const EMERALD_MISSILE_NO_TARGET_MS = 1400;
/** Per-frame speed multiplier while fizzling (drag). */
export const EMERALD_MISSILE_FIZZLE_DRAG  = 0.93;
/** px/frame threshold below which a fizzling missile is considered stopped. */
export const EMERALD_MISSILE_STOP_SPEED   = 0.05;
/** Base number of sub-missiles released at tier 1. */
export const EMERALD_MISSILE_SUB_BASE     = 5;
/** Extra sub-missiles per additional tier. */
export const EMERALD_MISSILE_SUB_PER_TIER = 2;
/** Spread half-angle for the proximity cone burst (radians, total spread = 2×). */
export const EMERALD_SUB_MISSILE_CONE_SPREAD = Math.PI / 4;  // ±45° = 90° total

// ── Emerald sub-missile (tiny heat-seeker) ────────────────────
export const EMERALD_SUB_MISSILE_SPEED        =  2.2;
export const EMERALD_SUB_MISSILE_MAX_SPEED    =  3.5;
export const EMERALD_SUB_MISSILE_SEEK_STR     =  0.07;
export const EMERALD_SUB_MISSILE_SIZE         =  1.5;
export const EMERALD_SUB_MISSILE_TRAIL_CAP    =  25;
export const EMERALD_SUB_MISSILE_HIT_RADIUS   =  4;
/** Amplitude of the perpendicular squiggle impulse per frame. */
export const EMERALD_SUB_MISSILE_SQUIGGLE     =  0.10;
/** Angular frequency of the squiggle (radians added to phase per frame). */
export const EMERALD_SUB_MISSILE_SQUIGGLE_HZ  =  0.22;
/** px range within which a sub-missile "sees" enemies. */
export const EMERALD_SUB_MISSILE_DETECT_PX    = 80;
/** Total fuel lifetime: sub-missile stops seeking after this many ms. */
export const EMERALD_SUB_MISSILE_FUEL_MS          = 4000;
/** ms into lifetime at which deceleration drag begins (gradual stop between 2 s and 4 s). */
export const EMERALD_SUB_MISSILE_DECEL_START_MS   = 2000;
/** Per-frame speed multiplier once deceleration begins. */
export const EMERALD_SUB_MISSILE_FIZZLE_DRAG      =  0.91;
/** px/frame threshold below which a decelerating sub-missile is considered stopped. */
export const EMERALD_SUB_MISSILE_STOP_SPEED       =  0.05;
/** ms to wait after coming to a complete stop before detonating. */
export const EMERALD_SUB_MISSILE_POST_STOP_DELAY_MS = 500;
/** AOE explosion radius of a stopped sub-missile (px). */
export const EMERALD_SUB_MISSILE_AOE_PX           = 14;
/** Damage fraction delivered by each sub-missile relative to the parent. */
export const EMERALD_SUB_MISSILE_DAMAGE_MULT      =  0.6;

// ── Emerald sub-missile AOE swirl particle effect ─────────────
/** Number of swirl particles spawned per sub-missile explosion. */
export const EMERALD_SWIRL_COUNT    = 12;
/** Lifetime of each swirl particle (ms). */
export const EMERALD_SWIRL_LIFE_MS  = 700;
/** Initial speed of swirl particles (px/frame at 60 fps). */
export const EMERALD_SWIRL_SPEED    = 1.5;
/** Per-frame drag applied to swirl particles. */
export const EMERALD_SWIRL_DRAG     = 0.90;
/** Radius of each swirl particle (px). */
export const EMERALD_SWIRL_SIZE     = 2.0;

// ── Sunstone mine ─────────────────────────────────────────────
/** Total fuse duration before a mine auto-detonates (ms). */
export const SUNSTONE_MINE_FUSE_MS          = 15000;
/** Proximity radius (px) — mine detonates when an enemy enters this range. */
export const SUNSTONE_MINE_PROXIMITY_PX     =   22;
/** Base AOE explosion radius at tier 1 (px). */
export const SUNSTONE_MINE_AOE_BASE_PX      =   35;
/** AOE radius increase per additional tier (px). */
export const SUNSTONE_MINE_AOE_PER_TIER_PX  =    8;
/** Mine HP — when reduced to 0 by enemy damage the mine detonates prematurely. */
export const SUNSTONE_MINE_HP               =   20;
/** Visual radius of the mine dot (px). */
export const SUNSTONE_MINE_SIZE             =    5;
export const SUNSTONE_MINE_COLOR            = '#ffaa22';
export const SUNSTONE_MINE_GLOW             = '#ffcc55';
export const SUNSTONE_MINE_DANGER_COLOR     = '#ff4400'; // pulsing red near detonation

// ── Sapphire companion ship constants ─────────────────────────
/** Interval (ms) between laser shots per ship — 3× faster than original 250 ms. */
export const SAPPHIRE_SHIP_FIRE_MS          = 83;
/** Orbit radius (px) around target — 75% longer than original 30 px. */
export const SAPPHIRE_SHIP_ORBIT_RADIUS     = 52.5;
/** Max movement speed of ship (px/frame at 60fps). */
export const SAPPHIRE_SHIP_MAX_SPEED        = 2.5;
/** Range (px) within which the ship can pick nearby enemies to fire at — scaled with orbit radius. */
export const SAPPHIRE_SHIP_LASER_RANGE      = 105;
/** Trail capacity for sapphire ships. */
export const SAPPHIRE_SHIP_TRAIL_CAP        = 30;
/** Ship visual size (px) — 2× original 3 px. */
export const SAPPHIRE_SHIP_SIZE             = 6;

// ── Sapphire laser projectile constants ───────────────────────
export const SAPPHIRE_LASER_SPEED           = 3.5;   // px/frame at 60fps
export const SAPPHIRE_LASER_LIFE_MS         = 700;   // max lifetime before fizzle
export const SAPPHIRE_LASER_HIT_RADIUS      = 4;     // collision radius (px)
/** Visual radius (px) — 2× smaller than original 2 px. */
export const SAPPHIRE_LASER_SIZE            = 1;     // visual radius (px)
export const SAPPHIRE_LASER_TRAIL_CAP       = 15;    // trail buffer capacity
export const SAPPHIRE_LASER_COLOR           = '#4488ff';
export const SAPPHIRE_LASER_GLOW            = '#88bbff';
/** Max angular deviation (radians) for laser fire direction — ±5° (was ±15°). */
export const SAPPHIRE_LASER_SPREAD_RAD      = Math.PI / 36;  // ±5°
/** Per-frame rotation rate (radians) giving gentle curve. */
export const SAPPHIRE_LASER_CURVE_RATE      = 0.009;
/** Initial perpendicular (lateral) velocity magnitude. */
export const SAPPHIRE_LASER_LATERAL_VEL     = 0.6;
/** Per-frame decay of the lateral velocity component. */
export const SAPPHIRE_LASER_LATERAL_DECAY   = 0.92;

// ── Amethyst companion ship constants ─────────────────────────
/** Interval (ms) between laser shots per ship. */
export const AMETHYST_SHIP_FIRE_MS          = 3000;
/** Max movement speed of ship (px/frame at 60fps). */
export const AMETHYST_SHIP_MAX_SPEED        = 1.4;
/** Orbit radius (px) around assigned target. */
export const AMETHYST_SHIP_ORBIT_RADIUS     = 35;
/** Trail capacity for amethyst ships. */
export const AMETHYST_SHIP_TRAIL_CAP        = 40;
/** Ship visual size (px) — 2× original 3 px. */
export const AMETHYST_SHIP_SIZE             = 6;
/** Damage multiplier for amethyst laser (30×). */
export const AMETHYST_LASER_DAMAGE_MULT     = 30;
/** Short attack range (px): amethyst ships only fire when within this distance of a target. */
export const AMETHYST_SHIP_ATTACK_RANGE     = 80;

// ── Amethyst spiraling laser projectile constants ─────────────
export const AMETHYST_LASER_INITIAL_RADIUS  = 50;    // starting spiral radius (px)
/** Angular speed (rad/frame) — 6× original: 2× faster + 3× more swirl before impact. */
export const AMETHYST_LASER_ANGULAR_SPEED   = 0.48;
/** Max lifetime (ms) — halved (÷2) so shots close in twice as fast. */
export const AMETHYST_LASER_DURATION_MS     = 750;
export const AMETHYST_LASER_HIT_RADIUS      = 5;     // collision radius (px)
/** Visual radius (px) — 150% smaller (×0.4) than original 3 px. */
export const AMETHYST_LASER_SIZE            = 1.2;
/** Trail buffer capacity — 2× longer than original 52. */
export const AMETHYST_LASER_TRAIL_CAP       = 104;
export const AMETHYST_LASER_COLOR           = '#9933ff';
export const AMETHYST_LASER_GLOW            = '#cc99ff';

// ── Lucky mote drop constants ──────────────────────────────────
/** Visual radius (px) of a lucky mote. */
export const LUCKY_MOTE_RADIUS              =  4;
/** Pulsing golden glow border color on lucky motes. */
export const LUCKY_MOTE_BORDER_COLOR        = '#ffd764';
/** Distance (px) at which a lucky mote starts magnetizing toward the player. */
export const LUCKY_MOTE_MAGNET_DIST         = 55;
/** Distance (px) at which a lucky mote is collected by the player. */
export const LUCKY_MOTE_COLLECT_DIST        =  6;
/** Magnetism speed (px per dt unit at 60fps). */
export const LUCKY_MOTE_MAGNET_SPEED        =  3.5;
/** Percentage bonus applied to the matching mote tier on collection (e.g. 0.5 = +0.5%). */
export const LUCKY_MOTE_BONUS_PCT           =  0.5;
/** Initial random drift speed at spawn (px/frame). */
export const LUCKY_MOTE_SPAWN_SPEED         =  0.9;
/** Velocity damping per dt tick. */
export const LUCKY_MOTE_DAMPING             =  0.96;
/** Duration of the lucky mote popup text (ms). */
export const LUCKY_POPUP_DURATION_MS        = 1100;
/** Initial speed of the popup text (px/frame at 60fps). */
export const LUCKY_POPUP_SPEED              =  2.2;
/** Per-frame velocity decay for popup text. */
export const LUCKY_POPUP_DECEL             =  0.87;
/** Pulse animation speed (radians per second) for lucky mote border glow. */
export const LUCKY_PULSE_SPEED             =  3.8;
