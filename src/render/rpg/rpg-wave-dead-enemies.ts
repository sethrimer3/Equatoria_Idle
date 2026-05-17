/**
 * rpg-wave-dead-enemies.ts — Dead enemy sweep orchestrator for the RPG wave system.
 *
 * This module keeps the public `removeDeadEnemiesImpl(ctx, addKill)` API stable
 * while delegating concrete sweep passes to focused modules:
 * - rpg-wave-dead-enemies-standard.ts (normal enemy arrays and shards)
 * - rpg-wave-dead-enemies-special.ts (elite/aliven/boss handling)
 */

import { addXpWithAllocation } from '../../sim/rpg/rpg-state';
import type { WaveManagerCtx } from './rpg-wave-manager';
import { sweepStandardDeadEnemies } from './rpg-wave-dead-enemies-standard';
import {
  sweepEliteAndAlivenDefeats,
  handleBossDefeat,
} from './rpg-wave-dead-enemies-special';

/**
 * Sweep all enemy arrays for dead entities, award XP, handle boss defeat, and
 * apply equipment stat refresh if any non-boss XP was earned.
 */
export function removeDeadEnemiesImpl(
  ctx: WaveManagerCtx,
  addKill: (typeId: string) => void,
): void {
  const { rpgSimState, applyEquipmentStats } = ctx;
  let totalXpFromKills = 0;

  totalXpFromKills += sweepStandardDeadEnemies(ctx, addKill);
  totalXpFromKills += sweepEliteAndAlivenDefeats(ctx, addKill);
  handleBossDefeat(ctx);

  if (totalXpFromKills > 0) {
    addXpWithAllocation(rpgSimState, totalXpFromKills);
    applyEquipmentStats();
  }
}
