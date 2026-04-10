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
}
