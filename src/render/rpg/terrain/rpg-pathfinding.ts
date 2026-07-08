/**
 * rpg-pathfinding.ts — Simple grid-based A* pathfinder for the RPG tab.
 *
 * Provides terrain-aware pathfinding for player auto-move and enemy pursuit.
 * The nav grid is built once per terrain/canvas change and reused every frame.
 *
 * Public API:
 *   buildRpgNavigationGrid(terrain, widthPx, heightPx, cellSizePx?)
 *   applyCircleSoftObstacles(navGrid, circles, costMultiplier)
 *   findRpgPath(navGrid, startX, startY, goalX, goalY)
 *   getPathSteeringDirection(path, x, y, lookaheadPx?)
 *   updateEntityPathState(pathState, x, y, targetX, targetY, nowMs, navGrid, maxRepathMs?)
 *   computePathSteeredVelocity(pathState, x, y, targetX, targetY, speed, terrain, nowMs, navGrid)
 *
 * Design notes:
 *   - Cell size defaults to 20 px — good balance of resolution vs A* cost.
 *   - 8-directional movement.  Diagonal moves are blocked when either neighbour
 *     cardinal cell is also blocked (no corner-cutting through walls).
 *   - Blocked cells: centre inside terrain OR circle of CLEARANCE_RADIUS overlaps terrain.
 *   - Soft obstacles: high-cost (but traversable) cells registered via applyCircleSoftObstacles.
 *     Enemies path around them when possible but are never permanently blocked by them.
 *   - If start/goal falls inside a blocked cell it is snapped to the nearest
 *     walkable cell within SNAP_SEARCH_RADIUS cells.
 *   - A* uses a simple binary-heap priority queue — no external dependencies.
 *   - Result waypoints are in world-space pixel coordinates at cell centres.
 *
 * Performance:
 *   - Nav grid is NOT rebuilt per frame — caller is responsible for calling
 *     buildRpgNavigationGrid when terrain or canvas dimensions change.
 *   - Path results are cached per entity via RpgPathState; caller throttles repathing.
 *   - A* is cheap for the typical grid sizes (e.g. 640×1136 / 20 = 32×57 = 1824 cells).
 */

import {
  isPointInsideTopographicTerrain,
  circleIntersectsTopographicTerrain,
  segmentIntersectsTopographicTerrain,
  type TopographicTerrainState,
} from './topographic-terrain';

// ── Constants ────────────────────────────────────────────────────────────────

/** Default cell size in world pixels. */
const DEFAULT_CELL_SIZE_PX = 20;

/**
 * Clearance radius used when determining if a cell is blocked.
 * Slightly larger than half the player/enemy collision size to keep entities
 * away from terrain edges.
 */
const CLEARANCE_RADIUS_PX = 12;

/**
 * Maximum number of cells to search when snapping a blocked start/goal cell
 * to the nearest walkable one.
 */
const SNAP_SEARCH_RADIUS = 8;

/**
 * How far ahead along the path (in world px) to look when computing the
 * steering direction.  Larger values smooth out tight corners.
 */
const DEFAULT_LOOKAHEAD_PX = 40;

/** Cost multipliers for A* movement.  Diagonal is √2 ≈ 1.414. */
const COST_CARDINAL  = 10;
const COST_DIAGONAL  = 14;

/**
 * Cost multiplier applied to cells that overlap a registered soft obstacle
 * (e.g. an Impetus asteroid).  Enemies strongly prefer to route around them,
 * but will cross if there is no other path.
 */
export const SOFT_OBSTACLE_COST = 8;

// ── Types ─────────────────────────────────────────────────────────────────────

/** A single A* waypoint in world-space pixel coordinates. */
export interface RpgWaypoint {
  wx: number;
  wy: number;
}

