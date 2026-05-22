export type TopographicTerrainPaletteId = 'mono' | 'copper' | 'cyanTactical';

export interface TopographicTerrainPoint { x: number; y: number; }

export interface TopographicTerrainRing {
  points: TopographicTerrainPoint[];
  lineWidth: number;
  alpha: number;
  color: string;
  ringIndex: number;
}

export interface TopographicTerrainIsland {
  id: string;
  centerX: number;
  centerY: number;
  outerRadius: number;
  rings: TopographicTerrainRing[];
  solidOuterPolygon: TopographicTerrainPoint[];
}

export interface TopographicTerrainState {
  waveNumber: number;
  seed: number;
  paletteId: TopographicTerrainPaletteId;
  islands: TopographicTerrainIsland[];
  phase: 'hidden' | 'growing' | 'stable' | 'shrinking';
  phaseStartedAtMs: number;
  growDurationMs: number;
  shrinkDurationMs: number;
  growth01: number;
}

const TERRAIN_GROW_DURATION_MS = 1300;
const TERRAIN_SHRINK_DURATION_MS = 500;
const MIN_ISLANDS = 2;
const MAX_ISLANDS = 5;
const MIN_RINGS = 3;
const MAX_RINGS = 7;
const RING_POINTS = 64;
const TERRAIN_EDGE_MARGIN = 40;
const PLAYER_EXCLUSION_RADIUS = 60;
const INNER_RING_CENTER_JITTER_PX = 5;
const MAX_ISLAND_PLACEMENT_ATTEMPTS = 15;
const DEV_TEXT_LINE_HEIGHT_PX = 12;

const PALETTE_SEQUENCE: TopographicTerrainPaletteId[] = ['mono', 'copper', 'cyanTactical'];

const PALETTES: Record<TopographicTerrainPaletteId, { lines: string[]; glow: string | null }> = {
  mono: { lines: ['#dddddd', '#aaaaaa', '#888888', '#555555'], glow: null },
  copper: { lines: ['#c87941', '#d4935e', '#e8b87a', '#f5d098', '#aa6030'], glow: '#c87941' },
  cyanTactical: { lines: ['#22ddff', '#44aacc', '#1199bb', '#00ccee', '#88eeff'], glow: '#22ddff' },
};

