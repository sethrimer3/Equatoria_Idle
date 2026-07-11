/**
 * render-resolution-setting.test.ts — defaults, migration, and validation for
 * the `renderResolutionQuality` setting added by the high-DPI performance fix.
 */

import { describe, expect, it, beforeEach, vi } from 'vitest';
import { createDefaultSettings, loadSettings, type SettingsState } from '../settings-state';

/** Minimal in-memory localStorage stub (node test env has no DOM). */
function installLocalStorage(initial: Record<string, string> = {}): void {
  const store = new Map(Object.entries(initial));
  vi.stubGlobal('localStorage', {
    getItem: (k: string) => (store.has(k) ? store.get(k)! : null),
    setItem: (k: string, v: string) => { store.set(k, v); },
    removeItem: (k: string) => { store.delete(k); },
    clear: () => { store.clear(); },
  });
}

const KEY = 'equatoria_settings';

describe('renderResolutionQuality setting', () => {
  beforeEach(() => { vi.unstubAllGlobals(); });

  it('defaults to auto', () => {
    expect(createDefaultSettings().renderResolutionQuality).toBe('auto');
  });

  it('older saves without the field migrate to auto', () => {
    const legacy = { musicVolume: 0.3 }; // no renderResolutionQuality field
    installLocalStorage({ [KEY]: JSON.stringify(legacy) });
    expect(loadSettings().renderResolutionQuality).toBe('auto');
  });

  it('valid persisted values are preserved', () => {
    for (const v of ['auto', 'high', 'balanced', 'performance'] as const) {
      installLocalStorage({ [KEY]: JSON.stringify({ renderResolutionQuality: v }) });
      expect(loadSettings().renderResolutionQuality).toBe(v);
    }
  });

  it('invalid persisted values fall back to auto', () => {
    for (const bad of ['ultra', '', 42, null, {}]) {
      installLocalStorage({ [KEY]: JSON.stringify({ renderResolutionQuality: bad as unknown as SettingsState['renderResolutionQuality'] }) });
      expect(loadSettings().renderResolutionQuality).toBe('auto');
    }
  });

  it('does not disturb other persisted settings', () => {
    installLocalStorage({ [KEY]: JSON.stringify({ renderResolutionQuality: 'performance', musicVolume: 0.9 }) });
    const s = loadSettings();
    expect(s.renderResolutionQuality).toBe('performance');
    expect(s.musicVolume).toBe(0.9);
  });
});