/**
 * Pre-computed navigation grid for one terrain/canvas configuration.
 * `blocked` is a flat Uint8Array: 1 = blocked, 0 = walkable.
 * `moveCost` is an optional per-cell cost multiplier (Uint8Array, 1 = normal).
 * Values > 1 are soft obstacles — traversable but expensive so A* avoids them.
 * Index = row * cols + col, where row increases downward.
 */
export interface RpgNavGrid {
  cols: number;
  rows: number;
  cellSizePx: number;
  blocked: Uint8Array;
  /** Per-cell movement cost multiplier. 1 = normal, >1 = costly soft obstacle. */
  moveCost: Uint8Array;
  /** Width of the arena in px (used for snapping world coords to cells). */
  widthPx: number;
  /** Height of the arena in px. */
  heightPx: number;
  /** World-space X of the grid's left edge. Defaults to 0 (safe-core origin). */
  originX: number;
  /** World-space Y of the grid's top edge. Defaults to 0 (safe-core origin). */
  originY: number;
}

/**
 * Per-entity mutable path state.  Initialise with createRpgPathState().
 * Pass the same object every frame for the entity.
 */
export interface RpgPathState {
  /** Current path, or empty if none. */
  path: RpgWaypoint[];
  /** Index into `path` for the next waypoint the entity should head toward. */
  waypointIdx: number;
  /** World-space goal that this path was computed toward. */
  pathTargetX: number;
  pathTargetY: number;
  /** Timestamp (ms) at which the path should next be recomputed. */
  nextRepathMs: number;
  /** Accumulated ms during which the entity has had near-zero movement speed (stuck detection). */
  stuckMs: number;
}

/** Creates a fresh, empty path state object. */
export function createRpgPathState(): RpgPathState {
  return {
    path: [],
    waypointIdx: 0,
    pathTargetX: 0,
    pathTargetY: 0,
    nextRepathMs: 0,
    stuckMs: 0,
  };
}

// ── Nav-grid construction ────────────────────────────────────────────────────

/**
 * Builds (or rebuilds) a navigation grid for the given terrain and arena size.
 * Call this once when terrain changes, canvas resizes, or terrain disappears.
 *
 * When `terrain` is null (no terrain active) every cell is walkable.
 *
 * `originX` / `originY` set the world-space position of the grid's top-left corner.
 * Defaults to 0/0 (safe-core origin, the historic default).
 */
export function buildRpgNavigationGrid(
  terrain: TopographicTerrainState | null,
  widthPx: number,
  heightPx: number,
  cellSizePx = DEFAULT_CELL_SIZE_PX,
  originX = 0,
  originY = 0,
): RpgNavGrid {
  const cols = Math.ceil(widthPx  / cellSizePx);
  const rows = Math.ceil(heightPx / cellSizePx);
  const blocked = new Uint8Array(cols * rows);
  const moveCost = new Uint8Array(cols * rows).fill(1);

  if (terrain && terrain.phase !== 'hidden' && terrain.growth01 > 0) {
    const half = cellSizePx * 0.5;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        const wx = originX + c * cellSizePx + half;
        const wy = originY + r * cellSizePx + half;
        // A cell is blocked if its centre is inside terrain OR if a circle of
        // CLEARANCE_RADIUS centred there overlaps the terrain.
        const inside = isPointInsideTopographicTerrain(terrain, wx, wy);
        const grazing = !inside && circleIntersectsTopographicTerrain(
          terrain, wx, wy, CLEARANCE_RADIUS_PX,
        );
        if (inside || grazing) {
          blocked[r * cols + c] = 1;
        }
      }
    }
  }

  return { cols, rows, cellSizePx, blocked, moveCost, widthPx, heightPx, originX, originY };
}

// ── Soft obstacle registration ────────────────────────────────────────────────

