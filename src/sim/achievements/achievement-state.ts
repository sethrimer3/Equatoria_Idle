/**
 * Achievement simulation state.
 * Tracks which achievements the player has unlocked, and the resulting bonuses.
 */

import { ACHIEVEMENT_DEFINITIONS } from '../../data/achievements';
import type { AchievementCondition } from '../../data/achievements/achievement-definitions';
import type { ResourceState } from '../resources';
import { getLifetimeMotes } from '../resources';
import type { EquationState } from '../equation';
import type { RpgSimState } from '../rpg';
import { MAX_WEAPON_TIER } from '../rpg/rpg-state';

// ─── Types ──────────────────────────────────────────────────────

export interface AchievementState {
  /** Set of unlocked achievement IDs. */
  unlockedIds: Set<string>;
  /** Set of claimed achievement IDs (bonuses only apply when claimed). */
  claimedIds: Set<string>;
  /** Cumulative tap multiplier bonus from achievements (≥ 1). */
  tapMultiplierBonus: number;
  /** Cumulative loom production multiplier bonus from achievements (≥ 1). */
  loomMultiplierBonus: number;
  /** Cumulative flat base ATK bonus from claimed base_atk achievements (≥ 0). */
  baseAtkBonus: number;
}

// ─── Factory ────────────────────────────────────────────────────

export function createAchievementState(): AchievementState {
  return {
    unlockedIds: new Set(),
    claimedIds: new Set(),
    tapMultiplierBonus: 1,
    loomMultiplierBonus: 1,
    baseAtkBonus: 0,
  };
}

// ─── Condition evaluator ─────────────────────────────────────────

/**
 * Returns true if the given condition is satisfied by the current game state.
 */
function isConditionMet(
  condition: AchievementCondition,
  resources: ResourceState,
  equation: EquationState,
  rpg: RpgSimState,
): boolean {
  switch (condition.kind) {
    case 'lifetime_motes':
      return getLifetimeMotes(resources, condition.tierId) >= condition.amount;

    case 'forge_unlocked':
      return equation.isForgeUnlocked;

    case 'tap_count':
      return equation.totalTapCount >= condition.count;

    case 'equation_tiers': {
      const unlockedCount = equation.segments.filter(s => s.isUnlocked).length;
      return unlockedCount >= condition.count;
    }

    case 'wave_reached':
      return rpg.highestWaveReached >= condition.wave;

    case 'weapon_purchased':
      return rpg.purchasedWeaponIds.has(condition.weaponId);

    case 'any_weapon_max_tier': {
      for (const tier of rpg.weaponTiersByWeaponId.values()) {
        if (tier >= MAX_WEAPON_TIER) return true;
      }
      return false;
    }

    case 'xp_reached':
      return rpg.xp >= condition.xp;

    case 'boss_defeated':
      // Bosses occur at every multiple of 100 waves; reaching wave N×100 means N bosses beaten.
      return Math.floor(rpg.highestWaveReached / 100) >= condition.count;

    case 'specific_boss_defeated':
      return (rpg.bossCompletions.get(condition.bossId) ?? 0) > 0;

    case 'specific_boss_at_speed': {
      const best = rpg.bossCompletions.get(condition.bossId) ?? 0;
      return best >= condition.minSpeedPct;
    }

    case 'any_boss_at_speed': {
      for (const speedPct of rpg.bossCompletions.values()) {
        if (speedPct >= condition.minSpeedPct) return true;
      }
      return false;
    }

    case 'all_bosses_at_speed': {
      if (rpg.bossCompletions.size === 0) return false;
      for (const speedPct of rpg.bossCompletions.values()) {
        if (speedPct < condition.minSpeedPct) return false;
      }
      return true;
    }

    case 'specific_weapon_max_tier':
      return (rpg.weaponTiersByWeaponId.get(condition.weaponId) ?? 0) >= MAX_WEAPON_TIER;

    case 'weapons_at_max_tier': {
      let n = 0;
      for (const tier of rpg.weaponTiersByWeaponId.values()) {
        if (tier >= MAX_WEAPON_TIER) n++;
      }
      return n >= condition.count;
    }

    case 'all_purchased_max_tier': {
      if (rpg.purchasedWeaponIds.size === 0) return false;
      for (const weaponId of rpg.purchasedWeaponIds) {
        if ((rpg.weaponTiersByWeaponId.get(weaponId) ?? 0) < MAX_WEAPON_TIER) return false;
      }
      return true;
    }

    case 'weapons_purchased_count':
      return rpg.purchasedWeaponIds.size >= condition.count;

    case 'equip_weapons_count':
      return rpg.equippedWeaponIds.size >= condition.count;

    case 'rpg_upgrade_level':
      return (rpg.rpgUpgradeLevels.get(condition.upgradeId) ?? 0) >= condition.level;

    case 'rpg_upgrade_any_max': {
      for (const level of rpg.rpgUpgradeLevels.values()) {
        if (level >= condition.maxLevel) return true;
      }
      return false;
    }

    case 'xp_allocated_stat':
      return rpg.xpAllocatedStats.includes(condition.stat);

    case 'xp_allocated_stats_count':
      return rpg.xpAllocatedStats.length >= condition.count;

    case 'xp_to_stat': {
      const map: Record<'atk' | 'def' | 'luck' | 'hp', number> = {
        atk:  rpg.xpAllocatedToAtk,
        def:  rpg.xpAllocatedToDef,
        luck: rpg.xpAllocatedToLuck,
        hp:   rpg.xpAllocatedToHp,
      };
      return map[condition.stat] >= condition.amount;
    }

    case 'total_kills': {
      let total = 0;
      for (const count of rpg.lifetimeKillsByType.values()) total += count;
      return total >= condition.count;
    }

    case 'kills_of_type':
      return (rpg.lifetimeKillsByType.get(condition.typeId) ?? 0) >= condition.count;

    case 'elite_kills_total':
      return rpg.lifetimeEliteKills >= condition.count;

    case 'aliven_kills_total':
      return rpg.lifetimeAlivenKills >= condition.count;

    case 'late_enemy_kills_total':
      return rpg.lifetimeLateEnemyKills >= condition.count;

    case 'lucky_motes_total':
      return rpg.lifetimeLuckyMotesCollected >= condition.count;

    case 'survival_minutes':
      return rpg.totalRpgSurvivalMs >= condition.minutes * 60 * 1000;

    case 'wave_streak':
      return rpg.consecutiveWaveStreak >= condition.count;

    case 'damage_free_streak':
      return rpg.bestDamageFreeWaveStreak >= condition.count;

    case 'waves_completed':
      return rpg.totalWavesCompleted >= condition.count;

    case 'boss_defeated_any_speed_1weapon':
      return rpg.bossDefeated1Weapon;
  }
}

