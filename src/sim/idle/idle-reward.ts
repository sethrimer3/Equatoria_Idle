/**
 * idle-reward.ts — Pure calculation of rewards earned while idle.
 *
 * This module is sim-layer only: no DOM, no rendering, no mutation.
 * Call calculateIdleRewards() to get a summary, then pass it to
 * queueIdleRewards() (in apply-idle-rewards.ts) to commit the gains.
 */

import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';
import type { GameState } from '../game-state';
import { getLoom, getLoomRate } from '../looms';
import {
  createResourceState,
  addMotes,
  getEquivalence,
} from '../resources';

// ─── Types ──────────────────────────────────────────────────────

export interface IdleTierReward {
  tierId: TierId;
  displayName: string;
  color: string;         // tier color for the glyph dot
  ratePerMinute: number; // motes/min this loom produces
  totalMotes: number;    // ratePerMinute * minutesAway (i.e. rate/sec * seconds)
  isUnlocked: boolean;
}

export interface IdleRewardSummary {
  minutesAway: number;
  equivalenceBefore: number;
  equivalenceAfter: number;
  equivalenceGained: number;
  tierRewards: IdleTierReward[];
}

// ─── Calculation ─────────────────────────────────────────────────

/**
 * Compute idle rewards without touching the DOM or mutating live state.
 * @param game       The current (live) game state — read only.
 * @param elapsedMs  Milliseconds the player was away.
 */
export function calculateIdleRewards(
  game: GameState,
  elapsedMs: number,
): IdleRewardSummary {
  const minutesAway = elapsedMs / 60_000;
  const loomBonus = game.achievements.loomMultiplierBonus;

  const tierRewards: IdleTierReward[] = TIERS.map((tier) => {
    const loom = getLoom(game.looms, tier.id);
    const isUnlocked = (loom?.isUnlocked ?? false) && (loom?.level ?? 0) > 0;

    let ratePerMinute = 0;
    let totalMotes = 0;

    if (isUnlocked && loom) {
      const ratePerSec = getLoomRate(tier.id, loom.level) * loomBonus;
      ratePerMinute = ratePerSec * 60;
      totalMotes = ratePerSec * (elapsedMs / 1000);
    }

    return {
      tierId: tier.id,
      displayName: tier.displayName,
      color: tier.color,
      ratePerMinute,
      totalMotes,
      isUnlocked,
    };
  });

  // Compute equivalence on a copy of the resources to avoid mutating live state
  const equivalenceBefore = getEquivalence(game.resources);

  const simulatedResources = createResourceState();
  for (const [k, v] of game.resources.moteTotals) {
    simulatedResources.moteTotals.set(k, v);
  }
  for (const [k, v] of game.resources.lifetimeMotes) {
    simulatedResources.lifetimeMotes.set(k, v);
  }

  for (const reward of tierRewards) {
    if (reward.totalMotes > 0) {
      addMotes(simulatedResources, reward.tierId, reward.totalMotes);
    }
  }

  const equivalenceAfter = getEquivalence(simulatedResources);
  const equivalenceGained = Math.max(0, equivalenceAfter - equivalenceBefore);

  return {
    minutesAway,
    equivalenceBefore,
    equivalenceAfter,
    equivalenceGained,
    tierRewards,
  };
}
