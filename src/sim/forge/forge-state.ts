export const REFINED_CRYSTAL_THRESHOLD = 500;

/** Total number of weave slots available to the player. */
export const TOTAL_WEAVE_SLOTS = 6;

/**
 * Returns how many weave slots are currently unlocked.
 * Forge level 1 → 2 unlocked; each additional forge level adds one, capped at 6.
 */
export function getUnlockedWeaveSlotCount(forgeLevel: number): number {
  return Math.min(TOTAL_WEAVE_SLOTS, Math.max(1, forgeLevel) + 1);
}

export interface ForgeCrunchState {
  // Legacy visual fields (kept for backward compat with renderer/particle system)
  validParticlesTimerMs: number | null;
  isActive: boolean;
  progress: number;
  startTimeMs: number | null;
  endTimeMs: number | null;
  // Heat-tap system (3 taps triggers the warm-up sequence, then a forge sacrifice crunch)
  heatTapCount: number;
  lastHeatTapMs: number;
  /** Accumulated sacrifice mass per tier (small-mote equivalents). Persisted. */
  sacrificeProgressByTierId: Map<string, number>;
  /** Accumulated refined-crystal progress per tier (small-mote equivalents). Persisted. */
  refinedProgressByTierId: Map<string, number>;
  /** Crafting capacity tier for forged weapons. */
  forgeCraftLevel: number;
  /** Whether the forge is currently in the 9-second warm-up phase. */
  isWarmingUp: boolean;
  /** Wall-clock timestamp (ms) when the warm-up sequence started. Null when idle. */
  warmupStartMs: number | null;
  /** Current forge level (1–5). Each level unlocks one additional ring. */
  forgeLevel: number;
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
    refinedProgressByTierId: new Map(),
    forgeCraftLevel: 1,
    isWarmingUp: false,
    warmupStartMs: null,
    forgeLevel: 1,
  };
}

// ─── Warm-up tuning constants ────────────────────────────────────

/** Number of taps required to wake the forge and begin the warm-up sequence. */
export const FORGE_TAPS_TO_WAKE = 3;
/** @deprecated Alias for backward compatibility. Use FORGE_TAPS_TO_WAKE. */
export const HEAT_TAP_COUNT_FOR_CRUNCH = FORGE_TAPS_TO_WAKE;
/** Milliseconds before an incomplete tap sequence resets. */
export const FORGE_TAP_RESET_MS = 5_000;
/** Milliseconds between each ring lighting up during warm-up. */
export const FORGE_WARMUP_RING_INTERVAL_MS = 2_000;
/** Total number of rings in the warm-up sequence. */
export const FORGE_WARMUP_TOTAL_RINGS = 5;
/** Maximum forge level (one ring per level). */
export const FORGE_MAX_LEVEL = 5;
/** Extra delay after the last ring lights before the final crunch fires. */
export const FORGE_FINAL_CRUNCH_DELAY_AFTER_LAST_RING_MS = 1_000;
/**
 * Total warm-up duration in ms.
 * Ring 1 lights at t=0s, ring 5 at t=8s, crunch fires at t=9s.
 */
export const FORGE_TOTAL_WARMUP_MS = 9_000;
/** Base gravitational pull strength toward the forge during warm-up. */
export const FORGE_GRAVITY_BASE = 0.4;
/** Maximum gravitational pull strength at the end of warm-up. */
export const FORGE_GRAVITY_MAX = 2.0;
/** Spin-speed multiplier applied to each lit ring relative to its base speed. */
export const FORGE_RING_ACTIVE_SPIN_MULTIPLIER = 4.0;

// ─── Warm-up functions ───────────────────────────────────────────

/**
 * Register one heat tap on the forge.
 * Returns true when the Nth tap is received and the warm-up should start.
 * Ignored while a warm-up or crunch is already in progress.
 */
export function tapForgeHeat(state: ForgeCrunchState, nowMs: number): boolean {
  if (state.isActive || state.isWarmingUp) return false;
  state.lastHeatTapMs = nowMs;
  state.heatTapCount++;
  if (state.heatTapCount >= FORGE_TAPS_TO_WAKE) {
    state.heatTapCount = 0;
    return true;
  }
  return false;
}

/** Reset the tap counter if the player has not tapped for FORGE_TAP_RESET_MS. */
export function tickForgeHeatTimeout(state: ForgeCrunchState, nowMs: number): void {
  if (state.heatTapCount > 0 && state.lastHeatTapMs > 0) {
    if (nowMs - state.lastHeatTapMs > FORGE_TAP_RESET_MS) {
      state.heatTapCount = 0;
      state.lastHeatTapMs = 0;
    }
  }
}

/** Begin the warm-up sequence (called on the 3rd tap). */
export function startForgeWarmup(state: ForgeCrunchState, nowMs: number): void {
  state.isWarmingUp = true;
  state.warmupStartMs = nowMs;
  state.heatTapCount = 0;
}

/**
 * Advance the warm-up timer. Call every game-loop frame with the current
 * wall-clock timestamp. When the 9-second sequence completes this function
 * internally calls startEquationForgeCrunch, ending the warm-up phase.
 */
export function tickForgeWarmup(state: ForgeCrunchState, nowMs: number): void {
  if (!state.isWarmingUp || state.warmupStartMs === null) return;
  if (state.isActive) {
    // Crunch already started (shouldn't happen normally, but be safe)
    state.isWarmingUp = false;
    return;
  }
  const elapsed = nowMs - state.warmupStartMs;
  if (elapsed >= FORGE_TOTAL_WARMUP_MS) {
    state.isWarmingUp = false;
    state.warmupStartMs = null;
    startEquationForgeCrunch(state, nowMs);
  }
}

/**
 * Returns how many rings are currently lit (0–5).
 * All 5 rings are lit once the crunch begins.
 */
export function getActiveRingCount(state: ForgeCrunchState, nowMs: number): number {
  const maxRings = state.forgeLevel ?? 1;
  if (state.isActive || state.endTimeMs !== null) return maxRings;
  if (!state.isWarmingUp || state.warmupStartMs === null) return 0;
  const elapsed = nowMs - state.warmupStartMs;
  // Ring i (0-indexed) lights at t = i * FORGE_WARMUP_RING_INTERVAL_MS
  return Math.min(maxRings, Math.floor(elapsed / FORGE_WARMUP_RING_INTERVAL_MS) + 1);
}

/**
 * Returns a [0, 1] progress value for the current warm-up.
 * 0 = just started, 1 = full warm-up complete (crunch about to fire).
 */
export function getForgeWarmupProgress(state: ForgeCrunchState, nowMs: number): number {
  if (state.isActive) return 1;
  if (!state.isWarmingUp || state.warmupStartMs === null) return 0;
  return Math.min(1, (nowMs - state.warmupStartMs) / FORGE_TOTAL_WARMUP_MS);
}

/** Start a forge sacrifice crunch (called automatically when warm-up completes). */
export function startEquationForgeCrunch(state: ForgeCrunchState, nowMs: number): void {
  state.isActive = true;
  state.startTimeMs = nowMs;
  state.progress = 0;
  state.validParticlesTimerMs = null;
  state.endTimeMs = null;
  state.heatTapCount = 0;
  state.isWarmingUp = false;
  state.warmupStartMs = null;
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
  // Warm-up: ease-in rotation spin from 1× to 3× over the 9-second sequence
  if (state.isWarmingUp && state.warmupStartMs !== null) {
    const progress = Math.min(1, (nowMs - state.warmupStartMs) / FORGE_TOTAL_WARMUP_MS);
    return 1 + 2 * progress * progress;
  }
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
