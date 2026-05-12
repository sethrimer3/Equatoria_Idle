/**
 * balance-forecast-types.ts — Shared types for the Balance Forecast dev panel.
 *
 * These types describe the inputs and outputs of the static ETA analysis,
 * fresh-run simulation, and strategy-based simulation.
 * No game state is mutated here — all types are data-only.
 */

import type { TierId } from '../../../data/tiers';

// ─── Duration formatting ─────────────────────────────────────────

/**
 * Format a duration in seconds into a compact human-readable string.
 * Uses the largest meaningful unit: s, m, h, d, w, y.
 *
 * Examples:
 *   0.6  → "0.6s"
 *   12   → "12s"
 *   4.5m → "4.5m"
 *   2.1h → "2.1h"
 *   1.5d → "1.5d"
 *   3.2w → "3.2w"
 *   1.1y → "1.1y"
 */
export function formatDuration(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '??';
  if (seconds === 0) return '0s';
  const MINUTE = 60;
  const HOUR   = 3600;
  const DAY    = 86400;
  const WEEK   = 604800;
  const YEAR   = 31536000;

  if (seconds < MINUTE)  return `${+seconds.toFixed(1)}s`;
  if (seconds < HOUR)    return `${+(seconds / MINUTE).toFixed(1)}m`;
  if (seconds < DAY)     return `${+(seconds / HOUR).toFixed(1)}h`;
  if (seconds < WEEK)    return `${+(seconds / DAY).toFixed(1)}d`;
  if (seconds < YEAR)    return `${+(seconds / WEEK).toFixed(1)}w`;
  return `${+(seconds / YEAR).toFixed(1)}y`;
}

// ─── ETA result status ────────────────────────────────────────────

export type EtaStatus =
  | 'available'   // already affordable / already reached
  | 'reachable'   // positive ETA
  | 'blocked'     // no production source
  | 'unavailable' // prerequisite not met (e.g. tier not unlocked)
  | 'maxed';      // already purchased / already unlocked

// ─── Single requirement within a target ──────────────────────────

export interface RequirementEta {
  /** e.g. "Sand", "Quartz" */
  resourceName: string;
  tierId: TierId;
  required: number;
  current: number;
  productionPerSec: number;
  etaSeconds: number;
  status: EtaStatus;
}

// ─── Forecast target ─────────────────────────────────────────────

export type ForecastCategory =
  | 'equation_forge'
  | 'tier_unlock'
  | 'loom_upgrade'
  | 'special_loom'
  | 'equation_upgrade'
  | 'achievement';

export interface ForecastTarget {
  id: string;
  displayName: string;
  category: ForecastCategory;
  requirements: RequirementEta[];
  /** Overall ETA — max of individual requirement ETAs (bottleneck). */
  overallEtaSeconds: number;
  overallStatus: EtaStatus;
  /** Which requirement is the bottleneck (null if none / already met). */
  bottleneck: RequirementEta | null;
  /** Human-readable label for the overall ETA. */
  etaLabel: string;
}

// ─── Pacing warnings ─────────────────────────────────────────────

export type WarningKind =
  | 'long_gap'
  | 'unlock_cluster'
  | 'inverted_tier_order'
  | 'extreme_eta'
  | 'no_production'
  | 'no_spend_target'
  | 'cost_growth_steep'
  | 'production_growth_weak'
  | 'simulation_stuck';

export interface PacingWarning {
  kind: WarningKind;
  message: string;
}

// ─── Pacing warning thresholds (tunable) ─────────────────────────

export const BALANCE_WARNING_THRESHOLDS = {
  /** Early game: gap > 5 min between consecutive reachable events is a long gap. */
  earlyGameLongGapSeconds: 300,
  /** Mid game: gap > 30 min. */
  midGameLongGapSeconds: 1800,
  /** ETA > 1 week is considered extreme. */
  extremeEtaSeconds: 604800,
  /** N+ events within this window is a cluster. */
  tooManyUnlocksWindowSeconds: 10,
  tooManyUnlocksCount: 5,
  /** Cost growth ratio between adjacent levels > this is steep. */
  suspiciousCostGrowthMultiplier: 25,
} as const;

// ─── Milestone (for fresh-run / strategy simulations) ────────────

export interface Milestone {
  id: string;
  displayName: string;
  reachedAtSeconds: number;
  notes?: string;
}

// ─── Strategy simulation ─────────────────────────────────────────

export type StrategyId =
  | 'wait_only'
  | 'cheapest_first'
  | 'best_efficiency'
  | 'rush_next_tier';

export interface StrategyResult {
  strategyId: StrategyId;
  strategyName: string;
  milestones: Milestone[];
  /** Total simulated time in seconds. */
  totalSimulatedSeconds: number;
  wasStuck: boolean;
}

// ─── Full forecast result ─────────────────────────────────────────

export interface ForecastResult {
  staticTargets: ForecastTarget[];
  nextMeaningfulTargets: ForecastTarget[];   // first 8 reachable, sorted by ETA
  pacingWarnings: PacingWarning[];
  freshRunMilestones: Milestone[];
  strategyResults: StrategyResult[];
  generatedAtMs: number;
}
