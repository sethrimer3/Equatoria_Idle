/**
 * Particle Glow Field — smooth nebula-style glow behind particles.
 *
 * Why hue-family blending instead of raw RGB additive?
 * ───────────────────────────────────────────────────
 * Standard additive blending ('lighter' composite) sums R, G and B channels
 * independently.  When many differently-coloured particles overlap, the result
 * clips toward white or washes into grey/brown, because complementary hues
 * cancel each other in RGB space.
 *
 * This module instead tracks intensity *per tier family* per grid cell.  For
 * each cell it finds the dominant colour family and optionally blends in the
 * secondary family at a low weight.  Because the dominant hue is always chosen
 * from a bright, saturated glow colour, the output remains luminous even in
 * dense clusters.
 *
 * Spatial gradients arise automatically: the low-res field is scaled up to the
 * full canvas with `imageSmoothingEnabled = true`, so bilinear interpolation
 * creates smooth colour transitions between adjacent cells.
 *
 * The final composite uses `globalCompositeOperation = 'screen'`, which
 * lightens the destination without clipping to white or producing mud.
 *
 * ─── Tuning constants (all at the top of this file) ─────────────
 *  CELL_SIZE          — internal canvas pixels per grid cell (larger = cheaper)
 *  SPLAT_RADIUS       — kernel half-size in cells
 *  SPLAT_SIGMA        — Gaussian sigma for the splat kernel
 *  INTENSITY_MULT     — base intensity weight per particle per frame
 *  PERSISTENCE        — per-frame intensity decay multiplier
 *                       0.92 ≈ 150 ms half-life at 60 fps
 *                       0.88 ≈ 90 ms half-life at 60 fps
 *  MAX_ALPHA          — maximum alpha of the glow field layer
 *  GLOW_K             — steepness of the 1 − exp(−k·I) alpha curve
 *  SECONDARY_WEIGHT   — how much the secondary tier colour can tint the output
 */

import type { EquatoriaParticle } from './particle-types';
import { TIERS } from '../../data/tiers/tier-definitions';
import { parseHexToRgb } from '../assets/color-utils';
import { MEDIUM_SIZE_INDEX } from '../../data/particles/size-tiers';

// ─── Tuning constants ────────────────────────────────────────────

/** Internal canvas pixels per grid cell. Lower = finer glow, more work. */
const CELL_SIZE = 10;
/** Gaussian kernel half-size in cells. Total kernel = (2R+1)². */
const SPLAT_RADIUS = 2;
/** Gaussian sigma for the splat kernel (in cells). */
const SPLAT_SIGMA = 1.1;
/** Base intensity contribution per particle-frame (scaled by size). */
const INTENSITY_MULT = 0.55;
/**
 * Per-frame intensity persistence.  Applied once per render frame regardless
 * of deltaMs, so background-tab return does not cause intensity bursts.
 * 0.88 ≈ ~90 ms half-life at 60 fps (short, snappy trail).
 */
const PERSISTENCE = 0.88;
/** Maximum alpha channel value for the composited glow field (0–1). */
const MAX_ALPHA = 0.62;
/** Curve steepness for alpha = 1 − exp(−GLOW_K · totalIntensity). */
const GLOW_K = 2.8;
/**
 * Maximum weight the secondary colour family can contribute.
 * 0 = dominant colour only.  0.3 = up to 30% secondary tint.
 */
const SECONDARY_WEIGHT = 0.28;

// ─── Precomputed Gaussian splat kernel ──────────────────────────

const TIER_COUNT = TIERS.length;          // 13
const KERNEL_SIDE = SPLAT_RADIUS * 2 + 1; // 5
const _kernel = new Float32Array(KERNEL_SIDE * KERNEL_SIDE);

