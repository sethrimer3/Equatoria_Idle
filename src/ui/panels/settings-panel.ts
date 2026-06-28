import type { ActionHandler } from '../../input';
import type { SettingsState } from '../../settings';
import { saveSettings } from '../../settings';
import type { AudioSystem } from '../../audio';
import type { GameState } from '../../sim';
import { ACHIEVEMENT_DEFINITIONS } from '../../data/achievements';
import { makePageBreak } from '../ui-helpers';
import { BUILD_NUMBER } from '../../buildInfo';
import { createBalanceForecastPanel, type BalanceForecastPanel } from './balance-forecast/balance-forecast-panel';
import { createDevPanel, type DevPanel, type DevPanelHooks } from './dev-panel';
import { createSliderRow, createToggleRow, createSelectRow } from './settings-panel-controls';
import { createDevTweaksSection } from './settings-panel-dev-tweaks';
import { createSparkleSystem } from './achievements-panel-sparkle';

/**
 * Settings panel — four sub-tabs: Audio, Visual, Gameplay, Profile.
 */
export interface SettingsPanel {
  element: HTMLElement;
  getSettings(): SettingsState;
  update(state: GameState): void;
  /** The embedded Balance Forecast dev panel (dev mode only). */
  balanceForecastPanel: BalanceForecastPanel;
  /** The embedded developer playtesting panel (dev mode only). */
  devPanel: DevPanel;
  /** Wire up the dev panel after rpgRender and game are available. */
  registerDevHooks(hooks: DevPanelHooks): void;
}

type SubTabId = 'audio' | 'visual' | 'gameplay' | 'profile';

