/**
 * terrain-lighting.ts — Shared lightweight terrain lighting / tinting system.
 *
 * Collects per-frame light emitters (enemies, player, attacks, beams) and
 * provides utility functions to sample colored illumination at a world-space
 * point.  Consumed by:
 *   - euhedral-hex-floor.ts   (full-screen floor hexes)
 *   - basalt-terrain.ts        (Euhedral solid formations)
 *   - verdure-cave-walls / verdure-segmented-surface (Verdure stone structures)
 *
 * Performance targets:
 *   - Emitter list is capped and spatially culled; no large per-frame allocations.
 *   - Beam emitters use distance-to-segment math (no per-frame mesh work).
 *   - Sampling is O(emitters) — the list is kept small (≤ MAX_EMITTERS).
 */

// ── Public types ───────────────────────────────────────────────────────────────

export type TerrainLightType = 'point' | 'beam';

/**
 * One light source affecting terrain this frame.
 * Beam emitters also carry `x2`/`y2` for the far end of the segment.
 */
export interface TerrainLightEmitter {
  x: number;
  y: number;
  /** Red 0–255. */
  r: number;
  /** Green 0–255. */
  g: number;
  /** Blue 0–255. */
  b: number;
  /** Influence radius in logical px. */
  radiusPx: number;
  /** Overall intensity scalar 0–1. */
  intensity: number;
  type: TerrainLightType;
  /** Far endpoint (only meaningful when type === 'beam'). */
  x2: number;
  y2: number;
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Maximum number of terrain light emitters collected per frame. */
export const MAX_TERRAIN_LIGHT_EMITTERS = 40;

// ── Distance helpers ───────────────────────────────────────────────────────────

/**
 * Squared distance from point (px, py) to line segment (ax, ay)→(bx, by).
 * Returns squared pixel distance.
 */
export function distToSegmentSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const dx = bx - ax;
  const dy = by - ay;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) {
    // Degenerate segment — treat as point
    const ex = px - ax, ey = py - ay;
    return ex * ex + ey * ey;
  }
  // Parameter t of the nearest point on the infinite line, clamped to [0, 1]
  let t = ((px - ax) * dx + (py - ay) * dy) / lenSq;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const nx = ax + t * dx - px;
  const ny = ay + t * dy - py;
  return nx * nx + ny * ny;
}

// ── Sampling ───────────────────────────────────────────────────────────────────

/**
 * Samples the combined terrain light tint at world-space point (cx, cy).
 *
 * Returns a blended `{r, g, b, blend}` tuple, where `blend` ∈ [0, 1] is the
 * total influence weight (0 = no nearby light; 1 = fully tinted).
 * Returns null when no emitter is close enough to be relevant.
 */
export function sampleTerrainLightAt(
  cx: number,
  cy: number,
  emitters: TerrainLightEmitter[],
): { r: number; g: number; b: number; blend: number } | null {
  let totalW = 0;
  let sumR = 0, sumG = 0, sumB = 0;

  for (let i = 0; i < emitters.length; i++) {
    const e = emitters[i];
    const r2 = e.radiusPx * e.radiusPx;
    let distSq: number;
    if (e.type === 'beam') {
      distSq = distToSegmentSq(cx, cy, e.x, e.y, e.x2, e.y2);
    } else {
      const ddx = cx - e.x;
      const ddy = cy - e.y;
      distSq = ddx * ddx + ddy * ddy;
    }
    if (distSq >= r2) continue;
    const dist = Math.sqrt(distSq);
    const falloff = 1 - dist / e.radiusPx;
    const w = falloff * falloff * e.intensity;
    totalW += w;
    sumR += w * e.r;
    sumG += w * e.g;
    sumB += w * e.b;
  }

  if (totalW <= 0) return null;

  const blend = totalW > 1 ? 1 : totalW;
  const invW = 1 / totalW;
  return {
    r: (sumR * invW + 0.5) | 0,
    g: (sumG * invW + 0.5) | 0,
    b: (sumB * invW + 0.5) | 0,
    blend,
  };
}
