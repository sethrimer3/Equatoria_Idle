/**
 * equation-logic.ts — Re-export barrel for backward compatibility.
 *
 * The equation logic has been split into three focused modules:
 *   - equation-tap.ts   — tap value computation
 *   - equation-eval.ts  — equation output evaluator
 */

export { segmentTapValue, computeTapGains } from './equation-tap';
export { computeEquationOutput } from './equation-eval';