function formatElapsedTime(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours}h ${minutes}m ${seconds}s`;
  if (minutes > 0) return `${minutes}m ${seconds}s`;
  return `${seconds}s`;
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

  // ── Sub-tab bar ──────────────────────────────────────────────────

  const subTabBar = document.createElement('div');
  subTabBar.className = 'settings-sub-tab-bar';
  panel.appendChild(subTabBar);

  const tabDefs: { id: SubTabId; label: string }[] = [
    { id: 'audio',    label: 'Audio'    },
    { id: 'visual',   label: 'Visual'   },
    { id: 'gameplay', label: 'Gameplay' },
    { id: 'profile',  label: 'Profile'  },
  ];

  const tabButtons = new Map<SubTabId, HTMLButtonElement>();
  const tabPanes   = new Map<SubTabId, HTMLElement>();

  for (const def of tabDefs) {
    const btn = document.createElement('button');
    btn.className = 'settings-sub-tab-btn';
    btn.textContent = def.label;
    btn.setAttribute('data-tab', def.id);
    btn.addEventListener('click', () => showTab(def.id));
    subTabBar.appendChild(btn);
    tabButtons.set(def.id, btn);

    const pane = document.createElement('div');
    pane.className = 'settings-sub-pane';
    pane.style.display = 'none';
    panel.appendChild(pane);
    tabPanes.set(def.id, pane);
  }

  // ── Profile tab sparkle (runs until game is purchased) ──────────

  const profileTabSparkle = createSparkleSystem();
  const profileBtn = tabButtons.get('profile')!;
  profileBtn.classList.add('settings-sub-tab-btn--profile');
  // Start sparkling immediately (will stop once isGamePurchased becomes true)
  profileTabSparkle.setSparkleEmitter(profileBtn, true);

  // ── Sub-tab switching ────────────────────────────────────────────

  function showTab(id: SubTabId): void {
    for (const [tid, btn] of tabButtons) {
      btn.classList.toggle('active', tid === id);
    }
    for (const [tid, pane] of tabPanes) {
      pane.style.display = tid === id ? '' : 'none';
    }
  }

  // ── Helper to get a pane ─────────────────────────────────────────

  function pane(id: SubTabId): HTMLElement {
    return tabPanes.get(id)!;
  }

  // ── AUDIO TAB ───────────────────────────────────────────────────

  const sfxRow = createSliderRow('SFX Volume', settings.sfxVolume, (v) => {
    settings.sfxVolume = v;
    saveSettings(settings);
    audioSystem?.setSfxVolume(v);
    audioSystem?.onSettingsChanged();
  });
  pane('audio').appendChild(sfxRow);

  const musicRow = createSliderRow('Music Volume', settings.musicVolume, (v) => {
    settings.musicVolume = v;
    saveSettings(settings);
    audioSystem?.setMusicVolume(v);
  });
  pane('audio').appendChild(musicRow);

  const focusRow = createToggleRow('Music/SFX Only When Focused', settings.isMusicOnlyWhenFocused, (v) => {
    settings.isMusicOnlyWhenFocused = v;
    saveSettings(settings);
    onFocusSettingChange?.();
  });
  pane('audio').appendChild(focusRow);

  // ── VISUAL TAB ──────────────────────────────────────────────────

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
  pane('visual').appendChild(graphicsRow);

  const fpsLimitRow = createSelectRow(
    'FPS Limit',
    String(settings.fpsLimit),
    [
      { value: '60',        label: '60'        },
      { value: '120',       label: '120'       },
      { value: 'unlimited', label: 'Unlimited' },
    ],
    (v) => {
      settings.fpsLimit = v === '60' ? 60 : v === '120' ? 120 : 'unlimited';
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  pane('visual').appendChild(fpsLimitRow);

  const particleRow = createToggleRow('Reduced Particles', settings.isReducedParticles, (v) => {
    settings.isReducedParticles = v;
    saveSettings(settings);
    audioSystem?.onSettingsChanged();
  });
  pane('visual').appendChild(particleRow);

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
  _updateParticleRowState();

  const bgStyleRow = createSelectRow(
    'Background Style',
    settings.backgroundStyle,
    [
      { value: 'vermiculate', label: 'Vermiculate' },
      { value: 'substrate',   label: 'Substrate'   },
      { value: 'none',        label: 'None'         },
    ],
    (v) => {
      settings.backgroundStyle = v as SettingsState['backgroundStyle'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  pane('visual').appendChild(bgStyleRow);

  const idleCanvasRenderStyleRow = createSelectRow(
    'Idle Canvas Render',
    settings.idleCanvasRenderStyle,
    [
      { value: 'pixelated', label: 'Pixelated'    },
      { value: 'crisp',     label: 'Crisp / HiDPI' },
    ],
    (v) => {
      settings.idleCanvasRenderStyle = v as SettingsState['idleCanvasRenderStyle'];
      saveSettings(settings);
      onIdleCanvasRenderStyleChange?.();
      audioSystem?.onSettingsChanged();
    },
  );
  pane('visual').appendChild(idleCanvasRenderStyleRow);

  const shakeRow = createToggleRow('Screen Shake', settings.isScreenShakeEnabled, (v) => {
    settings.isScreenShakeEnabled = v;
    saveSettings(settings);
    audioSystem?.onSettingsChanged();
  });
  pane('visual').appendChild(shakeRow);

  const enemyIndicatorRow = createSelectRow(
    'RPG Enemy Indicator',
    settings.rpgEnemyIndicatorStyle,
    [
      { value: 'triangle', label: 'Triangle'   },
      { value: 'outline',  label: 'Red Outline' },
      { value: 'off',      label: 'OFF'         },
    ],
    (v) => {
      settings.rpgEnemyIndicatorStyle = v as SettingsState['rpgEnemyIndicatorStyle'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  pane('visual').appendChild(enemyIndicatorRow);

  const idleViewportDebugRow = createToggleRow(
    'Idle Viewport Debug',
    settings.isIdleViewportDebugEnabled,
    (v) => {
      settings.isIdleViewportDebugEnabled = v;
      saveSettings(settings);
    },
  );
  idleViewportDebugRow.style.display = settings.isDevMode ? '' : 'none';
  pane('visual').appendChild(idleViewportDebugRow);

  // ── GAMEPLAY TAB ─────────────────────────────────────────────────

  const numberFormatRow = createSelectRow(
    'Number Format',
    settings.numberFormat,
    [
      { value: 'letters',     label: 'Letters (M, B…)'      },
      { value: 'scientific',  label: 'Scientific (1.23e6)'   },
      { value: 'engineering', label: 'Engineering (1.23×10⁶)' },
    ],
    (v) => {
      settings.numberFormat = v as SettingsState['numberFormat'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  pane('gameplay').appendChild(numberFormatRow);

  const generatorEquationVisibilityRow = createSelectRow(
    'Loom Rate Visibility',
    settings.generatorEquationVisibility,
    [
      { value: 'always',    label: 'Always On'  },
      { value: 'proximity', label: 'Proximity'  },
      { value: 'off',       label: 'Always Off' },
    ],
    (v) => {
      settings.generatorEquationVisibility = v as SettingsState['generatorEquationVisibility'];
      saveSettings(settings);
      audioSystem?.onSettingsChanged();
    },
  );
  pane('gameplay').appendChild(generatorEquationVisibilityRow);

  const skipIdlePopupRow = createToggleRow('Skip idle pop up at start', settings.skipIdlePopupAtStart, (v) => {
    settings.skipIdlePopupAtStart = v;
    saveSettings(settings);
  });
  pane('gameplay').appendChild(skipIdlePopupRow);

  // Dev section and dev panel (live in Profile tab but toggled by devModeRow)
  const devSection = createDevTweaksSection();
  devSection.style.display = settings.isDevMode ? '' : 'none';

  const balanceForecastPanel = createBalanceForecastPanel();
  balanceForecastPanel.setDevMode(settings.isDevMode);

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
  pane('gameplay').appendChild(devModeRow);

  // ── PROFILE TAB ──────────────────────────────────────────────────

  const profilePane = pane('profile');

  // Purchase button with sparkle
  const purchaseSparkle = createSparkleSystem();

  const purchaseBtn = document.createElement('button');
  purchaseBtn.className = 'settings-btn settings-purchase-btn';
  purchaseBtn.textContent = '✨ Purchase Game — $4.99';
  purchaseBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    // Purchase flow will be wired up later
  });
  profilePane.appendChild(purchaseBtn);
  purchaseSparkle.setSparkleEmitter(purchaseBtn, true);

  // Stats section
  const statsSection = document.createElement('div');
  statsSection.className = 'settings-profile-stats';
  profilePane.appendChild(statsSection);

  function makeStatRow(label: string): { row: HTMLElement; valueEl: HTMLElement } {
    const row = document.createElement('div');
    row.className = 'settings-profile-stat-row';
    const labelEl = document.createElement('span');
    labelEl.className = 'settings-profile-stat-label';
    labelEl.textContent = label;
    const valueEl = document.createElement('span');
    valueEl.className = 'settings-profile-stat-value';
    row.appendChild(labelEl);
    row.appendChild(valueEl);
    return { row, valueEl };
  }

  const { row: timeRow,    valueEl: timeValue    } = makeStatRow('Time Played');
  const { row: achRow,     valueEl: achValue     } = makeStatRow('Achievements');
  const { row: claimedRow, valueEl: claimedValue } = makeStatRow('Bonuses Claimed');
  const { row: tiersRow,   valueEl: tiersValue   } = makeStatRow('Tiers Unlocked');
  const { row: upgradesRow, valueEl: upgradesValue } = makeStatRow('Upgrades Purchased');

  statsSection.appendChild(timeRow);
  statsSection.appendChild(achRow);
  statsSection.appendChild(claimedRow);
  statsSection.appendChild(tiersRow);
  statsSection.appendChild(upgradesRow);

  // Save button
  const saveBtn = document.createElement('button');
  saveBtn.className = 'settings-btn';
  saveBtn.textContent = '💾 Save Game';
  saveBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dispatch({ kind: 'save_game' });
  });
  profilePane.appendChild(saveBtn);

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
    if (shouldReset) dispatch({ kind: 'reset_game' });
  });
  profilePane.appendChild(resetBtn);

  // Page break before dev section
  profilePane.appendChild(makePageBreak('small'));

  // Credits / build info
  const credits = document.createElement('div');
  credits.className = 'credits';
  credits.innerHTML = `<p>Equatoria Idle — Build #${BUILD_NUMBER}</p>`;
  profilePane.appendChild(credits);

  // Dev-mode tools (appended after credits)
  profilePane.appendChild(devSection);
  profilePane.appendChild(devPanel.element);
  profilePane.appendChild(balanceForecastPanel.element);

  // ── Activate first tab ───────────────────────────────────────────

  showTab('audio');

  // ── Update method ────────────────────────────────────────────────

  function update(state: GameState): void {
    const totalAchievements = ACHIEVEMENT_DEFINITIONS.length;
    const unlocked = state.achievements.unlockedIds.size;
    const claimed  = state.achievements.claimedIds.size;
    let totalUpgrades = 0;
    for (const lvl of state.progression.upgradeLevels.values()) totalUpgrades += lvl;

    timeValue.textContent    = formatElapsedTime(state.elapsedMs);
    achValue.textContent     = `${unlocked} / ${totalAchievements}`;
    claimedValue.textContent = String(claimed);
    tiersValue.textContent   = String(state.progression.unlockedTierCount);
    upgradesValue.textContent = String(totalUpgrades);

    if (settings.isDevMode) {
      balanceForecastPanel.update(state);
    }
  }

  // Small page break at very bottom of outer panel
  panel.appendChild(makePageBreak('small'));

  return {
    element: panel,
    getSettings: () => settings,
    update,
    balanceForecastPanel,
    devPanel,
    registerDevHooks(hooks: DevPanelHooks): void {
      devPanel.setHooks(hooks);
    },
  };
}
