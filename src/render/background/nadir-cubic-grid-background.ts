/**
 * nadir-cubic-grid-background.ts — "CubicGrid" elite-wave background for Horizon → Nadir.
 *
 * Inspired by XScreenSaver's CubicGrid by Jamie Zawinski.  A dark 3D rotating
 * lattice of tiny coloured points creates perspective starburst / vanishing-point
 * patterns as the lattice rotates.  The effect activates only during Nadir elite
 * waves (every 10th wave in the Nadir subzone) and fades in / out smoothly.
 *
 * Architecture
 * ────────────
 * • Lattice world-coordinates are precomputed once in `buildLatticePoints()` and
 *   stored in preallocated Float32Array / Uint8Array buffers.  Zero heap allocation
 *   per frame in the hot path.
 * • Rotation (Rx·Ry·Rz) and perspective projection are computed in a single
 *   tight loop each frame.
 * • Pixels are written directly into an ImageData buffer (one `putImageData` per
 *   frame — no per-point canvas state changes).
 * • The effect renders to an offscreen canvas at RENDER_SCALE of the game canvas,
 *   then is `drawImage`-upscaled into the main RPG canvas.
 * • When `isEliteWaveActive` is false the master alpha fades out; the update /
 *   draw functions become no-ops once alpha reaches 0.
 *
 * Colour palette (axis-based)
 * ───────────────────────────
 *   Axis 0 (X-parallel lines) : blue-white    (#5078ff)
 *   Axis 1 (Y-parallel lines) : red-magenta   (#ff50a0)
 *   Axis 2 (Z-parallel lines) : cyan-green    (#50ffc8)
 * Depth fading darkens distant points toward black.
 */

import {
  NADIR_CUBE_HALF_CELLS,
  NADIR_CUBE_HALF_CELLS_LOW,
  NADIR_CUBE_CELL_SIZE,
  NADIR_ROT_SPEED_X,
  NADIR_ROT_SPEED_Y,
  NADIR_ROT_SPEED_Z,
  projectNadirRotatedPointToGame,
  projectNadirGamePointToOffscreen,
  type NadirCubeProjectionState,
} from './nadir-cube-projection';

// ── Tuning constants ──────────────────────────────────────────────────────────

/** Number of sample points per lattice line segment. */
const SAMPLES = 42;

/**
 * Offscreen render scale relative to game-canvas dimensions.
 * Lower = faster; the upscale maintains the pixelated aesthetic.
 */
const RENDER_SCALE = 0.5;

/** Global composite alpha applied when drawing to the main canvas. */
const COMPOSITE_ALPHA = 0.78;

/** Seconds to reach full alpha from zero (fade in). */
const FADE_IN_S  = 1.2;
/** Seconds to reach zero alpha from full (fade out). */
const FADE_OUT_S = 0.8;

/** Max per-point brightness alpha in the ImageData buffer (0–255). */
const MAX_POINT_ALPHA = 220;

/** Colour channels for each axis (r, g, b). */
const AXIS_COLORS: [number, number, number][] = [
  [80,  120, 255],  // axis 0  — blue-white
  [255,  80, 160],  // axis 1  — red-magenta
  [ 80, 255, 200],  // axis 2  — cyan-green
];

// ── Low-graphics reduced parameters ──────────────────────────────────────────

const SAMPLES_LOW     = 28;
const RENDER_SCALE_LOW = 0.35;

// ── Public interface ──────────────────────────────────────────────────────────

export interface NadirCubicGridBackground {
  /**
   * Advance the effect simulation one step.
   * @param nowMs         Current timestamp (ms).
   * @param width         Game-canvas logical width in pixels.
   * @param height        Game-canvas logical height in pixels.
   * @param isActive      True while an elite Nadir wave is running; drives fade-in/out.
   * @param isLowGraphics True to use reduced point count and internal resolution.
   */
  update(
    nowMs: number,
    width: number,
    height: number,
    isActive: boolean,
    isLowGraphics: boolean,
  ): void;

  /** Composite the effect into the given canvas context. */
  draw(ctx: CanvasRenderingContext2D): void;

  /** Reset internal state (e.g. after resize or zone switch). */
  reset(): void;

  /** Release resources. */
  destroy(): void;

  /** Returns the current rotation angles for use by gameplay systems. */
  getProjectionState(): NadirCubeProjectionState;
}

// ── Lattice precomputation ────────────────────────────────────────────────────

interface LatticeBuffers {
  /** Unrotated world-space X coordinates for each point. */
  lx: Float32Array;
  /** Unrotated world-space Y coordinates. */
  ly: Float32Array;
  /** Unrotated world-space Z coordinates. */
  lz: Float32Array;
  /** Axis index (0=X-line, 1=Y-line, 2=Z-line) per point. */
  axis: Uint8Array;
  /** Total point count. */
  n: number;
}

