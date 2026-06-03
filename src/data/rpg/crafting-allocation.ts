/**
 * crafting-allocation.ts — Pure helpers for percentage-to-ingredient allocation.
 *
 * These functions are UI-layer math helpers: they convert percentage shares and
 * inventory into concrete refined crystal ingredient counts for the forge crafting page.
 * No DOM dependencies; all functions are testable in isolation.
 */

import type { TierId } from '../tiers';
import { getTierForgeWeight } from './crafted-weapon-helpers';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum segment size enforced by the slider, in percent (5%). */
export const MIN_SEGMENT_PCT = 5;

/** Snap step for slider handles, in percent (1%). */
export const SEGMENT_STEP_PCT = 1;

// ─── Segment math ───────────────────────────────────────────────────────────

/**
 * Enforce a minimum segment size on an array of fractional shares (0–1 each,
 * summing to 1).
 *
 * Algorithm: fix any segment below minFraction to exactly minFraction, then
 * redistribute the remaining budget proportionally among the unfixed segments.
 * Iterate until stable.  A single-element array always returns [1].
 */
export function enforceMinSegmentSize(
  shares: number[],
  minFraction = MIN_SEGMENT_PCT / 100,
): number[] {
  const n = shares.length;
  if (n === 0) return [];
  if (n === 1) return [1];
  // If all segments at minimum would exceed 1, just spread equally
  if (n * minFraction >= 1) return new Array(n).fill(1 / n);

  const result = [...shares];
  let changed = true;
  while (changed) {
    changed = false;
    const fixed: boolean[] = new Array(n).fill(false);
    let fixedTotal = 0;
    for (let i = 0; i < n; i++) {
      if (result[i] < minFraction - 1e-12) {
        result[i] = minFraction;
        fixed[i] = true;
        fixedTotal += minFraction;
        changed = true;
      }
    }
    if (!changed) break;
    // Redistribute the remaining budget proportionally among unfixed segments
    const remaining = 1 - fixedTotal;
    const freeSum = result.reduce((s, v, i) => s + (fixed[i] ? 0 : v), 0);
    if (freeSum <= 1e-12) {
      return new Array(n).fill(1 / n);
    }
    for (let i = 0; i < n; i++) {
      if (!fixed[i]) result[i] = (result[i] / freeSum) * remaining;
    }
  }
  return result;
}

/**
 * Snap a fractional value (0–1) to the nearest step multiple.
 * stepFraction defaults to SEGMENT_STEP_PCT / 100.
 */
export function snapToStep(
  value: number,
  stepFraction = SEGMENT_STEP_PCT / 100,
): number {
  if (stepFraction <= 0) return value;
  return Math.round(value / stepFraction) * stepFraction;
}

/**
 * Derive N fractional shares from N-1 handle positions (each in [0,1]).
 * handles[i] is the cumulative position after segment i.
 * shares[0] = handles[0]
 * shares[i] = handles[i] - handles[i-1]   for 0 < i < N-1
 * shares[N-1] = 1 - handles[N-2]
 */
export function sharesFromHandles(handles: number[]): number[] {
  if (handles.length === 0) return [1];
  const n = handles.length + 1;
  const result: number[] = new Array(n);
  result[0] = handles[0];
  for (let i = 1; i < n - 1; i++) {
    result[i] = handles[i] - handles[i - 1];
  }
  result[n - 1] = 1 - handles[n - 2];
  return result;
}

/**
 * Derive N-1 handle positions from N fractional shares.
 * Inverse of sharesFromHandles.
 */
export function handlesFromShares(shares: number[]): number[] {
  const n = shares.length;
  if (n <= 1) return [];
  const handles: number[] = new Array(n - 1);
  let cumulative = 0;
  for (let i = 0; i < n - 1; i++) {
    cumulative += shares[i];
    handles[i] = cumulative;
  }
  return handles;
}

/**
 * Clamp a handle position so the surrounding segments stay >= minFraction.
 * handleIndex is the index of the handle being moved (0-based).
 * Returns the clamped position.
 */
export function clampHandle(
  handleIndex: number,
  position: number,
  handles: number[],
  minFraction = MIN_SEGMENT_PCT / 100,
): number {
  const leftBound = handleIndex > 0 ? handles[handleIndex - 1] + minFraction : minFraction;
  const rightBound =
    handleIndex < handles.length - 1
      ? handles[handleIndex + 1] - minFraction
      : 1 - minFraction;
  return Math.max(leftBound, Math.min(rightBound, position));
}

// ─── Budget / ingredient allocation ─────────────────────────────────────────

/**
 * Compute the maximum weighted budget given target shares and inventory.
 *
 * For each selected tier with share > 0:
 *   tierBudget = availableCount * tierForgeWeight / share
 * maxBudget = min(tierBudget_i for all i)
 *
 * Returns 0 if any tier with positive share has no inventory (and dev mode is off).
 */
export function computeMaxBudget(
  selectedTiers: TierId[],
  shares: number[],
  inventory: Map<TierId, number>,
  isDevMode = false,
): number {
  let maxBudget = Infinity;
  for (let i = 0; i < selectedTiers.length; i++) {
    const share = shares[i];
    if (share <= 0) continue;
    const tierId = selectedTiers[i];
    const weight = getTierForgeWeight(tierId);
    const available = isDevMode ? 9999 : (inventory.get(tierId) ?? 0);
    maxBudget = Math.min(maxBudget, (available * weight) / share);
  }
  return maxBudget === Infinity ? 0 : maxBudget;
}

/**
 * Convert percentage shares and a power fraction into concrete refined crystal
 * ingredient counts, respecting inventory limits.
 *
 * Algorithm:
 *   1. Compute maxBudget (weighted total) from inventory + shares.
 *   2. Scale by powerFraction (0–1).
 *   3. For each tier: refinedCount = floor(budget * share / forgeWeight).
 *   4. Ensure at least 1 crystal when budget > 0 and share > 0.
 *   5. Clamp to available inventory (unless dev mode).
 */
export function allocateIngredients(
  selectedTiers: TierId[],
  shares: number[],
  inventory: Map<TierId, number>,
  powerFraction: number,
  isDevMode = false,
): CraftedWeaponIngredient[] {
  const maxBudget = computeMaxBudget(selectedTiers, shares, inventory, isDevMode);
  const budget = maxBudget * Math.max(0, Math.min(1, powerFraction));

  const result: CraftedWeaponIngredient[] = [];
  for (let i = 0; i < selectedTiers.length; i++) {
    const share = shares[i];
    if (share <= 0) continue;
    const tierId = selectedTiers[i];
    const weight = getTierForgeWeight(tierId);
    let count = Math.floor((budget * share) / weight);

    // Ensure at least 1 when there is budget and a nonzero share
    if (count === 0 && budget > 0) count = 1;

    // Clamp to inventory
    if (!isDevMode) {
      count = Math.min(count, inventory.get(tierId) ?? 0);
    }

    if (count > 0) {
      result.push({ tierId, refinedCount: count });
    }
  }
  return result;
}
