/**
 * lens-definitions.ts — Per-tier effect families for the Lens crafting system.
 *
 * Each tier maps to one effect family. During rolling, one spec is randomly
 * chosen from the family, then quality is determined by triangular roll.
 *
 * isApplied marks whether a stat is currently wired into combat calculations.
 * Effects that are stored but not yet applied show a "(stored, not yet applied)"
 * note in the UI.
 */

import type { TierId } from '../tiers';
import type { LensEffectStatKey } from './lens-types';

export interface LensEffectSpec {
  statKey: LensEffectStatKey;
  label: string;
  unit: string;
  baseMaxValue: number;
  /** Whether this effect is currently applied in combat. */
  isApplied: boolean;
}

export type LensEffectFamily = readonly LensEffectSpec[];

const SAND_LENS: LensEffectFamily = [
  { statKey: 'attack_speed_bonus',     label: 'Attack Speed',        unit: '%', baseMaxValue: 25, isApplied: false },
  { statKey: 'projectile_speed_bonus', label: 'Projectile Speed',    unit: '%', baseMaxValue: 30, isApplied: false },
  { statKey: 'melee_swing_speed_bonus',label: 'Melee Swing Speed',   unit: '%', baseMaxValue: 25, isApplied: false },
];

const QUARTZ_LENS: LensEffectFamily = [
  { statKey: 'accuracy_bonus',            label: 'Accuracy',              unit: '%', baseMaxValue: 20, isApplied: false },
  { statKey: 'crit_chance_bonus',         label: 'Crit Chance',           unit: '%', baseMaxValue: 15, isApplied: false },
  { statKey: 'targeting_precision_bonus', label: 'Targeting Precision',   unit: '%', baseMaxValue: 18, isApplied: false },
  { statKey: 'range_bonus',               label: 'Range',                 unit: '%', baseMaxValue: 20, isApplied: false },
];

const RUBY_LENS: LensEffectFamily = [
  { statKey: 'burn_on_hit_chance',      label: 'Burn on Hit',              unit: '%', baseMaxValue: 20, isApplied: false },
  { statKey: 'bonus_damage_to_burning', label: 'Bonus Damage to Burning',  unit: '%', baseMaxValue: 30, isApplied: false },
  { statKey: 'impact_burst_damage',     label: 'Impact Burst',             unit: '%', baseMaxValue: 25, isApplied: false },
];

const CITRINE_LENS: LensEffectFamily = [
  { statKey: 'aoe_radius_bonus',        label: 'AoE Radius',                   unit: '%', baseMaxValue: 25, isApplied: false },
  { statKey: 'beam_width_bonus',        label: 'Beam Width',                   unit: '%', baseMaxValue: 20, isApplied: false },
  { statKey: 'bonus_damage_to_grouped', label: 'Bonus Damage to Grouped',      unit: '%', baseMaxValue: 30, isApplied: false },
  { statKey: 'radiant_splash_damage',   label: 'Radiant Splash',               unit: '%', baseMaxValue: 20, isApplied: false },
];

const EMERALD_LENS: LensEffectFamily = [
  { statKey: 'poison_on_hit_chance', label: 'Poison on Hit',  unit: '%', baseMaxValue: 18, isApplied: false },
  { statKey: 'chain_hit_chance',     label: 'Chain Hit',      unit: '%', baseMaxValue: 15, isApplied: false },
  { statKey: 'homing_strength_bonus',label: 'Homing Strength',unit: '%', baseMaxValue: 22, isApplied: false },
  { statKey: 'life_drain_on_hit',    label: 'Life Drain',     unit: '%', baseMaxValue: 10, isApplied: false },
];

const SAPPHIRE_LENS: LensEffectFamily = [
  { statKey: 'freeze_on_hit_chance',   label: 'Freeze on Hit',     unit: '%', baseMaxValue: 15, isApplied: false },
  { statKey: 'slow_on_hit_chance',     label: 'Slow on Hit',       unit: '%', baseMaxValue: 20, isApplied: false },
  { statKey: 'crit_damage_bonus',      label: 'Crit Damage',       unit: '%', baseMaxValue: 35, isApplied: false },
  { statKey: 'precision_burst_damage', label: 'Precision Burst',   unit: '%', baseMaxValue: 25, isApplied: false },
];

const IOLITE_LENS: LensEffectFamily = [
  { statKey: 'time_slow_aura',         label: 'Time Slow Aura',      unit: '%', baseMaxValue: 15, isApplied: false },
  { statKey: 'poison_duration_bonus',  label: 'Poison Duration',     unit: '%', baseMaxValue: 30, isApplied: false },
  { statKey: 'status_duration_bonus',  label: 'Status Duration',     unit: '%', baseMaxValue: 25, isApplied: false },
  { statKey: 'cooldown_reduction_bonus',label: 'Cooldown Reduction', unit: '%', baseMaxValue: 20, isApplied: false },
];

