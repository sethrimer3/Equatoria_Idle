/**
 * balance-forecast-engine.ts — Core balance analysis and simulation engine.
 *
 * Provides runBalanceForecast() which orchestrates:
 *  1. Static ETA analysis for the current player state
 *  2. Fresh-run milestone timeline simulation
 *  3. Strategy-based progression simulation
 *  4. Pacing warning generation
 *
 * Target computation is in balance-forecast-targets.ts.
 * Pacing warning logic is in balance-forecast-warnings.ts.
 *
 * IMPORTANT: This module never mutates real game state.
 * All simulations operate on deep-cloned lightweight sim models.
 */

import type { GameState } from '../../../sim';

import type {
  ForecastResult,
  EtaStatus,
  StrategyId,
  StrategyResult,
} from './balance-forecast-types';

import {
  createFreshSimState,
  simStateFromGame,
  runStrategySimulation,
} from './balance-forecast-sim';

import { getAllForecastTargets } from './balance-forecast-targets';
import { generatePacingWarnings } from './balance-forecast-warnings';


// ─── Public API ───────────────────────────────────────────────────

export interface ForecastOptions {
  /** Maximum simulated time for strategy runs, in seconds. Default: 8 hours. */
  maxSimSeconds?: number;
  /**
   * When true, strategy simulations start from the player's current
   * resource/unlock state rather than a fresh run.  The static ETA analysis
   * always uses current state regardless of this flag.
   */
  simulateFromCurrentState?: boolean;
}

/**
 * Run a full balance forecast from the given game state.
 * Does NOT mutate the game state.
 */
export function runBalanceForecast(
  game: GameState,
  options: ForecastOptions = {},
): ForecastResult {
  const maxSimSeconds = options.maxSimSeconds ?? 8 * 3600;
  const fromCurrentState = options.simulateFromCurrentState ?? false;

  // Static ETA from current game state
  const currentSim = simStateFromGame(game);
  const staticTargets = getAllForecastTargets(currentSim);

  // Sort: available first, then reachable by ETA, then blocked/unavailable/maxed
  staticTargets.sort((a, b) => {
    const order = (s: EtaStatus) => s === 'available' ? 0 : s === 'reachable' ? 1 : s === 'maxed' ? 2 : 3;
    if (order(a.overallStatus) !== order(b.overallStatus)) {
      return order(a.overallStatus) - order(b.overallStatus);
    }
    return a.overallEtaSeconds - b.overallEtaSeconds;
  });

  // Next meaningful targets: first 8 reachable/available, sorted by ETA
  const nextMeaningfulTargets = staticTargets
    .filter(t => t.overallStatus === 'available' || t.overallStatus === 'reachable')
    .slice(0, 8);

  // Fresh-run simulation (wait-only for baseline milestones)
  const freshSim = createFreshSimState();
  const freshRunResult = runStrategySimulation(freshSim, 'cheapest_first', maxSimSeconds);
  const freshRunMilestones = freshRunResult.milestones;

  // Strategy simulations — start from current state if requested, else fresh.
  const strategyIds: StrategyId[] = ['wait_only', 'cheapest_first', 'best_efficiency', 'rush_next_tier'];
  const strategyResults: StrategyResult[] = strategyIds.map(id =>
    runStrategySimulation(fromCurrentState ? simStateFromGame(game) : createFreshSimState(), id, maxSimSeconds),
  );

  // Pacing warnings
  const pacingWarnings = generatePacingWarnings(staticTargets, strategyResults);

  return {
    staticTargets,
    nextMeaningfulTargets,
    pacingWarnings,
    freshRunMilestones,
    strategyResults,
    generatedAtMs: Date.now(),
  };
}
