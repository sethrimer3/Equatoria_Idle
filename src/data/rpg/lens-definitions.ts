/**
 * lens-definitions.ts — Naming map and forge-level unlock chances for the Lens system.
 *
 * Tier 1 effects are active combat statuses.
 * Tier 2 effects for all 12 mote tiers are implemented.
 * Tier 3 effects for sand/quartz/ruby/citrine/emerald/sapphire are implemented.
 * Iolite, amethyst, diamond, nullstone, fracteryl, eigenstein T3 remain STUB.
 */

import type { TierId } from '../tiers';
import type { LensEffectTier } from './lens-types';

// ─── Implemented Tier 2 tier IDs ──────────────────────────────────

/** Tier IDs whose Tier 2 effects are fully implemented. */
export const LENS_T2_IMPLEMENTED_TIER_IDS = new Set<TierId>([
  'sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire', 'iolite',
  'amethyst', 'diamond', 'nullstone', 'fracteryl', 'eigenstein',
]);

// ─── Implemented Tier 3 tier IDs ──────────────────────────────────

/** Tier IDs whose Tier 3 effects are fully implemented. */
export const LENS_T3_IMPLEMENTED_TIER_IDS = new Set<TierId>([
  'sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire',
]);

// ─── Effect naming map ────────────────────────────────────────────

/** Display names per (tier, effectTier). Implemented effects have clean names; unimplemented include "STUB". */
export const LENS_EFFECT_NAMES: Partial<Record<TierId, Record<LensEffectTier, string>>> = {
  sand: {
    1: 'Abraded',
    2: 'Sand Spray',
    3: 'Sandstorm Cascade',
  },
  quartz: {
    1: 'Refracted',
    2: 'Prism Split',
    3: 'Perfect Refraction',
  },
  ruby: {
    1: 'Burning',
    2: 'Ruby Beam Splinters',
    3: 'Meltdown Core',
  },
  citrine: {
    1: 'Radiant',
    2: 'Solar Flare Burst',
    3: 'Radiant Detonation',
  },
  emerald: {
    1: 'Poisoned',
    2: 'Venom Spores',
    3: 'Viridian Bloom',
  },
  sapphire: {
    1: 'Chilled',
    2: 'Ice Shards',
    3: 'Absolute Zero',
  },
  iolite: {
    1: 'Time-Warped',
    2: 'Delayed Echo Strike',
    3: 'Time Fracture STUB',
  },
  amethyst: {
    1: 'Echo-Marked',
    2: 'Phantom Repeat',
    3: 'Mirror Volley STUB',
  },
  diamond: {
    1: 'Cracked',
    2: 'Diamond Shrapnel',
    3: 'Faultline Break STUB',
  },
  nullstone: {
    1: 'Gravitized',
    2: 'Gravity Pulse',
    3: 'Event Horizon STUB',
  },
  fracteryl: {
    1: 'Fractal Wound',
    2: 'Recursive Splinter',
    3: 'Infinite Descent STUB',
  },
  eigenstein: {
    1: 'Rift-Scarred',
    2: 'Rift Slash',
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
  sapphire:   'On hit (proc): burst icy shards outward — deals damage and applies Chilled to nearby enemies.',
  iolite:     'On hit (proc): schedule a delayed echo strike — applies Time-Warped and repeats damage after a short delay.',
  amethyst:   'On hit (proc): queue a ghostly phantom repeat — repeats triggering hit damage after ~600ms and applies Echo-Marked.',
  diamond:    'On hit (proc): emit diamond shrapnel outward — deals piercing damage and applies Cracked to nearby enemies.',
  nullstone:  'On hit (proc): release a gravity pulse — pulls nearby enemies inward, deals void damage, and applies Gravitized.',
  fracteryl:  'On hit (proc): spawn fractal splinter shards (depth capped at 1) — deals reduced damage and applies Fractal Wound.',
  eigenstein: 'On hit (proc): tear a dimensional rift slash — deals rift damage and applies Rift-Scarred.',
};

// ─── Tier 3 effect descriptions (implemented tiers only) ─────────

/** Human-readable description for implemented Tier 3 effects. */
export const LENS_T3_DESCRIPTIONS: Partial<Record<TierId, string>> = {
  sand:     'Sandstorm Cascade: Sand Spray fragments have a chance to release a smaller secondary cascade — deals reduced damage and applies Abraded. Cascade depth capped at 1.',
  quartz:   'Perfect Refraction: Prism Split shards bounce once to a nearby enemy after hitting — deals reduced bounce damage and applies Refracted. No infinite bouncing.',
  ruby:     'Meltdown Core: Ruby hits build heat on the target; at threshold, trigger a fire explosion — damages nearby enemies and applies Burning. Heat and explosion rate capped.',
  citrine:  'Radiant Detonation: When a Radiant-tagged enemy dies, it has a chance to detonate — damages nearby enemies in a golden flash and applies Radiant. Capped per death chain.',
  emerald:  'Viridian Bloom: When a Poison-tagged enemy dies, create a temporary toxic bloom zone — damages enemies inside over time and applies Poisoned. Zone duration and rate capped.',
  sapphire: 'Absolute Zero: Repeated Sapphire lens hits on a Chilled enemy can freeze it — frozen enemies nearly stop moving for a capped duration. The next hit shatters the ice for bonus damage.',
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
