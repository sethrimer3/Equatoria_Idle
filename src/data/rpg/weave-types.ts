import type { TierId } from '../tiers';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';

export type WeaveRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

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

export interface CraftedWeaveData {
  id: string;
  name: string;
  ingredients: CraftedWeaponIngredient[];
  affixes: WeaveAffix[];
  totalWeightedMoteValue: number;
  forgeCraftLevel: number;
}
