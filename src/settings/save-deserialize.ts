/**
 * save-deserialize.ts — Converts SaveData wire format back into a live GameState.
 *
 * Extracted from save-load.ts to keep that file focused on localStorage I/O.
 * Handles version migration (v1 through v23+) via optional-field defaults.
 */

import type { GameState, PendingMoteEntry } from '../sim/game-state';
import type { TierId } from '../data/tiers';
import type { SizeIndex } from '../data/particles/size-tiers';
import { createGameState } from '../sim/game-state';
import { recomputeBonuses } from '../sim/achievements';
import { ACHIEVEMENT_BY_ID } from '../data/achievements';
import { sizeCountsToTotal } from '../sim/resources';
import { deserializeInteractionMatrix } from '../data/particles/interaction-matrix';
import type { SaveData } from './save-types';

// ─── Deserialize ────────────────────────────────────────────────

export function deserializeGameState(data: SaveData): GameState {
  const state = createGameState();

  // Equation
  for (const saved of data.equation.segments) {
    const seg = state.equation.segments.find(s => s.tierId === saved.tierId);
    if (seg) {
      seg.level = saved.level;
      seg.isUnlocked = saved.isUnlocked;
    }
  }
  state.equation.totalTapCount = data.equation.totalTapCount;
  state.equation.isForgeUnlocked = data.equation.isForgeUnlocked ?? false;

  // Resources — v7+ uses moteSizeCounts; v1–6 used flat moteTotals
  if (data.resources.moteSizeCounts) {
    for (const [tierId, sizeObj] of Object.entries(data.resources.moteSizeCounts)) {
      const counts = new Map<SizeIndex, number>();
      for (const [s, c] of Object.entries(sizeObj)) {
        counts.set(parseInt(s, 10), c);
      }
      state.resources.moteTotals.set(tierId as TierId, sizeCountsToTotal(counts));
    }
  } else if (data.resources.moteTotals) {
    for (const [key, val] of Object.entries(data.resources.moteTotals)) {
      state.resources.moteTotals.set(key as TierId, val);
    }
  }
  for (const [key, val] of Object.entries(data.resources.lifetimeMotes)) {
    state.resources.lifetimeMotes.set(key as TierId, val);
  }

  // Progression
  for (const [key, val] of Object.entries(data.progression.upgradeLevels)) {
    state.progression.upgradeLevels.set(key, val);
  }
  state.progression.unlockedTierCount = data.progression.unlockedTierCount;
  state.progression.autoTapLevel = data.progression.autoTapLevel;
  state.progression.globalMultiplier = data.progression.globalMultiplier;

  // Looms
  if (data.looms?.looms) {
    for (const saved of data.looms.looms) {
      const loom = state.looms.looms.find(l => l.tierId === saved.tierId);
      if (loom) {
        loom.level = saved.level;
        loom.isUnlocked = saved.isUnlocked;
        // v23+: conversion state
        if (saved.conversionProgress !== undefined) loom.conversionProgress = saved.conversionProgress;
        if (saved.conversionEfficiencyLevel !== undefined) loom.conversionEfficiencyLevel = saved.conversionEfficiencyLevel;
      }
    }
    if (data.looms.specialLoomPurchased) {
      for (const tierId of data.looms.specialLoomPurchased) {
        state.looms.specialPurchased.add(tierId as import('../data/tiers').TierId);
      }
    }
  }

  // Achievements
  if (data.achievements?.unlockedIds) {
    for (const id of data.achievements.unlockedIds) {
      state.achievements.unlockedIds.add(id);
    }
    // claimedIds — v5+ save. Older saves had no click-to-claim; treat all
    // previously-unlocked achievements as claimed for backward compatibility.
    const savedClaimedIds: string[] | undefined = (data.achievements as { claimedIds?: string[] }).claimedIds;
    if (savedClaimedIds && savedClaimedIds.length > 0) {
      for (const id of savedClaimedIds) {
        state.achievements.claimedIds.add(id);
      }
    } else {
      // Migrate older saves: auto-claim all unlocked non-secret achievements.
      // Secret achievements must always be manually claimed, even on migration.
      for (const id of state.achievements.unlockedIds) {
        const def = ACHIEVEMENT_BY_ID.get(id);
        if (!def?.isSecret) {
          state.achievements.claimedIds.add(id);
        }
      }
    }
    recomputeBonuses(state.achievements);
  }

  state.elapsedMs = data.elapsedMs;

  // Aliven state (v6+; older saves have no alivened tiers)
  if (data.aliven?.alivenedTierIds) {
    for (const id of data.aliven.alivenedTierIds) {
      state.aliven.alivenedTierIds.add(id as TierId);
    }
  }

  // Interaction matrix (v8+; older saves use the default matrix)
  if (data.aliven?.interactionMatrix) {
    const restored = deserializeInteractionMatrix(data.aliven.interactionMatrix);
    for (let i = 0; i < restored.length; i++) {
      for (let j = 0; j < restored[i].length; j++) {
        state.aliven.interactionMatrix[i][j] = restored[i][j];
      }
    }
  }

  // Forge heat-tap state (v23+; older saves default to initial state)
  if (data.forge) {
    state.forge.heatTapCount = data.forge.heatTapCount ?? 0;
    if (data.forge.sacrificeProgressByTierId) {
      for (const [tierId, progress] of Object.entries(data.forge.sacrificeProgressByTierId)) {
        state.forge.sacrificeProgressByTierId.set(tierId as TierId, progress);
      }
    }
  }

  // RPG state (v10+; older saves default to no progress)
  if (data.rpg) {
    state.rpg.highestWaveReached = data.rpg.highestWaveReached ?? 0;
    if (data.rpg.purchasedWeaponIds) {
      for (const id of data.rpg.purchasedWeaponIds) {
        state.rpg.purchasedWeaponIds.add(id);
      }
    }
    // v14+: equippedWeaponIds set; v10–v13 compat: migrate from equippedWeaponId
    if (data.rpg.equippedWeaponIds) {
      for (const id of data.rpg.equippedWeaponIds) {
        state.rpg.equippedWeaponIds.add(id);
      }
    } else if (data.rpg.equippedWeaponId) {
      state.rpg.equippedWeaponIds.add(data.rpg.equippedWeaponId);
    }
    // v20+: explicit slot assignment; older saves derive slots from equippedWeaponIds order
    if (data.rpg.equippedWeaponSlots && data.rpg.equippedWeaponSlots.length > 0) {
      for (const [slot, wid] of data.rpg.equippedWeaponSlots) {
        state.rpg.equippedWeaponSlots.set(slot, wid);
      }
    } else {
      // Migrate pre-v20 saves: assign equipped weapons to slots 0, 1, 2… in order
      let migrateSlot = 0;
      for (const id of state.rpg.equippedWeaponIds) {
        state.rpg.equippedWeaponSlots.set(migrateSlot++, id);
      }
    }
    // v11+: accumulated XP
    state.rpg.xp = data.rpg.xp ?? 0;
    // v12+: weapon tiers (default tier 1 for already-purchased weapons without saved tiers)
    if (data.rpg.weaponTiersByWeaponId) {
      for (const [weaponId, tier] of Object.entries(data.rpg.weaponTiersByWeaponId)) {
        state.rpg.weaponTiersByWeaponId.set(weaponId, tier);
      }
    } else {
      // Migrate pre-v12 saves: give all purchased weapons tier 1
      for (const weaponId of state.rpg.purchasedWeaponIds) {
        state.rpg.weaponTiersByWeaponId.set(weaponId, 1);
      }
    }
    // v12+: RPG upgrade levels
    if (data.rpg.rpgUpgradeLevels) {
      for (const [upgradeId, level] of Object.entries(data.rpg.rpgUpgradeLevels)) {
        state.rpg.rpgUpgradeLevels.set(upgradeId, level);
      }
    }
    // v15+: respawn checkpoint wave
    state.rpg.respawnWave = data.rpg.respawnWave ?? 0;
    // v16+: boss completions and speed
    if (data.rpg.bossCompletions) {
      for (const [idStr, speedPct] of Object.entries(data.rpg.bossCompletions)) {
        state.rpg.bossCompletions.set(parseInt(idStr, 10), speedPct);
      }
    }
    state.rpg.bossSpeedPct = data.rpg.bossSpeedPct ?? 100;
    // v19+: XP multi-wire stats; v17–v18 compat: migrate single xpAllocatedStat
    if (data.rpg.xpAllocatedStats) {
      const validStats = new Set(['atk', 'def', 'luck', 'hp']);
      state.rpg.xpAllocatedStats = (data.rpg.xpAllocatedStats as string[])
        .filter(s => validStats.has(s)) as Array<'atk' | 'def' | 'luck' | 'hp'>;
    } else if (data.rpg.xpAllocatedStat) {
      state.rpg.xpAllocatedStats = [data.rpg.xpAllocatedStat];
    } else {
      state.rpg.xpAllocatedStats = [];
    }
    state.rpg.xpAllocatedToAtk = data.rpg.xpAllocatedToAtk ?? 0;
    state.rpg.xpAllocatedToDef = data.rpg.xpAllocatedToDef ?? 0;
    // v18+: luck and HP XP allocation pools
    state.rpg.xpAllocatedToLuck = data.rpg.xpAllocatedToLuck ?? 0;
    state.rpg.xpAllocatedToHp = data.rpg.xpAllocatedToHp ?? 0;
    // v21+: achievement tracking counters
    if (data.rpg.lifetimeKillsByType) {
      for (const [k, v] of Object.entries(data.rpg.lifetimeKillsByType)) {
        state.rpg.lifetimeKillsByType.set(k, v);
      }
    }
    state.rpg.lifetimeEliteKills = data.rpg.lifetimeEliteKills ?? 0;
    state.rpg.lifetimeAlivenKills = data.rpg.lifetimeAlivenKills ?? 0;
    state.rpg.lifetimeLuckyMotesCollected = data.rpg.lifetimeLuckyMotesCollected ?? 0;
    state.rpg.lifetimeLateEnemyKills = data.rpg.lifetimeLateEnemyKills ?? 0;
    state.rpg.totalRpgSurvivalMs = data.rpg.totalRpgSurvivalMs ?? 0;
    state.rpg.totalWavesCompleted = data.rpg.totalWavesCompleted ?? 0;
    state.rpg.bestDamageFreeWaveStreak = data.rpg.bestDamageFreeWaveStreak ?? 0;
    state.rpg.bossDefeated1Weapon = data.rpg.bossDefeated1Weapon ?? false;
    // v22+: secret achievement flags
    if (data.rpg.secretAchievementFlags) {
      for (const flag of data.rpg.secretAchievementFlags) {
        state.rpg.secretAchievementFlags.add(flag);
      }
    }
    // v24+: XP reservoir and multiplier boxes
    state.rpg.xpReservoir = data.rpg.xpReservoir ?? 0;
    if (data.rpg.multiplierBoxes && data.rpg.multiplierBoxes.length >= 3) {
      for (let i = 0; i < 3; i++) {
        state.rpg.multiplierBoxes[i].level = data.rpg.multiplierBoxes[i].level ?? 1;
        state.rpg.multiplierBoxes[i].progressXp = data.rpg.multiplierBoxes[i].progressXp ?? 0;
      }
    }
    // v25+: sand blade enable/disable (default true for older saves)
    state.rpg.sandBladeEnabled = data.rpg.sandBladeEnabled ?? true;
    // v25+: explicit encounter tracking (empty set for older saves — bestiary falls back)
    if (data.rpg.encounteredEnemyTypes) {
      for (const id of data.rpg.encounteredEnemyTypes) {
        state.rpg.encounteredEnemyTypes.add(id);
      }
    }
    // v26+: zone progression state
    const validZoneIds = new Set(['euhedral', 'impetus', 'caustics', 'verdure', 'horizon']);
    if (data.rpg.activeZoneId && validZoneIds.has(data.rpg.activeZoneId)) {
      state.rpg.activeZoneId = data.rpg.activeZoneId as import('../data/rpg/rpg-zone-definitions').RpgZoneId;
    }
    // v28+: active subzone id (defaults to 'zenith' for older saves)
    const validSubzoneIds = new Set(['zenith', 'nadir', 'true']);
    if (data.rpg.activeSubzoneId && validSubzoneIds.has(data.rpg.activeSubzoneId)) {
      state.rpg.activeSubzoneId = data.rpg.activeSubzoneId;
    }
    if (data.rpg.highestWaveReachedByZone) {
      for (const [zoneId, wave] of Object.entries(data.rpg.highestWaveReachedByZone)) {
        if (validZoneIds.has(zoneId)) {
          (state.rpg.highestWaveReachedByZone as Record<string, number>)[zoneId] = wave;
        }
      }
    }
    // v27+: per-zone current wave (resume after reload)
    if (data.rpg.currentWaveByZone) {
      for (const [zoneId, wave] of Object.entries(data.rpg.currentWaveByZone)) {
        if (validZoneIds.has(zoneId) && typeof wave === 'number' && wave >= 0) {
          (state.rpg.currentWaveByZone as Record<string, number>)[zoneId] = wave;
        }
      }
    }
  }

  // v13+: pending idle-mote drip queue (absent in older saves → empty array)
  if (data.pendingIdleMotes && data.pendingIdleMotes.length > 0) {
    for (const entry of data.pendingIdleMotes) {
      if (entry.count > 0) {
        state.pendingIdleMotes.push({
          tierId: entry.tierId as TierId,
          sizeIndex: entry.sizeIndex,
          count: entry.count,
        } satisfies PendingMoteEntry);
      }
    }
  }

  return state;
}
