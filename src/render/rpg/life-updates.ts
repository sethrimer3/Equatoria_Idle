/**
 * life-updates.ts — Per-frame update loop for Life zone colonies.
 *
 * The automata itself only advances on a fixed tick interval (colony.rule.tickIntervalMs),
 * not every render frame — see stepLifeAutomata in life-controller.ts. This module
 * just accumulates elapsed time, calls the stepper when due, advances cell
 * hit-flash/death-fade timers, handles core contact damage, and sweeps fully-
 * cleared colonies out of the active array.
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

const CORE_CONTACT_ATK = 4;
const CORE_CONTACT_COOLDOWN_MS = 500;

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

      // Core contact damage — only while the core itself is still alive.
      if (colony.coreHp > 0) {
        colony.coreContactCdMs = Math.max(0, colony.coreContactCdMs - deltaMs);
        const dx = ctx.playerX - colony.x, dy = ctx.playerY - colony.y;
        const hitRadius = ctx.playerRadius + 8;
        if (colony.coreContactCdMs <= 0 && dx * dx + dy * dy <= hitRadius * hitRadius) {
          ctx.dealContactDamageToPlayer(CORE_CONTACT_ATK);
          colony.coreContactCdMs = CORE_CONTACT_COOLDOWN_MS;
        }
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
