/**
 * rpg-fluid.ts — Euler fluid background for RPG mode.
 *
 * Ported and adapted from Chapter 3 EulerFluidEffect.js in
 * sethrimer3/Thero_Idle_TD.  The core particle advection and batched trail
 * rendering approach are preserved; the analytical velocity field has been
 * replaced with a grid-based accumulation model driven entirely by gameplay.
 *
 * Solver structure: inject forces → decay → diffuse → advect particles → draw.
 * No ambient / passive injection: velocity enters the field only through
 * explicit addForce() / addExplosion() calls made by gameplay systems.
 *
 * Opacity model: each trail segment's alpha is gated by the particle's
 * exponentially-smoothed local speed, so the background fades to near-
 * invisible when nothing is moving and brightens during active combat.
 */

// ── Grid resolution ──────────────────────────────────────────────────────────
/** Number of grid columns (constant regardless of canvas size). */
const FLUID_COLS = 60;
/** Number of grid rows (constant regardless of canvas size). */
const FLUID_ROWS = 80;
const FLUID_SIZE = FLUID_COLS * FLUID_ROWS; // 4 800 cells

// ── Particle settings (structure from Thero EulerFluidEffect) ────────────────
const PARTICLE_COUNT   = 140;
const TRAIL_LENGTH     = 22;
/** Canvas-space line width for trail segments. */
const TRAIL_LINE_WIDTH = 1.4;

// ── Opacity model ─────────────────────────────────────────────────────────────
/**
 * Grid-space speed (cells per second) at which a particle's trail reaches
 * full opacity.  Conservative / low so motion is clearly visible.
 */
const SPEED_FULL_OPACITY  = 2.0;
/** Peak alpha value at the newest trail segment tip. */
const TRAIL_PEAK_ALPHA    = 0.68;
/**
 * Per-frame exponential smoothing coefficient for particle speed.
 * Prevents flickering while still reacting quickly to velocity changes.
 */
const SPEED_SMOOTH_ALPHA  = 0.14;

// ── Field parameters ──────────────────────────────────────────────────────────
/**
 * Fraction of grid velocity that remains after 1 second with no new forces.
 * 0.18 → velocity decays to 18 % in 1 s, calming the fluid quickly.
 */
const VEL_RETAIN_PER_SEC  = 0.18;
/**
 * Fraction of dye colour that remains after 1 second.
 * Slightly higher than VEL_RETAIN so colours linger a little longer.
 */
const DYE_RETAIN_PER_SEC  = 0.28;
/**
 * Maximum speed in the grid (cells / s).  Forces exceeding this are clamped
 * to prevent runaway accumulation when many sources overlap.
 */
const MAX_GRID_VEL        = 48.0;

// ── Colour helpers ─────────────────────────────────────────────────────────────
/** Minimum RGB magnitude (0–255 space) for the dye field to influence a particle's colour. */
const MIN_DYE_MAG_FOR_BLEND  = 8.0;
/** RGB delta below which a colour is considered near-grey for hue-bucket assignment. */
const HUE_GREY_THRESHOLD     = 8;
/** Hue-bucket index used when RGB is near-grey (maps to ~210° violet for visual appeal). */
const HUE_GREY_BUCKET        = 7;
/** Default initial particle colour channels (R, G, B: 0–255) — cool violet hue. */
const INITIAL_PARTICLE_R     = 120;
const INITIAL_PARTICLE_G     =  90;
const INITIAL_PARTICLE_B     = 220;

// ── Force injection ───────────────────────────────────────────────────────────
/** Gaussian σ (grid cells) for force / colour splats. */
const FORCE_SIGMA_CELLS   = 2.0;
const FORCE_TWO_SIGMA_SQ  = 2.0 * FORCE_SIGMA_CELLS * FORCE_SIGMA_CELLS;
/** Max injected velocity magnitude (grid cells / s). */
const MAX_INJECT_VEL      = 20.0;

// ── Particle lifecycle ────────────────────────────────────────────────────────
/** Grid-space speed below which a particle is respawned. */
const RESPAWN_SLOW_THRESH  = 0.05;
/** Cells beyond the grid boundary before a particle is respawned. */
const OOB_MARGIN_CELLS     = 2;
/** Relative size change that triggers a full reset on resize. */
const RESIZE_THRESHOLD_FR  = 0.06;

