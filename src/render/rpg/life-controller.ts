/**
 * life-controller.ts — Cellular-automata stepping logic for Life zone fields.
 *
 * Life cells are the enemies. The LifeColonyController here is only an
 * invisible rule/spawner: it advances the CA rule and manages occupancy: it
 * is not itself a killable combat entity by default. There is no default
 * core — see the doc comment on LifeColonyController in life-types.ts.
 *
 * Pure, canvas-free functions operating on a LifeColonyController's sparse
 * occupancy map. Kept side-effect-free (aside from mutating the passed
 * colony) so they're cheaply unit-testable and reusable across every future
 * rule variant without touching combat/render integration.
 *
 * Performance note: `stepLifeAutomata` only evaluates occupied cells and
 * their immediate neighbors (a candidate set built from the sparse map), not
 * a dense scan of the whole grid — this keeps per-tick cost proportional to
 * population, not arena area.
 */

import type { CellularAutomataRule } from './life-ca-rules';
import {
  LIFE_MOORE_NEIGHBOR_OFFSETS,
  isLifeGridCoordInBounds,
  lifeCellKey,
  parseLifeCellKey,
  type LifeGridBounds,
} from './life-grid';
import type { LifeCellEntity, LifeColonyController } from './life-types';

/** Default per-cell HP for a freshly-born cell — low, per the design brief. */
export const LIFE_CELL_BASE_HP = 6;
/** Ms a cell spends shrinking/fading once killed before being removed from occupancy. */
export const LIFE_CELL_DEATH_FADE_MS = 220;

/** Ms a cell spends in the Generations 'ghost' transitional state before it starts its death-fade. */
export const LIFE_CELL_GHOST_MS = 900;

function makeLifeCell(generation: number, hp: number, dangerous: boolean, decayMs: number = Infinity): LifeCellEntity {
  return {
    col: 0, row: 0,
    hp, maxHp: hp,
    hideHealthBar: true,
    hitFlashMs: 0,
    dyingMs: 0,
    isDying: false,
    isDangerous: dangerous,
    contactCdMs: 0,
    bornAtGeneration: generation,
    decayMs,
    lifeState: 'alive',
    ghostMs: 0,
  };
}

/**
 * Seeds a colony with an initial pattern (list of {col, row} offsets relative
 * to the colony's center cell). Overwrites any existing cells at those
 * coordinates. Respects arena bounds and the colony's population cap.
 */
export function seedLifeColony(
  colony: LifeColonyController,
  pattern: ReadonlyArray<{ col: number; row: number }>,
  centerCol: number,
  centerRow: number,
  hp: number = LIFE_CELL_BASE_HP,
  dangerous = false,
): void {
  for (const offset of pattern) {
    if (colony.cells.size >= colony.maxPopulation) break;
    const col = centerCol + offset.col;
    const row = centerRow + offset.row;
    if (!isLifeGridCoordInBounds({ col, row }, colony.bounds)) continue;
    const cell = makeLifeCell(colony.generation, hp, dangerous, colony.cellDecayLifetimeMs ?? Infinity);
    cell.col = col;
    cell.row = row;
    colony.cells.set(lifeCellKey(col, row), cell);
  }
  colony.status = 'alive';
}

/**
 * Counts alive Moore-neighbors of (col, row) using the sparse occupancy map.
 * A cell counts as alive only when it is neither dying nor (for Generations
 * rules) in the 'ghost' transitional state — ghost cells must not keep a
 * neighbor alive or cause a birth (see life_generations_ghost).
 */
function countAliveNeighbors(
  cells: ReadonlyMap<string, LifeCellEntity>,
  col: number,
  row: number,
): number {
  let count = 0;
  for (const off of LIFE_MOORE_NEIGHBOR_OFFSETS) {
    const neighbor = cells.get(lifeCellKey(col + off.col, row + off.row));
    if (neighbor && !neighbor.isDying && neighbor.lifeState === 'alive') count++;
  }
  return count;
}

/**
 * Advances the automata one generation in place, per `colony.rule`'s B/S
 * notation. Candidate cells = every currently-occupied cell plus their
 * Moore neighbors (a sparse superset), so cost scales with population, not
 * grid area. Newly-born cells are capped by `colony.maxPopulation`.
 */