/**
 * Marks cells that overlap any circle in `circles` as soft obstacles by
 * setting their `moveCost` to `costMultiplier`.
 *
 * Call this once after `buildRpgNavigationGrid` when zone-specific obstacles
 * (e.g. Impetus asteroids) are known.  Do NOT call per-frame — only call when
 * the obstacle layout changes (typically once per wave).
 *
 * Soft-obstacle cells are NOT blocked; A* can still traverse them, but their
 * high cost strongly encourages routing around them.
 *
 * @param navGrid        Grid to mutate in place.
 * @param circles        Array of `{x, y, radiusPx}` obstacle circles in world px.
 * @param costMultiplier Per-cell cost multiplier written to cells in each circle.
 *                       Defaults to SOFT_OBSTACLE_COST (8).
 */
export function applyCircleSoftObstacles(
  navGrid: RpgNavGrid,
  circles: ReadonlyArray<{ x: number; y: number; radiusPx: number }>,
  costMultiplier: number = SOFT_OBSTACLE_COST,
): void {
  const { cols, rows, cellSizePx, blocked, moveCost, originX, originY } = navGrid;
  const half = cellSizePx * 0.5;
  const clampedMult = Math.max(1, Math.min(255, Math.round(costMultiplier)));

  for (const { x: cx, y: cy, radiusPx } of circles) {
    const radSq = radiusPx * radiusPx;
    // Compute bounding cell range to avoid checking every cell.
    const minC = Math.max(0, Math.floor((cx - radiusPx - originX) / cellSizePx));
    const maxC = Math.min(cols - 1, Math.ceil((cx + radiusPx - originX) / cellSizePx));
    const minR = Math.max(0, Math.floor((cy - radiusPx - originY) / cellSizePx));
    const maxR = Math.min(rows - 1, Math.ceil((cy + radiusPx - originY) / cellSizePx));

    for (let r = minR; r <= maxR; r++) {
      for (let c = minC; c <= maxC; c++) {
        const wx = originX + c * cellSizePx + half;
        const wy = originY + r * cellSizePx + half;
        const dx = wx - cx, dy = wy - cy;
        if (dx * dx + dy * dy > radSq) continue;
        const idx = r * cols + c;
        // Only raise cost on walkable cells; blocked cells are already unusable.
        if (!blocked[idx] && moveCost[idx] < clampedMult) {
          moveCost[idx] = clampedMult;
        }
      }
    }
  }
}

// ── Coordinate helpers ───────────────────────────────────────────────────────

function worldToCell(
  wx: number, wy: number,
  cellSizePx: number,
  cols: number, rows: number,
  originX = 0, originY = 0,
): { col: number; row: number } {
  const col = Math.max(0, Math.min(cols - 1, Math.floor((wx - originX) / cellSizePx)));
  const row = Math.max(0, Math.min(rows - 1, Math.floor((wy - originY) / cellSizePx)));
  return { col, row };
}

function cellToWorld(
  col: number, row: number,
  cellSizePx: number,
  originX = 0, originY = 0,
): { wx: number; wy: number } {
  const half = cellSizePx * 0.5;
  return { wx: originX + col * cellSizePx + half, wy: originY + row * cellSizePx + half };
}

function cellIndex(col: number, row: number, cols: number): number {
  return row * cols + col;
}

/**
 * Snaps a blocked cell to the nearest walkable cell within SNAP_SEARCH_RADIUS.
 * Returns the original cell if it is already walkable.
 */
function snapToWalkable(
  col: number, row: number,
  grid: RpgNavGrid,
): { col: number; row: number } {
  if (!grid.blocked[cellIndex(col, row, grid.cols)]) return { col, row };

  let bestCol = col, bestRow = row;
  let bestDistSq = Infinity;

  for (let dr = -SNAP_SEARCH_RADIUS; dr <= SNAP_SEARCH_RADIUS; dr++) {
    for (let dc = -SNAP_SEARCH_RADIUS; dc <= SNAP_SEARCH_RADIUS; dc++) {
      const nc = col + dc, nr = row + dr;
      if (nc < 0 || nc >= grid.cols || nr < 0 || nr >= grid.rows) continue;
      if (grid.blocked[cellIndex(nc, nr, grid.cols)]) continue;
      const dsq = dc * dc + dr * dr;
      if (dsq < bestDistSq) {
        bestDistSq = dsq;
        bestCol = nc; bestRow = nr;
      }
    }
  }
  return { col: bestCol, row: bestRow };
}

