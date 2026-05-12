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
import { LOOM_BY_TIER, LOOM_DEFINITIONS, loomUpgradeCost, loomProductionRate } from '../../../data/looms';
import { SPECIAL_LOOM_DEFINITIONS } from '../../../data/looms/special-loom-definitions';
import { ALL_UPGRADES, UPGRADE_BY_ID } from '../../../data/upgrades';
import { upgradeCostAtLevel } from '../../../data/upgrades/upgrade-types';
import { ACHIEVEMENT_DEFINITIONS } from '../../../data/achievements';
import {
  EQUATION_FORGE_COST,
  tierUnlockCost,
  BASE_AUTO_TAP_INTERVAL_MS,
  AUTO_TAP_INTERVAL_REDUCTION_MS,
  MIN_AUTO_TAP_INTERVAL_MS,
  BASE_TAP_VALUE,
  UPGRADE_TAP_MULTIPLIER,
  INITIAL_UNLOCKED_TIER_COUNT,
} from '../../../data/balance';

import type { GameState } from '../../../sim';
import { getMotes, getLifetimeMotes } from '../../../sim/resources';

import type {
  ForecastTarget,
  ForecastResult,
  ForecastCategory,
  RequirementEta,
  EtaStatus,
  Milestone,
  StrategyResult,
  StrategyId,
  PacingWarning,
} from './balance-forecast-types';
import {
  formatDuration,
  BALANCE_WARNING_THRESHOLDS,
} from './balance-forecast-types';

// ─── Lightweight simulation state (isolated from real game) ───────

interface SimLoomState {
  tierId: TierId;
  level: number;
  isUnlocked: boolean;
  specialPurchased: boolean;
}

interface SimState {
  timeSeconds: number;
  /** Current mote totals per tier. */
  motes: Map<TierId, number>;
  /** Lifetime motes per tier. */
  lifetimeMotes: Map<TierId, number>;
  looms: Map<TierId, SimLoomState>;
  unlockedTierCount: number;
  isForgeUnlocked: boolean;
  upgradeLevels: Map<string, number>;
  autoTapLevel: number;
  tapMultiplierBonus: number;
  loomMultiplierBonus: number;
  /** Unlocked achievement IDs. */
  unlockedAchievements: Set<string>;
  totalTapCount: number;
  equationSegmentLevels: Map<TierId, number>;
}

function createFreshSimState(): SimState {
  const motes = new Map<TierId, number>();
  const lifetimeMotes = new Map<TierId, number>();
  const looms = new Map<TierId, SimLoomState>();
  const equationSegmentLevels = new Map<TierId, number>();

  for (const t of TIERS) {
    motes.set(t.id, 0);
    lifetimeMotes.set(t.id, 0);
    equationSegmentLevels.set(t.id, 0);
    looms.set(t.id, {
      tierId: t.id,
      level: t.id === 'sand' ? 1 : 0,
      isUnlocked: t.id === 'sand',
      specialPurchased: false,
    });
  }

  return {
    timeSeconds: 0,
    motes,
    lifetimeMotes,
    looms,
    unlockedTierCount: INITIAL_UNLOCKED_TIER_COUNT,
    isForgeUnlocked: false,
    upgradeLevels: new Map(),
    autoTapLevel: 0,
    tapMultiplierBonus: 1,
    loomMultiplierBonus: 1,
    unlockedAchievements: new Set(),
    totalTapCount: 0,
    equationSegmentLevels,
  };
}

/** Clone a SimState deeply. */
function cloneSimState(s: SimState): SimState {
  return {
    timeSeconds: s.timeSeconds,
    motes: new Map(s.motes),
    lifetimeMotes: new Map(s.lifetimeMotes),
    looms: new Map([...s.looms.entries()].map(([k, v]) => [k, { ...v }])),
    unlockedTierCount: s.unlockedTierCount,
    isForgeUnlocked: s.isForgeUnlocked,
    upgradeLevels: new Map(s.upgradeLevels),
    autoTapLevel: s.autoTapLevel,
    tapMultiplierBonus: s.tapMultiplierBonus,
    loomMultiplierBonus: s.loomMultiplierBonus,
    unlockedAchievements: new Set(s.unlockedAchievements),
    totalTapCount: s.totalTapCount,
    equationSegmentLevels: new Map(s.equationSegmentLevels),
  };
}

