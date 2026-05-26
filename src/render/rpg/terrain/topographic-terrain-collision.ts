/**
 * topographic-terrain-collision.ts — Terrain collision, line-of-sight, and
 * pathfinding helpers for all terrain variants.
 *
 * All functions here take an authoritative `TopographicTerrainState` and answer
 * spatial queries (point-inside, segment-intersection, signed-distance, push-out,
 * repulsion force) across all terrain variants: topographic, recursiveSquares,
 * basalt, and seafloorRidges.
 *
 * This module is re-exported wholesale from topographic-terrain.ts so existing
 * consumer imports continue to resolve from the canonical entry point.
 */

import type { TopographicTerrainState, TopographicTerrainPoint } from './topographic-terrain';
import { getSquareNodeGrowthAlpha01 } from './recursive-square-terrain';
import { getBasaltCellAlpha } from './basalt-terrain';

// ── Private: terrain-variant polygon accessors ──────────────────────────────

/**
 * Returns the corner polygons for all recursive-square nodes that are
 * currently active (growth alpha > 0.1).
 */
function _getActiveSquarePolygons(state: TopographicTerrainState): TopographicTerrainPoint[][] {
  const result: TopographicTerrainPoint[][] = [];
  for (const node of state.squareNodes) {
    const alpha = getSquareNodeGrowthAlpha01(node.depth, state.squareMaxDepth, state.growth01);
    if (alpha > 0.1) {
      result.push(node.corners);
    }
  }
  return result;
}

function _getActiveBasaltPolygons(state: TopographicTerrainState): TopographicTerrainPoint[][] {
  const result: TopographicTerrainPoint[][] = [];
  if (!state.basalt) return result;
  for (const cell of state.basalt.cells) {
    if (getBasaltCellAlpha(cell, state.growth01) > 0.1) {
      result.push(cell.corners);
    }
  }
  return result;
}

// ── Private: geometry helpers ────────────────────────────────────────────────

