/**
 * rpg-weapon-constants.ts — Constants for player weapon systems and their projectiles.
 *
 * Extracted from rpg-constants.ts to keep that file focused on core game, enemy,
 * boss, and fluid constants.
 *
 * Covers:
 *   • Sand gatling projectiles
 *   • Quartz chain whip (physics + visual)
 *   • Ruby laser beam
 *   • Nullstone vortex
 *   • Diamond sword combo (shards, SWORD_SHARD_SHAPES, SAND_BLADE_COLORS)
 *   • Iolite poison bolt
 *   • Emerald player missiles + sub-missiles + swirl particles
 *   • Sunstone proximity mines
 *   • Sapphire companion ships + laser projectiles
 *   • Amethyst companion ships + spiral laser projectiles
 */

// ── Sand gatling projectile constants ──────────────────────────
export const SAND_PROJ_SPEED      =   5.0;
export const SAND_PROJ_SIZE       =   2;
export const SAND_PROJ_LIFE_MS    = 800;
export const SAND_PROJ_COLOR      = '#ddc080';
export const SAND_PROJ_GLOW       = '#ffe8a0';

// ── Quartz chain whip constants ────────────────────────────────
export const CHAIN_NODES           =  30;
export const CHAIN_NODE_COLOR      = '#a0d8ef';
export const CHAIN_NODE_GLOW       = '#c8eeff';
export const CHAIN_LINE_COLOR      = '#88c8e8';
// ── Tunable physics parameters (mutable so dev tools can adjust at runtime) ──
/** Visual half-width of each polygon link (perpendicular to chain direction). */
export let CHAIN_MIN_RADIUS      =   1.5;
/** Visual half-width of tip link (farthest from player, slightly wider). */
export let CHAIN_MAX_RADIUS      =   3.5;
export let CHAIN_LASH_MS         = 420;   // ms for tip to lash toward target (longer for 30-node chain)
export let CHAIN_RETRACT_MS      = 480;   // ms in retracting phase before returning to idle
/** Damage ticks per I-frame interval (ms). */
export let CHAIN_HIT_CD_MS       =  62.5;
// ── Softbody whip physics constants ──
/** Rest spacing (px) between adjacent nodes.
 *  29 segments × 3px = 87px natural length — slightly longer than weapon range (75px)
 *  for a natural droop when idle. */
export let CHAIN_REST_LENGTH     =   3;
/** Spring stiffness between adjacent nodes. */
export let CHAIN_SPRING_K        =   0.55;
/** Anchor spring pulling node 0 toward the player (idle). */
export let CHAIN_ANCHOR_K        =   0.70;
/** Anchor spring during retract phase (stronger pull). */
export let CHAIN_RETRACT_ANCHOR_K = 2.5;
/** Base linear velocity damping coefficient per simulation dt.
 *  Tuned to be 10× stronger than the prior chain damping. */
export let CHAIN_DAMPING_COEFF   =   0.20;
/** Additional linear damping gain per px/dt of node speed. */
export let CHAIN_DAMPING_SPEED_SCALE = 0.12;
/** Initial speed given to nodes when a lash is triggered (px/dt).
 *  Applied with a cascade: inner nodes get a smaller impulse, outer nodes get more. */
export let CHAIN_LASH_SPEED      =  14;
/** Inertia of node 0 (closest to player, most responsive). */
export let CHAIN_MIN_INERTIA     =   0.6;
/** Inertia of tip node (farthest, least responsive / most momentum). */
export let CHAIN_MAX_INERTIA     =   3.0;
/**
 * Visual gap ratio: each polygon link is rendered at this fraction of
 * CHAIN_REST_LENGTH so there is always a small gap between adjacent links.
 */
export let CHAIN_LINK_GAP_RATIO  =   0.55;

// ── Chain whip dev-tuning API ──────────────────────────────────────────────────

export type ChainWhipParamKey =
  | 'CHAIN_MIN_RADIUS' | 'CHAIN_MAX_RADIUS'
  | 'CHAIN_LASH_MS' | 'CHAIN_RETRACT_MS' | 'CHAIN_HIT_CD_MS'
  | 'CHAIN_REST_LENGTH' | 'CHAIN_SPRING_K' | 'CHAIN_ANCHOR_K'
  | 'CHAIN_RETRACT_ANCHOR_K' | 'CHAIN_DAMPING_COEFF' | 'CHAIN_DAMPING_SPEED_SCALE'
  | 'CHAIN_LASH_SPEED' | 'CHAIN_MIN_INERTIA' | 'CHAIN_MAX_INERTIA'
  | 'CHAIN_LINK_GAP_RATIO';

export interface ChainWhipParams {
  CHAIN_MIN_RADIUS: number;
  CHAIN_MAX_RADIUS: number;
  CHAIN_LASH_MS: number;
  CHAIN_RETRACT_MS: number;
  CHAIN_HIT_CD_MS: number;
  CHAIN_REST_LENGTH: number;
  CHAIN_SPRING_K: number;
  CHAIN_ANCHOR_K: number;
  CHAIN_RETRACT_ANCHOR_K: number;
  CHAIN_DAMPING_COEFF: number;
  CHAIN_DAMPING_SPEED_SCALE: number;
  CHAIN_LASH_SPEED: number;
  CHAIN_MIN_INERTIA: number;
  CHAIN_MAX_INERTIA: number;
  CHAIN_LINK_GAP_RATIO: number;
}

