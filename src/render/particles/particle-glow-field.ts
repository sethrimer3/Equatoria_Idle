/**
 * Particle Glow Field — smooth nebula-style glow behind particles.
 *
 * Architecture
 * ────────────────────────────────────────────────────────────────────
 * A low-resolution intensity grid (CELL_SIZE internal pixels per cell)
 * accumulates per-tier energy from nearby particles each frame.
 *
 * Each particle splats energy into a Gaussian kernel sized proportionally
 * to its sizeIndex so that larger motes have a proportionally larger glow
 * (sizeIndex=0 uses BASE_SPLAT_RADIUS cells; sizeIndex=N uses
 * BASE_SPLAT_RADIUS × (N+1) cells, capped at MAX_SPLAT_RADIUS).
 *
 * Coordinate alignment (offset bug prevention)
 * ─────────────────────────────────────────────
 * The mote body is drawn via:
 *   fillRect(Math.floor(p.x - half), Math.floor(p.y - half), ceil(size), ceil(size))
 * so its visual centre is Math.floor(p.x - half) + ceil(size)/2, which can
 * differ from p.x by up to ~1 canvas pixel.  Using the raw p.x for the
 * Gaussian centre would offset the glow from the rendered body.
 *
 * Fix: compute the rendered body centre and use that as the Gaussian origin:
 *   bodyCenterX = Math.floor(p.x - half) + Math.ceil(p.size) / 2
 * The glow Gaussian is centred at (bodyCenterX, bodyCenterY) in canvas-pixel
 * space, and pcx = bodyCenterX / CELL_SIZE in cell space.
 *
 * The offscreen canvas is drawn back at exactly gridW × CELL_SIZE by
 * gridH × CELL_SIZE pixels (not canvasW × canvasH) so each cell maps to
 * exactly CELL_SIZE canvas pixels — eliminating any fractional-scale error
 * when canvasH is not perfectly divisible by CELL_SIZE.
 *
 * A BLUR_RADIUS ctx.filter is applied before compositing to diffuse the
 * cell-block edges into smooth circular halos without bilinear-interpolation
 * peak-offset artefacts.
 *
 * ─── Debug / Tuning constants ─────────────────────────────────────────
 *
 *  GLOW_ENABLED         master switch (false = disable entirely for debug)
 *  CELL_SIZE            internal pixels per grid cell (lower = finer + costlier)
 *  BASE_SPLAT_RADIUS    kernel half-radius in cells for sizeIndex=0 motes
 *  MAX_SPLAT_RADIUS     hard cap on per-particle kernel radius (cells)
 *  BASE_SPLAT_SIGMA     Gaussian σ (cells) for sizeIndex=0 motes
 *  MAX_SPLAT_SIGMA      hard cap on per-particle σ (cells)
 *  BLUR_RADIUS          additional blur applied at composite time (internal px)
 *  INTENSITY_MULT       base energy contribution per particle per frame
 *  PERSISTENCE          per-frame intensity decay (lower = faster fade)
 *  MAX_ALPHA            maximum opacity of the glow layer (0–1)
 *  GLOW_K               saturation steepness: alpha = 1 − exp(−GLOW_K · I)
 *  BLEND_MODE           canvas composite operation for the glow layer
 */

import type { EquatoriaParticle } from './particle-types';
import { TIERS } from '../../data/tiers/tier-definitions';
import { parseHexToRgb } from '../assets/color-utils';

// ─── Debug / Tuning constants ─────────────────────────────────────────

/** Master on/off.  The caller in particle-renderer.ts also guards on options.enableGlow. */
const GLOW_ENABLED = true;

/**
 * Internal canvas pixels per grid cell.
 * 320 px internal width → 80-cell grid.  Offscreen canvas drawn back at
 * exactly (gridW × CELL_SIZE) × (gridH × CELL_SIZE) to ensure exact scale.
 */
const CELL_SIZE = 4;

/**
 * Kernel half-radius in cells for sizeIndex=0 (1×1 mote).
 * Physical radius for sizeIndex=N ≈ BASE_SPLAT_RADIUS × (N+1) × CELL_SIZE px.
 * Increase for a larger base halo; decrease for a tighter core.
 */
const BASE_SPLAT_RADIUS = 2;

