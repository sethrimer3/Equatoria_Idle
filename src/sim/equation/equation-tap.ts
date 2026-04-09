/**
 * equation-tap.ts — Tap value computation
 *
 * Computes per-tier mote gains for manual and auto taps.
 * Pure functions — no side effects, no rendering.
 */

import type { EquationState, TierEquationSegment } from './equation-state';
import { getUnlockedSegments } from './equation-state';
import { TIER_BY_ID, type TierId } from '../../data/tiers';
import { EQUATION_ROLE_BY_TIER } from '../../data/equation';
import {
  BASE_TAP_VALUE,
  UPGRADE_TAP_MULTIPLIER,
} from '../../data/balance';

// ─── Tap value computation ──────────────────────────────────────

/** Motes produced by a single tap for one tier segment. */
export function segmentTapValue(seg: TierEquationSegment): number {
  return BASE_TAP_VALUE + seg.level * UPGRADE_TAP_MULTIPLIER;
}

/**
 * Compute per-tier mote gains for a single tap.
 * Only produces gains if the forge is unlocked.
 * Returns a Map of tierId → motes generated.
 */
export function computeTapGains(
  equationState: EquationState,
  globalMultiplier: number,
): Map<TierId, number> {
  const gains = new Map<TierId, number>();
  if (!equationState.isForgeUnlocked) return gains;

  for (const seg of getUnlockedSegments(equationState)) {
    const tier = TIER_BY_ID.get(seg.tierId);
    if (!tier) continue;
    const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
    if (role && role.role === 'foundation') continue;

    const value = segmentTapValue(seg) * globalMultiplier;
    gains.set(seg.tierId, value);
  }
  return gains;
}
