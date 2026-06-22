/**
 * lens-rolling.ts — Lens effect generation.
 *
 * Each distinct ingredient tier always receives a Tier 1 effect (active).
 * Tier 2 and Tier 3 are rolled independently per tier at forge-level-defined chances.
 * All three tiers are fully implemented; isApplied is true for all rolled effects.
 * Quality uses a triangular distribution (biased above 0.5) for rarity only.
 * Magnitude scales with per-tier mote investment via sqrt(log) — not linear.
 */

import { TIER_BY_ID, type TierId } from '../tiers';
import {
  LENS_EFFECT_NAMES,
  LENS_T1_DESCRIPTIONS,
  LENS_T2_DESCRIPTIONS,
  LENS_T3_DESCRIPTIONS,
  LENS_T2_IMPLEMENTED_TIER_IDS,
  LENS_T3_IMPLEMENTED_TIER_IDS,
  getLensEffectUnlockChances,
  getLensMaxMoteTypes,
} from './lens-definitions';
import { getTierForgeWeight } from './crafted-weapon-helpers';
import { triangularRandom, triangularFromU } from './weave-rolling';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';
import type { LensEffect, LensEffectTier, LensRarity, CraftedLensData } from './lens-types';

export { triangularRandom, triangularFromU, getLensMaxMoteTypes, getLensEffectUnlockChances };

// ─── Rarity classification ────────────────────────────────────────────────────

const RARITY_THRESHOLDS: Array<[number, LensRarity]> = [
  [0.99, 'Mythic'],
  [0.94, 'Legendary'],
  [0.82, 'Epic'],
  [0.65, 'Rare'],
  [0.40, 'Uncommon'],
  [0.00, 'Common'],
];

export function getLensRarity(quality: number): LensRarity {
  for (const [threshold, rarity] of RARITY_THRESHOLDS) {
    if (quality >= threshold) return rarity;
  }
  return 'Common';
}

// ─── Magnitude scaling ────────────────────────────────────────────────────────

/** Base magnitude per effect tier. T2 and T3 are stronger stubs. */
const BASE_MAGNITUDE_BY_TIER: Record<LensEffectTier, number> = {
  1: 10,
  2: 16,
  3: 26,
};

/**
 * Returns a magnitude value for a lens effect based on per-tier mote investment.
 * Uses sqrt(1 + log10(weighted+1)) to prevent linear runaway.
 */
export function computeLensMagnitude(tierWeightedValue: number, effectTier: LensEffectTier): number {
  const scale = Math.sqrt(1 + Math.log10(tierWeightedValue + 1));
  const raw = BASE_MAGNITUDE_BY_TIER[effectTier] * scale;
  return parseFloat(raw.toFixed(1));
}

/** Total-value power scale — exported for UI previews. */
export function computeLensPowerScale(totalWeightedMoteValue: number): number {
  return Math.sqrt(1 + Math.log10(totalWeightedMoteValue + 1));
}

// ─── Single-effect builder ────────────────────────────────────────────────────

function buildLensEffect(
  tierId: TierId,
  effectTier: LensEffectTier,
  tierWeightedValue: number,
  rng: () => number,
): LensEffect | null {
  const names = LENS_EFFECT_NAMES[tierId];
  if (!names) return null;

  const name = names[effectTier];
  const key = `${tierId}_t${effectTier}`;
  const quality = triangularFromU(0, 1, 0.6, rng());
  const rarity = getLensRarity(quality);
  const magnitude = computeLensMagnitude(tierWeightedValue, effectTier);

  const isT1 = effectTier === 1;
  const isImplementedT2 = effectTier === 2 && LENS_T2_IMPLEMENTED_TIER_IDS.has(tierId);
  const isImplementedT3 = effectTier === 3 && LENS_T3_IMPLEMENTED_TIER_IDS.has(tierId);
  const description = isT1
    ? (LENS_T1_DESCRIPTIONS[tierId] ?? 'Active Tier 1 effect.')
    : isImplementedT2
      ? (LENS_T2_DESCRIPTIONS[tierId] ?? 'Active Tier 2 effect.')
      : isImplementedT3
        ? (LENS_T3_DESCRIPTIONS[tierId] ?? 'Active Tier 3 effect.')
        : 'STUB: effect behavior not implemented yet.';

  return {
    tierId,
    effectTier,
    key,
    name,
    description,
    magnitude,
    quality,
    rarity,
    isApplied: isT1 || isImplementedT2 || isImplementedT3,
  };
}

// ─── Public roll helpers ──────────────────────────────────────────────────────

