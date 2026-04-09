/**
 * equation-eval.ts — Equation output evaluator
 *
 * Evaluates the structured nested equation for scoring and display.
 * Pure function — no side effects.
 */

import type { EquationState } from './equation-state';
import { getUnlockedSegments } from './equation-state';
import { EQUATION_ROLE_BY_TIER } from '../../data/equation';
import type { TierEquationSegment } from './equation-state';

/** Maximum seconds of passive time used in equation output calculation. */
const MAX_PASSIVE_TIME_SEC = 3600;

/** Cap on factorial base to prevent numerical overflow. */
const MAX_FACTORIAL_BASE = 20;

/** Get the param value for a segment given its role. */
function getParamValue(seg: TierEquationSegment): number {
  const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
  if (!role) return 0;
  return role.baseValue + seg.level * role.valuePerLevel;
}

/**
 * Compute the total equation output value for display and scoring.
 * Evaluates the structured nested equation based on unlocked tiers.
 */
export function computeEquationOutput(
  equationState: EquationState,
  elapsedSec: number,
  _tapCount: number,
  globalMultiplier: number,
): number {
  if (!equationState.isForgeUnlocked) return 0;

  // Collect parameters by role
  let timeScale = 1;
  let baseValue = 0;
  let additiveValue = 0;
  let multiplierValue = 1;
  let exponentValue = 1;
  let sumCount = 1;
  let productCount = 1;
  let factorialBase = 0;
  let integralFactor = 0;
  let recursionFactor = 0;

  let hasBase = false;

  for (const seg of getUnlockedSegments(equationState)) {
    const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
    if (!role) continue;
    const paramValue = getParamValue(seg);

    switch (role.role) {
      case 'time_argument':
        timeScale = paramValue;
        break;
      case 'base_value':
        baseValue = paramValue;
        hasBase = true;
        break;
      case 'additive_slot':
        additiveValue = paramValue;
        break;
      case 'multiplier_slot':
        multiplierValue = paramValue;
        break;
      case 'exponent_slot':
        exponentValue = paramValue;
        break;
      case 'summation_wrap':
        sumCount = Math.floor(paramValue);
        break;
      case 'product_wrap':
        productCount = Math.floor(paramValue);
        break;
      case 'factorial_wrap':
        factorialBase = Math.floor(paramValue);
        break;
      case 'integral_wrap':
        integralFactor = paramValue;
        break;
      case 'recursion_wrap':
        recursionFactor = paramValue;
        break;
      default:
        break;
    }
  }

  if (!hasBase) return 0;

  // Build equation: ((base + additive) × multiplier) ^ exponent
  let coreValue = (baseValue + additiveValue) * multiplierValue;
  coreValue = Math.pow(Math.max(coreValue, 1), exponentValue);

  // Apply wrappers
  coreValue *= sumCount;
  coreValue *= productCount;

  if (factorialBase > 0) {
    let fact = 1;
    for (let i = 2; i <= Math.min(factorialBase, MAX_FACTORIAL_BASE); i++) fact *= i;
    coreValue *= fact;
  }

  if (integralFactor > 0) {
    coreValue += integralFactor * Math.min(elapsedSec, MAX_PASSIVE_TIME_SEC) * 0.01;
  }

  if (recursionFactor > 0) {
    coreValue *= (1 + recursionFactor * 0.1);
  }

  // Quartz time scale applied once as a global factor
  coreValue *= timeScale;

  return coreValue * globalMultiplier;
}
