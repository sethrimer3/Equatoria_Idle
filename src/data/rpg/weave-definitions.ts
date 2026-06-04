/**
 * weave-definitions.ts — Per-tier affix families for the Weave crafting system.
 *
 * Each tier maps to a list of possible affix specs. During rolling, one spec
 * is randomly chosen from the tier's family, then quality is determined by
 * triangular roll. The baseMaxValue is the maximum possible value at quality=1
 * and powerScale=1; actual value scales with mote investment.
 *
 * Sunstone is intentionally omitted — it contributes to power scaling only.
 */

import type { TierId } from '../tiers';
import type { WeaveAffixId } from './weave-types';

export interface WeaveAffixSpec {
  affixId: WeaveAffixId;
  label: string;
  unit: string;
  baseMaxValue: number;
  /** Whether this affix is currently integrated into gameplay calculations. */
  applied: boolean;
}

export type WeaveAffixFamily = readonly WeaveAffixSpec[];

const SAND_HASTE: WeaveAffixFamily = [
  { affixId: 'sand_loom_speed',   label: 'Loom Haste',            unit: '%', baseMaxValue: 20, applied: false },
  { affixId: 'sand_forge_speed',  label: 'Forge Crunch Haste',    unit: '%', baseMaxValue: 18, applied: false },
  { affixId: 'sand_mote_output',  label: 'Mote Output',           unit: '%', baseMaxValue: 14, applied: false },
  { affixId: 'sand_loom_attract', label: 'Loom Attraction',       unit: '%', baseMaxValue: 16, applied: false },
];

const QUARTZ_CLARITY: WeaveAffixFamily = [
  { affixId: 'quartz_crystal_yield',       label: 'Crystal Yield',          unit: '%', baseMaxValue: 15, applied: false },
  { affixId: 'quartz_waste_reduction',     label: 'Ingredient Efficiency',  unit: '%', baseMaxValue: 12, applied: false },
  { affixId: 'quartz_rounding_reduction',  label: 'Forge Rounding Salvage', unit: '%', baseMaxValue: 14, applied: false },
  { affixId: 'quartz_exact_efficiency',    label: 'Exact-Count Bonus',      unit: '%', baseMaxValue: 10, applied: false },
];

const RUBY_IGNITION: WeaveAffixFamily = [
  { affixId: 'ruby_loom_crit_chance',     label: 'Loom Crit Chance',    unit: '%',       baseMaxValue: 10, applied: false },
  { affixId: 'ruby_loom_crit_output',     label: 'Loom Crit Output',    unit: '%',       baseMaxValue: 50, applied: false },
  { affixId: 'ruby_forge_bonus_crystal',  label: 'Bonus Crystal Chance',unit: '%',       baseMaxValue: 8,  applied: false },
  { affixId: 'ruby_heat_surge',           label: 'Heat Surge Interval', unit: ' crunches', baseMaxValue: 12, applied: false },
];

const CITRINE_RADIANCE: WeaveAffixFamily = [
  { affixId: 'citrine_all_loom',             label: 'All Loom Output',           unit: '%', baseMaxValue: 20, applied: true  },
  { affixId: 'citrine_all_forge',            label: 'All Forge Output',          unit: '%', baseMaxValue: 18, applied: false },
  { affixId: 'citrine_achievement_reduce',   label: 'Achievement Req. Reduction',unit: '%', baseMaxValue: 8,  applied: false },
  { affixId: 'citrine_milestone_progress',   label: 'Milestone Progress',        unit: '%', baseMaxValue: 10, applied: false },
];

const EMERALD_PROPAGATION: WeaveAffixFamily = [
  { affixId: 'emerald_chain_chance',    label: 'Chain Production Chance',  unit: '%', baseMaxValue: 8,  applied: false },
  { affixId: 'emerald_adjacent_loom',   label: 'Adjacent Loom Bonus',      unit: '%', baseMaxValue: 12, applied: false },
  { affixId: 'emerald_feed_efficiency', label: 'Feed Tier Efficiency',      unit: '%', baseMaxValue: 14, applied: false },
  { affixId: 'emerald_loom_pulse',      label: 'Loom Pulse Chance',         unit: '%', baseMaxValue: 6,  applied: false },
];

const SAPPHIRE_PRECISION: WeaveAffixFamily = [
  { affixId: 'sapphire_weave_floor',       label: 'Weave Roll Floor',       unit: '%', baseMaxValue: 10, applied: false },
  { affixId: 'sapphire_weapon_floor',      label: 'Weapon Roll Floor',      unit: '%', baseMaxValue: 10, applied: false },
  { affixId: 'sapphire_rare_affix_chance', label: 'Rare Affix Chance',      unit: '%', baseMaxValue: 8,  applied: false },
  { affixId: 'sapphire_base_mult',         label: 'Crafted Item Base Mult', unit: '%', baseMaxValue: 12, applied: false },
];

