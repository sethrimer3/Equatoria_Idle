/**
 * life-updates.ts — Per-frame update loop for Life zone fields.
 *
 * Life cells are the enemies; the field/controller here only manages rule
 * stepping and spawning — it is not itself a killable entity and deals no
 * contact damage of its own. The automata itself only advances on a fixed
 * tick interval (colony.rule.tickIntervalMs), not every render frame — see
 * stepLifeAutomata in life-controller.ts. This module accumulates elapsed
 * time, calls the stepper when due, advances cell hit-flash/death-fade
 * timers, applies contact damage from individually-dangerous cells, and
 * sweeps fields with no cells left out of the active array.
 */

import { lifeGridToWorldCenter } from './life-grid';
import {
  advanceLifeCellFades, isLifeColonyFullyCleared, stepLifeAutomata,
} from './life-controller';
import { MAX_TOTAL_LIFE_CELLS } from './life-factories';
import type { LifeColonyController } from './life-types';

export interface LifeUpdateCtx {
  playerX: number;
  playerY: number;
  playerRadius: number;
  dealContactDamageToPlayer(atk: number): void;
  /** Called once per cell removed by its death-fade completing (for XP/kill tracking).
   *  If several cells finish fading in the same update, this fires that many times. */
  onCellCleared?(colony: LifeColonyController): void;
  /** Called once a colony has no core HP and no remaining cells (fully cleared). */
  onColonyCleared?(colony: LifeColonyController): void;
}

/** Contact damage dealt by an individually-dangerous cell (e.g. a freshly-born Seeds Burst cell). */
const CELL_CONTACT_ATK = 3;
const CELL_CONTACT_COOLDOWN_MS = 500;

/** Advances every colony in `colonies` by one frame, and sweeps cleared ones out in place. */
export function updateLifeColonies(
  colonies: LifeColonyController[],
  ctx: LifeUpdateCtx,
  deltaMs: number,
): void {
  // Global cross-colony population cap (item 8): computed once per frame so
  // every colony's step this tick shares the same remaining growth budget,
  // regardless of iteration order.
  let totalLiveCells = 0;
  for (const colony of colonies) totalLiveCells += colony.cells.size;

  for (let i = colonies.length - 1; i >= 0; i--) {
    const colony = colonies[i]!;

    if (colony.status === 'alive' || colony.status === 'seeding') {
      colony.tickAccumulatorMs += deltaMs;
      const interval = colony.rule.tickIntervalMs ?? 500;
      if (colony.tickAccumulatorMs >= interval) {
        colony.tickAccumulatorMs -= interval;
        const beforeSize = colony.cells.size;
        stepLifeAutomata(colony, undefined, Math.max(0, MAX_TOTAL_LIFE_CELLS - totalLiveCells));
        totalLiveCells += colony.cells.size - beforeSize;
        if (colony.cells.size === 0 && colony.status === 'seeding') {
          // Pattern died out before ever taking hold — treat as cleared.
          colony.status = 'dying';
        } else {
          colony.status = 'alive';
        }
      }
    }

    // Cell contact damage — each dangerous, non-dying cell can hit the player
    // on its own cooldown. There is no core contact damage: normal Life
    // fields never give their controller HP or a contact source of its own.
    const hitRadius = ctx.playerRadius + 8;
    for (const cell of colony.cells.values()) {
      if (!cell.isDangerous || cell.isDying) continue;
      cell.contactCdMs = Math.max(0, cell.contactCdMs - deltaMs);
      if (cell.contactCdMs > 0) continue;
      const { x, y } = lifeCellWorldCenter(colony, cell.col, cell.row);
      const dx = ctx.playerX - x, dy = ctx.playerY - y;
      if (dx * dx + dy * dy <= hitRadius * hitRadius) {
        ctx.dealContactDamageToPlayer(CELL_CONTACT_ATK);
        cell.contactCdMs = CELL_CONTACT_COOLDOWN_MS;
      }
    }

    const removedCount = advanceLifeCellFades(colony, deltaMs);
    for (let n = 0; n < removedCount; n++) ctx.onCellCleared?.(colony);

    if (colony.status !== 'dead' && isLifeColonyFullyCleared(colony)) {
      colony.status = 'dead';
      ctx.onColonyCleared?.(colony);
      colonies.splice(i, 1);
    }
  }
}

/** World-space center for a live cell — used by both draw and targeting/damage code. */
export function lifeCellWorldCenter(colony: LifeColonyController, col: number, row: number): { x: number; y: number } {
  return lifeGridToWorldCenter({ col, row }, colony.bounds);
}
