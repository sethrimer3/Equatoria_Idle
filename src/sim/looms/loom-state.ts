/**
 * Loom simulation state — tracks level and production for each tier's Loom.
 * Looms passively generate motes over time.
 */

import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';
import { LOOM_BY_TIER, loomProductionRate, loomUpgradeCost, SPECIAL_LOOM_BY_TIER } from '../../data/looms';
import type { ResourceState } from '../resources';
import { getMotes, spendMotes, addMotes } from '../resources';

// ─── Types ──────────────────────────────────────────────────────

/** Per-tier Loom state. */
export interface LoomTierState {
  tierId: TierId;
  level: number;          // 0 = not yet purchased, 1+ = active
  isUnlocked: boolean;    // whether the player can see/use this Loom
  accumulatorMs: number;  // fractional mote accumulator (sub-second)
  /** Accumulated small-mote equivalents toward the next conversion output. */
  conversionProgress: number;
  /** Number of efficiency upgrades purchased (reduces conversion threshold). */
  conversionEfficiencyLevel: number;
}

/** Full Loom state across all tiers. */
export interface LoomState {
  looms: LoomTierState[];
  /** Tier IDs that have had their special Resonance upgrade purchased. */
  specialPurchased: Set<TierId>;
}

// ─── Factory ────────────────────────────────────────────────────

export function createLoomState(): LoomState {
  return {
    looms: TIERS.map((t) => ({
      tierId: t.id,
      level: t.id === 'sand' ? 1 : 0,       // Sand Loom starts at level 1
      isUnlocked: t.id === 'sand',           // Only Sand Loom unlocked at start
      accumulatorMs: 0,
      conversionProgress: 0,
      conversionEfficiencyLevel: 0,
    })),
    specialPurchased: new Set<TierId>(),
  };
}

// ─── Queries ────────────────────────────────────────────────────

export function getLoom(state: LoomState, tierId: TierId): LoomTierState | undefined {
  return state.looms.find(l => l.tierId === tierId);
}

export function getUnlockedLooms(state: LoomState): LoomTierState[] {
  return state.looms.filter(l => l.isUnlocked);
}

/** Get production rate in motes/sec for a specific Loom. */
export function getLoomRate(tierId: TierId, level: number): number {
  const def = LOOM_BY_TIER.get(tierId);
  if (!def) return 0;
  return loomProductionRate(def, level);
}

/** Get upgrade cost for a Loom at its current level. */
export function getLoomCost(tierId: TierId, currentLevel: number): number | null {
  const def = LOOM_BY_TIER.get(tierId);
  if (!def) return null;
  return loomUpgradeCost(def, currentLevel);
}

// ─── Mutations ──────────────────────────────────────────────────

/** Upgrade a Loom by one level. Returns true if successful. */
export function upgradeLoom(state: LoomState, tierId: TierId): boolean {
  const loom = getLoom(state, tierId);
  if (!loom || !loom.isUnlocked) return false;
  loom.level += 1;
  return true;
}

/** Unlock a Loom for a given tier. */
export function unlockLoom(state: LoomState, tierId: TierId): boolean {
  const loom = getLoom(state, tierId);
  if (!loom || loom.isUnlocked) return false;
  loom.isUnlocked = true;
  if (loom.level === 0) loom.level = 1; // auto-start at level 1
  return true;
}

/**
 * Tick all Looms, returning motes produced per tier.
 * Uses an accumulator to handle fractional production smoothly.
 * @param productionBonus - multiplicative bonus applied to all loom rates (≥ 1).
 */
export function tickLooms(
  state: LoomState,
  deltaMs: number,
  productionBonus = 1,
): Map<TierId, number> {
  const produced = new Map<TierId, number>();

  for (const loom of state.looms) {
    if (!loom.isUnlocked || loom.level <= 0) continue;

    const specialBonus = state.specialPurchased.has(loom.tierId) ? 2 : 1;
    // Non-sand looms reduce passive production to 10% so particle capture is
    // the primary economy path for higher tiers; sand keeps full passive rate.
    const passiveScale = loom.tierId === 'sand' ? 1.0 : 0.1;
    const rate = getLoomRate(loom.tierId, loom.level) * productionBonus * specialBonus * passiveScale;
    if (rate <= 0) continue;

    // Accumulate fractional motes
    loom.accumulatorMs += deltaMs;
    const motesProduced = (rate * loom.accumulatorMs) / 1000;

    if (motesProduced >= 0.001) {
      produced.set(loom.tierId, motesProduced);
      loom.accumulatorMs = 0;
    }
  }

  return produced;
}