// ── Binary min-heap for A* open set ─────────────────────────────────────────

/** A* open-set node stored in the heap. */
interface AStarNode {
  idx: number;   // flat cell index
  g: number;     // cost from start
  f: number;     // g + h (priority)
}

class MinHeap {
  private data: AStarNode[] = [];

  get size(): number { return this.data.length; }

  push(node: AStarNode): void {
    this.data.push(node);
    this._bubbleUp(this.data.length - 1);
  }

  pop(): AStarNode {
    const top = this.data[0];
    const last = this.data.pop()!;
    if (this.data.length > 0) {
      this.data[0] = last;
      this._sinkDown(0);
    }
    return top;
  }

  private _bubbleUp(i: number): void {
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.data[parent].f <= this.data[i].f) break;
      [this.data[parent], this.data[i]] = [this.data[i], this.data[parent]];
      i = parent;
    }
  }

  private _sinkDown(i: number): void {
    const n = this.data.length;
    while (true) {
      let smallest = i;
      const l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.data[l].f < this.data[smallest].f) smallest = l;
      if (r < n && this.data[r].f < this.data[smallest].f) smallest = r;
      if (smallest === i) break;
      [this.data[smallest], this.data[i]] = [this.data[i], this.data[smallest]];
      i = smallest;
    }
  }
}

// ── A* pathfinder ────────────────────────────────────────────────────────────

/** Maximum cells to expand before giving up (prevents runaway on huge grids). */
const MAX_EXPAND = 4096;

/**
 * Finds a path from world point `(startX, startY)` to `(goalX, goalY)` on
 * `navGrid`.  Returns an ordered array of world-space waypoints including the
 * goal (start is NOT included).  Returns an empty array if no path is found.
 *
 * The path is post-processed with a simple funnel: straight segments between
 * mutually visible waypoints are collapsed to reduce unnecessary zigzagging.
 */