let terrainDevMode = false;

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTopographicTerrain(
  waveNumber: number,
  seed: number,
  canvasW: number,
  canvasH: number,
): TopographicTerrainState {
  const rng = createSeededRng(seed);
  const paletteId = PALETTE_SEQUENCE[Math.abs(waveNumber) % PALETTE_SEQUENCE.length];
  const palette = PALETTES[paletteId];
  const islands: TopographicTerrainIsland[] = [];
  const targetIslandCount = randomIntInclusive(rng, MIN_ISLANDS, MAX_ISLANDS);
  const centerX = canvasW * 0.5;
  const centerY = canvasH * 0.5;

  for (let islandIndex = 0; islandIndex < targetIslandCount; islandIndex++) {
    const outerRadius = randomRange(rng, 25, 55);
    let islandCenterX = 0;
    let islandCenterY = 0;
    let placed = false;

    for (let attempt = 0; attempt < MAX_ISLAND_PLACEMENT_ATTEMPTS; attempt++) {
      const minX = TERRAIN_EDGE_MARGIN + outerRadius;
      const maxX = canvasW - TERRAIN_EDGE_MARGIN - outerRadius;
      const minY = TERRAIN_EDGE_MARGIN + outerRadius;
      const maxY = canvasH - TERRAIN_EDGE_MARGIN - outerRadius;
      if (maxX <= minX || maxY <= minY) break;

      const candidateX = randomRange(rng, minX, maxX);
      const candidateY = randomRange(rng, minY, maxY);
      if (distanceSq(candidateX, candidateY, centerX, centerY) < PLAYER_EXCLUSION_RADIUS * PLAYER_EXCLUSION_RADIUS) {
        continue;
      }

      let overlapsExisting = false;
      for (const existing of islands) {
        const minSeparation = Math.max(existing.outerRadius, outerRadius) * 1.2;
        if (distanceSq(candidateX, candidateY, existing.centerX, existing.centerY) < minSeparation * minSeparation) {
          overlapsExisting = true;
          break;
        }
      }
      if (overlapsExisting) continue;

      islandCenterX = candidateX;
      islandCenterY = candidateY;
      placed = true;
      break;
    }

    if (!placed) continue;

    const ringCount = randomIntInclusive(rng, MIN_RINGS, MAX_RINGS);
    const rings: TopographicTerrainRing[] = [];
    let solidOuterPolygon: TopographicTerrainPoint[] = [];
    const colorOffset = randomIntInclusive(rng, 0, palette.lines.length - 1);

    for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
      const ringScale = ringCount <= 1 ? 1 : lerp(0.32, 1, ringIndex / (ringCount - 1));
      const baseRadius = outerRadius * ringScale;
      const centerOffsetX = ringIndex < ringCount - 1 ? randomRange(rng, -INNER_RING_CENTER_JITTER_PX, INNER_RING_CENTER_JITTER_PX) : 0;
      const centerOffsetY = ringIndex < ringCount - 1 ? randomRange(rng, -INNER_RING_CENTER_JITTER_PX, INNER_RING_CENTER_JITTER_PX) : 0;
      const freq1 = randomIntInclusive(rng, 2, 6);
      const freq2 = randomIntInclusive(rng, 2, 6);
      const freq3 = randomIntInclusive(rng, 2, 6);
      const phase1 = randomRange(rng, 0, Math.PI * 2);
      const phase2 = randomRange(rng, 0, Math.PI * 2);
      const phase3 = randomRange(rng, 0, Math.PI * 2);
      const points: TopographicTerrainPoint[] = [];

      for (let pointIndex = 0; pointIndex < RING_POINTS; pointIndex++) {
        const theta = (pointIndex / RING_POINTS) * Math.PI * 2;
        const modulation = 1
          + 0.2 * Math.sin(freq1 * theta + phase1)
          + 0.12 * Math.cos(freq2 * theta + phase2)
          + 0.08 * Math.sin(freq3 * theta + phase3);
        const radius = baseRadius * Math.max(0.18, modulation);
        points.push({
          x: islandCenterX + centerOffsetX + Math.cos(theta) * radius,
          y: islandCenterY + centerOffsetY + Math.sin(theta) * radius,
        });
      }

      const isOutermostRing = ringIndex === ringCount - 1;
      const lineWidth = isOutermostRing ? 1.5 : randomRange(rng, 0.8, 1.2);
      const alpha = randomRange(rng, 0.5, 0.9);
      const color = palette.lines[(ringIndex + colorOffset) % palette.lines.length];
      const ring: TopographicTerrainRing = { points, lineWidth, alpha, color, ringIndex };
      rings.push(ring);
      if (isOutermostRing) solidOuterPolygon = points;
    }

    islands.push({
      id: `wave-${waveNumber}-island-${islandIndex}`,
      centerX: islandCenterX,
      centerY: islandCenterY,
      outerRadius,
      rings,
      solidOuterPolygon,
    });
  }

  return {
    waveNumber,
    seed,
    paletteId,
    islands,
    phase: 'growing',
    phaseStartedAtMs: 0,
    growDurationMs: TERRAIN_GROW_DURATION_MS,
    shrinkDurationMs: TERRAIN_SHRINK_DURATION_MS,
    growth01: 0,
  };
}

export function beginWaveTerrain(
  waveNumber: number,
  canvasW: number,
  canvasH: number,
  nowMs: number,
): TopographicTerrainState {
  const seed = (((waveNumber + 1) * 0x9e3779b1) ^ ((canvasW & 0xffff) << 8) ^ (canvasH & 0xffff)) >>> 0;
  const state = generateTopographicTerrain(waveNumber, seed, canvasW, canvasH);
  state.phaseStartedAtMs = nowMs;
  state.phase = 'growing';
  state.growth01 = 0;
  return state;
}

export function updateTopographicTerrain(state: TopographicTerrainState, nowMs: number): void {
  if (state.phase === 'hidden' || state.phase === 'stable') return;

  if (state.phase === 'growing') {
    const elapsedMs = nowMs - state.phaseStartedAtMs;
    const t = clamp(elapsedMs / Math.max(1, state.growDurationMs), 0, 1);
    state.growth01 = easeOutCubic(t);
    if (t >= 1) {
      state.phase = 'stable';
      state.growth01 = 1;
    }
    return;
  }

  if (state.phase === 'shrinking') {
    const elapsedMs = nowMs - state.phaseStartedAtMs;
    const t = clamp(elapsedMs / Math.max(1, state.shrinkDurationMs), 0, 1);
    state.growth01 = 1 - easeInCubic(t);
    if (t >= 1) {
      state.phase = 'hidden';
      state.growth01 = 0;
    }
  }
}

