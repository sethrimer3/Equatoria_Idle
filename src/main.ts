import { startApp } from './app';
import type { AppRuntime } from './app/app-runtime';

// Boot when DOM is ready
let activeRuntime: AppRuntime | null = null;
let bootGeneration = 0;

async function boot(): Promise<void> {
  const generation = ++bootGeneration;
  activeRuntime?.dispose();
  activeRuntime = null;

  // Dynamic import keeps Capacitor-specific code out of the browser bundle.
  // window.Capacitor is injected by the native runtime before the JS bundle runs.
  if ((window as { Capacitor?: { isNativePlatform?(): boolean } }).Capacitor?.isNativePlatform?.()) {
    import('./capacitor-android').then(({ setupAndroidBack }) => setupAndroidBack());
  }

  try {
    const runtime = await startApp();
    if (generation !== bootGeneration) {
      runtime.dispose();
      return;
    }
    activeRuntime = runtime;
  } catch (err) {
    console.error('Failed to start Equatoria Idle:', err);
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => { void boot(); }, { once: true });
} else {
  void boot();
}