export function findRpgPath(
  navGrid: RpgNavGrid,
  startX: number, startY: number,
  goalX: number,  goalY: number,
  terrain: TopographicTerrainState | null,
): RpgWaypoint[] {
  const { cols, rows, cellSizePx, blocked, moveCost, originX, originY } = navGrid;

  // Convert to cell coordinates, snap blocked cells to nearest walkable.
  let { col: sc, row: sr } = worldToCell(startX, startY, cellSizePx, cols, rows, originX, originY);
  let { col: gc, row: gr } = worldToCell(goalX,  goalY,  cellSizePx, cols, rows, originX, originY);
  ({ col: sc, row: sr } = snapToWalkable(sc, sr, navGrid));
  ({ col: gc, row: gr } = snapToWalkable(gc, gr, navGrid));

  const startIdx = cellIndex(sc, sr, cols);
  const goalIdx  = cellIndex(gc, gr, cols);

  if (startIdx === goalIdx) {
    return [{ wx: goalX, wy: goalY }];
  }

  // A* state arrays.
  const gCost   = new Float32Array(cols * rows).fill(Infinity);
  const parent  = new Int32Array(cols * rows).fill(-1);
  const closed  = new Uint8Array(cols * rows);

  gCost[startIdx] = 0;
  const openSet = new MinHeap();
  openSet.push({ idx: startIdx, g: 0, f: _heuristic(sc, sr, gc, gr) });

  let expanded = 0;
  let found = false;

  // 8-directional neighbour offsets [dc, dr, cost]
  const DIRS: [number, number, number][] = [
    [ 1,  0, COST_CARDINAL],
    [-1,  0, COST_CARDINAL],
    [ 0,  1, COST_CARDINAL],
    [ 0, -1, COST_CARDINAL],
    [ 1,  1, COST_DIAGONAL],
    [-1,  1, COST_DIAGONAL],
    [ 1, -1, COST_DIAGONAL],
    [-1, -1, COST_DIAGONAL],
  ];

  while (openSet.size > 0 && expanded < MAX_EXPAND) {
    const cur = openSet.pop();
    const cidx = cur.idx;
    if (closed[cidx]) continue;
    closed[cidx] = 1;
    expanded++;

    if (cidx === goalIdx) { found = true; break; }

    const cc = cidx % cols;
    const cr = Math.floor(cidx / cols);

    for (const [dc, dr, cost] of DIRS) {
      const nc = cc + dc, nr = cr + dr;
      if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
      const nidx = cellIndex(nc, nr, cols);
      if (closed[nidx] || blocked[nidx]) continue;

      // No diagonal movement through blocked corners.
      if (dc !== 0 && dr !== 0) {
        if (blocked[cellIndex(cc + dc, cr, cols)] || blocked[cellIndex(cc, cr + dr, cols)]) continue;
      }

      const tentG = gCost[cidx] + cost * moveCost[nidx];
      if (tentG < gCost[nidx]) {
        gCost[nidx] = tentG;
        parent[nidx] = cidx;
        openSet.push({ idx: nidx, g: tentG, f: tentG + _heuristic(nc, nr, gc, gr) });
      }
    }
  }

  if (!found) return [];

  // Reconstruct raw path.
  const rawCells: Array<{ col: number; row: number }> = [];
  let cur = goalIdx;
  while (cur !== startIdx) {
    rawCells.unshift({ col: cur % cols, row: Math.floor(cur / cols) });
    cur = parent[cur];
  }
  // Convert to world waypoints.
  const rawWaypoints: RpgWaypoint[] = rawCells.map(({ col, row }) => cellToWorld(col, row, cellSizePx, originX, originY));
  // Replace last waypoint with the exact goal position.
  if (rawWaypoints.length > 0) {
    rawWaypoints[rawWaypoints.length - 1] = { wx: goalX, wy: goalY };
  }

  // Post-process: collapse straight (line-of-sight) segments.
  return _funnelPath(rawWaypoints, startX, startY, terrain);
}

/** Returns false when a straight segment crosses blocked cells in the nav grid. */
export function hasRpgNavGridLineOfSight(
  navGrid: RpgNavGrid | null,
  startX: number,
  startY: number,
  goalX: number,
  goalY: number,
): boolean {
  if (!navGrid) return true;
  const dx = goalX - startX;
  const dy = goalY - startY;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist <= 0.001) return true;

  const stepPx = Math.max(4, navGrid.cellSizePx * 0.35);
  const steps = Math.max(1, Math.ceil(dist / stepPx));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    const wx = startX + dx * t;
    const wy = startY + dy * t;
    const { col, row } = worldToCell(
      wx, wy,
      navGrid.cellSizePx,
      navGrid.cols,
      navGrid.rows,
      navGrid.originX,
      navGrid.originY,
    );
    if (navGrid.blocked[cellIndex(col, row, navGrid.cols)]) return false;
  }
  return true;
}

/** Octile heuristic for 8-directional grids. */
function _heuristic(c1: number, r1: number, c2: number, r2: number): number {
  const dc = Math.abs(c1 - c2), dr = Math.abs(r1 - r2);
  return COST_CARDINAL * Math.max(dc, dr) + (COST_DIAGONAL - COST_CARDINAL) * Math.min(dc, dr);
}

/**
 * Simple string-pull funnel: walk the waypoint list from the start position
 * and skip waypoints that have direct line-of-sight to a later waypoint.
 * Reduces unnecessary zigzag turns imposed by the grid.
 */