const IOLITE_PERSISTENCE: WeaveAffixFamily = [
  { affixId: 'iolite_offline_progress', label: 'Offline Progress',     unit: '%', baseMaxValue: 20, applied: false },
  { affixId: 'iolite_auto_forge_speed', label: 'Auto-Forge Speed',     unit: '%', baseMaxValue: 16, applied: false },
  { affixId: 'iolite_stored_cap',       label: 'Production Storage',   unit: '%', baseMaxValue: 14, applied: false },
  { affixId: 'iolite_idle_decay',       label: 'Idle Decay Reduction', unit: '%', baseMaxValue: 12, applied: false },
];

const AMETHYST_ECHO: WeaveAffixFamily = [
  { affixId: 'amethyst_loom_dupe_chance',  label: 'Loom Dupe Chance',   unit: '%', baseMaxValue: 8,  applied: false },
  { affixId: 'amethyst_forge_dupe_chance', label: 'Forge Dupe Chance',  unit: '%', baseMaxValue: 7,  applied: false },
  { affixId: 'amethyst_phantom_pulse',     label: 'Phantom Loom Pulse', unit: '%', baseMaxValue: 6,  applied: false },
  { affixId: 'amethyst_echo_strength',     label: 'Echo Strength',      unit: '%', baseMaxValue: 40, applied: false },
];

const DIAMOND_COMPRESSION: WeaveAffixFamily = [
  { affixId: 'diamond_upgrade_cost',    label: 'Upgrade Cost Reduction',  unit: '%', baseMaxValue: 10, applied: false },
  { affixId: 'diamond_crystal_storage', label: 'Crystal Storage',         unit: '%', baseMaxValue: 20, applied: false },
  { affixId: 'diamond_forge_efficiency',label: 'Forge Cap Efficiency',    unit: '%', baseMaxValue: 12, applied: false },
  { affixId: 'diamond_armor',           label: 'RPG Armor',               unit: ' pts', baseMaxValue: 30, applied: false },
  { affixId: 'diamond_armor_ignore',    label: 'Armor Ignore',            unit: '%', baseMaxValue: 8,  applied: false },
];

const NULLSTONE_GRAVITY: WeaveAffixFamily = [
  { affixId: 'nullstone_achievement_reduce', label: 'Achievement Req. Reduction', unit: '%', baseMaxValue: 7,  applied: false },
  { affixId: 'nullstone_upgrade_cost',       label: 'Upgrade Cost Reduction',     unit: '%', baseMaxValue: 8,  applied: false },
  { affixId: 'nullstone_attract_radius',     label: 'Mote Attraction Radius',     unit: '%', baseMaxValue: 20, applied: false },
  { affixId: 'nullstone_forge_pull',         label: 'Forge Pull Strength',        unit: '%', baseMaxValue: 18, applied: false },
  { affixId: 'nullstone_enemy_slow',         label: 'Enemy Slow Aura',            unit: '%', baseMaxValue: 10, applied: false },
];

const FRACTERYL_RECURSION: WeaveAffixFamily = [
  { affixId: 'fracteryl_repeat_strongest', label: 'Echo Strongest Thread', unit: '%', baseMaxValue: 30, applied: false },
  { affixId: 'fracteryl_repeat_weakest',   label: 'Echo Weakest Thread',   unit: '%', baseMaxValue: 15, applied: false },
  { affixId: 'fracteryl_loom_repeat',      label: 'Loom Echo Interval',    unit: ' ticks', baseMaxValue: 20, applied: false },
  { affixId: 'fracteryl_forge_pulse',      label: 'Recursive Forge Pulse', unit: '%', baseMaxValue: 12, applied: false },
];

const EIGENSTEIN_RIFT: WeaveAffixFamily = [
  { affixId: 'eigenstein_forge_output',       label: 'Dimensional Forge Output', unit: '%', baseMaxValue: 20, applied: false },
  { affixId: 'eigenstein_fragment_chance',    label: 'Fragment Chance',          unit: '%', baseMaxValue: 8,  applied: false },
  { affixId: 'eigenstein_rift_damage',        label: 'RPG Rift Damage',          unit: '%', baseMaxValue: 15, applied: false },
  { affixId: 'eigenstein_slot_efficiency',    label: 'Weave Slot Efficiency',    unit: '%', baseMaxValue: 10, applied: false },
  { affixId: 'eigenstein_strongest_bonus',    label: 'Strongest Affix Scaling',  unit: '%', baseMaxValue: 8,  applied: false },
];

export const WEAVE_AFFIX_FAMILIES: Partial<Record<TierId, WeaveAffixFamily>> = {
  sand:       SAND_HASTE,
  quartz:     QUARTZ_CLARITY,
  ruby:       RUBY_IGNITION,
  citrine:    CITRINE_RADIANCE,
  emerald:    EMERALD_PROPAGATION,
  sapphire:   SAPPHIRE_PRECISION,
  iolite:     IOLITE_PERSISTENCE,
  amethyst:   AMETHYST_ECHO,
  diamond:    DIAMOND_COMPRESSION,
  nullstone:  NULLSTONE_GRAVITY,
  fracteryl:  FRACTERYL_RECURSION,
  eigenstein: EIGENSTEIN_RIFT,
  // sunstone intentionally omitted — contributes to power scaling only
};
