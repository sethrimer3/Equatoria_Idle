/**
 * nadir-substrate-effect-internals.ts — Internal constants, types, and helpers for the Nadir zone substrate effect.
 *
 * All symbols here are implementation details of the NadirSubstrateEffect.
 * They are exported so nadir-substrate-effect.ts can import them, but should not be
 * used by any other module.
 */

// ─── Configurable parameters ──────────────────────────────────────────────────

/** Number of seed growth fronts placed at each cycle start. */
export const SEED_COUNT = 6;

/** Maximum simultaneously active growth front tips. */
export const MAX_FRONTS = 60;

/** Base growth speed (CSS pixels per second). Individual fronts vary ±30%. */
export const GROWTH_SPEED = 65;

/** Probability [0,1] that a stopped front spawns a perpendicular branch. */
export const BRANCH_PROBABILITY = 0.60;

/** Per-pixel probability of a sharp perpendicular turn in straight mode. */
export const PERPENDICULAR_TURN_PROBABILITY = 0.008;

/** Probability that a newly created front uses arc (curve) mode. */
export const ARC_PROBABILITY = 0.15;

/** Maximum age (seconds) before a front expires. Actual age varies ×0.5–1.5. */
export const MAX_AGE = 120;

/** Number of interior deposition striation dots per growth pixel. */
export const GRAIN_DENSITY = 6;

/** Half-width (px) of the interior deposition scatter band. */
export const DEPOSITION_WIDTH = 40;

/** Alpha of edge (crack line) pixels on the off-screen canvas. */
export const EDGE_OPACITY = 0.70;

/** Maximum alpha of a single interior deposition grain. */
export const INTERIOR_OPACITY = 0.025;

/** Width (px) of edge line pixels. Chalk-like – slightly thicker for texture. */
export const LINE_WIDTH = 0.6;

/** Overall compositing alpha applied when blitting to the main canvas. */
export const COMPOSITE_ALPHA = 0.18;

/** Duration (ms) of the gentle fade-in at each cycle's start. */
export const FADE_IN_MS = 3000;

/** Arc curvature half-range (rad / pixel). Actual rate is random within ±. */
export const ARC_RATE_RANGE = 0.012;

/** Grid sentinel: no growth front has claimed this cell yet. */
export const GRID_EMPTY = -10001;

// ─── Undraw (tail-erase) parameters ──────────────────────────────────────────

/** Maximum simultaneously visible trail pixels before the tail starts erasing. */
export const TRAIL_MAX_VISIBLE = 80000;

/** Radius (px) of the destination-out eraser brush at each trail point. */
export const ERASE_RADIUS = 2.5;

/** Speed multiplier for undraw relative to the front's growth speed. */
export const UNDRAW_SPEED_FACTOR = 1.2;

/**
 * Minimum trail pixels a stopped front must have drawn before it is allowed
 * to spawn perpendicular branches.
 */
export const MINIMUM_TRAIL_FOR_BRANCH = 5;

/**
 * Maximum number of completed (stopped) lines that may persist visibly on the
 * canvas at one time.
 */
export const MAX_LINES_BEFORE_UNDRAW = 120;

// ─── Collision glow parameters ────────────────────────────────────────────────

/** Total duration (ms) of the golden collision-glow effect. */
export const COLLISION_GLOW_DURATION_MS = 3000;

/** Duration (ms) for the glow to ramp from zero to peak intensity (attack phase). */
export const COLLISION_GLOW_PEAK_MS = 400;

/** Number of trail points back from the collision that the glow gradient covers. */
export const COLLISION_GLOW_TRAIL_LENGTH = 180;

/** Peak alpha of the golden glow stroke at the exact collision point. */
export const COLLISION_GLOW_MAX_ALPHA = 0.30;

/** Stroke width (px) of the golden glow drawn over the trail. */
export const COLLISION_GLOW_LINE_WIDTH = 4.5;

// ─── Color palette ────────────────────────────────────────────────────────────

export interface PaletteColor {
  r: number;
  g: number;
  b: number;
}

export const PALETTE: readonly PaletteColor[] = [
  { r: 255, g: 255, b: 255 },  // Pure white
  { r: 248, g: 245, b: 238 },  // Warm white
  { r: 210, g: 210, b: 210 },  // Soft grey
  { r: 190, g: 195, b: 200 },  // Cool grey
  { r: 235, g: 225, b: 190 },  // Pale gold
  { r: 215, g: 205, b: 180 },  // Warm gold-grey
];

// ─── Internal types ───────────────────────────────────────────────────────────

export type FrontMode = 'straight' | 'arc';

export interface TrailPoint {
  x: number;
  y: number;
}

export interface CollisionGlow {
  active: boolean;
  age: number;
  trailEndIdx: number;
}

export interface GrowthFront {
  x: number;
  y: number;
  angle: number;
  speed: number;
  age: number;
  maxAge: number;
  colorR: number;
  colorG: number;
  colorB: number;
  edgeFillStyle: string;
  baseColorStyle: string;
  mode: FrontMode;
  arcRate: number;
  alive: boolean;
  growing: boolean;
  trail: TrailPoint[];
  undrawIndex: number;
  stoppedOrder: number;
  undrawStarted: boolean;
  collisionGlow: CollisionGlow | null;
  lastGx: number;
  lastGy: number;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

export function randomPaletteColor(): PaletteColor {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

/**
 * Return an angle quantised to a multiple of π/2 with small jitter (±0.075 rad).
 * This produces the city-block / crystal-lattice perpendicular alignments.
 */
export function quantisedAngle(): number {
  const base = Math.floor(Math.random() * 4) * (Math.PI / 2);
  return base + (Math.random() - 0.5) * 0.15;
}

export function createFront(x: number, y: number, angle: number, mode: FrontMode): GrowthFront {
  const col = randomPaletteColor();
  return {
    x,
    y,
    angle,
    speed: GROWTH_SPEED * (0.7 + Math.random() * 0.6),
    age: 0,
    maxAge: MAX_AGE * (0.5 + Math.random()),
    colorR: col.r,
    colorG: col.g,
    colorB: col.b,
    edgeFillStyle: `rgba(${col.r},${col.g},${col.b},${EDGE_OPACITY})`,
    baseColorStyle: `rgb(${col.r},${col.g},${col.b})`,
    mode,
    arcRate: (Math.random() - 0.5) * 2 * ARC_RATE_RANGE,
    alive: true,
    growing: true,
    trail: [],
    undrawIndex: 0,
    stoppedOrder: -1,
    undrawStarted: false,
    collisionGlow: null,
    lastGx: Math.round(x),
    lastGy: Math.round(y),
  };
}
