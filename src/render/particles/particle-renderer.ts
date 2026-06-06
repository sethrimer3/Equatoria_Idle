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
import type { EquatoriaParticle, ActiveMerge, Shockwave, ParticleRenderOptions } from './particle-types';
import { MEDIUM_SIZE_INDEX, LARGE_SIZE_INDEX } from '../../data/particles/size-tiers';
import { getTrailPosition } from './particle-physics';
import { parseHexToRgb } from '../assets/color-utils';
import { drawParticleGlowField } from './particle-glow-field';
import { perfStats } from '../debug/perf-stats';

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

/** Returns the accumulated animation time in milliseconds (for synchronized visual effects). */
export function getParticleRendererAnimTimeMs(): number {
  return _animTimeMs;
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

// ─── Animated merge trail rendering ──────────────────────────────

/**
 * Draw animated trails for all active suction merges.
 *
 * For each merge up to MERGE_TRAIL_COUNT trails are drawn as quadratic bezier
 * curves from the particle's pre-teleport position to the generator.
 *
 * Each trail has two phases driven by lineDashOffset:
 *   Draw  (0 → drawDur):  trail grows from tail (particle start) toward tip (generator).
 *   Erase (0 → eraseDur): trail shrinks from tail, leaving tip last.
 *
 * lineDashOffset derivation (path length ≈ L, dash pattern [L, L]):
 *   Draw  phase:  offset = L × (1 − drawProgress)   → [dashLen→0], tail appears first.
 *   Erase phase:  offset = −L × eraseProgress        → [0→−dashLen], tail disappears first.
 */
function drawActiveMergeTrails(
  ctx: CanvasRenderingContext2D,
  activeMerges: ActiveMerge[],
  nowMs: number,
): void {
  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  for (let mi = 0, mlen = activeMerges.length; mi < mlen; mi++) {
    const merge = activeMerges[mi];
    if (!merge.trailStartXY || merge.trailCount === 0) continue;

    const elapsed = nowMs - merge.trailAnimStartMs;
    const drawDur = merge.trailDrawDurationMs;
    const eraseDur = merge.trailEraseDurationMs;
    if (elapsed < 0 || elapsed >= drawDur + eraseDur) continue;

    const isDrawPhase = elapsed < drawDur;
    const drawProgress = isDrawPhase ? elapsed / drawDur : 1.0;
    const eraseProgress = isDrawPhase ? 0.0 : (elapsed - drawDur) / eraseDur;

    const [r, g, b] = parseHexToRgb(merge.trailColor);

    for (let ti = 0; ti < merge.trailCount; ti++) {
      const sx = merge.trailStartXY[ti * 2];
      const sy = merge.trailStartXY[ti * 2 + 1];
      const tx = merge.targetX;
      const ty = merge.targetY;

      const ddx = tx - sx;
      const ddy = ty - sy;
      const L = Math.sqrt(ddx * ddx + ddy * ddy);
      if (L < 1) continue;

      // Bezier control point: perpendicular offset at midpoint
      const curveAngle = merge.trailCurveAngles![ti];
      const midX = (sx + tx) * 0.5;
      const midY = (sy + ty) * 0.5;
      const perpX = -ddy / L;
      const perpY = ddx / L;
      const curveOffset = L * Math.tan(curveAngle);
      const controlX = midX + perpX * curveOffset;
      const controlY = midY + perpY * curveOffset;

      // dashLen slightly exceeds straight-line distance to cover bezier arc length
      const dashLen = L * 1.1;

      // lineDashOffset animation (see function comment above)
      const dashOffset = isDrawPhase
        ? dashLen * (1 - drawProgress)
        : -(dashLen * eraseProgress);

      ctx.setLineDash([dashLen, dashLen]);
      ctx.lineDashOffset = dashOffset;

      // Alpha fades slightly during erase
      ctx.globalAlpha = isDrawPhase ? 0.82 : 0.82 * (1 - eraseProgress * 0.5);

      // Glow behind trail
      ctx.shadowBlur = 4;
      ctx.shadowColor = `rgb(${r},${g},${b})`;
      ctx.strokeStyle = `rgb(${r},${g},${b})`;
      ctx.lineWidth = 1.5;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.quadraticCurveTo(controlX, controlY, tx, ty);
      ctx.stroke();
      perfStats.trailDrawCalls++;
    }
  }

  ctx.setLineDash([]);
  ctx.lineDashOffset = 0;
  ctx.globalAlpha = 1;
  ctx.shadowBlur = 0;
  ctx.restore();
}

// ─── Draw ────────────────────────────────────────────────────────

export function drawParticles(
  cc: CanvasContext,
  particles: EquatoriaParticle[],
  shockwaves: Shockwave[],
  activeMerges: ActiveMerge[],
  options: ParticleRenderOptions,
  nowMs: number,
): void {
  const ctx = cc.ctx;

  // ── Draw glow field (high graphics only) ──
  // Must be drawn first so it sits behind trails and particle bodies.
  // The field replaces per-particle additive glow as the primary broad-glow
  // source, preventing muddy colour mixing from overlapping particles.
  if (options.enableGlow) {
    drawParticleGlowField(ctx, particles, cc.widthPx, cc.heightPx);
  }

  // ── Draw animated merge trails ──
  drawActiveMergeTrails(ctx, activeMerges, nowMs);

  // ── Draw trails for medium+ particles ──
  if (options.enableTrails) {
    for (let pi = 0, plen = particles.length; pi < plen; pi++) {
      const p = particles[pi];
      // Skip suction-merge particles — they are at the generator and invisible.
      // Forge-crunch particles (isForgeCrunchParticle) still fly visibly.
      if (p.isMerging && !p.isForgeCrunchParticle) continue;
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
            // With the glow field active, reduce trail shadowBlur to keep
            // particle bodies crisp without double-glow muddiness.
            ctx.shadowBlur = tailSize * 2;
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
    // Suction-merge particles are teleported to the generator and should not
    // be rendered (they are invisible behind it). Forge-crunch particles are
    // still flying and should remain visible.
    if (p.isMerging && !p.isForgeCrunchParticle) continue;
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
      // With the glow field providing broad ambient glow, reduce per-particle
      // shadowBlur to a crisp highlight rather than a heavy bloom.  This keeps
      // particle bodies readable and avoids double-glow muddiness.
      ctx.shadowBlur = batch.size * 1.5;
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
