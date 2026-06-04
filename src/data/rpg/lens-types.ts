import type { TierId } from '../tiers';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';

export type LensRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export type LensEffectStatKey =
  // Sand
  | 'attack_speed_bonus'
  | 'projectile_speed_bonus'
  | 'melee_swing_speed_bonus'
  // Quartz
  | 'accuracy_bonus'
  | 'crit_chance_bonus'
  | 'targeting_precision_bonus'
  | 'range_bonus'
  // Ruby
  | 'burn_on_hit_chance'
  | 'bonus_damage_to_burning'
  | 'impact_burst_damage'
  // Citrine
  | 'aoe_radius_bonus'
  | 'beam_width_bonus'
  | 'bonus_damage_to_grouped'
  | 'radiant_splash_damage'
  // Emerald
  | 'poison_on_hit_chance'
  | 'chain_hit_chance'
  | 'homing_strength_bonus'
  | 'life_drain_on_hit'
  // Sapphire
  | 'freeze_on_hit_chance'
  | 'slow_on_hit_chance'
  | 'crit_damage_bonus'
  | 'precision_burst_damage'
  // Iolite
  | 'time_slow_aura'
  | 'poison_duration_bonus'
  | 'status_duration_bonus'
  | 'cooldown_reduction_bonus'
  // Amethyst
  | 'extra_projectile_chance'
  | 'echo_hit_chance'
  | 'phantom_strike_chance'
  // Diamond
  | 'armor_pierce_bonus'
  | 'defense_shred_bonus'
  | 'bonus_damage_to_armored'
  // Nullstone
  | 'gravity_pull_strength'
  | 'enemy_slow_aura'
  | 'void_damage_bonus'
  | 'knockback_reduction'
  // Fracteryl
  | 'repeat_hit_chance'
  | 'fractal_split_chance'
  | 'recursive_damage_tick'
  // Eigenstein
  | 'rift_damage_bonus'
  | 'dimensional_slash_chance'
  | 'compounding_damage_per_enemy'
  | 'reality_tear_proc_chance';

export interface LensEffect {
  tierId: TierId;
  /** Display name of the effect family (e.g., "Sand Lens", "Ruby Lens"). */
  family: string;
  statKey: LensEffectStatKey;
  label: string;
  value: number;
  unit: string;
  rarity: LensRarity;
  quality: number;
  /** Whether this effect is currently applied in combat calculations. */
  isApplied: boolean;
}

export interface CraftedLensData {
  id: string;
  type: 'lens';
  name: string;
  ingredients: CraftedWeaponIngredient[];
  totalWeightedMoteValue: number;
  forgeCraftLevel: number;
  effects: LensEffect[];
}
