import type { TierId } from '../tiers';

/**
 * What kind of bonus an achievement grants.
 * - tap_multiplier: multiplies all tap mote gains
 * - loom_multiplier: multiplies all loom production rates
 */
export type AchievementBonusKind = 'tap_multiplier' | 'loom_multiplier';

/**
 * Discriminated union describing how an achievement is unlocked.
 *
 * lifetime_motes    — earn at least `amount` lifetime motes of `tierId`
 * forge_unlocked    — unlock the Equation Forge
 * tap_count         — reach `count` total taps on the equation
 * equation_tiers    — unlock at least `count` equation tiers (including the starting one)
 * wave_reached      — reach wave `wave` or higher in RPG mode
 * weapon_purchased  — purchase the weapon with id `weaponId`
 * any_weapon_max_tier — upgrade any single weapon to the maximum tier (7)
 * xp_reached        — accumulate at least `xp` total XP in RPG mode
 * boss_defeated     — defeat at least `count` bosses (boss at wave 100×n)
 */
export type AchievementCondition =
  | { readonly kind: 'lifetime_motes';    readonly tierId: TierId; readonly amount: number }
  | { readonly kind: 'forge_unlocked' }
  | { readonly kind: 'tap_count';          readonly count: number }
  | { readonly kind: 'equation_tiers';     readonly count: number }
  | { readonly kind: 'wave_reached';       readonly wave: number }
  | { readonly kind: 'weapon_purchased';   readonly weaponId: string }
  | { readonly kind: 'any_weapon_max_tier' }
  | { readonly kind: 'xp_reached';        readonly xp: number }
  | { readonly kind: 'boss_defeated';     readonly count: number };

/** Single achievement definition — read-only data. */
export interface AchievementDefinition {
  readonly id: string;
  readonly groupId: string;
  readonly displayName: string;
  readonly description: string;
  readonly condition: AchievementCondition;
  readonly bonusKind: AchievementBonusKind;
  /** Multiplicative bonus value (e.g. 1.05 = +5%). */
  readonly bonusMultiplier: number;
  /**
   * Optional override for the card accent colour.
   * When omitted, the panel falls back to the mote tier colour (for
   * `lifetime_motes` conditions) or a group-specific default.
   */
  readonly displayColor?: string;
  /** Whether this is a secret achievement (hidden name/desc until claimed). */
  readonly isSecret?: boolean;
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
  ...SECRET_ACHIEVEMENTS,
];

/** Quick lookup by achievement id. */
export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDefinition> = new Map(
  ACHIEVEMENT_DEFINITIONS.map(a => [a.id, a]),
);