export function stepLifeAutomata(
  colony: LifeColonyController,
  hpForNewCell: number = LIFE_CELL_BASE_HP,
  globalCapRemaining: number = Infinity,
): void {
  // rule.stateCount > 2 (Generations-style multi-state rules) needs a dedicated
  // stepper: cells there pass through a 'ghost' transitional state that must
  // not count as alive or reproduce (see stepLifeAutomataGenerations). Every
  // other rule (stateCount undefined or 2) is classic binary alive/dead and
  // falls through to the loop below unchanged.
  if (colony.rule.stateCount && colony.rule.stateCount > 2) {
    stepLifeAutomataGenerations(colony, hpForNewCell, globalCapRemaining);
    return;
  }

  const { rule, bounds, cells } = colony;
  // Global cross-colony cap: this colony may only grow beyond its current size
  // by however much of the shared global budget the caller (updateLifeColonies)
  // says is left. Existing cells are never evicted to make room.
  const effectiveMaxPopulation = Math.min(colony.maxPopulation, cells.size + Math.max(0, globalCapRemaining));
  const birth = new Set(rule.birth);
  const survive = new Set(rule.survive);
  // rule.edgeBehavior: only 'dead' is implemented — isLifeGridCoordInBounds excludes
  // any neighbor outside the arena grid, so out-of-bounds neighbors always count as
  // dead. 'wrap' is reserved for a future toroidal-neighbor-count implementation and
  // must not be set on any preset until that's added (see life-ca-rules.ts).

  // Build the candidate coordinate set: occupied cells ∪ their neighbors.
  const candidates = new Map<string, { col: number; row: number }>();
  for (const key of cells.keys()) {
    const { col, row } = parseLifeCellKey(key);
    candidates.set(key, { col, row });
    for (const off of LIFE_MOORE_NEIGHBOR_OFFSETS) {
      const nCol = col + off.col, nRow = row + off.row;
      if (!isLifeGridCoordInBounds({ col: nCol, row: nRow }, bounds)) continue;
      candidates.set(lifeCellKey(nCol, nRow), { col: nCol, row: nRow });
    }
  }

  const nextAlive: Array<{ col: number; row: number; existing: LifeCellEntity | undefined }> = [];
  for (const [key, coord] of candidates) {
    const existing = cells.get(key);
    const aliveNow = !!existing && !existing.isDying;
    const neighborCount = countAliveNeighbors(cells, coord.col, coord.row);
    const willBeAlive = aliveNow ? survive.has(neighborCount) : birth.has(neighborCount);
    if (willBeAlive) nextAlive.push({ col: coord.col, row: coord.row, existing });
  }

  colony.generation++;

  // Cells that survive keep their HP/state; new births get a fresh cell,
  // subject to the population cap (first-come — order is neighbor-scan order,
  // acceptable for a soft cap rather than a fairness guarantee).
  const next = new Map<string, LifeCellEntity>();
  for (const { col, row, existing } of nextAlive) {
    if (next.size >= effectiveMaxPopulation) break;
    const key = lifeCellKey(col, row);
    if (existing && !existing.isDying) {
      next.set(key, existing);
    } else {
      const cell = makeLifeCell(colony.generation, hpForNewCell, false, colony.cellDecayLifetimeMs ?? Infinity);
      cell.col = col;
      cell.row = row;
      next.set(key, cell);
    }
  }
  // Preserve any still-fading-out (isDying) cells until their fade completes,
  // so death animations aren't cut short by the next generation's occupancy swap.
  for (const [key, cell] of cells) {
    if (cell.isDying && !next.has(key)) next.set(key, cell);
  }
  colony.cells = next;
}

/**
 * Generations-style stepper for `stateCount > 2` rules (see
 * RULE_GENERATIONS_GHOST / life_generations_ghost). Only the 3-state case
 * (one 'ghost' transitional state between alive and dead) is supported:
 *
 *   - An 'alive' cell whose alive-neighbor count is in `rule.survive` stays alive.
 *   - An 'alive' cell that would otherwise die instead becomes 'ghost' (it is
 *     NOT removed immediately) and starts counting down LIFE_CELL_GHOST_MS.
 *   - A 'ghost' cell never revives and never contributes to any neighbor's
 *     alive-count (see countAliveNeighbors) — it just ages out via
 *     advanceLifeCellFades/advanceLifeCellGhosts, which convert it to the
 *     normal isDying fade once its ghostMs elapses.
 *   - A dead cell (no entry, or a 'ghost'/'isDying' entry) is born exactly
 *     like the binary stepper, using only 'alive' neighbors for the count.
 *
 * Same sparse candidate-set approach as stepLifeAutomata, so cost still scales
 * with population rather than grid area.
 */
