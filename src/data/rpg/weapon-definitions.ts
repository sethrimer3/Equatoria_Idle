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
  | { kind: 'multi';      targetCount: number }
  | { kind: 'aoe';        aoeRadius: number }
  | { kind: 'piercing';   defPierceRatio: number }
  /** Rapid-fire projectiles flying toward the nearest target. */
  | { kind: 'gatling' }
  /** Chain whip of 5 circles that lashes toward the nearest target periodically. */
  | { kind: 'chainWhip' }
  /** Infinite-length laser beam that pierces all enemies and shields. */
  | { kind: 'laserBeam' }
  /**
   * Gravity vortex placed in the aim direction. Sucks enemies toward its center
   * and deals low persistent damage. Cooldown = 2 × duration. Tier 4+ fires two
   * vortexes, tier 7 fires three, equidistant in angle.
   */
  | { kind: 'vortex' }
  /**
   * Melee sword combo: right swing → left swing → 360 spin.
   * Leaves a prismatic trail. Ignores all DEF. Slow between-combo cooldown.
   * Sword length (reach) scales with weapon tier.
   */
  | { kind: 'swordCombo' }
  /**
   * Single-target poison magic projectile. On hit applies a poison DoT whose
   * total damage, duration, and armour-ignore ratio all scale with tier.
   */
  | { kind: 'poisonBolt' }
  /**
   * Heat-seeking emerald missiles fired at the nearest enemy.
   * Each missile homes toward its target and leaves a gorgeous emerald comet trail.
   * Higher tiers increase damage and fire rate.
   */
  | { kind: 'emeraldMissile' }
  /**
   * Lays proximity/fuse mines at the player's current position.
   * Each mine explodes after a fixed fuse time or when an enemy gets close.
   * Taking damage detonates the mine prematurely. Higher tiers increase
   * fire rate (up to 2/s), base damage, and AOE explosion radius.
   */
  | { kind: 'sunstoneMine' }
  /**
   * Sapphire companion ships that orbit and fire at the nearest enemy.
   * Ship count = weapon tier (1-7). Ships fire small curving lasers at nearby enemies.
   */
  | { kind: 'sapphireShip' }
  /**
   * Amethyst companion ships that target the furthest enemies from the player.
   * Ship count = weapon tier (1-7). Ships fire spiraling lasers that pierce enemies.
   */
  | { kind: 'amethystShip' };

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
  // ── Tier 0: Sand ──────────────────────────────────────────────
  {
    id: 'sand_blade',
    name: 'Sand Gatling',
    description: 'A rapid-fire sand cannon. Low damage per shot, but blazing fire rate.',
    costTierId: 'sand',
    cost: 500,
    stats: {
      damage: 2, cooldownMs: 100, range: 90, defBonus: 0,
      effect: { kind: 'gatling' },
    },
  },

  // ── Tier 1: Quartz ────────────────────────────────────────────
  {
    id: 'quartz_shard',
    name: 'Quartz Chain Whip',
    description: 'A fluid whip of 30 linked quartz polygons that lashes at the nearest enemy periodically. Deals persistent contact damage.',
    costTierId: 'quartz',
    cost: 300,
    stats: {
      damage: 4, cooldownMs: 2500, range: 75, defBonus: 1,
      effect: { kind: 'chainWhip' },
    },
  },

  // ── Tier 2: Ruby ──────────────────────────────────────────────
  {
    id: 'ruby_lance',
    name: 'Ruby Laser',
    description: 'A devastating beam of ruby resonance. Immense power, very slow fire rate. Pierces all enemies and shields from one edge to the other.',
    costTierId: 'ruby',
    cost: 200,
    stats: {
      damage: 80, cooldownMs: 4000, range: 9999, defBonus: 2,
      effect: { kind: 'laserBeam' },
    },
  },

  // ── Tier 3: Sunstone ──────────────────────────────────────────
  {
    id: 'sunstone_ward',
    name: 'Sunstone Mine Layer',
    description:
      'Plants proximity mines that detonate after 15 seconds or when an enemy steps close. ' +
      'Mines hit by enemy attacks explode immediately. Massive AOE damage on detonation. ' +
      'Higher tiers increase mine-laying speed (up to 2 per second), base damage, and explosion radius.',
    costTierId: 'sunstone',
    cost: 150,
    stats: {
      damage: 40, cooldownMs: 2000, range: 9999, defBonus: 8,
      effect: { kind: 'sunstoneMine' },
    },
  },

  // ── Tier 4: Citrine ───────────────────────────────────────────
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

  // ── Tier 5: Emerald ───────────────────────────────────────────
  {
    id: 'emerald_spray',
    name: 'Emerald RPG',
    description:
      'Fires heat-seeking emerald missiles that home relentlessly toward their target, ' +
      'leaving a gorgeous emerald comet trail. Higher tiers increase damage and fire rate.',
    costTierId: 'emerald',
    cost: 100,
    stats: {
      damage: 7, cooldownMs: 2800, range: 90, defBonus: 0,
      effect: { kind: 'emeraldMissile' },
    },
  },

  // ── Tier 6: Sapphire ──────────────────────────────────────────
  {
    id: 'sapphire_spike',
    name: 'Sapphire Ships',
    description:
      'Deploys companion ships that orbit the nearest enemy and fire small curving lasers. ' +
      'Higher tiers deploy more ships (tier = ship count). Ships prioritize nearby enemies first, ' +
      'then fall back to the nearest enemy.',
    costTierId: 'sapphire',
    cost: 50,
    stats: {
      damage: 2, cooldownMs: 250, range: 60, defBonus: 0,
      effect: { kind: 'sapphireShip' },
    },
  },

  // ── Tier 7: Iolite ────────────────────────────────────────────
  {
    id: 'iolite_volley',
    name: 'Iolite Poison Bolt',
    description:
      'A sickly violet magic projectile that saturates a single target with virulent poison. ' +
      'Each tier ignores 10 % more of the target\'s armour on poison ticks only (up to 70 % at tier 7). ' +
      'Total poison damage scales as tier × 1 000 % of base (1 000 % at tier 1, 7 000 % at tier 7). ' +
      'Higher tiers also deliver the full payload faster: 70 s at tier 1 down to 10 s at tier 7.',
    costTierId: 'iolite',
    cost: 40,
    stats: {
      damage: 10, cooldownMs: 2200, range: 110, defBonus: 1,
      effect: { kind: 'poisonBolt' },
    },
  },

  // ── Tier 8: Amethyst ──────────────────────────────────────────
  {
    id: 'amethyst_pierce',
    name: 'Amethyst Ships',
    description:
      'Deploys companion ships that orbit the furthest enemy from the player and fire spiraling lasers. ' +
      'Lasers deal 30× base damage, pierce through multiple enemies, and ignore shields. ' +
      'Higher tiers deploy more ships (tier = ship count).',
    costTierId: 'amethyst',
    cost: 30,
    stats: {
      damage: 1, cooldownMs: 3000, range: 0, defBonus: 3,
      effect: { kind: 'amethystShip' },
    },
  },

  // ── Tier 9: Diamond ───────────────────────────────────────────
  {
    id: 'diamond_bastion',
    name: 'Diamond Sword',
    description:
      'A blade of prismatic diamond shards that trails behind the player like a loose hinge. ' +
      'Automatically swipes at the nearest enemy in range with a blazing-fast crescent cut, ' +
      'leaving a bright prismatic arc and firing a thin prismatic beam that cuts through the target. ' +
      'Ignores all enemy DEF. Very fast swipe rate but moderate damage. ' +
      'Higher tiers extend the blade\'s reach.',
    costTierId: 'diamond',
    cost: 20,
    stats: {
      damage: 12, cooldownMs: 900, range: 70, defBonus: 8,
      effect: { kind: 'swordCombo' },
    },
  },

  // ── Tier 10: Nullstone ────────────────────────────────────────
  {
    id: 'nullstone_nova',
    name: 'Nullstone Vortex',
    description:
      'Conjures a massive gravity vortex in the direction you are moving, relentlessly ' +
      'pulling all nearby enemies toward its core while dealing low, persistent void damage. ' +
      'Fire rate is exactly twice the vortex duration. Higher tiers create a larger, ' +
      'longer-lasting vortex. Tier 4+ fires two vortexes simultaneously; tier 7 fires three, ' +
      'spread equidistant in angle.',
    costTierId: 'nullstone',
    cost: 10,
    stats: {
      damage: 8, cooldownMs: 6000, range: 120, defBonus: 5,
      effect: { kind: 'vortex' },
    },
  },
];

/** Lookup map for O(1) access by weapon id. */
export const WEAPON_BY_ID = new Map<string, WeaponDefinition>(
  WEAPON_DEFINITIONS.map(w => [w.id, w]),
);
