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
 *
 * skillPointCost: skill points spent per rank (1–4).
 *   1 = small stat boosts / early utility
 *   2 = strong repeatable combat upgrades
 *   3 = major unlocks or build-defining upgrades
 *   4 = keystones: extra weapon slots, revive effects, major damage engines
 */

import type { TierId } from '../tiers';

// ─── Types ────────────────────────────────────────────────────────

export interface RpgUpgradeDefinition {
  /** Unique registry key. */
  id: string;
  /** Display name shown in the Skill Tree and Upgrades tab. */
  name: string;
  /** Short description of the effect. */
  description: string;
  /** Mote tier used to purchase. */
  costTierId: TierId;
  /** Mote cost per level. */
  costPerLevel: number;
  /** Maximum purchasable level (1 = one-time unlock). */
  maxLevel: number;
  /** Skill points spent per rank purchase (1–4). */
  skillPointCost: number;
  /**
   * Whether the gameplay effect is fully wired into the simulation.
   * 'active'      — effect is implemented and running.
   * 'placeholder' — node can be purchased and persists, but the hook is pending.
   * Omitted (undefined) defaults to 'active' for legacy entries.
   */
  implementationStatus?: 'active' | 'placeholder';
}

// ─── Upgrade catalogue ────────────────────────────────────────────

