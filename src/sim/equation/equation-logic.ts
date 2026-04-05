import type { EquationState, TierEquationSegment } from './equation-state';
import { getUnlockedSegments } from './equation-state';
import { TIER_BY_ID, type TierId } from '../../data/tiers';
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
 * Returns a Map of tierId → motes generated.
 */
export function computeTapGains(
  equationState: EquationState,
  globalMultiplier: number,
): Map<TierId, number> {
  const gains = new Map<TierId, number>();
  for (const seg of getUnlockedSegments(equationState)) {
    const tier = TIER_BY_ID.get(seg.tierId);
    if (!tier) continue;
    const value = segmentTapValue(seg) * globalMultiplier;
    gains.set(seg.tierId, value);
  }
  return gains;
}

// ─── Equation display model ─────────────────────────────────────

export interface EquationTermView {
  tierId: TierId;
  color: string;
  text: string;
  level: number;
}

/**
 * Build a view-model of the current equation for rendering.
 * The equation looks like:  Σ = (redVal) + (orangeVal) + ...
 * Each term's "value" is the tap value for that tier.
 */
export function buildEquationView(equationState: EquationState): EquationTermView[] {
  const terms: EquationTermView[] = [];
  for (const seg of getUnlockedSegments(equationState)) {
    const tier = TIER_BY_ID.get(seg.tierId);
    if (!tier) continue;
    const val = segmentTapValue(seg);
    // Build increasingly complex expression as level grows
    const text = formatSegmentExpression(seg.level, val);
    terms.push({
      tierId: seg.tierId,
      color: tier.color,
      text,
      level: seg.level,
    });
  }
  return terms;
}

/**
 * Format a single segment's expression.
 * As level increases, the expression becomes more complex:
 *   level 0: "1"
 *   level 1-4: "1 + n"  (additive)
 *   level 5-9: "n × 2"  (multiplicative style shown)
 *   level 10+: "n²"     (power notation teaser)
 */
function formatSegmentExpression(level: number, value: number): string {
  const v = Math.floor(value * 100) / 100; // clean display
  if (level === 0) return '1';
  if (level < 5) return `${v}`;
  if (level < 10) return `${v}`;
  return `${v}`;
}
