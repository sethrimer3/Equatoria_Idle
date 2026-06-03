/**
 * rpg-weapon-constants.ts — Constants for player weapon systems and their projectiles.
 *
 * Extracted from rpg-constants.ts to keep that file focused on core game, enemy,
 * boss, and fluid constants.
 *
 * Covers:
 *   • Sand gatling projectiles
 *   • Quartz chain whip (visual constants; physics tuning API is in rpg-weapon-chain-params.ts)
 *   • Ruby laser beam
 *   • Nullstone vortex
 *   • Diamond sword combo (shards, SWORD_SHARD_SHAPES, SAND_BLADE_COLORS)
 *   • Iolite poison bolt
 *   • Emerald player missiles + sub-missiles + swirl particles
 *   • Sunstone proximity mines
 *   • Sapphire companion ships + laser projectiles
 *   • Amethyst companion ships + spiral laser projectiles
 */

// ── Chain whip re-exports (canonical source: rpg-weapon-chain-params.ts) ─────
export {
  CHAIN_NODES, CHAIN_NODE_COLOR, CHAIN_NODE_GLOW, CHAIN_LINE_COLOR,
  CHAIN_MIN_RADIUS, CHAIN_MAX_RADIUS, CHAIN_LASH_MS, CHAIN_RETRACT_MS,
  CHAIN_HIT_CD_MS, CHAIN_REST_LENGTH, CHAIN_SPRING_K, CHAIN_ANCHOR_K,
  CHAIN_RETRACT_ANCHOR_K, CHAIN_DAMPING_COEFF, CHAIN_DAMPING_SPEED_SCALE,
  CHAIN_LASH_SPEED, CHAIN_MIN_INERTIA, CHAIN_MAX_INERTIA, CHAIN_LINK_GAP_RATIO,
  type ChainWhipParamKey, type ChainWhipParams,
  CHAIN_WHIP_PARAM_DEFAULTS,
  getChainWhipParams, setChainWhipParam, resetChainWhipParams,
} from './rpg-weapon-chain-params';

// ── Sand gatling projectile constants ──────────────────────────
export const SAND_PROJ_SPEED      =   5.0;
export const SAND_PROJ_SIZE       =   2;
export const SAND_PROJ_LIFE_MS    = 800;
export const SAND_PROJ_COLOR      = '#ddc080';
export const SAND_PROJ_GLOW       = '#ffe8a0';

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
/** Number of consecutive crescent slashes required before the spin combo triggers. */
export const SWORD_COMBO_THRESHOLD = 4;
/** Time window (ms) after a slash during which the next slash must begin to continue the combo. */
export const SWORD_COMBO_WINDOW_MS = 1000;
/** Minimum delay (ms) between individual swipes within a combo. */
export const SWORD_COMBO_MIN_SWIPE_DELAY_MS = 500;
/** Number of full 360° rotations during the spin combo. */
export const SWORD_COMBO_SPIN_TURNS = 3;
/** Total duration (ms) of the spin combo animation (3 fast spins). */
export const SWORD_COMBO_SPIN_MS = 450;
/** Damage multiplier per rotation tick during the spin combo (3 ticks × 1× = 3× total). */
export const SWORD_COMBO_DAMAGE_MULT = 1;
/** Range multiplier during the spin combo. */
export const SWORD_COMBO_RANGE_MULT = 2;
/** Maximum danmakuLevel a boss can reach via per-combo increments (prevents runaway bullet counts). */
export const MAX_DANMAKU_LEVEL = 6;

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

// ── Eigenstein sword constants ─────────────────────────────────

/** Number of shards making up the Eigenstein blade (more than diamond's 7). */
export const EIGENSTEIN_SHARD_COUNT = 10;
/** Multiplier applied to getSwordLength() for the Eigenstein blade. */
export const EIGENSTEIN_BLADE_LENGTH_MULT = 1.7;
/** Number of stable hilt/crossguard shards (do not oscillate). */
export const EIGENSTEIN_STABLE_SHARDS = 3;
/** Amplitude (radians) of per-shard blade oscillation. */
export const EIGENSTEIN_OSCILLATION_AMP = 0.28;
/** Frequency (rad/ms) of blade polygon oscillation. */
export const EIGENSTEIN_OSCILLATION_FREQ = 0.0028;
/** Per-shard phase offset for staggered oscillation. */
export const EIGENSTEIN_OSCILLATION_PHASE = 0.9;
/**
 * Neon "imaginary-plane" blade shard colors — highly saturated impossibles.
 * Cycles through the blade; hilt shards use EIGENSTEIN_HILT_COLOR.
 */