export const RPG_UPGRADE_DEFINITIONS: RpgUpgradeDefinition[] = [

  // ── Core branch ──────────────────────────────────────────────────
  {
    id: 'awakening',
    name: 'Awakening',
    description: 'Activates the RPG skill tree. Required to unlock any other skill.',
    costTierId: 'sand',
    costPerLevel: 0,
    maxLevel: 1,
    skillPointCost: 1,
  },
  {
    id: 'rpg_training',
    name: 'RPG Training',
    description: '+3% player damage per rank.',
    costTierId: 'sand',
    costPerLevel: 500,
    maxLevel: 3,
    skillPointCost: 1,
  },
  {
    id: 'battle_focus',
    name: 'Battle Focus',
    description: '+2% attack speed per rank (faster weapon cooldown).',
    costTierId: 'sand',
    costPerLevel: 600,
    maxLevel: 2,
    skillPointCost: 1,
  },
  {
    id: 'codex_initiate',
    name: 'Codex Initiate',
    description: '+5% XP from enemy codex progress per rank.',
    costTierId: 'quartz',
    costPerLevel: 1_000,
    maxLevel: 2,
    skillPointCost: 1,
    implementationStatus: 'placeholder',
  },

  // ── Movement branch ───────────────────────────────────────────────
  {
    id: 'speed',
    name: 'Speed Upgrade',
    description: 'Increases player movement speed by 10% per rank.',
    costTierId: 'sand',
    costPerLevel: 1_000,
    maxLevel: 10,
    skillPointCost: 1,
  },
  {
    id: 'acceleration',
    name: 'Acceleration',
    description: 'Faster start-up responsiveness when changing direction.',
    costTierId: 'sand',
    costPerLevel: 800,
    maxLevel: 5,
    skillPointCost: 1,
    implementationStatus: 'placeholder',
  },
  {
    id: 'dash',
    name: 'Dash Unlock',
    description: 'Unlocks a short velocity burst with a 0.6 s cooldown.',
    costTierId: 'sand',
    costPerLevel: 500,
    maxLevel: 1,
    skillPointCost: 3,
  },
  {
    id: 'dash_cooldown',
    name: 'Dash Cooldown',
    description: 'Reduces dash cooldown by 15% per rank.',
    costTierId: 'sand',
    costPerLevel: 1_500,
    maxLevel: 4,
    skillPointCost: 2,
  },
  {
    id: 'afterimage',
    name: 'Afterimage',
    description: 'Dashing leaves a brief visual afterimage.',
    costTierId: 'quartz',
    costPerLevel: 2_000,
    maxLevel: 2,
    skillPointCost: 2,
    implementationStatus: 'placeholder',
  },

  // ── Defense branch ────────────────────────────────────────────────
  {
    id: 'block_chance',
    name: 'Block Chance',
    description: '+4% chance per rank to block incoming damage.',
    costTierId: 'ruby',
    costPerLevel: 3_000,
    maxLevel: 5,
    skillPointCost: 2,
  },
  {
    id: 'block_strength',
    name: 'Block Strength',
    description: 'Reduces blocked damage taken by 7% per rank (min 10% taken).',
    costTierId: 'ruby',
    costPerLevel: 3_000,
    maxLevel: 4,
    skillPointCost: 2,
  },
  {
    id: 'projectile_deflection',
    name: 'Projectile Deflection',
    description: '+5% chance per rank to ignore incoming projectile damage.',
    costTierId: 'ruby',
    costPerLevel: 3_500,
    maxLevel: 3,
    skillPointCost: 2,
  },
  {
    id: 'status_resistance',
    name: 'Status Resistance',
    description: 'Reduces duration of poison/burn/freeze/slow by 20% per rank.',
    costTierId: 'emerald',
    costPerLevel: 3_000,
    maxLevel: 3,
    skillPointCost: 2,
    implementationStatus: 'placeholder',
  },
  {
    id: 'second_wind',
    name: 'Second Wind',
    description: 'Once per wave, survive a lethal hit at 1 HP instead of dying.',
    costTierId: 'emerald',
    costPerLevel: 10_000,
    maxLevel: 1,
    skillPointCost: 4,
  },

  // ── Weapons branch ────────────────────────────────────────────────
  {
    id: 'extra_weapon_slot',
    name: 'Extra Weapon Slot',
    description: '+1 weapon slot per rank. Can be purchased up to 4 times (5 total slots).',
    costTierId: 'ruby',
    costPerLevel: 5_000,
    maxLevel: 4,
    skillPointCost: 4,
  },
  {
    id: 'weapon_mastery',
    name: 'Weapon Mastery',
    description: '+4% weapon damage per rank (applies to crafted weapons).',
    costTierId: 'ruby',
    costPerLevel: 5_000,
    maxLevel: 5,
    skillPointCost: 2,
  },
  {
    id: 'dominance_amp',
    name: 'Dominance Amplifier',
    description: '+6% crafted weapon damage per rank (stacks with Weapon Mastery).',
    costTierId: 'sunstone',
    costPerLevel: 5_000,
    maxLevel: 4,
    skillPointCost: 2,
  },
  {
    id: 'balanced_alloy',
    name: 'Balanced Alloy',
    description: 'Reduces penalties from mixed-color weapon compositions.',
    costTierId: 'sunstone',
    costPerLevel: 4_000,
    maxLevel: 3,
    skillPointCost: 2,
    implementationStatus: 'placeholder',
  },
  {
    id: 'quick_swap',
    name: 'Quick Swap',
    description: 'Unlocks faster weapon swapping utility.',
    costTierId: 'ruby',
    costPerLevel: 3_000,
    maxLevel: 1,
    skillPointCost: 2,
    implementationStatus: 'placeholder',
  },

  // ── Orbiting Projectile branch ────────────────────────────────────
  {
    id: 'orbit_projectile',
    name: 'Orbiting Projectile',
    description: 'Unlocks a comet that orbits the player and deals contact damage.',
    costTierId: 'quartz',
    costPerLevel: 2_500,
    maxLevel: 1,
    skillPointCost: 3,
  },
  {
    id: 'orbit_count',
    name: 'Orbital Count',
    description: 'Adds one extra orbiting projectile per rank (max +3).',
    costTierId: 'quartz',
    costPerLevel: 4_000,
    maxLevel: 3,
    skillPointCost: 3,
  },
  {
    id: 'orbit_detonation',
    name: 'Orbital Detonation',
    description: 'Orbiting projectiles detonate on impact, dealing +30% burst damage.',
    costTierId: 'quartz',
    costPerLevel: 3_000,
    maxLevel: 1,
    skillPointCost: 4,
  },
  {
    id: 'piercing_orbit',
    name: 'Piercing Orbit',
    description: 'Orbital projectiles can strike additional enemies per rotation (reduced collision consumption).',
    costTierId: 'quartz',
    costPerLevel: 3_500,
    maxLevel: 3,
    skillPointCost: 2,
  },
  {
    id: 'orbital_radius',
    name: 'Orbital Radius',
    description: '+12% orbital radius per rank for wider coverage. (TODO: orbit radius hook)',
    costTierId: 'quartz',
    costPerLevel: 2_000,
    maxLevel: 3,
    skillPointCost: 1,
  },
  {
    id: 'comet_return',
    name: 'Comet Return',
    description: 'Orbital projectile reforms 40% faster after impact or expiration. (TODO: reform speed hook)',
    costTierId: 'quartz',
    costPerLevel: 4_000,
    maxLevel: 1,
    skillPointCost: 3,
  },

  // ── Elemental / Crystal branch ────────────────────────────────────
  {
    id: 'elemental_attunement',
    name: 'Elemental Attunement',
    description: '+4% weapon effect strength from elemental crystal composition per rank. (TODO: composition bonus hook)',
    costTierId: 'sunstone',
    costPerLevel: 5_000,
    maxLevel: 5,
    skillPointCost: 2,
  },
  {
    id: 'sand_agility',
    name: 'Sand Agility',
    description: 'Improves fire rate with Sand-dominant weapons. (TODO: sand fire-rate hook)',
    costTierId: 'sand',
    costPerLevel: 1_500,
    maxLevel: 2,
    skillPointCost: 1,
  },
  {
    id: 'quartz_multiplicity',
    name: 'Quartz Multiplicity',
    description: '+1 extra projectile per rank with Quartz-dominant weapons. (TODO: quartz projectile hook)',
    costTierId: 'quartz',
    costPerLevel: 3_000,
    maxLevel: 2,
    skillPointCost: 2,
  },
  {
    id: 'ruby_penetration',
    name: 'Ruby Penetration',
    description: '+8% armor pierce per rank with Ruby-dominant weapons. (TODO: ruby pierce hook)',
    costTierId: 'ruby',
    costPerLevel: 3_000,
    maxLevel: 2,
    skillPointCost: 2,
  },
  {
    id: 'citrine_bloom',
    name: 'Citrine Bloom',
    description: '+15% AoE radius per rank with Citrine-dominant weapons. (TODO: citrine AoE hook)',
    costTierId: 'citrine',
    costPerLevel: 3_000,
    maxLevel: 2,
    skillPointCost: 2,
  },
  {
    id: 'emerald_seeking',
    name: 'Emerald Seeking',
    description: '+10% homing strength per rank with Emerald-dominant weapons. (TODO: emerald homing hook)',
    costTierId: 'emerald',
    costPerLevel: 3_000,
    maxLevel: 2,
    skillPointCost: 2,
  },
  {
    id: 'sapphire_precision',
    name: 'Sapphire Precision',
    description: '+8% crit chance/damage per rank with Sapphire-dominant weapons. (TODO: sapphire crit hook)',
    costTierId: 'sapphire',
    costPerLevel: 3_000,
    maxLevel: 2,
    skillPointCost: 2,
  },
  {
    id: 'amethyst_echo',
    name: 'Amethyst Echo',
    description: 'Amethyst ships fire an extra echo projectile on attack. (TODO: amethyst echo hook)',
    costTierId: 'amethyst',
    costPerLevel: 6_000,
    maxLevel: 1,
    skillPointCost: 3,
  },
  {
    id: 'diamond_severance',
    name: 'Diamond Severance',
    description: 'Diamond weapons ignore an additional 15% enemy armor. (TODO: diamond armor-ignore hook)',
    costTierId: 'diamond',
    costPerLevel: 6_000,
    maxLevel: 1,
    skillPointCost: 3,
  },

  // ── Resource / Utility branch ─────────────────────────────────────
  {
    id: 'mote_magnetism',
    name: 'Mote Magnetism',
    description: 'Increases lucky mote pickup radius by 30% per rank.',
    costTierId: 'sand',
    costPerLevel: 800,
    maxLevel: 5,
    skillPointCost: 1,
  },
  {
    id: 'battle_salvage',
    name: 'Battle Salvage',
    description: '+8% lucky mote drop rate per rank from defeated enemies.',
    costTierId: 'sand',
    costPerLevel: 2_000,
    maxLevel: 5,
    skillPointCost: 2,
  },
  {
    id: 'boss_spoils',
    name: 'Boss Spoils',
    description: 'Bosses drop enhanced lucky mote rewards. (TODO: boss loot hook)',
    costTierId: 'sunstone',
    costPerLevel: 8_000,
    maxLevel: 1,
    skillPointCost: 3,
  },
  {
    id: 'treasure_sense',
    name: 'Treasure Sense',
    description: '+10% chance per rank for elite enemies to drop a second lucky mote.',
    costTierId: 'emerald',
    costPerLevel: 2_500,
    maxLevel: 2,
    skillPointCost: 1,
  },

  // ── Legacy upgrades (kept for save compatibility; not shown in skill tree UI) ──
  {
    id: 'evasion',
    name: 'Evasion',
    description: 'While moving, grants a 14% chance per rank to dodge incoming hits.',
    costTierId: 'quartz',
    costPerLevel: 2_000,
    maxLevel: 5,
    skillPointCost: 2,
  },
  {
    id: 'xp_gain',
    name: 'XP Gain',
    description: 'Increases XP earned from enemies by 8% per rank.',
    costTierId: 'sand',
    costPerLevel: 800,
    maxLevel: 5,
    skillPointCost: 1,
  },
  {
    id: 'forge_craft_level',
    name: 'Forge Capacity',
    description: 'Increases the number of mote types combinable per forge craft.',
    costTierId: 'emerald',
    costPerLevel: 8_000,
    maxLevel: 4,
    skillPointCost: 2,
  },
];

/** Lookup map for O(1) access by upgrade id. */
export const RPG_UPGRADE_BY_ID = new Map<string, RpgUpgradeDefinition>(
  RPG_UPGRADE_DEFINITIONS.map(u => [u.id, u]),
);