export function stepLifeAutomataGenerations(
  colony: LifeColonyController,
  hpForNewCell: number = LIFE_CELL_BASE_HP,
  globalCapRemaining: number = Infinity,
): void {
  const { rule, bounds, cells } = colony;
  const effectiveMaxPopulation = Math.min(colony.maxPopulation, cells.size + Math.max(0, globalCapRemaining));
  const birth = new Set(rule.birth);
  const survive = new Set(rule.survive);

  const candidates = new Map<string, { col: number; row: number }>();
  for (const key of cells.keys()) {
    const { col, row } = parseLifeCellKey(key);
    candidates.set(key, { col, row });
    for (const off of LIFE_MOORE_NEIGHBOR_OFFSETS) {
      const nCol = col + off.col, nRow = row + off.row;
      if (!isLifeGridCoordInBounds({ col: nCol, row: nRow }, bounds)) continue;
      candidates.set(lifeCellKey(nCol, nRow), { col: nCol, row: nRow });
    }
  }

  interface NextEntry { col: number; row: number; existing: LifeCellEntity | undefined; becomesGhost: boolean }
  const nextEntries: NextEntry[] = [];
  for (const [key, coord] of candidates) {
    const existing = cells.get(key);
    const aliveNow = !!existing && !existing.isDying && existing.lifeState === 'alive';
    const neighborCount = countAliveNeighbors(cells, coord.col, coord.row);
    if (aliveNow) {
      const survives = survive.has(neighborCount);
      // Alive cells always persist to next tick — either staying alive or
      // transitioning to 'ghost' — never disappearing outright this step.
      nextEntries.push({ col: coord.col, row: coord.row, existing, becomesGhost: !survives });
    } else if (!existing || existing.isDying) {
      // Only truly-dead coordinates can birth a new cell — ghost cells occupy
      // their coordinate until they finish aging out, blocking a birth there.
      if (birth.has(neighborCount)) {
        nextEntries.push({ col: coord.col, row: coord.row, existing: undefined, becomesGhost: false });
      }
    }
    // Existing ghost cells are preserved unconditionally below (they age out
    // via advanceLifeCellFades, not via the birth/survive rule check).
  }

  colony.generation++;

  const next = new Map<string, LifeCellEntity>();
  for (const { col, row, existing, becomesGhost } of nextEntries) {
    if (!existing && next.size >= effectiveMaxPopulation) continue;
    const key = lifeCellKey(col, row);
    if (existing) {
      if (becomesGhost && existing.lifeState === 'alive') {
        existing.lifeState = 'ghost';
        existing.ghostMs = LIFE_CELL_GHOST_MS;
        existing.isDangerous = false; // ghost cells deal no contact damage
      }
      next.set(key, existing);
    } else {
      const cell = makeLifeCell(colony.generation, hpForNewCell, false, colony.cellDecayLifetimeMs ?? Infinity);
      cell.col = col;
      cell.row = row;
      next.set(key, cell);
    }
  }
  // Preserve ghost/dying cells already past the candidate sweep (e.g. a ghost
  // cell whose coordinate had no alive neighbors at all this tick).
  for (const [key, cell] of cells) {
    if ((cell.isDying || cell.lifeState === 'ghost') && !next.has(key)) next.set(key, cell);
  }
  colony.cells = next;
}

/**
 * Applies damage to one cell. Returns actual damage dealt. When the cell's
 * hp drops to 0 it enters the dying/fade state rather than being removed
 * immediately (removal happens once dyingMs elapses, via advanceLifeCellFades).
 */
