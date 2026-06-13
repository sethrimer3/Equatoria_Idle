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
  computeEquationOutput,
} from './equation-logic';
