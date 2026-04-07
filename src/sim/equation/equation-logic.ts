import type { EquationState, TierEquationSegment } from './equation-state';
import { getUnlockedSegments } from './equation-state';
import { TIER_BY_ID, type TierId } from '../../data/tiers';
import { EQUATION_ROLE_BY_TIER } from '../../data/equation';
import type { EquationOperator } from '../../data/equation';
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
    // Sand doesn't produce via equation tap (it's foundation only)
    const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
    if (role && role.operator === 'foundation') continue;

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
  operator: EquationOperator;
}

/**
 * Build a view-model of the current equation for rendering.
 * The equation is displayed as f(t) = <structured expression>
 * Each tier adds a specific mathematical layer.
 */
export function buildEquationView(equationState: EquationState): EquationTermView[] {
  if (!equationState.isForgeUnlocked) return [];

  const terms: EquationTermView[] = [];
  for (const seg of getUnlockedSegments(equationState)) {
    const tier = TIER_BY_ID.get(seg.tierId);
    const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
    if (!tier || !role) continue;
    // Sand is foundation — doesn't appear in equation
    if (role.operator === 'foundation') continue;

    const paramValue = role.baseValue + seg.level * role.valuePerLevel;
    const text = formatTierExpression(role.operator, paramValue, seg.level, role.symbol);

    terms.push({
      tierId: seg.tierId,
      color: tier.color,
      text,
      level: seg.level,
      operator: role.operator,
    });
  }
  return terms;
}

/**
 * Format the expression fragment for a specific tier's operator.
 */
function formatTierExpression(
  operator: EquationOperator,
  value: number,
  _level: number,
  symbol: string,
): string {
  const v = Math.round(value * 100) / 100;

  switch (operator) {
    case 'passive_time':
      return `${v}${symbol}·t`;
    case 'manual_input':
      return `${v}${symbol}`;
    case 'addition':
      return '+';
    case 'multiplication':
      return `× ${v}`;
    case 'exponentiation':
      return `^ ${v}`;
    case 'summation':
      return `Σ(${Math.floor(v)})`;
    case 'product':
      return `Π(${Math.floor(v)})`;
    case 'factorial':
      return `${Math.floor(v)}!`;
    case 'integration':
      return `∫${v}dt`;
    case 'recursion':
      return `f(f) · ${v}`;
    default:
      return String(v);
  }
}

/**
 * Compute the total equation output value for display and scoring.
 * This evaluates the structured equation based on unlocked tiers.
 */
export function computeEquationOutput(
  equationState: EquationState,
  elapsedSec: number,
  tapCount: number,
  globalMultiplier: number,
): number {
  if (!equationState.isForgeUnlocked) return 0;

  let baseTerms = 0;
  let hasPassive = false;
  let hasManual = false;
  let multiplier = 1;
  let exponent = 1;
  let sumTermCount = 1;
  let productTermCount = 1;
  let factorialBase = 0;
  let integralFactor = 0;
  let recursionFactor = 0;

  for (const seg of getUnlockedSegments(equationState)) {
    const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
    if (!role) continue;
    const paramValue = role.baseValue + seg.level * role.valuePerLevel;

    switch (role.operator) {
      case 'passive_time':
        baseTerms += paramValue * Math.min(elapsedSec, 3600);
        hasPassive = true;
        break;
      case 'manual_input':
        baseTerms += paramValue * tapCount;
        hasManual = true;
        break;
      case 'addition':
        baseTerms += paramValue;
        break;
      case 'multiplication':
        multiplier *= paramValue;
        break;
      case 'exponentiation':
        exponent = paramValue;
        break;
      case 'summation':
        sumTermCount = Math.floor(paramValue);
        break;
      case 'product':
        productTermCount = Math.floor(paramValue);
        break;
      case 'factorial':
        factorialBase = Math.floor(paramValue);
        break;
      case 'integration':
        integralFactor = paramValue;
        break;
      case 'recursion':
        recursionFactor = paramValue;
        break;
      default:
        break;
    }
  }

  if (!hasPassive && !hasManual) return 0;

  let result = baseTerms * multiplier;
  result = Math.pow(Math.max(result, 1), exponent);
  result *= sumTermCount;
  result *= productTermCount;

  if (factorialBase > 0) {
    let fact = 1;
    for (let i = 2; i <= Math.min(factorialBase, 20); i++) fact *= i;
    result *= fact;
  }

  if (integralFactor > 0) {
    result += integralFactor * elapsedSec * 0.01;
  }

  if (recursionFactor > 0) {
    result *= (1 + recursionFactor * 0.1);
  }

  return result * globalMultiplier;
}
