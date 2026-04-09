/**
 * equation-logic.ts — Re-export barrel for backward compatibility.
 *
 * The equation logic has been split into three focused modules:
 *   - equation-tap.ts   — tap value computation
 *   - equation-view.ts  — view model + structured HTML builder
 *   - equation-eval.ts  — equation output evaluator
 */

export { segmentTapValue, computeTapGains } from './equation-tap';
export { buildEquationView, buildStructuredEquationHtml } from './equation-view';
export type { EquationTermView } from './equation-view';
export { computeEquationOutput } from './equation-eval';
