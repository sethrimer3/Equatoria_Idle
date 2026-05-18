import type { ForgeCrunchState } from '../../sim/forge/forge-state';

export interface ForgeAudioTransitionEvents {
  forgeCrunchStarted: boolean;
  forgeSpinUpBegan: boolean;
  forgeSpinUpCancelled: boolean;
}

export interface ForgeAudioTransitionState {
  isNowSpinningUp: boolean;
  isCrunchNowActive: boolean;
}

/**
 * Computes one-frame forge audio transition events from crunch state transitions.
 */
export function computeForgeAudioTransitions(
  crunchState: ForgeCrunchState,
  nowMs: number,
  wasSpinningUp: boolean,
  wasCrunchActive: boolean,
  spinUpThresholdMs: number,
): ForgeAudioTransitionEvents & ForgeAudioTransitionState {
  const isNowSpinningUp = (
    crunchState.validParticlesTimerMs !== null &&
    !crunchState.isActive &&
    (nowMs - crunchState.validParticlesTimerMs >= spinUpThresholdMs)
  );
  const isCrunchNowActive = crunchState.isActive;

  const forgeCrunchStarted = !wasCrunchActive && isCrunchNowActive;
  const forgeSpinUpBegan = !wasSpinningUp && isNowSpinningUp;
  const forgeSpinUpCancelled = wasSpinningUp && !isNowSpinningUp && !forgeCrunchStarted;

  return {
    forgeCrunchStarted,
    forgeSpinUpBegan,
    forgeSpinUpCancelled,
    isNowSpinningUp,
    isCrunchNowActive,
  };
}