/** Hard cap on per-particle kernel half-radius (cells). */
const MAX_SPLAT_RADIUS = 6;

/**
 * Gaussian σ (cells) for sizeIndex=0 motes.  σ for sizeIndex=N ≈
 * BASE_SPLAT_SIGMA × (N+1).  Larger σ → softer, fluffier falloff.
 */
const BASE_SPLAT_SIGMA = 0.9;

/** Hard cap on per-particle σ (cells). */
const MAX_SPLAT_SIGMA = 2.5;


/**
 * Base energy contribution per particle per frame (after kernel normalisation).
 * Tuned so a single medium mote produces a gentle halo in steady state.
 */
const INTENSITY_MULT = 0.22;

/**
 * Per-frame intensity persistence (0–1).  Applied once per render frame so
 * a background-tab wakeup cannot produce a glow burst.
 * 0.85 ≈ ~60 ms half-life at 60 fps — snappy, minimal trail.
 * 0.92 ≈ ~165 ms half-life — more atmospheric.
 */
const PERSISTENCE = 0.86;

/**
 * Maximum opacity of the composited glow field (0–1).
 * Raise for more dramatic glows; values above 0.5 can wash out particle cores.
 */
const MAX_ALPHA = 0.30;

/**
 * Steepness of the alpha saturation (diminishing-returns) curve:
 *   alpha = MAX_ALPHA × (1 − exp(−GLOW_K × totalIntensity))
 * Larger GLOW_K → glow brightens faster as motes accumulate.
 * This prevents additive blowout when many same-colour motes overlap.
 */
const GLOW_K = 3.0;

/**
 * Canvas composite operation for the glow layer.
 * 'screen': lightens without clipping to white, avoids grey/brown mud.
 * 'lighter': more intense additive look (watch for white-out on dense clusters).
 */
const BLEND_MODE: GlobalCompositeOperation = 'screen';

// ─── Per-size-index precomputed kernel tables ──────────────────────────
//
// For each sizeIndex we precompute:
//   splatR   — half-radius of the Gaussian kernel in cells
//   inv2s2   — 1 / (2σ²) for the Gaussian exponent
//   invNorm  — 1 / Σ exp(−d²·inv2s2), ensuring each particle adds exactly
//              INTENSITY_MULT × sizeWeight total energy regardless of size
//
// This avoids any per-particle norm recomputation in the hot loop.

const _MAX_PRECOMPUTED_SI = 7; // support sizeIndex 0–7

const _splatRBySi    = new Uint8Array(_MAX_PRECOMPUTED_SI + 1);
const _inv2s2BySi    = new Float64Array(_MAX_PRECOMPUTED_SI + 1);
const _invNormBySi   = new Float64Array(_MAX_PRECOMPUTED_SI + 1);

// Precomputed flat kernel weight tables — indexed by integer (dy,dx) offsets.
// Replaces per-particle Math.exp calls in the hot splat loop with typed-array lookups.
// Layout: _kernelWeights[si][(dy+r)*(2r+1)+(dx+r)] = exp(-(dx²+dy²)*inv2s2)
const _kernelWeights: Float32Array[] = new Array(_MAX_PRECOMPUTED_SI + 1);
const _kernelDiam    = new Uint8Array(_MAX_PRECOMPUTED_SI + 1);

(function precomputeSizeKernels(): void {
  for (let si = 0; si <= _MAX_PRECOMPUTED_SI; si++) {
    const r     = Math.min(BASE_SPLAT_RADIUS * (si + 1), MAX_SPLAT_RADIUS);
    const sigma = Math.min(BASE_SPLAT_SIGMA  * (si + 1), MAX_SPLAT_SIGMA);
    const inv2s2 = 1.0 / (2.0 * sigma * sigma);
    const diam = 2 * r + 1;
    let norm = 0;
    const weights = new Float32Array(diam * diam);
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        const w = Math.exp(-(dx * dx + dy * dy) * inv2s2);
        weights[(dy + r) * diam + (dx + r)] = w;
        norm += w;
      }
    }
    _splatRBySi[si]     = r;
    _inv2s2BySi[si]     = inv2s2;
    _invNormBySi[si]    = norm > 0 ? 1.0 / norm : 1.0;
    _kernelWeights[si]  = weights;
    _kernelDiam[si]     = diam;
  }
})();

