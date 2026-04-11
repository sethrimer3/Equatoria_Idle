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

// ─── Mutations ──────────────────────────────────────────────────

/**
 * Check all achievement unlock conditions against current resource state.
 * Unlocks any newly-met achievements and updates the bonus cache.
 * Returns an array of newly unlocked achievement IDs (empty if none).
 */
export function checkAndUnlockAchievements(
  state: AchievementState,
  resources: ResourceState,
): string[] {
  const newlyUnlocked: string[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (state.unlockedIds.has(def.id)) continue;

    const lifetimeAmount = getLifetimeMotes(resources, def.requiresTierId);
    if (lifetimeAmount >= def.requiresLifetimeMotes) {
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
