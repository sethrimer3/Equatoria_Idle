export interface ForgeCrunchState {
  validParticlesTimerMs: number | null;
  isActive: boolean;
  progress: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
}

export function createForgeCrunchState(): ForgeCrunchState {
  return {
    validParticlesTimerMs: null,
    isActive: false,
    progress: 0,
    startTimeMs: null,
    endTimeMs: null,
  };
}

export function getForgeRotationMultiplier(
  state: ForgeCrunchState,
  nowMs: number,
  forgeValidWaitTimeMs: number,
  spinUpDurationMs: number,
  spinDownDurationMs: number,
): number {
  if (state.endTimeMs !== null) {
    const timeSinceEnd = nowMs - state.endTimeMs;
    if (timeSinceEnd < spinDownDurationMs) {
      const progress = timeSinceEnd / spinDownDurationMs;
      const easeOut = 1 - Math.pow(1 - progress, 2);
      return 3 - 2 * easeOut;
    } else {
      return 1;
    }
  }
  if (state.isActive) return 3;
  if (state.validParticlesTimerMs !== null) {
    const elapsed = nowMs - state.validParticlesTimerMs;
    const timeUntilCrunch = forgeValidWaitTimeMs - elapsed;
    if (timeUntilCrunch <= spinUpDurationMs) {
      const spinUpElapsed = spinUpDurationMs - timeUntilCrunch;
      const progress = spinUpElapsed / spinUpDurationMs;
      const easeIn = progress * progress;
      return 1 + 2 * easeIn;
    }
  }
  return 1;
}
