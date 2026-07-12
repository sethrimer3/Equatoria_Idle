export interface AppRuntime {
  readonly isDisposed: boolean;
  dispose(): void;
}

export interface AppRuntimeOwner {
  readonly runtime: AppRuntime;
  addCleanup(cleanup: () => void): void;
}

type CleanupErrorHandler = (error: unknown) => void;

function defaultCleanupErrorHandler(error: unknown): void {
  console.error('Failed to clean up an Equatoria Idle app resource:', error);
}

/**
 * Creates the small, app-local cleanup stack used by one startApp() call.
 * The root cleanup is registered first so reverse-order disposal removes DOM
 * only after frames, timers, listeners, callbacks, and child resources stop.
 */
export function createAppRuntimeOwner(
  root: HTMLElement,
  onCleanupError: CleanupErrorHandler = defaultCleanupErrorHandler,
): AppRuntimeOwner {
  const cleanups: Array<() => void> = [() => { root.replaceChildren(); }];
  let isDisposed = false;

  function runCleanup(cleanup: () => void): void {
    try {
      cleanup();
    } catch (error) {
      onCleanupError(error);
    }
  }

  const runtime: AppRuntime = {
    get isDisposed(): boolean {
      return isDisposed;
    },
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      for (let i = cleanups.length - 1; i >= 0; i--) {
        runCleanup(cleanups[i]!);
      }
      cleanups.length = 0;
    },
  };

  return {
    runtime,
    addCleanup(cleanup: () => void): void {
      if (isDisposed) {
        runCleanup(cleanup);
        return;
      }
      cleanups.push(cleanup);
    },
  };
}
