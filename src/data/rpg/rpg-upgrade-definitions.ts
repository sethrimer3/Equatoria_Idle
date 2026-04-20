/**
 * rpg-upgrade-definitions.ts — Data definitions for purchasable RPG upgrades.
 *
 * Each RpgUpgradeDefinition is the single source of truth for an upgrade's
 * identity, cost, max level, and effect descriptor.  New upgrades are added
 * here without modifying the upgrade-panel logic.
 *
 * Cost currency is always motes from the specified costTierId.
 * maxLevel = 1 means the upgrade is a one-time unlock.
 * maxLevel > 1 means the upgrade can be purchased multiple times.
 */

import type { TierId } from '../tiers';

// ─── Types ────────────────────────────────────────────────────────

export interface RpgUpgradeDefinition {
  /** Unique registry key. */
  id: string;
  /** Display name shown in the Upgrades tab. */
  name: string;
  /** Short description of the effect. */
  description: string;
  /** Mote tier used to purchase. */
  costTierId: TierId;
  /** Mote cost per level. */
  costPerLevel: number;
  /** Maximum purchasable level (1 = one-time unlock). */
  maxLevel: number;
}

// ─── Upgrade catalogue ────────────────────────────────────────────

export const RPG_UPGRADE_DEFINITIONS: RpgUpgradeDefinition[] = [
  {
    id: 'speed',
    name: 'Speed Upgrade',
    description: 'Increases player movement speed by 10% per level.',
    costTierId: 'sand',
    costPerLevel: 1_000,
    maxLevel: 10,
  },
  {
    id: 'orbit_projectile',
    name: 'Orbiting Projectile',
    description:
      'Unlocks a comet-like projectile that orbits the player. ' +
      'Deals damage on contact with enemies and explodes on impact.',
    costTierId: 'quartz',
    costPerLevel: 2_500,
    maxLevel: 1,
  },
];

/** Lookup map for O(1) access by upgrade id. */
export const RPG_UPGRADE_BY_ID = new Map<string, RpgUpgradeDefinition>(
  RPG_UPGRADE_DEFINITIONS.map(u => [u.id, u]),
);
