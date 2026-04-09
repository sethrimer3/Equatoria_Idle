import type { TierId } from '../tiers';

// ─── Upgrade types ──────────────────────────────────────────────

/** What an upgrade affects in the simulation. */
export type UpgradeEffectKind =
  | 'tap_value'         // increases a tier's equation segment level/strength
  | 'auto_tap_speed'    // reduces auto-tap interval
  | 'tap_multiplier'    // global multiplier on all tap income
  | 'tier_unlock';      // unlocks next tier

/** A single upgrade definition (data only, no mutable state). */
export interface UpgradeDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  readonly tierId: TierId | null;      // null ⇒ global upgrade
  readonly effectKind: UpgradeEffectKind;
  readonly maxLevel: number;           // 0 ⇒ unlimited
  readonly baseCost: number;
  readonly costScaleFactor: number;
  readonly effectPerLevel: number;     // meaning depends on effectKind
  readonly icon: string;               // emoji or short text
}

/** Compute cost at a given level. */
export function upgradeCostAtLevel(def: UpgradeDefinition, level: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costScaleFactor, level));
}
