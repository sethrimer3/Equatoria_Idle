import type { TierId } from '../tiers';

/**
 * What kind of bonus an achievement grants.
 * - tap_multiplier: multiplies all tap mote gains
 * - loom_multiplier: multiplies all loom production rates
 * - base_atk: adds +bonusMultiplier to the RPG player's base ATK stat
 */
export type AchievementBonusKind = 'tap_multiplier' | 'loom_multiplier' | 'base_atk';

/**
 * Discriminated union describing how an achievement is unlocked.
 *
 * lifetime_motes          — earn at least `amount` lifetime motes of `tierId`
 * forge_unlocked           — unlock the Equation Forge
 * tap_count                — reach `count` total taps on the equation
 * equation_tiers           — unlock at least `count` equation tiers (including the starting one)
 * wave_reached             — reach wave `wave` or higher in RPG mode
 * weapon_purchased         — purchase the weapon with id `weaponId`
 * any_weapon_max_tier      — upgrade any single weapon to the maximum tier (7)
 * specific_weapon_max_tier — upgrade the specific weapon `weaponId` to max tier (7)
 * weapons_at_max_tier      — upgrade at least `count` weapons to max tier (7)
 * all_purchased_max_tier   — upgrade all purchased weapons to max tier (7)
 * weapons_purchased_count  — purchase at least `count` weapons total
 * xp_reached               — accumulate at least `xp` total XP in RPG mode
 * boss_defeated            — defeat at least `count` bosses total
 * specific_boss_defeated   — defeat the boss with id `bossId` at least once
 * specific_boss_at_speed   — defeat boss `bossId` at `minSpeedPct`% speed or higher
 * any_boss_at_speed        — defeat any boss at `minSpeedPct`% speed or higher
 * all_bosses_at_speed      — defeat all defeated bosses at `minSpeedPct`% speed or higher
 * equip_weapons_count      — equip exactly `count` weapons at once (highest seen)
 * rpg_upgrade_level        — buy at least `level` levels of upgrade `upgradeId`
 * rpg_upgrade_any_max      — max out any single RPG upgrade
 * xp_allocated_stat        — allocate XP to stat `stat` at least once
 * xp_allocated_stats_count — allocate XP to at least `count` different stats simultaneously
 * xp_to_stat               — accumulate at least `amount` XP in stat `stat`
 * total_kills              — defeat `count` regular enemies lifetime
 * kills_of_type            — defeat `count` enemies of type `typeId` lifetime
 * elite_kills_total        — defeat `count` elite enemies lifetime
 * aliven_kills_total       — defeat `count` aliven groups lifetime
 * late_enemy_kills_total   — defeat `count` late-tier enemies (diamond/nullstone/fracteryl/eigenstein)
 * lucky_motes_total        — collect `count` lucky mote drops lifetime
 * survival_minutes         — survive `minutes` total minutes in RPG mode
 * wave_streak              — clear `count` consecutive waves without dying
 * damage_free_streak       — clear `count` consecutive waves without taking damage
 * waves_completed          — complete `count` total waves lifetime
 * boss_defeated_any_speed_1weapon — defeat a boss while equipped with only 1 weapon
 */
export type AchievementCondition =
  | { readonly kind: 'lifetime_motes';             readonly tierId: TierId; readonly amount: number }
  | { readonly kind: 'forge_unlocked' }
  | { readonly kind: 'tap_count';                  readonly count: number }
  | { readonly kind: 'equation_tiers';             readonly count: number }
  | { readonly kind: 'wave_reached';               readonly wave: number }
  | { readonly kind: 'weapon_purchased';           readonly weaponId: string }
  | { readonly kind: 'any_weapon_max_tier' }
  | { readonly kind: 'specific_weapon_max_tier';   readonly weaponId: string }
  | { readonly kind: 'weapons_at_max_tier';        readonly count: number }
  | { readonly kind: 'all_purchased_max_tier' }
  | { readonly kind: 'weapons_purchased_count';    readonly count: number }
  | { readonly kind: 'xp_reached';                readonly xp: number }
  | { readonly kind: 'boss_defeated';              readonly count: number }
  | { readonly kind: 'specific_boss_defeated';     readonly bossId: number }
  | { readonly kind: 'specific_boss_at_speed';     readonly bossId: number; readonly minSpeedPct: number }
  | { readonly kind: 'any_boss_at_speed';          readonly minSpeedPct: number }
  | { readonly kind: 'all_bosses_at_speed';        readonly minSpeedPct: number }
  | { readonly kind: 'equip_weapons_count';        readonly count: number }
  | { readonly kind: 'rpg_upgrade_level';          readonly upgradeId: string; readonly level: number }
  | { readonly kind: 'rpg_upgrade_any_max';        readonly maxLevel: number }
  | { readonly kind: 'xp_allocated_stat';          readonly stat: 'atk' | 'def' | 'luck' | 'hp' }
  | { readonly kind: 'xp_allocated_stats_count';   readonly count: number }
  | { readonly kind: 'xp_to_stat';                readonly stat: 'atk' | 'def' | 'luck' | 'hp'; readonly amount: number }
  | { readonly kind: 'total_kills';               readonly count: number }
  | { readonly kind: 'kills_of_type';             readonly typeId: string; readonly count: number }
  | { readonly kind: 'elite_kills_total';         readonly count: number }
  | { readonly kind: 'aliven_kills_total';        readonly count: number }
  | { readonly kind: 'late_enemy_kills_total';    readonly count: number }
  | { readonly kind: 'lucky_motes_total';         readonly count: number }
  | { readonly kind: 'survival_minutes';          readonly minutes: number }
  | { readonly kind: 'wave_streak';               readonly count: number }
  | { readonly kind: 'damage_free_streak';        readonly count: number }
  | { readonly kind: 'waves_completed';           readonly count: number }
  | { readonly kind: 'boss_defeated_any_speed_1weapon' };