function _funnelPath(
  waypoints: RpgWaypoint[],
  startX: number, startY: number,
  terrain: TopographicTerrainState | null,
): RpgWaypoint[] {
  if (!terrain || waypoints.length <= 1) return waypoints;

  const result: RpgWaypoint[] = [];
  let fromX = startX, fromY = startY;

  let i = 0;
  while (i < waypoints.length) {
    // Find the furthest visible waypoint from `from`.
    let furthest = i;
    for (let j = waypoints.length - 1; j > i; j--) {
      if (!segmentIntersectsTopographicTerrain(terrain, fromX, fromY, waypoints[j].wx, waypoints[j].wy)) {
        furthest = j;
        break;
      }
    }
    result.push(waypoints[furthest]);
    fromX = waypoints[furthest].wx;
    fromY = waypoints[furthest].wy;
    i = furthest + 1;
  }
  return result;
}

// ── Steering helpers ──────────────────────────────────────────────────────────

/**
 * Returns a normalised direction `{dx, dy}` pointing from `(x, y)` toward the
 * next relevant waypoint in `path`.  Looks `lookaheadPx` ahead along the path
 * to smooth navigation around tight corners.
 *
 * Advances `waypointIdx` (passed by ref via pathState) when the entity is
 * close enough to the current waypoint.
 *
 * Returns `{dx: 0, dy: 0}` when the path is empty or fully traversed.
 */
export function getPathSteeringDirection(
  path: RpgWaypoint[],
  waypointIdxRef: { value: number },
  x: number, y: number,
  lookaheadPx = DEFAULT_LOOKAHEAD_PX,
): { dx: number; dy: number } {
  if (path.length === 0) return { dx: 0, dy: 0 };

  // Advance waypoint index if close enough to current target.
  const WAYPOINT_REACH_SQ = (lookaheadPx * 0.5) ** 2;
  while (waypointIdxRef.value < path.length - 1) {
    const wp = path[waypointIdxRef.value];
    const dxw = wp.wx - x, dyw = wp.wy - y;
    if (dxw * dxw + dyw * dyw < WAYPOINT_REACH_SQ) {
      waypointIdxRef.value++;
    } else {
      break;
    }
  }

  if (waypointIdxRef.value >= path.length) return { dx: 0, dy: 0 };

  // Look ahead along the path for a smoother direction.
  let targetX = path[waypointIdxRef.value].wx;
  let targetY = path[waypointIdxRef.value].wy;

  let accumulated = 0;
  for (let j = waypointIdxRef.value; j < path.length - 1; j++) {
    const seg = path[j];
    const nxt = path[j + 1];
    const sdx = nxt.wx - seg.wx, sdy = nxt.wy - seg.wy;
    const segLen = Math.sqrt(sdx * sdx + sdy * sdy);
    accumulated += segLen;
    if (accumulated >= lookaheadPx) {
      // Interpolate along this segment.
      const excess = accumulated - lookaheadPx;
      const t = 1 - excess / segLen;
      targetX = seg.wx + sdx * t;
      targetY = seg.wy + sdy * t;
      break;
    }
    targetX = nxt.wx;
    targetY = nxt.wy;
  }

  const dx = targetX - x, dy = targetY - y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  return { dx: dx / len, dy: dy / len };
}

// ── Per-entity path state management ─────────────────────────────────────────

/** Default repath interval for enemies (ms). */
export const DEFAULT_REPATH_MS = 600;
/** Player repath interval (ms) — more responsive. */
export const PLAYER_REPATH_MS  = 300;
/** Distance the target must move to trigger an early repath (px). */
const REPATH_TARGET_MOVE_SQ = 50 * 50;
/** Stuck detection: entity speed below this is considered stuck (px/frame). */
const STUCK_SPEED_THRESHOLD = 0.3;
/** Stuck duration before forcing an early repath (ms). */
const STUCK_FORCE_REPATH_MS = 800;