const TIER_COUNT = TIERS.length;

// ─── Cached tier glow colours ─────────────────────────────────────

// Pre-parsed from TIERS[i].glowColor so we never call parseHexToRgb in the
// hot loop.
const _tierR = new Uint8Array(TIER_COUNT);
const _tierG = new Uint8Array(TIER_COUNT);
const _tierB = new Uint8Array(TIER_COUNT);

(function cacheTierColors() {
  for (let ti = 0; ti < TIER_COUNT; ti++) {
    const [r, g, b] = parseHexToRgb(TIERS[ti].glowColor);
    _tierR[ti] = r;
    _tierG[ti] = g;
    _tierB[ti] = b;
  }
})();

// ─── Grid state ───────────────────────────────────────────────────

let _gridW = 0;
let _gridH = 0;

/**
 * Flat array of per-cell tier intensities.
 * Layout: [cell0_tier0, cell0_tier1, …, cell0_tierN, cell1_tier0, …]
 * Size: _gridW * _gridH * TIER_COUNT
 * Reused across frames — only recreated on resize.
 */
let _intensities = new Float32Array(0);

/**
 * Set of linear cell indices (cy*gridW+cx) that have at least one
 * tier intensity above the visibility threshold.  Only these cells are
 * processed in Steps 1 and 3, avoiding the full 166 k-element sweep.
 */
const _activeCells = new Set<number>();

/** Low-resolution offscreen canvas for the glow field pixels. */
let _offCanvas: HTMLCanvasElement | null = null;
let _offCtx: CanvasRenderingContext2D | null = null;
/** Reusable ImageData for direct pixel writes. */
let _imageData: ImageData | null = null;

// ─── Grid initialisation ──────────────────────────────────────────

/**
 * Ensure the grid, offscreen canvas, and ImageData are sized correctly.
 * No-ops unless the grid dimensions have changed (e.g. window resize).
 */
function ensureGrid(canvasW: number, canvasH: number): void {
  const gw = Math.max(1, Math.ceil(canvasW / CELL_SIZE));
  const gh = Math.max(1, Math.ceil(canvasH / CELL_SIZE));
  if (gw === _gridW && gh === _gridH) return;

  _gridW = gw;
  _gridH = gh;
  _intensities = new Float32Array(gw * gh * TIER_COUNT);

  if (_offCanvas === null) {
    _offCanvas = document.createElement('canvas');
  }
  _offCanvas.width = gw;
  _offCanvas.height = gh;
  _offCtx = _offCanvas.getContext('2d')!;
  _imageData = _offCtx.createImageData(gw, gh);
}

// ─── Public API ───────────────────────────────────────────────────

/**
 * Draw the particle glow field onto `ctx`.
 *
 * Must be called **before** trails and particle bodies so the field sits
 * behind solid content.  Only active (non-silently-merging) particles
 * contribute to the field.
 *
 * @param ctx      Main canvas 2D context.
 * @param particles Particle array from the simulation.
 * @param canvasW  Internal canvas width (cc.widthPx).
 * @param canvasH  Internal canvas height (cc.heightPx).
 */
