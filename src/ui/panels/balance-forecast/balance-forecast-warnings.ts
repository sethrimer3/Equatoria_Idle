/**
 * balance-forecast-warnings.ts — Pacing warning generation.
 *
 * Provides generatePacingWarnings(), which inspects forecast targets and
 * strategy results for common balance problems and returns a list of
 * human-readable PacingWarning messages.
 *
 * Used internally by balance-forecast-engine.ts.
 * Does NOT mutate game state.
 */

import type { TierId } from '../../../data/tiers';
import { TIERS, TIER_BY_ID } from '../../../data/tiers';
import { LOOM_BY_TIER, loomUpgradeCost } from '../../../data/looms';

import type {
  ForecastTarget,
  PacingWarning,
  StrategyResult,
} from './balance-forecast-types';
import { formatDuration, BALANCE_WARNING_THRESHOLDS } from './balance-forecast-types';

// ─── Pacing warnings ──────────────────────────────────────────────

/**
 * Inspect forecast targets and strategy results for common balance problems.
 * Returns a list of human-readable PacingWarning objects.
 */
export function generatePacingWarnings(
  targets: ForecastTarget[],
  strategyResults: StrategyResult[],
): PacingWarning[] {
  const warnings: PacingWarning[] = [];
  const T = BALANCE_WARNING_THRESHOLDS;

  // Sort reachable targets by ETA for gap analysis
  const reachable = targets
    .filter(t => t.overallStatus === 'reachable' || t.overallStatus === 'available')
    .sort((a, b) => a.overallEtaSeconds - b.overallEtaSeconds);

  // Long gap check
  for (let i = 1; i < reachable.length; i++) {
    const prev = reachable[i - 1];
    const curr = reachable[i];
    const gap = curr.overallEtaSeconds - prev.overallEtaSeconds;
    const threshold = i <= 5 ? T.earlyGameLongGapSeconds : T.midGameLongGapSeconds;
    if (gap > threshold) {
      warnings.push({
        kind: 'long_gap',
        message: `Long gap (${formatDuration(gap)}) between "${prev.displayName}" and "${curr.displayName}"`,
      });
    }
  }

  // Cluster check: too many unlocks within a short window
  for (let i = 0; i < reachable.length; i++) {
    let count = 1;
    for (let j = i + 1; j < reachable.length; j++) {
      if (reachable[j].overallEtaSeconds - reachable[i].overallEtaSeconds <= T.tooManyUnlocksWindowSeconds) {
        count++;
      } else break;
    }
    if (count >= T.tooManyUnlocksCount) {
      warnings.push({
        kind: 'unlock_cluster',
        message: `${count} events unlock within ${T.tooManyUnlocksWindowSeconds}s of each other (around ${formatDuration(reachable[i].overallEtaSeconds)})`,
      });
      // Skip ahead past this cluster to avoid duplicate warnings
      i += count - 1;
    }
  }

  // Extreme ETA check
  for (const t of reachable) {
    if (t.overallEtaSeconds > T.extremeEtaSeconds) {
      warnings.push({
        kind: 'extreme_eta',
        message: `"${t.displayName}" has an extreme ETA of ${formatDuration(t.overallEtaSeconds)}`,
      });
    }
  }

  // No production for a tier that has spend targets
  const blockedTargetTiers = new Set<TierId>();
  for (const t of targets) {
    if (t.overallStatus === 'blocked') {
      for (const req of t.requirements) {
        if (req.status === 'blocked') blockedTargetTiers.add(req.tierId);
      }
    }
  }
  for (const tierId of blockedTargetTiers) {
    const tierDef = TIER_BY_ID.get(tierId);
    warnings.push({
      kind: 'no_production',
      message: `No production for ${tierDef?.displayName ?? tierId}, but it has spend targets`,
    });
  }

  // Inverted tier unlock order (a later tier cheaper than an earlier one)
  const tierUnlockTargets = targets
    .filter(t => t.category === 'tier_unlock' && t.overallStatus === 'reachable')
    .sort((a, b) => a.overallEtaSeconds - b.overallEtaSeconds);
  for (let i = 1; i < tierUnlockTargets.length; i++) {
    const prev = tierUnlockTargets[i - 1];
    const curr = tierUnlockTargets[i];
    if (curr.overallEtaSeconds < prev.overallEtaSeconds) {
      warnings.push({
        kind: 'inverted_tier_order',
        message: `"${curr.displayName}" is faster (${formatDuration(curr.overallEtaSeconds)}) than "${prev.displayName}" (${formatDuration(prev.overallEtaSeconds)})`,
      });
    }
  }

  // Stuck simulation warning
  for (const sr of strategyResults) {
    if (sr.wasStuck) {
      warnings.push({
        kind: 'simulation_stuck',
        message: `Strategy "${sr.strategyName}" simulation got stuck after ${formatDuration(sr.totalSimulatedSeconds)}`,
      });
    }
  }

  // Cost growth warnings for adjacent loom upgrade levels
  const loomUpgradeCostWarnings: PacingWarning[] = [];
  for (const t of TIERS) {
    const loomDef = LOOM_BY_TIER.get(t.id);
    if (!loomDef) continue;
    // Inspect up to 8 consecutive upgrade levels for steep cost jumps.
    for (let lvl = 0; lvl < 7; lvl++) {
      const costA = loomUpgradeCost(loomDef, lvl);
      const costB = loomUpgradeCost(loomDef, lvl + 1);
      if (costA > 0 && costB / costA > T.suspiciousCostGrowthMultiplier) {
        loomUpgradeCostWarnings.push({
          kind: 'cost_growth_steep',
          message: `${loomDef.displayName} cost jumps ×${(costB / costA).toFixed(0)} from Lv ${lvl + 1} (${costA}) to Lv ${lvl + 2} (${costB})`,
        });
      }
    }
  }
  warnings.push(...loomUpgradeCostWarnings);

  return warnings;
}
