/**
 * weapon-definitions.ts — Data definitions for purchasable RPG weapons.
 *
 * Each WeaponDefinition is the single source of truth for a weapon's identity,
 * cost, and combat stats. New weapons are added here without modifying store logic.
 *
 * WeaponEffect variants:
 *   single   — damages the single closest enemy in range (default)
 *   multi    — damages the N closest enemies in range simultaneously
 *   aoe      — damages ALL enemies within aoeRadius of the player
 *   piercing — damages the single closest enemy, ignoring defPierceRatio of DEF
 */

import type { TierId } from '../tiers';

// ─── Types ────────────────────────────────────────────────────────

/** Discriminated union describing the special behaviour of a weapon attack. */
export type WeaponEffect =
  | { kind: 'single' }
  | { kind: 'multi';    targetCount: number }
  | { kind: 'aoe';      aoeRadius: number }
  | { kind: 'piercing'; defPierceRatio: number };

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
  /**
   * Attack effect. Defaults to `{ kind: 'single' }` when omitted.
   * Controls how many enemies are hit and whether DEF is partially bypassed.
   */
  effect?: WeaponEffect;
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
  // ── Starter / early game ──────────────────────────────────────
  {
    id: 'sand_blade',
    name: 'Sand Blade',
    description: 'A blade condensed from sand motes. Reliable single-target strikes.',
    costTierId: 'sand',
    cost: 500,
    stats: {
      damage: 5, cooldownMs: 1000, range: 60, defBonus: 0,
      effect: { kind: 'single' },
    },
  },
  {
    id: 'ruby_lance',
    name: 'Ruby Lance',
    description: 'A focused lance of ruby resonance. Strong single-target hit with a bit of protection.',
    costTierId: 'ruby',
    cost: 200,
    stats: {
      damage: 12, cooldownMs: 1500, range: 80, defBonus: 2,
      effect: { kind: 'single' },
    },
  },
  {
    id: 'sunstone_ward',
    name: 'Sunstone Ward',
    description: 'A warm defensive ward. Boosts survivability and still pokes nearby foes.',
    costTierId: 'sunstone',
    cost: 150,
    stats: {
      damage: 2, cooldownMs: 2000, range: 40, defBonus: 8,
      effect: { kind: 'single' },
    },
  },

  // ── Multi-target (passive-play friendly) ──────────────────────
  {
    id: 'emerald_spray',
    name: 'Emerald Spray',
    description:
      'Scatter-fires at the 3 nearest enemies each burst. Weaker per-hit but excellent ' +
      'against packed waves — no manual targeting needed.',
    costTierId: 'emerald',
    cost: 100,
    stats: {
      damage: 7, cooldownMs: 1400, range: 90, defBonus: 0,
      effect: { kind: 'multi', targetCount: 3 },
    },
  },

  // ── AoE (active-play: get close to the pack) ──────────────────
  {
    id: 'citrine_nova',
    name: 'Citrine Nova',
    description:
      'Detonates a radiant pulse around the player, hitting ALL enemies within 50 px. ' +
      'Move into crowds for maximum payoff.',
    costTierId: 'citrine',
    cost: 80,
    stats: {
      damage: 9, cooldownMs: 1800, range: 50, defBonus: 1,
      effect: { kind: 'aoe', aoeRadius: 50 },
    },
  },

  // ── DEF-piercing (burst single-target) ────────────────────────
  {
    id: 'sapphire_spike',
    name: 'Sapphire Spike',
    description:
      'A focused sapphire bolt that ignores 60 % of enemy DEF. Slow fire rate but ' +
      'devastates heavily-armoured solo targets.',
    costTierId: 'sapphire',
    cost: 50,
    stats: {
      damage: 18, cooldownMs: 2200, range: 100, defBonus: 0,
      effect: { kind: 'piercing', defPierceRatio: 0.6 },
    },
  },
];

/** Lookup map for O(1) access by weapon id. */
export const WEAPON_BY_ID = new Map<string, WeaponDefinition>(
  WEAPON_DEFINITIONS.map(w => [w.id, w]),
);
