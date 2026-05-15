/**
 * balance-forecast-engine.ts — Core balance analysis and simulation engine.
 *
 * Provides:
 *  1. Static ETA analysis for the current player state
 *  2. Fresh-run milestone timeline simulation
 *  3. Strategy-based progression simulation
 *  4. Pacing warning generation
 *
 * IMPORTANT: This module never mutates real game state.
 * All simulations operate on deep-cloned lightweight sim models.
 */

import type { TierId } from '../../../data/tiers';
import { TIERS, TIER_BY_ID } from '../../../data/tiers';
import { LOOM_BY_TIER, loomUpgradeCost } from '../../../data/looms';
import { SPECIAL_LOOM_DEFINITIONS } from '../../../data/looms/special-loom-definitions';
import { ALL_UPGRADES } from '../../../data/upgrades';
import { upgradeCostAtLevel } from '../../../data/upgrades/upgrade-types';
import { ACHIEVEMENT_DEFINITIONS } from '../../../data/achievements';
import {
  EQUATION_FORGE_COST,
  tierUnlockCost,
} from '../../../data/balance';

import type { GameState } from '../../../sim';

import type {
  ForecastTarget,
  ForecastResult,
  ForecastCategory,
  RequirementEta,
  EtaStatus,
  StrategyResult,
  StrategyId,
  PacingWarning,
} from './balance-forecast-types';
import {
  formatDuration,
  BALANCE_WARNING_THRESHOLDS,
} from './balance-forecast-types';

import {
  type SimState,
  createFreshSimState,
  simStateFromGame,
  getTotalProductionRateSim,
  runStrategySimulation,
} from './balance-forecast-sim';

// ─── ETA calculation ──────────────────────────────────────────────

/**
 * Compute a single RequirementEta for a (tierId, required) pair.
 */
function computeRequirementEta(
  sim: SimState,
  tierId: TierId,
  required: number,
): RequirementEta {
  const tier = TIER_BY_ID.get(tierId);
  const resourceName = tier?.displayName ?? tierId;
  const current = sim.motes.get(tierId) ?? 0;
  const productionPerSec = getTotalProductionRateSim(sim, tierId);

  const remaining = Math.max(0, required - current);
  let etaSeconds: number;
  let status: EtaStatus;

  if (remaining <= 0) {
    etaSeconds = 0;
    status = 'available';
  } else if (productionPerSec <= 0) {
    etaSeconds = Infinity;
    status = 'blocked';
  } else {
    etaSeconds = remaining / productionPerSec;
    status = 'reachable';
  }

  return { resourceName, tierId, required, current, productionPerSec, etaSeconds, status };
}

/**
 * Build a ForecastTarget from a list of requirements.
 */
function buildForecastTarget(
  id: string,
  displayName: string,
  category: ForecastCategory,
  requirements: RequirementEta[],
): ForecastTarget {
  if (requirements.length === 0) {
    return {
      id, displayName, category, requirements,
      overallEtaSeconds: 0,
      overallStatus: 'available',
      bottleneck: null,
      etaLabel: 'Now',
    };
  }

  // Find bottleneck: the requirement with the largest ETA
  let bottleneck: RequirementEta | null = null;
  let overallEta = 0;
  let overallStatus: EtaStatus = 'available';

  for (const req of requirements) {
    if (req.status === 'blocked') {
      overallStatus = 'blocked';
      bottleneck = req;
      overallEta = Infinity;
      break;
    }
    if (req.status === 'unavailable') {
      overallStatus = 'unavailable';
      bottleneck = req;
      overallEta = Infinity;
      break;
    }
    if (req.etaSeconds > overallEta) {
      overallEta = req.etaSeconds;
      bottleneck = req;
    }
  }

  if (overallStatus === 'available') {
    overallStatus = overallEta === 0 ? 'available' : 'reachable';
  }

  const etaLabel = overallStatus === 'available'
    ? 'Now'
    : overallStatus === 'blocked'
      ? `Blocked: no ${bottleneck?.resourceName ?? '?'} production`
      : overallStatus === 'unavailable'
        ? `Unavailable`
        : formatDuration(overallEta);

  return {
    id, displayName, category,
    requirements,
    overallEtaSeconds: isFinite(overallEta) ? overallEta : Infinity,
    overallStatus,
    bottleneck,
    etaLabel,
  };
}

// ─── Gather all forecast targets from a sim state ─────────────────

