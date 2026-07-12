export interface AppLifecycleEnvironment {
  readonly document: Document;
  readonly window: Window;
  setInterval(callback: () => void, intervalMs: number): number;
  clearInterval(id: number): void;
  now(): number;
}

export interface AppWindowLifecycleCallbacks {
  isResetting(): boolean;
  save(): void;
  writeLastActiveTimestamp(): void;
  readLastActiveTimestamp(): number | null;
  applyIdleRewards(elapsedMs: number): void;
  setAudioFocused(focused: boolean): void;
  resize(): void;
  readonly maxIdleMs?: number;
}

export interface AppWindowLifecycle {
  dispose(): void;
}

export interface SkillPointUnreadCallbacks {
  getUnspentSkillPoints(): number;
  setUnread(unread: boolean): void;
}

export interface SkillPointUnreadTracker {
  markRead(): void;
  dispose(): void;
}

function getDefaultEnvironment(): AppLifecycleEnvironment {
  return {
    document,
    window,
    setInterval: (callback, intervalMs) => window.setInterval(callback, intervalMs),
    clearInterval: (id) => window.clearInterval(id),
    now: () => Date.now(),
  };
}

/** Owns the permanent document/window listeners for one app runtime. */
export function createAppWindowLifecycle(
  callbacks: AppWindowLifecycleCallbacks,
  environment: AppLifecycleEnvironment = getDefaultEnvironment(),
): AppWindowLifecycle {
  let isDisposed = false;
  let isWindowFocused = environment.document.visibilityState === 'visible';
  let wasHidden = false;

  function onVisibilityChange(): void {
    if (isDisposed) return;
    const isVisible = environment.document.visibilityState === 'visible';
    isWindowFocused = isVisible;
    callbacks.setAudioFocused(isWindowFocused);
    if (!isVisible) {
      wasHidden = true;
      callbacks.writeLastActiveTimestamp();
      if (!callbacks.isResetting()) callbacks.save();
      return;
    }
    if (!wasHidden) return;
    wasHidden = false;
    const hiddenTimestamp = callbacks.readLastActiveTimestamp();
    if (hiddenTimestamp === null) return;
    const elapsedMs = Math.min(
      Math.max(0, environment.now() - hiddenTimestamp),
      callbacks.maxIdleMs ?? Number.POSITIVE_INFINITY,
    );
    callbacks.applyIdleRewards(elapsedMs);
  }

  function onBlur(): void {
    if (isDisposed) return;
    isWindowFocused = false;
    callbacks.setAudioFocused(isWindowFocused);
  }

  function onFocus(): void {
    if (isDisposed) return;
    isWindowFocused = true;
    callbacks.setAudioFocused(isWindowFocused);
  }

  function onResize(): void {
    if (isDisposed) return;
    callbacks.resize();
  }

  environment.document.addEventListener('visibilitychange', onVisibilityChange);
  environment.window.addEventListener('blur', onBlur);
  environment.window.addEventListener('focus', onFocus);
  environment.window.addEventListener('resize', onResize);

  return {
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      environment.document.removeEventListener('visibilitychange', onVisibilityChange);
      environment.window.removeEventListener('blur', onBlur);
      environment.window.removeEventListener('focus', onFocus);
      environment.window.removeEventListener('resize', onResize);
    },
  };
}

/** Owns the existing 250 ms skill-point unread poller for one app runtime. */
export function createSkillPointUnreadTracker(
  callbacks: SkillPointUnreadCallbacks,
  environment: AppLifecycleEnvironment = getDefaultEnvironment(),
): SkillPointUnreadTracker {
  let isDisposed = false;
  let lastSeenUnspentSkillPoints = callbacks.getUnspentSkillPoints();

  const intervalId = environment.setInterval(() => {
    if (isDisposed) return;
    const currentSkillPoints = callbacks.getUnspentSkillPoints();
    if (currentSkillPoints > lastSeenUnspentSkillPoints) callbacks.setUnread(true);
    lastSeenUnspentSkillPoints = currentSkillPoints;
  }, 250);

  return {
    markRead(): void {
      if (isDisposed) return;
      lastSeenUnspentSkillPoints = callbacks.getUnspentSkillPoints();
      callbacks.setUnread(false);
    },
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      environment.clearInterval(intervalId);
    },
  };
}
