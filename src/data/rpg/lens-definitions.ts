/**
 * lens-definitions.ts — STUB naming map and forge-level unlock chances for the Lens system.
 *
 * Effects are placeholders. No combat behavior is implemented yet.
 * Each entry displays as "STUB" to prevent any impression of being active.
 */

import type { TierId } from '../tiers';
import type { LensEffectTier } from './lens-types';

// ─── STUB naming map ──────────────────────────────────────────────

/** Display names per (tier, effectTier). All names include "STUB". */
export const LENS_EFFECT_NAMES: Partial<Record<TierId, Record<LensEffectTier, string>>> = {
  sand: {
    1: 'Abraded STUB',
    2: 'Sand Spray STUB',
    3: 'Sandstorm Cascade STUB',
  },
  quartz: {
    1: 'Refracted STUB',
    2: 'Prism Split STUB',
    3: 'Perfect Refraction STUB',
  },
  ruby: {
    1: 'Burning STUB',
    2: 'Ruby Beam Splinters STUB',
    3: 'Meltdown Core STUB',
  },
  citrine: {
    1: 'Radiant STUB',
    2: 'Solar Flare Burst STUB',
    3: 'Radiant Detonation STUB',
  },
  emerald: {
    1: 'Poisoned STUB',
    2: 'Venom Spores STUB',
    3: 'Viridian Bloom STUB',
  },
  sapphire: {
    1: 'Chilled STUB',
    2: 'Ice Shards STUB',
    3: 'Absolute Zero STUB',
  },
  iolite: {
    1: 'Time-Warped STUB',
    2: 'Delayed Echo Strike STUB',
    3: 'Time Fracture STUB',
  },
  amethyst: {
    1: 'Echo-Marked STUB',
    2: 'Phantom Repeat STUB',
    3: 'Mirror Volley STUB',
  },
  diamond: {
    1: 'Cracked STUB',
    2: 'Diamond Shrapnel STUB',
    3: 'Faultline Break STUB',
  },
  nullstone: {
    1: 'Gravitized STUB',
    2: 'Gravity Pulse STUB',
    3: 'Event Horizon STUB',
  },
  fracteryl: {
    1: 'Fractal Wound STUB',
    2: 'Recursive Splinter STUB',
    3: 'Infinite Descent STUB',
  },
  eigenstein: {
    1: 'Rift-Scarred STUB',
    2: 'Rift Slash STUB',
    3: 'Reality Cascade STUB',
  },
  // sunstone intentionally omitted — power scaling only, no effects
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
