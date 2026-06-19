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
import {
  WEAVE_TIER_EFFECT_NAMES,
  WEAVE_T1_DESCRIPTIONS,
  WEAVE_T2_DESCRIPTIONS,
  WEAVE_T3_DESCRIPTIONS,
} from './weave-tier-definitions';
import { getTierForgeWeight } from './crafted-weapon-helpers';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';
import type { WeaveAffix, WeaveRarity, WeaveTierEffect, WeaveTierEffectTier, CraftedWeaveData, WeaveEffectRoll } from './weave-types';
import {
  ALL_WEAVE_EFFECT_IDS, WEAVE_PASSIVE_EFFECT_REGISTRY, WEAVE_PROC_EFFECT_REGISTRY,
  getWeaveEffectDef,
  type WeaveEffectId,
} from './weave-effects-registry';

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

// ─── Shared forge-level unlock chances ───────────────────────────────────────

export interface ForgeEffectUnlockChances {
  tier2Chance: number;
  tier3Chance: number;
}

const FORGE_EFFECT_CHANCES: Record<number, ForgeEffectUnlockChances> = {
  1: { tier2Chance: 0.08, tier3Chance: 0.00 },
  2: { tier2Chance: 0.14, tier3Chance: 0.01 },
  3: { tier2Chance: 0.24, tier3Chance: 0.03 },
  4: { tier2Chance: 0.34, tier3Chance: 0.06 },
  5: { tier2Chance: 0.48, tier3Chance: 0.12 },
};

/**
 * Returns tier2/tier3 unlock chances for a given forge level.
 * Shared by both lens and weave tier rolling.
 */
export function getForgeEffectUnlockChances(forgeLevel: number): ForgeEffectUnlockChances {
  return FORGE_EFFECT_CHANCES[forgeLevel] ?? FORGE_EFFECT_CHANCES[5]!;
}

// ─── Weave tier effect magnitude scaling ─────────────────────────────────────

const WEAVE_TIER_BASE_MAGNITUDE: Record<WeaveTierEffectTier, number> = {
  1: 10,
  2: 16,
  3: 26,
};

/**
 * Returns a magnitude for a weave tier effect based on per-tier mote investment.
 * Uses the same sqrt(log) formula as lenses to prevent linear runaway.
 */
export function computeWeaveTierMagnitude(tierWeightedValue: number, effectTier: WeaveTierEffectTier): number {
  const scale = Math.sqrt(1 + Math.log10(tierWeightedValue + 1));
  const raw = WEAVE_TIER_BASE_MAGNITUDE[effectTier] * scale;
  return parseFloat(raw.toFixed(1));
}

// ─── Single weave tier effect builder ────────────────────────────────────────

function buildWeaveTierEffect(
  tierId: TierId,
  effectTier: WeaveTierEffectTier,
  tierWeightedValue: number,
  rng: () => number,
): WeaveTierEffect | null {
  const names = WEAVE_TIER_EFFECT_NAMES[tierId];
  if (!names) return null;

  const descriptions: Record<WeaveTierEffectTier, Partial<Record<TierId, string>>> = {
    1: WEAVE_T1_DESCRIPTIONS,
    2: WEAVE_T2_DESCRIPTIONS,
    3: WEAVE_T3_DESCRIPTIONS,
  };
  const description = descriptions[effectTier][tierId] ?? 'STUB: effect behavior not implemented yet.';
  const name = names[effectTier];
  const key = `${tierId}_wt${effectTier}`;
  const quality = triangularFromU(0, 1, 0.6, rng());
  const rarity = getWeaveRarity(quality);
  const magnitude = computeWeaveTierMagnitude(tierWeightedValue, effectTier);

  return {
    tierId,
    effectTier,
    key,
    name,
    description,
    magnitude,
    quality,
    rarity,
    isApplied: false, // all weave tier effects are stubs
  };
}

// ─── Weave tier effect rolling ────────────────────────────────────────────────

/**
 * Rolls tier 1–3 effects for all ingredient tiers at the given forge level.
 *
 * - T1 is always generated for each tier with a WEAVE_TIER_EFFECT_NAMES entry.
 * - T2 is rolled probabilistically using forge-level chances.
 * - T3 is rolled probabilistically only if T2 was already rolled (strict ordering).
 *   This ensures results are always: T1 / T1+T2 / T1+T2+T3.
 *
 * rng defaults to Math.random; inject a deterministic function for testing.
 */
