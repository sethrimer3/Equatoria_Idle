import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createTraceEffect } from '../trace-effect';

describe('createTraceEffect animation lifecycle', () => {
  let scheduledFrames: Map<number, FrameRequestCallback>;
  let nextFrameId: number;
  let context: CanvasRenderingContext2D;
  let canvas: HTMLCanvasElement;
  let mountTarget: HTMLElement;

  beforeEach(() => {
    scheduledFrames = new Map();
    nextFrameId = 1;

    vi.stubGlobal('requestAnimationFrame', vi.fn((callback: FrameRequestCallback) => {
      const frameId = nextFrameId++;
      scheduledFrames.set(frameId, callback);
      return frameId;
    }));
    vi.stubGlobal('cancelAnimationFrame', vi.fn((frameId: number) => {
      scheduledFrames.delete(frameId);
    }));

    context = {
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      strokeRect: vi.fn(),
      beginPath: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
    } as unknown as CanvasRenderingContext2D;

    canvas = {
      style: { cssText: '' },
      width: 0,
      height: 0,
      getContext: vi.fn(() => context),
      remove: vi.fn(),
    } as unknown as HTMLCanvasElement;

    mountTarget = {
      appendChild: vi.fn(),
    } as unknown as HTMLElement;

    vi.stubGlobal('document', {
      createElement: vi.fn(() => canvas),
    });
    vi.stubGlobal('window', {
      innerWidth: 1200,
      innerHeight: 800,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function makeTarget(): Element {
    return {
      getBoundingClientRect: vi.fn(() => ({
        left: 10,
        top: 20,
        width: 100,
        height: 40,
        right: 110,
        bottom: 60,
        x: 10,
        y: 20,
        toJSON: () => undefined,
      })),
    } as unknown as Element;
  }

  function runNextFrame(nowMs = 1000): void {
    const next = scheduledFrames.entries().next().value as [number, FrameRequestCallback] | undefined;
    expect(next).toBeDefined();
    const [frameId, callback] = next!;
    scheduledFrames.delete(frameId);
    callback(nowMs);
  }

  it('draws active targets and keeps exactly one frame scheduled', () => {
    const effect = createTraceEffect(mountTarget);

    effect.setEquationTargets([makeTarget()]);
    expect(scheduledFrames.size).toBe(1);

    runNextFrame();

    expect(context.strokeRect).toHaveBeenCalledOnce();
    expect(context.arc).toHaveBeenCalledTimes(2);
    expect(scheduledFrames.size).toBe(1);
  });

  it('does not schedule animation work while there are no targets', () => {
    createTraceEffect(mountTarget);

    expect(scheduledFrames.size).toBe(0);
  });

  it('cancels the pending frame as soon as the last target is cleared', () => {
    const effect = createTraceEffect(mountTarget);
    effect.setMatrixTarget(makeTarget());
    expect(scheduledFrames.size).toBe(1);

    effect.setMatrixTarget(null);

    expect(scheduledFrames.size).toBe(0);
    expect(cancelAnimationFrame).toHaveBeenCalledOnce();
  });

  it('disposes its frame, resize listener, and canvas idempotently', () => {
    const effect = createTraceEffect(mountTarget);
    effect.setEquationTargets([makeTarget()]);

    effect.dispose();
    effect.dispose();

    expect(scheduledFrames.size).toBe(0);
    expect(window.removeEventListener).toHaveBeenCalledTimes(1);
    expect(canvas.remove).toHaveBeenCalledTimes(1);
  });
});