const AMETHYST_LENS: LensEffectFamily = [
  { statKey: 'extra_projectile_chance', label: 'Extra Projectile', unit: '%', baseMaxValue: 12, isApplied: false },
  { statKey: 'echo_hit_chance',         label: 'Echo Hit',         unit: '%', baseMaxValue: 15, isApplied: false },
  { statKey: 'phantom_strike_chance',   label: 'Phantom Strike',   unit: '%', baseMaxValue: 10, isApplied: false },
];

const DIAMOND_LENS: LensEffectFamily = [
  { statKey: 'armor_pierce_bonus',       label: 'Armor Pierce',              unit: '%', baseMaxValue: 25, isApplied: false },
  { statKey: 'defense_shred_bonus',      label: 'Defense Shred',             unit: '%', baseMaxValue: 20, isApplied: false },
  { statKey: 'bonus_damage_to_armored',  label: 'Bonus vs Armored',          unit: '%', baseMaxValue: 30, isApplied: false },
];

const NULLSTONE_LENS: LensEffectFamily = [
  { statKey: 'gravity_pull_strength', label: 'Gravity Pull',    unit: '%', baseMaxValue: 20, isApplied: false },
  { statKey: 'enemy_slow_aura',       label: 'Enemy Slow Aura', unit: '%', baseMaxValue: 18, isApplied: false },
  { statKey: 'void_damage_bonus',     label: 'Void Damage',     unit: '%', baseMaxValue: 28, isApplied: false },
  { statKey: 'knockback_reduction',   label: 'Knockback Resist',unit: '%', baseMaxValue: 25, isApplied: false },
];

const FRACTERYL_LENS: LensEffectFamily = [
  { statKey: 'repeat_hit_chance',     label: 'Repeat Hit',         unit: '%', baseMaxValue: 12, isApplied: false },
  { statKey: 'fractal_split_chance',  label: 'Fractal Split',      unit: '%', baseMaxValue: 10, isApplied: false },
  { statKey: 'recursive_damage_tick', label: 'Recursive Damage',   unit: '%', baseMaxValue: 15, isApplied: false },
];

const EIGENSTEIN_LENS: LensEffectFamily = [
  { statKey: 'rift_damage_bonus',            label: 'Rift Damage',           unit: '%', baseMaxValue: 30, isApplied: false },
  { statKey: 'dimensional_slash_chance',     label: 'Dimensional Slash',     unit: '%', baseMaxValue: 12, isApplied: false },
  { statKey: 'compounding_damage_per_enemy', label: 'Compounding Damage',    unit: '%', baseMaxValue: 8,  isApplied: false },
  { statKey: 'reality_tear_proc_chance',     label: 'Reality Tear',          unit: '%', baseMaxValue: 6,  isApplied: false },
];

export const LENS_EFFECT_FAMILIES: Partial<Record<TierId, { familyName: string; specs: LensEffectFamily }>> = {
  sand:       { familyName: 'Sand Lens',       specs: SAND_LENS },
  quartz:     { familyName: 'Quartz Lens',     specs: QUARTZ_LENS },
  ruby:       { familyName: 'Ruby Lens',       specs: RUBY_LENS },
  citrine:    { familyName: 'Citrine Lens',    specs: CITRINE_LENS },
  emerald:    { familyName: 'Emerald Lens',    specs: EMERALD_LENS },
  sapphire:   { familyName: 'Sapphire Lens',   specs: SAPPHIRE_LENS },
  iolite:     { familyName: 'Iolite Lens',     specs: IOLITE_LENS },
  amethyst:   { familyName: 'Amethyst Lens',   specs: AMETHYST_LENS },
  diamond:    { familyName: 'Diamond Lens',    specs: DIAMOND_LENS },
  nullstone:  { familyName: 'Nullstone Lens',  specs: NULLSTONE_LENS },
  fracteryl:  { familyName: 'Fracteryl Lens',  specs: FRACTERYL_LENS },
  eigenstein: { familyName: 'Eigenstein Lens', specs: EIGENSTEIN_LENS },
  // sunstone intentionally omitted — power scaling only
};

/** Max mote types allowed for lens crafting per forge level (1–5). */
export const LENS_MAX_MOTE_TYPES_BY_FORGE_LEVEL: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
};

export function getLensMaxMoteTypes(forgeCraftLevel: number): number {
  return LENS_MAX_MOTE_TYPES_BY_FORGE_LEVEL[forgeCraftLevel] ?? 3;
}
