/**
 * Achievement simulation state.
 * Tracks which achievements the player has unlocked, and the resulting bonuses.
 */

import { ACHIEVEMENT_DEFINITIONS } from '../../data/achievements';
import type { ResourceState } from '../resources';
import { getLifetimeMotes } from '../resources';

// ─── Types ──────────────────────────────────────────────────────

export interface AchievementState {
  /** Set of unlocked achievement IDs. */
  unlockedIds: Set<string>;
  /** Cumulative tap multiplier bonus from achievements (≥ 1). */
  tapMultiplierBonus: number;
  /** Cumulative loom production multiplier bonus from achievements (≥ 1). */
  loomMultiplierBonus: number;
}

// ─── Factory ────────────────────────────────────────────────────

export function createAchievementState(): AchievementState {
  return {
    unlockedIds: new Set(),
    tapMultiplierBonus: 1,
    loomMultiplierBonus: 1,
  };
}

// ─── Mutations ──────────────────────────────────────────────────

/**
 * Check all achievement unlock conditions against current resource state.
 * Unlocks any newly-met achievements and updates the bonus cache.
 * Returns true if any new achievements were unlocked this call.
 */
export function checkAndUnlockAchievements(
  state: AchievementState,
  resources: ResourceState,
): boolean {
  let anyNew = false;

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (state.unlockedIds.has(def.id)) continue;

    const lifetimeAmount = getLifetimeMotes(resources, def.requiresTierId);
    if (lifetimeAmount >= def.requiresLifetimeMotes) {
      state.unlockedIds.add(def.id);
      anyNew = true;
    }
  }

  if (anyNew) {
    recomputeBonuses(state);
  }

  return anyNew;
}

/**
 * Recompute the cached bonus multipliers from the current set of unlocked achievements.
 */
export function recomputeBonuses(state: AchievementState): void {
  let tapBonus = 1;
  let loomBonus = 1;

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (!state.unlockedIds.has(def.id)) continue;
    if (def.bonusKind === 'tap_multiplier') {
      tapBonus *= def.bonusMultiplier;
    } else {
      loomBonus *= def.bonusMultiplier;
    }
  }

  state.tapMultiplierBonus = tapBonus;
  state.loomMultiplierBonus = loomBonus;
}