/** Default values for all tunable chain whip physics parameters. */
export const CHAIN_WHIP_PARAM_DEFAULTS: Readonly<ChainWhipParams> = {
  CHAIN_MIN_RADIUS:         1.5,
  CHAIN_MAX_RADIUS:         3.5,
  CHAIN_LASH_MS:          420,
  CHAIN_RETRACT_MS:       480,
  CHAIN_HIT_CD_MS:         62.5,
  CHAIN_REST_LENGTH:        3,
  CHAIN_SPRING_K:           0.55,
  CHAIN_ANCHOR_K:           0.70,
  CHAIN_RETRACT_ANCHOR_K:   2.5,
  CHAIN_DAMPING_COEFF:      0.20,
  CHAIN_DAMPING_SPEED_SCALE: 0.12,
  CHAIN_LASH_SPEED:        14,
  CHAIN_MIN_INERTIA:        0.6,
  CHAIN_MAX_INERTIA:        3.0,
  CHAIN_LINK_GAP_RATIO:     0.55,
};

/** Returns a snapshot of the current tunable chain whip physics values. */
export function getChainWhipParams(): ChainWhipParams {
  return {
    CHAIN_MIN_RADIUS,
    CHAIN_MAX_RADIUS,
    CHAIN_LASH_MS,
    CHAIN_RETRACT_MS,
    CHAIN_HIT_CD_MS,
    CHAIN_REST_LENGTH,
    CHAIN_SPRING_K,
    CHAIN_ANCHOR_K,
    CHAIN_RETRACT_ANCHOR_K,
    CHAIN_DAMPING_COEFF,
    CHAIN_DAMPING_SPEED_SCALE,
    CHAIN_LASH_SPEED,
    CHAIN_MIN_INERTIA,
    CHAIN_MAX_INERTIA,
    CHAIN_LINK_GAP_RATIO,
  };
}

/** Sets a single tunable chain whip physics parameter by key. */
export function setChainWhipParam(key: ChainWhipParamKey, value: number): void {
  switch (key) {
    case 'CHAIN_MIN_RADIUS':          CHAIN_MIN_RADIUS = value; break;
    case 'CHAIN_MAX_RADIUS':          CHAIN_MAX_RADIUS = value; break;
    case 'CHAIN_LASH_MS':             CHAIN_LASH_MS = value; break;
    case 'CHAIN_RETRACT_MS':          CHAIN_RETRACT_MS = value; break;
    case 'CHAIN_HIT_CD_MS':           CHAIN_HIT_CD_MS = value; break;
    case 'CHAIN_REST_LENGTH':         CHAIN_REST_LENGTH = value; break;
    case 'CHAIN_SPRING_K':            CHAIN_SPRING_K = value; break;
    case 'CHAIN_ANCHOR_K':            CHAIN_ANCHOR_K = value; break;
    case 'CHAIN_RETRACT_ANCHOR_K':    CHAIN_RETRACT_ANCHOR_K = value; break;
    case 'CHAIN_DAMPING_COEFF':       CHAIN_DAMPING_COEFF = value; break;
    case 'CHAIN_DAMPING_SPEED_SCALE': CHAIN_DAMPING_SPEED_SCALE = value; break;
    case 'CHAIN_LASH_SPEED':          CHAIN_LASH_SPEED = value; break;
    case 'CHAIN_MIN_INERTIA':         CHAIN_MIN_INERTIA = value; break;
    case 'CHAIN_MAX_INERTIA':         CHAIN_MAX_INERTIA = value; break;
    case 'CHAIN_LINK_GAP_RATIO':      CHAIN_LINK_GAP_RATIO = value; break;
  }
}

/** Resets all tunable chain whip physics parameters to their default values. */
export function resetChainWhipParams(): void {
  CHAIN_MIN_RADIUS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_MIN_RADIUS;
  CHAIN_MAX_RADIUS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_MAX_RADIUS;
  CHAIN_LASH_MS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_LASH_MS;
  CHAIN_RETRACT_MS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_RETRACT_MS;
  CHAIN_HIT_CD_MS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_HIT_CD_MS;
  CHAIN_REST_LENGTH = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_REST_LENGTH;
  CHAIN_SPRING_K = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_SPRING_K;
  CHAIN_ANCHOR_K = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_ANCHOR_K;
  CHAIN_RETRACT_ANCHOR_K = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_RETRACT_ANCHOR_K;
  CHAIN_DAMPING_COEFF = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_DAMPING_COEFF;
  CHAIN_DAMPING_SPEED_SCALE = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_DAMPING_SPEED_SCALE;
  CHAIN_LASH_SPEED = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_LASH_SPEED;
  CHAIN_MIN_INERTIA = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_MIN_INERTIA;
  CHAIN_MAX_INERTIA = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_MAX_INERTIA;
  CHAIN_LINK_GAP_RATIO = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_LINK_GAP_RATIO;
}

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