(function buildKernel() {
  const twoSigmaSq = 2 * SPLAT_SIGMA * SPLAT_SIGMA;
  let sum = 0;
  for (let dy = -SPLAT_RADIUS; dy <= SPLAT_RADIUS; dy++) {
    for (let dx = -SPLAT_RADIUS; dx <= SPLAT_RADIUS; dx++) {
      const idx = (dy + SPLAT_RADIUS) * KERNEL_SIDE + (dx + SPLAT_RADIUS);
      const v = Math.exp(-(dx * dx + dy * dy) / twoSigmaSq);
      _kernel[idx] = v;
      sum += v;
    }
  }
  for (let i = 0; i < _kernel.length; i++) _kernel[i] /= sum;
})();

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
  for (let pi = 0, plen = particles.length; pi < plen; pi++) {
    const p = particles[pi];
    // Skip silently-merging particles (they are invisible at the generator).
    // Forge-crunch particles are still flying and contribute normally.
    if (p.isMerging && !p.isForgeCrunchParticle) continue;

    const ti = Math.min(p.tierIndex, tierCount - 1);

    // Larger particles contribute more glow — small motes are subtle.
    const sizeWeight =
      p.sizeIndex < MEDIUM_SIZE_INDEX
        ? 0.45
        : p.sizeIndex === MEDIUM_SIZE_INDEX
          ? 1.0
          : Math.min(p.sizeIndex + 0.5, 4.0); // large=2.5, xl=3.5 (capped)

    const contrib = INTENSITY_MULT * sizeWeight;

    // Grid cell under the particle
    const gcxi = Math.floor(p.x / CELL_SIZE);
    const gcyi = Math.floor(p.y / CELL_SIZE);

    // Gaussian splat into neighbourhood
    for (let dy = -SPLAT_RADIUS; dy <= SPLAT_RADIUS; dy++) {
      const cy = gcyi + dy;
      if (cy < 0 || cy >= gridH) continue;
      const kyBase = (dy + SPLAT_RADIUS) * KERNEL_SIDE;
      for (let dx = -SPLAT_RADIUS; dx <= SPLAT_RADIUS; dx++) {
        const cx = gcxi + dx;
        if (cx < 0 || cx >= gridW) continue;
        const w = _kernel[kyBase + (dx + SPLAT_RADIUS)];
        intensities[(cy * gridW + cx) * tierCount + ti] += contrib * w;
      }
    }
  }

  // ── Step 3: Build pixel data for the low-res glow canvas ─────
  const data = _imageData.data;
  for (let cy = 0; cy < gridH; cy++) {
    const rowBase = cy * gridW;
    for (let cx = 0; cx < gridW; cx++) {
      const cellBase = (rowBase + cx) * tierCount;

      // Find dominant and secondary tier intensities
      let domIdx = 0;
      let domI = 0.0;
      let secIdx = -1;
      let secI = 0.0;
      let totalI = 0.0;

      for (let ti = 0; ti < tierCount; ti++) {
        const iv = intensities[cellBase + ti];
        totalI += iv;
        if (iv > domI) {
          secIdx = domIdx;
          secI = domI;
          domIdx = ti;
          domI = iv;
        } else if (iv > secI) {
          secIdx = ti;
          secI = iv;
        }
      }

      const pixBase = (rowBase + cx) * 4;

      if (totalI < 0.002) {
        // Empty cell — fully transparent
        data[pixBase]     = 0;
        data[pixBase + 1] = 0;
        data[pixBase + 2] = 0;
        data[pixBase + 3] = 0;
        continue;
      }

      // Alpha: non-linear curve so faint halos fade gracefully.
      const alpha = Math.min(MAX_ALPHA, 1.0 - Math.exp(-GLOW_K * totalI));

      // Dominant colour (always the majority hue)
      let r = _tierR[domIdx];
      let g = _tierG[domIdx];
      let b = _tierB[domIdx];

      // Secondary tint: only when secondary is substantial relative to dominant.
      // The blend is capped at SECONDARY_WEIGHT to keep the dominant hue visible.
      if (secIdx >= 0 && secI > 0.08 * domI) {
        const blend = Math.min(SECONDARY_WEIGHT, SECONDARY_WEIGHT * (secI / domI));
        const inv = 1.0 - blend;
        r = Math.round(inv * r + blend * _tierR[secIdx]);
        g = Math.round(inv * g + blend * _tierG[secIdx]);
        b = Math.round(inv * b + blend * _tierB[secIdx]);
      }

      data[pixBase]     = r;
      data[pixBase + 1] = g;
      data[pixBase + 2] = b;
      data[pixBase + 3] = Math.round(alpha * 255);
    }
  }

  // ── Step 4: Write pixel data to offscreen canvas ─────────────
  _offCtx.putImageData(_imageData, 0, 0);

  // ── Step 5: Scale offscreen canvas onto main canvas ──────────
  // 'screen' composite: result = 1 − (1 − src)(1 − dst) per channel.
  // This lightens without clipping to white and avoids brown/grey mud.
  ctx.save();
  ctx.globalCompositeOperation = 'screen';
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
