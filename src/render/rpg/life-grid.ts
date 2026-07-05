/**
 * life-grid.ts — Shared grid framework for the Life zone.
 *
 * All Life-zone cellular-automata enemies align to one small-cell grid so
 * that colonies can interact, tile, and be rendered consistently. The grid
 * is anchored to a world-space origin (the active combat arena's top-left
 * corner) and bounded to that arena.
 */

/** World-space size (px) of one grid cell. Small so colonies read as "many cells". */
export const LIFE_CELL_SIZE = 14;

/** A grid coordinate (integer column/row, may be negative relative to origin). */
export interface LifeGridCoord {
  col: number;
  row: number;
}

/** Bounds of the Life grid in world space, derived from the active arena. */
export interface LifeGridBounds {
  originX: number;
  originY: number;
  /** Inclusive column range. */
  minCol: number;
  maxCol: number;
  /** Inclusive row range. */
  minRow: number;
  maxRow: number;
}

/** Builds grid bounds anchored to the top-left of the given arena rect. */
export function makeLifeGridBounds(
  arenaLeft: number,
  arenaTop: number,
  arenaWidth: number,
  arenaHeight: number,
  cellSize: number = LIFE_CELL_SIZE,
): LifeGridBounds {
  return {
    originX: arenaLeft,
    originY: arenaTop,
    minCol: 0,
    maxCol: Math.max(0, Math.floor(arenaWidth / cellSize) - 1),
    minRow: 0,
    maxRow: Math.max(0, Math.floor(arenaHeight / cellSize) - 1),
  };
}

/** Converts a world-space position to a Life grid coordinate (floor-based). */
export function worldToLifeGrid(
  worldX: number,
  worldY: number,
  bounds: LifeGridBounds,
  cellSize: number = LIFE_CELL_SIZE,
): LifeGridCoord {
  return {
    col: Math.floor((worldX - bounds.originX) / cellSize),
    row: Math.floor((worldY - bounds.originY) / cellSize),
  };
}

/** Converts a Life grid coordinate to the world-space center of that cell. */
export function lifeGridToWorldCenter(
  coord: LifeGridCoord,
  bounds: LifeGridBounds,
  cellSize: number = LIFE_CELL_SIZE,
): { x: number; y: number } {
  return {
    x: bounds.originX + coord.col * cellSize + cellSize / 2,
    y: bounds.originY + coord.row * cellSize + cellSize / 2,
  };
}

/** Snaps an arbitrary world position to the center of its containing Life grid cell. */
export function snapToLifeGridCenter(
  worldX: number,
  worldY: number,
  bounds: LifeGridBounds,
  cellSize: number = LIFE_CELL_SIZE,
): { x: number; y: number } {
  return lifeGridToWorldCenter(worldToLifeGrid(worldX, worldY, bounds, cellSize), bounds, cellSize);
}

/** Returns true if the coordinate falls within the grid bounds (arena-bounded). */
export function isLifeGridCoordInBounds(coord: LifeGridCoord, bounds: LifeGridBounds): boolean {
  return coord.col >= bounds.minCol && coord.col <= bounds.maxCol
      && coord.row >= bounds.minRow && coord.row <= bounds.maxRow;
}

/** Stable string key for a grid coordinate, for use in sparse Map/Set storage. */
export function lifeCellKey(col: number, row: number): string {
  return `${col}:${row}`;
}

/** Parses a lifeCellKey back into its coordinate. */
export function parseLifeCellKey(key: string): LifeGridCoord {
  const sep = key.indexOf(':');
  return { col: Number(key.slice(0, sep)), row: Number(key.slice(sep + 1)) };
}

/** The 8 Moore-neighborhood offsets, used by every rule preset in life-ca-rules.ts. */
export const LIFE_MOORE_NEIGHBOR_OFFSETS: readonly LifeGridCoord[] = [
  { col: -1, row: -1 }, { col: 0, row: -1 }, { col: 1, row: -1 },
  { col: -1, row: 0 },                       { col: 1, row: 0 },
  { col: -1, row: 1 },  { col: 0, row: 1 },  { col: 1, row: 1 },
];
