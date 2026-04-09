/**
 * Equation tier roles — defines what each gemstone tier contributes
 * to the central equation f(t).
 *
 * The equation is a structured nested expression, NOT a flat list of appended terms.
 * Each tier either:
 *   - modifies a specific slot value (slot tiers: Ruby, Sunstone, Citrine, Emerald)
 *   - wraps the current expression in a new mathematical layer (wrapper tiers)
 *   - modifies the left-side function argument (Quartz: time argument)
 *
 * This is the single source of truth for the mathematical meaning of each tier.
 */

import type { TierId } from '../tiers';

/** How a tier interacts with the equation structure. */
export type EquationRole =
  | 'foundation'       // Sand: pre-equation, forge unlock
  | 'time_argument'    // Quartz: controls f(t) → f(2t) → f(3t)
  | 'base_value'       // Ruby: first additive slot value
  | 'additive_slot'    // Sunstone: second additive slot value
  | 'multiplier_slot'  // Citrine: wraps addition in (…) × m
  | 'exponent_slot'    // Emerald: wraps multiplied expr in (…)^p
  | 'summation_wrap'   // Sapphire: wraps in Σ
  | 'product_wrap'     // Iolite: wraps in Π
  | 'factorial_wrap'   // Amethyst: wraps in factorial/gamma
  | 'integral_wrap'    // Diamond: wraps in ∫ accumulation
  | 'recursion_wrap';  // Nullstone: wraps in self-referential layer

/** Whether a tier modifies a slot or wraps the entire expression. */
export type EquationInteraction = 'slot' | 'wrapper' | 'argument' | 'foundation';

// Keep backward-compatible alias used in a few legacy spots
export type EquationOperator = EquationRole;

/** The role a tier plays in the equation system. */
export interface EquationTierRole {
  readonly tierId: TierId;
  readonly role: EquationRole;
  readonly interaction: EquationInteraction;
  /** Kept for backward compatibility with code referencing .operator */
  readonly operator: EquationRole;
  /** Symbol displayed in the equation for this tier's contribution. */
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
    role: 'foundation',
    interaction: 'foundation',
    operator: 'foundation',
    symbol: '',
    roleDescription: 'Foundation — unlocks the Equation Forge',
    baseValue: 0,
    valuePerLevel: 0,
  },
  {
    tierId: 'quartz',
    role: 'time_argument',
    interaction: 'argument',
    operator: 'time_argument',
    symbol: 't',
    roleDescription: 'Controls the time argument: f(t) → f(2t) → f(3t)',
    baseValue: 1,
    valuePerLevel: 1,
  },
  {
    tierId: 'ruby',
    role: 'base_value',
    interaction: 'slot',
    operator: 'base_value',
    symbol: '',
    roleDescription: 'First base value in the equation',
    baseValue: 1,
    valuePerLevel: 1,
  },
  {
    tierId: 'sunstone',
    role: 'additive_slot',
    interaction: 'slot',
    operator: 'additive_slot',
    symbol: '+',
    roleDescription: 'Second additive value: base + additive',
    baseValue: 1,
    valuePerLevel: 1,
  },
  {
    tierId: 'citrine',
    role: 'multiplier_slot',
    interaction: 'slot',
    operator: 'multiplier_slot',
    symbol: '×',
    roleDescription: 'Multiplier wrapping the additive core: (…) × m',
    baseValue: 1,
    valuePerLevel: 1,
  },
  {
    tierId: 'emerald',
    role: 'exponent_slot',
    interaction: 'slot',
    operator: 'exponent_slot',
    symbol: '^',
    roleDescription: 'Exponent raising the multiplied expression: (…)^p',
    baseValue: 1,
    valuePerLevel: 1,
  },
  {
    tierId: 'sapphire',
    role: 'summation_wrap',
    interaction: 'wrapper',
    operator: 'summation_wrap',
    symbol: 'Σ',
    roleDescription: 'Summation wrapping the entire expression',
    baseValue: 2,
    valuePerLevel: 1,
  },
  {
    tierId: 'iolite',
    role: 'product_wrap',
    interaction: 'wrapper',
    operator: 'product_wrap',
    symbol: 'Π',
    roleDescription: 'Product notation wrapping the expression',
    baseValue: 2,
    valuePerLevel: 1,
  },
  {
    tierId: 'amethyst',
    role: 'factorial_wrap',
    interaction: 'wrapper',
    operator: 'factorial_wrap',
    symbol: 'Γ',
    roleDescription: 'Factorial/gamma combinatorial transformation',
    baseValue: 3,
    valuePerLevel: 1,
  },
  {
    tierId: 'diamond',
    role: 'integral_wrap',
    interaction: 'wrapper',
    operator: 'integral_wrap',
    symbol: '∫',
    roleDescription: 'Integration — historical accumulation over time',
    baseValue: 1,
    valuePerLevel: 0.5,
  },
  {
    tierId: 'nullstone',
    role: 'recursion_wrap',
    interaction: 'wrapper',
    operator: 'recursion_wrap',
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
