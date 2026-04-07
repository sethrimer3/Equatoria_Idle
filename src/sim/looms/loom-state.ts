/**
 * Loom simulation state — tracks level and production for each tier's Loom.
 * Looms passively generate motes over time.
 */

import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';
import { LOOM_BY_TIER, loomProductionRate, loomUpgradeCost } from '../../data/looms';

// ─── Types ──────────────────────────────────────────────────────

/** Per-tier Loom state. */
export interface LoomTierState {
  tierId: TierId;
  level: number;          // 0 = not yet purchased, 1+ = active
  isUnlocked: boolean;    // whether the player can see/use this Loom
  accumulatorMs: number;  // fractional mote accumulator (sub-second)
}

/** Full Loom state across all tiers. */
export interface LoomState {
  looms: LoomTierState[];
}

// ─── Factory ────────────────────────────────────────────────────

export function createLoomState(): LoomState {
  return {
    looms: TIERS.map((t, i) => ({
      tierId: t.id,
      level: i === 0 ? 1 : 0,       // Sand Loom starts at level 1
      isUnlocked: i === 0,           // Only Sand Loom unlocked at start
      accumulatorMs: 0,
    })),
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
 */
export function tickLooms(state: LoomState, deltaMs: number): Map<TierId, number> {
  const produced = new Map<TierId, number>();

  for (const loom of state.looms) {
    if (!loom.isUnlocked || loom.level <= 0) continue;

    const rate = getLoomRate(loom.tierId, loom.level);
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
