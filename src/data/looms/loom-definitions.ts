/**
 * Loom definitions — data-driven passive production for each gemstone tier.
 * Each tier has a Loom that passively produces motes over time.
 */

import type { TierId } from '../tiers';

/** Configuration for a single tier's Loom. */
export interface LoomDefinition {
  readonly tierId: TierId;
  readonly displayName: string;
  readonly description: string;
  /** Base motes produced per second at level 1. */
  readonly baseRate: number;
  /** Additional motes/sec gained per upgrade level. */
  readonly ratePerLevel: number;
  /** Cost of the first Loom upgrade. */
  readonly baseCost: number;
  /** Exponential cost scaling per level. */
  readonly costScaleFactor: number;
}

/** All Loom definitions, indexed by tier. */
export const LOOM_DEFINITIONS: readonly LoomDefinition[] = [
  {
    tierId: 'sand',
    displayName: 'Sand Loom',
    description: 'Weaves raw sand into Sand motes.',
    baseRate: 1,
    ratePerLevel: 1,
    baseCost: 5,
    costScaleFactor: 1.25,
  },
  {
    tierId: 'quartz',
    displayName: 'Quartz Loom',
    description: 'Crystallizes ambient light into Quartz motes.',
    baseRate: 0.8,
    ratePerLevel: 0.8,
    baseCost: 25,
    costScaleFactor: 1.3,
  },
  {
    tierId: 'ruby',
    displayName: 'Ruby Loom',
    description: 'Condenses heat into Ruby motes.',
    baseRate: 0.6,
    ratePerLevel: 0.6,
    baseCost: 100,
    costScaleFactor: 1.35,
  },
  {
    tierId: 'sunstone',
    displayName: 'Sunstone Loom',
    description: 'Captures solar radiance as Sunstone motes.',
    baseRate: 0.5,
    ratePerLevel: 0.5,
    baseCost: 500,
    costScaleFactor: 1.4,
  },
  {
    tierId: 'citrine',
    displayName: 'Citrine Loom',
    description: 'Spins golden energy into Citrine motes.',
    baseRate: 0.4,
    ratePerLevel: 0.4,
    baseCost: 2500,
    costScaleFactor: 1.45,
  },
  {
    tierId: 'emerald',
    displayName: 'Emerald Loom',
    description: 'Cultivates living stone into Emerald motes.',
    baseRate: 0.3,
    ratePerLevel: 0.3,
    baseCost: 12500,
    costScaleFactor: 1.5,
  },
  {
    tierId: 'sapphire',
    displayName: 'Sapphire Loom',
    description: 'Distills deep waters into Sapphire motes.',
    baseRate: 0.25,
    ratePerLevel: 0.25,
    baseCost: 60000,
    costScaleFactor: 1.55,
  },
  {
    tierId: 'iolite',
    displayName: 'Iolite Loom',
    description: 'Refracts twilight into Iolite motes.',
    baseRate: 0.2,
    ratePerLevel: 0.2,
    baseCost: 300000,
    costScaleFactor: 1.6,
  },
  {
    tierId: 'amethyst',
    displayName: 'Amethyst Loom',
    description: 'Transmutes dream-essence into Amethyst motes.',
    baseRate: 0.15,
    ratePerLevel: 0.15,
    baseCost: 1500000,
    costScaleFactor: 1.65,
  },
  {
    tierId: 'diamond',
    displayName: 'Diamond Loom',
    description: 'Compresses pure pressure into Diamond motes.',
    baseRate: 0.1,
    ratePerLevel: 0.1,
    baseCost: 8000000,
    costScaleFactor: 1.7,
  },
  {
    tierId: 'nullstone',
    displayName: 'Nullstone Loom',
    description: 'Draws from the void itself.',
    baseRate: 0.05,
    ratePerLevel: 0.05,
    baseCost: 50000000,
    costScaleFactor: 1.8,
  },
];

/** Quick lookup by tier ID. */
export const LOOM_BY_TIER: ReadonlyMap<TierId, LoomDefinition> = new Map(
  LOOM_DEFINITIONS.map(l => [l.tierId, l]),
);

/** Compute the cost to upgrade a Loom at a given level. */
export function loomUpgradeCost(def: LoomDefinition, level: number): number {
  return Math.floor(def.baseCost * Math.pow(def.costScaleFactor, level));
}

/** Compute motes per second for a Loom at a given level. */
export function loomProductionRate(def: LoomDefinition, level: number): number {
  if (level <= 0) return 0;
  return def.baseRate + (level - 1) * def.ratePerLevel;
}
