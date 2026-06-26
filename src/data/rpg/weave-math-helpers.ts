/**
 * weave-math-helpers.ts — Shared math utilities for tiered weave effects.
 *
 * Handles overflow crit resolution, capped-chance diminishing returns,
 * multi-layer crit resolution, and bounded chain counting.
 */

/**
 * Decomposes an overflow probability into guaranteed layers plus a partial-chance
 * remainder.
 *
 * resolveOverflowChance(150) → { layers: 1, partialChance: 50 }
 * resolveOverflowChance(350) → { layers: 3, partialChance: 50 }
 * resolveOverflowChance(75)  → { layers: 0, partialChance: 75 }
 */
export function resolveOverflowChance(pct: number): { layers: number; partialChance: number } {
  const clamped = Math.max(0, pct);
  return {
    layers: Math.floor(clamped / 100),
    partialChance: clamped % 100,
  };
}

/**
 * Monotonically-increasing chance that asymptotically approaches maxPct without ever reaching it.
 *
 * Formula: maxPct * (1 - 1 / (1 + k * x))
 *
 * cappedChance(0, maxPct, k) === 0
 * cappedChance(∞, maxPct, k) → maxPct  (never reached)
 * Larger k = faster approach to the cap.
 */
export function cappedChance(effectMultiplier: number, maxPct: number, k = 1.0): number {
  const x = Math.max(0, effectMultiplier);
  return maxPct * (1 - 1 / (1 + k * x));
}

/**
 * Resolves the total number of crit layers from a raw crit-chance percentage.
 *
 * 150% crit chance = 1 guaranteed + 50% chance of a second layer.
 * 0%   crit chance = 0 layers always.
 * Uses overflow semantics without recursion.
 */
export function resolveCritLayers(critChancePct: number, rng: () => number = Math.random): number {
  const clamped = Math.max(0, critChancePct);
  const { layers, partialChance } = resolveOverflowChance(clamped);
  const bonus = (partialChance > 0 && rng() * 100 < partialChance) ? 1 : 0;
  return layers + bonus;
}

/**
 * Resolves the number of chain hits from a chain-chance percentage, bounded by maxDepth.
 *
 * Each chain link rolls independently; the chain breaks on the first failure.
 * chainChancePct=100%, maxDepth=3 → always returns 3.
 * chainChancePct=0%,   maxDepth=3 → always returns 0.
 */
export function resolveBoundedChain(chainChancePct: number, maxDepth: number, rng: () => number = Math.random): number {
  const clampedPct = Math.max(0, Math.min(100, chainChancePct));
  let count = 0;
  for (let i = 0; i < maxDepth; i++) {
    if (rng() * 100 < clampedPct) {
      count++;
    } else {
      break;
    }
  }
  return count;
}
