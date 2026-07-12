import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createAppWindowLifecycle,
  createSkillPointUnreadTracker,
  type AppLifecycleEnvironment,
} from '../app-lifecycle';

class FakeEventTarget {
  readonly listeners = new Map<string, Set<EventListener>>();

  addEventListener(type: string, listener: EventListener): void {
    let bucket = this.listeners.get(type);
    if (!bucket) {
      bucket = new Set();
      this.listeners.set(type, bucket);
    }
    bucket.add(listener);
  }

  removeEventListener(type: string, listener: EventListener): void {
    this.listeners.get(type)?.delete(listener);
  }

  emit(type: string): void {
    for (const listener of [...(this.listeners.get(type) ?? [])]) listener(new Event(type));
  }

  count(type: string): number {
    return this.listeners.get(type)?.size ?? 0;
  }
}

function createEnvironment(): AppLifecycleEnvironment & {
  readonly documentTarget: FakeEventTarget & { visibilityState: DocumentVisibilityState };
  readonly windowTarget: FakeEventTarget;
  readonly intervals: Map<number, () => void>;
} {
  const documentTarget = Object.assign(new FakeEventTarget(), {
    visibilityState: 'visible' as DocumentVisibilityState,
  });
  const windowTarget = new FakeEventTarget();
  const intervals = new Map<number, () => void>();
  let nextIntervalId = 1;
  return {
    documentTarget,
    windowTarget,
    intervals,
    document: documentTarget as unknown as Document,
    window: windowTarget as unknown as Window,
    setInterval(callback) {
      const id = nextIntervalId++;
      intervals.set(id, callback);
      return id;
    },
    clearInterval(id) {
      intervals.delete(id);
    },
    now: () => 61_000,
  };
}

describe('app focus, visibility, resize, and unread lifecycle', () => {
  beforeEach(() => vi.clearAllMocks());

  it('records and saves on hide, applies one return reward, and routes audio focus', () => {
    const env = createEnvironment();
    const callbacks = {
      isResetting: vi.fn(() => false),
      save: vi.fn(),
      writeLastActiveTimestamp: vi.fn(),
      readLastActiveTimestamp: vi.fn(() => 1_000),
      applyIdleRewards: vi.fn(),
      setAudioFocused: vi.fn(),
      resize: vi.fn(),
    };
    const lifecycle = createAppWindowLifecycle(callbacks, env);

    env.documentTarget.visibilityState = 'hidden';
    env.documentTarget.emit('visibilitychange');
    expect(callbacks.writeLastActiveTimestamp).toHaveBeenCalledOnce();
    expect(callbacks.save).toHaveBeenCalledOnce();
    expect(callbacks.setAudioFocused).toHaveBeenLastCalledWith(false);

    env.documentTarget.visibilityState = 'visible';
    env.documentTarget.emit('visibilitychange');
    env.documentTarget.emit('visibilitychange');
    expect(callbacks.applyIdleRewards).toHaveBeenCalledOnce();
    expect(callbacks.applyIdleRewards).toHaveBeenCalledWith(60_000);
    expect(callbacks.setAudioFocused).toHaveBeenLastCalledWith(true);

    env.windowTarget.emit('blur');
    env.windowTarget.emit('focus');
    env.windowTarget.emit('resize');
    expect(callbacks.setAudioFocused).toHaveBeenNthCalledWith(4, false);
    expect(callbacks.setAudioFocused).toHaveBeenNthCalledWith(5, true);
    expect(callbacks.resize).toHaveBeenCalledOnce();

    lifecycle.dispose();
    lifecycle.dispose();
    env.windowTarget.emit('resize');
    expect(callbacks.resize).toHaveBeenCalledOnce();
    expect(env.documentTarget.count('visibilitychange')).toBe(0);
    expect(env.windowTarget.count('blur')).toBe(0);
    expect(env.windowTarget.count('focus')).toBe(0);
    expect(env.windowTarget.count('resize')).toBe(0);
  });

  it('does not save a reset in progress and a replacement lifecycle has one listener set', () => {
    const env = createEnvironment();
    const makeCallbacks = () => ({
      isResetting: vi.fn(() => true),
      save: vi.fn(),
      writeLastActiveTimestamp: vi.fn(),
      readLastActiveTimestamp: vi.fn(() => null),
      applyIdleRewards: vi.fn(),
      setAudioFocused: vi.fn(),
      resize: vi.fn(),
    });
    const firstCallbacks = makeCallbacks();
    const first = createAppWindowLifecycle(firstCallbacks, env);
    env.documentTarget.visibilityState = 'hidden';
    env.documentTarget.emit('visibilitychange');
    expect(firstCallbacks.save).not.toHaveBeenCalled();
    first.dispose();

    const secondCallbacks = makeCallbacks();
    createAppWindowLifecycle(secondCallbacks, env);
    expect(env.documentTarget.count('visibilitychange')).toBe(1);
    expect(env.windowTarget.count('resize')).toBe(1);
    env.windowTarget.emit('resize');
    expect(firstCallbacks.resize).not.toHaveBeenCalled();
    expect(secondCallbacks.resize).toHaveBeenCalledOnce();
  });

  it('marks skill points unread, clears on open, and stops polling on disposal', () => {
    const env = createEnvironment();
    let skillPoints = 1;
    const setUnread = vi.fn();
    const tracker = createSkillPointUnreadTracker({
      getUnspentSkillPoints: () => skillPoints,
      setUnread,
    }, env);

    expect(env.intervals.size).toBe(1);
    const stalePoll = [...env.intervals.values()][0]!;
    skillPoints = 2;
    stalePoll();
    expect(setUnread).toHaveBeenLastCalledWith(true);

    tracker.markRead();
    expect(setUnread).toHaveBeenLastCalledWith(false);
    skillPoints = 3;
    stalePoll();
    expect(setUnread).toHaveBeenLastCalledWith(true);

    tracker.dispose();
    tracker.dispose();
    expect(env.intervals.size).toBe(0);
    skillPoints = 4;
    stalePoll();
    expect(setUnread).toHaveBeenCalledTimes(3);
  });
});
