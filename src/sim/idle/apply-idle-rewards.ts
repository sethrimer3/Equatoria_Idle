/**
 * apply-idle-rewards.ts — Commits idle reward gains to the live game state.
 *
 * Kept separate from calculateIdleRewards() so the pure calculation can
 * be tested or displayed without side effects.
 */

import type { GameState } from '../game-state';
import { addMotes } from '../resources';
import type { IdleRewardSummary } from './idle-reward';

// ─── Mutation ────────────────────────────────────────────────────

/**
 * Apply the computed idle rewards to the real game state.
 * Must be called after calculateIdleRewards() and before showing the overlay.
 */
export function applyIdleRewards(game: GameState, summary: IdleRewardSummary): void {
  for (const reward of summary.tierRewards) {
    if (reward.totalMotes > 0) {
      addMotes(game.resources, reward.tierId, reward.totalMotes);
    }
  }
}