/** Build a SimState snapshot from the real player GameState. */
function simStateFromGame(game: GameState): SimState {
  const motes = new Map<TierId, number>();
  const lifetimeMotes = new Map<TierId, number>();
  const looms = new Map<TierId, SimLoomState>();
  const equationSegmentLevels = new Map<TierId, number>();

  for (const t of TIERS) {
    motes.set(t.id, getMotes(game.resources, t.id));
    lifetimeMotes.set(t.id, getLifetimeMotes(game.resources, t.id));
    equationSegmentLevels.set(t.id, game.equation.segments.find(s => s.tierId === t.id)?.level ?? 0);
    const loomState = game.looms.looms.find(l => l.tierId === t.id);
    looms.set(t.id, {
      tierId: t.id,
      level: loomState?.level ?? 0,
      isUnlocked: loomState?.isUnlocked ?? false,
      specialPurchased: game.looms.specialPurchased.has(t.id),
    });
  }

  return {
    timeSeconds: 0,
    motes,
    lifetimeMotes,
    looms,
    unlockedTierCount: game.progression.unlockedTierCount,
    isForgeUnlocked: game.equation.isForgeUnlocked,
    upgradeLevels: new Map(game.progression.upgradeLevels),
    autoTapLevel: game.progression.autoTapLevel,
    tapMultiplierBonus: game.achievements.tapMultiplierBonus,
    loomMultiplierBonus: game.achievements.loomMultiplierBonus,
    unlockedAchievements: new Set(game.achievements.unlockedIds),
    totalTapCount: game.equation.totalTapCount,
    equationSegmentLevels,
  };
}

// ─── Production rate helpers ──────────────────────────────────────

/**
 * Compute loom motes/sec for a given tier in a sim state.
 * Returns 0 if the loom is not unlocked or at level 0.
 */
function getLoomRateSim(sim: SimState, tierId: TierId): number {
  const loom = sim.looms.get(tierId);
  if (!loom || !loom.isUnlocked || loom.level <= 0) return 0;
  const def = LOOM_BY_TIER.get(tierId);
  if (!def) return 0;
  const specialBonus = loom.specialPurchased ? 2 : 1;
  return loomProductionRate(def, loom.level) * sim.loomMultiplierBonus * specialBonus;
}

/**
 * Compute the auto-tap rate in taps/sec for the given sim state.
 */
function getAutoTapRateSim(sim: SimState): number {
  if (!sim.isForgeUnlocked || sim.autoTapLevel <= 0) return 0;
  const intervalMs = Math.max(
    MIN_AUTO_TAP_INTERVAL_MS,
    BASE_AUTO_TAP_INTERVAL_MS - (sim.autoTapLevel - 1) * AUTO_TAP_INTERVAL_REDUCTION_MS,
  );
  return 1000 / intervalMs;
}

/**
 * Compute per-tier motes/sec from tap production in the sim state.
 * Only contributes if forge is unlocked.
 */
function getTapProductionRateSim(sim: SimState): Map<TierId, number> {
  const rates = new Map<TierId, number>();
  if (!sim.isForgeUnlocked) return rates;
  const autoTapRate = getAutoTapRateSim(sim);
  if (autoTapRate <= 0) return rates;

  for (let i = 1; i < sim.unlockedTierCount; i++) {
    const tier = TIERS[i];
    if (!tier) continue;
    const segLevel = sim.equationSegmentLevels.get(tier.id) ?? 0;
    const tapValue = (BASE_TAP_VALUE + segLevel * UPGRADE_TAP_MULTIPLIER) * sim.tapMultiplierBonus;
    rates.set(tier.id, tapValue * autoTapRate);
  }
  return rates;
}

/**
 * Compute total motes/sec for a tier (loom + tap contributions combined).
 */
function getTotalProductionRateSim(sim: SimState, tierId: TierId): number {
  const loomRate = getLoomRateSim(sim, tierId);
  const tapRates = getTapProductionRateSim(sim);
  return loomRate + (tapRates.get(tierId) ?? 0);
}

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
    const payUnlocked = i > 0 && (sim.unlockedTierCount > i - 1 || (TIERS[i - 1] && sim.looms.get(TIERS[i - 1].id)?.isUnlocked));

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
    const req = computeRequirementEta(sim, tierId, amount - (sim.motes.get(tierId) ?? 0));
    // Adjust for lifetime: remaining = amount - lifetimeMotes
    const lifetimeRemaining = Math.max(0, amount - current);
    const rate = getTotalProductionRateSim(sim, tierId);
    const etaSec = rate > 0 ? lifetimeRemaining / rate : Infinity;
    const reqAdj: RequirementEta = {
      ...req,
      required: amount,
      current,
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

  return warnings;
}

// ─── Simulation step ──────────────────────────────────────────────

/** Advance the sim state by deltaSeconds and return produced motes per tier. */
function simTick(sim: SimState, deltaSeconds: number): void {
  if (deltaSeconds <= 0) return;

  for (const t of TIERS) {
    const rate = getTotalProductionRateSim(sim, t.id);
    if (rate <= 0) continue;
    const gain = rate * deltaSeconds;
    const cur = sim.motes.get(t.id) ?? 0;
    sim.motes.set(t.id, cur + gain);
    const lifetime = sim.lifetimeMotes.get(t.id) ?? 0;
    sim.lifetimeMotes.set(t.id, lifetime + gain);
  }
  sim.timeSeconds += deltaSeconds;
}

