import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AudioSystem } from '../../audio';
import type { CanvasContext } from '../../render/canvas/game-canvas';
import type { ParticleSystem } from '../../render/particles/particle-system';
import type { AppState } from '../app-types';

const inputMocks = vi.hoisted(() => ({
  handleParticleDragDown: vi.fn(),
  recordParticleDragMove: vi.fn(),
  handleParticleDragUp: vi.fn(),
  updateGeneratorPointerPos: vi.fn(),
  clearGeneratorPointerPos: vi.fn(),
}));

vi.mock('../../input/particle-drag', () => ({
  handleParticleDragDown: inputMocks.handleParticleDragDown,
  recordParticleDragMove: inputMocks.recordParticleDragMove,
  handleParticleDragUp: inputMocks.handleParticleDragUp,
}));

vi.mock('../../render/generators/generator-renderer', () => ({
  updateGeneratorPointerPos: inputMocks.updateGeneratorPointerPos,
  clearGeneratorPointerPos: inputMocks.clearGeneratorPointerPos,
}));

import { wireCanvasPointerInput } from '../game-app-canvas-input';

interface RegisteredListener {
  readonly listener: EventListener;
  readonly options?: AddEventListenerOptions | boolean;
}

function createCanvasHarness(): {
  readonly canvas: HTMLCanvasElement;
  readonly listeners: Map<string, RegisteredListener>;
  emit(type: string, event: PointerEvent): void;
  readonly removeEventListener: ReturnType<typeof vi.fn>;
  readonly setPointerCapture: ReturnType<typeof vi.fn>;
} {
  const listeners = new Map<string, RegisteredListener>();
  const removeEventListener = vi.fn((type: string, listener: EventListener) => {
    if (listeners.get(type)?.listener === listener) listeners.delete(type);
  });
  const setPointerCapture = vi.fn();
  const canvas = {
    addEventListener(type: string, listener: EventListener, options?: AddEventListenerOptions | boolean): void {
      listeners.set(type, { listener, options });
    },
    removeEventListener,
    getBoundingClientRect: () => ({ left: 10, top: 20, width: 200, height: 400 }),
    setPointerCapture,
  } as unknown as HTMLCanvasElement;
  return {
    canvas,
    listeners,
    emit(type, event) {
      listeners.get(type)?.listener(event);
    },
    removeEventListener,
    setPointerCapture,
  };
}

function pointerEvent(overrides: Partial<PointerEvent> = {}): PointerEvent {
  return {
    pointerId: 7,
    pointerType: 'touch',
    clientX: 110,
    clientY: 220,
    timeStamp: 123,
    preventDefault: vi.fn(),
    ...overrides,
  } as unknown as PointerEvent;
}

describe('wireCanvasPointerInput', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  function setup(): {
    readonly harness: ReturnType<typeof createCanvasHarness>;
    readonly appState: AppState;
    readonly dispatch: ReturnType<typeof vi.fn>;
    readonly cleanup: () => void;
  } {
    const harness = createCanvasHarness();
    const appState = {
      activeTab: 'equation',
      particleDrag: { isDown: false },
    } as unknown as AppState;
    const particles = { particles: [] } as unknown as ParticleSystem;
    const audioSystem = { resumeContext: vi.fn(() => Promise.resolve()) } as unknown as AudioSystem;
    const dispatch = vi.fn();
    const cc = {
      canvas: harness.canvas,
      widthPx: 320,
      heightPx: 640,
    } as unknown as CanvasContext;

    const cleanup = wireCanvasPointerInput(cc, appState, particles, audioSystem, dispatch);
    return { harness, appState, dispatch, cleanup };
  }

  it('registers the expected listeners and preserves passive-false pointer handlers', () => {
    const { harness } = setup();

    expect([...harness.listeners.keys()]).toEqual([
      'pointerdown', 'pointermove', 'pointerleave', 'pointerup', 'pointercancel',
    ]);
    expect(harness.listeners.get('pointerdown')?.options).toEqual({ passive: false });
    expect(harness.listeners.get('pointermove')?.options).toEqual({ passive: false });
    expect(harness.listeners.get('pointerleave')?.options).toBeUndefined();
    expect(harness.listeners.get('pointerup')?.options).toBeUndefined();
    expect(harness.listeners.get('pointercancel')?.options).toBeUndefined();
  });

  it('preserves tap, hover, batched move, up, cancel, and pointer-capture behavior', () => {
    const { harness, appState, dispatch } = setup();
    const down = pointerEvent();
    harness.emit('pointerdown', down);

    expect(down.preventDefault).toHaveBeenCalledOnce();
    expect(harness.setPointerCapture).toHaveBeenCalledWith(7);
    expect(dispatch).toHaveBeenCalledWith({
      kind: 'tap', xScreen: 110, yScreen: 220, isTouchInput: true,
    });
    expect(inputMocks.updateGeneratorPointerPos).toHaveBeenCalledWith(160, 320);
    expect(inputMocks.handleParticleDragDown).toHaveBeenCalledOnce();

    appState.particleDrag.isDown = true;
    const move = pointerEvent({ clientX: 210, clientY: 420, timeStamp: 140 });
    harness.emit('pointermove', move);
    expect(move.preventDefault).toHaveBeenCalledOnce();
    expect(inputMocks.recordParticleDragMove).toHaveBeenCalledWith(appState.particleDrag, 320, 640, 140);

    harness.emit('pointerup', pointerEvent({ timeStamp: 150 }));
    harness.emit('pointercancel', pointerEvent({ timeStamp: 160 }));
    harness.emit('pointerleave', pointerEvent());
    expect(inputMocks.handleParticleDragUp).toHaveBeenCalledTimes(2);
    expect(inputMocks.clearGeneratorPointerPos).toHaveBeenCalledTimes(3);
  });

  it('removes every listener, clears interaction state, and ignores later events idempotently', () => {
    const { harness, appState, dispatch, cleanup } = setup();
    appState.particleDrag.isDown = true;

    cleanup();
    cleanup();

    expect(harness.listeners.size).toBe(0);
    expect(harness.removeEventListener).toHaveBeenCalledTimes(5);
    expect(inputMocks.handleParticleDragUp).toHaveBeenCalledOnce();
    expect(inputMocks.clearGeneratorPointerPos).toHaveBeenCalledOnce();

    harness.emit('pointerdown', pointerEvent());
    expect(dispatch).not.toHaveBeenCalled();
  });
});