function getAllForecastTargets(sim: SimState): ForecastTarget[] {
  const targets: ForecastTarget[] = [];

  // ── Equation Forge ──
  if (!sim.isForgeUnlocked) {
    targets.push(buildForecastTarget(
      'eq_forge',
      'Equation Forge',
      'equation_forge',
      [computeRequirementEta(sim, 'sand', EQUATION_FORGE_COST)],
    ));
  }

  // ── Tier unlocks ──
  for (let i = sim.unlockedTierCount; i < TIERS.length; i++) {
    const tier = TIERS[i];
    if (!tier || tier.isSecret) break; // stop at first secret tier
    const payTierId = TIERS[i - 1]?.id ?? 'sand';
    const cost = tierUnlockCost(i);

    // Check whether the pay tier is itself unlocked yet
    const prevTier = TIERS[i - 1];
    const payUnlocked = i > 0 && prevTier !== undefined && sim.looms.get(prevTier.id)?.isUnlocked === true;

    const req = computeRequirementEta(sim, payTierId, cost);
    if (!payUnlocked) {
      const reqModified: RequirementEta = { ...req, status: 'unavailable', etaSeconds: Infinity };
      targets.push(buildForecastTarget(
        `tier_unlock_${tier.id}`,
        `Unlock ${tier.displayName} Tier`,
        'tier_unlock',
        [reqModified],
      ));
    } else {
      targets.push(buildForecastTarget(
        `tier_unlock_${tier.id}`,
        `Unlock ${tier.displayName} Tier`,
        'tier_unlock',
        [req],
      ));
    }
  }

  // ── Loom upgrades (first 3 levels of each unlocked loom) ──
  for (const t of TIERS) {
    const loom = sim.looms.get(t.id);
    if (!loom || !loom.isUnlocked) continue;
    const def = LOOM_BY_TIER.get(t.id);
    if (!def) continue;
    // Show up to 3 next upgrades
    for (let lvl = loom.level; lvl < loom.level + 3; lvl++) {
      const cost = loomUpgradeCost(def, lvl);
      const req = computeRequirementEta(sim, t.id, cost);
      targets.push(buildForecastTarget(
        `loom_upgrade_${t.id}_${lvl}`,
        `${def.displayName} → Lv ${lvl + 1}`,
        'loom_upgrade',
        [req],
      ));
    }
  }

  // ── Special Loom (Resonance) upgrades ──
  for (const specialDef of SPECIAL_LOOM_DEFINITIONS) {
    const loom = sim.looms.get(specialDef.tierId);
    if (!loom || !loom.isUnlocked) continue;
    if (loom.specialPurchased) continue;
    const req = computeRequirementEta(sim, specialDef.tierId, specialDef.cost);
    targets.push(buildForecastTarget(
      `special_loom_${specialDef.tierId}`,
      specialDef.displayName,
      'special_loom',
      [req],
    ));
  }

  // ── Equation upgrades (next level for each unlocked tier's upgrade) ──
  for (const upgDef of ALL_UPGRADES) {
    if (!upgDef.tierId) continue;
    const tierUnlocked = sim.looms.get(upgDef.tierId)?.isUnlocked ?? false;
    if (!tierUnlocked) continue;
    const level = sim.upgradeLevels.get(upgDef.id) ?? 0;
    const cost = upgradeCostAtLevel(upgDef, level);
    const req = computeRequirementEta(sim, upgDef.tierId, cost);
    targets.push(buildForecastTarget(
      `eq_upgrade_${upgDef.id}_${level}`,
      `${upgDef.displayName} Lv ${level + 1}`,
      'equation_upgrade',
      [req],
    ));
  }

  // ── Achievement ETA (lifetime_motes conditions only — others depend on RPG) ──
  for (const achDef of ACHIEVEMENT_DEFINITIONS) {
    if (sim.unlockedAchievements.has(achDef.id)) continue;
    if (achDef.condition.kind !== 'lifetime_motes') continue;
    const { tierId, amount } = achDef.condition;
    const current = sim.lifetimeMotes.get(tierId) ?? 0;
    if (current >= amount) continue;
    // Compute ETA based on lifetime motes remaining
    const lifetimeRemaining = Math.max(0, amount - current);
    const rate = getTotalProductionRateSim(sim, tierId);
    const etaSec = rate > 0 ? lifetimeRemaining / rate : Infinity;
    const reqAdj: RequirementEta = {
      resourceName: TIER_BY_ID.get(tierId)?.displayName ?? tierId,
      tierId,
      required: amount,
      current,
      productionPerSec: rate,
      etaSeconds: isFinite(etaSec) ? etaSec : Infinity,
      status: etaSec === 0 ? 'available' : rate <= 0 ? 'blocked' : 'reachable',
    };
    targets.push(buildForecastTarget(
      `achievement_${achDef.id}`,
      `Achievement: ${achDef.displayName}`,
      'achievement',
      [reqAdj],
    ));
  }

  return targets;
}

// ─── Pacing warnings ──────────────────────────────────────────────

function generatePacingWarnings(
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
