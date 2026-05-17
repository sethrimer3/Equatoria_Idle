/**
 * Achievement simulation state.
 * Tracks which achievements the player has unlocked, and the resulting bonuses.
 */

import { ACHIEVEMENT_DEFINITIONS } from '../../data/achievements';
import type { ResourceState } from '../resources';
import type { EquationState } from '../equation';
import type { RpgSimState } from '../rpg';
import type { AlivenState } from '../aliven';
import { isConditionMet } from './achievement-conditions';

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

// ─── Mutations ──────────────────────────────────────────────────

/**
 * Check all achievement unlock conditions against current game state.
 * Unlocks any newly-met achievements and updates the bonus cache.
 * Returns an array of newly unlocked achievement IDs (empty if none).
 *
 * @param globalTapMultiplier - Combined tap multiplier (progression.globalMultiplier ×
 *   achievements.tapMultiplierBonus). Used for equation_tap_gain_total conditions.
 */
export function checkAndUnlockAchievements(
  state: AchievementState,
  resources: ResourceState,
  equation: EquationState,
  rpg: RpgSimState,
  aliven: AlivenState,
  globalTapMultiplier = 1,
): string[] {
  const newlyUnlocked: string[] = [];

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (state.unlockedIds.has(def.id)) continue;

    if (isConditionMet(def.condition, resources, equation, rpg, aliven, globalTapMultiplier)) {
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

/**
 * Claim every unlocked but unclaimed achievement in one batch.
 * Recomputes bonuses exactly once at the end if anything changed.
 * Returns the list of newly-claimed achievement IDs.
 */
export function claimAllUnlockedAchievements(state: AchievementState): string[] {
  const claimed: string[] = [];
  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (state.unlockedIds.has(def.id) && !state.claimedIds.has(def.id)) {
      state.claimedIds.add(def.id);
      claimed.push(def.id);
    }
  }
  if (claimed.length > 0) recomputeBonuses(state);
  return claimed;
}

/**
 * Returns the number of achievements that are unlocked but not yet claimed.
 */
export function getClaimableCount(state: AchievementState): number {
  let count = 0;
  for (const id of state.unlockedIds) {
    if (!state.claimedIds.has(id)) count++;
  }
  return count;
}

