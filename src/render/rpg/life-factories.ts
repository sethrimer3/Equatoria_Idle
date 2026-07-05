/**
 * life-factories.ts — Spawns Life-zone colony controllers.
 *
 * Ships one prototype enemy, "Maze Colony": a small core that seeds a
 * Mazectric-rule (B3/S1234) pattern near itself. Cells grow into corridor-like
 * shapes, are individually damageable, and have no health bars. Killing the
 * core stops the automata and fades out all remaining cells.
 */

import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import {
  RULE_MAZECTRIC, RULE_SEEDS, RULE_REPLICATOR, RULE_WALLED_CITIES,
} from './life-ca-rules';
import { LIFE_CELL_SIZE, makeLifeGridBounds, worldToLifeGrid, type LifeGridBounds } from './life-grid';
import { seedLifeColony, LIFE_CELL_BASE_HP } from './life-controller';
import type { LifeColonyController } from './life-types';

/** Base core HP for a Maze Colony at wave-scale 1. */
const MAZE_COLONY_CORE_BASE_HP = 40;

/** Hard cap on simultaneously active colonies in the arena (perf + readability). */
export const MAX_ACTIVE_LIFE_COLONIES = 3;

/**
 * Hard cap on total live cells across every active colony combined, on top of
 * each colony's own maxPopulation. Prevents e.g. 3 simultaneous Walled Cities
 * colonies (240 pop each) from ever reaching 720 live cells at once.
 */
export const MAX_TOTAL_LIFE_CELLS = 480;

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

/** Shared helper: builds a bare colony shell (no cells yet) for a given rule/HP/xpMult. */
function makeColonyShell(
  rule: LifeColonyController['rule'],
  spawnX: number,
  spawnY: number,
  bounds: LifeGridBounds,
  coreBaseHp: number,
  waveNumber: number,
  xpMult: number,
): { colony: LifeColonyController; cellHp: number } {
  const waveStatScale = getWaveStatScale(waveNumber);
  const coreHp = Math.ceil(coreBaseHp * waveStatScale);
  const cellHp = Math.max(1, Math.ceil(LIFE_CELL_BASE_HP * Math.sqrt(waveStatScale)));
  const colony: LifeColonyController = {
    kind: 'life_colony',
    rule,
    bounds,
    x: spawnX,
    y: spawnY,
    coreHp,
    coreMaxHp: coreHp,
    cells: new Map(),
    tickAccumulatorMs: 0,
    generation: 0,
    maxPopulation: rule.maxPopulation ?? 200,
    status: 'seeding',
    xpMult,
    coreContactCdMs: 0,
  };
  return { colony, cellHp };
}

/** Base core HP for a Seeds Burst colony at wave-scale 1 — low HP, cells are
 *  flickering and briefly dangerous rather than a sustained threat. */
const SEEDS_BURST_CORE_BASE_HP = 30;

/** Small seed cluster: Seeds (B2/S) makes every cell die each step, but
 *  neighboring pairs constantly rebirth new cells, producing an expanding,
 *  flickering wavefront of briefly-dangerous cells. */
const SEEDS_BURST_SEED_PATTERN: ReadonlyArray<{ col: number; row: number }> = [
  { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 2, row: 1 },
  { col: 1, row: 2 }, { col: -1, row: 1 },
];

/** Creates a "Seeds Burst" colony (RULE_SEEDS) — expanding flickering wavefronts. */
export function makeSeedsBurstColony(
  spawnX: number, spawnY: number, waveNumber: number, bounds: LifeGridBounds,
): LifeColonyController {
  const { colony, cellHp } = makeColonyShell(RULE_SEEDS, spawnX, spawnY, bounds, SEEDS_BURST_CORE_BASE_HP, waveNumber, 1.1);
  const centerCoord = worldToLifeGrid(spawnX, spawnY, bounds);
  // Seeds cells are dangerous (brief contact damage) while they flicker in and out.
  seedLifeColony(colony, SEEDS_BURST_SEED_PATTERN, centerCoord.col, centerCoord.row, cellHp, true);
  return colony;
}

/** Base core HP for a Replicator Sigil colony at wave-scale 1. */
const REPLICATOR_SIGIL_CORE_BASE_HP = 36;

/** Small symmetric seed (a plus-sign) — Replicator (B1357/S1357) copies this
 *  shape outward in a controlled, symmetric bloom rather than sprawling chaos. */
const REPLICATOR_SIGIL_SEED_PATTERN: ReadonlyArray<{ col: number; row: number }> = [
  { col: 0, row: 0 }, { col: 1, row: 0 }, { col: -1, row: 0 }, { col: 0, row: 1 }, { col: 0, row: -1 },
];

/** Creates a "Replicator Sigil" colony (RULE_REPLICATOR) — a small symmetric
 *  seed that self-replicates under a strict population cap. */
export function makeReplicatorSigilColony(
  spawnX: number, spawnY: number, waveNumber: number, bounds: LifeGridBounds,
): LifeColonyController {
  const { colony, cellHp } = makeColonyShell(RULE_REPLICATOR, spawnX, spawnY, bounds, REPLICATOR_SIGIL_CORE_BASE_HP, waveNumber, 1);
  // Strict population cap tighter than the rule's own default — keeps the sigil readable.
  colony.maxPopulation = Math.min(colony.maxPopulation, 90);
  const centerCoord = worldToLifeGrid(spawnX, spawnY, bounds);
  seedLifeColony(colony, REPLICATOR_SIGIL_SEED_PATTERN, centerCoord.col, centerCoord.row, cellHp, false);
  return colony;
}

/** Base core HP for a Walled Cities colony at wave-scale 1 — elite-tier, tanky core. */
const WALLED_CITIES_CORE_BASE_HP = 90;

/** Dense ring seed — Walled Cities (B45678/S2345) needs a dense starting
 *  cluster to trigger its high birth threshold and grow defensive walls. */
const WALLED_CITIES_SEED_PATTERN: ReadonlyArray<{ col: number; row: number }> = [
  { col: -1, row: -1 }, { col: 0, row: -1 }, { col: 1, row: -1 },
  { col: -1, row: 0 }, { col: 0, row: 0 }, { col: 1, row: 0 },
  { col: -1, row: 1 }, { col: 0, row: 1 }, { col: 1, row: 1 },
  { col: -2, row: 0 }, { col: 2, row: 0 }, { col: 0, row: -2 }, { col: 0, row: 2 },
];

/** Creates a "Walled Cities" colony (RULE_WALLED_CITIES) — an elite-style
 *  colony with a tanky core defended by dense walls of cells. */
export function makeWalledCitiesColony(
  spawnX: number, spawnY: number, waveNumber: number, bounds: LifeGridBounds,
): LifeColonyController {
  const { colony, cellHp } = makeColonyShell(RULE_WALLED_CITIES, spawnX, spawnY, bounds, WALLED_CITIES_CORE_BASE_HP, waveNumber, 1.4);
  const centerCoord = worldToLifeGrid(spawnX, spawnY, bounds);
  seedLifeColony(colony, WALLED_CITIES_SEED_PATTERN, centerCoord.col, centerCoord.row, cellHp * 2, false);
  return colony;
}

// NOTE on the remaining two design-brief variants (life_without_death_corruption,
// life_generations_ghost): both need extra machinery beyond a rule preset —
// Life Without Death requires an external decay/lifetime timer since its rule
// never naturally kills cells, and Generations-style ghost states need a
// transitional-state layer the stepper does not implement (stateCount > 2 is
// explicitly unhandled — see stepLifeAutomata's guard comment). Deferred to a
// follow-up pass rather than bolted on here.
