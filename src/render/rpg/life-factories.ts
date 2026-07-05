/**
 * life-factories.ts — Spawns Life-zone colony controllers.
 *
 * Ships one prototype enemy, "Maze Colony": a small core that seeds a
 * Mazectric-rule (B3/S1234) pattern near itself. Cells grow into corridor-like
 * shapes, are individually damageable, and have no health bars. Killing the
 * core stops the automata and fades out all remaining cells.
 */

import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import { RULE_MAZECTRIC } from './life-ca-rules';
import { LIFE_CELL_SIZE, makeLifeGridBounds, worldToLifeGrid, type LifeGridBounds } from './life-grid';
import { seedLifeColony, LIFE_CELL_BASE_HP } from './life-controller';
import type { LifeColonyController } from './life-types';

/** Base core HP for a Maze Colony at wave-scale 1. */
const MAZE_COLONY_CORE_BASE_HP = 40;

/** Hard cap on simultaneously active colonies in the arena (perf + readability). */
export const MAX_ACTIVE_LIFE_COLONIES = 3;

/** Seed pattern (relative to the colony center cell) — a small asymmetric glob
 *  that reliably produces ongoing Mazectric growth rather than dying out. */
const MAZE_COLONY_SEED_PATTERN: ReadonlyArray<{ col: number; row: number }> = [
  { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 },
  { col: -1, row: 0 }, { col: 0, row: -1 }, { col: 1, row: 1 },
  { col: -1, row: -1 }, { col: 2, row: 0 },
];

/**
 * Builds the shared Life grid bounds for the active arena. Callers should
 * cache the result per-arena-resize rather than recomputing every spawn.
 */
export function buildLifeGridBoundsForArena(
  arenaLeft: number,
  arenaTop: number,
  arenaWidth: number,
  arenaHeight: number,
): LifeGridBounds {
  return makeLifeGridBounds(arenaLeft, arenaTop, arenaWidth, arenaHeight, LIFE_CELL_SIZE);
}

/** Creates a Maze Colony controller centered at (spawnX, spawnY) for the given wave. */
export function makeMazeColony(
  spawnX: number,
  spawnY: number,
  waveNumber: number,
  bounds: LifeGridBounds,
): LifeColonyController {
  const waveStatScale = getWaveStatScale(waveNumber);
  const coreHp = Math.ceil(MAZE_COLONY_CORE_BASE_HP * waveStatScale);
  const cellHp = Math.max(1, Math.ceil(LIFE_CELL_BASE_HP * Math.sqrt(waveStatScale)));

  const colony: LifeColonyController = {
    kind: 'life_colony',
    rule: RULE_MAZECTRIC,
    bounds,
    x: spawnX,
    y: spawnY,
    coreHp,
    coreMaxHp: coreHp,
    cells: new Map(),
    tickAccumulatorMs: 0,
    generation: 0,
    maxPopulation: RULE_MAZECTRIC.maxPopulation ?? 260,
    status: 'seeding',
    xpMult: 1,
    coreContactCdMs: 0,
  };

  const centerCoord = worldToLifeGrid(spawnX, spawnY, bounds);
  seedLifeColony(colony, MAZE_COLONY_SEED_PATTERN, centerCoord.col, centerCoord.row, cellHp, false);
  return colony;
}
