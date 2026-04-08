/** User-facing settings (persisted separately from game state). */
export interface SettingsState {
  musicVolume: number;     // 0–1
  sfxVolume: number;       // 0–1
  isReducedParticles: boolean;
  graphicsQuality: 'high' | 'low';
  isScreenShakeEnabled: boolean;
  colorTheme: 'dark' | 'light';
}

export function createDefaultSettings(): SettingsState {
  return {
    musicVolume: 0.5,
    sfxVolume: 0.7,
    isReducedParticles: false,
    graphicsQuality: 'high',
    isScreenShakeEnabled: true,
    colorTheme: 'dark',
  };
}

const SETTINGS_KEY = 'equatoria_settings';

export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return createDefaultSettings();
    const parsed = JSON.parse(raw) as Partial<SettingsState>;
    return { ...createDefaultSettings(), ...parsed };
  } catch {
    return createDefaultSettings();
  }
}

export function saveSettings(settings: SettingsState): void {
  try {
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    // Storage might be full or unavailable — silently ignore
  }
}
