import type { GameState } from '../sim';
import type { IdleOverlay } from '../ui/idle/idle-overlay';
import { calculateIdleRewards } from '../sim/idle/idle-reward';
import { queueIdleRewards } from '../sim/idle/apply-idle-rewards';

const MIN_IDLE_REWARD_ELAPSED_MS = 60_000;

export function applyIdleRewardsIfEligible(
  game: GameState,
  elapsedMs: number,
  idleOverlay: IdleOverlay,
): void {
  if (elapsedMs <= MIN_IDLE_REWARD_ELAPSED_MS) return;
  const summary = calculateIdleRewards(game, elapsedMs);
  if (!summary.tierRewards.some((reward) => reward.totalMotes > 0)) return;
  queueIdleRewards(game, summary);
  idleOverlay.show(summary);
}
