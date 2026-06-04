/**
 * weave-rolling.ts — Weave affix rolling logic.
 *
 * Quality uses a triangular distribution biased slightly above 0.5,
 * so typical rolls land in the Uncommon–Rare range. Rarity thresholds
 * are based on the quality percentile. Value scales with invested mote
 * weight using sqrt(log) to prevent linear runaway.
 */

import { TIER_BY_ID, type TierId } from '../tiers';
import { WEAVE_AFFIX_FAMILIES } from './weave-definitions';
import { getTierForgeWeight } from './crafted-weapon-helpers';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';
import type { WeaveAffix, WeaveRarity, CraftedWeaveData } from './weave-types';

// ─── Triangular distribution ─────────────────────────────────────────────────

/**
 * Returns a random number in [lo, hi] using a triangular distribution with
 * the given mode (peak). The mode is clamped to [lo, hi].
 *
 * Exported for unit testing with fixed inputs.
 */
export function triangularRandom(lo: number, hi: number, mode: number): number {
  const clampedMode = Math.max(lo, Math.min(hi, mode));
  const u = Math.random();
  const c = (clampedMode - lo) / (hi - lo);
  if (u < c) {
    return lo + Math.sqrt(u * (hi - lo) * (clampedMode - lo));
  }
  return hi - Math.sqrt((1 - u) * (hi - lo) * (hi - clampedMode));
}

/**
 * Deterministic variant for testing — takes a pre-generated uniform [0,1] value.
 */
export function triangularFromU(lo: number, hi: number, mode: number, u: number): number {
  const clampedMode = Math.max(lo, Math.min(hi, mode));
  const c = (clampedMode - lo) / (hi - lo);
  if (u < c) {
    return lo + Math.sqrt(u * (hi - lo) * (clampedMode - lo));
  }
  return hi - Math.sqrt((1 - u) * (hi - lo) * (hi - clampedMode));
}

// ─── Rarity classification ────────────────────────────────────────────────────

/** Quality thresholds for rarity tiers (lower bound is inclusive). */
const RARITY_THRESHOLDS: Array<[number, WeaveRarity]> = [
  [0.99, 'Mythic'],
  [0.94, 'Legendary'],
  [0.82, 'Epic'],
  [0.65, 'Rare'],
  [0.40, 'Uncommon'],
  [0.00, 'Common'],
];

export function getWeaveRarity(quality: number): WeaveRarity {
  for (const [threshold, rarity] of RARITY_THRESHOLDS) {
    if (quality >= threshold) return rarity;
  }
  return 'Common';
}

// ─── Power scaling ────────────────────────────────────────────────────────────

/**
 * Returns a power scale multiplier for affix values based on total weighted mote value.
 * Uses sqrt(1 + log10(total+1)) to prevent linear runaway while still rewarding
 * higher mote investment.
 *
 * Example values:
 *   total=0:      scale ≈ 1.00
 *   total=1000:   scale ≈ 2.00
 *   total=1e6:    scale ≈ 2.65
 *   total=1e9:    scale ≈ 3.16
 */
export function computeWeavePowerScale(totalWeightedMoteValue: number): number {
  return Math.sqrt(1 + Math.log10(totalWeightedMoteValue + 1));
}

// ─── Affix rolling ────────────────────────────────────────────────────────────

const TRIANGULAR_MODE = 0.6; // biased slightly above 0.5

/**
 * Rolls one weave affix for the given tier at the given power scale.
 * Returns null for tiers without a defined affix family (e.g., sunstone).
 */
export function rollWeaveAffix(tierId: TierId, totalWeightedMoteValue: number): WeaveAffix | null {
  const family = WEAVE_AFFIX_FAMILIES[tierId];
  if (!family || family.length === 0) return null;

  const spec = family[Math.floor(Math.random() * family.length)]!;
  const quality = triangularRandom(0, 1, TRIANGULAR_MODE);
  const rarity = getWeaveRarity(quality);
  const powerScale = computeWeavePowerScale(totalWeightedMoteValue);
  const rawValue = spec.baseMaxValue * powerScale * quality;
  const value = parseFloat(rawValue.toFixed(1));

  return {
    affixId: spec.affixId,
    tierId,
    label: spec.label,
    quality,
    rarity,
    value,
    unit: spec.unit,
    applied: spec.applied,
  };
}

// ─── Weave name generation ────────────────────────────────────────────────────

const FAMILY_NOUNS: Partial<Record<TierId, string>> = {
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

function getWeaveName(tiers: TierId[]): string {
  if (tiers.length === 0) return 'Null Thread';
  if (tiers.length === 1) {
    const tier = TIER_BY_ID.get(tiers[0]!);
    const noun = FAMILY_NOUNS[tiers[0]!] ?? 'Thread';
    return `${tier?.displayName ?? tiers[0]} ${noun} Thread`;
  }
  // Sort by unlockOrder descending (dominant first)
  const sorted = [...tiers].sort((a, b) =>
    (TIER_BY_ID.get(b)?.unlockOrder ?? 0) - (TIER_BY_ID.get(a)?.unlockOrder ?? 0),
  );
  if (tiers.length === 2) {
    const t1 = TIER_BY_ID.get(sorted[0]!)?.displayName ?? sorted[0];
    const t2 = TIER_BY_ID.get(sorted[1]!)?.displayName ?? sorted[1];
    return `${t1}-${t2} Weave`;
  }
  const t1 = TIER_BY_ID.get(sorted[0]!)?.displayName ?? sorted[0];
  return `${t1} Composite Weave`;
}

// ─── Public factory ───────────────────────────────────────────────────────────

/**
 * Creates a crafted weave from the given ingredients.
 * One affix is rolled per distinct tier (tiers without a defined family are skipped).
 */
export function createCraftedWeave(
  id: string,
  ingredients: CraftedWeaponIngredient[],
  forgeCraftLevel: number,
): CraftedWeaveData {
  // Merge duplicate tiers and sum weighted value
  const tierCounts = new Map<TierId, number>();
  for (const ing of ingredients) {
    const cur = tierCounts.get(ing.tierId) ?? 0;
    tierCounts.set(ing.tierId, cur + ing.refinedCount);
  }
  const normalizedIngredients = Array.from(tierCounts.entries())
    .filter(([, count]) => count > 0)
    .map(([tierId, refinedCount]) => ({ tierId, refinedCount }));

  let totalWeightedMoteValue = 0;
  for (const ing of normalizedIngredients) {
    totalWeightedMoteValue += ing.refinedCount * getTierForgeWeight(ing.tierId);
  }

  // Roll one affix per distinct tier (skipping tiers without a defined family)
  const affixes: WeaveAffix[] = [];
  for (const [tierId] of tierCounts) {
    const affix = rollWeaveAffix(tierId, totalWeightedMoteValue);
    if (affix) affixes.push(affix);
  }

  const tiers = Array.from(tierCounts.keys());
  const name = getWeaveName(tiers);

  return {
    id,
    name,
    ingredients: normalizedIngredients,
    affixes,
    totalWeightedMoteValue,
    forgeCraftLevel,
  };
}
