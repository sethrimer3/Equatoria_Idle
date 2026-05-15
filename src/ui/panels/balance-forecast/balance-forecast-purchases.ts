/**
 * balance-forecast-purchases.ts — Purchase decision helpers for the balance forecast simulation.
 *
 * Contains:
 *   - PurchaseCandidate interface — describes a single purchasable item with cost and gain estimate
 *   - getAllAffordablePurchases — enumerates what the sim can currently buy
 *   - applyPurchase — mutates a SimState to reflect a completed purchase
 *
 * IMPORTANT: This module never mutates real game state.
 */

import type { TierId } from '../../../data/tiers';
import { TIERS } from '../../../data/tiers';
import { LOOM_BY_TIER, loomUpgradeCost, loomProductionRate } from '../../../data/looms';
import { SPECIAL_LOOM_DEFINITIONS } from '../../../data/looms/special-loom-definitions';
import { ALL_UPGRADES, UPGRADE_BY_ID } from '../../../data/upgrades';
import { upgradeCostAtLevel } from '../../../data/upgrades/upgrade-types';
import {
  EQUATION_FORGE_COST,
  tierUnlockCost,
} from '../../../data/balance';

import type { SimState } from './balance-forecast-state';

/** Approximate production gain used for equation upgrades (tap value increase is hard to quantify exactly). */
const ESTIMATED_TAP_PRODUCTION_GAIN = 0.01;

export interface PurchaseCandidate {
  id: string;
  displayName: string;
  tierId: TierId;
  cost: number;
  /** Approximate additional motes/sec this purchase provides. */
  productionGainPerSec: number;
}

export function getAllAffordablePurchases(sim: SimState): PurchaseCandidate[] {
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
        productionGainPerSec: ESTIMATED_TAP_PRODUCTION_GAIN, // tap value is hard to quantify simply
      });
    }
  }

  return candidates;
}

export function applyPurchase(sim: SimState, candidate: PurchaseCandidate): void {
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