function isPointInPolygon(polygon: TopographicTerrainPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = ((pi.y > y) !== (pj.y > y))
      && (x < ((pj.x - pi.x) * (y - pi.y)) / ((pj.y - pi.y) || Number.EPSILON) + pi.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): boolean {
  const d1 = cross(x1, y1, x2, y2, x3, y3);
  const d2 = cross(x1, y1, x2, y2, x4, y4);
  const d3 = cross(x3, y3, x4, y4, x1, y1);
  const d4 = cross(x3, y3, x4, y4, x2, y2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return (Math.abs(d1) <= 1e-6 && isPointOnSegment(x1, y1, x2, y2, x3, y3))
    || (Math.abs(d2) <= 1e-6 && isPointOnSegment(x1, y1, x2, y2, x4, y4))
    || (Math.abs(d3) <= 1e-6 && isPointOnSegment(x3, y3, x4, y4, x1, y1))
    || (Math.abs(d4) <= 1e-6 && isPointOnSegment(x3, y3, x4, y4, x2, y2));
}

function isPointOnSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  py: number,
): boolean {
  const minX = Math.min(x1, x2) - 1e-6;
  const maxX = Math.max(x1, x2) + 1e-6;
  const minY = Math.min(y1, y2) - 1e-6;
  const maxY = Math.max(y1, y2) + 1e-6;
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function cross(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/**
 * Returns the parametric `t ∈ [0, 1]` at which segment `(p1→p2)` crosses
 * segment `(p3→p4)`, or `null` if they do not cross within both extents.
 */
function segmentIntersectT(
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  x4: number, y4: number,
): number | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

/**
 * Returns the squared distance from point `(px, py)` to the nearest point on
 * segment `(ax, ay)→(bx, by)`.
 */
function pointToSegmentDistSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  return nearestPointOnSegment(px, py, ax, ay, bx, by).distSq;
}

/**
 * Returns the nearest point on segment (ax,ay)→(bx,by) to point (px,py),
 * together with the squared distance.
 */
function nearestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { x: number; y: number; distSq: number } {
  const abx = bx - ax, aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) {
    const dx = px - ax, dy = py - ay;
    return { x: ax, y: ay, distSq: dx * dx + dy * dy };
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const nx = ax + t * abx, ny = ay + t * aby;
  const dx = px - nx, dy = py - ny;
  return { x: nx, y: ny, distSq: dx * dx + dy * dy };
}

/**
 * Returns the solid boundary polygons for the current terrain plus the
 * "inverse-scaling centre" to use when going from world space to unscaled space.
 */
function _getSolidPolygonsAndCenter(state: TopographicTerrainState): {
  polygons: TopographicTerrainPoint[][];
  invCx: number;
  invCy: number;
} {
  if (state.mergedContours && state.mergedContours.solidBoundaries.length > 0) {
    const mc = state.mergedContours;
    return {
      polygons: mc.solidBoundaries,
      invCx: mc.centroidX,
      invCy: mc.centroidY,
    };
  }
  // Per-island fallback: can only handle one polygon at a time.
  // We'll return all island polygons and use an approximate shared centroid.
  let cx = 0, cy = 0, n = 0;
  for (const island of state.islands) { cx += island.centerX; cy += island.centerY; n++; }
  if (n > 0) { cx /= n; cy /= n; }
  return {
    polygons: state.islands.map(i => i.solidOuterPolygon),
    invCx: cx,
    invCy: cy,
  };
}

// ── Seafloor capsule collision helpers ────────────────────────────────────────

/**
 * Returns true if point (px, py) is inside the capsule defined by segment
 * (ax,ay)→(bx,by) with the given radius.
 */
function _pointInCapsule(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  radius: number,
): boolean {
  const r2 = radius * radius;
  return pointToSegmentDistSq(px, py, ax, ay, bx, by) <= r2;
}

/**
 * Returns true if segment (p1x,p1y)→(p2x,p2y) intersects capsule
 * (ax,ay)→(bx,by) with given radius.
 */
function _segmentIntersectsCapsule(
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  ax: number, ay: number,
  bx: number, by: number,
  radius: number,
): boolean {
  const r2 = radius * radius;
  if (pointToSegmentDistSq(p1x, p1y, ax, ay, bx, by) <= r2) return true;
  if (pointToSegmentDistSq(p2x, p2y, ax, ay, bx, by) <= r2) return true;
  if (pointToSegmentDistSq(ax, ay, p1x, p1y, p2x, p2y) <= r2) return true;
  if (pointToSegmentDistSq(bx, by, p1x, p1y, p2x, p2y) <= r2) return true;
  if (segmentsIntersect(p1x, p1y, p2x, p2y, ax, ay, bx, by)) return true;
  return false;
}

// ── Public collision API ─────────────────────────────────────────────────────

/**
 * Returns true when `(x, y)` is inside any terrain island at its current
 * effective scale (phase-aware: uses `growth01` scaling).
 *
 * When mergedContours are available the test uses the merged outer boundaries
 * (scaled around the merged centroid); otherwise falls back to per-island
 * solid outer polygons.
 */
export function isPointInsideTopographicTerrain(
  state: TopographicTerrainState,
  x: number,
  y: number,
): boolean {
  if (state.phase === 'hidden') return false;
  const g = state.growth01;
  if (g <= 0) return false;

  // Recursive-square branch: corners are in world space, no centroid scaling.
  if (state.terrainKind === 'recursiveSquares') {
    for (const polygon of _getActiveSquarePolygons(state)) {
      if (isPointInPolygon(polygon, x, y)) return true;
    }
    return false;
  }

  if (state.terrainKind === 'basalt') {
    for (const polygon of _getActiveBasaltPolygons(state)) {
      if (isPointInPolygon(polygon, x, y)) return true;
    }
    return false;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return false;
    for (const seg of state.seafloor.allCollisionSegments) {
      if (_pointInCapsule(x, y, seg.x1, seg.y1, seg.x2, seg.y2, seg.radius)) return true;
    }
    return false;
  }

  if (state.mergedContours && state.mergedContours.solidBoundaries.length > 0) {
    const { centroidX: mcx, centroidY: mcy, solidBoundaries } = state.mergedContours;
    const xs = mcx + (x - mcx) / g;
    const ys = mcy + (y - mcy) / g;
    for (const boundary of solidBoundaries) {
      if (boundary.length >= 3 && isPointInPolygon(boundary, xs, ys)) return true;
    }
    return false;
  }

  // Legacy fallback: per-island polygons.
  for (const island of state.islands) {
    const xs = island.centerX + (x - island.centerX) / g;
    const ys = island.centerY + (y - island.centerY) / g;
    if (isPointInPolygon(island.solidOuterPolygon, xs, ys)) return true;
  }
  return false;
}

/**
 * Returns true when the segment `(x1,y1)→(x2,y2)` intersects or is contained
 * within any terrain island, accounting for the current growth scale.
 */
export function segmentIntersectsTopographicTerrain(
  state: TopographicTerrainState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  if (state.phase === 'hidden') return false;
  const g = state.growth01;
  if (g <= 0) return false;

  // Recursive-square branch: corners are in world space, no inverse-scaling needed.
  if (state.terrainKind === 'recursiveSquares') {
    for (const polygon of _getActiveSquarePolygons(state)) {
      if (polygon.length < 3) continue;
      if (isPointInPolygon(polygon, x1, y1) || isPointInPolygon(polygon, x2, y2)) return true;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (segmentsIntersect(x1, y1, x2, y2, a.x, a.y, b.x, b.y)) return true;
      }
    }
    return false;
  }

  if (state.terrainKind === 'basalt') {
    for (const polygon of _getActiveBasaltPolygons(state)) {
      if (polygon.length < 3) continue;
      if (isPointInPolygon(polygon, x1, y1) || isPointInPolygon(polygon, x2, y2)) return true;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (segmentsIntersect(x1, y1, x2, y2, a.x, a.y, b.x, b.y)) return true;
      }
    }
    return false;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return false;
    for (const seg of state.seafloor.allCollisionSegments) {
      if (_segmentIntersectsCapsule(x1, y1, x2, y2, seg.x1, seg.y1, seg.x2, seg.y2, seg.radius)) return true;
    }
    return false;
  }

  const { polygons, invCx, invCy } = _getSolidPolygonsAndCenter(state);

  // Inverse-scale both endpoints into unscaled polygon space.
  const lx1 = invCx + (x1 - invCx) / g, ly1 = invCy + (y1 - invCy) / g;
  const lx2 = invCx + (x2 - invCx) / g, ly2 = invCy + (y2 - invCy) / g;

  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    if (isPointInPolygon(polygon, lx1, ly1) || isPointInPolygon(polygon, lx2, ly2)) return true;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (segmentsIntersect(lx1, ly1, lx2, ly2, a.x, a.y, b.x, b.y)) return true;
    }
  }
  return false;
}