/**
 * Rolls effects for all ingredient tiers at the given forge level.
 * - T1 is always generated for each tier with an LENS_EFFECT_NAMES entry.
 * - T2 and T3 are rolled independently per tier using forge-level chances.
 * - rng defaults to Math.random; inject a deterministic function for testing.
 */
export function rollLensEffects(
  ingredients: CraftedWeaponIngredient[],
  forgeLevel: number,
  rng: () => number = Math.random,
): LensEffect[] {
  const { tier2Chance, tier3Chance } = getLensEffectUnlockChances(forgeLevel);

  // Merge duplicate tiers and sum counts
  const tierCounts = new Map<TierId, number>();
  for (const ing of ingredients) {
    const cur = tierCounts.get(ing.tierId) ?? 0;
    tierCounts.set(ing.tierId, cur + Number(ing.refinedCount));
  }

  const effects: LensEffect[] = [];

  for (const [tierId, refinedCount] of tierCounts) {
    if (!LENS_EFFECT_NAMES[tierId]) continue; // sunstone etc. — no effects

    const tierWeightedValue = refinedCount * getTierForgeWeight(tierId);

    // T1 — always
    const t1 = buildLensEffect(tierId, 1, tierWeightedValue, rng);
    if (t1) effects.push(t1);

    // T2 — probabilistic
    if (rng() < tier2Chance) {
      const t2 = buildLensEffect(tierId, 2, tierWeightedValue, rng);
      if (t2) effects.push(t2);
    }

    // T3 — probabilistic (never at forge level 1 since tier3Chance=0)
    if (rng() < tier3Chance) {
      const t3 = buildLensEffect(tierId, 3, tierWeightedValue, rng);
      if (t3) effects.push(t3);
    }
  }

  return effects;
}

// ─── Lens name generation ─────────────────────────────────────────────────────

const LENS_NOUNS: Partial<Record<TierId, string>> = {
  sand:       'Haste',
  quartz:     'Clarity',
  ruby:       'Ignition',
  citrine:    'Radiance',
  emerald:    'Propagation',
  sapphire:   'Precision',
  iolite:     'Persistence',
  amethyst:   'Echo',
  diamond:    'Compression',
  nullstone:  'Gravity',
  fracteryl:  'Recursion',
  eigenstein: 'Rift',
};

function getLensName(tiers: TierId[]): string {
  if (tiers.length === 0) return 'Null Lens';
  if (tiers.length === 1) {
    const tier = TIER_BY_ID.get(tiers[0]!);
    const noun = LENS_NOUNS[tiers[0]!] ?? 'Lens';
    return `${tier?.displayName ?? tiers[0]} ${noun} Lens`;
  }
  const sorted = [...tiers].sort((a, b) =>
    (TIER_BY_ID.get(b)?.unlockOrder ?? 0) - (TIER_BY_ID.get(a)?.unlockOrder ?? 0),
  );
  if (tiers.length === 2) {
    const t1 = TIER_BY_ID.get(sorted[0]!)?.displayName ?? sorted[0];
    const t2 = TIER_BY_ID.get(sorted[1]!)?.displayName ?? sorted[1];
    return `${t1}-${t2} Compound Lens`;
  }
  const t1 = TIER_BY_ID.get(sorted[0]!)?.displayName ?? sorted[0];
  return `${t1} Composite Lens`;
}

// ─── Public factory ───────────────────────────────────────────────────────────

export function createCraftedLens(
  id: string,
  ingredients: CraftedWeaponIngredient[],
  forgeCraftLevel: number,
  rng: () => number = Math.random,
): CraftedLensData {
  const tierCounts = new Map<TierId, number>();
  for (const ing of ingredients) {
    const cur = tierCounts.get(ing.tierId) ?? 0;
    tierCounts.set(ing.tierId, cur + Number(ing.refinedCount));
  }
  const normalizedIngredients = Array.from(tierCounts.entries())
    .filter(([, count]) => count > 0)
    .map(([tierId, refinedCount]) => ({ tierId, refinedCount }));

  let totalWeightedMoteValue = 0;
  for (const ing of normalizedIngredients) {
    totalWeightedMoteValue += ing.refinedCount * getTierForgeWeight(ing.tierId);
  }

  const effects = rollLensEffects(normalizedIngredients, forgeCraftLevel, rng);
  const tiers = Array.from(tierCounts.keys());
  const name = getLensName(tiers);

  return {
    id,
    type: 'lens',
    name,
    ingredients: normalizedIngredients,
    totalWeightedMoteValue,
    forgeCraftLevel,
    effects,
    refinementLevel: 0,
  };
}
