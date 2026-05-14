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
 * any_tier_lifetime_motes  — any single tier has at least `amount` lifetime motes
 * tiers_with_lifetime_motes — at least `count` tiers each have at least `amount` lifetime motes
 * all_unlocked_tiers_lifetime_motes — all currently unlocked tiers each have at least `amount` lifetime motes
 * specific_tiers_lifetime_motes — every tier in `tierIds` has at least 1 lifetime mote
 * current_motes_all_unlocked_tiers — all unlocked tiers currently hold at least `amount` motes
 * lifetime_motes_total     — total of all lifetime motes (all tiers summed) ≥ `amount`
 * aliven_count             — at least `count` mote tiers have been alivened
 * aliven_all_possible      — every aliveneable tier (Sand through Nullstone) has been alivened
 * forge_unlocked           — unlock the Equation Forge
 * tap_count                — reach `count` total taps on the equation
 * equation_tiers           — unlock at least `count` equation tiers (including the starting one)
 * equation_segment_unlocked — the equation segment for `tierId` is unlocked
 * equation_segment_level   — the equation segment for `tierId` is at level ≥ `level`
 * any_equation_segment_level — any single equation segment is at level ≥ `level`
 * total_equation_upgrade_levels — sum of all segment levels ≥ `count`
 * all_unlocked_equation_segments_level — every unlocked segment is at level ≥ `level`
 * equation_tap_gain_total  — total motes earned from one tap (all tiers) ≥ `amount`
 * equivalence_reached      — Equivalence score ≥ `amount` while the Equation Forge is unlocked
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
  | { readonly kind: 'lifetime_motes';                      readonly tierId: TierId; readonly amount: number }
  | { readonly kind: 'any_tier_lifetime_motes';             readonly amount: number }
  | { readonly kind: 'tiers_with_lifetime_motes';           readonly count: number; readonly amount: number }
  | { readonly kind: 'all_unlocked_tiers_lifetime_motes';   readonly amount: number }
  | { readonly kind: 'specific_tiers_lifetime_motes';       readonly tierIds: readonly TierId[] }
  | { readonly kind: 'current_motes_all_unlocked_tiers';    readonly amount: number }
  | { readonly kind: 'lifetime_motes_total';                readonly amount: number }
  | { readonly kind: 'aliven_count';                        readonly count: number }
  | { readonly kind: 'aliven_all_possible' }
  | { readonly kind: 'forge_unlocked' }
  | { readonly kind: 'tap_count';                           readonly count: number }
  | { readonly kind: 'equation_tiers';                      readonly count: number }
  | { readonly kind: 'equation_segment_unlocked';           readonly tierId: TierId }
  | { readonly kind: 'equation_segment_level';              readonly tierId: TierId; readonly level: number }
  | { readonly kind: 'any_equation_segment_level';          readonly level: number }
  | { readonly kind: 'total_equation_upgrade_levels';       readonly count: number }
  | { readonly kind: 'all_unlocked_equation_segments_level'; readonly level: number }
  | { readonly kind: 'equation_tap_gain_total';             readonly amount: number }
  | { readonly kind: 'equivalence_reached';                 readonly amount: number }
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
  /**
   * Optional subcategory within the group.
   * Currently only used by the 'rpg' group to sub-divide the large list.
   * Achievements without a subcategoryId are shown in their group's root section.
   */
  readonly subcategoryId?: string;
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
  // ── First Motes ──────────────────────────────────────────────
  { id: 'first_grain',    groupId: 'motes', subcategoryId: 'motes_first', displayName: 'First Grain',    description: 'Earn your first Sand mote.',      condition: { kind: 'lifetime_motes', tierId: 'sand',      amount: 1 }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05 },
  { id: 'crystal_clear',  groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Crystal Clear',  description: 'Earn your first Quartz mote.',    condition: { kind: 'lifetime_motes', tierId: 'quartz',    amount: 1 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05 },
  { id: 'fire_starter',   groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Fire Starter',   description: 'Earn your first Ruby mote.',      condition: { kind: 'lifetime_motes', tierId: 'ruby',      amount: 1 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.10 },
  { id: 'solar_flare',    groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Solar Flare',    description: 'Earn your first Sunstone mote.',  condition: { kind: 'lifetime_motes', tierId: 'sunstone',  amount: 1 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.10 },
  { id: 'golden_ratio',   groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Golden Ratio',   description: 'Earn your first Citrine mote.',   condition: { kind: 'lifetime_motes', tierId: 'citrine',   amount: 1 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.15 },
  { id: 'verdant_growth', groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Verdant Growth', description: 'Earn your first Emerald mote.',   condition: { kind: 'lifetime_motes', tierId: 'emerald',   amount: 1 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.15 },
  { id: 'ocean_depths',   groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Ocean Depths',   description: 'Earn your first Sapphire mote.',  condition: { kind: 'lifetime_motes', tierId: 'sapphire',  amount: 1 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.25 },
  { id: 'violet_veil',    groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Violet Veil',    description: 'Earn your first Iolite mote.',    condition: { kind: 'lifetime_motes', tierId: 'iolite',    amount: 1 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.25 },
  { id: 'twilight_crown', groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Twilight Crown', description: 'Earn your first Amethyst mote.',  condition: { kind: 'lifetime_motes', tierId: 'amethyst',  amount: 1 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.50 },
  { id: 'mote_diamond_first',    groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Diamond Clarity',  description: 'Earn your first Diamond mote.',    condition: { kind: 'lifetime_motes', tierId: 'diamond',   amount: 1 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#f0f5fa' },
  { id: 'mote_nullstone_first',  groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Void Touch',       description: 'Earn your first Nullstone mote.',  condition: { kind: 'lifetime_motes', tierId: 'nullstone', amount: 1 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#9664c8' },
  { id: 'mote_fracteryl_first',  groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Fracture Point',   description: 'Earn your first Fracteryl mote.',  condition: { kind: 'lifetime_motes', tierId: 'fracteryl', amount: 1 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#7A2CFF' },
  { id: 'mote_eigenstein_first', groupId: 'motes', subcategoryId: 'motes_first', displayName: 'Eigen State',      description: 'Earn your first Eigenstein mote.', condition: { kind: 'lifetime_motes', tierId: 'eigenstein',amount: 1 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#A34728' },
  // ── Sand Milestones ───────────────────────────────────────────
  { id: 'mote_sand_100',   groupId: 'motes', subcategoryId: 'motes_sand', displayName: 'Sand — 100',       description: 'Earn 100 lifetime Sand motes.',         condition: { kind: 'lifetime_motes', tierId: 'sand', amount: 100        }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffd764' },
  { id: 'mote_sand_1k',    groupId: 'motes', subcategoryId: 'motes_sand', displayName: 'Sand — 1,000',     description: 'Earn 1,000 lifetime Sand motes.',       condition: { kind: 'lifetime_motes', tierId: 'sand', amount: 1000       }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffd764' },
  { id: 'mote_sand_10k',   groupId: 'motes', subcategoryId: 'motes_sand', displayName: 'Sand — 10,000',    description: 'Earn 10,000 lifetime Sand motes.',      condition: { kind: 'lifetime_motes', tierId: 'sand', amount: 10000      }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffd764' },
  { id: 'mote_sand_100k',  groupId: 'motes', subcategoryId: 'motes_sand', displayName: 'Sand — 100,000',   description: 'Earn 100,000 lifetime Sand motes.',     condition: { kind: 'lifetime_motes', tierId: 'sand', amount: 100000     }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffc840' },
  { id: 'mote_sand_1m',    groupId: 'motes', subcategoryId: 'motes_sand', displayName: 'Sand — 1 Million', description: 'Earn 1,000,000 lifetime Sand motes.',   condition: { kind: 'lifetime_motes', tierId: 'sand', amount: 1000000    }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffc840' },
  { id: 'mote_sand_100m',  groupId: 'motes', subcategoryId: 'motes_sand', displayName: 'Sand — 100 Million',description:'Earn 100,000,000 lifetime Sand motes.',  condition: { kind: 'lifetime_motes', tierId: 'sand', amount: 100000000  }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffb820' },
  { id: 'mote_sand_1b',    groupId: 'motes', subcategoryId: 'motes_sand', displayName: 'Sand — 1 Billion', description: 'Earn 1,000,000,000 lifetime Sand motes.',condition:{ kind: 'lifetime_motes', tierId: 'sand', amount: 1000000000 }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffb820' },
  // ── Quartz Milestones ─────────────────────────────────────────
  { id: 'mote_quartz_100',  groupId: 'motes', subcategoryId: 'motes_quartz', displayName: 'Quartz — 100',      description: 'Earn 100 lifetime Quartz motes.',         condition: { kind: 'lifetime_motes', tierId: 'quartz', amount: 100       }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f5f0eb' },
  { id: 'mote_quartz_1k',   groupId: 'motes', subcategoryId: 'motes_quartz', displayName: 'Quartz — 1,000',    description: 'Earn 1,000 lifetime Quartz motes.',       condition: { kind: 'lifetime_motes', tierId: 'quartz', amount: 1000      }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f5f0eb' },
  { id: 'mote_quartz_10k',  groupId: 'motes', subcategoryId: 'motes_quartz', displayName: 'Quartz — 10,000',   description: 'Earn 10,000 lifetime Quartz motes.',      condition: { kind: 'lifetime_motes', tierId: 'quartz', amount: 10000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f5f0eb' },
  { id: 'mote_quartz_100k', groupId: 'motes', subcategoryId: 'motes_quartz', displayName: 'Quartz — 100,000',  description: 'Earn 100,000 lifetime Quartz motes.',     condition: { kind: 'lifetime_motes', tierId: 'quartz', amount: 100000    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#e8e4e0' },
  { id: 'mote_quartz_1m',   groupId: 'motes', subcategoryId: 'motes_quartz', displayName: 'Quartz — 1 Million',description: 'Earn 1,000,000 lifetime Quartz motes.',   condition: { kind: 'lifetime_motes', tierId: 'quartz', amount: 1000000   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#e8e4e0' },
  { id: 'mote_quartz_100m', groupId: 'motes', subcategoryId: 'motes_quartz', displayName: 'Quartz — 100 Million',description:'Earn 100,000,000 lifetime Quartz motes.', condition: { kind: 'lifetime_motes', tierId: 'quartz', amount: 100000000 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#dcdad8' },
  // ── Ruby Milestones ───────────────────────────────────────────
  { id: 'mote_ruby_100',  groupId: 'motes', subcategoryId: 'motes_ruby', displayName: 'Ruby — 100',      description: 'Earn 100 lifetime Ruby motes.',       condition: { kind: 'lifetime_motes', tierId: 'ruby', amount: 100       }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#dc3232' },
  { id: 'mote_ruby_1k',   groupId: 'motes', subcategoryId: 'motes_ruby', displayName: 'Ruby — 1,000',    description: 'Earn 1,000 lifetime Ruby motes.',     condition: { kind: 'lifetime_motes', tierId: 'ruby', amount: 1000      }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#dc3232' },
  { id: 'mote_ruby_10k',  groupId: 'motes', subcategoryId: 'motes_ruby', displayName: 'Ruby — 10,000',   description: 'Earn 10,000 lifetime Ruby motes.',    condition: { kind: 'lifetime_motes', tierId: 'ruby', amount: 10000     }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#c82020' },
  { id: 'mote_ruby_100k', groupId: 'motes', subcategoryId: 'motes_ruby', displayName: 'Ruby — 100,000',  description: 'Earn 100,000 lifetime Ruby motes.',   condition: { kind: 'lifetime_motes', tierId: 'ruby', amount: 100000    }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#c82020' },
  { id: 'mote_ruby_1m',   groupId: 'motes', subcategoryId: 'motes_ruby', displayName: 'Ruby — 1 Million',description: 'Earn 1,000,000 lifetime Ruby motes.', condition: { kind: 'lifetime_motes', tierId: 'ruby', amount: 1000000   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#b41010' },
  // ── Sunstone Milestones ───────────────────────────────────────
  { id: 'mote_sunstone_100',  groupId: 'motes', subcategoryId: 'motes_sunstone', displayName: 'Sunstone — 100',      description: 'Earn 100 lifetime Sunstone motes.',       condition: { kind: 'lifetime_motes', tierId: 'sunstone', amount: 100       }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#ff8c3c' },
  { id: 'mote_sunstone_1k',   groupId: 'motes', subcategoryId: 'motes_sunstone', displayName: 'Sunstone — 1,000',    description: 'Earn 1,000 lifetime Sunstone motes.',     condition: { kind: 'lifetime_motes', tierId: 'sunstone', amount: 1000      }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#ff8c3c' },
  { id: 'mote_sunstone_10k',  groupId: 'motes', subcategoryId: 'motes_sunstone', displayName: 'Sunstone — 10,000',   description: 'Earn 10,000 lifetime Sunstone motes.',    condition: { kind: 'lifetime_motes', tierId: 'sunstone', amount: 10000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f07830' },
  { id: 'mote_sunstone_100k', groupId: 'motes', subcategoryId: 'motes_sunstone', displayName: 'Sunstone — 100,000',  description: 'Earn 100,000 lifetime Sunstone motes.',   condition: { kind: 'lifetime_motes', tierId: 'sunstone', amount: 100000    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f07830' },
  { id: 'mote_sunstone_1m',   groupId: 'motes', subcategoryId: 'motes_sunstone', displayName: 'Sunstone — 1 Million',description: 'Earn 1,000,000 lifetime Sunstone motes.', condition: { kind: 'lifetime_motes', tierId: 'sunstone', amount: 1000000   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#e06824' },
  // ── Citrine Milestones ────────────────────────────────────────
  { id: 'mote_citrine_100',  groupId: 'motes', subcategoryId: 'motes_citrine', displayName: 'Citrine — 100',      description: 'Earn 100 lifetime Citrine motes.',       condition: { kind: 'lifetime_motes', tierId: 'citrine', amount: 100       }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#e6c850' },
  { id: 'mote_citrine_1k',   groupId: 'motes', subcategoryId: 'motes_citrine', displayName: 'Citrine — 1,000',    description: 'Earn 1,000 lifetime Citrine motes.',     condition: { kind: 'lifetime_motes', tierId: 'citrine', amount: 1000      }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#e6c850' },
  { id: 'mote_citrine_10k',  groupId: 'motes', subcategoryId: 'motes_citrine', displayName: 'Citrine — 10,000',   description: 'Earn 10,000 lifetime Citrine motes.',    condition: { kind: 'lifetime_motes', tierId: 'citrine', amount: 10000     }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#d8ba40' },
  { id: 'mote_citrine_100k', groupId: 'motes', subcategoryId: 'motes_citrine', displayName: 'Citrine — 100,000',  description: 'Earn 100,000 lifetime Citrine motes.',   condition: { kind: 'lifetime_motes', tierId: 'citrine', amount: 100000    }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#d8ba40' },
  { id: 'mote_citrine_1m',   groupId: 'motes', subcategoryId: 'motes_citrine', displayName: 'Citrine — 1 Million',description: 'Earn 1,000,000 lifetime Citrine motes.', condition: { kind: 'lifetime_motes', tierId: 'citrine', amount: 1000000   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#caac30' },
  // ── Emerald Milestones ────────────────────────────────────────
  { id: 'mote_emerald_100',  groupId: 'motes', subcategoryId: 'motes_emerald', displayName: 'Emerald — 100',      description: 'Earn 100 lifetime Emerald motes.',       condition: { kind: 'lifetime_motes', tierId: 'emerald', amount: 100       }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#50b464' },
  { id: 'mote_emerald_1k',   groupId: 'motes', subcategoryId: 'motes_emerald', displayName: 'Emerald — 1,000',    description: 'Earn 1,000 lifetime Emerald motes.',     condition: { kind: 'lifetime_motes', tierId: 'emerald', amount: 1000      }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#50b464' },
  { id: 'mote_emerald_10k',  groupId: 'motes', subcategoryId: 'motes_emerald', displayName: 'Emerald — 10,000',   description: 'Earn 10,000 lifetime Emerald motes.',    condition: { kind: 'lifetime_motes', tierId: 'emerald', amount: 10000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#44a058' },
  { id: 'mote_emerald_100k', groupId: 'motes', subcategoryId: 'motes_emerald', displayName: 'Emerald — 100,000',  description: 'Earn 100,000 lifetime Emerald motes.',   condition: { kind: 'lifetime_motes', tierId: 'emerald', amount: 100000    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#44a058' },
  { id: 'mote_emerald_1m',   groupId: 'motes', subcategoryId: 'motes_emerald', displayName: 'Emerald — 1 Million',description: 'Earn 1,000,000 lifetime Emerald motes.', condition: { kind: 'lifetime_motes', tierId: 'emerald', amount: 1000000   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#388c4c' },
  // ── Sapphire Milestones ───────────────────────────────────────
  { id: 'mote_sapphire_100',  groupId: 'motes', subcategoryId: 'motes_sapphire', displayName: 'Sapphire — 100',      description: 'Earn 100 lifetime Sapphire motes.',       condition: { kind: 'lifetime_motes', tierId: 'sapphire', amount: 100       }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#3c78c8' },
  { id: 'mote_sapphire_1k',   groupId: 'motes', subcategoryId: 'motes_sapphire', displayName: 'Sapphire — 1,000',    description: 'Earn 1,000 lifetime Sapphire motes.',     condition: { kind: 'lifetime_motes', tierId: 'sapphire', amount: 1000      }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#3c78c8' },
  { id: 'mote_sapphire_10k',  groupId: 'motes', subcategoryId: 'motes_sapphire', displayName: 'Sapphire — 10,000',   description: 'Earn 10,000 lifetime Sapphire motes.',    condition: { kind: 'lifetime_motes', tierId: 'sapphire', amount: 10000     }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#3068b8' },
  { id: 'mote_sapphire_100k', groupId: 'motes', subcategoryId: 'motes_sapphire', displayName: 'Sapphire — 100,000',  description: 'Earn 100,000 lifetime Sapphire motes.',   condition: { kind: 'lifetime_motes', tierId: 'sapphire', amount: 100000    }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#3068b8' },
  { id: 'mote_sapphire_1m',   groupId: 'motes', subcategoryId: 'motes_sapphire', displayName: 'Sapphire — 1 Million',description: 'Earn 1,000,000 lifetime Sapphire motes.', condition: { kind: 'lifetime_motes', tierId: 'sapphire', amount: 1000000   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#2458a8' },
  // ── Iolite Milestones ─────────────────────────────────────────
  { id: 'mote_iolite_100',  groupId: 'motes', subcategoryId: 'motes_iolite', displayName: 'Iolite — 100',      description: 'Earn 100 lifetime Iolite motes.',       condition: { kind: 'lifetime_motes', tierId: 'iolite', amount: 100       }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#6464b4' },
  { id: 'mote_iolite_1k',   groupId: 'motes', subcategoryId: 'motes_iolite', displayName: 'Iolite — 1,000',    description: 'Earn 1,000 lifetime Iolite motes.',     condition: { kind: 'lifetime_motes', tierId: 'iolite', amount: 1000      }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#6464b4' },
  { id: 'mote_iolite_10k',  groupId: 'motes', subcategoryId: 'motes_iolite', displayName: 'Iolite — 10,000',   description: 'Earn 10,000 lifetime Iolite motes.',    condition: { kind: 'lifetime_motes', tierId: 'iolite', amount: 10000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#5858a4' },
  { id: 'mote_iolite_100k', groupId: 'motes', subcategoryId: 'motes_iolite', displayName: 'Iolite — 100,000',  description: 'Earn 100,000 lifetime Iolite motes.',   condition: { kind: 'lifetime_motes', tierId: 'iolite', amount: 100000    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#5858a4' },
  { id: 'mote_iolite_1m',   groupId: 'motes', subcategoryId: 'motes_iolite', displayName: 'Iolite — 1 Million',description: 'Earn 1,000,000 lifetime Iolite motes.', condition: { kind: 'lifetime_motes', tierId: 'iolite', amount: 1000000   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#4c4c94' },
  // ── Amethyst Milestones ───────────────────────────────────────
  { id: 'mote_amethyst_100',  groupId: 'motes', subcategoryId: 'motes_amethyst', displayName: 'Amethyst — 100',      description: 'Earn 100 lifetime Amethyst motes.',       condition: { kind: 'lifetime_motes', tierId: 'amethyst', amount: 100       }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#b464c8' },
  { id: 'mote_amethyst_1k',   groupId: 'motes', subcategoryId: 'motes_amethyst', displayName: 'Amethyst — 1,000',    description: 'Earn 1,000 lifetime Amethyst motes.',     condition: { kind: 'lifetime_motes', tierId: 'amethyst', amount: 1000      }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#b464c8' },
  { id: 'mote_amethyst_10k',  groupId: 'motes', subcategoryId: 'motes_amethyst', displayName: 'Amethyst — 10,000',   description: 'Earn 10,000 lifetime Amethyst motes.',    condition: { kind: 'lifetime_motes', tierId: 'amethyst', amount: 10000     }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#a058b8' },
  { id: 'mote_amethyst_100k', groupId: 'motes', subcategoryId: 'motes_amethyst', displayName: 'Amethyst — 100,000',  description: 'Earn 100,000 lifetime Amethyst motes.',   condition: { kind: 'lifetime_motes', tierId: 'amethyst', amount: 100000    }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#a058b8' },
  { id: 'mote_amethyst_1m',   groupId: 'motes', subcategoryId: 'motes_amethyst', displayName: 'Amethyst — 1 Million',description: 'Earn 1,000,000 lifetime Amethyst motes.', condition: { kind: 'lifetime_motes', tierId: 'amethyst', amount: 1000000   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#8c4ca4' },
  // ── Diamond Milestones ────────────────────────────────────────
  { id: 'mote_diamond_100',  groupId: 'motes', subcategoryId: 'motes_diamond', displayName: 'Diamond — 100',      description: 'Earn 100 lifetime Diamond motes.',       condition: { kind: 'lifetime_motes', tierId: 'diamond', amount: 100       }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f0f5fa' },
  { id: 'mote_diamond_1k',   groupId: 'motes', subcategoryId: 'motes_diamond', displayName: 'Diamond — 1,000',    description: 'Earn 1,000 lifetime Diamond motes.',     condition: { kind: 'lifetime_motes', tierId: 'diamond', amount: 1000      }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#e8eef4' },
  { id: 'mote_diamond_10k',  groupId: 'motes', subcategoryId: 'motes_diamond', displayName: 'Diamond — 10,000',   description: 'Earn 10,000 lifetime Diamond motes.',    condition: { kind: 'lifetime_motes', tierId: 'diamond', amount: 10000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#e8eef4' },
  { id: 'mote_diamond_100k', groupId: 'motes', subcategoryId: 'motes_diamond', displayName: 'Diamond — 100,000',  description: 'Earn 100,000 lifetime Diamond motes.',   condition: { kind: 'lifetime_motes', tierId: 'diamond', amount: 100000    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#d8e4ec' },
  { id: 'mote_diamond_1m',   groupId: 'motes', subcategoryId: 'motes_diamond', displayName: 'Diamond — 1 Million',description: 'Earn 1,000,000 lifetime Diamond motes.', condition: { kind: 'lifetime_motes', tierId: 'diamond', amount: 1000000   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#d8e4ec' },
  // ── Nullstone Milestones ──────────────────────────────────────
  { id: 'mote_nullstone_100',  groupId: 'motes', subcategoryId: 'motes_nullstone', displayName: 'Nullstone — 100',      description: 'Earn 100 lifetime Nullstone motes.',       condition: { kind: 'lifetime_motes', tierId: 'nullstone', amount: 100       }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#9664c8' },
  { id: 'mote_nullstone_1k',   groupId: 'motes', subcategoryId: 'motes_nullstone', displayName: 'Nullstone — 1,000',    description: 'Earn 1,000 lifetime Nullstone motes.',     condition: { kind: 'lifetime_motes', tierId: 'nullstone', amount: 1000      }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#9664c8' },
  { id: 'mote_nullstone_10k',  groupId: 'motes', subcategoryId: 'motes_nullstone', displayName: 'Nullstone — 10,000',   description: 'Earn 10,000 lifetime Nullstone motes.',    condition: { kind: 'lifetime_motes', tierId: 'nullstone', amount: 10000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#8858b8' },
  { id: 'mote_nullstone_100k', groupId: 'motes', subcategoryId: 'motes_nullstone', displayName: 'Nullstone — 100,000',  description: 'Earn 100,000 lifetime Nullstone motes.',   condition: { kind: 'lifetime_motes', tierId: 'nullstone', amount: 100000    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#8858b8' },
  { id: 'mote_nullstone_1m',   groupId: 'motes', subcategoryId: 'motes_nullstone', displayName: 'Nullstone — 1 Million',description: 'Earn 1,000,000 lifetime Nullstone motes.', condition: { kind: 'lifetime_motes', tierId: 'nullstone', amount: 1000000   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#744ca4' },
  // ── Fracteryl Milestones ──────────────────────────────────────
  { id: 'mote_fracteryl_100',  groupId: 'motes', subcategoryId: 'motes_fracteryl', displayName: 'Fracteryl — 100',      description: 'Earn 100 lifetime Fracteryl motes.',       condition: { kind: 'lifetime_motes', tierId: 'fracteryl', amount: 100       }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#7A2CFF' },
  { id: 'mote_fracteryl_1k',   groupId: 'motes', subcategoryId: 'motes_fracteryl', displayName: 'Fracteryl — 1,000',    description: 'Earn 1,000 lifetime Fracteryl motes.',     condition: { kind: 'lifetime_motes', tierId: 'fracteryl', amount: 1000      }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#7A2CFF' },
  { id: 'mote_fracteryl_10k',  groupId: 'motes', subcategoryId: 'motes_fracteryl', displayName: 'Fracteryl — 10,000',   description: 'Earn 10,000 lifetime Fracteryl motes.',    condition: { kind: 'lifetime_motes', tierId: 'fracteryl', amount: 10000     }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#6820e0' },
  { id: 'mote_fracteryl_100k', groupId: 'motes', subcategoryId: 'motes_fracteryl', displayName: 'Fracteryl — 100,000',  description: 'Earn 100,000 lifetime Fracteryl motes.',   condition: { kind: 'lifetime_motes', tierId: 'fracteryl', amount: 100000    }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#6820e0' },
  { id: 'mote_fracteryl_1m',   groupId: 'motes', subcategoryId: 'motes_fracteryl', displayName: 'Fracteryl — 1 Million',description: 'Earn 1,000,000 lifetime Fracteryl motes.', condition: { kind: 'lifetime_motes', tierId: 'fracteryl', amount: 1000000   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#5610c8' },
  // ── Eigenstein Milestones ─────────────────────────────────────
  { id: 'mote_eigenstein_100',  groupId: 'motes', subcategoryId: 'motes_eigenstein', displayName: 'Eigenstein — 100',      description: 'Earn 100 lifetime Eigenstein motes.',       condition: { kind: 'lifetime_motes', tierId: 'eigenstein', amount: 100       }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#A34728' },
  { id: 'mote_eigenstein_1k',   groupId: 'motes', subcategoryId: 'motes_eigenstein', displayName: 'Eigenstein — 1,000',    description: 'Earn 1,000 lifetime Eigenstein motes.',     condition: { kind: 'lifetime_motes', tierId: 'eigenstein', amount: 1000      }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#A34728' },
  { id: 'mote_eigenstein_10k',  groupId: 'motes', subcategoryId: 'motes_eigenstein', displayName: 'Eigenstein — 10,000',   description: 'Earn 10,000 lifetime Eigenstein motes.',    condition: { kind: 'lifetime_motes', tierId: 'eigenstein', amount: 10000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#8c3c20' },
  { id: 'mote_eigenstein_100k', groupId: 'motes', subcategoryId: 'motes_eigenstein', displayName: 'Eigenstein — 100,000',  description: 'Earn 100,000 lifetime Eigenstein motes.',   condition: { kind: 'lifetime_motes', tierId: 'eigenstein', amount: 100000    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#8c3c20' },
  { id: 'mote_eigenstein_1m',   groupId: 'motes', subcategoryId: 'motes_eigenstein', displayName: 'Eigenstein — 1 Million',description: 'Earn 1,000,000 lifetime Eigenstein motes.', condition: { kind: 'lifetime_motes', tierId: 'eigenstein', amount: 1000000   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#783018' },
  // ── Cross-Tier Milestones ─────────────────────────────────────
  { id: 'mote_cross_all_1',    groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'All Tiers — 1 Each',      description: 'Earn at least 1 mote from every unlocked tier.',           condition: { kind: 'all_unlocked_tiers_lifetime_motes', amount: 1        }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#a0d8ff' },
  { id: 'mote_cross_all_100',  groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'All Tiers — 100 Each',    description: 'Earn at least 100 lifetime motes from every unlocked tier.',condition: { kind: 'all_unlocked_tiers_lifetime_motes', amount: 100      }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#a0d8ff' },
  { id: 'mote_cross_all_1k',   groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'All Tiers — 1,000 Each', description: 'Earn at least 1,000 lifetime motes from every unlocked tier.',condition: { kind: 'all_unlocked_tiers_lifetime_motes', amount: 1000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#80c8f0' },
  { id: 'mote_cross_all_10k',  groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'All Tiers — 10,000 Each',description: 'Earn at least 10,000 lifetime motes from every unlocked tier.',condition: { kind: 'all_unlocked_tiers_lifetime_motes', amount: 10000    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#80c8f0' },
  { id: 'mote_cross_all_100k', groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'All Tiers — 100,000 Each', description: 'Earn at least 100,000 lifetime motes from every unlocked tier.', condition: { kind: 'all_unlocked_tiers_lifetime_motes', amount: 100000  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#60b8e0' },
  { id: 'mote_cross_all_1m',   groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'All Tiers — 1 Million Each', description: 'Earn at least 1,000,000 lifetime motes from every unlocked tier.', condition: { kind: 'all_unlocked_tiers_lifetime_motes', amount: 1000000 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#60b8e0' },
  { id: 'mote_cross_thru_amethyst', groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Spectrum Through Amethyst', description: 'Earn at least 1 mote from every tier from Sand through Amethyst.', condition: { kind: 'specific_tiers_lifetime_motes', tierIds: ['sand','quartz','ruby','sunstone','citrine','emerald','sapphire','iolite','amethyst'] }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#b464c8' },
  { id: 'mote_cross_thru_nullstone', groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Spectrum Through Nullstone', description: 'Earn at least 1 mote from every tier from Sand through Nullstone.', condition: { kind: 'specific_tiers_lifetime_motes', tierIds: ['sand','quartz','ruby','sunstone','citrine','emerald','sapphire','iolite','amethyst','diamond','nullstone'] }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#9664c8' },
  { id: 'mote_cross_thru_eigenstein', groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Full Spectrum', description: 'Earn at least 1 mote from every tier from Sand through Eigenstein.', condition: { kind: 'specific_tiers_lifetime_motes', tierIds: ['sand','quartz','ruby','sunstone','citrine','emerald','sapphire','iolite','amethyst','diamond','nullstone','fracteryl','eigenstein'] }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.10, displayColor: '#A34728' },
  { id: 'mote_current_100',   groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Stockpile — 100',   description: 'Have at least 100 current motes in every unlocked tier at the same time.',    condition: { kind: 'current_motes_all_unlocked_tiers', amount: 100    }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#80e0d0' },
  { id: 'mote_current_1k',    groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Stockpile — 1,000', description: 'Have at least 1,000 current motes in every unlocked tier at the same time.',  condition: { kind: 'current_motes_all_unlocked_tiers', amount: 1000   }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#80e0d0' },
  { id: 'mote_current_10k',   groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Stockpile — 10,000',description: 'Have at least 10,000 current motes in every unlocked tier at the same time.', condition: { kind: 'current_motes_all_unlocked_tiers', amount: 10000  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#60d0c0' },
  { id: 'mote_current_100k',  groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Stockpile — 100,000',description:'Have at least 100,000 current motes in every unlocked tier at the same time.',condition: { kind: 'current_motes_all_unlocked_tiers', amount: 100000 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#60d0c0' },
  { id: 'mote_total_1k',   groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Grand Total — 1,000',        description: 'Earn 1,000 total lifetime motes across all tiers.',            condition: { kind: 'lifetime_motes_total', amount: 1000            }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#c0ffc0' },
  { id: 'mote_total_100k', groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Grand Total — 100,000',      description: 'Earn 100,000 total lifetime motes across all tiers.',          condition: { kind: 'lifetime_motes_total', amount: 100000          }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#c0ffc0' },
  { id: 'mote_total_10m',  groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Grand Total — 10 Million',   description: 'Earn 10,000,000 total lifetime motes across all tiers.',       condition: { kind: 'lifetime_motes_total', amount: 10000000        }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#a0f0a0' },
  { id: 'mote_total_1b',   groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Grand Total — 1 Billion',    description: 'Earn 1,000,000,000 total lifetime motes across all tiers.',    condition: { kind: 'lifetime_motes_total', amount: 1000000000      }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#a0f0a0' },
  { id: 'mote_total_1t',   groupId: 'motes', subcategoryId: 'motes_cross_tier', displayName: 'Grand Total — 1 Trillion',   description: 'Earn 1,000,000,000,000 total lifetime motes across all tiers.',condition: { kind: 'lifetime_motes_total', amount: 1000000000000   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.10, displayColor: '#80e080' },
  // ── Mote Size Milestones ──────────────────────────────────────
  { id: 'mote_size_1',         groupId: 'motes', subcategoryId: 'motes_size', displayName: 'Size-1 Mote',           description: 'Form your first size-1 mote through merging (any tier with 100+ lifetime motes).',        condition: { kind: 'any_tier_lifetime_motes', amount: 100           }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#ffe0a0' },
  { id: 'mote_size_2',         groupId: 'motes', subcategoryId: 'motes_size', displayName: 'Size-2 Mote',           description: 'Form your first size-2 mote through merging (any tier with 10,000+ lifetime motes).',    condition: { kind: 'any_tier_lifetime_motes', amount: 10000         }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#ffd060' },
  { id: 'mote_size_3',         groupId: 'motes', subcategoryId: 'motes_size', displayName: 'Size-3 Mote',           description: 'Form your first size-3 mote through merging (any tier with 1,000,000+ lifetime motes).', condition: { kind: 'any_tier_lifetime_motes', amount: 1000000       }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#ffc040' },
  { id: 'mote_size_4',         groupId: 'motes', subcategoryId: 'motes_size', displayName: 'Size-4 Mote',           description: 'Form your first size-4 mote through merging (any tier with 100,000,000+ lifetime motes).', condition: { kind: 'any_tier_lifetime_motes', amount: 100000000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#ffb020' },
  { id: 'mote_size_3_5tiers',  groupId: 'motes', subcategoryId: 'motes_size', displayName: 'Size-3 in 5 Tiers',    description: 'Form a size-3 mote in any 5 different tiers (5 tiers with 1,000,000+ lifetime motes).', condition: { kind: 'tiers_with_lifetime_motes', count: 5, amount: 1000000    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#ffa000' },
  { id: 'mote_size_4_3tiers',  groupId: 'motes', subcategoryId: 'motes_size', displayName: 'Size-4 in 3 Tiers',    description: 'Form a size-4 mote in any 3 different tiers (3 tiers with 100,000,000+ lifetime motes).', condition: { kind: 'tiers_with_lifetime_motes', count: 3, amount: 100000000  }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.10, displayColor: '#ff9000' },
  // ── Aliven Mote Milestones ────────────────────────────────────
  { id: 'mote_aliven_1',   groupId: 'motes', subcategoryId: 'motes_aliven', displayName: 'First Aliven',      description: 'Aliven your first mote tier.',                                  condition: { kind: 'aliven_count', count: 1  }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#a0f0ff' },
  { id: 'mote_aliven_3',   groupId: 'motes', subcategoryId: 'motes_aliven', displayName: 'Aliven 3',          description: 'Aliven 3 mote tiers.',                                          condition: { kind: 'aliven_count', count: 3  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#80e0f0' },
  { id: 'mote_aliven_5',   groupId: 'motes', subcategoryId: 'motes_aliven', displayName: 'Aliven 5',          description: 'Aliven 5 mote tiers.',                                          condition: { kind: 'aliven_count', count: 5  }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#60d0e0' },
  { id: 'mote_aliven_8',   groupId: 'motes', subcategoryId: 'motes_aliven', displayName: 'Aliven 8',          description: 'Aliven 8 mote tiers.',                                          condition: { kind: 'aliven_count', count: 8  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#40c0d0' },
  { id: 'mote_aliven_all', groupId: 'motes', subcategoryId: 'motes_aliven', displayName: 'Fully Alivened',    description: 'Aliven every mote tier that can currently be alivened (Sand through Nullstone).', condition: { kind: 'aliven_all_possible' },  bonusKind: 'loom_multiplier', bonusMultiplier: 1.10, displayColor: '#20b0c0' },
];

// ─── Equation group ──────────────────────────────────────────────

const EQUATION_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  // ── Forge Unlocks ────────────────────────────────────────────
  { id: 'equation_awakened', groupId: 'equation', subcategoryId: 'eq_forge_unlock', displayName: 'Equation Awakened', description: 'Unlock the Equation Forge and begin refining motes.', condition: { kind: 'forge_unlocked' }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  // ── Equation Taps ─────────────────────────────────────────────
  { id: 'eq_tap_1',       groupId: 'equation', subcategoryId: 'eq_taps', displayName: 'First Tap',        description: 'Perform your first equation tap.',          condition: { kind: 'tap_count', count: 1        }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'eq_tap_10',      groupId: 'equation', subcategoryId: 'eq_taps', displayName: 'Ten Taps',         description: 'Tap the equation 10 times.',                condition: { kind: 'tap_count', count: 10       }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'first_principle',groupId: 'equation', subcategoryId: 'eq_taps', displayName: 'First Principle',  description: 'Tap the equation 100 times.',               condition: { kind: 'tap_count', count: 100      }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'tenfold_recursion',groupId:'equation', subcategoryId: 'eq_taps', displayName: 'Tenfold Recursion',description: 'Tap the equation 1,000 times.',             condition: { kind: 'tap_count', count: 1000     }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.10, displayColor: '#80b0ff' },
  { id: 'convergence',    groupId: 'equation', subcategoryId: 'eq_taps', displayName: 'Convergence',      description: 'Tap the equation 10,000 times.',            condition: { kind: 'tap_count', count: 10000    }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.15, displayColor: '#60a0ff' },
  { id: 'eq_tap_100k',    groupId: 'equation', subcategoryId: 'eq_taps', displayName: '100,000 Taps',     description: 'Tap the equation 100,000 times.',           condition: { kind: 'tap_count', count: 100000   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#5090f0' },
  { id: 'eq_tap_1m',      groupId: 'equation', subcategoryId: 'eq_taps', displayName: 'One Million Taps', description: 'Tap the equation 1,000,000 times.',         condition: { kind: 'tap_count', count: 1000000  }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.10, displayColor: '#4080e0' },
  // ── Equation Tier Unlocks ─────────────────────────────────────
  { id: 'eq_tier_2',       groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 2 Tiers',   description: 'Unlock 2 equation tiers.',  condition: { kind: 'equation_tiers', count: 2  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'eq_tier_3',       groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 3 Tiers',   description: 'Unlock 3 equation tiers.',  condition: { kind: 'equation_tiers', count: 3  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'eq_tier_4',       groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 4 Tiers',   description: 'Unlock 4 equation tiers.',  condition: { kind: 'equation_tiers', count: 4  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#90bcf0' },
  { id: 'expanding_terms', groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Expanding Terms',  description: 'Unlock 5 equation tiers.',  condition: { kind: 'equation_tiers', count: 5  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'eq_tier_6',       groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 6 Tiers',   description: 'Unlock 6 equation tiers.',  condition: { kind: 'equation_tiers', count: 6  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#80b0e8' },
  { id: 'eq_tier_7',       groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 7 Tiers',   description: 'Unlock 7 equation tiers.',  condition: { kind: 'equation_tiers', count: 7  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#80b0e8' },
  { id: 'eq_tier_8',       groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 8 Tiers',   description: 'Unlock 8 equation tiers.',  condition: { kind: 'equation_tiers', count: 8  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#70a0d8' },
  { id: 'full_spectrum',   groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Full Spectrum',    description: 'Unlock all 9 equation tiers.', condition: { kind: 'equation_tiers', count: 9 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.10, displayColor: '#80b0ff' },
  { id: 'eq_tier_10',      groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 10 Tiers',  description: 'Unlock 10 equation tiers.', condition: { kind: 'equation_tiers', count: 10 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#6090c8' },
  { id: 'eq_tier_11',      groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 11 Tiers',  description: 'Unlock 11 equation tiers.', condition: { kind: 'equation_tiers', count: 11 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#6090c8' },
  { id: 'eq_tier_12',      groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 12 Tiers',  description: 'Unlock 12 equation tiers.', condition: { kind: 'equation_tiers', count: 12 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#5080b8' },
  { id: 'eq_tier_13',      groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Unlock 13 Tiers',  description: 'Unlock 13 equation tiers.', condition: { kind: 'equation_tiers', count: 13 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.10, displayColor: '#5080b8' },
  { id: 'eq_seg_quartz',   groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Quartz Segment',   description: 'Unlock the Quartz equation segment.',   condition: { kind: 'equation_segment_unlocked', tierId: 'quartz'    }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#f5f0eb' },
  { id: 'eq_seg_ruby',     groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Ruby Segment',     description: 'Unlock the Ruby equation segment.',     condition: { kind: 'equation_segment_unlocked', tierId: 'ruby'      }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#dc3232' },
  { id: 'eq_seg_sunstone', groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Sunstone Segment', description: 'Unlock the Sunstone equation segment.', condition: { kind: 'equation_segment_unlocked', tierId: 'sunstone'  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#ff8c3c' },
  { id: 'eq_seg_citrine',  groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Citrine Segment',  description: 'Unlock the Citrine equation segment.',  condition: { kind: 'equation_segment_unlocked', tierId: 'citrine'   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#e6c850' },
  { id: 'eq_seg_emerald',  groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Emerald Segment',  description: 'Unlock the Emerald equation segment.',  condition: { kind: 'equation_segment_unlocked', tierId: 'emerald'   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#50b464' },
  { id: 'eq_seg_sapphire', groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Sapphire Segment', description: 'Unlock the Sapphire equation segment.', condition: { kind: 'equation_segment_unlocked', tierId: 'sapphire'  }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#3c78c8' },
  { id: 'eq_seg_iolite',   groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Iolite Segment',   description: 'Unlock the Iolite equation segment.',   condition: { kind: 'equation_segment_unlocked', tierId: 'iolite'    }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#6464b4' },
  { id: 'eq_seg_amethyst', groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Amethyst Segment', description: 'Unlock the Amethyst equation segment.', condition: { kind: 'equation_segment_unlocked', tierId: 'amethyst'  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#b464c8' },
  { id: 'eq_seg_diamond',  groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Diamond Segment',  description: 'Unlock the Diamond equation segment.',  condition: { kind: 'equation_segment_unlocked', tierId: 'diamond'   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#f0f5fa' },
  { id: 'eq_seg_nullstone',groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Nullstone Segment',description: 'Unlock the Nullstone equation segment.',condition: { kind: 'equation_segment_unlocked', tierId: 'nullstone' }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#9664c8' },
  { id: 'eq_seg_fracteryl',groupId: 'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Fracteryl Segment',description: 'Unlock the Fracteryl equation segment.',condition: { kind: 'equation_segment_unlocked', tierId: 'fracteryl' }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#7A2CFF' },
  { id: 'eq_seg_eigenstein',groupId:'equation', subcategoryId: 'eq_tier_unlocks', displayName: 'Eigenstein Segment',description:'Unlock the Eigenstein equation segment.',condition: { kind: 'equation_segment_unlocked', tierId: 'eigenstein'}, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#A34728' },
  // ── Equation Upgrade Levels ───────────────────────────────────
  { id: 'eq_upg_first',  groupId: 'equation', subcategoryId: 'eq_upgrade_levels', displayName: 'First Upgrade',    description: 'Buy your first equation upgrade.',        condition: { kind: 'total_equation_upgrade_levels', count: 1    }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'eq_upg_10',     groupId: 'equation', subcategoryId: 'eq_upgrade_levels', displayName: '10 Upgrades',      description: 'Buy 10 total equation upgrades.',         condition: { kind: 'total_equation_upgrade_levels', count: 10   }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'eq_upg_25',     groupId: 'equation', subcategoryId: 'eq_upgrade_levels', displayName: '25 Upgrades',      description: 'Buy 25 total equation upgrades.',         condition: { kind: 'total_equation_upgrade_levels', count: 25   }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#90bcf0' },
  { id: 'eq_upg_50',     groupId: 'equation', subcategoryId: 'eq_upgrade_levels', displayName: '50 Upgrades',      description: 'Buy 50 total equation upgrades.',         condition: { kind: 'total_equation_upgrade_levels', count: 50   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#90bcf0' },
  { id: 'eq_upg_100',    groupId: 'equation', subcategoryId: 'eq_upgrade_levels', displayName: '100 Upgrades',     description: 'Buy 100 total equation upgrades.',        condition: { kind: 'total_equation_upgrade_levels', count: 100  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#80b0e8' },
  { id: 'eq_upg_250',    groupId: 'equation', subcategoryId: 'eq_upgrade_levels', displayName: '250 Upgrades',     description: 'Buy 250 total equation upgrades.',        condition: { kind: 'total_equation_upgrade_levels', count: 250  }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#80b0e8' },
  { id: 'eq_upg_500',    groupId: 'equation', subcategoryId: 'eq_upgrade_levels', displayName: '500 Upgrades',     description: 'Buy 500 total equation upgrades.',        condition: { kind: 'total_equation_upgrade_levels', count: 500  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#70a0d8' },
  { id: 'eq_upg_1000',   groupId: 'equation', subcategoryId: 'eq_upgrade_levels', displayName: '1,000 Upgrades',   description: 'Buy 1,000 total equation upgrades.',      condition: { kind: 'total_equation_upgrade_levels', count: 1000 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.10, displayColor: '#6090c8' },
  // ── Per-Tier Equation Mastery ─────────────────────────────────
  { id: 'eq_any_lv2',   groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Level 2',    description: 'Upgrade any equation segment to level 2.',   condition: { kind: 'any_equation_segment_level', level: 2   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'eq_any_lv5',   groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Level 5',    description: 'Upgrade any equation segment to level 5.',   condition: { kind: 'any_equation_segment_level', level: 5   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'eq_any_lv10',  groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Level 10',   description: 'Upgrade any equation segment to level 10.',  condition: { kind: 'any_equation_segment_level', level: 10  }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#90bcf0' },
  { id: 'eq_any_lv25',  groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Level 25',   description: 'Upgrade any equation segment to level 25.',  condition: { kind: 'any_equation_segment_level', level: 25  }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#80b0e8' },
  { id: 'eq_any_lv50',  groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Level 50',   description: 'Upgrade any equation segment to level 50.',  condition: { kind: 'any_equation_segment_level', level: 50  }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#70a0d8' },
  { id: 'eq_any_lv100', groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Level 100',  description: 'Upgrade any equation segment to level 100.', condition: { kind: 'any_equation_segment_level', level: 100 }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.10, displayColor: '#6090c8' },
  { id: 'eq_quartz_lv10',   groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Quartz Lv. 10',   description: 'Upgrade the Quartz equation segment to level 10.',   condition: { kind: 'equation_segment_level', tierId: 'quartz',    level: 10 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f5f0eb' },
  { id: 'eq_ruby_lv10',     groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Ruby Lv. 10',     description: 'Upgrade the Ruby equation segment to level 10.',     condition: { kind: 'equation_segment_level', tierId: 'ruby',      level: 10 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#dc3232' },
  { id: 'eq_sunstone_lv10', groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Sunstone Lv. 10', description: 'Upgrade the Sunstone equation segment to level 10.', condition: { kind: 'equation_segment_level', tierId: 'sunstone',  level: 10 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#ff8c3c' },
  { id: 'eq_citrine_lv10',  groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Citrine Lv. 10',  description: 'Upgrade the Citrine equation segment to level 10.',  condition: { kind: 'equation_segment_level', tierId: 'citrine',   level: 10 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#e6c850' },
  { id: 'eq_emerald_lv10',  groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Emerald Lv. 10',  description: 'Upgrade the Emerald equation segment to level 10.',  condition: { kind: 'equation_segment_level', tierId: 'emerald',   level: 10 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#50b464' },
  { id: 'eq_sapphire_lv10', groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Sapphire Lv. 10', description: 'Upgrade the Sapphire equation segment to level 10.', condition: { kind: 'equation_segment_level', tierId: 'sapphire',  level: 10 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#3c78c8' },
  { id: 'eq_iolite_lv10',   groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Iolite Lv. 10',   description: 'Upgrade the Iolite equation segment to level 10.',   condition: { kind: 'equation_segment_level', tierId: 'iolite',    level: 10 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#6464b4' },
  { id: 'eq_amethyst_lv10', groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Amethyst Lv. 10', description: 'Upgrade the Amethyst equation segment to level 10.', condition: { kind: 'equation_segment_level', tierId: 'amethyst',  level: 10 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#b464c8' },
  { id: 'eq_diamond_lv10',  groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Diamond Lv. 10',  description: 'Upgrade the Diamond equation segment to level 10.',  condition: { kind: 'equation_segment_level', tierId: 'diamond',   level: 10 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f0f5fa' },
  { id: 'eq_nullstone_lv10',groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Nullstone Lv. 10',description: 'Upgrade the Nullstone equation segment to level 10.',condition: { kind: 'equation_segment_level', tierId: 'nullstone', level: 10 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#9664c8' },
  { id: 'eq_quartz_lv50',   groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Quartz Lv. 50',   description: 'Upgrade the Quartz equation segment to level 50.',   condition: { kind: 'equation_segment_level', tierId: 'quartz',    level: 50 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f5f0eb' },
  { id: 'eq_ruby_lv50',     groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Ruby Lv. 50',     description: 'Upgrade the Ruby equation segment to level 50.',     condition: { kind: 'equation_segment_level', tierId: 'ruby',      level: 50 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#dc3232' },
  { id: 'eq_sunstone_lv50', groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Sunstone Lv. 50', description: 'Upgrade the Sunstone equation segment to level 50.', condition: { kind: 'equation_segment_level', tierId: 'sunstone',  level: 50 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#ff8c3c' },
  { id: 'eq_citrine_lv50',  groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Citrine Lv. 50',  description: 'Upgrade the Citrine equation segment to level 50.',  condition: { kind: 'equation_segment_level', tierId: 'citrine',   level: 50 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#e6c850' },
  { id: 'eq_emerald_lv50',  groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Emerald Lv. 50',  description: 'Upgrade the Emerald equation segment to level 50.',  condition: { kind: 'equation_segment_level', tierId: 'emerald',   level: 50 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#50b464' },
  { id: 'eq_sapphire_lv50', groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Sapphire Lv. 50', description: 'Upgrade the Sapphire equation segment to level 50.', condition: { kind: 'equation_segment_level', tierId: 'sapphire',  level: 50 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#3c78c8' },
  { id: 'eq_iolite_lv50',   groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Iolite Lv. 50',   description: 'Upgrade the Iolite equation segment to level 50.',   condition: { kind: 'equation_segment_level', tierId: 'iolite',    level: 50 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#6464b4' },
  { id: 'eq_amethyst_lv50', groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Amethyst Lv. 50', description: 'Upgrade the Amethyst equation segment to level 50.', condition: { kind: 'equation_segment_level', tierId: 'amethyst',  level: 50 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#b464c8' },
  { id: 'eq_diamond_lv50',  groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Diamond Lv. 50',  description: 'Upgrade the Diamond equation segment to level 50.',  condition: { kind: 'equation_segment_level', tierId: 'diamond',   level: 50 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#f0f5fa' },
  { id: 'eq_nullstone_lv50',groupId: 'equation', subcategoryId: 'eq_per_tier', displayName: 'Nullstone Lv. 50',description: 'Upgrade the Nullstone equation segment to level 50.',condition: { kind: 'equation_segment_level', tierId: 'nullstone', level: 50 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#9664c8' },
  // ── Structured Equation Milestones ────────────────────────────
  { id: 'eq_all_lv2',   groupId: 'equation', subcategoryId: 'eq_structured', displayName: 'All Segments — Lv. 2',   description: 'Have every unlocked equation segment at level 2 or higher.',   condition: { kind: 'all_unlocked_equation_segments_level', level: 2   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#a0c8ff' },
  { id: 'eq_all_lv5',   groupId: 'equation', subcategoryId: 'eq_structured', displayName: 'All Segments — Lv. 5',   description: 'Have every unlocked equation segment at level 5 or higher.',   condition: { kind: 'all_unlocked_equation_segments_level', level: 5   }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#90bcf0' },
  { id: 'eq_all_lv10',  groupId: 'equation', subcategoryId: 'eq_structured', displayName: 'All Segments — Lv. 10',  description: 'Have every unlocked equation segment at level 10 or higher.',  condition: { kind: 'all_unlocked_equation_segments_level', level: 10  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#80b0e8' },
  { id: 'eq_all_lv25',  groupId: 'equation', subcategoryId: 'eq_structured', displayName: 'All Segments — Lv. 25',  description: 'Have every unlocked equation segment at level 25 or higher.',  condition: { kind: 'all_unlocked_equation_segments_level', level: 25  }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#70a0d8' },
  { id: 'eq_all_lv50',  groupId: 'equation', subcategoryId: 'eq_structured', displayName: 'All Segments — Lv. 50',  description: 'Have every unlocked equation segment at level 50 or higher.',  condition: { kind: 'all_unlocked_equation_segments_level', level: 50  }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#6090c8' },
  { id: 'eq_all_lv100', groupId: 'equation', subcategoryId: 'eq_structured', displayName: 'All Segments — Lv. 100', description: 'Have every unlocked equation segment at level 100 or higher.', condition: { kind: 'all_unlocked_equation_segments_level', level: 100 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.10, displayColor: '#5080b8' },
  // ── Output Milestones ─────────────────────────────────────────
  { id: 'eq_out_10',   groupId: 'equation', subcategoryId: 'eq_output', displayName: 'Output — 10',          description: 'Reach an equation output of at least 10.',             condition: { kind: 'equivalence_reached', amount: 10          }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#a0e8c0' },
  { id: 'eq_out_100',  groupId: 'equation', subcategoryId: 'eq_output', displayName: 'Output — 100',         description: 'Reach an equation output of at least 100.',            condition: { kind: 'equivalence_reached', amount: 100         }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#90d8b0' },
  { id: 'eq_out_1k',   groupId: 'equation', subcategoryId: 'eq_output', displayName: 'Output — 1,000',       description: 'Reach an equation output of at least 1,000.',          condition: { kind: 'equivalence_reached', amount: 1000        }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#80c8a0' },
  { id: 'eq_out_10k',  groupId: 'equation', subcategoryId: 'eq_output', displayName: 'Output — 10,000',      description: 'Reach an equation output of at least 10,000.',         condition: { kind: 'equivalence_reached', amount: 10000       }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#70b890' },
  { id: 'eq_out_100k', groupId: 'equation', subcategoryId: 'eq_output', displayName: 'Output — 100,000',     description: 'Reach an equation output of at least 100,000.',        condition: { kind: 'equivalence_reached', amount: 100000      }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#60a880' },
  { id: 'eq_out_1m',   groupId: 'equation', subcategoryId: 'eq_output', displayName: 'Output — 1 Million',   description: 'Reach an equation output of at least 1,000,000.',      condition: { kind: 'equivalence_reached', amount: 1000000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#509870' },
  { id: 'eq_out_1b',   groupId: 'equation', subcategoryId: 'eq_output', displayName: 'Output — 1 Billion',   description: 'Reach an equation output of at least 1,000,000,000.', condition: { kind: 'equivalence_reached', amount: 1000000000  }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#408860' },
  { id: 'eq_out_1t',   groupId: 'equation', subcategoryId: 'eq_output', displayName: 'Output — 1 Trillion',  description: 'Reach an equation output of at least 1,000,000,000,000.', condition: { kind: 'equivalence_reached', amount: 1000000000000 }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.10, displayColor: '#307850' },
  // ── Tap Gain Milestones ───────────────────────────────────────
  { id: 'eq_tap_gain_10',  groupId: 'equation', subcategoryId: 'eq_tap_gain', displayName: 'Tap Gain — 10',      description: 'Reach a total tap gain of at least 10 motes from one tap.',       condition: { kind: 'equation_tap_gain_total', amount: 10      }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffd090' },
  { id: 'eq_tap_gain_100', groupId: 'equation', subcategoryId: 'eq_tap_gain', displayName: 'Tap Gain — 100',     description: 'Reach a total tap gain of at least 100 motes from one tap.',      condition: { kind: 'equation_tap_gain_total', amount: 100     }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffc070' },
  { id: 'eq_tap_gain_1k',  groupId: 'equation', subcategoryId: 'eq_tap_gain', displayName: 'Tap Gain — 1,000',   description: 'Reach a total tap gain of at least 1,000 motes from one tap.',    condition: { kind: 'equation_tap_gain_total', amount: 1000    }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffb050' },
  { id: 'eq_tap_gain_10k', groupId: 'equation', subcategoryId: 'eq_tap_gain', displayName: 'Tap Gain — 10,000',  description: 'Reach a total tap gain of at least 10,000 motes from one tap.',   condition: { kind: 'equation_tap_gain_total', amount: 10000   }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ffa030' },
  { id: 'eq_tap_gain_100k',groupId: 'equation', subcategoryId: 'eq_tap_gain', displayName: 'Tap Gain — 100,000', description: 'Reach a total tap gain of at least 100,000 motes from one tap.',  condition: { kind: 'equation_tap_gain_total', amount: 100000  }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.05, displayColor: '#ff9010' },
  { id: 'eq_tap_gain_1m',  groupId: 'equation', subcategoryId: 'eq_tap_gain', displayName: 'Tap Gain — 1 Million',description:'Reach a total tap gain of at least 1,000,000 motes from one tap.', condition: { kind: 'equation_tap_gain_total', amount: 1000000 }, bonusKind: 'tap_multiplier', bonusMultiplier: 1.10, displayColor: '#ff8000' },
  // ── Long-Term Equation Progression ───────────────────────────
  { id: 'eq_thru_nullstone',  groupId: 'equation', subcategoryId: 'eq_long_term', displayName: 'Through Nullstone',  description: 'Unlock the full structured equation through Nullstone.',  condition: { kind: 'equation_tiers', count: 11 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.10, displayColor: '#9664c8' },
  { id: 'eq_thru_fracteryl',  groupId: 'equation', subcategoryId: 'eq_long_term', displayName: 'Through Fracteryl',  description: 'Unlock the full structured equation through Fracteryl.',  condition: { kind: 'equation_tiers', count: 12 }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.10, displayColor: '#7A2CFF' },
  { id: 'eq_thru_eigenstein', groupId: 'equation', subcategoryId: 'eq_long_term', displayName: 'Through Eigenstein', description: 'Unlock the full structured equation through Eigenstein.', condition: { kind: 'equation_tiers', count: 13 }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.10, displayColor: '#A34728' },
  { id: 'eq_equiv_1k',   groupId: 'equation', subcategoryId: 'eq_long_term', displayName: 'Equivalence — 1,000',       description: 'Reach an Equivalence score of at least 1,000 while the Equation Forge is unlocked.',           condition: { kind: 'equivalence_reached', amount: 1000        }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.05, displayColor: '#a0ffa0' },
  { id: 'eq_equiv_1m',   groupId: 'equation', subcategoryId: 'eq_long_term', displayName: 'Equivalence — 1 Million',   description: 'Reach an Equivalence score of at least 1,000,000 while the Equation Forge is unlocked.',        condition: { kind: 'equivalence_reached', amount: 1000000     }, bonusKind: 'loom_multiplier', bonusMultiplier: 1.05, displayColor: '#80ff80' },
  { id: 'eq_equiv_1b',   groupId: 'equation', subcategoryId: 'eq_long_term', displayName: 'Equivalence — 1 Billion',   description: 'Reach an Equivalence score of at least 1,000,000,000 while the Equation Forge is unlocked.',    condition: { kind: 'equivalence_reached', amount: 1000000000  }, bonusKind: 'tap_multiplier',  bonusMultiplier: 1.10, displayColor: '#60ff60' },
];

// ─── RPG group ───────────────────────────────────────────────────

const RPG_ACHIEVEMENTS: readonly AchievementDefinition[] = [
  {
    id: 'armed_and_ready',
    groupId: 'rpg',
    subcategoryId: 'rpg_weapons_purchased',
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
    subcategoryId: 'rpg_wave_progression',
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
    subcategoryId: 'rpg_wave_progression',
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
    subcategoryId: 'rpg_xp_stats',
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
    subcategoryId: 'rpg_wave_progression',
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
    subcategoryId: 'rpg_weapon_upgrades',
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
    subcategoryId: 'rpg_wave_progression',
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
    subcategoryId: 'rpg_weapons_purchased',
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
    subcategoryId: 'rpg_xp_stats',
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
    subcategoryId: 'rpg_bosses',
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
    subcategoryId: 'rpg_wave_progression',
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
    subcategoryId: 'rpg_weapons_purchased',
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
  { id: 'rpg_ach_001', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #1',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 2   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_002', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #2',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 5   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_003', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #3',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 10  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_004', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #4',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 15  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_005', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #5',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 20  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_006', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #6',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 25  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_007', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #7',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 30  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_008', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #8',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 40  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_009', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #9',   description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_010', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #10',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 60  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_011', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #11',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 70  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_012', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #12',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 85  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_013', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #13',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 101 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_014', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #14',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 150 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_015', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #15',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 201 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_016', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #16',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 301 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  { id: 'rpg_ach_017', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #17',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 501 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  { id: 'rpg_ach_018', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #18',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 751 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b05030' },
  { id: 'rpg_ach_019', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #19',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 1001}, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b05030' },
  // ── Eigenstein unlock: first wave where Eigenstein appears (020) ──
  { id: 'rpg_ach_020', groupId: 'rpg', subcategoryId: 'rpg_wave_progression', displayName: 'RPG #20',  description: 'Hidden criteria.', condition: { kind: 'wave_reached', wave: 81  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c080' },
  // ── Boss progression (021–035) ────────────────────────────────
  { id: 'rpg_ach_021', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #21',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_022', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #22',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 2  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_023', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #23',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 3  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_024', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #24',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_025', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #25',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 10 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_026', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #26',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_defeated', bossId: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8080' },
  { id: 'rpg_ach_027', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #27',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_defeated', bossId: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8080' },
  { id: 'rpg_ach_028', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #28',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_defeated', bossId: 10 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8080' },
  { id: 'rpg_ach_029', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #29',  description: 'Hidden criteria.', condition: { kind: 'any_boss_at_speed', minSpeedPct: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_030', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #30',  description: 'Hidden criteria.', condition: { kind: 'any_boss_at_speed', minSpeedPct: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_031', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #31',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_at_speed', bossId: 1, minSpeedPct: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffa060' },
  { id: 'rpg_ach_032', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #32',  description: 'Hidden criteria.', condition: { kind: 'all_bosses_at_speed', minSpeedPct: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffa060' },
  { id: 'rpg_ach_033', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #33',  description: 'Hidden criteria.', condition: { kind: 'specific_boss_at_speed', bossId: 2, minSpeedPct: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffa060' },
  { id: 'rpg_ach_034', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #34',  description: 'Hidden criteria.', condition: { kind: 'boss_defeated_any_speed_1weapon' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff7040' },
  { id: 'rpg_ach_035', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #35',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 5 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  // ── XP progression (036–058) ──────────────────────────────────
  { id: 'rpg_ach_036', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #36',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 100           }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e09030' },
  { id: 'rpg_ach_037', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #37',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 1000          }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e09030' },
  { id: 'rpg_ach_038', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #38',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 10000         }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e09030' },
  { id: 'rpg_ach_039', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #39',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 100000        }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e09030' },
  { id: 'rpg_ach_040', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #40',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 1000000       }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d08020' },
  { id: 'rpg_ach_041', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #41',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 10000000      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d08020' },
  { id: 'rpg_ach_042', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #42',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 100000000     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d08020' },
  { id: 'rpg_ach_043', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #43',  description: 'Hidden criteria.', condition: { kind: 'xp_reached', xp: 1000000000    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c07010' },
  { id: 'rpg_ach_044', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #44',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stat', stat: 'atk'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_045', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #45',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stat', stat: 'def'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0ff' },
  { id: 'rpg_ach_046', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #46',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stat', stat: 'luck' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0ffa0' },
  { id: 'rpg_ach_047', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #47',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stat', stat: 'hp'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff80a0' },
  { id: 'rpg_ach_048', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #48',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stats_count', count: 2 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c0a060' },
  { id: 'rpg_ach_049', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #49',  description: 'Hidden criteria.', condition: { kind: 'xp_allocated_stats_count', count: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c0a060' },
  { id: 'rpg_ach_050', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #50',  description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'atk',  amount: 1000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_051', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #51',  description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'def',  amount: 1000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0ff' },
  { id: 'rpg_ach_052', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #52',  description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'luck', amount: 1000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0ffa0' },
  { id: 'rpg_ach_053', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #53',  description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'hp',   amount: 1000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff80a0' },
  // ── Weapon purchasing (054–068) ───────────────────────────────
  { id: 'rpg_ach_054', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #54',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'sand_blade'       }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c080' },
  { id: 'rpg_ach_055', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #55',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'quartz_whip'      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0d0ff' },
  { id: 'rpg_ach_056', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #56',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'ruby_laser'       }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_057', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #57',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'sunstone_mine'    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0a030' },
  { id: 'rpg_ach_058', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #58',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'citrine_nova'     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#f0d060' },
  { id: 'rpg_ach_059', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #59',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'emerald_launcher'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d080' },
  { id: 'rpg_ach_060', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #60',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'sapphire_ships'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#4080ff' },
  { id: 'rpg_ach_061', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #61',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'iolite_bolt'      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#8060c0' },
  { id: 'rpg_ach_062', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #62',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'amethyst_ships'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c060c0' },
  { id: 'rpg_ach_063', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #63',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'diamond_bastion'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80d0ff' },
  { id: 'rpg_ach_064', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #64',  description: 'Hidden criteria.', condition: { kind: 'weapon_purchased', weaponId: 'nullstone_nova'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#9060c0' },
  { id: 'rpg_ach_065', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #65',  description: 'Hidden criteria.', condition: { kind: 'weapons_purchased_count', count: 3  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_066', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #66',  description: 'Hidden criteria.', condition: { kind: 'weapons_purchased_count', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_067', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #67',  description: 'Hidden criteria.', condition: { kind: 'weapons_purchased_count', count: 8  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_068', groupId: 'rpg', subcategoryId: 'rpg_weapons_purchased', displayName: 'RPG #68',  description: 'Hidden criteria.', condition: { kind: 'weapons_purchased_count', count: 11 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  // ── Weapon upgrading (069–087) ────────────────────────────────
  { id: 'rpg_ach_069', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #69',  description: 'Hidden criteria.', condition: { kind: 'weapons_at_max_tier', count: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d0a030' },
  { id: 'rpg_ach_070', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #70',  description: 'Hidden criteria.', condition: { kind: 'weapons_at_max_tier', count: 3  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d0a030' },
  { id: 'rpg_ach_071', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #71',  description: 'Hidden criteria.', condition: { kind: 'weapons_at_max_tier', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d0a030' },
  { id: 'rpg_ach_072', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #72',  description: 'Hidden criteria.', condition: { kind: 'all_purchased_max_tier' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c08020' },
  { id: 'rpg_ach_073', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #73',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'sand_blade'      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c080' },
  { id: 'rpg_ach_074', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #74',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'quartz_whip'     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0d0ff' },
  { id: 'rpg_ach_075', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #75',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'ruby_laser'      }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_076', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #76',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'sunstone_mine'   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0a030' },
  { id: 'rpg_ach_077', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #77',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'citrine_nova'    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#f0d060' },
  { id: 'rpg_ach_078', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #78',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'emerald_launcher' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d080' },
  { id: 'rpg_ach_079', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #79',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'sapphire_ships'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#4080ff' },
  { id: 'rpg_ach_080', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #80',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'iolite_bolt'     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#8060c0' },
  { id: 'rpg_ach_081', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #81',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'amethyst_ships'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c060c0' },
  { id: 'rpg_ach_082', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #82',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'diamond_bastion' }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80d0ff' },
  { id: 'rpg_ach_083', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #83',  description: 'Hidden criteria.', condition: { kind: 'specific_weapon_max_tier', weaponId: 'nullstone_nova'  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#9060c0' },
  // ── Equip count (084–087) ─────────────────────────────────────
  { id: 'rpg_ach_084', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #84',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 2 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_085', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #85',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_086', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #86',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 4 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_087', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #87',  description: 'Hidden criteria.', condition: { kind: 'equip_weapons_count', count: 5 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  // ── RPG upgrades (088–092) ────────────────────────────────────
  { id: 'rpg_ach_088', groupId: 'rpg', subcategoryId: 'rpg_rpg_upgrades', displayName: 'RPG #88',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'speed_upgrade',      level: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60e0e0' },
  { id: 'rpg_ach_089', groupId: 'rpg', subcategoryId: 'rpg_rpg_upgrades', displayName: 'RPG #89',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_any_max', maxLevel: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60e0e0' },
  { id: 'rpg_ach_090', groupId: 'rpg', subcategoryId: 'rpg_rpg_upgrades', displayName: 'RPG #90',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'orbit_projectile',    level: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a060ff' },
  { id: 'rpg_ach_091', groupId: 'rpg', subcategoryId: 'rpg_rpg_upgrades', displayName: 'RPG #91',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'extra_weapon_slot',   level: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_092', groupId: 'rpg', subcategoryId: 'rpg_rpg_upgrades', displayName: 'RPG #92',  description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'extra_weapon_slot',   level: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  // ── Total kills (093–100) ─────────────────────────────────────
  { id: 'rpg_ach_093', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #93',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 10     }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e06050' },
  { id: 'rpg_ach_094', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #94',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 100    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e06050' },
  { id: 'rpg_ach_095', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #95',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 1000   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d05040' },
  { id: 'rpg_ach_096', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #96',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 10000  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d05040' },
  { id: 'rpg_ach_097', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #97',  description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 100000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c04030' },
  // ── Kills by type — 15 enemy types (101–115, 5 each compressed) ───
  { id: 'rpg_ach_101', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #101', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'laser',    count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8060' },
  { id: 'rpg_ach_102', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #102', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'quartz',   count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0d0ff' },
  { id: 'rpg_ach_103', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #103', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'sapphire', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#4080ff' },
  { id: 'rpg_ach_104', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #104', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'emerald',  count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d080' },
  { id: 'rpg_ach_105', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #105', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'ruby',     count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff4060' },
  { id: 'rpg_ach_106', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #106', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'amber',    count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0a030' },
  { id: 'rpg_ach_107', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #107', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'void',     count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#8040c0' },
  { id: 'rpg_ach_108', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #108', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'sunstone', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c040' },
  { id: 'rpg_ach_109', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #109', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'citrine',  count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#f0e060' },
  { id: 'rpg_ach_110', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #110', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'iolite',   count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#7060c0' },
  { id: 'rpg_ach_111', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #111', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'amethyst', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c060c0' },
  { id: 'rpg_ach_112', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #112', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'diamond',  count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80d0ff' },
  { id: 'rpg_ach_113', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #113', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'nullstone', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#9060c0' },
  { id: 'rpg_ach_114', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #114', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'fracteryl', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff60c0' },
  { id: 'rpg_ach_115', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #115', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'eigenstein', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0e080' },
  // ── Kill all regular enemy types (116) ────────────────────────
  { id: 'rpg_ach_116', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #116', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'eigenstein', count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0e080' },
  // ── 1000 total regular kills (117) + 1000 late-tier kills (118) ──
  { id: 'rpg_ach_117', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #117', description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 2000  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d05040' },
  { id: 'rpg_ach_118', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #118', description: 'Hidden criteria.', condition: { kind: 'late_enemy_kills_total', count: 1000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b040a0' },
  // ── Elite enemy kills (119–128) ───────────────────────────────
  { id: 'rpg_ach_119', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #119', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 1   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe060' },
  { id: 'rpg_ach_120', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #120', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 10  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe060' },
  { id: 'rpg_ach_121', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #121', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffc040' },
  // ── Elite kills by tier (122–129) ─────────────────────────────
  { id: 'rpg_ach_122', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #122', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_quartz',   count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0d0ff' },
  { id: 'rpg_ach_123', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #123', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_ruby',     count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff4060' },
  { id: 'rpg_ach_124', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #124', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_sunstone', count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e0c040' },
  { id: 'rpg_ach_125', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #125', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_citrine',  count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#f0e060' },
  { id: 'rpg_ach_126', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #126', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_iolite',   count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#7060c0' },
  { id: 'rpg_ach_127', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #127', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_amethyst', count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c060c0' },
  { id: 'rpg_ach_128', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #128', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_diamond',  count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80d0ff' },
  { id: 'rpg_ach_129', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #129', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'elite_nullstone', count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#9060c0' },
  // ── Aliven group kills (130–140) ──────────────────────────────
  { id: 'rpg_ach_130', groupId: 'rpg', subcategoryId: 'rpg_aliven_enemies', displayName: 'RPG #130', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 1   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  { id: 'rpg_ach_131', groupId: 'rpg', subcategoryId: 'rpg_aliven_enemies', displayName: 'RPG #131', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 10  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  { id: 'rpg_ach_132', groupId: 'rpg', subcategoryId: 'rpg_aliven_enemies', displayName: 'RPG #132', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 100 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  // ── Lucky motes (141–148) ─────────────────────────────────────
  { id: 'rpg_ach_141', groupId: 'rpg', subcategoryId: 'rpg_lucky_motes', displayName: 'RPG #141', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 1    }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe080' },
  { id: 'rpg_ach_142', groupId: 'rpg', subcategoryId: 'rpg_lucky_motes', displayName: 'RPG #142', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 10   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe080' },
  { id: 'rpg_ach_143', groupId: 'rpg', subcategoryId: 'rpg_lucky_motes', displayName: 'RPG #143', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 100  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffd060' },
  { id: 'rpg_ach_144', groupId: 'rpg', subcategoryId: 'rpg_lucky_motes', displayName: 'RPG #144', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 1000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffc040' },
  // ── Survival time (149–152) ───────────────────────────────────
  { id: 'rpg_ach_149', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #149', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0a0' },
  { id: 'rpg_ach_150', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #150', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0a0' },
  { id: 'rpg_ach_151', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #151', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 10 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#40b090' },
  { id: 'rpg_ach_152', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #152', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 30 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#30a080' },
  // ── Wave streak (153–158) ─────────────────────────────────────
  { id: 'rpg_ach_153', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #153', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 5   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80e080' },
  { id: 'rpg_ach_154', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #154', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 10  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80e080' },
  { id: 'rpg_ach_155', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #155', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 25  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d060' },
  { id: 'rpg_ach_156', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #156', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60d060' },
  // ── Damage-free streak (159–164) ─────────────────────────────
  { id: 'rpg_ach_159', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #159', description: 'Hidden criteria.', condition: { kind: 'damage_free_streak', count: 1  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0e0ff' },
  { id: 'rpg_ach_160', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #160', description: 'Hidden criteria.', condition: { kind: 'damage_free_streak', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a0e0ff' },
  { id: 'rpg_ach_161', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #161', description: 'Hidden criteria.', condition: { kind: 'damage_free_streak', count: 10 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#80c0ff' },
  // ── Waves completed lifetime (165–172) ────────────────────────
  { id: 'rpg_ach_165', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #165', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 10   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_166', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #166', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 25   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e08060' },
  { id: 'rpg_ach_167', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #167', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 50   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_168', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #168', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 100  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d07050' },
  { id: 'rpg_ach_169', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #169', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 250  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  { id: 'rpg_ach_170', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #170', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 500  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#c06040' },
  { id: 'rpg_ach_171', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #171', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 1000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b05030' },
  { id: 'rpg_ach_172', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #172', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 2500 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b05030' },
  // ── XP allocated stats combos (173–174) ───────────────────────
  { id: 'rpg_ach_173', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #173', description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'atk',  amount: 5000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff9060' },
  { id: 'rpg_ach_174', groupId: 'rpg', subcategoryId: 'rpg_xp_stats', displayName: 'RPG #174', description: 'Hidden criteria.', condition: { kind: 'xp_to_stat', stat: 'def',  amount: 5000000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60c0ff' },
  // ── More total kills milestones (175–179) ─────────────────────
  { id: 'rpg_ach_175', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #175', description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 25  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e06050' },
  { id: 'rpg_ach_176', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #176', description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#e06050' },
  { id: 'rpg_ach_177', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #177', description: 'Hidden criteria.', condition: { kind: 'total_kills', count: 500 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d05040' },
  // ── More elite kills milestones (180–183) ─────────────────────
  { id: 'rpg_ach_180', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #180', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 5  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe060' },
  { id: 'rpg_ach_181', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #181', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 25 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffe060' },
  { id: 'rpg_ach_182', groupId: 'rpg', subcategoryId: 'rpg_elite_enemies', displayName: 'RPG #182', description: 'Hidden criteria.', condition: { kind: 'elite_kills_total', count: 50 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffc040' },
  // ── More aliven kills (184–187) ───────────────────────────────
  { id: 'rpg_ach_184', groupId: 'rpg', subcategoryId: 'rpg_aliven_enemies', displayName: 'RPG #184', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 25  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  { id: 'rpg_ach_185', groupId: 'rpg', subcategoryId: 'rpg_aliven_enemies', displayName: 'RPG #185', description: 'Hidden criteria.', condition: { kind: 'aliven_kills_total', count: 50  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#aaeeff' },
  // ── More lucky motes (188–191) ────────────────────────────────
  { id: 'rpg_ach_188', groupId: 'rpg', subcategoryId: 'rpg_lucky_motes', displayName: 'RPG #188', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 250  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffc040' },
  { id: 'rpg_ach_189', groupId: 'rpg', subcategoryId: 'rpg_lucky_motes', displayName: 'RPG #189', description: 'Hidden criteria.', condition: { kind: 'lucky_motes_total', count: 500  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ffa020' },
  // ── More survival milestones (190–200) ────────────────────────
  { id: 'rpg_ach_190', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #190', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 60  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#20a070' },
  { id: 'rpg_ach_191', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #191', description: 'Hidden criteria.', condition: { kind: 'survival_minutes', minutes: 120 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#20a070' },
  { id: 'rpg_ach_192', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #192', description: 'Hidden criteria.', condition: { kind: 'wave_streak', count: 100  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#40c040' },
  { id: 'rpg_ach_193', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #193', description: 'Hidden criteria.', condition: { kind: 'damage_free_streak', count: 25 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60a0ff' },
  { id: 'rpg_ach_194', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #194', description: 'Hidden criteria.', condition: { kind: 'late_enemy_kills_total', count: 100  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#b040a0' },
  { id: 'rpg_ach_195', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #195', description: 'Hidden criteria.', condition: { kind: 'late_enemy_kills_total', count: 250  }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a030a0' },
  { id: 'rpg_ach_196', groupId: 'rpg', subcategoryId: 'rpg_challenge', displayName: 'RPG #196', description: 'Hidden criteria.', condition: { kind: 'waves_completed', count: 5000 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#a04020' },
  { id: 'rpg_ach_197', groupId: 'rpg', subcategoryId: 'rpg_bosses', displayName: 'RPG #197', description: 'Hidden criteria.', condition: { kind: 'boss_defeated', count: 7   }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff6060' },
  { id: 'rpg_ach_198', groupId: 'rpg', subcategoryId: 'rpg_regular_enemies', displayName: 'RPG #198', description: 'Hidden criteria.', condition: { kind: 'kills_of_type', typeId: 'laser',   count: 1 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#ff8060' },
  { id: 'rpg_ach_199', groupId: 'rpg', subcategoryId: 'rpg_weapon_upgrades', displayName: 'RPG #199', description: 'Hidden criteria.', condition: { kind: 'weapons_at_max_tier', count: 2 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#d0a030' },
  { id: 'rpg_ach_200', groupId: 'rpg', subcategoryId: 'rpg_rpg_upgrades', displayName: 'RPG #200', description: 'Hidden criteria.', condition: { kind: 'rpg_upgrade_level', upgradeId: 'speed_upgrade', level: 3 }, bonusKind: 'base_atk', bonusMultiplier: 1, isHiddenCriteria: true, displayColor: '#60e0e0' },
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