/**
 * Returns true when a circle of `radiusPx` centred at `(x, y)` overlaps any
 * terrain island at its current growth scale.  Uses a fast outer-radius
 * pre-reject, then checks:
 *   1. Circle centre inside the scaled polygon.
 *   2. Any polygon edge within `radiusPx` of the centre (handles the case
 *      where the centre is outside but the edge grazes the circle).
 *
 * Phase-aware: the polygon is inverse-scaled so the test is performed in
 * unscaled space, with the radius correspondingly scaled by `1/g`.
 */
export function circleIntersectsTopographicTerrain(
  state: TopographicTerrainState,
  x: number,
  y: number,
  radiusPx: number,
): boolean {
  if (state.phase === 'hidden') return false;
  const g = state.growth01;
  if (g <= 0) return false;

  // Recursive-square branch: corners are in world space, bounding-circle pre-reject.
  if (state.terrainKind === 'recursiveSquares') {
    for (const node of state.squareNodes) {
      const alpha = getSquareNodeGrowthAlpha01(node.depth, state.squareMaxDepth, g);
      if (alpha <= 0.1) continue;
      // Fast bounding-circle pre-reject.
      const bdx = x - node.cx, bdy = y - node.cy;
      const outerR = node.boundingRadius + radiusPx;
      if (bdx * bdx + bdy * bdy > outerR * outerR) continue;
      const polygon = node.corners;
      if (isPointInPolygon(polygon, x, y)) return true;
      const r2 = radiusPx * radiusPx;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (pointToSegmentDistSq(x, y, a.x, a.y, b.x, b.y) <= r2) return true;
      }
    }
    return false;
  }

  if (state.terrainKind === 'basalt') {
    if (!state.basalt) return false;
    for (const cell of state.basalt.cells) {
      const alpha = getBasaltCellAlpha(cell, g);
      if (alpha <= 0.1) continue;
      const bdx = x - cell.cx, bdy = y - cell.cy;
      const outerR = cell.radius + radiusPx;
      if (bdx * bdx + bdy * bdy > outerR * outerR) continue;
      const polygon = cell.corners;
      if (isPointInPolygon(polygon, x, y)) return true;
      const r2b = radiusPx * radiusPx;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (pointToSegmentDistSq(x, y, a.x, a.y, b.x, b.y) <= r2b) return true;
      }
    }
    return false;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return false;
    for (const seg of state.seafloor.allCollisionSegments) {
      const combinedR = seg.radius + radiusPx;
      if (pointToSegmentDistSq(x, y, seg.x1, seg.y1, seg.x2, seg.y2) <= combinedR * combinedR) return true;
    }
    return false;
  }

  for (const island of state.islands) {
    const dx = x - island.centerX, dy = y - island.centerY;
    const distSq = dx * dx + dy * dy;
    const outerR = island.outerRadius * g + radiusPx;
    if (distSq > outerR * outerR) continue; // fast outer-radius reject

    const polygon = island.solidOuterPolygon;
    if (polygon.length < 3) continue;

    // Inverse-scale the query point into unscaled polygon space.
    const xs = island.centerX + (x - island.centerX) / g;
    const ys = island.centerY + (y - island.centerY) / g;

    // Case 1: circle centre is inside the scaled polygon.
    if (isPointInPolygon(polygon, xs, ys)) return true;

    // Case 2: any polygon edge is within radiusPx of the circle centre.
    // In inverse-scaled space the equivalent radius is radiusPx / g.
    const invR2 = (radiusPx / g) * (radiusPx / g);
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (pointToSegmentDistSq(xs, ys, a.x, a.y, b.x, b.y) <= invR2) return true;
    }
  }
  return false;
}