export const EIGENSTEIN_BLADE_COLORS: readonly string[] = [
  '#cc00ff', // electric violet
  '#00ffe0', // inverted cyan
  '#ff00aa', // hot magenta
  '#6600ff', // deep neon violet
  '#00ccff', // ice neon blue
  '#ff3300', // negative orange
  '#cc99ff', // soft lavender
] as const;
/** Core fill color for the hilt and crossguard (dark void-purple). */
export const EIGENSTEIN_HILT_COLOR = '#0d0020';
/** Glow/outline color for the hilt. */
export const EIGENSTEIN_HILT_GLOW  = '#8800ff';
/** Duration (ms) of the dimensional-rift slash visual after a hit. */
export const EIGENSTEIN_RIFT_DURATION_MS = 700;
/** Maximum number of rift effects rendered simultaneously per weapon. */
export const EIGENSTEIN_RIFT_MAX = 8;
/** Cap on per-enemy stored rift accumulation (safety ceiling). */
export const EIGENSTEIN_RIFT_ACCUM_CAP = 9999;
/** Rift crack branch colors — neon on dark. */
export const EIGENSTEIN_RIFT_COLORS: readonly string[] = [
  '#00ffe0', // inverted cyan
  '#cc00ff', // neon violet
  '#ff0099', // hot magenta
  '#00aaff', // electric blue
  '#aaff00', // acid green
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
/** px from enemy where the primary missile starts fading from 30% to 100% opacity. */
export const EMERALD_MISSILE_OPACITY_FADE_START_PX = 60;
/** Minimum opacity for primary missiles away from enemies. */
export const EMERALD_MISSILE_MIN_ALPHA    = 0.3;
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
/** px from enemy where sub-missiles start fading from 30% to 100% opacity. */
export const EMERALD_SUB_MISSILE_OPACITY_FADE_START_PX = 45;
/** Minimum opacity for sub-missiles away from enemies. */
export const EMERALD_SUB_MISSILE_MIN_ALPHA = 0.3;
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
// ── Sapphire ship neon trail visual config ─────────────────────
/** Core trail lineWidth at the head (newest point), px on main canvas. */
export const SAPPHIRE_SHIP_TRAIL_CORE_HEAD_W  = 2.0;
/** Core trail lineWidth at the tail (oldest point), px on main canvas. */
export const SAPPHIRE_SHIP_TRAIL_CORE_TAIL_W  = 0.3;
/** Glow trail lineWidth (px on half-resolution glow canvas). */
export const SAPPHIRE_SHIP_TRAIL_GLOW_W       = 4.5;
/** Number of taper passes for the ship core trail (higher = smoother). */
export const SAPPHIRE_SHIP_TRAIL_TAPER        = 4;
/** Minimum travel distance (px) before adding a new ship trail point. */
export const SAPPHIRE_SHIP_TRAIL_MIN_DIST     = 0.8;

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
// ── Sapphire laser neon trail visual config ────────────────────
/** Core trail lineWidth at the head (newest point), px on main canvas. */
export const SAPPHIRE_LASER_TRAIL_CORE_HEAD_W = 1.5;
/** Core trail lineWidth at the tail (oldest point), px on main canvas. */
export const SAPPHIRE_LASER_TRAIL_CORE_TAIL_W = 0.25;
/** Glow trail lineWidth (px on half-resolution glow canvas). */
export const SAPPHIRE_LASER_TRAIL_GLOW_W      = 3.5;
/** Number of taper passes for the laser core trail (higher = smoother). */
export const SAPPHIRE_LASER_TRAIL_TAPER       = 4;
/** Minimum travel distance (px) before adding a new laser trail point. */
export const SAPPHIRE_LASER_TRAIL_MIN_DIST    = 1.2;

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
// ── Amethyst laser neon trail visual constants ────────────────
/** Core line width at the trail head (newest/closest point). */
export const AMETHYST_LASER_TRAIL_CORE_HEAD_W = 2.5;
/** Core line width at the trail tail (oldest/outermost point). */
export const AMETHYST_LASER_TRAIL_CORE_TAIL_W = 0.3;
/** Glow pass line width (glow-canvas coordinate space). */
export const AMETHYST_LASER_TRAIL_GLOW_W     = 7.0;
/** Number of taper segments for the core trail (higher = smoother). */
export const AMETHYST_LASER_TRAIL_TAPER      = 5;
