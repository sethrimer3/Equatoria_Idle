import type { GameState } from '../sim';
import type { IdleOverlay } from '../ui/idle/idle-overlay';
import { calculateIdleRewards } from '../sim/idle/idle-reward';
import { queueIdleRewards } from '../sim/idle/apply-idle-rewards';

const MIN_IDLE_REWARD_ELAPSED_MS = 60_000;

/**
 * Calculates and queues idle rewards for the given elapsed time.
 *
 * @param skipPopup  When true, rewards are applied silently — the count-up
 *                   overlay is not shown.  Use when the "Skip idle pop up at
 *                   start" setting is enabled.  Rewards are never lost.
 */
export function applyIdleRewardsIfEligible(
  game: GameState,
  elapsedMs: number,
  idleOverlay: IdleOverlay,
  skipPopup = false,
): void {
  if (elapsedMs <= MIN_IDLE_REWARD_ELAPSED_MS) return;
  const summary = calculateIdleRewards(game, elapsedMs);
  if (!summary.tierRewards.some((reward) => reward.totalMotes > 0)) return;
  queueIdleRewards(game, summary);
  if (!skipPopup) {
    idleOverlay.show(summary);
  }
}