// ─── Mutations ──────────────────────────────────────────────────

/**
 * Check all achievement unlock conditions against current game state.
 * Unlocks any newly-met achievements and updates the bonus cache.
 * Returns an array of newly unlocked achievement IDs (empty if none).
 */
export function checkAndUnlockAchievements(
  state: AchievementState,
  resources: ResourceState,
  equation: EquationState,
  rpg: RpgSimState,
): string[] {
  const newlyUnlocked: string[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (state.unlockedIds.has(def.id)) continue;

    if (isConditionMet(def.condition, resources, equation, rpg)) {
      state.unlockedIds.add(def.id);
      newlyUnlocked.push(def.id);
    }
  }

  if (newlyUnlocked.length > 0) {
    recomputeBonuses(state);
  }

  return newlyUnlocked;
}

/**
 * Recompute the cached bonus multipliers from the current set of *claimed* achievements.
 * Unlocked but unclaimed achievements grant no bonus until the player claims them.
 */
export function recomputeBonuses(state: AchievementState): void {
  let tapBonus = 1;
  let loomBonus = 1;
  let atkBonus = 0;

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (!state.claimedIds.has(def.id)) continue;
    if (def.bonusKind === 'tap_multiplier') {
      tapBonus *= def.bonusMultiplier;
    } else if (def.bonusKind === 'loom_multiplier') {
      loomBonus *= def.bonusMultiplier;
    } else if (def.bonusKind === 'base_atk') {
      atkBonus += def.bonusMultiplier;
    }
  }

  state.tapMultiplierBonus = tapBonus;
  state.loomMultiplierBonus = loomBonus;
  state.baseAtkBonus = atkBonus;
}

/**
 * Claim a specific achievement by id.
 * Adds it to claimedIds and recomputes bonuses.
 * Returns true if newly claimed, false if already claimed or not yet unlocked.
 */
export function claimAchievement(state: AchievementState, id: string): boolean {
  if (!state.unlockedIds.has(id)) return false;
  if (state.claimedIds.has(id)) return false;
  state.claimedIds.add(id);
  recomputeBonuses(state);
  return true;
}
