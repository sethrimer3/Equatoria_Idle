/**
 * lens-definitions.ts — Naming map and forge-level unlock chances for the Lens system.
 *
 * Tier 1 effects are active combat statuses.
 * Tier 2 effects for sand/quartz/ruby/citrine/emerald/sapphire/iolite are implemented.
 * Tier 2 effects for amethyst and above, and all Tier 3 effects, remain STUB.
 */

import type { TierId } from '../tiers';
import type { LensEffectTier } from './lens-types';

// ─── Implemented Tier 2 tier IDs ──────────────────────────────────

/** Tier IDs whose Tier 2 effects are fully implemented. */
export const LENS_T2_IMPLEMENTED_TIER_IDS = new Set<TierId>([
  'sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire', 'iolite',
]);

// ─── Effect naming map ────────────────────────────────────────────

/** Display names per (tier, effectTier). Implemented effects have clean names; unimplemented include "STUB". */
export const LENS_EFFECT_NAMES: Partial<Record<TierId, Record<LensEffectTier, string>>> = {
  sand: {
    1: 'Abraded',
    2: 'Sand Spray',
    3: 'Sandstorm Cascade STUB',
  },
  quartz: {
    1: 'Refracted',
    2: 'Prism Split',
    3: 'Perfect Refraction STUB',
  },
  ruby: {
    1: 'Burning',
    2: 'Ruby Beam Splinters',
    3: 'Meltdown Core STUB',
  },
  citrine: {
    1: 'Radiant',
    2: 'Solar Flare Burst',
    3: 'Radiant Detonation STUB',
  },
  emerald: {
    1: 'Poisoned',
    2: 'Venom Spores',
    3: 'Viridian Bloom STUB',
  },
  sapphire: {
    1: 'Chilled',
    2: 'Ice Shards',
    3: 'Absolute Zero STUB',
  },
  iolite: {
    1: 'Time-Warped',
    2: 'Delayed Echo Strike',
    3: 'Time Fracture STUB',
  },
  amethyst: {
    1: 'Echo-Marked',
    2: 'Phantom Repeat STUB',
    3: 'Mirror Volley STUB',
  },
  diamond: {
    1: 'Cracked',
    2: 'Diamond Shrapnel STUB',
    3: 'Faultline Break STUB',
  },
  nullstone: {
    1: 'Gravitized',
    2: 'Gravity Pulse STUB',
    3: 'Event Horizon STUB',
  },
  fracteryl: {
    1: 'Fractal Wound',
    2: 'Recursive Splinter STUB',
    3: 'Infinite Descent STUB',
  },
  eigenstein: {
    1: 'Rift-Scarred',
    2: 'Rift Slash STUB',
    3: 'Reality Cascade STUB',
  },
  // sunstone intentionally omitted — power scaling only, no effects
};

// ─── Tier 2 effect descriptions (implemented tiers only) ─────────

/** Human-readable description for implemented Tier 2 effects. */
export const LENS_T2_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:     'On hit (proc): emit sand fragments from the target — deals physical damage and applies Abraded to nearby enemies.',
  quartz:   'On hit (proc): split crystal beams toward nearby enemies — deals precision damage and applies Refracted.',
  ruby:     'On hit (proc): fire red beamlets in a cone — deals fire damage and applies Burning to hit enemies.',
  citrine:  'On hit (proc): create a solar flare burst — deals radiant damage and applies Radiant to nearby enemies.',
  emerald:  'On hit (proc): release venom spores — deals poison damage and applies Poisoned to nearby enemies.',
  sapphire: 'On hit (proc): burst icy shards outward — deals damage and applies Chilled to nearby enemies.',
  iolite:   'On hit (proc): schedule a delayed echo strike — applies Time-Warped and repeats damage after a short delay.',
};

// ─── Tier 1 effect descriptions ───────────────────────────────────

/** Human-readable description for Tier 1 effects (used in buildLensEffect). */
export const LENS_T1_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:       'On hit: applies Abraded — enemy takes increased weapon damage.',
  quartz:     'On hit: applies Refracted — enemy takes increased weapon damage (precision vulnerability).',
  ruby:       'On hit: applies Burning — enemy takes fire damage over time.',
  citrine:    'On hit: applies Radiant — enemy takes increased damage (radiance vulnerability).',
  emerald:    'On hit: applies Poisoned — enemy takes poison damage over time.',
  sapphire:   'On hit: applies Chilled — enemy movement speed reduced.',
  iolite:     'On hit: applies Time-Warped — enemy movement and action rate slowed.',
  amethyst:   'On hit: applies Echo-Marked — repeats a portion of hit damage after a short delay.',
  diamond:    'On hit: applies Cracked — enemy takes increased damage (armor vulnerability).',
  nullstone:  'On hit: applies Gravitized — enemy slowed and pulled toward impact.',
  fracteryl:  'On hit: applies Fractal Wound — recursive damage ticks with decay.',
  eigenstein: 'On hit: applies Rift-Scarred — stacking bonus damage per hit with same lens.',
};

// ─── Forge-level unlock chances ───────────────────────────────────

export interface LensEffectUnlockChances {
  tier2Chance: number;
  tier3Chance: number;
}

const LENS_FORGE_CHANCES: Record<number, LensEffectUnlockChances> = {
  1: { tier2Chance: 0.08, tier3Chance: 0.00 },
  2: { tier2Chance: 0.14, tier3Chance: 0.01 },
  3: { tier2Chance: 0.24, tier3Chance: 0.03 },
  4: { tier2Chance: 0.34, tier3Chance: 0.06 },
  5: { tier2Chance: 0.48, tier3Chance: 0.12 },
};

export function getLensEffectUnlockChances(forgeLevel: number): LensEffectUnlockChances {
  return LENS_FORGE_CHANCES[forgeLevel] ?? LENS_FORGE_CHANCES[5]!;
}

// ─── Max mote types ───────────────────────────────────────────────

const LENS_MAX_MOTE_TYPES: Record<number, number> = {
  1: 1,
  2: 1,
  3: 2,
  4: 2,
  5: 3,
};

export function getLensMaxMoteTypes(forgeLevel: number): number {
  return LENS_MAX_MOTE_TYPES[forgeLevel] ?? 3;
}