/**
 * Returns `true` when the straight line from `(fromX, fromY)` to `(toX, toY)`
 * is not blocked by any terrain island.  Returns `true` when terrain is null
 * or inactive.
 *
 * Convenience wrapper around segmentIntersectsTopographicTerrain for use in
 * weapon systems and targeting code.
 */
export function hasTopographicTerrainLineOfSight(
  terrain: TopographicTerrainState | null,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  if (!terrain) return true;
  return !segmentIntersectsTopographicTerrain(terrain, fromX, fromY, toX, toY);
}

/**
 * Finds the earliest parametric distance `t ∈ [0, 1]` at which the ray from
 * `(ox, oy)` in direction `(dx, dy)` with length `maxT` first intersects any
 * terrain island boundary.  Returns a value in `[0, 1]` (fraction of `maxT`)
 * when an intersection is found, or `1` if the ray is unobstructed.
 *
 * Useful for truncating projectile paths and laser beams at terrain surfaces.
 */
export function terrainFirstIntersectionT(
  state: TopographicTerrainState,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxT: number,
): number {
  if (state.phase === 'hidden' || maxT <= 0) return 1;
  const g = state.growth01;
  if (g <= 0) return 1;

  // Recursive-square branch: corners are already in world space.
  if (state.terrainKind === 'recursiveSquares') {
    const ex = ox + dx * maxT, ey = oy + dy * maxT;
    let bestFraction = 1;
    for (const polygon of _getActiveSquarePolygons(state)) {
      if (polygon.length < 3) continue;
      if (isPointInPolygon(polygon, ox, oy)) return 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const t = segmentIntersectT(ox, oy, ex, ey, a.x, a.y, b.x, b.y);
        if (t !== null && t < bestFraction) bestFraction = t;
      }
    }
    return bestFraction;
  }

  if (state.terrainKind === 'basalt') {
    const ex = ox + dx * maxT, ey = oy + dy * maxT;
    let bestFraction = 1;
    for (const polygon of _getActiveBasaltPolygons(state)) {
      if (polygon.length < 3) continue;
      if (isPointInPolygon(polygon, ox, oy)) return 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const t = segmentIntersectT(ox, oy, ex, ey, a.x, a.y, b.x, b.y);
        if (t !== null && t < bestFraction) bestFraction = t;
      }
    }
    return bestFraction;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return 1;
    // Check if origin is already inside a capsule.
    for (const seg of state.seafloor.allCollisionSegments) {
      if (_pointInCapsule(ox, oy, seg.x1, seg.y1, seg.x2, seg.y2, seg.radius)) return 0;
    }
    // Step along the ray to find the first capsule entry.
    const STEP_PX = 5;
    const steps = Math.ceil(maxT / STEP_PX);
    let bestFraction = 1;
    for (let si = 1; si <= steps; si++) {
      const t = Math.min(si / steps, 1);
      const px = ox + dx * maxT * t;
      const py = oy + dy * maxT * t;
      for (const seg of state.seafloor.allCollisionSegments) {
        if (_pointInCapsule(px, py, seg.x1, seg.y1, seg.x2, seg.y2, seg.radius)) {
          if (t < bestFraction) bestFraction = t;
          break;
        }
      }
    }
    return bestFraction;
  }

  const { polygons, invCx, invCy } = _getSolidPolygonsAndCenter(state);
  const ex = ox + dx * maxT, ey = oy + dy * maxT;
  const lox = invCx + (ox - invCx) / g, loy = invCy + (oy - invCy) / g;
  const lex = invCx + (ex - invCx) / g, ley = invCy + (ey - invCy) / g;

  let bestFraction = 1;
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    if (isPointInPolygon(polygon, lox, loy)) return 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const t = segmentIntersectT(lox, loy, lex, ley, a.x, a.y, b.x, b.y);
      if (t !== null && t < bestFraction) bestFraction = t;
    }
  }
  return bestFraction;
}

