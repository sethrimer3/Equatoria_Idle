/**
 * Spatial hash grid used for shockwave collision queries.
 *
 * Uses numeric keys (interleaved cell coordinates) instead of string
 * concatenation to avoid per-frame garbage.
 */

import type { EquatoriaParticle } from './particle-types';
import { SHOCKWAVE_MAX_RADIUS } from '../../data/particles/particle-config';

export const GRID_CELL_SIZE = SHOCKWAVE_MAX_RADIUS;

/** Interleave two 16-bit signed integers into a 32-bit numeric key. */
export function gridKey(cx: number, cy: number): number {
  return ((cx & 0xFFFF) << 16) | (cy & 0xFFFF);
}

export interface SpatialGrid {
  cells: Map<number, EquatoriaParticle[]>;
}

export function buildSpatialGrid(particles: EquatoriaParticle[]): SpatialGrid {
  const cells = new Map<number, EquatoriaParticle[]>();
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    const cx = Math.floor(p.x / GRID_CELL_SIZE);
    const cy = Math.floor(p.y / GRID_CELL_SIZE);
    const key = gridKey(cx, cy);
    let cell = cells.get(key);
    if (!cell) { cell = []; cells.set(key, cell); }
    cell.push(p);
  }
  return { cells };
}

/**
 * Execute a callback for each particle within `radius` of (x, y).
 * Avoids allocating a result array.
 */
export function forEachNearby(
  grid: SpatialGrid,
  x: number,
  y: number,
  radius: number,
  callback: (p: EquatoriaParticle) => void,
): void {
  const cx0 = Math.floor((x - radius) / GRID_CELL_SIZE);
  const cx1 = Math.floor((x + radius) / GRID_CELL_SIZE);
  const cy0 = Math.floor((y - radius) / GRID_CELL_SIZE);
  const cy1 = Math.floor((y + radius) / GRID_CELL_SIZE);
  const r2 = radius * radius;
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const cell = grid.cells.get(gridKey(cx, cy));
      if (!cell) continue;
      for (let i = 0, len = cell.length; i < len; i++) {
        const p = cell[i];
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx * dx + dy * dy <= r2) callback(p);
      }
    }
  }
}
