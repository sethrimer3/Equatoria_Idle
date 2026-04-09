import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';

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