/** Check and apply achievement unlock side effects in the sim. */
function simCheckAchievements(sim: SimState): void {
  for (const achDef of ACHIEVEMENT_DEFINITIONS) {
    if (sim.unlockedAchievements.has(achDef.id)) continue;
    let met = false;
    switch (achDef.condition.kind) {
      case 'lifetime_motes':
        met = (sim.lifetimeMotes.get(achDef.condition.tierId) ?? 0) >= achDef.condition.amount;
        break;
      case 'forge_unlocked':
        met = sim.isForgeUnlocked;
        break;
      case 'tap_count':
        met = sim.totalTapCount >= achDef.condition.count;
        break;
      case 'equation_tiers':
        met = sim.unlockedTierCount >= achDef.condition.count;
        break;
      default:
        // RPG achievements not simulatable here
        break;
    }
    if (met) {
      sim.unlockedAchievements.add(achDef.id);
      // Apply bonus (assume claimed immediately for simulation simplicity)
      if (achDef.bonusKind === 'tap_multiplier') {
        sim.tapMultiplierBonus *= achDef.bonusMultiplier;
      } else {
        sim.loomMultiplierBonus *= achDef.bonusMultiplier;
      }
    }
  }
}

// ─── Purchase helpers for simulation ─────────────────────────────

interface PurchaseCandidate {
  id: string;
  displayName: string;
  tierId: TierId;
  cost: number;
  /** Approximate additional motes/sec this purchase provides. */
  productionGainPerSec: number;
}

function getAllAffordablePurchases(sim: SimState): PurchaseCandidate[] {
  const candidates: PurchaseCandidate[] = [];

  // Equation Forge
  if (!sim.isForgeUnlocked) {
    const sandMotes = sim.motes.get('sand') ?? 0;
    if (sandMotes >= EQUATION_FORGE_COST) {
      candidates.push({
        id: 'eq_forge',
        displayName: 'Equation Forge',
        tierId: 'sand',
        cost: EQUATION_FORGE_COST,
        productionGainPerSec: 1, // abstract gain representing the gate opening
      });
    }
  }

  // Tier unlocks
  if (sim.unlockedTierCount < TIERS.length) {
    const nextTier = TIERS[sim.unlockedTierCount];
    if (nextTier && !nextTier.isSecret) {
      const payTierId = TIERS[sim.unlockedTierCount - 1]?.id ?? 'sand';
      const cost = tierUnlockCost(sim.unlockedTierCount);
      const payMotes = sim.motes.get(payTierId) ?? 0;
      if (payMotes >= cost) {
        const newLoomDef = LOOM_BY_TIER.get(nextTier.id);
        const gain = newLoomDef ? loomProductionRate(newLoomDef, 1) * sim.loomMultiplierBonus : 0.5;
        candidates.push({
          id: `tier_unlock_${nextTier.id}`,
          displayName: `Unlock ${nextTier.displayName}`,
          tierId: payTierId,
          cost,
          productionGainPerSec: gain,
        });
      }
    }
  }

  // Loom upgrades
  for (const t of TIERS) {
    const loom = sim.looms.get(t.id);
    if (!loom || !loom.isUnlocked) continue;
    const def = LOOM_BY_TIER.get(t.id);
    if (!def) continue;
    const cost = loomUpgradeCost(def, loom.level);
    const avail = sim.motes.get(t.id) ?? 0;
    if (avail >= cost) {
      const currentRate = loomProductionRate(def, loom.level) * sim.loomMultiplierBonus * (loom.specialPurchased ? 2 : 1);
      const nextRate = loomProductionRate(def, loom.level + 1) * sim.loomMultiplierBonus * (loom.specialPurchased ? 2 : 1);
      const gain = nextRate - currentRate;
      candidates.push({
        id: `loom_upgrade_${t.id}`,
        displayName: `${def.displayName} Lv ${loom.level + 1}`,
        tierId: t.id,
        cost,
        productionGainPerSec: gain,
      });
    }
  }

  // Special loom upgrades
  for (const specialDef of SPECIAL_LOOM_DEFINITIONS) {
    const loom = sim.looms.get(specialDef.tierId);
    if (!loom || !loom.isUnlocked || loom.specialPurchased) continue;
    const avail = sim.motes.get(specialDef.tierId) ?? 0;
    if (avail >= specialDef.cost) {
      const def = LOOM_BY_TIER.get(specialDef.tierId);
      const baseRate = def ? loomProductionRate(def, loom.level) * sim.loomMultiplierBonus : 0;
      candidates.push({
        id: `special_loom_${specialDef.tierId}`,
        displayName: specialDef.displayName,
        tierId: specialDef.tierId,
        cost: specialDef.cost,
        productionGainPerSec: baseRate, // doubles production
      });
    }
  }

  // Equation upgrades
  for (const upgDef of ALL_UPGRADES) {
    if (!upgDef.tierId) continue;
    const loom = sim.looms.get(upgDef.tierId);
    if (!loom || !loom.isUnlocked) continue;
    const level = sim.upgradeLevels.get(upgDef.id) ?? 0;
    const cost = upgradeCostAtLevel(upgDef, level);
    const avail = sim.motes.get(upgDef.tierId) ?? 0;
    if (avail >= cost) {
      candidates.push({
        id: `eq_upgrade_${upgDef.id}`,
        displayName: `${upgDef.displayName} Lv ${level + 1}`,
        tierId: upgDef.tierId,
        cost,
        productionGainPerSec: 0.01, // tap value is hard to quantify simply
      });
    }
  }

  return candidates;
}

