/** User-facing settings (persisted separately from game state). */
export interface SettingsState {
  musicVolume: number;     // 0–1
  sfxVolume: number;       // 0–1
  /** When true, music and SFX pause whenever the window loses focus or the tab is hidden. */
  isMusicOnlyWhenFocused: boolean;
  isReducedParticles: boolean;
  graphicsQuality: 'high' | 'low';
  isScreenShakeEnabled: boolean;
  colorTheme: 'dark' | 'light';
  backgroundStyle: 'vermiculate' | 'substrate' | 'none';
  /** Controls how large numbers are displayed: letter suffixes, scientific, or engineering notation. */
  numberFormat: 'letters' | 'scientific' | 'engineering';
  /** RPG enemy marker style. */
  rpgEnemyIndicatorStyle: 'triangle' | 'outline' | 'off';
  /** Visibility mode for generator/loom equations in the HUD overlay. */
  generatorEquationVisibility: 'always' | 'proximity' | 'off';
  /** When true: all upgrades/unlocks are available regardless of cost; costs are not deducted. */
  isDevMode: boolean;
  /** When true, the player takes no damage in RPG gameplay (dev mode only). */
  isInvincibilityMode: boolean;
  /** When true, draw raw topographic terrain debug outlines/dots in RPG (dev mode only). */
  isTopographicTerrainDebugEnabled: boolean;
  /**
   * When true, topography lighting uses sharp cylinder-style shadows (dev mode only).
   * Hard-edged, directional shadows that treat each contour level as a flat terrace.
   * Defaults to true so the sharp mode is active by default when dev mode is turned on.
   */
  isSharpTopographyShadows: boolean;
  /** When true, the RPG stats bar is anchored to the top of the screen instead of the bottom. */
  rpgBarAtTop: boolean;
}

export function createDefaultSettings(): SettingsState {
  return {
    musicVolume: 0.5,
    sfxVolume: 0.5,
    isMusicOnlyWhenFocused: true,
    isReducedParticles: false,
    graphicsQuality: 'high',
    isScreenShakeEnabled: true,
    colorTheme: 'dark',
    backgroundStyle: 'vermiculate',
    numberFormat: 'letters',
    rpgEnemyIndicatorStyle: 'triangle',
    generatorEquationVisibility: 'proximity',
    isDevMode: false,
    isInvincibilityMode: false,
    isTopographicTerrainDebugEnabled: false,
    isSharpTopographyShadows: true,
    rpgBarAtTop: false,
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
