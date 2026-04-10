/**
 * Particle rendering — batched draw calls for trails, particles,
 * and shockwaves.
 *
 * Performance notes:
 *  - Batch keys are numeric (tierIndex << 8 | sizeIndex) rather than
 *    string concatenation.
 *  - Position arrays are typed Float64Arrays that grow-only to avoid
 *    repeated allocation.
 *  - Trail positions are read from the ring buffer via direct index
 *    arithmetic with no intermediate object allocation.
 */

import type { CanvasContext } from '../canvas';
import type { EquatoriaParticle, Shockwave, ParticleRenderOptions } from './particle-types';
import { MEDIUM_SIZE_INDEX, LARGE_SIZE_INDEX } from '../../data/particles/size-tiers';
import { getTrailPosition } from './particle-physics';

// ─── Tier index constants ───────────────────────────────────────
const DIAMOND_TIER_INDEX = 9;
const FRACTERYL_TIER_INDEX = 11;
const EIGENSTEIN_TIER_INDEX = 12;

const FRACTERYL_PALETTE = ['#7A2CFF', '#C03C9E', '#D6A3FF', '#E48AA0', '#F2A16B'] as const;
const EIGENSTEIN_PALETTE = ['#C65A2E', '#A34728', '#8A2F1F', '#6B3A22', '#E38A4A'] as const;

// Module-level animation time (accumulated ms) for shimmer effects
let _animTimeMs = 0;

/** Call once per frame with the elapsed time in milliseconds. */
export function updateParticleRendererTime(deltaMs: number): void {
  _animTimeMs += deltaMs;
}

// ─── Batch data structure ───────────────────────────────────────

interface DrawBatch {
  color: string;
  glow: string | null;
  size: number;
  /** Flat array of [x0,y0, x1,y1, …] positions. */
  positions: Float64Array;
  count: number;
}

/**
 * Module-level batch map keyed by (tierIndex << 8 | sizeIndex).
 * Reused across frames — only the count is reset each frame.
 */
const _batchMap = new Map<number, DrawBatch>();

function getBatch(key: number, color: string, glow: string | null, size: number): DrawBatch {
  let batch = _batchMap.get(key);
  if (!batch) {
    batch = { color, glow, size, positions: new Float64Array(512), count: 0 };
    _batchMap.set(key, batch);
  }
  batch.color = color;
  batch.glow = glow;
  batch.size = size;
  batch.count = 0;
  return batch;
}

function pushPosition(batch: DrawBatch, x: number, y: number): void {
  const idx = batch.count * 2;
  if (idx + 1 >= batch.positions.length) {
    const newArr = new Float64Array(batch.positions.length * 2);
    newArr.set(batch.positions);
    batch.positions = newArr;
  }
  batch.positions[idx] = x;
  batch.positions[idx + 1] = y;
  batch.count++;
}

/**
 * Reusable out-object for trail position reading.
 * Safe because canvas rendering is single-threaded — this is never
 * accessed concurrently.
 */
const _trailPos = { x: 0, y: 0 };

// ─── Draw ────────────────────────────────────────────────────────

