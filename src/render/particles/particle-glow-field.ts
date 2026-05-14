/**
 * Particle Glow Field — smooth nebula-style glow behind particles.
 *
 * Architecture
 * ────────────────────────────────────────────────────────────────────
 * A low-resolution intensity grid (CELL_SIZE internal pixels per cell)
 * accumulates per-tier energy from nearby particles each frame.
 *
 * The splat kernel uses the particle's exact sub-cell position (fractional
 * cell coordinate) to compute a continuous Gaussian weight for each nearby
 * cell.  This means the glow shifts smoothly as a particle moves — there is
 * no per-cell snap.  At CELL_SIZE=4 the offscreen canvas is upscaled only 4×
 * to the main canvas, so bilinear interpolation produces genuinely smooth
 * circular halos instead of blocky tiles.
 *
 * Pixel colours are built by weighted-average RGB mixing: each tier's glow
 * colour is blended proportionally to its intensity contribution, producing
 * smooth gradients where different-coloured motes overlap.
 *
 * A soft alpha curve (1 − exp(−GLOW_K · I)) keeps lone motes as faint halos
 * while allowing clusters to gently brighten, capped at MAX_ALPHA so
 * brightness never blows out.
 *
 * The final composite uses `globalCompositeOperation = 'screen'`, which
 * lightens without clipping to white.
 *
 * ─── Debug / Tuning constants ─────────────────────────────────────────
 *
 *  GLOW_ENABLED      master switch (set false to disable entirely for debug)
 *  CELL_SIZE         internal pixels per grid cell — lower = finer + costlier
 *  SPLAT_RADIUS      kernel half-size in cells — physical radius ≈ SPLAT_RADIUS × CELL_SIZE px
 *  SPLAT_SIGMA       Gaussian σ in cells — physical σ = SPLAT_SIGMA × CELL_SIZE px
 *  INTENSITY_MULT    base energy contribution per particle per frame
 *  PERSISTENCE       per-frame intensity decay (0.90 ≈ 110 ms half-life @ 60 fps)
 *  MAX_ALPHA         maximum opacity of the glow layer (0–1)
 *  GLOW_K            alpha saturation steepness: alpha = 1 − exp(−GLOW_K · I)
 *  BLEND_MODE        canvas composite operation for the glow layer
 */

import type { EquatoriaParticle } from './particle-types';
import { TIERS } from '../../data/tiers/tier-definitions';
import { parseHexToRgb } from '../assets/color-utils';
import { MEDIUM_SIZE_INDEX } from '../../data/particles/size-tiers';

// ─── Debug / Tuning constants ─────────────────────────────────────────
//
// All values intentionally conservative.  Increase gradually to taste.

/**
 * Master on/off for the glow field.
 * Note: the caller in particle-renderer.ts also guards with options.enableGlow.
 * This constant is a secondary override for quick dev testing.
 */
const GLOW_ENABLED = true;

/**
 * Internal canvas pixels per grid cell.
 * At the game's 320 px internal width, CELL_SIZE=4 → 80-cell grid.
 * The offscreen canvas is upscaled 4× with bilinear filtering, producing
 * smooth circular halos.  Raising this to 8 halves the work but coarsens
 * the glow and increases cell-snapping of slow-moving particles.
 */
const CELL_SIZE = 4;

/**
 * Gaussian kernel half-size in cells.
 * Physical glow radius ≈ SPLAT_RADIUS × CELL_SIZE internal pixels.
 * With CELL_SIZE=4 and SPLAT_RADIUS=3, the kernel covers a 12 px radius,
 * which is ~4-8× the size of a small/medium mote (0.75–1.5 px).
 */
const SPLAT_RADIUS = 3;

/**
 * Gaussian σ in cells.  Physical σ = SPLAT_SIGMA × CELL_SIZE px.
 * With CELL_SIZE=4 and SPLAT_SIGMA=1.5, σ ≈ 6 px — a gentle, wide falloff.
 * Increase for a fluffier/softer glow; decrease for a tighter core.
 */
const SPLAT_SIGMA = 1.5;

/**
 * Base energy contribution per particle per frame (after kernel normalisation).
 * Tuned so a single medium mote produces ~25-30% alpha at the cell centre in
 * steady state.  Scale down for subtler glows; never exceed ~0.6.
 */
const INTENSITY_MULT = 0.22;

