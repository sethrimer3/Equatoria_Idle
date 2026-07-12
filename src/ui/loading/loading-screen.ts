/**
 * Loading screen shown while the application finishes bootstrap work.
 */

import { canLeaveLoadingScreen, type LoadingGateState } from './loading-gate';

const SPRITESHEET_PATH = 'ASSETS/ANIMATIONS/computerBackground/spritesheet.png';
const SPRITESHEET_DATA_PATH = 'ASSETS/ANIMATIONS/computerBackground/spritesheet.json';
const FRAME_DURATION_MS = 1000 / 30;
const LAST_FRAME_HOLD_MS = 3000;

interface AtlasFrame {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface AtlasData {
  frames: Record<string, { frame: AtlasFrame }>;
}

export interface LoadingScreen {
  /** The loading screen DOM element. */
  readonly element: HTMLElement;
  /** Fade out and remove the loading screen after its minimum display time. */
  fadeOut(): Promise<void>;
  setTip(text: string | null): void;
  dispose(): void;
}

/**
 * Create the loading screen and begin its controlled frame animation.
 */
export async function createLoadingScreen(): Promise<LoadingScreen> {
  const overlay = document.createElement('div');
  overlay.className = 'loading-screen';

  const canvas = document.createElement('canvas');
  canvas.className = 'loading-animation';
  canvas.width = 720;
  canvas.height = 1280;
  canvas.setAttribute('aria-label', 'Loading Equatoria Idle');
  overlay.appendChild(canvas);

  const tipPanel = document.createElement('div');
  tipPanel.className = 'loading-tip';
  tipPanel.setAttribute('role', 'status');
  tipPanel.hidden = true;
  overlay.appendChild(tipPanel);

  const context = canvas.getContext('2d');
  const spritesheet = new Image();
  let frames: AtlasFrame[] = [];
  let animationFrameId = 0;
  let animationStartMs = 0;
  let isDisposed = false;
  let fadeTimeoutId: ReturnType<typeof setTimeout> | null = null;
  let resolveFade: (() => void) | null = null;
  let previousCycleIndex = 0;
  const gate: LoadingGateState = { completedLoops: 0, isLoadingComplete: false, hasFailed: false };
  let resolveGate: (() => void) | null = null;
  const gateReady = new Promise<void>(resolve => { resolveGate = resolve; });
  const checkGate = (): void => { if (canLeaveLoadingScreen(gate)) resolveGate?.(); };

  const drawFrame = (frameIndex: number): void => {
    const frame = frames[frameIndex];
    if (!context || !frame) return;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(
      spritesheet,
      frame.x,
      frame.y,
      frame.w,
      frame.h,
      0,
      0,
      canvas.width,
      canvas.height,
    );
  };

  const animate = (nowMs: number): void => {
    if (isDisposed) return;
    const cycleAnimationMs = frames.length * FRAME_DURATION_MS;
    const cycleDurationMs = cycleAnimationMs + LAST_FRAME_HOLD_MS;
    const cycleElapsedMs = (nowMs - animationStartMs) % cycleDurationMs;
    const cycleIndex = Math.floor((nowMs - animationStartMs) / cycleDurationMs);
    if (cycleIndex > previousCycleIndex) {
      gate.completedLoops += cycleIndex - previousCycleIndex;
      previousCycleIndex = cycleIndex;
      checkGate();
    }
    const frameIndex = cycleElapsedMs >= cycleAnimationMs
      ? frames.length - 1
      : Math.min(frames.length - 1, Math.floor(cycleElapsedMs / FRAME_DURATION_MS));
    drawFrame(frameIndex);
    animationFrameId = requestAnimationFrame(animate);
  };

  const spritesheetLoaded = new Promise<void>((resolve, reject) => {
    spritesheet.addEventListener('load', () => resolve(), { once: true });
    spritesheet.addEventListener('error', () => reject(new Error('Failed to load loading-screen spritesheet')), { once: true });
  });
  spritesheet.src = SPRITESHEET_PATH;

  Promise.all([
    spritesheetLoaded,
    fetch(SPRITESHEET_DATA_PATH).then(async response => {
      if (!response.ok) throw new Error(`Failed to load loading-screen atlas data: ${response.status}`);
      return response.json() as Promise<AtlasData>;
    }),
  ]).then(([, atlas]) => {
    if (isDisposed) return;
    frames = Object.entries(atlas.frames)
      .sort(([nameA], [nameB]) => nameA.localeCompare(nameB))
      .map(([, entry]) => entry.frame);
    const firstFrame = frames[0];
    if (!firstFrame) throw new Error('Loading-screen atlas contains no frames');
    canvas.width = firstFrame.w;
    canvas.height = firstFrame.h;
    animationStartMs = performance.now();
    animationFrameId = requestAnimationFrame(animate);
  }).catch(() => {
    canvas.classList.add('loading-animation--unavailable');
    gate.hasFailed = true;
    checkGate();
  });

  function dispose(): void {
    if (isDisposed) return;
    isDisposed = true;
    gate.hasFailed = true;
    checkGate();
    cancelAnimationFrame(animationFrameId);
    if (fadeTimeoutId !== null) clearTimeout(fadeTimeoutId);
    fadeTimeoutId = null;
    overlay.remove();
    resolveFade?.();
    resolveFade = null;
  }

  return {
    element: overlay,
    setTip(text: string | null): void {
      tipPanel.hidden = !text;
      tipPanel.textContent = text ? `TIP: ${text}` : '';
    },
    async fadeOut(): Promise<void> {
      gate.isLoadingComplete = true;
      checkGate();
      await gateReady;
      if (isDisposed) return;

      return new Promise(resolve => {
        resolveFade = resolve;
        let resolved = false;
        const finish = (): void => {
          if (resolved) return;
          resolved = true;
          resolveFade = null;
          if (fadeTimeoutId !== null) clearTimeout(fadeTimeoutId);
          fadeTimeoutId = null;
          cancelAnimationFrame(animationFrameId);
          overlay.remove();
          resolve();
        };

        overlay.classList.add('loading-screen--fade-out');
        overlay.addEventListener('transitionend', finish, { once: true });
        fadeTimeoutId = setTimeout(finish, 1000);
      });
    },
    dispose,
  };
}
