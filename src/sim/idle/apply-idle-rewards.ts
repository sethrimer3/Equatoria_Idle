/**
 * apply-idle-rewards.ts — Queues idle reward gains for frame-by-frame drip-addition.
 *
 * Kept separate from calculateIdleRewards() so the pure calculation can
 * be tested or displayed without side effects.
 *
 * Idle motes are decomposed into size counts (base-MERGE_THRESHOLD) and
 * enqueued as PendingMoteEntry items ordered lowest-tier-first,
 * largest-size-first within each tier.  simTick() drains one entry per
 * frame, adding motes one "visual mote" at a time so the player sees
 * the gains trickle in rather than appearing all at once.
 *
 * Call queueIdleRewards() after calculateIdleRewards() to commit the gains.
 */

import { TIERS } from '../../data/tiers';
import type { GameState } from '../game-state';
import { totalToSizeCounts } from '../resources';
import type { IdleRewardSummary } from './idle-reward';

// ─── Queue builder ───────────────────────────────────────────────

/**
 * Decompose idle rewards into size-based entries and append them to
 * game.pendingIdleMotes.  Entries are ordered:
 *   - Tiers from lowest unlockOrder to highest
 *   - Within each tier: largest sizeIndex first down to 0
 *
 * Each PendingMoteEntry.count decremented by 1 per simTick frame
 * results in `MERGE_THRESHOLD^sizeIndex` motes being added to resources.
 *
 * Does NOT apply motes directly — simTick() does that incrementally.
 */
export function queueIdleRewards(game: GameState, summary: IdleRewardSummary): void {
  // TIERS is already ordered by unlockOrder (lowest first).
  for (const tier of TIERS) {
    const reward = summary.tierRewards.find(r => r.tierId === tier.id);
    if (!reward || reward.totalMotes <= 0) continue;

    const floorMotes = Math.floor(reward.totalMotes);

    if (floorMotes > 0) {
      const sizeCounts = totalToSizeCounts(floorMotes);
      // Collect sizes in descending order (largest first).
      const sizes = Array.from(sizeCounts.keys()).sort((a, b) => b - a);
      for (const sizeIndex of sizes) {
        const count = sizeCounts.get(sizeIndex) ?? 0;
        if (count > 0) {
          game.pendingIdleMotes.push({ tierId: tier.id, sizeIndex, count });
        }
      }
    }

    // Preserve fractional motes (<1) by applying them directly now.
    // The fraction is imperceptible to the player but avoids rounding loss.
    const fracPart = reward.totalMotes - floorMotes;
    if (fracPart > 0) {
      const current = game.resources.moteTotals.get(tier.id) ?? 0;
      game.resources.moteTotals.set(tier.id, current + fracPart);
      game.resources.lifetimeMotes.set(
        tier.id,
        (game.resources.lifetimeMotes.get(tier.id) ?? 0) + fracPart,
      );
    }
  }
}
