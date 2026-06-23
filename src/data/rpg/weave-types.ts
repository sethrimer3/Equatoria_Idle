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
  /** Passive effects rolled at craft time. Absent in old items = [] (no effects, backward-safe). */
  effects?: WeaveEffectRoll[];
}