/**
 * Precompute the unrotated world-space coordinates of all lattice sample points.
 *
 * For a cubic lattice with `halfCells` grid steps along each axis, separated by
 * `cellSize` world units, and `samples` sample points per line:
 *   - X-parallel lines: one per (iy, iz) pair → points span X from -range to +range
 *   - Y-parallel lines: one per (ix, iz) pair → points span Y
 *   - Z-parallel lines: one per (ix, iy) pair → points span Z
 */
function buildLatticePoints(halfCells: number, cellSize: number, samples: number): LatticeBuffers {
  const stride = 2 * halfCells + 1;          // grid intersections per axis side
  const n      = 3 * stride * stride * samples;
  const lx     = new Float32Array(n);
  const ly     = new Float32Array(n);
  const lz     = new Float32Array(n);
  const axis   = new Uint8Array(n);

  const range  = halfCells * cellSize;
  const sampleStep = samples > 1 ? (2 * range) / (samples - 1) : 0;

  let idx = 0;

  // X-parallel lines (axis 0)
  for (let iy = -halfCells; iy <= halfCells; iy++) {
    for (let iz = -halfCells; iz <= halfCells; iz++) {
      for (let s = 0; s < samples; s++) {
        lx[idx] = -range + s * sampleStep;
        ly[idx] = iy * cellSize;
        lz[idx] = iz * cellSize;
        axis[idx] = 0;
        idx++;
      }
    }
  }

  // Y-parallel lines (axis 1)
  for (let ix = -halfCells; ix <= halfCells; ix++) {
    for (let iz = -halfCells; iz <= halfCells; iz++) {
      for (let s = 0; s < samples; s++) {
        lx[idx] = ix * cellSize;
        ly[idx] = -range + s * sampleStep;
        lz[idx] = iz * cellSize;
        axis[idx] = 1;
        idx++;
      }
    }
  }

  // Z-parallel lines (axis 2)
  for (let ix = -halfCells; ix <= halfCells; ix++) {
    for (let iy = -halfCells; iy <= halfCells; iy++) {
      for (let s = 0; s < samples; s++) {
        lx[idx] = ix * cellSize;
        ly[idx] = iy * cellSize;
        lz[idx] = -range + s * sampleStep;
        axis[idx] = 2;
        idx++;
      }
    }
  }

  return { lx, ly, lz, axis, n };
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createNadirCubicGridBackground(): NadirCubicGridBackground {

  // ── Persistent rotated-point buffers (allocated alongside lattice) ───────────
  // Declared here so we can re-allocate when quality changes.
  let lattice: LatticeBuffers | null = null;
  let rxBuf: Float32Array | null = null;
  let ryBuf: Float32Array | null = null;
  let rzBuf: Float32Array | null = null;

  // ── Offscreen rendering state ─────────────────────────────────────────────
  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx: CanvasRenderingContext2D | null = null;
  let imageData: ImageData | null = null;
  let pixels: Uint8ClampedArray | null = null;
  let offW = 0;
  let offH = 0;
  let gameW = 0;
  let gameH = 0;

  // ── Animation state ───────────────────────────────────────────────────────
  let angX = 0;
  let angY = 0;
  let angZ = 0;
  let lastNowMs: number | null = null;
  let masterAlpha = 0;

  // ── Current quality flag ──────────────────────────────────────────────────
  let _isLowGraphics = false;

  // ── Helpers ───────────────────────────────────────────────────────────────

  /** Allocate or reallocate the offscreen canvas and ImageData for a given size. */
  function initOffscreen(w: number, h: number): void {
    offW = Math.ceil(w * RENDER_SCALE);
    offH = Math.ceil(h * RENDER_SCALE);
    const lowScale = RENDER_SCALE_LOW;
    if (_isLowGraphics) {
      offW = Math.ceil(w * lowScale);
      offH = Math.ceil(h * lowScale);
    }

    offCanvas = document.createElement('canvas');
    offCanvas.width  = offW;
    offCanvas.height = offH;
    offCtx   = offCanvas.getContext('2d')!;

    imageData = offCtx.createImageData(offW, offH);
    pixels    = imageData.data;
  }

  /** Allocate or reallocate the lattice buffers for the current quality setting. */
  function initLattice(isLow: boolean): void {
    const hc      = isLow ? NADIR_CUBE_HALF_CELLS_LOW  : NADIR_CUBE_HALF_CELLS;
    const samples = isLow ? SAMPLES_LOW     : SAMPLES;
    lattice = buildLatticePoints(hc, NADIR_CUBE_CELL_SIZE, samples);
    rxBuf   = new Float32Array(lattice.n);
    ryBuf   = new Float32Array(lattice.n);
    rzBuf   = new Float32Array(lattice.n);
  }

  // ── update ────────────────────────────────────────────────────────────────

  function update(
    nowMs: number,
    width: number,
    height: number,
    isActive: boolean,
    isLowGraphics: boolean,
  ): void {
    // Re-initialise on first call or dimension / quality change.
    const qualityChanged = isLowGraphics !== _isLowGraphics;
    const sizeChanged    = width !== gameW || height !== gameH;

    if (!offCanvas || sizeChanged || qualityChanged) {
      _isLowGraphics = isLowGraphics;
      gameW = width;
      gameH = height;
      initOffscreen(width, height);
    }

    if (!lattice || qualityChanged) {
      _isLowGraphics = isLowGraphics;
      initLattice(isLowGraphics);
    }

    // Advance master alpha toward target.
    const deltaSec = lastNowMs === null ? 0 : Math.min((nowMs - lastNowMs) / 1000, 0.1);
    lastNowMs = nowMs;

    if (isActive) {
      masterAlpha = Math.min(1, masterAlpha + deltaSec / FADE_IN_S);
    } else {
      masterAlpha = Math.max(0, masterAlpha - deltaSec / FADE_OUT_S);
    }

    // Early-out when fully faded.
    if (masterAlpha <= 0) return;

    // Advance rotation angles.
    angX += NADIR_ROT_SPEED_X * deltaSec;
    angY += NADIR_ROT_SPEED_Y * deltaSec;
    angZ += NADIR_ROT_SPEED_Z * deltaSec;

    // Precompute trig.
    const cX = Math.cos(angX), sX = Math.sin(angX);
    const cY = Math.cos(angY), sY = Math.sin(angY);
    const cZ = Math.cos(angZ), sZ = Math.sin(angZ);

    const { lx, ly, lz, axis, n } = lattice!;
    const rx = rxBuf!;
    const ry = ryBuf!;
    const rz = rzBuf!;

    // Apply combined rotation Rx · Ry · Rz to every point.
    for (let i = 0; i < n; i++) {
      const wx = lx[i], wy = ly[i], wz = lz[i];
      // Rotate around X
      const wy2 = wy * cX - wz * sX;
      const wz2 = wy * sX + wz * cX;
      // Rotate around Y
      const wx3 = wx * cY + wz2 * sY;
      const wz3 = -wx * sY + wz2 * cY;
      // Rotate around Z
      rx[i] = wx3 * cZ - wy2 * sZ;
      ry[i] = wx3 * sZ + wy2 * cZ;
      rz[i] = wz3;
    }

    // Project points and paint pixels.
    const scaleX = offW / gameW;
    const scaleY = offH / gameH;
    const pix = pixels!;
    // Clear to transparent each frame.
    pix.fill(0);

    for (let i = 0; i < n; i++) {
      const projected = projectNadirRotatedPointToGame(
        rx[i]!,
        ry[i]!,
        rz[i]!,
        { gameW, gameH },
      );
      if (!projected) continue;

      const { px, py } = projectNadirGamePointToOffscreen(projected.sx, projected.sy, scaleX, scaleY);
      if (px < 0 || px >= offW || py < 0 || py >= offH) continue;

      const pointAlpha = (projected.depthAlpha * MAX_POINT_ALPHA * masterAlpha) | 0;
      if (pointAlpha <= 0) continue;

      const pidx = (py * offW + px) << 2;   // × 4

      // Blend: take the max of existing vs new alpha so overlapping lines stay bright.
      if (pix[pidx + 3] >= pointAlpha) continue;

      const col = AXIS_COLORS[axis[i]]!;
      pix[pidx]     = col[0];
      pix[pidx + 1] = col[1];
      pix[pidx + 2] = col[2];
      pix[pidx + 3] = pointAlpha;
    }

    offCtx!.putImageData(imageData!, 0, 0);
  }

  // ── draw ──────────────────────────────────────────────────────────────────

  function draw(ctx: CanvasRenderingContext2D): void {
    if (!offCanvas || masterAlpha <= 0) return;

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    ctx.globalAlpha = COMPOSITE_ALPHA;
    ctx.drawImage(offCanvas, 0, 0, offCanvas.width, offCanvas.height, 0, 0, gameW, gameH);
    ctx.restore();
  }

  function getProjectionState() {
    return { angX, angY, angZ, gameW, gameH };
  }

  // ── reset / destroy ───────────────────────────────────────────────────────

  function reset(): void {
    offCanvas  = null;
    offCtx     = null;
    imageData  = null;
    pixels     = null;
    offW       = 0;
    offH       = 0;
    gameW      = 0;
    gameH      = 0;
    angX       = 0;
    angY       = 0;
    angZ       = 0;
    lastNowMs  = null;
    masterAlpha = 0;
  }

  function destroy(): void {
    reset();
    lattice = null;
    rxBuf   = null;
    ryBuf   = null;
    rzBuf   = null;
  }

  return { update, draw, reset, destroy, getProjectionState };
}