/** Single achievement definition — read-only data. */
export interface AchievementDefinition {
  readonly id: string;
  readonly groupId: string;
  readonly displayName: string;
  readonly description: string;
  readonly condition: AchievementCondition;
  readonly bonusKind: AchievementBonusKind;
  /** Multiplicative bonus value (e.g. 1.05 = +5%), or flat value for base_atk (e.g. 1 = +1 ATK). */
  readonly bonusMultiplier: number;
  /**
   * Optional override for the card accent colour.
   * When omitted, the panel falls back to the mote tier colour (for
   * `lifetime_motes` conditions) or a group-specific default.
   */
  readonly displayColor?: string;
  /** Whether this is a secret achievement (hidden name/desc until claimed). */
  readonly isSecret?: boolean;
  /** Whether the unlock criteria are hidden from the player until earned. */
  readonly isHiddenCriteria?: boolean;
}

// ─── Motes group ────────────────────────────────────────────────

const MOTES_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'first_grain',
    groupId: 'motes',
    displayName: 'First Grain',
    description: 'Earn your first Sand mote.',
    condition: { kind: 'lifetime_motes', tierId: 'sand', amount: 1 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.05,
  },
  {
    id: 'crystal_clear',
    groupId: 'motes',
    displayName: 'Crystal Clear',
    description: 'Earn your first Quartz mote.',
    condition: { kind: 'lifetime_motes', tierId: 'quartz', amount: 1 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.05,
  },
  {
    id: 'fire_starter',
    groupId: 'motes',
    displayName: 'Fire Starter',
    description: 'Earn your first Ruby mote.',
    condition: { kind: 'lifetime_motes', tierId: 'ruby', amount: 1 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.10,
  },
  {
    id: 'solar_flare',
    groupId: 'motes',
    displayName: 'Solar Flare',
    description: 'Earn your first Sunstone mote.',
    condition: { kind: 'lifetime_motes', tierId: 'sunstone', amount: 1 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.10,
  },
  {
    id: 'golden_ratio',
    groupId: 'motes',
    displayName: 'Golden Ratio',
    description: 'Earn your first Citrine mote.',
    condition: { kind: 'lifetime_motes', tierId: 'citrine', amount: 1 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.15,
  },
  {
    id: 'verdant_growth',
    groupId: 'motes',
    displayName: 'Verdant Growth',
    description: 'Earn your first Emerald mote.',
    condition: { kind: 'lifetime_motes', tierId: 'emerald', amount: 1 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.15,
  },
  {
    id: 'ocean_depths',
    groupId: 'motes',
    displayName: 'Ocean Depths',
    description: 'Earn your first Sapphire mote.',
    condition: { kind: 'lifetime_motes', tierId: 'sapphire', amount: 1 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.25,
  },
  {
    id: 'violet_veil',
    groupId: 'motes',
    displayName: 'Violet Veil',
    description: 'Earn your first Iolite mote.',
    condition: { kind: 'lifetime_motes', tierId: 'iolite', amount: 1 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.25,
  },
  {
    id: 'twilight_crown',
    groupId: 'motes',
    displayName: 'Twilight Crown',
    description: 'Earn your first Amethyst mote.',
    condition: { kind: 'lifetime_motes', tierId: 'amethyst', amount: 1 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.50,
  },
];

// ─── Equation group ──────────────────────────────────────────────

const EQUATION_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'equation_awakened',
    groupId: 'equation',
    displayName: 'Equation Awakened',
    description: 'Unlock the Equation Forge and begin refining motes.',
    condition: { kind: 'forge_unlocked' },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.05,
    displayColor: '#a0c8ff',
  },
  {
    id: 'first_principle',
    groupId: 'equation',
    displayName: 'First Principle',
    description: 'Tap the equation 100 times.',
    condition: { kind: 'tap_count', count: 100 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.05,
    displayColor: '#a0c8ff',
  },
  {
    id: 'expanding_terms',
    groupId: 'equation',
    displayName: 'Expanding Terms',
    description: 'Unlock 5 equation tiers.',
    condition: { kind: 'equation_tiers', count: 5 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.05,
    displayColor: '#a0c8ff',
  },
  {
    id: 'tenfold_recursion',
    groupId: 'equation',
    displayName: 'Tenfold Recursion',
    description: 'Tap the equation 1,000 times.',
    condition: { kind: 'tap_count', count: 1000 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.10,
    displayColor: '#80b0ff',
  },
  {
    id: 'full_spectrum',
    groupId: 'equation',
    displayName: 'Full Spectrum',
    description: 'Unlock all 9 equation tiers.',
    condition: { kind: 'equation_tiers', count: 9 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.10,
    displayColor: '#80b0ff',
  },
  {
    id: 'convergence',
    groupId: 'equation',
    displayName: 'Convergence',
    description: 'Tap the equation 10,000 times.',
    condition: { kind: 'tap_count', count: 10000 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.15,
    displayColor: '#60a0ff',
  },
];

// ─── RPG group ───────────────────────────────────────────────────

const RPG_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'armed_and_ready',
    groupId: 'rpg',
    displayName: 'Armed and Ready',
    description: 'Purchase your first weapon.',
    condition: { kind: 'weapon_purchased', weaponId: 'sand_blade' },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.05,
    displayColor: '#e08060',
  },
  {
    id: 'first_blood',
    groupId: 'rpg',
    displayName: 'First Blood',
    description: 'Reach wave 5 in RPG mode.',
    condition: { kind: 'wave_reached', wave: 5 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.05,
    displayColor: '#e08060',
  },
  {
    id: 'battle_tested',
    groupId: 'rpg',
    displayName: 'Battle Tested',
    description: 'Reach wave 10 in RPG mode.',
    condition: { kind: 'wave_reached', wave: 10 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.05,
    displayColor: '#e08060',
  },
  {
    id: 'seasoned_warrior',
    groupId: 'rpg',
    displayName: 'Seasoned Warrior',
    description: 'Earn 1,000 XP in RPG mode.',
    condition: { kind: 'xp_reached', xp: 1000 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.05,
    displayColor: '#e09030',
  },
  {
    id: 'veteran',
    groupId: 'rpg',
    displayName: 'Veteran',
    description: 'Reach wave 25 in RPG mode.',
    condition: { kind: 'wave_reached', wave: 25 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.10,
    displayColor: '#d06040',
  },
  {
    id: 'master_smith',
    groupId: 'rpg',
    displayName: 'Master Smith',
    description: 'Upgrade any weapon to the maximum tier (7).',
    condition: { kind: 'any_weapon_max_tier' },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.10,
    displayColor: '#d0a030',
  },
  {
    id: 'war_machine',
    groupId: 'rpg',
    displayName: 'War Machine',
    description: 'Reach wave 50 in RPG mode.',
    condition: { kind: 'wave_reached', wave: 50 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.10,
    displayColor: '#c04030',
  },
  {
    id: 'diamond_edge',
    groupId: 'rpg',
    displayName: 'Diamond Edge',
    description: 'Unlock the Diamond Sword.',
    condition: { kind: 'weapon_purchased', weaponId: 'diamond_bastion' },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.15,
    displayColor: '#80d0ff',
  },
  {
    id: 'battle_hardened',
    groupId: 'rpg',
    displayName: 'Battle Hardened',
    description: 'Earn 100,000 XP in RPG mode.',
    condition: { kind: 'xp_reached', xp: 100000 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.15,
    displayColor: '#c07020',
  },
  {
    id: 'boss_slayer',
    groupId: 'rpg',
    displayName: 'Boss Slayer',
    description: 'Defeat the first boss (clear wave 100).',
    condition: { kind: 'boss_defeated', count: 1 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.20,
    displayColor: '#ff6060',
  },
  {
    id: 'nightmare',
    groupId: 'rpg',
    displayName: 'Nightmare',
    description: 'Reach wave 200 in RPG mode.',
    condition: { kind: 'wave_reached', wave: 200 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.25,
    displayColor: '#c03030',
  },
  {
    id: 'void_touched',
    groupId: 'rpg',
    displayName: 'Void Touched',
    description: 'Unlock the Nullstone Vortex.',
    condition: { kind: 'weapon_purchased', weaponId: 'nullstone_nova' },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.25,
    displayColor: '#9060c0',
  },
];

// ─── Numbered RPG achievements (hidden criteria) ─────────────────
// Each grants +1 base ATK. Criteria are hidden from the player.

const RPG_NUMBERED_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  // ── Wave progression (001–019) ────────────────────────────────
  { id: 'rpg_ach_001', groupId: 'rpg', displayName: 'RPG #1',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 2   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_002', groupId: 'rpg', displayName: 'RPG #2',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 5   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_003', groupId: 'rpg', displayName: 'RPG #3',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 10  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_004', groupId: 'rpg', displayName: 'RPG #4',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 15  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_005', groupId: 'rpg', displayName: 'RPG #5',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 20  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_006', groupId: 'rpg', displayName: 'RPG #6',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 25  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_007', groupId: 'rpg', displayName: 'RPG #7',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 30  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_008', groupId: 'rpg', displayName: 'RPG #8',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 40  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_009', groupId: 'rpg', displayName: 'RPG #9',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_010', groupId: 'rpg', displayName: 'RPG #10',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 60  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_011', groupId: 'rpg', displayName: 'RPG #11',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 70  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_012', groupId: 'rpg', displayName: 'RPG #12',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 85  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_013', groupId: 'rpg', displayName: 'RPG #13',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 101 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_014', groupId: 'rpg', displayName: 'RPG #14',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 150 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_015', groupId: 'rpg', displayName: 'RPG #15',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 201 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_016', groupId: 'rpg', displayName: 'RPG #16',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 301 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  { id: 'rpg_ach_017', groupId: 'rpg', displayName: 'RPG #17',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 501 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  { id: 'rpg_ach_018', groupId: 'rpg', displayName: 'RPG #18',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 751 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b05030' },
  { id: 'rpg_ach_019', groupId: 'rpg', displayName: 'RPG #19',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 1001}, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b05030' },
  // ── Eigenstein unlock: first wave where Eigenstein appears (020) ──
  { id: 'rpg_ach_020', groupId: 'rpg', displayName: 'RPG #20',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 81  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c080' },
  // ── Boss progression (021–035) ────────────────────────────────
  { id: 'rpg_ach_021', groupId: 'rpg', displayName: 'RPG #21',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_022', groupId: 'rpg', displayName: 'RPG #22',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 2  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_023', groupId: 'rpg', displayName: 'RPG #23',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 3  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_024', groupId: 'rpg', displayName: 'RPG #24',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_025', groupId: 'rpg', displayName: 'RPG #25',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 10 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_026', groupId: 'rpg', displayName: 'RPG #26',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_defeated', bossId: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8080' },
  { id: 'rpg_ach_027', groupId: 'rpg', displayName: 'RPG #27',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_defeated', bossId: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8080' },
  { id: 'rpg_ach_028', groupId: 'rpg', displayName: 'RPG #28',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_defeated', bossId: 10 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8080' },
  { id: 'rpg_ach_029', groupId: 'rpg', displayName: 'RPG #29',  description: 'Hidden criteria.', condition: { kind: 'any_boss_at_speed', minSpeedPct: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_030', groupId: 'rpg', displayName: 'RPG #30',  description: 'Hidden criteria.', condition: { kind: 'any_boss_at_speed', minSpeedPct: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_031', groupId: 'rpg', displayName: 'RPG #31',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_at_speed', bossId: 1, minSpeedPct: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffa060' },
  { id: 'rpg_ach_032', groupId: 'rpg', displayName: 'RPG #32',  description: 'Hidden criteria.', condition: { kind: 'all_bosses_at_speed', minSpeedPct: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffa060' },
  { id: 'rpg_ach_033', groupId: 'rpg', displayName: 'RPG #33',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_at_speed', bossId: 2, minSpeedPct: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffa060' },
  { id: 'rpg_ach_034', groupId: 'rpg', displayName: 'RPG #34',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated_any_speed_1weapon' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff7040' },
  { id: 'rpg_ach_035', groupId: 'rpg', displayName: 'RPG #35',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 5 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  // ── XP progression (036–058) ──────────────────────────────────
  { id: 'rpg_ach_036', groupId: 'rpg', displayName: 'RPG #36',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 100           }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e09030' },
  { id: 'rpg_ach_037', groupId: 'rpg', displayName: 'RPG #37',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 1000          }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e09030' },
  { id: 'rpg_ach_038', groupId: 'rpg', displayName: 'RPG #38',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 10000         }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e09030' },
  { id: 'rpg_ach_039', groupId: 'rpg', displayName: 'RPG #39',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 100000        }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e09030' },
  { id: 'rpg_ach_040', groupId: 'rpg', displayName: 'RPG #40',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 1000000       }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d08020' },
  { id: 'rpg_ach_041', groupId: 'rpg', displayName: 'RPG #41',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 10000000      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d08020' },
  { id: 'rpg_ach_042', groupId: 'rpg', displayName: 'RPG #42',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 100000000     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d08020' },
  { id: 'rpg_ach_043', groupId: 'rpg', displayName: 'RPG #43',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 1000000000    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c07010' },
  { id: 'rpg_ach_044', groupId: 'rpg', displayName: 'RPG #44',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stat', stat: 'atk'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_045', groupId: 'rpg', displayName: 'RPG #45',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stat', stat: 'def'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0ff' },
  { id: 'rpg_ach_046', groupId: 'rpg', displayName: 'RPG #46',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stat', stat: 'luck' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0ffa0' },
  { id: 'rpg_ach_047', groupId: 'rpg', displayName: 'RPG #47',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stat', stat: 'hp'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff80a0' },
  { id: 'rpg_ach_048', groupId: 'rpg', displayName: 'RPG #48',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stats_count', count: 2 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c0a060' },
  { id: 'rpg_ach_049', groupId: 'rpg', displayName: 'RPG #49',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stats_count', count: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c0a060' },
  { id: 'rpg_ach_050', groupId: 'rpg', displayName: 'RPG #50',  description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'atk',  amount: 1000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_051', groupId: 'rpg', displayName: 'RPG #51',  description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'def',  amount: 1000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0ff' },
  { id: 'rpg_ach_052', groupId: 'rpg', displayName: 'RPG #52',  description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'luck', amount: 1000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0ffa0' },
  { id: 'rpg_ach_053', groupId: 'rpg', displayName: 'RPG #53',  description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'hp',   amount: 1000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff80a0' },
  // ── Weapon purchasing (054–068) ───────────────────────────────
  { id: 'rpg_ach_054', groupId: 'rpg', displayName: 'RPG #54',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'sand_blade'       }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c080' },
  { id: 'rpg_ach_055', groupId: 'rpg', displayName: 'RPG #55',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'quartz_whip'      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0d0ff' },
  { id: 'rpg_ach_056', groupId: 'rpg', displayName: 'RPG #56',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'ruby_laser'       }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_057', groupId: 'rpg', displayName: 'RPG #57',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'sunstone_mine'    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0a030' },
  { id: 'rpg_ach_058', groupId: 'rpg', displayName: 'RPG #58',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'citrine_nova'     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#f0d060' },
  { id: 'rpg_ach_059', groupId: 'rpg', displayName: 'RPG #59',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'emerald_launcher'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d080' },
  { id: 'rpg_ach_060', groupId: 'rpg', displayName: 'RPG #60',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'sapphire_ships'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#4080ff' },
  { id: 'rpg_ach_061', groupId: 'rpg', displayName: 'RPG #61',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'iolite_bolt'      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#8060c0' },
  { id: 'rpg_ach_062', groupId: 'rpg', displayName: 'RPG #62',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'amethyst_ships'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c060c0' },
  { id: 'rpg_ach_063', groupId: 'rpg', displayName: 'RPG #63',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'diamond_bastion'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80d0ff' },
  { id: 'rpg_ach_064', groupId: 'rpg', displayName: 'RPG #64',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'nullstone_nova'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#9060c0' },
  { id: 'rpg_ach_065', groupId: 'rpg', displayName: 'RPG #65',  description: 'Hidden criteria.', condition: { kind: 'weapons_purchased_count', count: 3  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_066', groupId: 'rpg', displayName: 'RPG #66',  description: 'Hidden criteria.', condition: { kind: 'weapons_purchased_count', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_067', groupId: 'rpg', displayName: 'RPG #67',  description: 'Hidden criteria.', condition: { kind: 'weapons_purchased_count', count: 8  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_068', groupId: 'rpg', displayName: 'RPG #68',  description: 'Hidden criteria.', condition: { kind: 'weapons_purchased_count', count: 11 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  // ── Weapon upgrading (069–086) ────────────────────────────────
  { id: 'rpg_ach_069', groupId: 'rpg', displayName: 'RPG #69',  description: 'Hidden criteria.', condition: { kind: 'weapons_at_max_tier', count: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d0a030' },
  { id: 'rpg_ach_070', groupId: 'rpg', displayName: 'RPG #70',  description: 'Hidden criteria.', condition: { kind: 'weapons_at_max_tier', count: 3  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d0a030' },
  { id: 'rpg_ach_071', groupId: 'rpg', displayName: 'RPG #71',  description: 'Hidden criteria.', condition: { kind: 'weapons_at_max_tier', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d0a030' },
  { id: 'rpg_ach_072', groupId: 'rpg', displayName: 'RPG #72',  description: 'Hidden criteria.', condition: { kind: 'all_purchased_max_tier' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c08020' },
  { id: 'rpg_ach_073', groupId: 'rpg', displayName: 'RPG #73',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'sand_blade'      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c080' },
  { id: 'rpg_ach_074', groupId: 'rpg', displayName: 'RPG #74',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'quartz_whip'     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0d0ff' },
  { id: 'rpg_ach_075', groupId: 'rpg', displayName: 'RPG #75',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'ruby_laser'      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_076', groupId: 'rpg', displayName: 'RPG #76',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'sunstone_mine'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0a030' },
  { id: 'rpg_ach_077', groupId: 'rpg', displayName: 'RPG #77',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'citrine_nova'    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#f0d060' },
  { id: 'rpg_ach_078', groupId: 'rpg', displayName: 'RPG #78',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'emerald_launcher' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d080' },
  { id: 'rpg_ach_079', groupId: 'rpg', displayName: 'RPG #79',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'sapphire_ships'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#4080ff' },
  { id: 'rpg_ach_080', groupId: 'rpg', displayName: 'RPG #80',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'iolite_bolt'     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#8060c0' },
  { id: 'rpg_ach_081', groupId: 'rpg', displayName: 'RPG #81',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'amethyst_ships'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c060c0' },
  { id: 'rpg_ach_082', groupId: 'rpg', displayName: 'RPG #82',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'diamond_bastion' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80d0ff' },
  { id: 'rpg_ach_083', groupId: 'rpg', displayName: 'RPG #83',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'nullstone_nova'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#9060c0' },
  // ── Equip count (084–087) ─────────────────────────────────────
  { id: 'rpg_ach_084', groupId: 'rpg', displayName: 'RPG #84',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 2 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_085', groupId: 'rpg', displayName: 'RPG #85',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_086', groupId: 'rpg', displayName: 'RPG #86',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 4 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_087', groupId: 'rpg', displayName: 'RPG #87',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 5 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  // ── RPG upgrades (088–092) ────────────────────────────────────
  { id: 'rpg_ach_088', groupId: 'rpg', displayName: 'RPG #88',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'speed_upgrade',      level: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60e0e0' },
  { id: 'rpg_ach_089', groupId: 'rpg', displayName: 'RPG #89',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_any_max', maxLevel: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60e0e0' },
  { id: 'rpg_ach_090', groupId: 'rpg', displayName: 'RPG #90',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'orbit_projectile',    level: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a060ff' },
  { id: 'rpg_ach_091', groupId: 'rpg', displayName: 'RPG #91',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'extra_weapon_slot',   level: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_092', groupId: 'rpg', displayName: 'RPG #92',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'extra_weapon_slot',   level: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  // ── Total kills (093–100) ─────────────────────────────────────
  { id: 'rpg_ach_093', groupId: 'rpg', displayName: 'RPG #93',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 10     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e06050' },
  { id: 'rpg_ach_094', groupId: 'rpg', displayName: 'RPG #94',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 100    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e06050' },
  { id: 'rpg_ach_095', groupId: 'rpg', displayName: 'RPG #95',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 1000   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d05040' },
  { id: 'rpg_ach_096', groupId: 'rpg', displayName: 'RPG #96',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 10000  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d05040' },
  { id: 'rpg_ach_097', groupId: 'rpg', displayName: 'RPG #97',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 100000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c04030' },
  // ── Kills by type — 15 enemy types (101–115, 5 each compressed) ───
  { id: 'rpg_ach_101', groupId: 'rpg', displayName: 'RPG #101', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'laser',    count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8060' },
  { id: 'rpg_ach_102', groupId: 'rpg', displayName: 'RPG #102', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'quartz',   count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0d0ff' },
  { id: 'rpg_ach_103', groupId: 'rpg', displayName: 'RPG #103', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'sapphire', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#4080ff' },
  { id: 'rpg_ach_104', groupId: 'rpg', displayName: 'RPG #104', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'emerald',  count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d080' },
  { id: 'rpg_ach_105', groupId: 'rpg', displayName: 'RPG #105', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'ruby',     count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff4060' },
  { id: 'rpg_ach_106', groupId: 'rpg', displayName: 'RPG #106', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'amber',    count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0a030' },
  { id: 'rpg_ach_107', groupId: 'rpg', displayName: 'RPG #107', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'void',     count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#8040c0' },
  { id: 'rpg_ach_108', groupId: 'rpg', displayName: 'RPG #108', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'sunstone', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c040' },
  { id: 'rpg_ach_109', groupId: 'rpg', displayName: 'RPG #109', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'citrine',  count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#f0e060' },
  { id: 'rpg_ach_110', groupId: 'rpg', displayName: 'RPG #110', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'iolite',   count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#7060c0' },
  { id: 'rpg_ach_111', groupId: 'rpg', displayName: 'RPG #111', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'amethyst', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c060c0' },
  { id: 'rpg_ach_112', groupId: 'rpg', displayName: 'RPG #112', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'diamond',  count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80d0ff' },
  { id: 'rpg_ach_113', groupId: 'rpg', displayName: 'RPG #113', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'nullstone', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#9060c0' },
  { id: 'rpg_ach_114', groupId: 'rpg', displayName: 'RPG #114', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'fracteryl', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff60c0' },
  { id: 'rpg_ach_115', groupId: 'rpg', displayName: 'RPG #115', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'eigenstein', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0e080' },
  // ── Kill all regular enemy types (116) ────────────────────────
  { id: 'rpg_ach_116', groupId: 'rpg', displayName: 'RPG #116', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'eigenstein', count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0e080' },
  // ── 1000 total regular kills (117) + 1000 late-tier kills (118) ──
  { id: 'rpg_ach_117', groupId: 'rpg', displayName: 'RPG #117', description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 2000  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d05040' },
  { id: 'rpg_ach_118', groupId: 'rpg', displayName: 'RPG #118', description: 'Hidden criteria.', condition: { kind: 'late_enemy_kills_total', count: 1000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b040a0' },
  // ── Elite enemy kills (119–128) ───────────────────────────────
  { id: 'rpg_ach_119', groupId: 'rpg', displayName: 'RPG #119', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 1   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe060' },
  { id: 'rpg_ach_120', groupId: 'rpg', displayName: 'RPG #120', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 10  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe060' },
  { id: 'rpg_ach_121', groupId: 'rpg', displayName: 'RPG #121', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffc040' },
  // ── Elite kills by tier (122–129) ─────────────────────────────
  { id: 'rpg_ach_122', groupId: 'rpg', displayName: 'RPG #122', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_quartz',   count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0d0ff' },
  { id: 'rpg_ach_123', groupId: 'rpg', displayName: 'RPG #123', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_ruby',     count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff4060' },
  { id: 'rpg_ach_124', groupId: 'rpg', displayName: 'RPG #124', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_sunstone', count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c040' },
  { id: 'rpg_ach_125', groupId: 'rpg', displayName: 'RPG #125', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_citrine',  count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#f0e060' },
  { id: 'rpg_ach_126', groupId: 'rpg', displayName: 'RPG #126', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_iolite',   count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#7060c0' },
  { id: 'rpg_ach_127', groupId: 'rpg', displayName: 'RPG #127', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_amethyst', count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c060c0' },
  { id: 'rpg_ach_128', groupId: 'rpg', displayName: 'RPG #128', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_diamond',  count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80d0ff' },
  { id: 'rpg_ach_129', groupId: 'rpg', displayName: 'RPG #129', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_nullstone', count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#9060c0' },
  // ── Aliven group kills (130–140) ──────────────────────────────
  { id: 'rpg_ach_130', groupId: 'rpg', displayName: 'RPG #130', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 1   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  { id: 'rpg_ach_131', groupId: 'rpg', displayName: 'RPG #131', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 10  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  { id: 'rpg_ach_132', groupId: 'rpg', displayName: 'RPG #132', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  // ── Lucky motes (141–148) ─────────────────────────────────────
  { id: 'rpg_ach_141', groupId: 'rpg', displayName: 'RPG #141', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 1    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe080' },
  { id: 'rpg_ach_142', groupId: 'rpg', displayName: 'RPG #142', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 10   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe080' },
  { id: 'rpg_ach_143', groupId: 'rpg', displayName: 'RPG #143', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 100  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffd060' },
  { id: 'rpg_ach_144', groupId: 'rpg', displayName: 'RPG #144', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 1000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffc040' },
  // ── Survival time (149–152) ───────────────────────────────────
  { id: 'rpg_ach_149', groupId: 'rpg', displayName: 'RPG #149', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0a0' },
  { id: 'rpg_ach_150', groupId: 'rpg', displayName: 'RPG #150', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0a0' },
  { id: 'rpg_ach_151', groupId: 'rpg', displayName: 'RPG #151', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 10 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#40b090' },
  { id: 'rpg_ach_152', groupId: 'rpg', displayName: 'RPG #152', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 30 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#30a080' },
  // ── Wave streak (153–158) ─────────────────────────────────────
  { id: 'rpg_ach_153', groupId: 'rpg', displayName: 'RPG #153', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 5   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80e080' },
  { id: 'rpg_ach_154', groupId: 'rpg', displayName: 'RPG #154', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 10  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80e080' },
  { id: 'rpg_ach_155', groupId: 'rpg', displayName: 'RPG #155', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 25  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d060' },
  { id: 'rpg_ach_156', groupId: 'rpg', displayName: 'RPG #156', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d060' },
  // ── Damage-free streak (159–164) ─────────────────────────────
  { id: 'rpg_ach_159', groupId: 'rpg', displayName: 'RPG #159', description: 'Hidden criteria.', condition: { kind: 'damage_free_streak', count: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0e0ff' },
  { id: 'rpg_ach_160', groupId: 'rpg', displayName: 'RPG #160', description: 'Hidden criteria.', condition: { kind: 'damage_free_streak', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0e0ff' },
  { id: 'rpg_ach_161', groupId: 'rpg', displayName: 'RPG #161', description: 'Hidden criteria.', condition: { kind: 'damage_free_streak', count: 10 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80c0ff' },
  // ── Waves completed lifetime (165–172) ────────────────────────
  { id: 'rpg_ach_165', groupId: 'rpg', displayName: 'RPG #165', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 10   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_166', groupId: 'rpg', displayName: 'RPG #166', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 25   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_167', groupId: 'rpg', displayName: 'RPG #167', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 50   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_168', groupId: 'rpg', displayName: 'RPG #168', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 100  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_169', groupId: 'rpg', displayName: 'RPG #169', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 250  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  { id: 'rpg_ach_170', groupId: 'rpg', displayName: 'RPG #170', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 500  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  { id: 'rpg_ach_171', groupId: 'rpg', displayName: 'RPG #171', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 1000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b05030' },
  { id: 'rpg_ach_172', groupId: 'rpg', displayName: 'RPG #172', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 2500 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b05030' },
  // ── XP allocated stats combos (173–174) ───────────────────────
  { id: 'rpg_ach_173', groupId: 'rpg', displayName: 'RPG #173', description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'atk',  amount: 5000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_174', groupId: 'rpg', displayName: 'RPG #174', description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'def',  amount: 5000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0ff' },
  // ── More total kills milestones (175–179) ─────────────────────
  { id: 'rpg_ach_175', groupId: 'rpg', displayName: 'RPG #175', description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 25  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e06050' },
  { id: 'rpg_ach_176', groupId: 'rpg', displayName: 'RPG #176', description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e06050' },
  { id: 'rpg_ach_177', groupId: 'rpg', displayName: 'RPG #177', description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 500 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d05040' },
  // ── More elite kills milestones (180–183) ─────────────────────
  { id: 'rpg_ach_180', groupId: 'rpg', displayName: 'RPG #180', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe060' },
  { id: 'rpg_ach_181', groupId: 'rpg', displayName: 'RPG #181', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 25 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe060' },
  { id: 'rpg_ach_182', groupId: 'rpg', displayName: 'RPG #182', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 50 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffc040' },
  // ── More aliven kills (184–187) ───────────────────────────────
  { id: 'rpg_ach_184', groupId: 'rpg', displayName: 'RPG #184', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 25  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  { id: 'rpg_ach_185', groupId: 'rpg', displayName: 'RPG #185', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  // ── More lucky motes (188–191) ────────────────────────────────
  { id: 'rpg_ach_188', groupId: 'rpg', displayName: 'RPG #188', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 250  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffc040' },
  { id: 'rpg_ach_189', groupId: 'rpg', displayName: 'RPG #189', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 500  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffa020' },
  // ── More survival milestones (190–200) ────────────────────────
  { id: 'rpg_ach_190', groupId: 'rpg', displayName: 'RPG #190', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 60  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#20a070' },
  { id: 'rpg_ach_191', groupId: 'rpg', displayName: 'RPG #191', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 120 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#20a070' },
  { id: 'rpg_ach_192', groupId: 'rpg', displayName: 'RPG #192', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 100  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#40c040' },
  { id: 'rpg_ach_193', groupId: 'rpg', displayName: 'RPG #193', description: 'Hidden criteria.', condition: { kind: 'damage_free_streak', count: 25 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60a0ff' },
  { id: 'rpg_ach_194', groupId: 'rpg', displayName: 'RPG #194', description: 'Hidden criteria.', condition: { kind: 'late_enemy_kills_total', count: 100  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b040a0' },
  { id: 'rpg_ach_195', groupId: 'rpg', displayName: 'RPG #195', description: 'Hidden criteria.', condition: { kind: 'late_enemy_kills_total', count: 250  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a030a0' },
  { id: 'rpg_ach_196', groupId: 'rpg', displayName: 'RPG #196', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 5000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a04020' },
  { id: 'rpg_ach_197', groupId: 'rpg', displayName: 'RPG #197', description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 7   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_198', groupId: 'rpg', displayName: 'RPG #198', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'laser',   count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8060' },
  { id: 'rpg_ach_199', groupId: 'rpg', displayName: 'RPG #199', description: 'Hidden criteria.', condition: { kind: 'weapons_at_max_tier', count: 2 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d0a030' },
  { id: 'rpg_ach_200', groupId: 'rpg', displayName: 'RPG #200', description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'speed_upgrade', level: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60e0e0' },
];

// ─── Secret group ────────────────────────────────────────────────

const SECRET_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'prismatic_heart',
    groupId: 'secret',
    displayName: 'Prismatic Heart',
    description: 'A fragment of pure refracted light, crystallised into being.',
    condition: { kind: 'lifetime_motes', tierId: 'diamond', amount: 1 },
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 2.0,
    isSecret: true,
  },
  {
    id: 'void_awakened',
    groupId: 'secret',
    displayName: 'Void Awakened',
    description: 'Something stirs at the edge of the equation. It was always there.',
    condition: { kind: 'lifetime_motes', tierId: 'nullstone', amount: 1 },
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 2.0,
    isSecret: true,
  },
];

// ─── Combined list ────────────────────────────────────────────────

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  ...MOTES_ACHIEVEMENTS,
  ...EQUATION_ACHIEVEMENTS,
  ...RPG_ACHIEVEMENTS,
  ...RPG_NUMBERED_ACHIEVEMENTS,
  ...SECRET_ACHIEVEMENTS,
];

/** Quick lookup by achievement id. */
export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDefinition> = new Map(
  ACHIEVEMENT_DEFINITIONS.map(a => [a.id, a]),
);
