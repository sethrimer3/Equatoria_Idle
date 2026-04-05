export {
  createEquationState,
  applyEquationUpgrade,
  unlockTier,
  incrementTapCount,
  getSegment,
  getUnlockedSegments,
} from './equation-state';
export type { EquationState, TierEquationSegment } from './equation-state';

export {
  segmentTapValue,
  computeTapGains,
  buildEquationView,
} from './equation-logic';
export type { EquationTermView } from './equation-logic';