export function beginTopographicTerrainShrink(state: TopographicTerrainState, nowMs: number): void {
  if (state.phase === 'stable' || state.phase === 'growing') {
    state.phase = 'shrinking';
    state.phaseStartedAtMs = nowMs;
  }
}

export function isTopographicTerrainReadyForEnemySpawns(state: TopographicTerrainState): boolean {
  return state.phase === 'stable' || state.phase === 'hidden';
}

export function isTopographicTerrainGone(state: TopographicTerrainState): boolean {
  return state.phase === 'hidden';
}

export function renderTopographicTerrain(
  ctx: CanvasRenderingContext2D,
  state: TopographicTerrainState,
  nowMs: number,
): void {
  if (state.phase === 'hidden') return;

  void nowMs;
  ctx.save();
  try {
    const palette = PALETTES[state.paletteId];
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    for (const island of state.islands) {
      const totalRings = island.rings.length;
      if (totalRings <= 0) continue;

      const outerRing = island.rings[totalRings - 1];
      const outerRingGrowth01 = getRingGrowth01(state.growth01, totalRings, outerRing.ringIndex);
      if (outerRingGrowth01 > 0) {
        const animatedOuterPolygon = animatePoints(
          outerRing.points,
          island.centerX,
          island.centerY,
          outerRingGrowth01,
        );
        drawClosedPolygon(ctx, animatedOuterPolygon);
        ctx.globalAlpha = outerRingGrowth01;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();
      }

      for (const ring of island.rings) {
        const ringGrowth01 = getRingGrowth01(state.growth01, totalRings, ring.ringIndex);
        if (ringGrowth01 <= 0) continue;

        const animatedPoints = animatePoints(ring.points, island.centerX, island.centerY, ringGrowth01);
        drawClosedPolygon(ctx, animatedPoints);

        if (palette.glow !== null) {
          ctx.globalAlpha = 0.12 * ringGrowth01;
          ctx.lineWidth = ring.lineWidth * 3;
          ctx.strokeStyle = palette.glow;
          ctx.stroke();
        }

        drawClosedPolygon(ctx, animatedPoints);
        ctx.globalAlpha = ring.alpha * ringGrowth01;
        ctx.lineWidth = ring.lineWidth;
        ctx.strokeStyle = ring.color;
        ctx.stroke();
      }
    }

    if (terrainDevMode) {
      drawTerrainDevOverlay(ctx, state);
    }
  } finally {
    ctx.restore();
  }
}

export function setTopographicTerrainDevMode(enabled: boolean): void {
  terrainDevMode = enabled;
}

/**
 * Returns true when `(x, y)` is inside any terrain island at its current
 * effective scale (phase-aware: uses `growth01` scaling around each island
 * centre, matching the visible terrain boundary).
 */
export function isPointInsideTopographicTerrain(
  state: TopographicTerrainState,
  x: number,
  y: number,
): boolean {
  if (state.phase === 'hidden') return false;
  const g = state.growth01;
  if (g <= 0) return false;
  for (const island of state.islands) {
    // Inverse-scale the query point into unscaled polygon space.
    const xs = island.centerX + (x - island.centerX) / g;
    const ys = island.centerY + (y - island.centerY) / g;
    if (isPointInPolygon(island.solidOuterPolygon, xs, ys)) return true;
  }
  return false;
}

/**
 * Returns true when the segment `(x1,y1)→(x2,y2)` intersects or is contained
 * within any terrain island, accounting for the current growth scale.
 *
 * Phase-aware: both segment endpoints are inverse-scaled into each island's
 * unscaled polygon space before the polygon test, so the collision boundary
 * matches the visible animated terrain.
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
  for (const island of state.islands) {
    const { centerX: cx, centerY: cy } = island;
    // Inverse-scale both endpoints into island-local (unscaled) space.
    const lx1 = cx + (x1 - cx) / g, ly1 = cy + (y1 - cy) / g;
    const lx2 = cx + (x2 - cx) / g, ly2 = cy + (y2 - cy) / g;
    const polygon = island.solidOuterPolygon;
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
 * Returns the squared distance from point `(px, py)` to the nearest point on
 * segment `(ax, ay)→(bx, by)`.  Used by circleIntersectsTopographicTerrain.
 */
function pointToSegmentDistSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  const abx = bx - ax, aby = by - ay;
  const abLenSq = abx * abx + aby * aby;
  if (abLenSq < 1e-12) {
    const dx = px - ax, dy = py - ay;
    return dx * dx + dy * dy;
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / abLenSq));
  const cx = ax + t * abx, cy = ay + t * aby;
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy;
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
  const ex = ox + dx * maxT, ey = oy + dy * maxT;
  let bestFraction = 1;
  for (const island of state.islands) {
    const { centerX: cx, centerY: cy } = island;
    const lox = cx + (ox - cx) / g, loy = cy + (oy - cy) / g;
    const lex = cx + (ex - cx) / g, ley = cy + (ey - cy) / g;
    const polygon = island.solidOuterPolygon;
    if (polygon.length < 3) continue;
    // If origin is already inside, clamp immediately.
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
  return state.islands.map(island => island.solidOuterPolygon);
}

/**
 * If `(x, y)` is inside any terrain island at its current growth scale, computes
 * the nearest exit point (radially away from the island centre) and writes it into
 * `outPos`.  Returns true and writes to `outPos` when a push occurred; returns
 * false and copies `(x, y)` to `outPos` when no push is needed.
 *
 * The check is phase-aware: during the `growing` animation the polygon is scaled
 * by `state.growth01` so the collision boundary matches the visible terrain.
 * This is done by inverse-transforming the query point into the unscaled polygon
 * space, which avoids allocating a temporary scaled polygon array.
 *
 * @param marginPx extra clearance beyond the island's effective outer radius (px)
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
  for (const island of state.islands) {
    // Inverse-scale the query point: check whether it lies inside the
    // scaled polygon by mapping it back into the unscaled polygon space.
    const xs = island.centerX + (x - island.centerX) / g;
    const ys = island.centerY + (y - island.centerY) / g;
    if (!isPointInPolygon(island.solidOuterPolygon, xs, ys)) continue;
    // Push radially away from the island centre to the effective outer radius.
    const dx = x - island.centerX;
    const dy = y - island.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy) || 1;
    const targetDist = island.outerRadius * g + marginPx;
    outPos.x = island.centerX + (dx / dist) * targetDist;
    outPos.y = island.centerY + (dy / dist) * targetDist;
    return true;
  }
  outPos.x = x; outPos.y = y;
  return false;
}

function drawTerrainDevOverlay(ctx: CanvasRenderingContext2D, state: TopographicTerrainState): void {
  ctx.save();
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.9;
  const lines = [
    `terrain seed=${state.seed}`,
    `palette=${state.paletteId}`,
    `islands=${state.islands.length}`,
    `phase=${state.phase} growth=${state.growth01.toFixed(2)}`,
  ];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 8, 40 + i * DEV_TEXT_LINE_HEIGHT_PX);
  }

  // Unscaled (raw geometry) polygon — red dashed
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#ff4040';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (const island of state.islands) {
    drawClosedPolygon(ctx, island.solidOuterPolygon);
    ctx.stroke();
  }

  // Scaled (effective collision) polygon — bright green solid
  const g = state.growth01;
  if (g > 0) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    for (const island of state.islands) {
      const scaledPts = island.solidOuterPolygon.map(p => ({
        x: island.centerX + (p.x - island.centerX) * g,
        y: island.centerY + (p.y - island.centerY) * g,
      }));
      drawClosedPolygon(ctx, scaledPts);
      ctx.stroke();
      // Draw island centre dot
      ctx.fillStyle = '#00ff88';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(island.centerX, island.centerY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawClosedPolygon(ctx: CanvasRenderingContext2D, points: TopographicTerrainPoint[]): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function animatePoints(
  points: TopographicTerrainPoint[],
  centerX: number,
  centerY: number,
  growth01: number,
): TopographicTerrainPoint[] {
  const animated: TopographicTerrainPoint[] = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    animated[i] = {
      x: centerX + (point.x - centerX) * growth01,
      y: centerY + (point.y - centerY) * growth01,
    };
  }
  return animated;
}

function getRingGrowth01(growth01: number, totalRings: number, ringIndex: number): number {
  return clamp(growth01 * (totalRings + 1) - ringIndex, 0, 1);
}

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

function randomRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

function randomIntInclusive(rng: () => number, min: number, max: number): number {
  return Math.floor(randomRange(rng, min, max + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}
