import type { ActionHandler } from '../../input';
import type { SettingsState } from '../../settings';
import { saveSettings } from '../../settings';
import type { AudioSystem } from '../../audio';
import { makePageBreak } from '../ui-helpers';
import { BUILD_NUMBER } from '../../buildInfo';
import { createBalanceForecastPanel, type BalanceForecastPanel } from './balance-forecast/balance-forecast-panel';
import { createDevPanel, type DevPanel, type DevPanelHooks } from './dev-panel';
import { createSliderRow, createToggleRow, createSelectRow } from './settings-panel-controls';
import { createDevTweaksSection } from './settings-panel-dev-tweaks';

/**
 * Settings panel — DOM-based settings controls.
 */
export interface SettingsPanel {
  element: HTMLElement;
  getSettings(): SettingsState;
  /** The embedded Balance Forecast dev panel (dev mode only). */
  balanceForecastPanel: BalanceForecastPanel;
  /** The embedded developer playtesting panel (dev mode only). */
  devPanel: DevPanel;
  /** Wire up the dev panel after rpgRender and game are available. */
  registerDevHooks(hooks: DevPanelHooks): void;
}

export function createSettingsPanel(
  settings: SettingsState,
  dispatch: ActionHandler,
  audioSystem?: AudioSystem,
  onFocusSettingChange?: () => void,
  onIdleCanvasRenderStyleChange?: () => void,
): SettingsPanel {
  const panel = document.createElement('div');
  panel.className = 'panel settings-panel';

  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Settings';
  panel.appendChild(title);

  // SFX volume
  const sfxRow = createSliderRow('SFX Volume', settings.sfxVolume, (v) => {
    settings.sfxVolume = v;
    saveSettings(settings);
    audioSystem?.setSfxVolume(v);
    audioSystem?.onSettingsChanged();
  });
  panel.appendChild(sfxRow);

  // Music volume — does NOT trigger onSettingsChanged
  const musicRow = createSliderRow('Music Volume', settings.musicVolume, (v) => {
    settings.musicVolume = v;
    saveSettings(settings);
    audioSystem?.setMusicVolume(v);
  });
  panel.appendChild(musicRow);

  // Music/SFX Only When Focused toggle
  const focusRow = createToggleRow('Music/SFX Only When Focused', settings.isMusicOnlyWhenFocused, (v) => {
    settings.isMusicOnlyWhenFocused = v;
    saveSettings(settings);
    onFocusSettingChange?.();
  });
  panel.appendChild(focusRow);

  // Graphics quality switch — placed before Reduced Particles so we can control
  // the checkbox state when Auto or Low is selected.
  const graphicsRow = createSelectRow(
    'Graphics Quality',
    settings.graphicsQuality,
    [
      { value: 'auto', label: 'Auto (recommended)' },
      { value: 'high', label: 'High' },
      { value: 'low',  label: 'Low' },
    ],
    (v) => {
      settings.graphicsQuality = v as SettingsState['graphicsQuality'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
      _updateParticleRowState();
    },
  );
  panel.appendChild(graphicsRow);

  const fpsLimitRow = createSelectRow(
    'FPS Limit',
    String(settings.fpsLimit),
    [
      { value: '60', label: '60' },
      { value: '120', label: '120' },
      { value: 'unlimited', label: 'Unlimited' },
    ],
    (v) => {
      settings.fpsLimit = v === '60' ? 60 : v === '120' ? 120 : 'unlimited';
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  panel.appendChild(fpsLimitRow);

  // Reduced particles toggle — disabled (and forced checked) when Auto or Low is active.
  const particleRow = createToggleRow('Reduced Particles', settings.isReducedParticles, (v) => {
    settings.isReducedParticles = v;
    saveSettings(settings);
    audioSystem?.onSettingsChanged();
  });
  panel.appendChild(particleRow);

  const _particleCheckbox = particleRow.querySelector('input[type="checkbox"]') as HTMLInputElement;

  function _updateParticleRowState(): void {
    const forceReduced = settings.graphicsQuality === 'auto' || settings.graphicsQuality === 'low';
    _particleCheckbox.disabled = forceReduced;
    if (forceReduced) {
      _particleCheckbox.checked = true;
      _particleCheckbox.style.opacity = '0.5';
      _particleCheckbox.style.cursor = 'not-allowed';
    } else {
      _particleCheckbox.checked = settings.isReducedParticles;
      _particleCheckbox.style.opacity = '';
      _particleCheckbox.style.cursor = '';
    }
  }

  // Set initial state.
  _updateParticleRowState();

  // Background style selector
  const bgStyleRow = createSelectRow(
    'Background Style',
    settings.backgroundStyle,
    [
      { value: 'vermiculate', label: 'Vermiculate' },
      { value: 'substrate',   label: 'Substrate' },
      { value: 'none',        label: 'None' },
    ],
    (v) => {
      settings.backgroundStyle = v as SettingsState['backgroundStyle'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  panel.appendChild(bgStyleRow);

  // Idle canvas render style selector
  const idleCanvasRenderStyleRow = createSelectRow(
    'Idle Canvas Render',
    settings.idleCanvasRenderStyle,
    [
      { value: 'pixelated', label: 'Pixelated' },
      { value: 'crisp',     label: 'Crisp / HiDPI' },
    ],
    (v) => {
      settings.idleCanvasRenderStyle = v as SettingsState['idleCanvasRenderStyle'];
      saveSettings(settings);
      onIdleCanvasRenderStyleChange?.();
      audioSystem?.onSettingsChanged();
    },
  );
  panel.appendChild(idleCanvasRenderStyleRow);

  // Number format selector
  const numberFormatRow = createSelectRow(
    'Number Format',
    settings.numberFormat,
    [
      { value: 'letters',     label: 'Letters (M, B…)' },
      { value: 'scientific',  label: 'Scientific (1.23e6)' },
      { value: 'engineering', label: 'Engineering (1.23×10⁶)' },
    ],
    (v) => {
      settings.numberFormat = v as SettingsState['numberFormat'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  panel.appendChild(numberFormatRow);

  const enemyIndicatorRow = createSelectRow(
    'RPG Enemy Indicator',
    settings.rpgEnemyIndicatorStyle,
    [
      { value: 'triangle', label: 'Triangle' },
      { value: 'outline',  label: 'Red Outline' },
      { value: 'off',      label: 'OFF' },
    ],
    (v) => {
      settings.rpgEnemyIndicatorStyle = v as SettingsState['rpgEnemyIndicatorStyle'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  panel.appendChild(enemyIndicatorRow);

  const generatorEquationVisibilityRow = createSelectRow(
    'Loom Rate Visibility',
    settings.generatorEquationVisibility,
    [
      { value: 'always',    label: 'Always On' },
      { value: 'proximity', label: 'Proximity' },
      { value: 'off',       label: 'Always Off' },
    ],
    (v) => {
      settings.generatorEquationVisibility = v as SettingsState['generatorEquationVisibility'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  panel.appendChild(generatorEquationVisibilityRow);

  // Screen shake toggle
  const shakeRow = createToggleRow('Screen Shake', settings.isScreenShakeEnabled, (v) => {
    settings.isScreenShakeEnabled = v;
    saveSettings(settings);
    audioSystem?.onSettingsChanged();
  });
  panel.appendChild(shakeRow);

  // Skip idle pop up at start toggle
  const skipIdlePopupRow = createToggleRow('Skip idle pop up at start', settings.skipIdlePopupAtStart, (v) => {
    settings.skipIdlePopupAtStart = v;
    saveSettings(settings);
  });
  panel.appendChild(skipIdlePopupRow);

  // Developer mode toggle — devSection is created here so the toggle callback can
  // reference it immediately; it is appended to the panel later (after credits).
  const devSection = createDevTweaksSection();
  devSection.style.display = settings.isDevMode ? '' : 'none';

  // Dev-mode-only visual toggles (idle-canvas diagnostics, etc.)
  const idleViewportDebugRow = createToggleRow(
    'Idle Viewport Debug',
    settings.isIdleViewportDebugEnabled,
    (v) => {
      settings.isIdleViewportDebugEnabled = v;
      saveSettings(settings);
    },
  );
  idleViewportDebugRow.style.display = settings.isDevMode ? '' : 'none';

  // Balance Forecast panel — also dev-mode only
  const balanceForecastPanel = createBalanceForecastPanel();
  balanceForecastPanel.setDevMode(settings.isDevMode);

  // Developer playtesting panel — also dev-mode only
  const devPanel = createDevPanel();
  devPanel.element.style.display = settings.isDevMode ? '' : 'none';

  const devModeRow = createToggleRow('Developer Mode', settings.isDevMode, (v) => {
    settings.isDevMode = v;
    saveSettings(settings);
    audioSystem?.onSettingsChanged();
    devSection.style.display = v ? '' : 'none';
    idleViewportDebugRow.style.display = v ? '' : 'none';
    balanceForecastPanel.setDevMode(v);
    devPanel.element.style.display = v ? '' : 'none';
  });
  panel.appendChild(devModeRow);
  panel.appendChild(idleViewportDebugRow);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'settings-btn';
  saveBtn.textContent = '💾 Save Game';
  saveBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dispatch({ kind: 'save_game' });
  });
  panel.appendChild(saveBtn);

  // Reset button
  const resetBtn = document.createElement('button');
  resetBtn.className = 'settings-btn danger';
  resetBtn.textContent = '🗑 Reset Game';

  let isResetConfirmOpen = false;
  resetBtn.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isResetConfirmOpen) return;
    isResetConfirmOpen = true;

    const shouldReset = confirm('Are you sure you want to reset all progress?');
    isResetConfirmOpen = false;

    if (shouldReset) {
      dispatch({ kind: 'reset_game' });
    }
  });
  panel.appendChild(resetBtn);

  // Credits
  const credits = document.createElement('div');
  credits.className = 'credits';
  credits.innerHTML = `
    <p>Equatoria Idle — Build #${BUILD_NUMBER}</p>
  `;
  panel.appendChild(credits);

  // Dev-mode particle tweaks — appended after credits so it sits at the bottom
  panel.appendChild(devSection);

  // Developer playtesting panel — appended after particle tweaks
  panel.appendChild(devPanel.element);

  // Balance Forecast panel — appended after dev panel
  panel.appendChild(balanceForecastPanel.element);

  // Small page break at the end of the settings panel
  panel.appendChild(makePageBreak('small'));

  return {
    element: panel,
    getSettings: () => settings,
    balanceForecastPanel,
    devPanel,
    registerDevHooks(hooks: DevPanelHooks): void {
      devPanel.setHooks(hooks);
    },
  };
}
