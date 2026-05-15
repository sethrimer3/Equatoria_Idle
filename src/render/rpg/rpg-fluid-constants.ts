/**
 * rpg-fluid-constants.ts — Internal constants, types, and helpers for rpg-fluid.ts.
 *
 * All symbols here are implementation details of the Euler fluid background.
 * They are exported so rpg-fluid.ts can import them, but should not be used
 * by any other module.
 */

// ── Grid resolution ──────────────────────────────────────────────────────────
/** Number of grid columns (constant regardless of canvas size). */
export const FLUID_COLS = 60;
/** Number of grid rows (constant regardless of canvas size). */
export const FLUID_ROWS = 80;
export const FLUID_SIZE = FLUID_COLS * FLUID_ROWS; // 4 800 cells

// ── Particle settings (structure from Thero EulerFluidEffect) ────────────────
/** Particle count on low-graphics mode. */
export const PARTICLE_COUNT_LOW  = 140;
/** Particle count on high-graphics mode — 3× low. */
export const PARTICLE_COUNT_HIGH = 420;
export const TRAIL_LENGTH     = 22;
/** Canvas-space line width for trail segments. */
export const TRAIL_LINE_WIDTH = 1.4;

// ── Opacity / colour-blend reference ──────────────────────────────────────────
/**
 * Grid-space speed (cells / s) used as a reference for dye-colour blending
 * and for the PARTICLE_FULL_ACT_SPEED derivation.  No longer drives trail
 * opacity directly — that is now handled by the lifecycle model below.
 */
export const SPEED_FULL_OPACITY  = 2.0;
/** Peak alpha value for the brightest trail segments. */
export const TRAIL_PEAK_ALPHA    = 0.68;
/**
 * Per-frame exponential smoothing coefficient for particle speed.
 * Retained for colour-blend weighting only.
 */
export const SPEED_SMOOTH_ALPHA  = 0.14;

// ── Particle lifecycle constants ───────────────────────────────────────────────
/**
 * Grid-space speed (cells / s) a particle must exceed to wake from dormancy.
 * Sub-threshold motion is ignored, so micro-jitter does not create visible trails.
 */
export const PARTICLE_WAKE_SPEED        = 0.3;
/**
 * Grid-space speed (cells / s) at which activation reaches ~1.0 before the
 * power curve is applied.  Derived from SPEED_FULL_OPACITY so fast combat
 * produces vivid, saturated trails.
 */
export const PARTICLE_FULL_ACT_SPEED    = SPEED_FULL_OPACITY * 4.0;
/** Shortest visible lifetime (seconds) — produced by the weakest disturbances. */
export const PARTICLE_MIN_LIFETIME_SEC  = 0.8;
/** Longest visible lifetime (seconds) — produced by strong/fast disturbances. */
export const PARTICLE_MAX_LIFETIME_SEC  = 4.0;
/**
 * Exponent applied to the normalised activation fraction.
 * Values > 1 compress weak disturbances toward 0 so tiny movement stays faint.
 */
export const PARTICLE_ACTIVATION_POWER  = 1.8;
/**
 * Fractional boost added to an already-active particle's activation when
 * re-disturbed before its lifetime expires.  Prevents re-waking from instantly
 * jumping to full brightness.
 */
export const PARTICLE_REWAKE_BOOST      = 0.35;
/** Coarse occupancy grid — column count for sparse-area respawn targeting. */
export const SPARSE_RESPAWN_COLS        = 10;
/** Coarse occupancy grid — row count for sparse-area respawn targeting. */
export const SPARSE_RESPAWN_ROWS        = 14;

// ── Field parameters ──────────────────────────────────────────────────────────
/**
 * Fraction of grid velocity that remains after 1 second with no new forces.
 * 0.18 → velocity decays to 18 % in 1 s, calming the fluid quickly.
 */
export const VEL_RETAIN_PER_SEC  = 0.18;
/**
 * Fraction of dye colour that remains after 1 second.
 * Slightly higher than VEL_RETAIN so colours linger a little longer.
 */
export const DYE_RETAIN_PER_SEC  = 0.28;
/**
 * Maximum speed in the grid (cells / s).  Forces exceeding this are clamped
 * to prevent runaway accumulation when many sources overlap.
 */
export const MAX_GRID_VEL        = 48.0;

// ── Colour helpers ─────────────────────────────────────────────────────────────
/** Minimum RGB magnitude (0–255 space) for the dye field to influence a particle's colour. */
export const MIN_DYE_MAG_FOR_BLEND  = 8.0;
/** RGB delta below which a colour is considered near-grey for hue-bucket assignment. */
export const HUE_GREY_THRESHOLD     = 8;
/** Hue-bucket index used when RGB is near-grey (maps to ~210° violet for visual appeal). */
export const HUE_GREY_BUCKET        = 7;
/** Default initial particle colour channels (R, G, B: 0–255) — cool violet hue. */
export const INITIAL_PARTICLE_R     = 120;
export const INITIAL_PARTICLE_G     =  90;
export const INITIAL_PARTICLE_B     = 220;

// ── Force injection ───────────────────────────────────────────────────────────
/** Gaussian σ (grid cells) for force / colour splats. */
export const FORCE_SIGMA_CELLS   = 2.0;
export const FORCE_TWO_SIGMA_SQ  = 2.0 * FORCE_SIGMA_CELLS * FORCE_SIGMA_CELLS;
/** Max injected velocity magnitude (grid cells / s). */
export const MAX_INJECT_VEL      = 20.0;

