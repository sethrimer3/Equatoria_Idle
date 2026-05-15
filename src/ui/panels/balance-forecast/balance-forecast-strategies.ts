/**
 * balance-forecast-strategies.ts — Milestone definitions and strategy implementations
 * for the balance forecast simulation.
 *
 * Contains:
 *   - MILESTONE_SPECS — ordered list of progression checkpoints to track
 *   - Four strategy functions: wait_only, cheapest_first, best_efficiency, rush_next_tier
 *   - STRATEGY_FNS / STRATEGY_NAMES — lookup maps used by the simulation runner
 */

import { TIERS } from '../../../data/tiers';
import { LOOM_DEFINITIONS } from '../../../data/looms';
import { SPECIAL_LOOM_DEFINITIONS } from '../../../data/looms/special-loom-definitions';
import type { StrategyId } from './balance-forecast-types';
import type { SimState } from './balance-forecast-state';
import type { PurchaseCandidate } from './balance-forecast-purchases';

// ─── Milestone check helpers ──────────────────────────────────────

interface MilestoneSpec {
  id: string;
  displayName: string;
  check: (sim: SimState) => boolean;
  notes?: string;
}

export const MILESTONE_SPECS: MilestoneSpec[] = [
  {
    id: 'forge_unlock',
    displayName: 'Equation Forge Unlocked',
    check: s => s.isForgeUnlocked,
  },
  ...TIERS
    .filter(t => !t.isSecret && t.unlockOrder >= 1)
    .map(t => ({
      id: `tier_unlock_${t.id}`,
      displayName: `${t.displayName} Tier Unlocked`,
      check: (s: SimState) => s.unlockedTierCount > t.unlockOrder,
    })),
  ...LOOM_DEFINITIONS
    .filter(d => d.tierId !== 'sand')
    .map(d => ({
      id: `loom_lv5_${d.tierId}`,
      displayName: `${d.displayName} → Level 5`,
      check: (s: SimState) => (s.looms.get(d.tierId)?.level ?? 0) >= 5,
    })),
  ...SPECIAL_LOOM_DEFINITIONS.slice(0, 5).map(d => ({
    id: `special_loom_${d.tierId}`,
    displayName: d.displayName,
    check: (s: SimState) => s.looms.get(d.tierId)?.specialPurchased ?? false,
  })),
  {
    id: 'sand_100_motes',
    displayName: '100 Sand Motes (lifetime)',
    check: s => (s.lifetimeMotes.get('sand') ?? 0) >= 100,
  },
  {
    id: 'sand_1k_motes',
    displayName: '1,000 Sand Motes (lifetime)',
    check: s => (s.lifetimeMotes.get('sand') ?? 0) >= 1000,
  },
  {
    id: 'quartz_100_motes',
    displayName: '100 Quartz Motes (lifetime)',
    check: s => (s.lifetimeMotes.get('quartz') ?? 0) >= 100,
  },
];

// ─── Strategy implementations ─────────────────────────────────────

type StrategyFn = (sim: SimState, candidates: PurchaseCandidate[]) => PurchaseCandidate | null;

/** Wait Only: never buys anything. */
const strategyWaitOnly: StrategyFn = () => null;

/** Cheapest First: buy the cheapest affordable upgrade. */
const strategyCheapestFirst: StrategyFn = (_sim, candidates) => {
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => a.cost <= b.cost ? a : b);
};

/**
 * Best Efficiency: prioritize production gain per cost.
 * Tier unlocks get a bonus weight since they open new production channels.
 * NOTE: This is an approximation — exact efficiency requires deeper simulation.
 */
const strategyBestEfficiency: StrategyFn = (_sim, candidates) => {
  if (candidates.length === 0) return null;
  let best: PurchaseCandidate | null = null;
  let bestScore = -1;
  for (const c of candidates) {
    // Prioritize forge and tier unlocks with bonus weight
    const tierBonus = (c.id === 'eq_forge' || c.id.startsWith('tier_unlock_')) ? 5 : 1;
    // efficiency = production gain / cost (higher is better); min cost guard
    const score = ((c.productionGainPerSec + 0.001) / Math.max(c.cost, 1)) * tierBonus;
    if (score > bestScore) {
      bestScore = score;
      best = c;
    }
  }
  return best;
};

/**
 * Rush Next Tier: prioritize whatever reduces time to next tier unlock.
 * Focuses on producing the pay-tier motes; ignores other upgrades unless cheap.
 */
const strategyRushNextTier: StrategyFn = (sim, candidates) => {
  if (candidates.length === 0) return null;
  // Prefer forge and tier unlocks first
  const gateCandidate = candidates.find(c =>
    c.id === 'eq_forge' || c.id.startsWith('tier_unlock_'),
  );
  if (gateCandidate) return gateCandidate;

  // Find the pay tier for the next tier unlock
  const nextTierIdx = sim.unlockedTierCount;
  const nextTier = TIERS[nextTierIdx];
  if (!nextTier || nextTier.isSecret) {
    // All tiers unlocked — fall back to efficiency
    return strategyBestEfficiency(sim, candidates);
  }
  const payTierId = TIERS[nextTierIdx - 1]?.id ?? 'sand';

  // Prefer loom upgrades for the pay tier; then special loom for pay tier
  const payTierCandidates = candidates
    .filter(c => c.tierId === payTierId)
    .sort((a, b) => a.cost - b.cost);
  if (payTierCandidates.length > 0) return payTierCandidates[0];

  // Fallback: cheapest overall
  return strategyCheapestFirst(sim, candidates);
};

export const STRATEGY_FNS: Record<StrategyId, StrategyFn> = {
  wait_only: strategyWaitOnly,
  cheapest_first: strategyCheapestFirst,
  best_efficiency: strategyBestEfficiency,
  rush_next_tier: strategyRushNextTier,
};

export const STRATEGY_NAMES: Record<StrategyId, string> = {
  wait_only: 'Wait Only',
  cheapest_first: 'Cheapest First',
  best_efficiency: 'Best Efficiency',
  rush_next_tier: 'Rush Next Tier',
};
