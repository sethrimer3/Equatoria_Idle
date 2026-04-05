import type { UpgradeDefinition } from './upgrade-types';
import { TIERS, type TierId } from '../tiers';
import {
  BASE_UPGRADE_COST,
  UPGRADE_COST_SCALE_FACTOR,
  UPGRADE_TAP_MULTIPLIER,
} from '../balance';

// ─── Per-tier tap-value upgrades ────────────────────────────────

function makeTierTapUpgrade(tierId: TierId, displayName: string, baseCost: number): UpgradeDefinition {
  return {
    id: `tap_${tierId}`,
    displayName: `${displayName} Tap`,
    description: `Increase ${displayName} motes per tap`,
    tierId,
    effectKind: 'tap_value',
    maxLevel: 0,  // unlimited
    baseCost,
    costScaleFactor: UPGRADE_COST_SCALE_FACTOR,
    effectPerLevel: UPGRADE_TAP_MULTIPLIER,
    icon: '⬆',
  };
}

/** Per-tier tap upgrades — costs grow per tier. */
export const TIER_TAP_UPGRADES: readonly UpgradeDefinition[] = TIERS
  .filter(t => !t.isSecret)
  .map((t, i) =>
    makeTierTapUpgrade(t.id, t.displayName, BASE_UPGRADE_COST * Math.pow(5, i)),
  );

// ─── Global upgrades ────────────────────────────────────────────

export const AUTO_TAP_UPGRADE: UpgradeDefinition = {
  id: 'auto_tap',
  displayName: 'Auto-Tap',
  description: 'Automatically tap the equation',
  tierId: null,
  effectKind: 'auto_tap_speed',
  maxLevel: 12,
  baseCost: 100,
  costScaleFactor: 1.8,
  effectPerLevel: 1,
  icon: '⚡',
};

export const GLOBAL_MULTIPLIER_UPGRADE: UpgradeDefinition = {
  id: 'global_mult',
  displayName: 'Amplifier',
  description: 'Multiply all mote income',
  tierId: null,
  effectKind: 'tap_multiplier',
  maxLevel: 0,
  baseCost: 500,
  costScaleFactor: 2.0,
  effectPerLevel: 0.25,   // +25 % per level
  icon: '✖',
};

// ─── All upgrade definitions ────────────────────────────────────

export const ALL_UPGRADES: readonly UpgradeDefinition[] = [
  ...TIER_TAP_UPGRADES,
  AUTO_TAP_UPGRADE,
  GLOBAL_MULTIPLIER_UPGRADE,
];

/** Quick lookup by upgrade id. */
export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDefinition> = new Map(
  ALL_UPGRADES.map(u => [u.id, u]),
);
