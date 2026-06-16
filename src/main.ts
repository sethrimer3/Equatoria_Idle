import { startApp } from './app';

// Boot when DOM is ready
function boot(): void {
  // Dynamic import keeps Capacitor-specific code out of the browser bundle.
  // window.Capacitor is injected by the native runtime before the JS bundle runs.
  if ((window as { Capacitor?: { isNativePlatform?(): boolean } }).Capacitor?.isNativePlatform?.()) {
    import('./capacitor-android').then(({ setupAndroidBack }) => setupAndroidBack());
  }

  startApp().catch((err) => {
    console.error('Failed to start Equatoria Idle:', err);
  });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', boot);
} else {
  boot();
}
