/**
 * apply-idle-rewards.ts — Commits idle reward gains to the live game state.
 *
 * Kept separate from calculateIdleRewards() so the pure calculation can
 * be tested or displayed without side effects.
 *
 * Idle motes are added as size-0 with cascade merging so that the
 * per-size distribution stored on the next save reflects true merged
 * state (e.g. 100 size-0 → 1 size-1).  The float total is preserved
 * (merging is value-neutral) and lifetimeMotes is updated normally.
 */

import type { TierId } from '../../data/tiers';
import type { GameState } from '../game-state';
import { totalToSizeCounts, sizeCountsToTotal } from '../resources';
import type { IdleRewardSummary } from './idle-reward';

// ─── Mutation ────────────────────────────────────────────────────

/**
 * Apply the computed idle rewards to the real game state.
 * Must be called after calculateIdleRewards() and before showing the overlay.
 *
 * Integer motes are deposited at size-0 and cascade-merged upward so
 * that the next save encodes the compacted per-size distribution.
 * Fractional motes (<1) are added to the running float total directly
 * and will round off in future saves (negligible in practice).
 */
export function applyIdleRewards(game: GameState, summary: IdleRewardSummary): void {
  for (const reward of summary.tierRewards) {
    if (reward.totalMotes <= 0) continue;

    const tierId = reward.tierId as TierId;
    const currentTotal = game.resources.moteTotals.get(tierId) ?? 0;
    const fracPart = currentTotal - Math.floor(currentTotal);

    // Decode current integer total to size counts, add new motes at size-0,
    // cascade merges (100 at size N → 1 at size N+1), re-encode to total.
    const floorNew = Math.floor(reward.totalMotes);
    const fracNew  = reward.totalMotes - floorNew;

    const sizeCounts = totalToSizeCounts(currentTotal);
    if (floorNew > 0) {
      sizeCounts.set(0, (sizeCounts.get(0) ?? 0) + floorNew);
      // Cascade merges — 20 size levels covers up to 100^20 motes
      for (let s = 0; s < 20; s++) {
        const count = sizeCounts.get(s) ?? 0;
        if (count < 100) continue;
        const promotes = Math.floor(count / 100);
        const remainder = count % 100;
        if (remainder === 0) {
          sizeCounts.delete(s);
        } else {
          sizeCounts.set(s, remainder);
        }
        sizeCounts.set(s + 1, (sizeCounts.get(s + 1) ?? 0) + promotes);
      }
    }

    const newTotal = sizeCountsToTotal(sizeCounts) + fracPart + fracNew;
    game.resources.moteTotals.set(tierId, newTotal);

    const lifetime = game.resources.lifetimeMotes.get(tierId) ?? 0;
    game.resources.lifetimeMotes.set(tierId, lifetime + reward.totalMotes);
  }
}
