/** User-facing settings (persisted separately from game state). */
export type FpsLimitSetting = 60 | 120 | 'unlimited';

export interface SettingsState {
  musicVolume: number;     // 0–1
  sfxVolume: number;       // 0–1
  /** When true, music and SFX pause whenever the window loses focus or the tab is hidden. */
  isMusicOnlyWhenFocused: boolean;
  isReducedParticles: boolean;
  graphicsQuality: 'auto' | 'high' | 'low';
  fpsLimit: FpsLimitSetting;
  isScreenShakeEnabled: boolean;
  colorTheme: 'dark' | 'light';
  backgroundStyle: 'vermiculate' | 'substrate' | 'none';
  /** Controls how large numbers are displayed: letter suffixes, scientific, or engineering notation. */
  numberFormat: 'letters' | 'scientific' | 'engineering';
  /** Global UI font size offset in pixels, from -4 to +4. */
  fontSizeOffsetPx: number;
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
  /** Dev-mode only: draw boss-stage route corridor and hitbox guides. */
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
  /** Battlefield position of the RPG rack. The rack remains available inside the RPG menu. */
  rpgRackPosition: 'bottom' | 'top' | 'hidden';
  /** Position of the standalone RPG menu button while the rack is hidden. */
  rpgMenuButtonPosition: 'top' | 'bottom';
  /** Position of the tappable RPG zone name / wave label. */
  rpgZonePosition: 'top' | 'bottom';
  /**
   * When true, the idle earnings count-up overlay is skipped at startup.
   * Offline/idle rewards are still applied silently; only the popup is suppressed.
   */
  skipIdlePopupAtStart: boolean;
  /** Whether one persistent profile tip is shown on the startup screen. */
  showTipOnStartup: boolean;
  /** Retained for settings-file compatibility; no active UI reads this field. */
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
  /** Dev-mode only: show the RPG debug overlay (nearby enemy HP, statuses, recent combos). */
  isRpgDebugOverlayEnabled: boolean;
  /**
   * When true (dev mode only), all RPG zone rendering is drawn at a
   * quarter-resolution offscreen canvas then upscaled with nearest-neighbor,
   * producing a crisply pixelated look that matches the equation renderer.
   * OFF by default; only takes effect when isDevMode is also true.
   */
  isRpgPixelatedRender: boolean;
  /**
   * Low-graphics mote rendering: when true, each tier renders only the single
   * largest non-zero size rather than all sizes simultaneously.
   * Visual-only — no inventory changes.
   */
  lowGraphicsMotes: boolean;
}

export function createDefaultSettings(): SettingsState {
  return {
    musicVolume: 0.5,
    sfxVolume: 0.5,
    isMusicOnlyWhenFocused: true,
    isReducedParticles: false,
    graphicsQuality: 'auto',
    fpsLimit: 'unlimited',
    isScreenShakeEnabled: true,
    colorTheme: 'dark',
    backgroundStyle: 'vermiculate',
    numberFormat: 'letters',
    fontSizeOffsetPx: 0,
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
    rpgRackPosition: 'bottom',
    rpgMenuButtonPosition: 'top',
    rpgZonePosition: 'top',
    skipIdlePopupAtStart: false,
    showTipOnStartup: true,
    equationRenderStyle: 'pixel',
    idleCanvasRenderStyle: 'pixelated',
    isIdleViewportDebugEnabled: false,
    isRpgPixelatedRender: false,
    isRpgDebugOverlayEnabled: false,
    lowGraphicsMotes: false,
  };
}

const SETTINGS_KEY = 'equatoria_settings';

export function loadSettings(): SettingsState {
  try {
    const raw = localStorage.getItem(SETTINGS_KEY);
    if (!raw) return createDefaultSettings();
    const parsed = JSON.parse(raw) as Partial<SettingsState> & { rpgBarAtTop?: boolean };
    const settings = { ...createDefaultSettings(), ...parsed };
    if (parsed.rpgRackPosition === undefined && parsed.rpgBarAtTop !== undefined) {
      settings.rpgRackPosition = parsed.rpgBarAtTop ? 'top' : 'bottom';
    }
    if (settings.fpsLimit !== 60 && settings.fpsLimit !== 120 && settings.fpsLimit !== 'unlimited') {
      settings.fpsLimit = 'unlimited';
    }
    settings.fontSizeOffsetPx = clampFontSizeOffset(settings.fontSizeOffsetPx);
    return settings;
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

export function clampFontSizeOffset(value: unknown): number {
  const numeric = typeof value === 'number' && Number.isFinite(value) ? value : 0;
  return Math.max(-4, Math.min(4, Math.round(numeric)));
}

export function applyFontSizeOffset(offsetPx: number, root: HTMLElement = document.documentElement): void {
  root.style.setProperty('--game-font-size-offset-px', `${clampFontSizeOffset(offsetPx)}px`);
}
