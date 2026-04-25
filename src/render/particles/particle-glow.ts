/**
 * Cluster-based gradient glow rendering for mote particles.
 *
 * Replaces per-batch `shadowBlur` with explicit radial gradients drawn using
 * `screen` compositing.  Key behaviours:
 *
 *  - Same-colour particles in the same spatial cell share one glow, so a
 *    pile of sand motes becomes one combined halo instead of dozens of
 *    individual rings stacking into white noise.
 *
 *  - Different-colour particles near each other draw separate radial-gradient
 *    glows with `screen` compositing.  Because screen blending computes
 *    `result = 1 − (1−a)(1−b)`, red + blue → magenta rather than grey.
 *
 *  - When N distinct colours appear in the same cell (co-located particles),
 *    each colour's glow centre is nudged by `COLOCATION_OFFSET_FRACTION ×
 *    glowRadius` in its assigned angular direction.  The N directions are
 *    distributed equidistantly (360° / N apart) around the cell centre, with
 *    a stable per-cell base angle.  This makes each colour fan out into its
 *    own sector while still blending smoothly into adjacent colours at the
 *    sector boundaries.
 *
 * Performance notes:
 *  - Inner Maps and ColorAccum objects are pooled to avoid per-frame GC.
 *  - At most one `createRadialGradient` + `arc` + `fill` call per unique
 *    (colour × cell) combination — typically far fewer draw calls than
 *    the previous per-batch shadowBlur pass.
 */

import type { EquatoriaParticle } from './particle-types';
import { parseHexToRgb } from '../assets/color-utils';

// ─── Tuning constants ────────────────────────────────────────────

/**
 * Spatial grid cell size in canvas pixels.
 * Particles in the same cell share one glow per colour.
 * Matches the typical visual glow radius so particles within one glow
 * diameter naturally merge into the same cluster.
 */
const GLOW_CELL_SIZE = 24;

/** Glow disc radius = particle.size × GLOW_RADIUS_MULTIPLIER. */
const GLOW_RADIUS_MULTIPLIER = 4;

/**
 * Fraction of the glow radius by which each colour's centre is nudged in its
 * assigned angular direction when a cell contains multiple distinct colours.
 * 0 → all centres overlap (merges to white); 1 → centres are fully separated.
 * 0.35 keeps the colour sectors visibly distinct while blending in the middle.
 */
const COLOCATION_OFFSET_FRACTION = 0.35;

/**
 * Maximum distinct glow colours that can appear in a single grid cell.
 * The current tier system has 13 tiers, so 16 provides a safe margin.
 * The sorted-colour scratch buffer is pre-allocated to this size.
 */
const MAX_COLORS_PER_CELL = 16;

// ─── Stable angular hash constants ───────────────────────────────

/**
 * Knuth multiplicative hash constants for mapping grid cell coordinates to a
 * stable, spatially-varied base angle.  These are well-known large primes
 * chosen to spread integer inputs across the full 32-bit range.
 */
const HASH_PRIME_X = 2654435761;
const HASH_PRIME_Y = 1013904223;
/** Divisor that converts an unsigned 32-bit integer to [0, 1). */
const UINT32_RANGE = 4294967296;

// ─── Pooled per-frame allocations ────────────────────────────────

/** Accumulates position + size data for all same-colour particles in a cell. */
interface ColorAccum {
  totalX: number;
  totalY: number;
  maxSize: number;
  count: number;
}

/** Outer map: numeric cell key → (inner map: glow colour → accumulator). */
const _outerMap = new Map<number, Map<string, ColorAccum>>();

/** Pool of inner Maps, grown lazily, cleared and reused each frame. */
const _innerMapPool: Array<Map<string, ColorAccum>> = [];
let _innerMapUsed = 0;

/** Pool of ColorAccum objects, grown lazily, reset and reused each frame. */
const _accumPool: ColorAccum[] = [];
let _accumUsed = 0;

function getInnerMap(): Map<string, ColorAccum> {
  if (_innerMapUsed < _innerMapPool.length) {
    const m = _innerMapPool[_innerMapUsed++];
    m.clear();
    return m;
  }
  const m = new Map<string, ColorAccum>();
  _innerMapPool.push(m);
  _innerMapUsed++;
  return m;
}

function getAccum(): ColorAccum {
  if (_accumUsed < _accumPool.length) {
    const a = _accumPool[_accumUsed++];
    a.totalX = 0;
    a.totalY = 0;
    a.maxSize = 0;
    a.count = 0;
    return a;
  }
  const a: ColorAccum = { totalX: 0, totalY: 0, maxSize: 0, count: 0 };
  _accumPool.push(a);
  _accumUsed++;
  return a;
}

/** Scratch buffer for per-cell sorted colour entries — reused each frame. */
interface SortedColorEntry {
  color: string;
  cx: number;
  cy: number;
  radius: number;
}

const _sortedColors: SortedColorEntry[] = Array.from({ length: MAX_COLORS_PER_CELL }, () => ({
  color: '',
  cx: 0,
  cy: 0,
  radius: 0,
}));

// ─── Public API ──────────────────────────────────────────────────

/**
 * Draw gradient glow halos for all glowing particles using cluster-based
 * colour blending.
 *
 * Call this when `options.enableGlow` is `true`, before drawing particle
 * bodies so the glow appears behind each particle's solid fill.
 */