export function drawParticles(
  cc: CanvasContext,
  particles: EquatoriaParticle[],
  shockwaves: Shockwave[],
  options: ParticleRenderOptions,
): void {
  const ctx = cc.ctx;

  // ── Draw trails for medium+ particles ──
  if (options.enableTrails) {
    for (let pi = 0, plen = particles.length; pi < plen; pi++) {
      const p = particles[pi];
      if (p.sizeIndex < MEDIUM_SIZE_INDEX || p.trailCount < 2) continue;
      const isLarge = p.sizeIndex >= LARGE_SIZE_INDEX;
      const trailLen = p.trailCount;

      for (let i = 0; i < trailLen; i++) {
        const t = i / trailLen;
        getTrailPosition(p, i, _trailPos);

        if (isLarge) {
          const tailSize = p.size * t * 0.8;
          const alpha = t * 0.6;
          if (tailSize < 0.3) continue;

          if (options.enableGlow && p.glowColorString) {
            ctx.globalAlpha = alpha * 0.4;
            ctx.shadowBlur = tailSize * 4;
            ctx.shadowColor = p.glowColorString;
            ctx.fillStyle = p.glowColorString;
            const glowHalf = tailSize * 1.5;
            ctx.fillRect(
              Math.floor(_trailPos.x - glowHalf),
              Math.floor(_trailPos.y - glowHalf),
              Math.ceil(glowHalf * 2),
              Math.ceil(glowHalf * 2),
            );
            ctx.shadowBlur = 0;
          }

          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.colorString;
          const half = tailSize / 2;
          ctx.fillRect(
            Math.floor(_trailPos.x - half),
            Math.floor(_trailPos.y - half),
            Math.ceil(tailSize),
            Math.ceil(tailSize),
          );
        } else {
          const alpha = t * 0.25;
          ctx.globalAlpha = alpha;
          ctx.fillStyle = p.colorString;
          ctx.fillRect(Math.floor(_trailPos.x), Math.floor(_trailPos.y), 1, 1);
        }
      }
    }
  }
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;

  // ── Batch particles by numeric key ──
  // Reset counts on existing batches
  for (const batch of _batchMap.values()) batch.count = 0;

  for (let pi = 0, plen = particles.length; pi < plen; pi++) {
    const p = particles[pi];
    const key = (p.tierIndex << 8) | p.sizeIndex;
    let batch = _batchMap.get(key);
    if (!batch || batch.count === 0) {
      batch = getBatch(key, p.colorString, p.glowColorString, p.size);
    }
    pushPosition(batch, p.x, p.y);
  }

  // ── Draw each batch ──
  for (const batch of _batchMap.values()) {
    if (batch.count === 0) continue;
    if (options.enableGlow && batch.glow) {
      ctx.shadowBlur = batch.size * 3;
      ctx.shadowColor = batch.glow;
    } else {
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle = batch.color;
    const half = batch.size / 2;
    const positions = batch.positions;
    const ceilSize = Math.ceil(batch.size);
    for (let i = 0, len = batch.count; i < len; i++) {
      const bi = i * 2;
      ctx.fillRect(
        Math.floor(positions[bi] - half),
        Math.floor(positions[bi + 1] - half),
        ceilSize,
        ceilSize,
      );
    }
  }
  ctx.shadowBlur = 0;

  // ── Draw shockwaves ──
  for (let i = 0, len = shockwaves.length; i < len; i++) {
    const sw = shockwaves[i];
    ctx.strokeStyle = sw.color;
    ctx.globalAlpha = sw.alpha;
    ctx.lineWidth = Math.max(0.5, sw.edgeThickness * 0.2);
    ctx.beginPath();
    ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.globalAlpha = 1;

  // ── Special effects: diamond prismatic sheen ──
  if (options.enableGlow) {
    drawDiamondPrismaticSheen(ctx, particles);
    drawPalettePrismaticSheen(ctx, particles, FRACTERYL_TIER_INDEX, FRACTERYL_PALETTE, 0.58, 0.34);
    drawPalettePrismaticSheen(ctx, particles, EIGENSTEIN_TIER_INDEX, EIGENSTEIN_PALETTE, 0.52, 0.3);
  }
}

function drawDiamondPrismaticSheen(
  ctx: CanvasRenderingContext2D,
  particles: EquatoriaParticle[],
): void {
  const t = _animTimeMs / 1000;
  for (let pi = 0, plen = particles.length; pi < plen; pi++) {
    const p = particles[pi];
    if (p.tierIndex !== DIAMOND_TIER_INDEX) continue;

    // Cycle through hues over time; offset each particle by index so they look varied
    const hueOffset = (t * 120 + pi * 47) % 360;
    const half = p.size / 2;

    drawPrismaticRect(ctx, p.x, p.y, half, p.size, hueOffset, 0.55);
    drawPrismaticRect(ctx, p.x, p.y, half, p.size, (hueOffset + 120) % 360, 0.3);

    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawPalettePrismaticSheen(
  ctx: CanvasRenderingContext2D,
  particles: EquatoriaParticle[],
  tierIndex: number,
  palette: readonly string[],
  primaryAlpha: number,
  secondaryAlpha: number,
): void {
  const t = _animTimeMs / 1000;
  const colorCount = palette.length;

  for (let pi = 0, plen = particles.length; pi < plen; pi++) {
    const p = particles[pi];
    if (p.tierIndex !== tierIndex) continue;

    const half = p.size / 2;
    const speed = 1.8;
    const shifted = (t * speed + pi * 0.63) % colorCount;
    const baseIndex = Math.floor(shifted);
    const nextIndex = (baseIndex + 1) % colorCount;

    const primaryColor = palette[baseIndex];
    const secondaryColor = palette[nextIndex];

    drawPaletteRect(ctx, p.x, p.y, half, p.size, primaryColor, primaryAlpha);
    drawPaletteRect(ctx, p.x, p.y, half, p.size, secondaryColor, secondaryAlpha);
    ctx.shadowBlur = 0;
  }
  ctx.globalAlpha = 1;
}

function drawPrismaticRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  size: number,
  hue: number,
  alpha: number,
): void {
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = size * 5;
  ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
  ctx.fillStyle = `hsl(${hue}, 100%, 75%)`;
  ctx.fillRect(Math.floor(x - half), Math.floor(y - half), Math.ceil(size), Math.ceil(size));
}

function drawPaletteRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  half: number,
  size: number,
  color: string,
  alpha: number,
): void {
  ctx.globalAlpha = alpha;
  ctx.shadowBlur = size * 4.5;
  ctx.shadowColor = color;
  ctx.fillStyle = color;
  ctx.fillRect(Math.floor(x - half), Math.floor(y - half), Math.ceil(size), Math.ceil(size));
}