// ── Particle lifecycle ────────────────────────────────────────────────────────
/** Cells beyond the grid boundary before a particle is recycled. */
export const OOB_MARGIN_CELLS     = 2;
/** Relative size change that triggers a full reset on resize. */
export const RESIZE_THRESHOLD_FR  = 0.06;

// ── Colour batching (approach from Thero EulerFluidEffect) ───────────────────
/**
 * Number of alpha buckets.  Trail segments are sorted into buckets by their
 * combined (trail-age × speed) alpha level, allowing at most
 * HUE_STEPS × ALPHA_BUCKETS canvas state changes per frame.
 */
export const ALPHA_BUCKETS = 5;
/** Hue is quantised into 12 × 30° buckets spanning the full 360° wheel. */
export const HUE_STEPS     = 12;

// Pre-allocated draw-batch arrays: [hueIdx][alphaIdx] → flat [x1,y1,x2,y2,…]
// Module-level allocation shared by all calls to render(); cleared each frame.
export const _batches: number[][][] = Array.from(
  { length: HUE_STEPS },
  () => Array.from({ length: ALPHA_BUCKETS }, () => []),
);

// ── Internal math ─────────────────────────────────────────────────────────────
export function _clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Smooth-step — C1 continuous, maps [0,1] → [0,1]. */
export function _smoothstep(t: number): number {
  const c = _clamp(t, 0, 1);
  return c * c * (3.0 - 2.0 * c);
}

/** Convert linear RGB (0–255) to a hue bucket index [0 … HUE_STEPS). */
export function _hueBucket(r: number, g: number, b: number): number {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d   = max - min;
  if (d < HUE_GREY_THRESHOLD) return HUE_GREY_BUCKET;
  let h: number;
  if (max === r)      h = ((g - b) / d + 6.0) % 6.0;
  else if (max === g) h = (b - r) / d + 2.0;
  else                h = (r - g) / d + 4.0;
  return Math.floor(h / 6.0 * HUE_STEPS) % HUE_STEPS;
}

/**
 * Bilinear interpolation into a flat FLUID_COLS × FLUID_ROWS Float32Array.
 * @param u  fractional column (x in grid space)
 * @param v  fractional row   (y in grid space)
 */
export function _bilerp(arr: Float32Array, u: number, v: number): number {
  const xi = Math.floor(u);
  const yi = Math.floor(v);
  const fx = u - xi;
  const fy = v - yi;
  const c0 = _clamp(xi,     0, FLUID_COLS - 1);
  const c1 = _clamp(xi + 1, 0, FLUID_COLS - 1);
  const r0 = _clamp(yi,     0, FLUID_ROWS - 1);
  const r1 = _clamp(yi + 1, 0, FLUID_ROWS - 1);
  return (
    (arr[r0 * FLUID_COLS + c0] * (1 - fx) + arr[r0 * FLUID_COLS + c1] * fx) * (1 - fy) +
    (arr[r1 * FLUID_COLS + c0] * (1 - fx) + arr[r1 * FLUID_COLS + c1] * fx) * fy
  );
}

// ── Particle ──────────────────────────────────────────────────────────────────
export interface FluidParticle {
  /** Position in grid space (fractional column and row). */
  x: number;
  y: number;
  /** Ring-buffer trail positions in grid space. */
  trailX: Float32Array;
  trailY: Float32Array;
  trailHead:  number;
  trailCount: number;
  /** Exponentially-smoothed particle speed (grid cells / s) — used for colour blending. */
  smoothedSpeed: number;
  /** Current hue bucket [0 … HUE_STEPS). */
  hueIdx: number;
  /** Normalised RGB colour (0–255) sampled from the dye field. */
  r: number;
  g: number;
  b: number;
  // ── Lifecycle fields ────────────────────────────────────────────────────────
  /** Whether this particle has been woken by a disturbance and is in its visible phase. */
  isActive:      boolean;
  /** Seconds elapsed since this particle was last woken. */
  ageSec:        number;
  /** Total visible duration (seconds) assigned at wake time. */
  lifetimeSec:   number;
  /** 0–1 activation strength set at wake based on disturbance speed. */
  activation:    number;
  /** Per-particle alpha variation (0.7–1.0) — prevents synchronised fade-outs. */
  maxAlphaScale: number;
}

export function _makeParticle(): FluidParticle {
  return {
    x: Math.random() * FLUID_COLS,
    y: Math.random() * FLUID_ROWS,
    trailX: new Float32Array(TRAIL_LENGTH),
    trailY: new Float32Array(TRAIL_LENGTH),
    trailHead: 0,
    trailCount: 0,
    smoothedSpeed: 0,
    hueIdx: Math.floor(Math.random() * HUE_STEPS),
    r: INITIAL_PARTICLE_R,
    g: INITIAL_PARTICLE_G,
    b: INITIAL_PARTICLE_B,
    // Lifecycle — dormant until woken by a force disturbance.
    isActive:      false,
    ageSec:        0.0,
    lifetimeSec:   PARTICLE_MIN_LIFETIME_SEC,
    activation:    0.0,
    maxAlphaScale: 0.7 + Math.random() * 0.3,
  };
}