export function isSpecialLoomPurchased(state: LoomState, tierId: TierId): boolean {
  return state.specialPurchased.has(tierId);
}

// ─── Loom conversion system ──────────────────────────────────────

/** Base small-mote equivalents required per loom conversion output mote. */
const BASE_LOOM_CONVERSION_THRESHOLD = 50;
/** Maximum number of efficiency upgrade levels per loom. */
export const MAX_LOOM_EFFICIENCY_LEVEL = 5;

/**
 * Returns the input tier for a given loom tier (the tier one step below).
 * Returns null for 'sand' (no input tier).
 */
export function getLoomInputTierId(loomTierId: TierId): TierId | null {
  const index = TIERS.findIndex(t => t.id === loomTierId);
  if (index <= 0) return null;
  return TIERS[index - 1].id;
}

/**
 * Returns the loom tier that accepts particles of the given input tier as input.
 * Returns null if no such loom exists (inputTierId is the last tier).
 */
export function getLoomForInputTier(inputTierId: TierId): TierId | null {
  const index = TIERS.findIndex(t => t.id === inputTierId);
  if (index < 0 || index >= TIERS.length - 1) return null;
  return TIERS[index + 1].id;
}

/**
 * Returns the conversion threshold (small-mote equivalents per output mote)
 * for a given efficiency level.
 * Each level reduces the threshold by ~25%, stacking multiplicatively.
 */
export function getLoomConversionThreshold(efficiencyLevel: number): number {
  return BASE_LOOM_CONVERSION_THRESHOLD / Math.pow(1.25, efficiencyLevel);
}

/**
 * Returns the mote cost to upgrade a loom's conversion efficiency by one level.
 * Cost is in the loom's own output tier motes.
 */
export function getLoomEfficiencyUpgradeCost(tierId: TierId, currentLevel: number): number {
  const tierIndex = TIERS.findIndex(t => t.id === tierId);
  return Math.floor(50 * Math.pow(3, currentLevel) * (tierIndex + 1));
}

/**
 * Processes a particle capture event for a loom.
 * Adds the captured mass to conversionProgress and produces motes when threshold is reached.
 * Returns the number of output motes produced by this capture (may be 0).
 */
export function applyLoomCapture(
  state: LoomState,
  resources: ResourceState,
  inputTierId: TierId,
  mass: number,
): number {
  const loomTierId = getLoomForInputTier(inputTierId);
  if (!loomTierId) return 0;
  const loom = getLoom(state, loomTierId);
  if (!loom || !loom.isUnlocked) return 0;

  const threshold = getLoomConversionThreshold(loom.conversionEfficiencyLevel);
  loom.conversionProgress += mass;
  let motesProduced = 0;
  while (loom.conversionProgress >= threshold) {
    loom.conversionProgress -= threshold;
    addMotes(resources, loomTierId, 1);
    motesProduced++;
  }
  return motesProduced;
}

/**
 * Attempt to purchase one loom efficiency upgrade level.
 * Returns true if successful.
 */
export function tryUpgradeLoomEfficiency(
  state: LoomState,
  resources: ResourceState,
  tierId: TierId,
  bypassCost = false,
): boolean {
  const loom = getLoom(state, tierId);
  if (!loom || !loom.isUnlocked) return false;
  if (loom.conversionEfficiencyLevel >= MAX_LOOM_EFFICIENCY_LEVEL) return false;
  const inputTierId = getLoomInputTierId(tierId);
  if (!inputTierId) return false; // sand loom has no input

  const cost = getLoomEfficiencyUpgradeCost(tierId, loom.conversionEfficiencyLevel);
  if (!bypassCost && getMotes(resources, tierId) < cost) return false;
  if (!bypassCost) spendMotes(resources, tierId, cost);
  loom.conversionEfficiencyLevel++;
  return true;
}
/** Purchase the special Resonance upgrade for a tier. Returns true if successful. */
export function purchaseSpecialLoom(
  state: LoomState,
  resources: ResourceState,
  tierId: TierId,
  bypassCost = false,
): boolean {
  if (state.specialPurchased.has(tierId)) return false;
  const loom = getLoom(state, tierId);
  if (!loom || !loom.isUnlocked) return false;
  const def = SPECIAL_LOOM_BY_TIER.get(tierId);
  if (!def) return false;
  if (!bypassCost && getMotes(resources, tierId) < def.cost) return false;
  if (!bypassCost) {
    spendMotes(resources, tierId, def.cost);
  }
  state.specialPurchased.add(tierId);
  return true;
}
