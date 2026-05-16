/**
 * balance-forecast-targets.ts — Forecast target computation.
 *
 * Provides per-target ETA analysis helpers:
 *   - computeRequirementEta   — single (tierId, amount) ETA
 *   - buildForecastTarget     — wraps requirements into a ForecastTarget
 *   - getAllForecastTargets    — collects all forecast targets from sim state
 *
 * Used internally by balance-forecast-engine.ts.
 * Does NOT mutate game state.
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

import type {
  ForecastTarget,
  ForecastCategory,
  RequirementEta,
  EtaStatus,
} from './balance-forecast-types';
import { formatDuration } from './balance-forecast-types';

import type { SimState } from './balance-forecast-sim';
import { getTotalProductionRateSim } from './balance-forecast-sim';

// ─── Single-requirement ETA ───────────────────────────────────────

/**
 * Compute a single RequirementEta for a (tierId, required) pair.
 */
export function computeRequirementEta(
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

// ─── ForecastTarget builder ───────────────────────────────────────

/**
 * Build a ForecastTarget from a list of requirements.
 */
export function buildForecastTarget(
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

/**
 * Collect every actionable ForecastTarget from the given sim state.
 * Covers: equation forge, tier unlocks, loom upgrades, special looms,
 * equation upgrades, and lifetime-motes achievement milestones.
 */
export function getAllForecastTargets(sim: SimState): ForecastTarget[] {
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