export function getTopographicTerrainSolidPolygons(state: TopographicTerrainState): TopographicTerrainPoint[][] {
  if (state.phase === 'hidden') return [];
  // Recursive-square variant: return active square corner polygons.
  if (state.terrainKind === 'recursiveSquares') {
    return _getActiveSquarePolygons(state);
  }
  if (state.terrainKind === 'basalt') {
    return _getActiveBasaltPolygons(state);
  }
  if (state.mergedContours && state.mergedContours.solidBoundaries.length > 0) {
    return state.mergedContours.solidBoundaries;
  }
  return state.islands.map(island => island.solidOuterPolygon);
}

/**
 * Returns the nearest point on any solid terrain boundary polygon to the given
 * point (in world coordinates, accounting for growth01 scaling).
 *
 * @param state     Terrain state
 * @param x         Query x (world)
 * @param y         Query y (world)
 * @param outNearest  Written with the nearest boundary point (world coords)
 * @returns         Signed distance: negative = point is INSIDE terrain,
 *                  positive = outside.  Returns +Infinity if no terrain.
 */
export function signedDistanceToTerrainBoundary(
  state: TopographicTerrainState,
  x: number,
  y: number,
  outNearest: { x: number; y: number } | null,
): number {
  if (state.phase === 'hidden') return Infinity;
  const g = state.growth01;
  if (g <= 0) return Infinity;

  // Recursive-square branch: corners are in world space, no inverse-scaling.
  if (state.terrainKind === 'recursiveSquares') {
    const polygons = _getActiveSquarePolygons(state);
    if (polygons.length === 0) return Infinity;
    let bestDistSq = Infinity;
    let bestNx = x, bestNy = y;
    let bestInsideAny = false;
    for (const polygon of polygons) {
      if (polygon.length < 3) continue;
      const inside = isPointInPolygon(polygon, x, y);
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestNx = nx; bestNy = ny;
          bestInsideAny = inside;
        }
      }
    }
    if (bestDistSq === Infinity) return Infinity;
    if (outNearest) { outNearest.x = bestNx; outNearest.y = bestNy; }
    const distWorld = Math.sqrt(bestDistSq);
    return bestInsideAny ? -distWorld : distWorld;
  }

  if (state.terrainKind === 'basalt') {
    if (!state.basalt) return Infinity;
    let bestDistSq = Infinity;
    let bestNx = x, bestNy = y;
    let bestInsideAny = false;
    for (const cell of state.basalt.cells) {
      if (getBasaltCellAlpha(cell, g) <= 0.1) continue;
      const polygon = cell.corners;
      if (polygon.length < 3) continue;
      const inside = isPointInPolygon(polygon, x, y);
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestNx = nx;
          bestNy = ny;
          bestInsideAny = inside;
        }
      }
    }
    if (bestDistSq === Infinity) return Infinity;
    if (outNearest) { outNearest.x = bestNx; outNearest.y = bestNy; }
    const distWorld = Math.sqrt(bestDistSq);
    return bestInsideAny ? -distWorld : distWorld;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return Infinity;
    // For capsule terrain: signed distance = dist_to_capsule_axis - radius.
    // Negative means inside (blocked).
    let bestSigned = Infinity;
    let bestNx = x, bestNy = y;
    for (const seg of state.seafloor.allCollisionSegments) {
      const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
      const distToAxis = Math.sqrt(distSq);
      const signed = distToAxis - seg.radius;
      if (signed < bestSigned) {
        bestSigned = signed;
        // Nearest point on capsule surface: push from axis toward (x,y) by radius.
        if (distToAxis > 1e-6) {
          const frac = seg.radius / distToAxis;
          bestNx = nx + (x - nx) * frac;
          bestNy = ny + (y - ny) * frac;
        } else {
          bestNx = nx; bestNy = ny;
        }
      }
    }
    if (bestSigned === Infinity) return Infinity;
    if (outNearest) { outNearest.x = bestNx; outNearest.y = bestNy; }
    return bestSigned;
  }

  const { polygons, invCx, invCy } = _getSolidPolygonsAndCenter(state);
  if (polygons.length === 0) return Infinity;

  // Work in unscaled space.
  const xs = invCx + (x - invCx) / g;
  const ys = invCy + (y - invCy) / g;

  let bestDistSq = Infinity;
  let bestNx = xs, bestNy = ys;
  let bestInsideAny = false;

  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    const inside = isPointInPolygon(polygon, xs, ys);

    // Find nearest edge point.
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const { x: nx, y: ny, distSq } = nearestPointOnSegment(xs, ys, a.x, a.y, b.x, b.y);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestNx = nx;
        bestNy = ny;
        bestInsideAny = inside;
      }
    }
  }

  if (bestDistSq === Infinity) return Infinity;

  // Convert nearest-boundary point back to world space.
  if (outNearest) {
    outNearest.x = invCx + (bestNx - invCx) * g;
    outNearest.y = invCy + (bestNy - invCy) * g;
  }

  const distWorld = Math.sqrt(bestDistSq) * g;
  return bestInsideAny ? -distWorld : distWorld;
}

