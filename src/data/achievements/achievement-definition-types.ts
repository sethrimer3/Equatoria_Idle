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
 * secret_flag                    — a persistent gameplay flag `flagId` has been set in rpg.secretAchievementFlags
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
  | { readonly kind: 'boss_defeated_any_speed_1weapon' }
  | { readonly kind: 'secret_flag'; readonly flagId: string };

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