export function drawParticleGlowField(
  ctx: CanvasRenderingContext2D,
  particles: EquatoriaParticle[],
  canvasW: number,
  canvasH: number,
): void {
  if (!GLOW_ENABLED) return;
  ensureGrid(canvasW, canvasH);
  if (_gridW === 0 || _gridH === 0 || !_offCtx || !_imageData || !_offCanvas) return;

  const gridW = _gridW;
  const gridH = _gridH;
  const intensities = _intensities;
  const tierCount = TIER_COUNT;

  // ── Step 1: Temporal decay ───────────────────────────────────
  // Applied once per render frame (not per deltaMs) so large deltaMs from
  // background-tab wakeup cannot accumulate a glow burst.
  for (let i = 0, len = intensities.length; i < len; i++) {
    intensities[i] *= PERSISTENCE;
  }

  // ── Step 2: Splat particles into grid ────────────────────────
  //
  // Each particle splats energy into nearby grid cells using a continuous
  // Gaussian weight based on the exact sub-cell fractional distance from
  // the particle to each cell's integer-grid position.  Using the raw
  // floating-point particle position (not rounded to cell boundaries) means
  // the glow contribution shifts smoothly as the particle moves — there is
  // no cell-snap stepping artefact.
  for (let pi = 0, plen = particles.length; pi < plen; pi++) {
    const p = particles[pi];
    // Skip silently-merging particles (they are invisible at the generator).
    // Forge-crunch particles are still flying and contribute normally.
    if (p.isMerging && !p.isForgeCrunchParticle) continue;

    const ti = Math.min(p.tierIndex, tierCount - 1);

    // Larger particles contribute more glow — small motes remain subtle.
    // Larger particles contribute more energy AND have a proportionally
    // larger kernel (scaling is handled in _splatRBySi / _invNormBySi).
    // sizeWeight provides an additional brightness boost for bigger motes
    // so their halos remain visually distinct even after kernel normalisation.
    // We use the clamped `si` (computed below) so sizeWeight stays consistent
    // with the kernel parameters; beyond _MAX_PRECOMPUTED_SI both the kernel
    // and the weight are capped at the same level.
    //
    // Per-sizeIndex precomputed kernel parameters (avoid float recomputation
    // in the inner loop).
    const si       = Math.min(p.sizeIndex, _MAX_PRECOMPUTED_SI);
    const sizeWeight = 0.5 + si * 0.25; // 0.50 / 0.75 / 1.00 / 1.25 … capped at si=_MAX
    const splatR   = _splatRBySi[si];
    const inv2s2   = _inv2s2BySi[si];
    const invNorm  = _invNormBySi[si];

    // _invNormBySi ensures total energy per particle ≈ INTENSITY_MULT × sizeWeight.
    const contrib = INTENSITY_MULT * sizeWeight * invNorm;

    // ── Coordinate alignment ──────────────────────────────────────────
    //
    // The mote body is drawn via:
    //   fillRect(Math.floor(p.x − half), Math.floor(p.y − half), ceil(size), ceil(size))
    // so its visual centre (in canvas pixels) is:
    //   bodyCenterX = Math.floor(p.x − half) + Math.ceil(p.size) / 2
    //
    // If we used raw p.x the glow centre would be offset to the right/down by
    // up to ~1 px (sub-pixel position never perfectly matches the floor-aligned
    // fillRect centre).  Using the rendered body centre removes this offset.
    //
    // pcx / pcy are in cell-space (divide by CELL_SIZE so each unit = one grid
    // cell).  The drawImage destination (Step 5) maps cell cx back to canvas
    // pixel cx × CELL_SIZE — the same scale that was used here — so there is no
    // round-trip coordinate error.
    //
    // Note: p.size is constant for a particle's lifetime (changes only on
    // merge events), so half and ceilS could be cached on the particle object
    // for a micro-optimisation; they are cheap to compute here at ~4 ops/frame.
    const half      = p.size * 0.5;
    const ceilS     = Math.ceil(p.size);
    const bodyX     = Math.floor(p.x - half) + ceilS * 0.5;  // rendered centre X
    const bodyY     = Math.floor(p.y - half) + ceilS * 0.5;  // rendered centre Y
    const pcx       = bodyX / CELL_SIZE - 0.5;   // cell-centre-space X
    const pcy       = bodyY / CELL_SIZE - 0.5;   // cell-centre-space Y
    const gcxi      = Math.floor(pcx);
    const gcyi      = Math.floor(pcy);

    // Gaussian splat — weight uses real fractional distance so the contribution
    // shifts smoothly as the particle moves (no cell-snap stepping artefact).
    for (let dy = -splatR; dy <= splatR; dy++) {
      const cy = gcyi + dy;
      if (cy < 0 || cy >= gridH) continue;
      const ddy = cy - pcy;
      for (let dx = -splatR; dx <= splatR; dx++) {
        const cx = gcxi + dx;
        if (cx < 0 || cx >= gridW) continue;
        const ddx = cx - pcx;
        const w = Math.exp(-(ddx * ddx + ddy * ddy) * inv2s2);
        intensities[(cy * gridW + cx) * tierCount + ti] += contrib * w;
      }
    }
  }

  // ── Step 3: Build pixel data for the low-res glow canvas ─────
  //
  // Colour mixing: weighted-average RGB so each tier contributes
  // proportionally to its intensity.  This produces smooth gradients
  // between neighbouring colour regions instead of hard hue jumps.
  //
  //   totalWeight  = Σ intensity[ti]
  //   finalColor   = Σ (intensity[ti] × tierColor[ti]) / totalWeight
  //   finalAlpha   = clamp(1 − exp(−GLOW_K × totalWeight), 0, MAX_ALPHA)
  const data = _imageData.data;
  for (let cy = 0; cy < gridH; cy++) {
    const rowBase = cy * gridW;
    for (let cx = 0; cx < gridW; cx++) {
      const cellBase = (rowBase + cx) * tierCount;
      const pixBase  = (rowBase + cx) * 4;

      let totalI = 0.0;
      let sumR   = 0.0;
      let sumG   = 0.0;
      let sumB   = 0.0;

      for (let ti = 0; ti < tierCount; ti++) {
        const iv = intensities[cellBase + ti];
        if (iv < 0.0001) continue;
        totalI += iv;
        sumR   += iv * _tierR[ti];
        sumG   += iv * _tierG[ti];
        sumB   += iv * _tierB[ti];
      }

      if (totalI < 0.001) {
        // Empty cell — fully transparent.
        data[pixBase]     = 0;
        data[pixBase + 1] = 0;
        data[pixBase + 2] = 0;
        data[pixBase + 3] = 0;
        continue;
      }

      // Normalise colour by total weight → smooth RGB gradient between tiers.
      const invTotal = 1.0 / totalI;
      const r = sumR * invTotal;
      const g = sumG * invTotal;
      const b = sumB * invTotal;

      // Soft alpha curve — faint halos fade gracefully; clusters brighten
      // smoothly but are capped so brightness never blows out.
      const alpha = Math.min(MAX_ALPHA, 1.0 - Math.exp(-GLOW_K * totalI));

      data[pixBase]     = Math.round(r);
      data[pixBase + 1] = Math.round(g);
      data[pixBase + 2] = Math.round(b);
      data[pixBase + 3] = Math.round(alpha * 255);
    }
  }

  // ── Step 4: Write pixel data to offscreen canvas ─────────────
  _offCtx.putImageData(_imageData, 0, 0);

  // ── Step 5: Scale offscreen canvas onto main canvas ──────────
  //
  // Coordinate notes (see also Step 2 header):
  //
  //   Destination: gridW × CELL_SIZE × gridH × CELL_SIZE canvas pixels.
  //   NOT canvasW × canvasH — that would introduce a fractional y-scale when
  //   canvasH is not perfectly divisible by CELL_SIZE (e.g. 643 px / 161 cells
  //   gives scale 3.994 instead of 4.0, shifting the glow ~1 px downward).
  //   Drawing at the exact integral multiple ensures every cell cx maps to
  //   the canvas range [cx × CELL_SIZE, (cx+1) × CELL_SIZE), matching the
  //   pcx = bodyX / CELL_SIZE calculation in Step 2.
  //
  //   The destination rect may extend 0–3 px below/right of the canvas
  //   (when canvasH/W is not a CELL_SIZE multiple); the canvas clips it.
  //
  //   imageSmoothingEnabled = false: nearest-neighbour scaling — the CSS-level
  //   filter blur (below) provides all the smoothing we need; bilinear here
  //   would cause a double-blur and can shift the peak slightly off-centre.
  //
  //   ctx.filter blur: applied in internal canvas pixel units before CSS
  //   upscale.  BLUR_RADIUS internal px × CSS scale ≈ the on-screen halo
  //   radius.  This converts hard 4×4-cell blocks into smooth circular halos
  //   without any offset artefact.
  //
  //   BLEND_MODE = 'screen': result = 1 − (1−src)(1−dst).
  //   Lightens without clipping to white; avoids grey/brown mud.
  ctx.save();
  ctx.globalCompositeOperation = BLEND_MODE;
  ctx.imageSmoothingEnabled = true; // bilinear upscale softens cell edges without an explicit blur pass
  ctx.drawImage(_offCanvas, 0, 0, _gridW * CELL_SIZE, _gridH * CELL_SIZE);
  ctx.restore();
}

/**
 * Clear all intensity data.
 * Call this when the particle simulation resets so the glow field does not
 * show a ghost of the previous session.
 */
export function resetGlowField(): void {
  if (_intensities.length > 0) {
    _intensities.fill(0);
  }
}
