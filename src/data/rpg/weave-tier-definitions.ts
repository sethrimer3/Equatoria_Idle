/**
 * weave-tier-definitions.ts — Tier 1/2/3 effect names and descriptions for the Weave system.
 *
 * Each effect contributes stat modifiers defined in weave-tier-effect-modifiers.ts.
 * Sunstone is intentionally omitted — it contributes to power scaling only.
 */

import type { TierId } from '../tiers';
import type { WeaveTierEffectTier } from './weave-types';

/** Display names per (tierId, effectTier). */
export const WEAVE_TIER_EFFECT_NAMES: Partial<Record<TierId, Record<WeaveTierEffectTier, string>>> = {
  sand: {
    1: 'Haste Thread',
    2: 'Dust Veil',
    3: 'Sandstorm Shroud',
  },
  quartz: {
    1: 'Quartz Focus',
    2: 'Prismatic Guard',
    3: 'Resonant Lattice',
  },
  ruby: {
    1: 'Ember Edge',
    2: 'Ignition Shell',
    3: 'Molten Core',
  },
  citrine: {
    1: 'Radiant Aura',
    2: 'Solar Aegis',
    3: 'Gilded Bastion',
  },
  emerald: {
    1: 'Verdure Knot',
    2: 'Thorn Weave',
    3: 'Verdant Cascade',
  },
  sapphire: {
    1: 'Tempered Guard',
    2: 'Ice Ward',
    3: 'Glacial Bulwark',
  },
  iolite: {
    1: 'Stored Momentum',
    2: 'Temporal Buffer',
    3: 'Stasis Weave',
  },
  amethyst: {
    1: 'Phantom Thread',
    2: 'Echo Barrier',
    3: 'Mirror Shroud',
  },
  diamond: {
    1: 'Diamond Thread',
    2: 'Faceted Guard',
    3: 'Diamond Bastion',
  },
  nullstone: {
    1: 'Null Barrier',
    2: 'Gravity Shroud',
    3: 'Event Dampener',
  },
  fracteryl: {
    1: 'Fractal Loop',
    2: 'Recursive Shield',
    3: 'Infinite Weave',
  },
  eigenstein: {
    1: 'Rift Ward',
    2: 'Dimensional Veil',
    3: 'Reality Anchor',
  },
};

/** Descriptions for Tier 1 weave tier effects. */
export const WEAVE_T1_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:       'Passive cooldown reduction from sand tempo.',
  quartz:     'Passive projectile speed boost from quartz precision.',
  ruby:       'Passive crit edge — increases critical hit chance.',
  citrine:    'Passive radiant aura — increases weapon damage output.',
  emerald:    'Passive status edge — increases status effect chance.',
  sapphire:   'Passive chill guard — increases defense rating.',
  iolite:     'Passive momentum — reduces attack cooldown.',
  amethyst:   'Passive echo strength — increases critical damage.',
  diamond:    'Passive armor weave — increases defense rating.',
  nullstone:  'Passive null ward — increases status effect chance.',
  fracteryl:  'Passive fractal loop — increases critical damage.',
  eigenstein: 'Passive rift scaling — increases weapon damage output.',
};

/** Descriptions for Tier 2 weave tier effects. */
export const WEAVE_T2_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:       'Stronger attack tempo — deeper cooldown reduction.',
  quartz:     'Enhanced projectile velocity and aim correction.',
  ruby:       'Broader crit boost — crit chance and crit damage.',
  citrine:    'Amplified weapon damage for sustained combat.',
  emerald:    'Stronger status application pressure.',
  sapphire:   'Reinforced defense against sustained pressure.',
  iolite:     'Deeper cooldown reduction for prolonged engagements.',
  amethyst:   'Amplified critical damage on echo hits.',
  diamond:    'Significant defense rating increase.',
  nullstone:  'Stronger status disruption from gravity distortion.',
  fracteryl:  'Amplified critical damage via recursive fractal.',
  eigenstein: 'Enhanced rift damage scaling across all hits.',
};

/** Descriptions for Tier 3 weave tier effects. */
export const WEAVE_T3_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:       'Maximum tempo aura — strongest attack cooldown reduction.',
  quartz:     'Maximum projectile speed and precision from resonant lattice.',
  ruby:       'Maximum crit power — highest crit chance and crit damage.',
  citrine:    'Maximum weapon damage aura from gilded bastion.',
  emerald:    'Maximum status disruption force from verdant cascade.',
  sapphire:   'Maximum defense reinforcement from glacial bulwark.',
  iolite:     'Maximum cooldown reduction from stasis weave.',
  amethyst:   'Maximum critical damage from mirrored echo resonance.',
  diamond:    'Maximum defense from compressed diamond bastion.',
  nullstone:  'Maximum status disruption from nullspace collapse.',
  fracteryl:  'Maximum critical damage through controlled recursion.',
  eigenstein: 'Maximum rift-amplified weapon damage output.',
};
