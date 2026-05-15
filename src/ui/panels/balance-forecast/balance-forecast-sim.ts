/**
 * balance-forecast-sim.ts — Strategy simulation runner for the balance forecast.
 *
 * Contains:
 *   - runStrategySimulation — runs a full strategy simulation and returns StrategyResult
 *   - getTimeToNextPurchase — adaptive time-step helper for the simulation loop
 *
 * Re-exports SimState, createFreshSimState, simStateFromGame, getLoomRateSim,
 * getTotalProductionRateSim, simTick, and simCheckAchievements from
 * balance-forecast-state.ts for backward compatibility with balance-forecast-engine.ts.
 *
 * IMPORTANT: This module never mutates real game state.
 */

import { TIERS } from '../../../data/tiers';
import { LOOM_BY_TIER, loomUpgradeCost } from '../../../data/looms';
import {
  EQUATION_FORGE_COST,
  tierUnlockCost,
} from '../../../data/balance';

import type { StrategyResult, StrategyId } from './balance-forecast-types';
import {
  type SimState,
  cloneSimState,
  getTotalProductionRateSim,
  simTick,
  simCheckAchievements,
} from './balance-forecast-state';
import {
  getAllAffordablePurchases,
  applyPurchase,
} from './balance-forecast-purchases';
import {
  MILESTONE_SPECS,
  STRATEGY_FNS,
  STRATEGY_NAMES,
} from './balance-forecast-strategies';

// Re-export state primitives so balance-forecast-engine.ts can import them from one place.
export type { SimState } from './balance-forecast-state';
export {
  createFreshSimState,
  simStateFromGame,
  getLoomRateSim,
  getTotalProductionRateSim,
  simTick,
  simCheckAchievements,
} from './balance-forecast-state';

// ─── Simulation runner ────────────────────────────────────────────

const MAX_ITERATIONS = 500_000;

/** Number of consecutive no-progress iterations before declaring the simulation stuck. */
const MAX_NO_PROGRESS_ITERATIONS = 100;

/**
 * Simulate progression using a given strategy.
 * Returns a list of milestones with the time they were reached.
 */
export function runStrategySimulation(
  initialState: SimState,
  strategyId: StrategyId,
  maxSimSeconds: number,
): StrategyResult {
  const sim = cloneSimState(initialState);
  const milestones: import('./balance-forecast-types').Milestone[] = [];
  const reachedMilestones = new Set<string>();
  const strategyFn = STRATEGY_FNS[strategyId];

  let iterations = 0;
  let wasStuck = false;
  let noProgressIter = 0;

  while (sim.timeSeconds < maxSimSeconds && iterations < MAX_ITERATIONS) {
    iterations++;

    // Check milestones
    for (const spec of MILESTONE_SPECS) {
      if (!reachedMilestones.has(spec.id) && spec.check(sim)) {
        reachedMilestones.add(spec.id);
        milestones.push({
          id: spec.id,
          displayName: spec.displayName,
          reachedAtSeconds: sim.timeSeconds,
          notes: spec.notes,
        });
      }
    }

    // Let strategy choose a purchase
    const candidates = getAllAffordablePurchases(sim);
    const chosen = strategyFn(sim, candidates);

    if (chosen) {
      applyPurchase(sim, chosen);
      simCheckAchievements(sim);
      noProgressIter = 0;
      continue;
    }

    // Determine adaptive time step: advance to the next affordable purchase
    const nextEta = getTimeToNextPurchase(sim, maxSimSeconds - sim.timeSeconds);

    if (nextEta <= 0) {
      // No production at all — stuck
      noProgressIter++;
      if (noProgressIter > MAX_NO_PROGRESS_ITERATIONS) {
        wasStuck = true;
        break;
      }
      simTick(sim, 1); // small step to avoid infinite loop
      continue;
    }

    noProgressIter = 0;
    // Clamp step to max remaining time
    const step = Math.min(nextEta, maxSimSeconds - sim.timeSeconds);
    simTick(sim, step);
    simCheckAchievements(sim);
  }

  if (iterations >= MAX_ITERATIONS) wasStuck = true;

  return {
    strategyId,
    strategyName: STRATEGY_NAMES[strategyId],
    milestones,
    totalSimulatedSeconds: sim.timeSeconds,
    wasStuck,
  };
}

/**
 * Calculate the time (seconds) until any purchase becomes affordable given
 * current production rates. Returns 0 if something is already affordable,
 * or a small positive if no production exists (to avoid infinite loops).
 */
function getTimeToNextPurchase(sim: SimState, maxSeconds: number): number {
  let minEta = maxSeconds;
  let hasProduction = false;

  // Equation forge
  if (!sim.isForgeUnlocked) {
    const sandRate = getTotalProductionRateSim(sim, 'sand');
    if (sandRate > 0) {
      hasProduction = true;
      const remaining = Math.max(0, EQUATION_FORGE_COST - (sim.motes.get('sand') ?? 0));
      if (remaining > 0) minEta = Math.min(minEta, remaining / sandRate);
      else return 0;
    }
  }

  // Tier unlock
  if (sim.unlockedTierCount < TIERS.length) {
    const nextTier = TIERS[sim.unlockedTierCount];
    if (nextTier && !nextTier.isSecret) {
      const payTierId = TIERS[sim.unlockedTierCount - 1]?.id ?? 'sand';
      const rate = getTotalProductionRateSim(sim, payTierId);
      if (rate > 0) {
        hasProduction = true;
        const cost = tierUnlockCost(sim.unlockedTierCount);
        const remaining = Math.max(0, cost - (sim.motes.get(payTierId) ?? 0));
        if (remaining > 0) minEta = Math.min(minEta, remaining / rate);
        else return 0;
      }
    }
  }

  // Loom upgrades
  for (const t of TIERS) {
    const loom = sim.looms.get(t.id);
    if (!loom || !loom.isUnlocked) continue;
    const def = LOOM_BY_TIER.get(t.id);
    if (!def) continue;
    const rate = getTotalProductionRateSim(sim, t.id);
    if (rate > 0) {
      hasProduction = true;
      const cost = loomUpgradeCost(def, loom.level);
      const remaining = Math.max(0, cost - (sim.motes.get(t.id) ?? 0));
      if (remaining > 0) minEta = Math.min(minEta, remaining / rate);
      else return 0;
    }
  }

  return hasProduction ? minEta : 0;
}
