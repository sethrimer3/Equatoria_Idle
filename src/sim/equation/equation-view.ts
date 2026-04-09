/**
 * equation-view.ts — Equation view model and structured HTML builder
 *
 * Builds the display representation of the equation from state.
 * Used by both the canvas renderer and the DOM equation panel.
 */

import type { EquationState, TierEquationSegment } from './equation-state';
import { getUnlockedSegments } from './equation-state';
import { TIER_BY_ID } from '../../data/tiers';
import { EQUATION_ROLE_BY_TIER } from '../../data/equation';
import type { EquationRole } from '../../data/equation';

// ─── Structured equation view model ─────────────────────────────

/** A single piece of the equation display — tied to one tier. */
export interface EquationTermView {
  tierId: string;
  color: string;
  text: string;
  level: number;
  operator: EquationRole;
  /** Numeric parameter value for this tier's contribution. */
  paramValue: number;
}

/** Get the param value for a segment given its role. */
function getParamValue(seg: TierEquationSegment): number {
  const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
  if (!role) return 0;
  return role.baseValue + seg.level * role.valuePerLevel;
}

/** Format the display value for a tier's slot or wrapper parameter. */
function formatSlotValue(role: EquationRole, value: number): string {
  const v = Math.round(value * 100) / 100;
  const vi = Math.floor(value);

  switch (role) {
    case 'time_argument':
      return v === 1 ? 't' : `${vi}t`;
    case 'base_value':
      return String(vi);
    case 'additive_slot':
      return String(vi);
    case 'multiplier_slot':
      return String(vi);
    case 'exponent_slot':
      return String(vi);
    case 'summation_wrap':
      return `Σ(${vi})`;
    case 'product_wrap':
      return `Π(${vi})`;
    case 'factorial_wrap':
      return `Γ(${vi})`;
    case 'integral_wrap':
      return `∫(${v})`;
    case 'recursion_wrap':
      return `∞(${v})`;
    default:
      return String(v);
  }
}

/**
 * Build a view-model of the current equation for rendering.
 * Returns per-tier term views AND the structured HTML representation.
 */
export function buildEquationView(equationState: EquationState): EquationTermView[] {
  if (!equationState.isForgeUnlocked) return [];

  const terms: EquationTermView[] = [];
  for (const seg of getUnlockedSegments(equationState)) {
    const tier = TIER_BY_ID.get(seg.tierId);
    const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
    if (!tier || !role) continue;
    if (role.role === 'foundation') continue;

    const paramValue = getParamValue(seg);
    const text = formatSlotValue(role.role, paramValue);

    terms.push({
      tierId: seg.tierId,
      color: tier.color,
      text,
      level: seg.level,
      operator: role.role,
      paramValue,
    });
  }
  return terms;
}

/** Helper: create a colored span for an equation term. */
function termSpan(term: EquationTermView, text: string): string {
  return `<span class="eq-term" data-tier="${term.tierId}" style="color:${term.color}">${text}</span>`;
}

/**
 * Build the structured equation as HTML, nesting tiers properly.
 * The equation builds from inside out:
 *   innermost: Ruby base + Sunstone additive
 *   then: × Citrine multiplier
 *   then: ^ Emerald exponent
 *   then wrapped by Sapphire Σ, Iolite Π, Amethyst Γ, Diamond ∫, Nullstone ∞
 *   Quartz controls the time argument on the left: f(t), f(2t), f(3t)
 */