// ── Colour batching (approach from Thero EulerFluidEffect) ───────────────────
/**
 * Number of alpha buckets.  Trail segments are sorted into buckets by their
 * combined (trail-age × speed) alpha level, allowing at most
 * HUE_STEPS × ALPHA_BUCKETS canvas state changes per frame.
 */
const ALPHA_BUCKETS = 5;
/** Hue is quantised into 12 × 30° buckets spanning the full 360° wheel. */
const HUE_STEPS     = 12;

// Pre-allocated draw-batch arrays: [hueIdx][alphaIdx] → flat [x1,y1,x2,y2,…]
const _batches: number[][][] = Array.from(
  { length: HUE_STEPS },
  () => Array.from({ length: ALPHA_BUCKETS }, () => []),
);

// ── Internal math ─────────────────────────────────────────────────────────────
function _clamp(n: number, lo: number, hi: number): number {
  return n < lo ? lo : n > hi ? hi : n;
}

/** Smooth-step — C1 continuous, maps [0,1] → [0,1]. */
function _smoothstep(t: number): number {
  const c = _clamp(t, 0, 1);
  return c * c * (3.0 - 2.0 * c);
}

/** Convert linear RGB (0–255) to a hue bucket index [0 … HUE_STEPS). */
function _hueBucket(r: number, g: number, b: number): number {
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
function _bilerp(arr: Float32Array, u: number, v: number): number {
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
interface FluidParticle {
  /** Position in grid space (fractional column and row). */
  x: number;
  y: number;
  /** Ring-buffer trail positions in grid space. */
  trailX: Float32Array;
  trailY: Float32Array;
  trailHead:  number;
  trailCount: number;
  /** Exponentially-smoothed particle speed (grid cells / s). */
  smoothedSpeed: number;
  /** Current hue bucket [0 … HUE_STEPS). */
  hueIdx: number;
  /** Normalised RGB colour (0–255) sampled from the dye field. */
  r: number;
  g: number;
  b: number;
}

function _makeParticle(): FluidParticle {
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
  };
}

// ── Public API types ───────────────────────────────────────────────────────────

/**
 * A single directional force and colour impulse to inject this frame.
 * All positions are in canvas-pixel world space.
 */
export interface FluidImpulse {
  /** World-space position (canvas pixels). */
  x: number;
  y: number;
  /**
   * Velocity in canvas pixels per second.
   * Convert from px/frame by multiplying by (1000 / TARGET_FRAME_MS).
   */
  vx: number;
  vy: number;
  /** Source colour (0–255 per channel). */
  r: number;
  g: number;
  b: number;
  /** Force multiplier — 1.0 for normal entity motion; higher for impacts. */
  strength?: number;
}

export interface RpgFluid {
  /** Update internal cell-size when the canvas dimensions change. */
  resize(widthPx: number, heightPx: number): void;
  /**
   * Inject a directional force and colour impulse at a world-space position.
   * Call once per active entity per frame.
   */
  addForce(impulse: FluidImpulse): void;
  /**
   * Inject a radial outward explosion at world-space (x, y).
   * Used for AoE attacks, enemy deaths, and impact events.
   */
  addExplosion(
    x: number,
    y: number,
    strength: number,
    r: number,
    g: number,
    b: number,
  ): void;
  /** Advance the simulation by deltaMs milliseconds. */
  step(deltaMs: number): void;
  /**
   * Render the fluid as a background layer.
   * Must be called after the canvas has been cleared and before entities are drawn.
   */
  render(ctx: CanvasRenderingContext2D): void;
  /** Clear all grid and particle state (call on restart). */
  reset(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createRpgFluid(): RpgFluid {
  let widthPx  = 320;
  let heightPx = 568;
  let cellW    = widthPx  / FLUID_COLS;
  let cellH    = heightPx / FLUID_ROWS;

  // ── Grid arrays (all Float32, flat row-major) ───────────────────────────────
  const vxGrid = new Float32Array(FLUID_SIZE);
  const vyGrid = new Float32Array(FLUID_SIZE);
  // Dye: accumulated, not normalised — decays alongside velocity.
  const dyeR   = new Float32Array(FLUID_SIZE);
  const dyeG   = new Float32Array(FLUID_SIZE);
  const dyeB   = new Float32Array(FLUID_SIZE);
  // Scratch buffers for the diffusion pass (avoids separate allocation per frame).
  const tmpVx  = new Float32Array(FLUID_SIZE);
  const tmpVy  = new Float32Array(FLUID_SIZE);

  // ── Particle pool ───────────────────────────────────────────────────────────
  let particles: FluidParticle[] = [];
  for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(_makeParticle());

  // ── Coordinate helpers ──────────────────────────────────────────────────────
  function _toGX(wx: number): number { return wx / cellW; }
  function _toGY(wy: number): number { return wy / cellH; }

  // ── Force splat ─────────────────────────────────────────────────────────────
  /**
   * Add a Gaussian-weighted velocity and colour impulse centred on grid
   * position (gx, gy).  All neighbouring cells within ≈ 1.5σ are affected.
   */
  function _splat(
    gx: number, gy: number,
    gvx: number, gvy: number,
    gr: number,  gg: number, gb: number,
    strength: number,
  ): void {
    const span = Math.ceil(FORCE_SIGMA_CELLS * 1.6);
    const col0 = Math.max(0, Math.floor(gx) - span);
    const col1 = Math.min(FLUID_COLS - 1, Math.ceil(gx) + span);
    const row0 = Math.max(0, Math.floor(gy) - span);
    const row1 = Math.min(FLUID_ROWS - 1, Math.ceil(gy) + span);

    for (let row = row0; row <= row1; row++) {
      for (let col = col0; col <= col1; col++) {
        const dx  = col - gx;
        const dy  = row - gy;
        const w   = Math.exp(-(dx * dx + dy * dy) / FORCE_TWO_SIGMA_SQ) * strength;
        const idx = row * FLUID_COLS + col;
        vxGrid[idx] += gvx * w;
        vyGrid[idx] += gvy * w;
        dyeR[idx]   += gr  * w;
        dyeG[idx]   += gg  * w;
        dyeB[idx]   += gb  * w;
      }
    }
  }

  // ── Velocity diffusion ──────────────────────────────────────────────────────
  /**
   * One pass of a 5-point Laplacian diffusion with blend factor `mix`.
   * Smooths the velocity field so particle trails look fluid rather than
   * blocky.  The dye field is left undiffused to preserve colour sharpness.
   */
  function _diffuseVelocity(mix: number): void {
    for (let row = 0; row < FLUID_ROWS; row++) {
      for (let col = 0; col < FLUID_COLS; col++) {
        const i  = row * FLUID_COLS + col;
        const il = col > 0            ? i - 1          : i;
        const ir = col < FLUID_COLS-1 ? i + 1          : i;
        const iu = row > 0            ? i - FLUID_COLS : i;
        const id = row < FLUID_ROWS-1 ? i + FLUID_COLS : i;
        tmpVx[i] = vxGrid[i] * (1 - mix) + (vxGrid[il] + vxGrid[ir] + vxGrid[iu] + vxGrid[id]) * (mix * 0.25);
        tmpVy[i] = vyGrid[i] * (1 - mix) + (vyGrid[il] + vyGrid[ir] + vyGrid[iu] + vyGrid[id]) * (mix * 0.25);
      }
    }
    vxGrid.set(tmpVx);
    vyGrid.set(tmpVy);
  }

  // ── Public methods ──────────────────────────────────────────────────────────

  function resize(w: number, h: number): void {
    const prevW = widthPx, prevH = heightPx;
    widthPx  = w;
    heightPx = h;
    cellW = w / FLUID_COLS;
    cellH = h / FLUID_ROWS;
    const rw = Math.abs(w - prevW) / (prevW + 1);
    const rh = Math.abs(h - prevH) / (prevH + 1);
    if (rw > RESIZE_THRESHOLD_FR || rh > RESIZE_THRESHOLD_FR) {
      reset();
    }
  }

  function addForce(impulse: FluidImpulse): void {
    const gx     = _toGX(impulse.x);
    const gy     = _toGY(impulse.y);
    const str    = impulse.strength ?? 1.0;
    // Convert world px/s → grid cells/s, then cap magnitude.
    const gvxRaw = impulse.vx / cellW;
    const gvyRaw = impulse.vy / cellH;
    const gspd   = Math.sqrt(gvxRaw * gvxRaw + gvyRaw * gvyRaw);
    const scale  = gspd > MAX_INJECT_VEL ? MAX_INJECT_VEL / gspd : 1.0;
    // Exponential (quadratic) dropoff: slow movements barely disturb the
    // fluid, fast movements disturb it proportionally more.  This prevents
    // even tiny entity displacements from sending fluid particles flying.
    const normSpd     = _clamp(gspd / MAX_INJECT_VEL, 0, 1);
    const speedFactor = normSpd * normSpd;
    _splat(gx, gy, gvxRaw * scale, gvyRaw * scale, impulse.r, impulse.g, impulse.b, str * speedFactor);
  }

  function addExplosion(
    x: number, y: number,
    strength: number,
    r: number, g: number, b: number,
  ): void {
    const gx     = _toGX(x);
    const gy     = _toGY(y);
    const blastR = FORCE_SIGMA_CELLS * 1.8;
    // Eight evenly-spaced radial jets plus a central colour injection.
    for (let k = 0; k < 8; k++) {
      const angle = (k / 8) * Math.PI * 2;
      const cos   = Math.cos(angle);
      const sin   = Math.sin(angle);
      const ox    = gx + cos * blastR * 0.35;
      const oy    = gy + sin * blastR * 0.35;
      _splat(ox, oy, cos * MAX_INJECT_VEL * 0.75, sin * MAX_INJECT_VEL * 0.75, r, g, b, strength * 0.45);
    }
    // Centre injection carries the colour but minimal velocity.
    _splat(gx, gy, 0, 0, r, g, b, strength);
  }

  function step(deltaMs: number): void {
    const dt = Math.min(deltaMs / 1000.0, 0.1); // seconds, safety-capped

    // 1. Decay velocity and dye.
    const velFactor = Math.pow(VEL_RETAIN_PER_SEC, dt);
    const dyeFactor = Math.pow(DYE_RETAIN_PER_SEC, dt);
    for (let i = 0; i < FLUID_SIZE; i++) {
      vxGrid[i] *= velFactor;
      vyGrid[i] *= velFactor;
      dyeR[i]   *= dyeFactor;
      dyeG[i]   *= dyeFactor;
      dyeB[i]   *= dyeFactor;
    }

    // 2. Clamp to prevent runaway accumulation from overlapping sources.
    for (let i = 0; i < FLUID_SIZE; i++) {
      const spd = Math.sqrt(vxGrid[i] * vxGrid[i] + vyGrid[i] * vyGrid[i]);
      if (spd > MAX_GRID_VEL) {
        const inv = MAX_GRID_VEL / spd;
        vxGrid[i] *= inv;
        vyGrid[i] *= inv;
      }
    }

    // 3. Light diffusion — smooths velocity for fluid-looking trails.
    _diffuseVelocity(0.09);

    // 4. Advect tracer particles through the velocity field.
    for (let i = 0; i < particles.length; i++) {
      const p  = particles[i];
      const vx = _bilerp(vxGrid, p.x, p.y);
      const vy = _bilerp(vyGrid, p.x, p.y);

      // Euler-integrate position in grid space.
      p.x += vx * dt;
      p.y += vy * dt;

      // Update smoothed speed estimate.
      const spd = Math.sqrt(vx * vx + vy * vy);
      p.smoothedSpeed += (spd - p.smoothedSpeed) * SPEED_SMOOTH_ALPHA;

      // Sample dye colour when the particle is moving meaningfully.
      // Blend toward the local dye colour, weighted by particle speed.
      if (spd > RESPAWN_SLOW_THRESH * 3) {
        const sr  = _bilerp(dyeR, p.x, p.y);
        const sg  = _bilerp(dyeG, p.x, p.y);
        const sb  = _bilerp(dyeB, p.x, p.y);
        const mag = Math.sqrt(sr * sr + sg * sg + sb * sb);
        if (mag > MIN_DYE_MAG_FOR_BLEND) {
          // Normalise the dye sample to [0,255] range, then blend.
          const inv   = 255.0 / mag;
          // Stronger speed → faster colour adoption; preserves vividness.
          const blend = _clamp(spd / (SPEED_FULL_OPACITY * 2.0), 0, 1) * 0.3;
          p.r += (sr * inv - p.r) * blend;
          p.g += (sg * inv - p.g) * blend;
          p.b += (sb * inv - p.b) * blend;
          p.hueIdx = _hueBucket(p.r, p.g, p.b);
        }
      }

      // Record trail in ring buffer.
      p.trailX[p.trailHead] = p.x;
      p.trailY[p.trailHead] = p.y;
      p.trailHead = (p.trailHead + 1) % TRAIL_LENGTH;
      if (p.trailCount < TRAIL_LENGTH) p.trailCount++;

      // Respawn if out of bounds or stalled.
      const oob = p.x < -OOB_MARGIN_CELLS || p.x > FLUID_COLS + OOB_MARGIN_CELLS ||
                  p.y < -OOB_MARGIN_CELLS || p.y > FLUID_ROWS + OOB_MARGIN_CELLS;
      if (oob || p.smoothedSpeed < RESPAWN_SLOW_THRESH) {
        const np    = _makeParticle();
        // Preserve colour on respawn so the palette doesn't reset abruptly.
        np.hueIdx   = p.hueIdx;
        np.r = p.r; np.g = p.g; np.b = p.b;
        particles[i] = np;
      }
    }
  }

  function render(ctx: CanvasRenderingContext2D): void {
    // Clear all batch arrays (pre-allocated, so no GC pressure).
    for (let h = 0; h < HUE_STEPS; h++) {
      for (let a = 0; a < ALPHA_BUCKETS; a++) {
        _batches[h][a].length = 0;
      }
    }

    // Bin every trail segment into its (hueIdx, alphaBucket) slot.
    // The effective bucket merges trail age (j/n) and speed (opacityScale)
    // so that slow particles produce dim tails even at their heads.
    for (let pi = 0; pi < particles.length; pi++) {
      const p = particles[pi];
      if (p.trailCount < 2) continue;

      const opacityScale = _smoothstep(p.smoothedSpeed / SPEED_FULL_OPACITY);
      if (opacityScale < 0.02) continue;

      const hue = p.hueIdx;
      const n   = p.trailCount;

      for (let j = 1; j < n; j++) {
        // Combined alpha = (trail-age fraction) × (speed fraction) × peak
        const ageFrac  = j / n;
        const bkt = _clamp(Math.floor(ageFrac * opacityScale * ALPHA_BUCKETS), 0, ALPHA_BUCKETS - 1);
        const prev = (p.trailHead - n + j - 1 + TRAIL_LENGTH) % TRAIL_LENGTH;
        const curr = (p.trailHead - n + j     + TRAIL_LENGTH) % TRAIL_LENGTH;
        const arr  = _batches[hue][bkt];
        // Store world-space coordinates directly.
        arr.push(
          p.trailX[prev] * cellW, p.trailY[prev] * cellH,
          p.trailX[curr] * cellW, p.trailY[curr] * cellH,
        );
      }
    }

    // Issue one compound stroke per non-empty (hue, bucket) pair —
    // at most HUE_STEPS × ALPHA_BUCKETS = 60 state changes per frame.
    ctx.save();
    ctx.lineCap   = 'round';
    ctx.lineJoin  = 'round';
    ctx.lineWidth = TRAIL_LINE_WIDTH;

    for (let h = 0; h < HUE_STEPS; h++) {
      const hueDeg = h * 30;
      for (let b = 0; b < ALPHA_BUCKETS; b++) {
        const arr = _batches[h][b];
        if (arr.length === 0) continue;

        // Alpha for this bucket: linearly spaced from (1/ALPHA_BUCKETS) up to 1,
        // then scaled by TRAIL_PEAK_ALPHA.
        const alpha = ((b + 1) / ALPHA_BUCKETS) * TRAIL_PEAK_ALPHA;
        ctx.strokeStyle = `hsla(${hueDeg},82%,66%,${alpha.toFixed(3)})`;
        ctx.beginPath();
        for (let k = 0; k < arr.length; k += 4) {
          ctx.moveTo(arr[k],     arr[k + 1]);
          ctx.lineTo(arr[k + 2], arr[k + 3]);
        }
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function reset(): void {
    vxGrid.fill(0);
    vyGrid.fill(0);
    dyeR.fill(0);
    dyeG.fill(0);
    dyeB.fill(0);
    particles = [];
    for (let i = 0; i < PARTICLE_COUNT; i++) particles.push(_makeParticle());
  }

  return { resize, addForce, addExplosion, step, render, reset };
}
