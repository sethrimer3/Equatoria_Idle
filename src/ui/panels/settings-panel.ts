import type { ActionHandler } from '../../input';
import type { SettingsState } from '../../settings';
import { saveSettings } from '../../settings';
import type { AudioSystem } from '../../audio';

// ─── Slider glow constants ───────────────────────────────────────

/** Dark gold RGB used at 0% slider value. */
const DARK_GOLD_RGB  = [100,  95, 45] as const;
/** Bright gold RGB used at 100% slider value. */
const BRIGHT_GOLD_RGB = [255, 241, 114] as const;
/** Maximum glow blur radius in px (at 100%). */
const MAX_GLOW_RADIUS_PX = 8;
/** Maximum glow alpha (at 100%). */
const MAX_GLOW_ALPHA = 0.65;
/** Maximum box-shadow blur radius in px for the slider wrapper border glow (at 100%). */
const MAX_BORDER_GLOW_RADIUS_PX = 6;
/** Slider value (0–1) below which glow is suppressed to avoid dim artefacts near 0%. */
const MIN_GLOW_THRESHOLD = 0.25;

/**
 * Settings panel — DOM-based settings controls.
 */
export interface SettingsPanel {
  element: HTMLElement;
  getSettings(): SettingsState;
}

export function createSettingsPanel(
  settings: SettingsState,
  dispatch: ActionHandler,
  audioSystem?: AudioSystem,
  onFocusSettingChange?: () => void,
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

  // Reduced particles toggle
  const particleRow = createToggleRow('Reduced Particles', settings.isReducedParticles, (v) => {
    settings.isReducedParticles = v;
    saveSettings(settings);
    audioSystem?.onSettingsChanged();
  });
  panel.appendChild(particleRow);

  // Graphics quality switch
  const graphicsRow = createSelectRow(
    'Graphics Quality',
    settings.graphicsQuality,
    [
      { value: 'high', label: 'High' },
      { value: 'low', label: 'Low' },
    ],
    (v) => {
      settings.graphicsQuality = v as SettingsState['graphicsQuality'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  panel.appendChild(graphicsRow);

  // Background style selector
  const bgStyleRow = createSelectRow(
    'Background Style',
    settings.backgroundStyle,
    [
      { value: 'vermiculate', label: 'Vermiculate' },
      { value: 'substrate',   label: 'Substrate (Crystal)' },
      { value: 'none',        label: 'None' },
    ],
    (v) => {
      settings.backgroundStyle = v as SettingsState['backgroundStyle'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  panel.appendChild(bgStyleRow);

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

  // Screen shake toggle
  const shakeRow = createToggleRow('Screen Shake', settings.isScreenShakeEnabled, (v) => {
    settings.isScreenShakeEnabled = v;
    saveSettings(settings);
    audioSystem?.onSettingsChanged();
  });
  panel.appendChild(shakeRow);

  // Developer mode toggle
  const devModeRow = createToggleRow('Developer Mode', settings.isDevMode, (v) => {
    settings.isDevMode = v;
    saveSettings(settings);
    audioSystem?.onSettingsChanged();
  });
  panel.appendChild(devModeRow);

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
    <p>Equatoria Idle v0.1.0</p>
    <p>A mathematical idle adventure</p>
  `;
  panel.appendChild(credits);

  // Small page break at the end of the settings panel
  const pageBreakEnd = document.createElement('img');
  pageBreakEnd.src = '/ASSETS/SPRITES/menuElements/pageBreak_small.png';
  pageBreakEnd.alt = '';
  pageBreakEnd.className = 'page-break-small';
  panel.appendChild(pageBreakEnd);

  return {
    element: panel,
    getSettings: () => settings,
  };
}

function createSliderRow(
  label: string,
  initialValue: number,
  onChange: (value: number) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  row.appendChild(lbl);

  const sliderWrapper = document.createElement('div');
  sliderWrapper.className = 'settings-slider-wrapper';

  const slider = document.createElement('input');
  slider.type = 'range';
  slider.min = '0';
  slider.max = '100';
  slider.value = String(Math.round(initialValue * 100));
  slider.className = 'settings-slider';

  const pctLabel = document.createElement('span');
  pctLabel.className = 'settings-slider-pct';

  function updateGlow(v: number): void {
    // v is 0–1; interpolate between dark gold and bright gold
    const r = Math.round(DARK_GOLD_RGB[0] + (BRIGHT_GOLD_RGB[0] - DARK_GOLD_RGB[0]) * v);
    const g = Math.round(DARK_GOLD_RGB[1] + (BRIGHT_GOLD_RGB[1] - DARK_GOLD_RGB[1]) * v);
    const b = Math.round(DARK_GOLD_RGB[2] + (BRIGHT_GOLD_RGB[2] - DARK_GOLD_RGB[2]) * v);
    const color = `rgb(${r},${g},${b})`;
    const glowPx = Math.round(v * MAX_GLOW_RADIUS_PX);
    const glowAlpha = v * MAX_GLOW_ALPHA;
    const glowColor = `rgba(${r},${g},${b},${glowAlpha})`;

    pctLabel.textContent = `${Math.round(v * 100)}%`;
    pctLabel.style.color = color;
    pctLabel.style.textShadow = v > MIN_GLOW_THRESHOLD ? `0 0 ${glowPx}px ${glowColor}` : 'none';

    sliderWrapper.style.borderColor = color;
    sliderWrapper.style.boxShadow = v > MIN_GLOW_THRESHOLD ? `0 0 ${Math.round(v * MAX_BORDER_GLOW_RADIUS_PX)}px ${glowColor}` : 'none';
  }

  updateGlow(initialValue);

  slider.addEventListener('input', () => {
    const v = parseInt(slider.value) / 100;
    updateGlow(v);
    onChange(v);
  });

  sliderWrapper.appendChild(slider);
  row.appendChild(sliderWrapper);
  row.appendChild(pctLabel);

  return row;
}

function createToggleRow(
  label: string,
  initialValue: boolean,
  onChange: (value: boolean) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  row.appendChild(lbl);

  const checkbox = document.createElement('input');
  checkbox.type = 'checkbox';
  checkbox.checked = initialValue;
  checkbox.className = 'settings-checkbox';
  checkbox.addEventListener('change', () => {
    onChange(checkbox.checked);
  });
  row.appendChild(checkbox);

  return row;
}

function createSelectRow(
  label: string,
  initialValue: string,
  options: Array<{ value: string; label: string }>,
  onChange: (value: string) => void,
): HTMLElement {
  const row = document.createElement('div');
  row.className = 'settings-row';

  const lbl = document.createElement('label');
  lbl.textContent = label;
  row.appendChild(lbl);

  const select = document.createElement('select');
  select.className = 'settings-select';
  for (const optionDef of options) {
    const option = document.createElement('option');
    option.value = optionDef.value;
    option.textContent = optionDef.label;
    select.appendChild(option);
  }
  select.value = initialValue;
  select.addEventListener('change', () => {
    onChange(select.value);
  });
  row.appendChild(select);

  return row;
}
