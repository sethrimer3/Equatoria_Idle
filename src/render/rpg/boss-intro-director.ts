/**
 * boss-intro-director.ts — State machine for the boss intro sequence.
 *
 * Sequence:
 *   spawning     → spawn circle animates (1 anim-frame / 10 game frames),
 *                  nebulaeBackground crossfades to nebulaeBackground_blur
 *   holding      → circle holds on last frame, bg fully blurred,
 *                  onCassetteReady fires
 *   cassette     → cassette SFX playing, visuals unchanged
 *   fight-starting → cassette done: circle + blur bg fade out to black,
 *                    boss becomes visible, boss music starts
 *   fighting     → black background, normal fight (isActive = false)
 */

/** Game frames of real render ticks per animation frame of the spawn circle. */
const FRAMES_PER_ANIM_STEP = 10;
const ANIM_FRAME_COUNT = 96;
const TOTAL_GAME_FRAMES = FRAMES_PER_ANIM_STEP * ANIM_FRAME_COUNT;
const FIGHT_START_FADE_MS = 600;

type Phase = 'idle' | 'spawning' | 'holding' | 'cassette' | 'fight-starting' | 'fighting';

interface IntroState {
  phase: Phase;
  circleX: number;
  circleY: number;
  gameFrames: number;
  fightStartingMs: number;
  onCassetteReady: (() => void) | null;
}

let _state: IntroState = {
  phase: 'idle',
  circleX: 0,
  circleY: 0,
  gameFrames: 0,
  fightStartingMs: 0,
  onCassetteReady: null,
};

/** Begin the boss intro sequence. `onCassetteReady` fires when the spawn circle finishes. */
export function startBossIntro(x: number, y: number, onCassetteReady: () => void): void {
  _state = {
    phase: 'spawning',
    circleX: x,
    circleY: y,
    gameFrames: 0,
    fightStartingMs: 0,
    onCassetteReady,
  };
}

/** Call when the cassette SFX starts playing (transitions holding → cassette). */
export function onBossIntroCassetteStarted(): void {
  if (_state.phase === 'holding') _state.phase = 'cassette';
}

/** Call when the cassette SFX finishes (transitions cassette → fight-starting). */
export function onBossIntroCassetteDone(): void {
  if (_state.phase === 'cassette') {
    _state.phase = 'fight-starting';
    _state.fightStartingMs = 0;
  }
}

/** Reset to idle (call on exit boss wave). */
export function resetBossIntro(): void {
  _state = { phase: 'idle', circleX: 0, circleY: 0, gameFrames: 0, fightStartingMs: 0, onCassetteReady: null };
}

/** Advance the intro state machine. Call once per rendered game frame. */
export function updateBossIntro(deltaMs: number): void {
  switch (_state.phase) {
    case 'spawning': {
      _state.gameFrames++;
      if (_state.gameFrames >= TOTAL_GAME_FRAMES) {
        _state.phase = 'holding';
        const cb = _state.onCassetteReady;
        _state.onCassetteReady = null;
        cb?.();
      }
      break;
    }
    case 'fight-starting': {
      _state.fightStartingMs += deltaMs;
      if (_state.fightStartingMs >= FIGHT_START_FADE_MS) {
        _state.phase = 'fighting';
      }
      break;
    }
    default: break;
  }
}

export interface BossIntroDrawState {
  /** Whether the intro overlay is still active and should be drawn. */
  isActive: boolean;
  circleX: number;
  circleY: number;
  /** Spawn circle opacity (0–1). */
  circleAlpha: number;
  /** Current animation frame index (0–95). */
  animFrame: number;
  /** 0 = sharp nebulae bg only, 1 = fully blurred bg. */
  bgBlend: number;
  /** 0 = transparent overlay, 1 = solid black (end of fight-starting). */
  bgBlackAlpha: number;
  /** True when the boss entity should be hidden (pre-summon phases). */
  hideBoss: boolean;
}

export function getBossIntroDrawState(): BossIntroDrawState {
  const { phase, circleX, circleY, gameFrames, fightStartingMs } = _state;

  switch (phase) {
    case 'idle':
      return { isActive: false, circleX: 0, circleY: 0, circleAlpha: 0, animFrame: 0, bgBlend: 0, bgBlackAlpha: 0, hideBoss: false };

    case 'spawning': {
      const progress = Math.min(1, gameFrames / TOTAL_GAME_FRAMES);
      const animFrame = Math.min(ANIM_FRAME_COUNT - 1, Math.floor(gameFrames / FRAMES_PER_ANIM_STEP));
      return { isActive: true, circleX, circleY, circleAlpha: 1, animFrame, bgBlend: progress, bgBlackAlpha: 0, hideBoss: true };
    }

    case 'holding':
    case 'cassette':
      return { isActive: true, circleX, circleY, circleAlpha: 1, animFrame: ANIM_FRAME_COUNT - 1, bgBlend: 1, bgBlackAlpha: 0, hideBoss: true };

    case 'fight-starting': {
      const t = Math.min(1, fightStartingMs / FIGHT_START_FADE_MS);
      return { isActive: true, circleX, circleY, circleAlpha: 1 - t, animFrame: ANIM_FRAME_COUNT - 1, bgBlend: 1, bgBlackAlpha: t, hideBoss: false };
    }

    case 'fighting':
      return { isActive: false, circleX: 0, circleY: 0, circleAlpha: 0, animFrame: 0, bgBlend: 0, bgBlackAlpha: 0, hideBoss: false };
  }
}