/**
 * Maintains per-entity `RpgPathState`, triggering A* repathing when:
 *   - `nowMs >= pathState.nextRepathMs`
 *   - the target has moved by more than REPATH_TARGET_MOVE_SQ
 *   - the entity appears stuck for STUCK_FORCE_REPATH_MS
 *
 * @param pathState   Mutable per-entity path state (modified in place)
 * @param x / y       Entity world position
 * @param targetX/Y   Goal world position
 * @param nowMs       Current timestamp
 * @param navGrid     Pre-built navigation grid
 * @param terrain     Current terrain state (may be null)
 * @param maxRepathMs Interval between automatic repathing (default 600 ms)
 * @param speed       Current entity movement speed (px/frame) for stuck detection
 */
export function updateEntityPathState(
  pathState: RpgPathState,
  x: number, y: number,
  targetX: number, targetY: number,
  nowMs: number,
  navGrid: RpgNavGrid | null,
  terrain: TopographicTerrainState | null,
  maxRepathMs = DEFAULT_REPATH_MS,
  speed = 1,
): void {
  if (!navGrid) return;

  // Stuck detection.
  if (speed < STUCK_SPEED_THRESHOLD) {
    pathState.stuckMs += 16; // approximate frame time
    if (pathState.stuckMs >= STUCK_FORCE_REPATH_MS) {
      pathState.nextRepathMs = 0;
      pathState.stuckMs = 0;
    }
  } else {
    pathState.stuckMs = 0;
  }

  // Check if target moved significantly.
  const tdx = targetX - pathState.pathTargetX, tdy = targetY - pathState.pathTargetY;
  const targetMoved = tdx * tdx + tdy * tdy > REPATH_TARGET_MOVE_SQ;

  // Repath if due or target moved.
  if (nowMs >= pathState.nextRepathMs || targetMoved) {
    pathState.path = findRpgPath(navGrid, x, y, targetX, targetY, terrain);
    pathState.waypointIdx = 0;
    pathState.pathTargetX = targetX;
    pathState.pathTargetY = targetY;
    // Stagger repath times ±20% to avoid all enemies pathing at the same frame.
    pathState.nextRepathMs = nowMs + maxRepathMs * (0.8 + Math.random() * 0.4);
  }
}

/**
 * High-level helper for enemy/player movement: calls `updateEntityPathState`
 * then returns the steering direction from the cached path.
 *
 * If the path is empty (no route found), returns the direct-toward-target
 * direction as a fallback so entities never freeze.
 *
 * Returns `{dx, dy}` normalised direction.
 */
export function computePathSteeredDirection(
  pathState: RpgPathState,
  x: number, y: number,
  targetX: number, targetY: number,
  nowMs: number,
  navGrid: RpgNavGrid | null,
  terrain: TopographicTerrainState | null,
  maxRepathMs = DEFAULT_REPATH_MS,
  speed = 1,
): { dx: number; dy: number } {
  updateEntityPathState(
    pathState, x, y, targetX, targetY, nowMs, navGrid, terrain, maxRepathMs, speed,
  );

  if (pathState.path.length === 0) {
    // Fallback: direct direction.
    const dx = targetX - x, dy = targetY - y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    return { dx: dx / len, dy: dy / len };
  }

  const idxRef = { value: pathState.waypointIdx };
  const dir = getPathSteeringDirection(pathState.path, idxRef, x, y);
  pathState.waypointIdx = idxRef.value;
  return dir;
}

// ── Debug visualization data ──────────────────────────────────────────────────

/**
 * Renders pathfinding debug info onto a 2D canvas context when dev mode is on.
 *
 * Draws:
 *   - Semi-transparent red cells for blocked grid cells.
 *   - Player path in cyan.
 *   - Enemy paths in dim orange.
 *   - Waypoints as small filled circles.
 *
 * This function is a no-op when `enabled` is false, so it is safe to call
 * unconditionally from the draw pipeline.
 */