function applyPurchase(sim: SimState, candidate: PurchaseCandidate): void {
  // Deduct cost
  const cur = sim.motes.get(candidate.tierId) ?? 0;
  sim.motes.set(candidate.tierId, Math.max(0, cur - candidate.cost));

  const id = candidate.id;

  if (id === 'eq_forge') {
    sim.isForgeUnlocked = true;
    return;
  }
  if (id.startsWith('tier_unlock_')) {
    const tierId = id.replace('tier_unlock_', '') as TierId;
    const idx = TIERS.findIndex(t => t.id === tierId);
    if (idx >= 0) {
      sim.unlockedTierCount = Math.max(sim.unlockedTierCount, idx + 1);
      const loom = sim.looms.get(tierId);
      if (loom) {
        loom.isUnlocked = true;
        if (loom.level === 0) loom.level = 1;
      }
      sim.equationSegmentLevels.set(tierId, 0);
    }
    return;
  }
  if (id.startsWith('loom_upgrade_')) {
    const tierId = id.replace('loom_upgrade_', '') as TierId;
    const loom = sim.looms.get(tierId);
    if (loom) loom.level += 1;
    return;
  }
  if (id.startsWith('special_loom_')) {
    const tierId = id.replace('special_loom_', '') as TierId;
    const loom = sim.looms.get(tierId);
    if (loom) loom.specialPurchased = true;
    return;
  }
  if (id.startsWith('eq_upgrade_')) {
    const upgradeId = id.replace('eq_upgrade_', '');
    const level = sim.upgradeLevels.get(upgradeId) ?? 0;
    sim.upgradeLevels.set(upgradeId, level + 1);
    const upgDef = UPGRADE_BY_ID.get(upgradeId);
    if (upgDef?.effectKind === 'auto_tap_speed') {
      sim.autoTapLevel = level + 1;
    }
    if (upgDef?.tierId) {
      sim.equationSegmentLevels.set(upgDef.tierId, (sim.equationSegmentLevels.get(upgDef.tierId) ?? 0) + 1);
    }
    return;
  }
}

// ─── Milestone check helpers ──────────────────────────────────────

interface MilestoneSpec {
  id: string;
  displayName: string;
  check: (sim: SimState) => boolean;
  notes?: string;
}

const MILESTONE_SPECS: MilestoneSpec[] = [
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

const STRATEGY_FNS: Record<StrategyId, StrategyFn> = {
  wait_only: strategyWaitOnly,
  cheapest_first: strategyCheapestFirst,
  best_efficiency: strategyBestEfficiency,
  rush_next_tier: strategyRushNextTier,
};

const STRATEGY_NAMES: Record<StrategyId, string> = {
  wait_only: 'Wait Only',
  cheapest_first: 'Cheapest First',
  best_efficiency: 'Best Efficiency',
  rush_next_tier: 'Rush Next Tier',
};

// ─── Simulation runner ────────────────────────────────────────────

const MAX_ITERATIONS = 500_000;

/**
 * Simulate progression using a given strategy.
 * Returns a list of milestones with the time they were reached.
 */
function runStrategySimulation(
  initialState: SimState,
  strategyId: StrategyId,
  maxSimSeconds: number,
): StrategyResult {
  const sim = cloneSimState(initialState);
  const milestones: Milestone[] = [];
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
      if (noProgressIter > 100) {
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
 * or Infinity if no production exists.
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

// ─── Public API ───────────────────────────────────────────────────

export interface ForecastOptions {
  /** Maximum simulated time for strategy runs, in seconds. Default: 8 hours. */
  maxSimSeconds?: number;
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

  // Strategy simulations
  const strategyIds: StrategyId[] = ['wait_only', 'cheapest_first', 'best_efficiency', 'rush_next_tier'];
  const strategyResults: StrategyResult[] = strategyIds.map(id =>
    runStrategySimulation(createFreshSimState(), id, maxSimSeconds),
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