/**
 * If `(x, y)` is inside terrain, finds the nearest boundary point and pushes
 * the point just outside it (by `marginPx`).
 *
 * Uses nearest-point-on-polygon logic so the push destination lies on the
 * actual solid boundary, even for concave or elongated island shapes.
 *
 * @param marginPx  Extra clearance beyond the boundary (px)
 * @returns true if a push occurred, false if already outside.
 */
export function pushPointOutsideTopographicTerrain(
  state: TopographicTerrainState,
  x: number,
  y: number,
  outPos: { x: number; y: number },
  marginPx: number,
): boolean {
  if (state.phase === 'hidden') { outPos.x = x; outPos.y = y; return false; }
  const g = state.growth01;
  if (g <= 0) { outPos.x = x; outPos.y = y; return false; }

  // Recursive-square branch: corners are in world space.
  if (state.terrainKind === 'recursiveSquares') {
    for (const polygon of _getActiveSquarePolygons(state)) {
      if (polygon.length < 3) continue;
      if (!isPointInPolygon(polygon, x, y)) continue;
      let bestDistSq = Infinity;
      let bestNx = x, bestNy = y;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
        if (distSq < bestDistSq) { bestDistSq = distSq; bestNx = nx; bestNy = ny; }
      }
      const bdx = bestNx - x, bdy = bestNy - y;
      const bdLen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
      outPos.x = bestNx + (bdx / bdLen) * marginPx;
      outPos.y = bestNy + (bdy / bdLen) * marginPx;
      return true;
    }
    outPos.x = x; outPos.y = y;
    return false;
  }

  if (state.terrainKind === 'basalt') {
    if (!state.basalt) { outPos.x = x; outPos.y = y; return false; }
    for (const cell of state.basalt.cells) {
      if (getBasaltCellAlpha(cell, g) <= 0.1) continue;
      const polygon = cell.corners;
      if (polygon.length < 3) continue;
      if (!isPointInPolygon(polygon, x, y)) continue;
      let bestDistSq = Infinity;
      let bestNx = x, bestNy = y;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
        if (distSq < bestDistSq) { bestDistSq = distSq; bestNx = nx; bestNy = ny; }
      }
      const bdx = bestNx - x, bdy = bestNy - y;
      const bdLen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
      outPos.x = bestNx + (bdx / bdLen) * marginPx;
      outPos.y = bestNy + (bdy / bdLen) * marginPx;
      return true;
    }
    outPos.x = x; outPos.y = y;
    return false;
  }

  const { polygons, invCx, invCy } = _getSolidPolygonsAndCenter(state);

  // Work in unscaled (precomputed polygon) space.
  const xs = invCx + (x - invCx) / g;
  const ys = invCy + (y - invCy) / g;

  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    if (!isPointInPolygon(polygon, xs, ys)) continue;

    // Find nearest point on the polygon boundary.
    let bestDistSq = Infinity;
    let bestNx = xs, bestNy = ys;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const { x: nx, y: ny, distSq } = nearestPointOnSegment(xs, ys, a.x, a.y, b.x, b.y);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestNx = nx;
        bestNy = ny;
      }
    }

    // Push direction: from query point toward the boundary (outward).
    // The boundary point (bestNx, bestNy) is on the polygon; moving toward it
    // (and slightly past) puts the point just outside.
    const marginUnscaled = marginPx / g;
    const bdx = bestNx - xs;
    const bdy = bestNy - ys;
    const bdLen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
    const destXU = bestNx + (bdx / bdLen) * marginUnscaled;
    const destYU = bestNy + (bdy / bdLen) * marginUnscaled;

    // Convert back to world space.
    outPos.x = invCx + (destXU - invCx) * g;
    outPos.y = invCy + (destYU - invCy) * g;
    return true;
  }

  outPos.x = x; outPos.y = y;
  return false;
}

