/**
 * Equation tier roles — defines what each gemstone tier contributes
 * to the central equation f(t).
 *
 * This is the single source of truth for the mathematical meaning of each tier.
 */

import type { TierId } from '../tiers';

/** The mathematical operator type a tier introduces. */
export type EquationOperator =
  | 'foundation'     // Sand: pre-equation, base substrate
  | 'passive_time'   // Quartz: r·t passive term
  | 'manual_input'   // Ruby: x tap variable
  | 'addition'       // Sunstone: combines terms with +
  | 'multiplication' // Citrine: multiplier m
  | 'exponentiation' // Emerald: power ^p
  | 'summation'      // Sapphire: Σ notation
  | 'product'        // Iolite: Π notation
  | 'factorial'      // Amethyst: factorial/gamma
  | 'integration'    // Diamond: ∫ accumulation
  | 'recursion';     // Nullstone: self-reference/limit

/** The role a tier plays in the equation system. */
export interface EquationTierRole {
  readonly tierId: TierId;
  readonly operator: EquationOperator;
  /** Variable symbol used in the equation display. */
  readonly symbol: string;
  /** Human-readable description of what this tier adds. */
  readonly roleDescription: string;
  /** The initial value of the tier's parameter when first unlocked. */
  readonly baseValue: number;
  /** How much each equation upgrade increases the parameter. */
  readonly valuePerLevel: number;
}

/** All equation tier roles in canonical order. */
export const EQUATION_TIER_ROLES: readonly EquationTierRole[] = [
  {
    tierId: 'sand',
    operator: 'foundation',
    symbol: '',
    roleDescription: 'Foundation — unlocks the Equation Forge',
    baseValue: 0,
    valuePerLevel: 0,
  },
  {
    tierId: 'quartz',
    operator: 'passive_time',
    symbol: 'r',
    roleDescription: 'Adds passive time-based generation: r·t',
    baseValue: 1,
    valuePerLevel: 0.5,
  },
  {
    tierId: 'ruby',
    operator: 'manual_input',
    symbol: 'x',
    roleDescription: 'Adds manual tap input variable: x',
    baseValue: 1,
    valuePerLevel: 1,
  },
  {
    tierId: 'sunstone',
    operator: 'addition',
    symbol: '+',
    roleDescription: 'Combines equation terms with addition',
    baseValue: 1,
    valuePerLevel: 0.5,
  },
  {
    tierId: 'citrine',
    operator: 'multiplication',
    symbol: 'm',
    roleDescription: 'Multiplies the combined expression: ×m',
    baseValue: 2,
    valuePerLevel: 0.5,
  },
  {
    tierId: 'emerald',
    operator: 'exponentiation',
    symbol: 'p',
    roleDescription: 'Raises the expression to a power: ^p',
    baseValue: 2,
    valuePerLevel: 0.1,
  },
  {
    tierId: 'sapphire',
    operator: 'summation',
    symbol: 'Σ',
    roleDescription: 'Sums across multiple sub-terms: Σ',
    baseValue: 2,
    valuePerLevel: 1,
  },
  {
    tierId: 'iolite',
    operator: 'product',
    symbol: 'Π',
    roleDescription: 'Multiplies grouped sub-terms: Π',
    baseValue: 2,
    valuePerLevel: 1,
  },
  {
    tierId: 'amethyst',
    operator: 'factorial',
    symbol: '!',
    roleDescription: 'Applies factorial/combinatorial growth',
    baseValue: 3,
    valuePerLevel: 1,
  },
  {
    tierId: 'diamond',
    operator: 'integration',
    symbol: '∫',
    roleDescription: 'Integrates historical accumulation over time',
    baseValue: 1,
    valuePerLevel: 0.5,
  },
  {
    tierId: 'nullstone',
    operator: 'recursion',
    symbol: '∞',
    roleDescription: 'Transcendent recursion and self-reference',
    baseValue: 1,
    valuePerLevel: 0.25,
  },
];

/** Quick lookup by tier ID. */
export const EQUATION_ROLE_BY_TIER: ReadonlyMap<TierId, EquationTierRole> = new Map(
  EQUATION_TIER_ROLES.map(r => [r.tierId, r]),
);
