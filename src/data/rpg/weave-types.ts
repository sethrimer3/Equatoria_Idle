import type { TierId } from '../tiers';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';
import type { ItemSourceType } from './lens-types';
export type { ItemSourceType };

export type WeaveRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export type WeaveTierEffectTier = 1 | 2 | 3;

export interface WeaveTierEffect {
  tierId: TierId;
  effectTier: WeaveTierEffectTier;
  /** Stable identifier e.g. "sand_wt1", "ruby_wt3". */
  key: string;
  /** Display name e.g. "Haste Thread", "Molten Core". */
  name: string;
  /** Human-readable description of the applied stat contribution. */
  description: string;
  /** Numeric magnitude derived from mote investment via sqrt-log scaling. */
  magnitude: number;
  /** Quality roll [0,1] used for rarity classification only. */
  quality: number;
  rarity: WeaveRarity;
  /** True when the effect is wired into combat via weave-tier-effect-modifiers. */
  isApplied: boolean;
}

export type WeaveAffixId =
  | 'sand_loom_speed'
  | 'sand_forge_speed'
  | 'sand_mote_output'
  | 'sand_loom_attract'
  | 'quartz_crystal_yield'
  | 'quartz_waste_reduction'
  | 'quartz_rounding_reduction'
  | 'quartz_exact_efficiency'
  | 'ruby_loom_crit_chance'
  | 'ruby_loom_crit_output'
  | 'ruby_forge_bonus_crystal'
  | 'ruby_heat_surge'
  | 'citrine_all_loom'
  | 'citrine_all_forge'
  | 'citrine_achievement_reduce'
  | 'citrine_milestone_progress'
  | 'emerald_chain_chance'
  | 'emerald_adjacent_loom'
  | 'emerald_feed_efficiency'
  | 'emerald_loom_pulse'
  | 'sapphire_weave_floor'
  | 'sapphire_weapon_floor'
  | 'sapphire_rare_affix_chance'
  | 'sapphire_base_mult'
  | 'iolite_offline_progress'
  | 'iolite_auto_forge_speed'
  | 'iolite_stored_cap'
  | 'iolite_idle_decay'
  | 'amethyst_loom_dupe_chance'
  | 'amethyst_forge_dupe_chance'
  | 'amethyst_phantom_pulse'
  | 'amethyst_echo_strength'
  | 'diamond_upgrade_cost'
  | 'diamond_crystal_storage'
  | 'diamond_forge_efficiency'
  | 'diamond_armor'
  | 'diamond_armor_ignore'
  | 'nullstone_achievement_reduce'
  | 'nullstone_upgrade_cost'
  | 'nullstone_attract_radius'
  | 'nullstone_forge_pull'
  | 'nullstone_enemy_slow'
  | 'fracteryl_repeat_strongest'
  | 'fracteryl_repeat_weakest'
  | 'fracteryl_loom_repeat'
  | 'fracteryl_forge_pulse'
  | 'eigenstein_forge_output'
  | 'eigenstein_fragment_chance'
  | 'eigenstein_rift_damage'
  | 'eigenstein_slot_efficiency'
  | 'eigenstein_strongest_bonus';

export interface WeaveAffix {
  affixId: WeaveAffixId;
  tierId: TierId;
  label: string;
  quality: number;    // [0, 1] triangular roll result
  rarity: WeaveRarity;
  value: number;      // numeric magnitude (e.g., 12.4 for +12.4%)
  unit: string;       // '%', 'x', 'px', etc.
  applied: boolean;   // whether this bonus currently affects gameplay
}

/**
 * A single passive effect rolled onto a weave at craft time.
 * Serialized and stored with the weave item. Old weave items without this
 * field default to no effects (safe backward compat).
 */
export interface WeaveEffectRoll {
  /** Stable effect id from WeavePassiveEffectId. Unknown ids are ignored at runtime. */
  id: string;
  /** Rolled numeric magnitude, e.g. 3.2 for +3.2%. */
  value: number;
}

/** The 5 named weave effect archetypes, each supporting T1/T2/T3 tiers. */
export type WeaveNamedEffectId = 'focus' | 'quickness' | 'guard' | 'ward' | 'echo';

/**
 * One tier of a named weave effect rolled at craft time.
 * A weave has at most one effectId, with 1–3 tiers (T1 always, T2/T3 probabilistic).
 */
export interface WeaveNamedEffectTier {
  /** Tier number: 1 (base), 2 (enhanced), or 3 (apex). */
  tier: 1 | 2 | 3;
  /** Which named effect archetype this tier belongs to. */
  effectId: WeaveNamedEffectId;
  /**
   * Primary numeric magnitude for this tier.
   * Interpretation depends on effectId and tier:
   *   focus  T1 = weapon damage %       (linear with effectMultiplier)
   *   focus  T2 = crit damage %         (linear with effectMultiplier)
   *   focus  T3 = crit chance %         (linear, can exceed 75 — overflow semantics)
   *   quickness T1 = cooldown %         (linear)
   *   quickness T2 = extra attack chance% (cappedChance)
   *   quickness T3 = stack chance %     (cappedChance)
   *   guard  T1 = DEF %                 (linear)
   *   guard  T2 = reflection %          (linear)
   *   guard  T3 = block chance %        (cappedChance, never 100)
   *   ward   T1 = shield proc chance %  (cappedChance)
   *   ward   T2 = shield multiplier     (e.g. 2.0 = 2× the absorbed amount)
   *   ward   T3 = replenishment %       (cappedChance)
   *   echo   T1 = echo damage %         (linear; proc chance derived from effectMultiplier)
   *   echo   T2 = echo damage multiplier (additive above 1.0)
   *   echo   T3 = chain chance %        (cappedChance)
   */
  magnitude: number;
  /** True when wired into combat. isApplied=false = stored but not active. */
  isApplied: boolean;
}

export interface CraftedWeaveData {
  id: string;
  name: string;
  ingredients: CraftedWeaponIngredient[];
  affixes: WeaveAffix[];
  totalWeightedMoteValue: number;
  forgeCraftLevel: number;
  /** Tier 1–3 passive stat effects rolled at craft time. Applied via weave-tier-effect-modifiers. */
  tierEffects: WeaveTierEffect[];
  /** Refinement level 0–3. 0 = unrefined (default, identical to pre-refinement behavior). Absent in old items = 0. */
  refinementLevel?: number;
  /** Legacy passive effects rolled at craft time. Absent in old items = [] (no effects, backward-safe). */
  effects?: WeaveEffectRoll[];
  /**
   * Named effect tiers (T1/T2/T3) rolled via the tiered system at craft time.
   * New weaves populate this instead of effects[]. Old saves have this absent (= []).
   * All entries share the same effectId; a weave has one named effect archetype with 1–3 tiers.
   */
  namedEffectTiers?: WeaveNamedEffectTier[];
  /**
   * Ratio of total mote investment to BASELINE_CRAFT_COST (= 100).
   * Used to compute magnitudes for named effect tiers.
   * Absent on old weaves without named effect tiers.
   */
  effectMultiplier?: number;
  /** Source zone where this item dropped. Absent on pre-metadata items — treat as unknown. */
  sourceZone?: string;
  /** Wave number at drop time. Absent on pre-metadata items — treat as 0. */
  sourceWave?: number;
  /** How this item was obtained. Absent on pre-metadata items — treat as 'normal'. */
  sourceType?: ItemSourceType;
}
