/**
 * save-serialize.ts — Converts live GameState into the SaveData wire format.
 *
 * Extracted from save-load.ts to keep that file focused on localStorage I/O.
 */

import type { GameState } from '../sim/game-state';
import { totalToSizeCounts } from '../sim/resources';
import { serializeInteractionMatrix } from '../data/particles/interaction-matrix';
import { type SaveData, SAVE_VERSION } from './save-types';

// ─── Serialize ──────────────────────────────────────────────────

export function serializeGameState(state: GameState): SaveData {
  // Encode per-tier totals as base-MERGE_THRESHOLD size counts.
  const moteSizeCounts: Record<string, Record<string, number>> = {};
  for (const [tierId, total] of state.resources.moteTotals) {
    const counts = totalToSizeCounts(total);
    if (counts.size > 0) {
      const sizeObj: Record<string, number> = {};
      for (const [s, c] of counts) sizeObj[String(s)] = c;
      moteSizeCounts[tierId] = sizeObj;
    }
  }

  const lifetimeMotes: Record<string, number> = {};
  for (const [k, v] of state.resources.lifetimeMotes) lifetimeMotes[k] = v;

  const upgradeLevels: Record<string, number> = {};
  for (const [k, v] of state.progression.upgradeLevels) upgradeLevels[k] = v;

  return {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    equation: {
      segments: state.equation.segments.map(s => ({
        tierId: s.tierId,
        level: s.level,
        isUnlocked: s.isUnlocked,
      })),
      totalTapCount: state.equation.totalTapCount,
      isForgeUnlocked: state.equation.isForgeUnlocked,
    },
    resources: { moteSizeCounts, lifetimeMotes },
    progression: {
      upgradeLevels,
      unlockedTierCount: state.progression.unlockedTierCount,
      autoTapLevel: state.progression.autoTapLevel,
      globalMultiplier: state.progression.globalMultiplier,
    },
    looms: {
      looms: state.looms.looms.map(l => ({
        tierId: l.tierId,
        level: l.level,
        isUnlocked: l.isUnlocked,
        conversionProgress: l.conversionProgress,
        conversionEfficiencyLevel: l.conversionEfficiencyLevel,
      })),
      specialLoomPurchased: Array.from(state.looms.specialPurchased),
    },
    achievements: {
      unlockedIds: Array.from(state.achievements.unlockedIds),
      claimedIds: Array.from(state.achievements.claimedIds),
    },
    aliven: {
      alivenedTierIds: Array.from(state.aliven.alivenedTierIds),
      interactionMatrix: serializeInteractionMatrix(state.aliven.interactionMatrix),
    },
    rpg: {
      highestWaveReached: state.rpg.highestWaveReached,
      purchasedWeaponIds: Array.from(state.rpg.purchasedWeaponIds),
      equippedWeaponIds: Array.from(state.rpg.equippedWeaponIds),
      equippedWeaponSlots: Array.from(state.rpg.equippedWeaponSlots.entries()),
      xp: state.rpg.xp,
      weaponTiersByWeaponId: Object.fromEntries(state.rpg.weaponTiersByWeaponId),
      rpgUpgradeLevels: Object.fromEntries(state.rpg.rpgUpgradeLevels),
      respawnWave: state.rpg.respawnWave,
      bossCompletions: Object.fromEntries(state.rpg.bossCompletions),
      bossSpeedPct: state.rpg.bossSpeedPct,
      xpAllocatedStats: Array.from(state.rpg.xpAllocatedStats),
      xpAllocatedToAtk: state.rpg.xpAllocatedToAtk,
      xpAllocatedToDef: state.rpg.xpAllocatedToDef,
      xpAllocatedToLuck: state.rpg.xpAllocatedToLuck,
      xpAllocatedToHp: state.rpg.xpAllocatedToHp,
      lifetimeKillsByType: Object.fromEntries(state.rpg.lifetimeKillsByType),
      lifetimeEliteKills: state.rpg.lifetimeEliteKills,
      lifetimeAlivenKills: state.rpg.lifetimeAlivenKills,
      lifetimeLuckyMotesCollected: state.rpg.lifetimeLuckyMotesCollected,
      lifetimeLateEnemyKills: state.rpg.lifetimeLateEnemyKills,
      totalRpgSurvivalMs: state.rpg.totalRpgSurvivalMs,
      totalWavesCompleted: state.rpg.totalWavesCompleted,
      bestDamageFreeWaveStreak: state.rpg.bestDamageFreeWaveStreak,
      bossDefeated1Weapon: state.rpg.bossDefeated1Weapon,
      secretAchievementFlags: Array.from(state.rpg.secretAchievementFlags),
      xpReservoir: state.rpg.xpReservoir,
      multiplierBoxes: state.rpg.multiplierBoxes.map(b => ({ level: b.level, progressXp: b.progressXp })),
      sandBladeEnabled: state.rpg.sandBladeEnabled,
      encounteredEnemyTypes: Array.from(state.rpg.encounteredEnemyTypes),
      activeZoneId: state.rpg.activeZoneId,
      activeSubzoneId: state.rpg.activeSubzoneId,
      highestWaveReachedByZone: { ...state.rpg.highestWaveReachedByZone },
      currentWaveByZone: { ...state.rpg.currentWaveByZone },
      playerLevel: state.rpg.playerLevel,
      playerXp: state.rpg.playerXp,
      playerXpToNextLevel: state.rpg.playerXpToNextLevel,
      craftedWeapons: state.rpg.craftedWeapons.map(cw => ({
        id: cw.id,
        name: cw.name,
        description: cw.description,
        dominantTierId: cw.dominantTierId,
        secondaryTierId: cw.secondaryTierId,
        forgeCraftLevel: cw.forgeCraftLevel,
        ingredients: cw.ingredients.map(i => ({ tierId: i.tierId, refinedCount: i.refinedCount })),
        composition: cw.composition.map(c => ({ tierId: c.tierId, weightedValue: c.weightedValue, share: c.share })),
        definition: {
          id: cw.definition.id,
          name: cw.definition.name,
          description: cw.definition.description,
          costTierId: cw.definition.costTierId,
          cost: cw.definition.cost,
          stats: {
            damage: cw.definition.stats.damage,
            cooldownMs: cw.definition.stats.cooldownMs,
            range: cw.definition.stats.range,
            defBonus: cw.definition.stats.defBonus,
            effect: cw.definition.stats.effect,
          },
        },
        attachedLens: cw.attachedLens ? {
          id: cw.attachedLens.id,
          name: cw.attachedLens.name,
          forgeCraftLevel: cw.attachedLens.forgeCraftLevel,
          totalWeightedMoteValue: cw.attachedLens.totalWeightedMoteValue,
          ingredients: cw.attachedLens.ingredients.map(i => ({ tierId: i.tierId, refinedCount: i.refinedCount })),
          effects: cw.attachedLens.effects.map(e => ({
            tierId: e.tierId,
            effectTier: e.effectTier,
            key: e.key,
            name: e.name,
            description: e.description,
            magnitude: e.magnitude,
            quality: e.quality,
            rarity: e.rarity,
            isApplied: e.isApplied,
          })),
        } : undefined,
      })),
      refinedCrystalsByTierId: Object.fromEntries(state.rpg.refinedCrystalsByTierId),
      craftedWeaves: state.rpg.craftedWeaves.map(w => ({
        id: w.id,
        name: w.name,
        forgeCraftLevel: w.forgeCraftLevel,
        totalWeightedMoteValue: w.totalWeightedMoteValue,
        ingredients: w.ingredients.map(i => ({ tierId: i.tierId, refinedCount: i.refinedCount })),
        affixes: w.affixes.map(a => ({
          affixId: a.affixId,
          tierId: a.tierId,
          label: a.label,
          quality: a.quality,
          rarity: a.rarity,
          value: a.value,
          unit: a.unit,
          applied: a.applied,
        })),
        tierEffects: w.tierEffects.map(e => ({
          tierId: e.tierId,
          effectTier: e.effectTier,
          key: e.key,
          name: e.name,
          description: e.description,
          magnitude: e.magnitude,
          quality: e.quality,
          rarity: e.rarity,
          isApplied: e.isApplied,
        })),
      })),
      equippedWeaveSlots: state.rpg.equippedWeaveSlots.slice(),
      craftedLenses: state.rpg.craftedLenses.map(l => ({
        id: l.id,
        name: l.name,
        forgeCraftLevel: l.forgeCraftLevel,
        totalWeightedMoteValue: l.totalWeightedMoteValue,
        ingredients: l.ingredients.map(i => ({ tierId: i.tierId, refinedCount: i.refinedCount })),
        effects: l.effects.map(e => ({
          tierId: e.tierId,
          effectTier: e.effectTier,
          key: e.key,
          name: e.name,
          description: e.description,
          magnitude: e.magnitude,
          quality: e.quality,
          rarity: e.rarity,
          isApplied: e.isApplied,
        })),
      })),
    },
    elapsedMs: state.elapsedMs,
    forge: {
      heatTapCount: state.forge.heatTapCount,
      sacrificeProgressByTierId: Object.fromEntries(state.forge.sacrificeProgressByTierId),
      refinedProgressByTierId: Object.fromEntries(state.forge.refinedProgressByTierId),
      forgeCraftLevel: state.forge.forgeCraftLevel,
      forgeLevel: state.forge.forgeLevel,
    },
    pendingIdleMotes: state.pendingIdleMotes.map(e => ({
      tierId: e.tierId,
      sizeIndex: e.sizeIndex,
      count: e.count,
    })),
  };
}