export function buildStructuredEquationHtml(terms: EquationTermView[]): string {
  if (terms.length === 0) return '';

  // Index terms by role for structured building
  const byRole = new Map<EquationRole, EquationTermView>();
  for (const t of terms) {
    byRole.set(t.operator, t);
  }

  // Build the f(…t) = prefix
  let prefix = '';
  const quartzTerm = byRole.get('time_argument');
  if (quartzTerm) {
    const argText = quartzTerm.paramValue === 1 ? 't' : `${Math.floor(quartzTerm.paramValue)}t`;
    prefix = `<span class="eq-prefix">f(</span><span class="eq-term" data-tier="${quartzTerm.tierId}" style="color:${quartzTerm.color}">${argText}</span><span class="eq-prefix">) = </span>`;
  } else {
    prefix = '<span class="eq-prefix">f(t) = </span>';
  }

  // Build core expression from inside out
  let core = '';

  // Ruby: first base value
  const rubyTerm = byRole.get('base_value');
  if (rubyTerm) {
    core = termSpan(rubyTerm, String(Math.floor(rubyTerm.paramValue)));
  }

  // Sunstone: + additive
  const sunstoneTerm = byRole.get('additive_slot');
  if (sunstoneTerm && core) {
    core = `${core} <span class="eq-term eq-operator" data-tier="${sunstoneTerm.tierId}" style="color:${sunstoneTerm.color}">+</span> ${termSpan(sunstoneTerm, String(Math.floor(sunstoneTerm.paramValue)))}`;
  }

  // Citrine: × multiplier — wrap in parens if both base and additive exist
  const citrineTerm = byRole.get('multiplier_slot');
  if (citrineTerm && core) {
    const needsParens = !!sunstoneTerm;
    const innerExpr = needsParens ? `(${core})` : core;
    core = `${innerExpr} <span class="eq-term eq-operator" data-tier="${citrineTerm.tierId}" style="color:${citrineTerm.color}">×</span> ${termSpan(citrineTerm, String(Math.floor(citrineTerm.paramValue)))}`;
  }

  // Emerald: ^exponent — wrap everything so far
  const emeraldTerm = byRole.get('exponent_slot');
  if (emeraldTerm && core) {
    const needsParens = !!citrineTerm || !!sunstoneTerm;
    const innerExpr = needsParens ? `(${core})` : core;
    core = `${innerExpr}<sup class="eq-term" data-tier="${emeraldTerm.tierId}" style="color:${emeraldTerm.color}">${Math.floor(emeraldTerm.paramValue)}</sup>`;
  }

  // If no core yet (only Quartz is unlocked), show dormant
  if (!core) {
    return prefix + '<span class="eq-dormant">…</span>';
  }

  // Apply wrapper tiers from inside out
  // Sapphire: Σ
  const sapphireTerm = byRole.get('summation_wrap');
  if (sapphireTerm) {
    core = `<span class="eq-term" data-tier="${sapphireTerm.tierId}" style="color:${sapphireTerm.color}">Σ</span><sub class="eq-term" data-tier="${sapphireTerm.tierId}" style="color:${sapphireTerm.color};font-size:0.6em">k=1</sub><sup class="eq-term" data-tier="${sapphireTerm.tierId}" style="color:${sapphireTerm.color};font-size:0.7em">${Math.floor(sapphireTerm.paramValue)}</sup>(${core})`;
  }

  // Iolite: Π
  const ioliteTerm = byRole.get('product_wrap');
  if (ioliteTerm) {
    core = `<span class="eq-term" data-tier="${ioliteTerm.tierId}" style="color:${ioliteTerm.color}">Π</span><sub class="eq-term" data-tier="${ioliteTerm.tierId}" style="color:${ioliteTerm.color};font-size:0.6em">j=1</sub><sup class="eq-term" data-tier="${ioliteTerm.tierId}" style="color:${ioliteTerm.color};font-size:0.7em">${Math.floor(ioliteTerm.paramValue)}</sup>(${core})`;
  }

  // Amethyst: factorial/gamma
  const amethystTerm = byRole.get('factorial_wrap');
  if (amethystTerm) {
    core = `<span class="eq-term" data-tier="${amethystTerm.tierId}" style="color:${amethystTerm.color}">Γ</span>(${core})<span class="eq-term" data-tier="${amethystTerm.tierId}" style="color:${amethystTerm.color}">!</span>`;
  }

  // Diamond: ∫ integration
  const diamondTerm = byRole.get('integral_wrap');
  if (diamondTerm) {
    const integralVal = Math.round(diamondTerm.paramValue * 100) / 100;
    core = `<span class="eq-term" data-tier="${diamondTerm.tierId}" style="color:${diamondTerm.color}">∫</span><sub class="eq-term" data-tier="${diamondTerm.tierId}" style="color:${diamondTerm.color};font-size:0.6em">0</sub><sup class="eq-term" data-tier="${diamondTerm.tierId}" style="color:${diamondTerm.color};font-size:0.7em">${integralVal}</sup>(${core}) <span class="eq-term" data-tier="${diamondTerm.tierId}" style="color:${diamondTerm.color}">dt</span>`;
  }

  // Nullstone: recursion / self-reference
  const nullstoneTerm = byRole.get('recursion_wrap');
  if (nullstoneTerm) {
    const recVal = Math.round(nullstoneTerm.paramValue * 100) / 100;
    core = `<span class="eq-term" data-tier="${nullstoneTerm.tierId}" style="color:${nullstoneTerm.color}">lim</span><sub class="eq-term" data-tier="${nullstoneTerm.tierId}" style="color:${nullstoneTerm.color};font-size:0.6em">n→${recVal}</sub>(${core})`;
  }

  return prefix + core;
}
