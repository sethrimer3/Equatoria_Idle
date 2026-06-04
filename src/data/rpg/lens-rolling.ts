/**
 * lens-rolling.ts — Lens effect rolling logic.
 *
 * Uses the same triangular distribution as weave-rolling, biased above 0.5.
 * Power scaling uses sqrt(log) to prevent linear runaway.
 * One effect per distinct mote tier used as an ingredient.
 */

import { TIER_BY_ID, type TierId } from '../tiers';
import { LENS_EFFECT_FAMILIES } from './lens-definitions';
import { getTierForgeWeight } from './crafted-weapon-helpers';
import { triangularRandom, triangularFromU } from './weave-rolling';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';
import type { LensEffect, LensRarity, CraftedLensData } from './lens-types';

export { triangularRandom, triangularFromU };

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

// ─── Power scaling ────────────────────────────────────────────────────────────

export function computeLensPowerScale(totalWeightedMoteValue: number): number {
  return Math.sqrt(1 + Math.log10(totalWeightedMoteValue + 1));
}

// ─── Effect rolling ───────────────────────────────────────────────────────────

const TRIANGULAR_MODE = 0.6;

export function rollLensEffect(tierId: TierId, totalWeightedMoteValue: number): LensEffect | null {
  const entry = LENS_EFFECT_FAMILIES[tierId];
  if (!entry || entry.specs.length === 0) return null;

  const spec = entry.specs[Math.floor(Math.random() * entry.specs.length)]!;
  const quality = triangularRandom(0, 1, TRIANGULAR_MODE);
  const rarity = getLensRarity(quality);
  const powerScale = computeLensPowerScale(totalWeightedMoteValue);
  const rawValue = spec.baseMaxValue * powerScale * quality;
  const value = parseFloat(rawValue.toFixed(1));

  return {
    tierId,
    family: entry.familyName,
    statKey: spec.statKey,
    label: spec.label,
    value,
    unit: spec.unit,
    rarity,
    quality,
    isApplied: spec.isApplied,
  };
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
): CraftedLensData {
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

  const effects: LensEffect[] = [];
  for (const [tierId] of tierCounts) {
    const effect = rollLensEffect(tierId, totalWeightedMoteValue);
    if (effect) effects.push(effect);
  }

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
  };
}
