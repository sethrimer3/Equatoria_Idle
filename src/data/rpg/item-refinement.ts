/**
 * item-refinement.ts — Centralized constants for item refinement and dismantle.
 *
 * All balance values live here so future tuning is a single-file change.
 */

import type { LensRarity } from './lens-types';
import type { WeaveRarity } from './weave-types';
import type { CraftedLensData } from './lens-types';
import type { CraftedWeaveData } from './weave-types';

export const MAX_REFINEMENT_LEVEL = 3;
export const REFINEMENT_RESOURCE_NAME = 'Resonance Dust';

// ─── Rarity → Resonance Dust granted on dismantle ────────────────
export const DISMANTLE_DUST_BY_RARITY: Record<string, number> = {
  Common:    3,
  Uncommon:  6,
  Rare:     12,
  Epic:     20,
  Legendary: 35,
  Mythic:   60,
};

// ─── Rarity → Base refinement cost (Dust) at +0→+1 ──────────────
export const REFINE_BASE_COST_BY_RARITY: Record<string, number> = {
  Common:    5,
  Uncommon:  9,
  Rare:     15,
  Epic:     25,
  Legendary: 40,
  Mythic:   70,
};

// Multiplier on base cost per target level (index = target level - 1)
// e.g. +0→+1 = base×1, +1→+2 = base×2, +2→+3 = base×4
export const REFINE_LEVEL_COST_MULTIPLIER = [1, 2, 4] as const;

// ─── Refinement stat multipliers ─────────────────────────────────
// Applied to all numeric combat modifiers at each refinement level.
// +0 = 1.00  (no change, identical to pre-refinement behavior)
// +1 = 1.12  (~12% stronger)
// +2 = 1.25  (~25% stronger)
// +3 = 1.42  (~42% stronger)
export const REFINEMENT_STAT_MULTIPLIER = [1.0, 1.12, 1.25, 1.42] as const;

// ─── Rarity helpers ──────────────────────────────────────────────

const RARITY_RANK: Record<string, number> = {
  Common: 1, Uncommon: 2, Rare: 3, Epic: 4, Legendary: 5, Mythic: 6,
};

export function getLensHighestRarity(lens: CraftedLensData): LensRarity {
  let best = 'Common';
  for (const e of lens.effects) {
    if ((RARITY_RANK[e.rarity] ?? 0) > (RARITY_RANK[best] ?? 0)) best = e.rarity;
  }
  return best as LensRarity;
}

export function getWeaveHighestRarity(weave: CraftedWeaveData): WeaveRarity {
  let best = 'Common';
  for (const a of weave.affixes) {
    if ((RARITY_RANK[a.rarity] ?? 0) > (RARITY_RANK[best] ?? 0)) best = a.rarity;
  }
  return best as WeaveRarity;
}

export function getDismantleDust(rarity: string): number {
  return DISMANTLE_DUST_BY_RARITY[rarity] ?? 3;
}

export function getRefineCost(rarity: string, targetLevel: number): number {
  const base = REFINE_BASE_COST_BY_RARITY[rarity] ?? 5;
  const mult = REFINE_LEVEL_COST_MULTIPLIER[(targetLevel - 1) as 0 | 1 | 2] ?? 4;
  return base * mult;
}

export function getStatMultiplierForLevel(level: number): number {
  return REFINEMENT_STAT_MULTIPLIER[Math.max(0, Math.min(3, level))] ?? 1.0;
}