export function drawClusterGlows(
  ctx: CanvasRenderingContext2D,
  particles: EquatoriaParticle[],
): void {
  // ── Phase 1: accumulate particles into (cell × colour) groups ────

  _innerMapUsed = 0;
  _accumUsed = 0;
  _outerMap.clear();

  const N = particles.length;
  const INV_CELL = 1 / GLOW_CELL_SIZE;

  for (let i = 0; i < N; i++) {
    const p = particles[i];
    if (p.isMerging && !p.isForgeCrunchParticle) continue;
    if (!p.glowColorString) continue;

    const gcx = Math.floor(p.x * INV_CELL);
    const gcy = Math.floor(p.y * INV_CELL);
    // Cell key format: upper 16 bits = x grid coordinate, lower 16 bits = y grid coordinate.
    // Masking with 0xFFFF makes the encoding wrap correctly for negative coordinates.
    const key = ((gcx & 0xFFFF) << 16) | (gcy & 0xFFFF);

    let colorMap = _outerMap.get(key);
    if (!colorMap) {
      colorMap = getInnerMap();
      _outerMap.set(key, colorMap);
    }

    let accum = colorMap.get(p.glowColorString);
    if (!accum) {
      accum = getAccum();
      colorMap.set(p.glowColorString, accum);
    }

    accum.totalX += p.x;
    accum.totalY += p.y;
    if (p.size > accum.maxSize) accum.maxSize = p.size;
    accum.count++;
  }

  // ── Phase 2: draw with screen compositing ────────────────────────

  ctx.save();
  ctx.globalCompositeOperation = 'screen';

  for (const [cellKey, colorMap] of _outerMap) {
    const numColors = colorMap.size;

    if (numColors === 1) {
      // Fast path: single colour in this cell — one radial gradient, no offset.
      for (const [color, accum] of colorMap) {
        const cx = accum.totalX / accum.count;
        const cy = accum.totalY / accum.count;
        const radius = accum.maxSize * GLOW_RADIUS_MULTIPLIER;
        drawRadialGlow(ctx, cx, cy, radius, color);
      }
    } else {
      // Multi-colour cell: assign equidistant angular offsets so each colour
      // fans into its own sector rather than merging to white at the centre.

      // Decode grid cell coordinates from the key for a stable per-cell base angle.
      let gcx = (cellKey >>> 16) & 0xFFFF;
      if (gcx >= 0x8000) gcx -= 0x10000;
      let gcy = cellKey & 0xFFFF;
      if (gcy >= 0x8000) gcy -= 0x10000;

      // Deterministic, spatially-varied base angle via integer hash (see HASH_PRIME_X/Y).
      const baseAngle =
        (((gcx * HASH_PRIME_X + gcy * HASH_PRIME_Y) >>> 0) / UINT32_RANGE) * Math.PI * 2;

      // Collect colour entries; sort by colour string for stable angle assignment
      // so particles crossing a cell boundary don't cause flickering.
      let sortedCount = 0;
      for (const [color, accum] of colorMap) {
        // Guard: never exceed the pre-allocated scratch buffer size.
        if (sortedCount >= MAX_COLORS_PER_CELL) break;
        const entry = _sortedColors[sortedCount];
        entry.color = color;
        entry.cx = accum.totalX / accum.count;
        entry.cy = accum.totalY / accum.count;
        entry.radius = accum.maxSize * GLOW_RADIUS_MULTIPLIER;
        sortedCount++;
      }
      // Sort in-place within the pre-allocated buffer (max TIER_COUNT entries).
      // Insertion sort is fast for small N and avoids a temporary array.
      for (let si = 1; si < sortedCount; si++) {
        const keyColor = _sortedColors[si].color;
        const keyCx = _sortedColors[si].cx;
        const keyCy = _sortedColors[si].cy;
        const keyRadius = _sortedColors[si].radius;
        let sj = si - 1;
        while (sj >= 0 && _sortedColors[sj].color > keyColor) {
          _sortedColors[sj + 1].color = _sortedColors[sj].color;
          _sortedColors[sj + 1].cx = _sortedColors[sj].cx;
          _sortedColors[sj + 1].cy = _sortedColors[sj].cy;
          _sortedColors[sj + 1].radius = _sortedColors[sj].radius;
          sj--;
        }
        _sortedColors[sj + 1].color = keyColor;
        _sortedColors[sj + 1].cx = keyCx;
        _sortedColors[sj + 1].cy = keyCy;
        _sortedColors[sj + 1].radius = keyRadius;
      }

      const angleStep = (Math.PI * 2) / sortedCount;

      for (let ci = 0; ci < sortedCount; ci++) {
        const entry = _sortedColors[ci];
        const angle = baseAngle + angleStep * ci;
        const offset = entry.radius * COLOCATION_OFFSET_FRACTION;
        // Nudge glow centre in its assigned direction so colours fan outward.
        const ox = entry.cx + Math.cos(angle) * offset;
        const oy = entry.cy + Math.sin(angle) * offset;
        drawRadialGlow(ctx, ox, oy, entry.radius, entry.color);
      }
    }
  }

  ctx.restore();
}

// ─── Internal helper ─────────────────────────────────────────────

/**
 * Draw a single radial glow disc at (x, y).
 * Gradient profile: full-alpha at centre → transparent at `radius`.
 */
function drawRadialGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  color: string,
): void {
  if (radius < 0.5) return;
  const [r, g, b] = parseHexToRgb(color);
  const grad = ctx.createRadialGradient(x, y, 0, x, y, radius);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.9)`);
  grad.addColorStop(0.45, `rgba(${r},${g},${b},0.45)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fill();
}
