/**
 * Aliven system — tracks which mote types have been "alivened".
 *
 * Until a mote type is alivened, its particles are fully inert in the
 * Particle Life simulation (they neither exert nor receive PL forces).
 *
 * Rules:
 *   - Only the first 11 tiers (unlockOrder 0–10, up to Nullstone) can be alivened.
 *   - Fracteryl (index 11) and Eigenstein (index 12) are end-game and cannot be alivened.
 *   - Each aliven costs ALIVEN_COST motes of that tier's own type.
 *   - The interaction matrix grows: n alivened tiers → n×n visible matrix.
 */

import type { TierId } from '../../data/tiers';
import { TIER_BY_ID } from '../../data/tiers';
import type { ResourceState } from '../resources';
import { getMotes, spendMotes } from '../resources';

// ─── Constants ───────────────────────────────────────────────────

/** Maximum unlock order that can be alivened (Nullstone = 10). */
export const MAX_ALIVENEABLE_UNLOCK_ORDER = 10;

/** Mote cost (of own type) to aliven a mote type. */
export const ALIVEN_COST = 10_000;

// ─── State ───────────────────────────────────────────────────────

export interface AlivenState {
  /** Set of tier IDs that have been alivened. */
  alivenedTierIds: Set<TierId>;
}

export function createAlivenState(): AlivenState {
  return { alivenedTierIds: new Set() };
}

// ─── Queries ─────────────────────────────────────────────────────

/** Returns true if the given tier can potentially be alivened (is within the aliveneable range). */
export function isTierAliveneable(tierId: TierId): boolean {
  const tier = TIER_BY_ID.get(tierId);
  return tier !== undefined && tier.unlockOrder <= MAX_ALIVENEABLE_UNLOCK_ORDER;
}

/** Returns true if the given tier has already been alivened. */
export function isAlivened(state: AlivenState, tierId: TierId): boolean {
  return state.alivenedTierIds.has(tierId);
}

/**
 * Returns whether the player can afford to aliven the given tier.
 * Does NOT check if already alivened — call isAlivened first.
 */
export function canAffordAliven(resources: ResourceState, tierId: TierId): boolean {
  return getMotes(resources, tierId) >= ALIVEN_COST;
}

/** Returns the number of currently alivened tiers (i.e. the matrix side length). */
export function getAlivenCount(state: AlivenState): number {
  return state.alivenedTierIds.size;
}

/**
 * Returns an ordered array of alivened tier IDs, sorted by unlockOrder ascending.
 * This defines the row/column order in the interaction matrix display.
 */
export function getAlivenedTiersOrdered(state: AlivenState): TierId[] {
  const ids = Array.from(state.alivenedTierIds);
  ids.sort((a, b) => {
    const orderA = TIER_BY_ID.get(a)?.unlockOrder ?? 0;
    const orderB = TIER_BY_ID.get(b)?.unlockOrder ?? 0;
    return orderA - orderB;
  });
  return ids;
}

// ─── Mutation ────────────────────────────────────────────────────

/**
 * Try to aliven the given mote type.
 * Returns true on success, false if already alivened, ineligible, or can't afford.
 *
 * @param bypassCost  Developer mode flag — skips cost check and deduction.
 */
export function tryAliven(
  state: AlivenState,
  resources: ResourceState,
  tierId: TierId,
  bypassCost = false,
): boolean {
  if (!isTierAliveneable(tierId)) return false;
  if (isAlivened(state, tierId)) return false;
  if (!bypassCost && !canAffordAliven(resources, tierId)) return false;

  if (!bypassCost) {
    spendMotes(resources, tierId, ALIVEN_COST);
  }
  state.alivenedTierIds.add(tierId);
  return true;
}