export function rollWeaveTierEffects(
  ingredients: CraftedWeaponIngredient[],
  forgeLevel: number,
  rng: () => number = Math.random,
): WeaveTierEffect[] {
  const { tier2Chance, tier3Chance } = getForgeEffectUnlockChances(forgeLevel);

  const tierCounts = new Map<TierId, number>();
  for (const ing of ingredients) {
    const cur = tierCounts.get(ing.tierId) ?? 0;
    tierCounts.set(ing.tierId, cur + Number(ing.refinedCount));
  }

  const effects: WeaveTierEffect[] = [];

  for (const [tierId, refinedCount] of tierCounts) {
    if (!WEAVE_TIER_EFFECT_NAMES[tierId]) continue;

    const tierWeightedValue = refinedCount * getTierForgeWeight(tierId);

    // T1 — always
    const t1 = buildWeaveTierEffect(tierId, 1, tierWeightedValue, rng);
    if (t1) effects.push(t1);

    // T2 — probabilistic
    const t2Rolled = rng() < tier2Chance;
    if (t2Rolled) {
      const t2 = buildWeaveTierEffect(tierId, 2, tierWeightedValue, rng);
      if (t2) effects.push(t2);

      // T3 — probabilistic, only if T2 was rolled (enforces T1 ≤ T2 ≤ T3 ordering)
      if (rng() < tier3Chance) {
        const t3 = buildWeaveTierEffect(tierId, 3, tierWeightedValue, rng);
        if (t3) effects.push(t3);
      }
    }
  }

  return effects;
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

// ─── Effect pool selection helpers ───────────────────────────────────────────

/** Rarity-based quality multipliers for effect value rolls. */
const EFFECT_RARITY_MULT: Record<WeaveRarity, number> = {
  Common:    0.0, // no effect for common-only weaves
  Uncommon:  0.45,
  Rare:      0.60,
  Epic:      0.75,
  Legendary: 0.90,
  Mythic:    1.0,
};

const RARITY_ORDER: WeaveRarity[] = ['Common', 'Uncommon', 'Rare', 'Epic', 'Legendary', 'Mythic'];

/**
 * Returns the highest rarity present among a weave's affixes.
 * Returns 'Common' if there are no affixes.
 */
function getHighestAffixRarity(affixes: WeaveAffix[]): WeaveRarity {
  let best: WeaveRarity = 'Common';
  for (const affix of affixes) {
    if (RARITY_ORDER.indexOf(affix.rarity) > RARITY_ORDER.indexOf(best)) best = affix.rarity;
  }
  return best;
}

/**
 * How much more likely a flavor-matched effect is over a non-matching one.
 * e.g. a diamond weave gets 3× weight on weave_guard / weave_reactive_ward.
 */
const FLAVOR_MATCH_MULTIPLIER = 3;

/**
 * Returns the ingredient tier IDs present in this weave, as a Set for O(1) lookup.
 * Used by getEligibleWeaveEffectsForRoll to determine flavor matches.
 */
export function getWeaveDominantTiers(ingredients: CraftedWeaponIngredient[]): Set<TierId> {
  return new Set(ingredients.filter(i => i.refinedCount > 0).map(i => i.tierId));
}

/**
 * Returns all eligible effect IDs with computed selection weights for this weave.
 *
 * Eligibility rules:
 *   - The effect's minRarity must be ≤ highestRarity (default minRarity is 'Uncommon').
 *   - Common-rarity weaves never reach this function (rarityMult check eliminates them first).
 *
 * Weighting rules:
 *   - If any ingredient tier matches an effect's flavors array: weight × FLAVOR_MATCH_MULTIPLIER.
 *   - Otherwise: weight × 1 (still eligible, just less likely).
 *   - def.weight (if set) scales the base before the flavor multiplier.
 */
export function getEligibleWeaveEffectsForRoll(params: {
  ingredients: CraftedWeaponIngredient[];
  highestRarity: WeaveRarity;
}): Array<{ id: WeaveEffectId; weight: number }> {
  const { ingredients, highestRarity } = params;
  const dominantTiers = getWeaveDominantTiers(ingredients);

  const pool: Array<{ id: WeaveEffectId; weight: number }> = [];

  for (const effectId of ALL_WEAVE_EFFECT_IDS) {
    const def = getWeaveEffectDef(effectId);
    if (!def) continue;
    const minRar = def.minRarity ?? 'Uncommon';
    if (RARITY_ORDER.indexOf(highestRarity) < RARITY_ORDER.indexOf(minRar)) continue;

    const baseWeight = def.weight ?? 1.0;
    const flavorMatch = def.flavors.some(f => dominantTiers.has(f));
    const weight = flavorMatch ? baseWeight * FLAVOR_MATCH_MULTIPLIER : baseWeight;
    pool.push({ id: effectId, weight });
  }

  return pool;
}

/**
 * Picks one effect ID from a weighted pool using the given rng.
 * Uses standard weighted random selection (linear scan, O(n)).
 * Returns null only if the pool is empty.
 */
export function pickWeightedWeaveEffect(
  pool: Array<{ id: WeaveEffectId; weight: number }>,
  rng: () => number,
): WeaveEffectId | null {
  if (pool.length === 0) return null;
  const totalWeight = pool.reduce((s, e) => s + e.weight, 0);
  let threshold = rng() * totalWeight;
  for (const entry of pool) {
    threshold -= entry.weight;
    if (threshold <= 0) return entry.id;
  }
  // Floating-point fallback: return last entry.
  return pool[pool.length - 1]!.id;
}

// ─── Effect rolling ───────────────────────────────────────────────────────────

/**
 * Rolls 0 or 1 effect for a weave, using flavor-weighted selection based on
 * the weave's ingredient tiers and highest-rarity affix.
 *
 * Rules:
 *   Common-only weaves → no effect.
 *   Uncommon or better → exactly 1 effect from the eligible weighted pool.
 *   Effects whose flavors match the weave's ingredient tiers are 3× more likely.
 *   Value scales with powerScale and a rarity-based multiplier.
 *
 * Returns an empty array if no effect is granted.
 */
export function rollWeaveEffects(
  affixes: WeaveAffix[],
  ingredients: CraftedWeaponIngredient[],
  totalWeightedMoteValue: number,
  rng: () => number = Math.random,
): WeaveEffectRoll[] {
  const highestRarity = getHighestAffixRarity(affixes);
  const rarityMult = EFFECT_RARITY_MULT[highestRarity];
  if (rarityMult <= 0) return [];

  const pool = getEligibleWeaveEffectsForRoll({ ingredients, highestRarity });
  const effectId = pickWeightedWeaveEffect(pool, rng);
  if (!effectId) return [];

  const powerScale = computeWeavePowerScale(totalWeightedMoteValue);
  const def = getWeaveEffectDef(effectId)!;
  const rawValue = def.baseMaxValue * powerScale * rarityMult;
  const value = parseFloat(rawValue.toFixed(1));

  return [{ id: effectId, value }];
}

/**
 * Backward-compatible wrapper around rollWeaveEffects with no ingredient flavor context.
 * Existing call sites that don't have ingredient access still get uniform-weight selection.
 *
 * @deprecated Prefer rollWeaveEffects(affixes, ingredients, ...) for flavor-weighted rolling.
 */
export function rollWeavePassiveEffects(
  affixes: WeaveAffix[],
  totalWeightedMoteValue: number,
  rng: () => number = Math.random,
): WeaveEffectRoll[] {
  return rollWeaveEffects(affixes, [], totalWeightedMoteValue, rng);
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
 * Tier 1–3 STUB effects are also rolled and attached per distinct tier.
 */
export function createCraftedWeave(
  id: string,
  ingredients: CraftedWeaponIngredient[],
  forgeCraftLevel: number,
  rng: () => number = Math.random,
): CraftedWeaveData {
  // Merge duplicate tiers and sum weighted value
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

  // Roll one affix per distinct tier (skipping tiers without a defined family)
  const affixes: WeaveAffix[] = [];
  for (const [tierId] of tierCounts) {
    const affix = rollWeaveAffix(tierId, totalWeightedMoteValue);
    if (affix) affixes.push(affix);
  }

  // Roll tier 1–3 STUB effects per distinct tier
  const tierEffects = rollWeaveTierEffects(normalizedIngredients, forgeCraftLevel, rng);

  // Roll passive effects (0 or 1 depending on best affix rarity)
  const effects = rollWeavePassiveEffects(affixes, totalWeightedMoteValue, rng);

  const tiers = Array.from(tierCounts.keys());
  const name = getWeaveName(tiers);

  return {
    id,
    name,
    ingredients: normalizedIngredients,
    affixes,
    totalWeightedMoteValue,
    forgeCraftLevel,
    tierEffects,
    refinementLevel: 0,
    effects,
  };
}
