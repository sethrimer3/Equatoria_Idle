export {
  createEquationState,
  applyEquationUpgrade,
  unlockTier,
  incrementTapCount,
  getSegment,
  getUnlockedSegments,
  unlockForge,
} from './equation-state';
export type { EquationState, TierEquationSegment } from './equation-state';

export {
  segmentTapValue,
  computeTapGains,
  buildEquationView,
  buildStructuredEquationHtml,
  computeEquationOutput,
} from './equation-logic';
export type { EquationTermView } from './equation-logic';
