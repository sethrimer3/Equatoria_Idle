/**
 * item-sort-helpers.ts — Pure sort/score helpers for lens and weave inventories.
 *
 * All functions are side-effect-free and safe to import in tests.
 */

import type { CraftedLensData } from './lens-types';
import type { CraftedWeaveData } from './weave-types';

export type ItemSortMode = 'power' | 'rarity' | 'zone' | 'newest';

const RARITY_RANK: Record<string, number> = {
  Mythic: 6, Legendary: 5, Epic: 4, Rare: 3, Uncommon: 2, Common: 1,
};

const ZONE_ORDER: Record<string, number> = {
  euhedral: 1, impetus: 2, caustics: 3, verdure: 4, horizon: 5,
};

// ─── Lens sort helpers ────────────────────────────────────────────────────────

export function getLensHighestEffectTier(lens: CraftedLensData): number {
  return Math.max(0, ...lens.effects.map(e => e.effectTier));
}

export function getLensHighestRarityRank(lens: CraftedLensData): number {
  return Math.max(0, ...lens.effects.map(e => RARITY_RANK[e.rarity] ?? 0));
}

/** Primary sort: highest effect tier → rarity → mote value. */
export function getLensPowerScore(lens: CraftedLensData): number {
  return getLensHighestEffectTier(lens) * 1000
    + getLensHighestRarityRank(lens) * 100
    + Math.log10(lens.totalWeightedMoteValue + 1);
}

/** Sort by rarity only (tie-break: mote value). */
export function getLensRarityScore(lens: CraftedLensData): number {
  return getLensHighestRarityRank(lens) * 100 + Math.log10(lens.totalWeightedMoteValue + 1);
}

/** Sort by source zone (unknown zones sort last). */
export function getLensZoneScore(lens: CraftedLensData): number {
  const zoneRank = lens.sourceZone ? (ZONE_ORDER[lens.sourceZone] ?? 99) : 99;
  // Within zone: sort by power
  return zoneRank * -1000 + getLensPowerScore(lens) / 1000;
}

/** Sort by newest (higher = newer). Parses numeric suffix from ID. */
export function getLensNewestScore(lens: CraftedLensData): number {
  const match = lens.id.match(/(\d+)$/);
  return match ? parseInt(match[1]!, 10) : 0;
}

export function compareLens(a: CraftedLensData, b: CraftedLensData, mode: ItemSortMode): number {
  switch (mode) {
    case 'rarity':  return getLensRarityScore(b) - getLensRarityScore(a) || a.name.localeCompare(b.name);
    case 'zone':    return getLensZoneScore(b) - getLensZoneScore(a) || a.name.localeCompare(b.name);
    case 'newest':  return getLensNewestScore(b) - getLensNewestScore(a) || a.name.localeCompare(b.name);
    default:        return getLensPowerScore(b) - getLensPowerScore(a) || a.name.localeCompare(b.name);
  }
}

// ─── Weave sort helpers ───────────────────────────────────────────────────────

export function getWeaveHighestRarityRank(weave: CraftedWeaveData): number {
  return Math.max(
    0,
    ...weave.affixes.map(a => RARITY_RANK[a.rarity] ?? 0),
    ...weave.tierEffects.map(e => RARITY_RANK[e.rarity] ?? 0),
  );
}

export function getWeaveHighestEffectTier(weave: CraftedWeaveData): number {
  return Math.max(0, ...weave.tierEffects.map(e => e.effectTier));
}

/** Primary sort: highest effect tier → rarity → mote value. */
export function getWeavePowerScore(weave: CraftedWeaveData): number {
  return getWeaveHighestEffectTier(weave) * 1000
    + getWeaveHighestRarityRank(weave) * 100
    + Math.log10(weave.totalWeightedMoteValue + 1);
}

/** Sort by rarity only. */
export function getWeaveRarityScore(weave: CraftedWeaveData): number {
  return getWeaveHighestRarityRank(weave) * 100 + Math.log10(weave.totalWeightedMoteValue + 1);
}

/** Sort by source zone (unknown last). */
export function getWeaveZoneScore(weave: CraftedWeaveData): number {
  const zoneRank = weave.sourceZone ? (ZONE_ORDER[weave.sourceZone] ?? 99) : 99;
  return zoneRank * -1000 + getWeavePowerScore(weave) / 1000;
}

/** Sort by newest (higher = newer). */
export function getWeaveNewestScore(weave: CraftedWeaveData): number {
  const match = weave.id.match(/(\d+)$/);
  return match ? parseInt(match[1]!, 10) : 0;
}

export function compareWeave(
  a: CraftedWeaveData,
  b: CraftedWeaveData,
  mode: ItemSortMode,
  equippedIds?: Set<string>,
): number {
  // Equipped items always sort first
  if (equippedIds) {
    const equippedDelta = Number(equippedIds.has(b.id)) - Number(equippedIds.has(a.id));
    if (equippedDelta !== 0) return equippedDelta;
  }
  switch (mode) {
    case 'rarity':  return getWeaveRarityScore(b) - getWeaveRarityScore(a) || a.name.localeCompare(b.name);
    case 'zone':    return getWeaveZoneScore(b) - getWeaveZoneScore(a) || a.name.localeCompare(b.name);
    case 'newest':  return getWeaveNewestScore(b) - getWeaveNewestScore(a) || a.name.localeCompare(b.name);
    default:        return getWeavePowerScore(b) - getWeavePowerScore(a) || a.name.localeCompare(b.name);
  }
}