/**
 * Per-frame intensity persistence.  Applied once per render frame regardless
 * of deltaMs, so a background-tab wakeup cannot produce a glow burst.
 * 0.90 ≈ ~110 ms half-life at 60 fps.
 * 0.95 ≈ ~220 ms half-life (longer, more atmospheric trail).
 * 0.85 ≈ ~60 ms half-life  (snappy, minimal trail).
 */
const PERSISTENCE = 0.90;

/**
 * Maximum alpha of the composited glow field layer (0–1).
 * 0.35 keeps the glow atmospheric; even a large cluster stays under 35% opacity.
 * Raise cautiously — values above 0.5 can wash out particle cores.
 */
const MAX_ALPHA = 0.35;

/**
 * Steepness of the alpha saturation curve: alpha = 1 − exp(−GLOW_K · I).
 * Larger = faster saturation (the glow reaches MAX_ALPHA sooner).
 * Smaller = gentler curve (requires more intensity to reach full brightness).
 */
const GLOW_K = 2.5;

/**
 * Canvas composite operation used when drawing the glow layer.
 * 'screen' lightens without clipping to white and avoids muddy grey.
 * Try 'lighter' for a more intense additive look (watch for white-out).
 */
const BLEND_MODE: GlobalCompositeOperation = 'screen';

// ─── Precomputed kernel normalisation ─────────────────────────────────
//
// The splat loop uses the particle's exact sub-cell fractional position to
// compute exp(−d²/2σ²) for each nearby cell — a continuous Gaussian that
// shifts smoothly as the particle moves.  We normalise contributions so
// each particle adds exactly INTENSITY_MULT × sizeWeight energy per frame
// regardless of sub-cell offset.
//
// _kernelNorm is the sum of the discrete Gaussian over the integer-offset
// kernel (a good approximation of the continuous integral for σ ≥ 1).
// _kernelInvNorm = 1 / _kernelNorm, multiplied into each contribution.

const TIER_COUNT = TIERS.length;
const _twoSigmaSqInv = 1.0 / (2 * SPLAT_SIGMA * SPLAT_SIGMA);

let _kernelNorm = 0;
(function computeKernelNorm() {
  for (let dy = -SPLAT_RADIUS; dy <= SPLAT_RADIUS; dy++) {
    for (let dx = -SPLAT_RADIUS; dx <= SPLAT_RADIUS; dx++) {
      _kernelNorm += Math.exp(-(dx * dx + dy * dy) * _twoSigmaSqInv);
    }
  }
})();
const _kernelInvNorm = 1.0 / _kernelNorm;

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
    const sizeWeight =
      p.sizeIndex < MEDIUM_SIZE_INDEX
        ? 0.3
        : p.sizeIndex === MEDIUM_SIZE_INDEX
          ? 0.8
          : Math.min(p.sizeIndex * 0.8, 3.0); // large=1.6, xl=2.4 (capped)

    // _kernelInvNorm normalises so total energy added per particle ≈
    // INTENSITY_MULT × sizeWeight regardless of sub-cell position.
    const contrib = INTENSITY_MULT * sizeWeight * _kernelInvNorm;

    // Sub-cell fractional position in cell-space.
    const pcx = p.x / CELL_SIZE;
    const pcy = p.y / CELL_SIZE;
    const gcxi = Math.floor(pcx);
    const gcyi = Math.floor(pcy);

    // Gaussian splat — weight uses real fractional distance so contribution
    // shifts continuously rather than snapping cell-to-cell.
    for (let dy = -SPLAT_RADIUS; dy <= SPLAT_RADIUS; dy++) {
      const cy = gcyi + dy;
      if (cy < 0 || cy >= gridH) continue;
      const ddy = cy - pcy;
      for (let dx = -SPLAT_RADIUS; dx <= SPLAT_RADIUS; dx++) {
        const cx = gcxi + dx;
        if (cx < 0 || cx >= gridW) continue;
        const ddx = cx - pcx;
        const w = Math.exp(-(ddx * ddx + ddy * ddy) * _twoSigmaSqInv);
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
  // The offscreen canvas is CELL_SIZE× smaller than the main canvas.
  // imageSmoothingEnabled=true (bilinear) upscales the low-res glow field
  // into smooth circular halos.  At CELL_SIZE=4 the 4× upscale interpolates
  // cleanly without visible tile edges.
  //
  // BLEND_MODE='screen': result = 1 − (1−src)(1−dst) per channel.
  // Lightens without clipping to white and avoids grey/brown mud.
  ctx.save();
  ctx.globalCompositeOperation = BLEND_MODE;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'low'; // bilinear — sufficient for smooth blobs
  ctx.drawImage(_offCanvas, 0, 0, canvasW, canvasH);
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
