import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';
import { MERGE_THRESHOLD } from '../../data/particles/size-tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';

// ─── Types ──────────────────────────────────────────────────────

/** Authoritative resource totals. */
export interface ResourceState {
  /** Per-tier mote totals. */
  moteTotals: Map<TierId, number>;
  /** Per-tier lifetime motes earned (never decremented). */
  lifetimeMotes: Map<TierId, number>;
}

// ─── Factory ────────────────────────────────────────────────────

export function createResourceState(): ResourceState {
  const moteTotals = new Map<TierId, number>();
  const lifetimeMotes = new Map<TierId, number>();
  for (const t of TIERS) {
    moteTotals.set(t.id, 0);
    lifetimeMotes.set(t.id, 0);
  }
  return { moteTotals, lifetimeMotes };
}

// ─── Queries ────────────────────────────────────────────────────

export function getMotes(state: ResourceState, tierId: TierId): number {
  return state.moteTotals.get(tierId) ?? 0;
}

export function getLifetimeMotes(state: ResourceState, tierId: TierId): number {
  return state.lifetimeMotes.get(tierId) ?? 0;
}

/** Total motes across all tiers (sum). Used as basic "score". */
export function getTotalMotes(state: ResourceState): number {
  let total = 0;
  for (const v of state.moteTotals.values()) {
    total += v;
  }
  return total;
}

/**
 * Equivalence score: product of all per-tier mote totals that are > 0.
 * Early game (only one tier) it equals that tier's total; once multiple
 * tiers have motes it grows multiplicatively.
 */
export function getEquivalence(state: ResourceState): number {
  let equivalence = 1;
  let hasAny = false;
  for (const v of state.moteTotals.values()) {
    if (v <= 0) continue;
    hasAny = true;
    equivalence *= v;
  }
  return hasAny ? equivalence : 0;
}

// ─── Mutations ──────────────────────────────────────────────────

export function addMotes(state: ResourceState, tierId: TierId, amount: number): void {
  const current = state.moteTotals.get(tierId) ?? 0;
  state.moteTotals.set(tierId, current + amount);

  const lifetime = state.lifetimeMotes.get(tierId) ?? 0;
  state.lifetimeMotes.set(tierId, lifetime + amount);
}

export function spendMotes(state: ResourceState, tierId: TierId, amount: number): boolean {
  const current = state.moteTotals.get(tierId) ?? 0;
  if (current < amount) return false;
  state.moteTotals.set(tierId, current - amount);
  return true;
}

// ─── Size-based utilities ────────────────────────────────────────

/**
 * Convert a non-negative float total to a base-MERGE_THRESHOLD size count map.
 * Only floor(total) is encoded; any fractional part is discarded.
 *
 * E.g., totalToSizeCounts(350.7) → Map { 0 → 50, 1 → 3 }
 *   because 350 in base-100 is 3×100¹ + 50×100⁰.
 */
export function totalToSizeCounts(total: number): Map<SizeIndex, number> {
  const counts = new Map<SizeIndex, number>();
  let remaining = Math.floor(Math.max(0, total));
  let s = 0;
  while (remaining > 0) {
    const digit = remaining % MERGE_THRESHOLD;
    if (digit > 0) counts.set(s, digit);
    remaining = Math.floor(remaining / MERGE_THRESHOLD);
    s++;
  }
  return counts;
}

/**
 * Convert size counts back to a float total.
 * E.g., sizeCountsToTotal(Map { 0 → 50, 1 → 3 }) → 350
 */
export function sizeCountsToTotal(counts: Map<SizeIndex, number>): number {
  let total = 0;
  for (const [s, count] of counts) {
    total += count * Math.pow(MERGE_THRESHOLD, s);
  }
  return total;
}

/**
 * Low-graphics mote filter: for each tier, render only the largest non-zero size.
 * If the only motes are 1×1 (SizeIndex 0), those are returned.
 *
 * This is a visual-only operation — it does not modify any inventory.
 *
 * @param sizeCounts  Map<SizeIndex, count> for a single tier.
 * @returns           A new Map containing only the single largest-size entry.
 *                    Returns an empty Map if sizeCounts is empty.
 */
export function filterMotesForLowGraphics(
  sizeCounts: Map<SizeIndex, number>,
): Map<SizeIndex, number> {
  let largestSize = -1;
  for (const [s, count] of sizeCounts) {
    if (count > 0 && s > largestSize) {
      largestSize = s;
    }
  }
  if (largestSize < 0) return new Map();
  return new Map([[largestSize, sizeCounts.get(largestSize)!]]);
}
