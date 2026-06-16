// Capacitor Android integration — loaded only when Capacitor.isNativePlatform() is true.
// Imported dynamically from src/main.ts; keep this file free of core game logic.

declare global {
  interface Window {
    /**
     * Called by MainActivity.onBackPressed() via evaluateJavascript.
     * Return true to finish the activity (exit the app), false to stay.
     */
    __equatoriaBack?: () => boolean;
  }
}

/**
 * Register the Android back-button handler.
 *
 * Behaviour:
 *   1. Secondary tab active → switch to the equation tab, stay in app.
 *   2. Equation tab (main gameplay screen) → confirm dialog → exit on OK.
 */
export function setupAndroidBack(): void {
  window.__equatoriaBack = (): boolean => {
    const activeBtn = document.querySelector<HTMLElement>('.tab-btn.active');
    const activeTabId = activeBtn?.dataset['tabId'];

    if (activeTabId && activeTabId !== 'equation') {
      // Navigate back to the main gameplay tab instead of exiting.
      document
        .querySelector<HTMLButtonElement>('.tab-btn[data-tab-id="equation"]')
        ?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      return false;
    }

    // On the equation tab: confirm before exiting.
    // window.confirm() is synchronous in Android WebView and shows a native dialog.
    return window.confirm('Leave Equatoria Idle?');
  };
}