export function damageLifeCellEntity(cell: LifeCellEntity, rawDamage: number): number {
  if (cell.isDying) return 0;
  const dmg = Math.max(1, Math.floor(rawDamage));
  cell.hp = Math.max(0, cell.hp - dmg);
  cell.hitFlashMs = 120;
  if (cell.hp <= 0) {
    cell.isDying = true;
    cell.dyingMs = LIFE_CELL_DEATH_FADE_MS;
  }
  return dmg;
}

/**
 * Advances hit-flash, death-fade, ghost-aging, and lifetime-decay timers for
 * every cell in a colony, and removes cells whose fade has completed from the
 * occupancy map. Returns the number of cells removed this call (used to grant
 * per-cell XP on death).
 *
 * Ghost cells (life_generations_ghost) age out here: once ghostMs elapses,
 * the cell starts its normal death-fade rather than vanishing instantly.
 * Cells with a finite decayMs (life_without_death_corruption) expire the same
 * way once their lifetime runs out, independent of the survival rule —
 * without this, RULE_LIFE_WITHOUT_DEATH's B3/S012345678 never kills a cell on
 * its own and a corruption colony would grow forever.
 */
export function advanceLifeCellFades(colony: LifeColonyController, deltaMs: number): number {
  let removed = 0;
  for (const [key, cell] of colony.cells) {
    if (cell.hitFlashMs > 0) cell.hitFlashMs = Math.max(0, cell.hitFlashMs - deltaMs);
    if (cell.isDying) {
      cell.dyingMs -= deltaMs;
      if (cell.dyingMs <= 0) {
        colony.cells.delete(key);
        removed++;
      }
      continue;
    }
    if (cell.lifeState === 'ghost') {
      cell.ghostMs -= deltaMs;
      if (cell.ghostMs <= 0) {
        cell.isDying = true;
        cell.dyingMs = LIFE_CELL_DEATH_FADE_MS;
      }
      continue;
    }
    if (Number.isFinite(cell.decayMs)) {
      cell.decayMs -= deltaMs;
      if (cell.decayMs <= 0) {
        cell.isDying = true;
        cell.dyingMs = LIFE_CELL_DEATH_FADE_MS;
      }
    }
  }
  return removed;
}

/**
 * Applies damage to a field's core. RESERVED FOR A FUTURE CORE-BEARING
 * ENEMY VARIANT — no shipped Life enemy gives its field `coreHp > 0` (see
 * life-factories.ts and the LifeColonyController doc comment in
 * life-types.ts), so this is a no-op (returns 0) for every current Life
 * enemy. Do not call this from default Life combat/reward code.
 */
export function damageLifeCoreEntity(colony: LifeColonyController, rawDamage: number): number {
  if (colony.coreHp <= 0) return 0;
  const dmg = Math.max(1, Math.floor(rawDamage));
  const applied = Math.min(colony.coreHp, dmg);
  colony.coreHp -= applied;
  if (colony.coreHp <= 0) killLifeColonyCore(colony);
  return applied;
}

/**
 * Returns true once every cell has been cleared and the field's core (if any)
 * is dead. For every shipped Life enemy `coreHp` is always 0, so in practice
 * a field is cleared exactly when it has no live cells left — the field
 * itself never "defeats" all cells; cells die individually and this just
 * detects the field has nothing left to do.
 */
export function isLifeColonyFullyCleared(colony: LifeColonyController): boolean {
  return colony.coreHp <= 0 && colony.cells.size === 0;
}

/**
 * RESERVED FOR A FUTURE CORE-BEARING ENEMY VARIANT — not called by any
 * default Life update/combat path. Killing a field's core (if it ever has
 * one) marks the field 'dying' so the update loop stops ticking the automata
 * and lets all remaining cells fade out naturally. Must never be invoked
 * just because an invisible controller/field is torn down — normal Life
 * cells die only from damage, the CA survival rule, or their own decay/ghost
 * timers, never because a sibling cell or the field itself died.
 */
export function killLifeColonyCore(colony: LifeColonyController): void {
  colony.coreHp = 0;
  colony.status = 'dying';
  for (const cell of colony.cells.values()) {
    if (!cell.isDying) {
      cell.isDying = true;
      cell.dyingMs = LIFE_CELL_DEATH_FADE_MS;
    }
  }
}

export type { CellularAutomataRule, LifeGridBounds };
