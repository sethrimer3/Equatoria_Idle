/** Time-based state machine for the boss summon sequence. */
const ANIM_FRAME_COUNT = 96;
const ANIM_FPS = 30;
const ANIM_DURATION_MS = (ANIM_FRAME_COUNT / ANIM_FPS) * 1000;
const FINAL_FRAME_HOLD_MS = 1000;
const REVEAL_FADE_MS = 1000;

type Phase = 'idle' | 'summoning' | 'holding' | 'revealing' | 'fighting';
interface IntroState {
  phase: Phase;
  circleX: number;
  circleY: number;
  phaseElapsedMs: number;
  onFightStart: (() => void) | null;
}
let state: IntroState = { phase: 'idle', circleX: 0, circleY: 0, phaseElapsedMs: 0, onFightStart: null };

/** Start the circle. The caller starts the cassette/title beside this call. */
export function startBossIntro(x: number, y: number, onFightStart: () => void): void {
  state = { phase: 'summoning', circleX: x, circleY: y, phaseElapsedMs: 0, onFightStart };
}

export function resetBossIntro(): void {
  state = { phase: 'idle', circleX: 0, circleY: 0, phaseElapsedMs: 0, onFightStart: null };
}

/** True only after the synchronized boss/music/beat start point. */
export function hasBossFightStarted(): boolean {
  return state.phase === 'revealing' || state.phase === 'fighting' || state.phase === 'idle';
}

export function updateBossIntro(deltaMs: number): void {
  const elapsedMs = Math.max(0, deltaMs);
  switch (state.phase) {
    case 'summoning':
      state.phaseElapsedMs += elapsedMs;
      if (state.phaseElapsedMs >= ANIM_DURATION_MS) {
        state.phase = 'holding';
        state.phaseElapsedMs -= ANIM_DURATION_MS;
      }
      break;
    case 'holding':
      state.phaseElapsedMs += elapsedMs;
      if (state.phaseElapsedMs >= FINAL_FRAME_HOLD_MS) {
        state.phase = 'revealing';
        state.phaseElapsedMs -= FINAL_FRAME_HOLD_MS;
        const callback = state.onFightStart;
        state.onFightStart = null;
        callback?.();
      }
      break;
    case 'revealing':
      state.phaseElapsedMs += elapsedMs;
      if (state.phaseElapsedMs >= REVEAL_FADE_MS) {
        state.phase = 'fighting';
        state.phaseElapsedMs = 0;
      }
      break;
    default:
      break;
  }
}

export interface BossIntroDrawState {
  isActive: boolean;
  circleX: number;
  circleY: number;
  circleAlpha: number;
  animFrame: number;
  bgBlend: number;
  bgBlackAlpha: number;
  hideBoss: boolean;
}

export function getBossIntroDrawState(): BossIntroDrawState {
  const { phase, circleX, circleY, phaseElapsedMs } = state;
  if (phase === 'summoning') {
    const animFrame = Math.min(ANIM_FRAME_COUNT - 1, Math.floor(phaseElapsedMs * ANIM_FPS / 1000));
    return { isActive: true, circleX, circleY, circleAlpha: 1, animFrame, bgBlend: 0, bgBlackAlpha: 0, hideBoss: true };
  }
  if (phase === 'holding') {
    return { isActive: true, circleX, circleY, circleAlpha: 1, animFrame: ANIM_FRAME_COUNT - 1, bgBlend: 0, bgBlackAlpha: 0, hideBoss: true };
  }
  if (phase === 'revealing') {
    const progress = Math.min(1, phaseElapsedMs / REVEAL_FADE_MS);
    return { isActive: true, circleX, circleY, circleAlpha: 1 - progress, animFrame: ANIM_FRAME_COUNT - 1, bgBlend: 0, bgBlackAlpha: progress, hideBoss: false };
  }
  return { isActive: false, circleX: 0, circleY: 0, circleAlpha: 0, animFrame: 0, bgBlend: 0, bgBlackAlpha: 0, hideBoss: false };
}