export function drawRpgPathfindingDebug(
  ctx: CanvasRenderingContext2D,
  enabled: boolean,
  navGrid: RpgNavGrid | null,
  playerPathState: RpgPathState | null,
  enemyPathStates: RpgPathState[],
): void {
  if (!enabled || !navGrid) return;

  const { cols, rows, cellSizePx, blocked, moveCost, originX, originY } = navGrid;

  ctx.save();

  // Draw soft-obstacle cells (high cost but walkable).
  ctx.fillStyle = 'rgba(255, 200, 0, 0.18)';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const idx = cellIndex(c, r, cols);
      if (!blocked[idx] && moveCost[idx] > 1) {
        ctx.fillRect(originX + c * cellSizePx, originY + r * cellSizePx, cellSizePx, cellSizePx);
      }
    }
  }

  // Draw blocked cells.
  ctx.fillStyle = 'rgba(255, 60, 60, 0.18)';
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (blocked[cellIndex(c, r, cols)]) {
        ctx.fillRect(originX + c * cellSizePx, originY + r * cellSizePx, cellSizePx, cellSizePx);
      }
    }
  }

  // Draw enemy paths.
  ctx.strokeStyle = 'rgba(255, 160, 40, 0.5)';
  ctx.lineWidth = 1;
  for (const ps of enemyPathStates) {
    _drawPath(ctx, ps.path);
  }

  // Draw player path.
  if (playerPathState) {
    ctx.strokeStyle = 'rgba(80, 220, 255, 0.7)';
    ctx.lineWidth = 1.5;
    _drawPath(ctx, playerPathState.path);
  }

  ctx.restore();
}

export function drawRpgPlayerPathPreview(
  ctx: CanvasRenderingContext2D,
  enabled: boolean,
  playerX: number,
  playerY: number,
  pathState: RpgPathState | null,
): void {
  if (!enabled || !pathState || pathState.path.length === 0) return;
  const path = pathState.path;

  ctx.save();
  ctx.globalAlpha = 0.28;
  ctx.strokeStyle = 'rgba(255, 215, 100, 1)';
  ctx.lineWidth = 1.25;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.shadowBlur = 4;
  ctx.shadowColor = 'rgba(255, 215, 100, 0.35)';

  ctx.beginPath();
  ctx.moveTo(playerX, playerY);
  if (path.length === 1) {
    ctx.lineTo(path[0].wx, path[0].wy);
  } else {
    let prevX = playerX;
    let prevY = playerY;
    for (let i = 0; i < path.length - 1; i++) {
      const cur = path[i];
      const next = path[i + 1];
      const midX = (cur.wx + next.wx) * 0.5;
      const midY = (cur.wy + next.wy) * 0.5;
      if (i === 0 && Math.hypot(cur.wx - prevX, cur.wy - prevY) < 2) {
        ctx.lineTo(midX, midY);
      } else {
        ctx.quadraticCurveTo(cur.wx, cur.wy, midX, midY);
      }
      prevX = cur.wx;
      prevY = cur.wy;
    }
    const last = path[path.length - 1];
    ctx.quadraticCurveTo(prevX, prevY, last.wx, last.wy);
  }
  ctx.stroke();
  ctx.restore();
}

function _drawPath(ctx: CanvasRenderingContext2D, path: RpgWaypoint[]): void {
  if (path.length === 0) return;
  ctx.beginPath();
  for (let i = 0; i < path.length; i++) {
    const { wx, wy } = path[i];
    if (i === 0) ctx.moveTo(wx, wy); else ctx.lineTo(wx, wy);
  }
  ctx.stroke();
  // Waypoint dots.
  for (const { wx, wy } of path) {
    ctx.beginPath();
    ctx.arc(wx, wy, 2, 0, Math.PI * 2);
    ctx.fill();
  }
}
