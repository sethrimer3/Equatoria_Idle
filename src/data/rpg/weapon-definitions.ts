/**
 * weapon-definitions.ts — Data definitions for purchasable RPG weapons.
 *
 * Each WeaponDefinition is the single source of truth for a weapon's identity,
 * cost, and combat stats. New weapons are added here without modifying store logic.
 */

import type { TierId } from '../tiers';

// ─── Types ────────────────────────────────────────────────────────

/** Combat stats granted by equipping this weapon. */
export interface WeaponStats {
  /** Bonus damage dealt per attack. */
  damage: number;
  /** Milliseconds between automatic player attacks. */
  cooldownMs: number;
  /** Maximum range in internal canvas pixels. */
  range: number;
  /** Flat bonus added to player DEF while equipped. */
  defBonus: number;
}

/** Full definition for a purchasable weapon. */
export interface WeaponDefinition {
  /** Unique registry key. */
  id: string;
  /** Display name shown in the store. */
  name: string;
  /** Short flavour/stats description. */
  description: string;
  /** TierId of the mote currency used to purchase. */
  costTierId: TierId;
  /** Purchase price in the specified mote tier. */
  cost: number;
  stats: WeaponStats;
}

// ─── Weapon catalogue ─────────────────────────────────────────────

export const WEAPON_DEFINITIONS: WeaponDefinition[] = [
  {
    id: 'sand_blade',
    name: 'Sand Blade',
    description: 'A blade condensed from sand motes. +5 DMG, solid starter weapon.',
    costTierId: 'sand',
    cost: 500,
    stats: { damage: 5, cooldownMs: 1000, range: 60, defBonus: 0 },
  },
  {
    id: 'ruby_lance',
    name: 'Ruby Lance',
    description: 'A piercing lance imbued with ruby resonance. +12 DMG, +2 DEF.',
    costTierId: 'ruby',
    cost: 200,
    stats: { damage: 12, cooldownMs: 1500, range: 80, defBonus: 2 },
  },
  {
    id: 'sunstone_ward',
    name: 'Sunstone Ward',
    description: 'A defensive ward radiating warm light. +2 DMG, +8 DEF.',
    costTierId: 'sunstone',
    cost: 150,
    stats: { damage: 2, cooldownMs: 2000, range: 40, defBonus: 8 },
  },
];

/** Lookup map for O(1) access by weapon id. */
export const WEAPON_BY_ID = new Map<string, WeaponDefinition>(
  WEAPON_DEFINITIONS.map(w => [w.id, w]),
);
