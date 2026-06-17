/**
 * rpg-wave-dead-enemies.ts — Dead enemy sweep orchestrator for the RPG wave system.
 *
 * This module keeps the public `removeDeadEnemiesImpl(ctx, addKill)` API stable
 * while delegating concrete sweep passes to focused modules:
 * - rpg-wave-dead-enemies-standard.ts (normal enemy arrays and shards)
 * - rpg-wave-dead-enemies-special.ts (elite/aliven/boss handling)
 */

import { addXpWithAllocation, getSkillNodeRank } from '../../sim/rpg/rpg-state';
import type { WaveManagerCtx } from './rpg-wave-manager';
import { sweepStandardDeadEnemies } from './rpg-wave-dead-enemies-standard';
import {
  sweepEliteAndAlivenDefeats,
  handleBossDefeat,
} from './rpg-wave-dead-enemies-special';
import { getCodexMultiplier } from '../../sim/rpg/rpg-codex';

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
  let codexMultiplierTotal = 0;
  let codexKillCount = 0;
  const trackedAddKill = (typeId: string): void => {
    codexMultiplierTotal += getCodexMultiplier(rpgSimState.lifetimeKillsByType.get(typeId) ?? 0);
    codexKillCount++;
    addKill(typeId);
  };

  totalXpFromKills += sweepStandardDeadEnemies(ctx, trackedAddKill);
  totalXpFromKills += sweepEliteAndAlivenDefeats(ctx, trackedAddKill);
  handleBossDefeat(ctx);

  if (totalXpFromKills > 0) {
    if (codexKillCount > 0) totalXpFromKills *= codexMultiplierTotal / codexKillCount;
    const xpGainRank = getSkillNodeRank(rpgSimState, 'xp_gain');
    if (xpGainRank > 0) totalXpFromKills *= 1 + xpGainRank * 0.08;
    addXpWithAllocation(rpgSimState, totalXpFromKills);
    applyEquipmentStats();
  }
}
