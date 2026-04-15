/**
 * Special Loom upgrade definitions — one-time upgrades per tier.
 * Each special upgrade doubles that tier's Loom production rate.
 */

import type { TierId } from '../tiers';

export interface SpecialLoomDefinition {
  readonly tierId: TierId;
  readonly displayName: string;
  readonly description: string;
  /** Cost in that tier's motes to purchase this special upgrade. */
  readonly cost: number;
}

export const SPECIAL_LOOM_DEFINITIONS: readonly SpecialLoomDefinition[] = [
  { tierId: 'sand',       displayName: 'Sand Resonance',       description: 'Doubles Sand Loom production.',       cost: 500 },
  { tierId: 'quartz',     displayName: 'Quartz Resonance',     description: 'Doubles Quartz Loom production.',     cost: 2500 },
  { tierId: 'ruby',       displayName: 'Ruby Resonance',       description: 'Doubles Ruby Loom production.',       cost: 10000 },
  { tierId: 'sunstone',   displayName: 'Sunstone Resonance',   description: 'Doubles Sunstone Loom production.',   cost: 50000 },
  { tierId: 'citrine',    displayName: 'Citrine Resonance',    description: 'Doubles Citrine Loom production.',    cost: 250000 },
  { tierId: 'emerald',    displayName: 'Emerald Resonance',    description: 'Doubles Emerald Loom production.',    cost: 1250000 },
  { tierId: 'sapphire',   displayName: 'Sapphire Resonance',   description: 'Doubles Sapphire Loom production.',   cost: 6000000 },
  { tierId: 'iolite',     displayName: 'Iolite Resonance',     description: 'Doubles Iolite Loom production.',     cost: 30000000 },
  { tierId: 'amethyst',   displayName: 'Amethyst Resonance',   description: 'Doubles Amethyst Loom production.',   cost: 150000000 },
  { tierId: 'diamond',    displayName: 'Diamond Resonance',    description: 'Doubles Diamond Loom production.',    cost: 800000000 },
  { tierId: 'nullstone',  displayName: 'Nullstone Resonance',  description: 'Doubles Nullstone Loom production.',  cost: 5000000000 },
  { tierId: 'fracteryl',  displayName: 'Fracteryl Resonance',  description: 'Doubles Fracteryl Loom production.',  cost: 25000000000 },
  { tierId: 'eigenstein', displayName: 'Eigenstein Resonance', description: 'Doubles Eigenstein Loom production.', cost: 100000000000 },
];

export const SPECIAL_LOOM_BY_TIER: ReadonlyMap<TierId, SpecialLoomDefinition> = new Map(
  SPECIAL_LOOM_DEFINITIONS.map(s => [s.tierId, s]),
);
