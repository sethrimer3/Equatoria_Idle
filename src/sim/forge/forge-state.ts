export interface ForgeCrunchState {
  // Legacy visual fields (kept for backward compat with renderer/particle system)
  validParticlesTimerMs: number | null;
  isActive: boolean;
  progress: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  // Heat-tap system (3 taps triggers a forge sacrifice crunch)
  heatTapCount: number;
  lastHeatTapMs: number;
  /** Accumulated sacrifice mass per tier (small-mote equivalents). Persisted. */
  sacrificeProgressByTierId: Map<string, number>;
}

export function createForgeCrunchState(): ForgeCrunchState {
  return {
    validParticlesTimerMs: null,
    isActive: false,
    progress: 0,
    startTimeMs: null,
    endTimeMs: null,
    heatTapCount: 0,
    lastHeatTapMs: 0,
    sacrificeProgressByTierId: new Map(),
  };
}

/** Number of taps required to trigger a forge sacrifice crunch. */
export const HEAT_TAP_COUNT_FOR_CRUNCH = 3;
/** Time in ms before an incomplete heat sequence resets. */
const HEAT_TAP_TIMEOUT_MS = 30_000;

/**
 * Register one heat tap on the forge.
 * Returns true when the 3rd tap is received and a crunch should start.
 * Returns false if tapping while a crunch is already active.
 */
export function tapForgeHeat(state: ForgeCrunchState, nowMs: number): boolean {
  if (state.isActive) return false;
  state.lastHeatTapMs = nowMs;
  state.heatTapCount++;
  if (state.heatTapCount >= HEAT_TAP_COUNT_FOR_CRUNCH) {
    state.heatTapCount = 0;
    return true;
  }
  return false;
}

/** Reset heat tap count if the player hasn't tapped for HEAT_TAP_TIMEOUT_MS. */
export function tickForgeHeatTimeout(state: ForgeCrunchState, nowMs: number): void {
  if (state.heatTapCount > 0 && state.lastHeatTapMs > 0) {
    if (nowMs - state.lastHeatTapMs > HEAT_TAP_TIMEOUT_MS) {
      state.heatTapCount = 0;
      state.lastHeatTapMs = 0;
    }
  }
}

/** Start a forge sacrifice crunch (triggered after 3 heat taps). */
export function startEquationForgeCrunch(state: ForgeCrunchState, nowMs: number): void {
  state.isActive = true;
  state.startTimeMs = nowMs;
  state.progress = 0;
  state.validParticlesTimerMs = null;
  state.endTimeMs = null;
  state.heatTapCount = 0;
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
