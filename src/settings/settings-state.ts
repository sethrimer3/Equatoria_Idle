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
  /** Dev-mode only: draw the RPG viewport/field-space diagnostics overlay. */
  isRpgViewportDebugEnabled: boolean;
  /** Dev-mode only: draw the RPG pathfinding grid/paths overlay. */
  isRpgPathfindingDebugEnabled: boolean;
  /** Dev-mode only: draw Verdure cave wall collision/boundary guides. */
  isRpgVerdureWallDebugEnabled: boolean;
  /** Dev-mode only: draw Nadir cube anchor/projection guides. */
  isRpgNadirAnchorDebugEnabled: boolean;
  /** Dev-mode only: draw boss-stage corridor/hazard hitbox guides. */
  isRpgBossStageDebugEnabled: boolean;
  /** Dev-mode only: draw topographic lighting cache diagnostics. */
  isTopographyLightingDebugEnabled: boolean;
  /**
   * When true, topography lighting uses sharp cylinder-style shadows (dev mode only).
   * Hard-edged, directional shadows that treat each contour level as a flat terrace.
   */
  isSharpTopographyShadows: boolean;
  /** Dev-mode only: soften Impetus asteroid sun shadows through a blurred buffer. */
  isSoftImpetusAsteroidShadows: boolean;
  /** When true, the RPG stats bar is anchored to the top of the screen instead of the bottom. */
  rpgBarAtTop: boolean;
  /**
   * When true, the idle earnings count-up overlay is skipped at startup.
   * Offline/idle rewards are still applied silently; only the popup is suppressed.
   */
  skipIdlePopupAtStart: boolean;
  /**
   * Controls how the central HUD equation is rendered.
   * 'pixel' — draws to a low-resolution offscreen canvas then upscales with
   *           nearest-neighbor so the equation has crisp pixel edges.
   * 'smooth' — renders as DOM HTML (anti-aliased, the legacy behaviour).
   */
  equationRenderStyle: 'pixel' | 'smooth';
  /**
   * Controls the backing-store resolution of the main idle / world canvas.
   * 'pixelated' — canvas backing store is deliberately low-resolution (~320 px
   *               wide); the browser scales it up with nearest-neighbor so all
   *               canvas content (motes, forge, generators, rings, background)
   *               looks visibly pixelated.  The DOM HUD (equation, score) is
   *               not affected and remains smooth.
   * 'crisp'     — canvas backing store matches CSS size × DPR (HiDPI); the
   *               world render is sharp and smooth (current crisp behaviour).
   */
  idleCanvasRenderStyle: 'pixelated' | 'crisp';
  /** Dev-mode only: draw the idle canvas viewport diagnostic overlay. */
  isIdleViewportDebugEnabled: boolean;
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
    isRpgViewportDebugEnabled: false,
    isRpgPathfindingDebugEnabled: false,
    isRpgVerdureWallDebugEnabled: false,
    isRpgNadirAnchorDebugEnabled: false,
    isRpgBossStageDebugEnabled: false,
    isTopographyLightingDebugEnabled: false,
    isSharpTopographyShadows: false,
    isSoftImpetusAsteroidShadows: false,
    rpgBarAtTop: false,
    skipIdlePopupAtStart: false,
    equationRenderStyle: 'pixel',
    idleCanvasRenderStyle: 'pixelated',
    isIdleViewportDebugEnabled: false,
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
