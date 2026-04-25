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
}

// ─── Factory ────────────────────────────────────────────────────

export function createAchievementState(): AchievementState {
  return {
    unlockedIds: new Set(),
    claimedIds: new Set(),
    tapMultiplierBonus: 1,
    loomMultiplierBonus: 1,
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

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (!state.claimedIds.has(def.id)) continue;
    if (def.bonusKind === 'tap_multiplier') {
      tapBonus *= def.bonusMultiplier;
    } else {
      loomBonus *= def.bonusMultiplier;
    }
  }

  state.tapMultiplierBonus = tapBonus;
  state.loomMultiplierBonus = loomBonus;
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