/**
 * Computes a soft repulsion force for an entity at (x, y) near terrain.
 *
 * If the entity is OUTSIDE terrain, returns zero force.
 * If the entity is INSIDE terrain (penetrating), returns a force directed
 * outward from the boundary whose magnitude scales quadratically with
 * penetration depth (`depthPx`²).
 *
 * This is designed to be applied to velocity *before* the hard push-out
 * fail-safe, giving collision a smooth "invisible barrier" feel.
 *
 * @param state       Terrain state.
 * @param x, y        Entity world position.
 * @param strength    Scaling factor for the repulsion force (px/frame).
 * @param outForce    Written with (fx, fy) repulsion force.
 * @returns           Penetration depth in px (0 if outside).
 */
export function computeTerrainRepulsionForce(
  state: TopographicTerrainState,
  x: number,
  y: number,
  strength: number,
  outForce: { x: number; y: number },
): number {
  outForce.x = 0; outForce.y = 0;
  if (state.phase === 'hidden') return 0;
  const g = state.growth01;
  if (g <= 0) return 0;

  const nearest = _repulsionScratch;
  const signedDist = signedDistanceToTerrainBoundary(state, x, y, nearest);

  if (signedDist >= 0) return 0; // outside — no force

  const depth = -signedDist; // positive
  const force = strength * depth * depth; // quadratic rise

  // Direction from entity to nearest boundary point = outward.
  const dx = nearest.x - x;
  const dy = nearest.y - y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  outForce.x = (dx / len) * force;
  outForce.y = (dy / len) * force;

  return depth;
}

// Scratch object to avoid allocations in hot paths.
const _repulsionScratch = { x: 0, y: 0 };
