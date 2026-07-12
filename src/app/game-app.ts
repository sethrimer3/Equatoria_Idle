/**
 * game-app.ts — Application entry point and bootstrap.
 *
 * The game-app orchestrator has been split into focused modules:
 *   - app-types.ts      — AppState and UIPanels interfaces
 *   - app-actions.ts    — action dispatch, tab switching, UI updates
 *   - app-game-loop.ts  — frame-by-frame game loop and render pipeline
 *   - game-app.ts       — this file: bootstrap wiring only
 */

import { createGameState } from '../sim';
import type { TierId } from '../data/tiers';
import {
  createGameCanvas,
  resizeCanvas,
  ParticleSystem,
} from '../render';
import { preloadGeneratorSprites } from '../render/generators/generator-renderer';
import { preloadForgeSprites } from '../render/forge/forge-renderer';
import { preloadRefinedGemSprites } from '../render/assets/refined-gem-preload';
import { createBackgroundAnimation, createVermiculateEffect, createSubstrateEffect } from '../render/background';
import { type GameAction } from '../input';
import { createParticleDragState } from '../input/particle-drag';
import { createTabBar } from '../ui/tabs';
import { createUpgradePanel, createResourcePanel, createSettingsPanel, createLoomPanel, createEquationPanel, createAchievementsPanel } from '../ui/panels';
import { createHudOverlay } from '../ui/hud/hud-overlay';
import { createLoadingScreen, selectStartupTip } from '../ui/loading';
import { applyFontSizeOffset, loadSettings, saveGame, loadGame, deleteSave, readLastActiveTimestamp, writeLastActiveTimestamp, saveSettings } from '../settings';
import { TIERS } from '../data/tiers';
// createForgeCrunchState no longer needed here; appState.forge === game.forge directly
import {
  createGeneratorState,
  computeGeneratorPositions,
} from '../sim/particles';
import { SPAWNER_GRAVITY_RADIUS } from '../data/particles/particle-config';
import { createAudioSystem } from '../audio';
import { MAX_OFFLINE_HOURS } from '../data/balance';
import { createTraceEffect } from '../render/ui/trace-effect';
import { createRpgRender } from '../render/rpg/rpg-render';
import { createRpgMenuPanel } from '../ui/panels/rpg-menu-panel';
import { addMotes } from '../sim/resources/resource-state';
import {
  ENEMY_CODEX_GLOW_ICON_PATH,
  ENEMY_CODEX_ICON_PATH,
  ENEMY_CODEX_SHARD_ICON_PATHS,
  SKILL_CODEX_GLOW_ICON_PATH,
  SKILL_CODEX_ICON_PATH,
  SKILL_CODEX_SHARD_ICON_PATHS,
} from '../render/assets/asset-paths';

import type { AppState, UIPanels } from './app-types';
import { handleAction as handleActionImpl, setActiveTab } from './app-actions';
import { createGameLoop } from './app-game-loop';
import { applyIdleRewardsIfEligible } from './game-app-idle';
import { wireCanvasPointerInput } from './game-app-canvas-input';
import { createIdleOverlay } from '../ui/idle/idle-overlay';
import { makePageBreak } from '../ui/ui-helpers';
import { AchievementService } from '../achievements/achievementService';
import { clearAchievementService, setAchievementService } from '../achievements/achievementHooks';
import { createAppRuntimeOwner, type AppRuntime, type AppRuntimeOwner } from './app-runtime';
import { createAppWindowLifecycle, createSkillPointUnreadTracker } from './app-lifecycle';

// ─── Bootstrap ──────────────────────────────────────────────────

export async function startApp(): Promise<AppRuntime> {
  const root = document.getElementById('app')!;
  const runtimeOwner = createAppRuntimeOwner(root);
  root.replaceChildren();
  try {
    return await startOwnedApp(root, runtimeOwner);
  } catch (error) {
    runtimeOwner.runtime.dispose();
    throw error;
  }
}

async function startOwnedApp(root: HTMLElement, runtimeOwner: AppRuntimeOwner): Promise<AppRuntime> {

  // ── Loading screen ──
  const loadingScreen = await createLoadingScreen();
  root.appendChild(loadingScreen.element);
  runtimeOwner.addCleanup(() => loadingScreen.dispose());

  // ── Preload essential sprites ──
  preloadGeneratorSprites();
  preloadForgeSprites();
  preloadRefinedGemSprites();

  // ── Initialize game state ──
  const resetPending = sessionStorage.getItem('equatoria_reset_pending') === '1';
  if (resetPending) {
    deleteSave();
    sessionStorage.removeItem('equatoria_reset_pending');
  }
  const lastActiveTs = readLastActiveTimestamp();
  writeLastActiveTimestamp(); // immediately record so next session measures from now
  const savedGame = loadGame();
  const game = savedGame ?? createGameState();
  const achievementService = new AchievementService(game.platformAchievements);
  setAchievementService(achievementService);
  runtimeOwner.addCleanup(() => {
    clearAchievementService(achievementService);
    achievementService.dispose();
  });
  const settings = loadSettings();
  applyFontSizeOffset(settings.fontSizeOffsetPx);
  if (settings.showTipOnStartup) {
    const tip = selectStartupTip(game.startupTips);
    loadingScreen.setTip(tip?.text ?? null);
    if (tip) saveGame(game);
  }

  // ── Preload Poiret One font for canvas rendering ──
  try {
    await document.fonts.load("bold 12px 'Poiret One'");
  } catch (err) {
    console.warn('Failed to preload Poiret One font:', err);
  }

  // ── Preload Pixelify Sans font for damage numbers ──
  try {
    await document.fonts.load("bold 14px 'Pixelify Sans'");
  } catch {
    // non-critical
  }

  // ── Preload BJ Cree font for secret achievement display ──
  try {
    await document.fonts.load("400 14px 'BJ Cree'");
  } catch {
    // non-critical
  }

  const generatorState = createGeneratorState();

  // ── Audio system ──
  const audioSystem = createAudioSystem(settings.musicVolume, settings.sfxVolume);
  runtimeOwner.addCleanup(() => audioSystem.dispose());

  const appState: AppState = {
    game,
    activeTab: 'equation',
    tapFlashAlpha: 0,
    animPulse: 0,
    forge: game.forge,
    generatorState,
    particleDrag: createParticleDragState(),
    lastTapCanvasX: 0,
    lastTapCanvasY: 0,
    lastTapTimeMs: 0,
    forgeSacrificeFlashMs: 0,
    lastRefinedCrystalsGained: new Map(),
  };

  // ── Background effects ──
  const bgAnimation = createBackgroundAnimation();
  root.appendChild(bgAnimation.canvas);
  runtimeOwner.addCleanup(() => bgAnimation.destroy());

  const vermiculateEffect = createVermiculateEffect();
  runtimeOwner.addCleanup(() => vermiculateEffect.destroy());
  const substrateEffect = createSubstrateEffect({
    quality: settings.graphicsQuality === 'low' ? 'low' : 'high',
  });
  runtimeOwner.addCleanup(() => substrateEffect.destroy());

  // ── Canvas container (full screen) ──
  const canvasContainer = document.createElement('div');
  canvasContainer.id = 'canvas-container';
  root.appendChild(canvasContainer);

  const cc = createGameCanvas(canvasContainer);

  // Apply the persisted idle canvas render style immediately so the first
  // frame already uses the correct backing store / image-rendering mode.
  cc.idleCanvasRenderStyle = settings.idleCanvasRenderStyle;
  cc.renderResolutionQuality = settings.renderResolutionQuality;
  resizeCanvas(cc, canvasContainer);

  // ── HUD overlay (DOM layer above canvas, non-pixelated) ──
  // Appended to cc.gameArea (not canvasContainer) so that percentage-based
  // generator-label positions remain correctly mapped to logical canvas
  // coordinates when the game area is letterboxed or pillarboxed.
  const hudOverlay = createHudOverlay();
  cc.gameArea.appendChild(hudOverlay.element);

  // ── Idle reward overlay ──
  const idleOverlay = createIdleOverlay();
  root.appendChild(idleOverlay.element);
  runtimeOwner.addCleanup(() => idleOverlay.dispose());

  // ── Panels overlay container ──
  const panelsContainer = document.createElement('div');
  panelsContainer.id = 'panels-container';
  root.appendChild(panelsContainer);

  const panelsInner = document.createElement('div');
  panelsInner.className = 'panels-inner';
  panelsContainer.appendChild(panelsInner);

  // ── Particle system ──
  const particles = new ParticleSystem();

  // ── Generator management ──
  function recomputeGenerators(): void {
    const equationCenterX = cc.widthPx / 2;
    const equationCenterY = cc.heightPx / 2;
    const unlockedSet = new Set<TierId>();
    for (let i = 0; i < appState.game.progression.unlockedTierCount; i++) {
      if (TIERS[i]) unlockedSet.add(TIERS[i].id);
    }
    computeGeneratorPositions(
      appState.generatorState,
      cc.widthPx,
      cc.heightPx,
      equationCenterX,
      equationCenterY,
      unlockedSet,
      SPAWNER_GRAVITY_RADIUS,
    );
  }

  // ── Action dispatch ──
  let isResettingGame = false;

  const dispatch = (action: GameAction): void => {
    if (runtimeOwner.runtime.isDisposed) return;
    // Resume audio context on user interaction (autoplay policy)
    audioSystem.resumeContext().catch(() => { /* silently ignore */ });

    // Handle save/reset directly here since they need local closures
    if (action.kind === 'save_game') {
      saveGame(appState.game);
      return;
    }
    if (action.kind === 'reset_game') {
      // Clear the persisted game save (covers idle + RPG state), then refresh
      // the page. A page reload is required because RPG render holds significant
      // in-memory state (enemies, particles, weapons, wave manager) that cannot
      // be cleanly reset without re-running the full createRpgRender() bootstrap.
      isResettingGame = true;
      sessionStorage.setItem('equatoria_reset_pending', '1');
      deleteSave();
      location.reload();
      return;
    }
    handleActionImpl(appState, action, cc, particles, settings, uiPanels, recomputeGenerators, audioSystem);
  };

  // ── Focus-aware audio pause ──
  let isWindowFocused = document.visibilityState === 'visible';

  function applyFocusedAudio(): void {
    // If the setting is off, always keep audio running.
    audioSystem.setFocused(!settings.isMusicOnlyWhenFocused || isWindowFocused);
  }

  // ── Trace effect overlay (golden outline + tracer circles for UI highlights) ──
  const traceEffect = createTraceEffect(root);
  runtimeOwner.addCleanup(() => traceEffect.dispose());

  // ── UI panels ──
  const upgradePanel = createUpgradePanel(dispatch);
  // Equation panel is created first so we can pass its highlight callback to the resource panel.
  // We use a late-binding ref to avoid a circular setup order.
  let equationPanelRef: ReturnType<typeof createEquationPanel> | null = null;
  const resourcePanel = createResourcePanel((tierId) => {
    equationPanelRef?.setHighlightedTier(tierId);
  });
  // Late-bound so the render-resolution change handler can reach rpgRender,
  // which is created after the settings panel.
  let applyRenderResolutionQuality: () => void = () => {
    // Idle crisp canvas re-reads the policy on resize; RPG hook attached below.
    resizeCanvas(cc, canvasContainer);
    recomputeGenerators();
  };
  const settingsPanel = createSettingsPanel(settings, dispatch, audioSystem, applyFocusedAudio, () => {
    cc.idleCanvasRenderStyle = settings.idleCanvasRenderStyle;
    resizeCanvas(cc, canvasContainer);
    recomputeGenerators();
  }, () => { applyRenderResolutionQuality(); });
  runtimeOwner.addCleanup(() => settingsPanel.dispose());
  const achievementsPanel = createAchievementsPanel(dispatch, audioSystem);
  runtimeOwner.addCleanup(() => achievementsPanel.destroy());

  // Right column of the Equation sub-tab: mote resources on top, tier unlock
  // button at the bottom so new resources appear right above it when unlocked.
  const equationRightCol = document.createElement('div');
  equationRightCol.appendChild(resourcePanel.element);
  equationRightCol.appendChild(upgradePanel.element);

  // Equation panel with the right column injected into its two-column body.
  const equationPanel = createEquationPanel(dispatch, traceEffect, equationRightCol);
  equationPanelRef = equationPanel;

  // Wrap the equation panel in a thin container so it can be injected as the
  // "Equation" sub-tab of the combined Upgrades panel.
  const equationContentDiv = document.createElement('div');
  equationContentDiv.appendChild(equationPanel.element);

  const loomPanel = createLoomPanel(dispatch, traceEffect, equationContentDiv);
  runtimeOwner.addCleanup(() => loomPanel.dispose());

  // Prepend large page break to the top of each scrollable panel
  loomPanel.element.prepend(makePageBreak('large'));
  achievementsPanel.element.prepend(makePageBreak('large'));
  settingsPanel.element.prepend(makePageBreak('large'));

  panelsInner.appendChild(loomPanel.element);
  panelsInner.appendChild(achievementsPanel.element);
  panelsInner.appendChild(settingsPanel.element);

  // ── RPG container + render ──
  const rpgContainer = document.createElement('div');
  rpgContainer.id = 'rpg-container';
  rpgContainer.style.display = 'none';
  root.appendChild(rpgContainer);

  let setCodexUnread = (_unread: boolean): void => undefined;
  let setSkillCodexUnread = (_unread: boolean): void => undefined;
  const skillPointUnreadTracker = createSkillPointUnreadTracker({
    getUnspentSkillPoints: () => appState.game.rpg.unspentSkillPoints,
    setUnread: (unread) => { setSkillCodexUnread(unread); },
  });
  runtimeOwner.addCleanup(() => skillPointUnreadTracker.dispose());
  const rpgRender = createRpgRender(rpgContainer, appState.game.rpg, {
    onLuckyMoteCollected: (tierId: TierId, bonusPct: number) => {
      if (runtimeOwner.runtime.isDisposed) return;
      const current = appState.game.resources.moteTotals.get(tierId) ?? 0;
      // Apply percentage bonus; ensure at least 1 mote so the drop is never worthless
      // even when the player has not yet collected any motes of this tier.
      const bonus = Math.max(1, current * bonusPct / 100);
      addMotes(appState.game.resources, tierId, bonus);
    },
    getAchievementAtkBonus: () => appState.game.achievements.baseAtkBonus,
    onError: () => { audioSystem.onError(); },
    onNewCodexEntry: () => { setCodexUnread(true); },
    onBossCassetteStart: (path, onDone) => { audioSystem.bossCassetteStart(path, onDone); },
    onBossMusicStart: (beatLoop, bgLayers, onPrimaryTrackReady) => { audioSystem.startBossMusic(beatLoop, bgLayers, onPrimaryTrackReady); },
    onBossMusicStartWithCassette: (cassetteStart, beatLoop, bgLayers, onPrimaryTrackReady) => { audioSystem.startBossMusicWithCassette(cassetteStart, beatLoop, bgLayers, onPrimaryTrackReady); },
    onBossMusicStop: () => { audioSystem.stopBossMusic(); },
    onBossMusicStopWithCassette: (cassetteEnd, onDone) => { audioSystem.stopBossMusicWithCassette(cassetteEnd, onDone); },
    onBossMusicPhrase: (path) => { audioSystem.playBossMusicPhrase(path); },
    dispatch,
  });
  runtimeOwner.addCleanup(() => rpgRender.dispose());
  rpgRender.setNumberFormat(settings.numberFormat);
  rpgRender.setRenderResolutionQuality(settings.renderResolutionQuality);
  // Now that rpgRender exists, route render-resolution changes to both the RPG
  // renderer and the idle crisp canvas.
  applyRenderResolutionQuality = () => {
    rpgRender.setRenderResolutionQuality(settings.renderResolutionQuality);
    cc.renderResolutionQuality = settings.renderResolutionQuality;
    resizeCanvas(cc, canvasContainer);
    recomputeGenerators();
  };
  // Stats panel is positioned in the root (above the tab bar); visibility
  // is toggled by setActiveTab alongside rpgContainer.
  root.appendChild(rpgRender.statsPanel);

  // ── Wire dev panel hooks (dev playtesting tools) ──
  settingsPanel.registerDevHooks({
    rpgRender,
    getGame: () => appState.game,
  });

  // ── Helper: apply the RPG bar position setting to DOM elements ──
  function applyRpgRackPosition(position: 'bottom' | 'top' | 'hidden'): void {
    const atTop = position === 'top';
    rpgRender.statsPanel.classList.toggle('rpg-bar-at-top', atTop);
    rpgRender.statsPanel.classList.toggle('rpg-rack-hidden', position === 'hidden');
    rpgContainer.classList.toggle('rpg-bar-at-top', atTop);
    rpgContainer.classList.toggle('rpg-rack-hidden', position === 'hidden');
    rpgRender.resize(rpgContainer);
  }

  function applyRpgMenuButtonPosition(position: 'top' | 'bottom'): void {
    rpgContainer.classList.toggle('rpg-menu-button-at-bottom', position === 'bottom');
  }

  // ── RPG menu panel (replaces weapon store) ──
  const rpgMenuPanel = createRpgMenuPanel(
    dispatch,
    rpgRender.statsPanel,
    root,
    (position) => {
      settings.rpgRackPosition = position;
      saveSettings(settings);
      applyRpgRackPosition(position);
      rpgMenuPanel.setRpgRackPosition(position);
    },
    (position) => {
      settings.rpgMenuButtonPosition = position;
      saveSettings(settings);
      applyRpgMenuButtonPosition(position);
      rpgMenuPanel.setRpgMenuButtonPosition(position);
    },
    (position) => {
      settings.rpgZonePosition = position;
      saveSettings(settings);
      rpgRender.setZonePosition(position);
      rpgMenuPanel.setRpgZonePosition(position);
    },
  );
  runtimeOwner.addCleanup(() => rpgMenuPanel.dispose());
  rpgMenuPanel.element.style.display = 'none';
  root.appendChild(rpgMenuPanel.element);
  rpgRender.setRackAutoMoveToggleHandler(() => {
    rpgMenuPanel.setAutoMoveEnabled(!rpgMenuPanel.isAutoMoveEnabled);
    rpgRender.setRackAutoMoveEnabled(rpgMenuPanel.isAutoMoveEnabled);
  });
  rpgRender.setRackAutoMoveEnabled(rpgMenuPanel.isAutoMoveEnabled);

  // Apply saved bar position immediately after panel is in the DOM
  applyRpgRackPosition(settings.rpgRackPosition);
  rpgMenuPanel.setRpgRackPosition(settings.rpgRackPosition);
  applyRpgMenuButtonPosition(settings.rpgMenuButtonPosition);
  rpgMenuPanel.setRpgMenuButtonPosition(settings.rpgMenuButtonPosition);
  rpgRender.setZonePosition(settings.rpgZonePosition);
  rpgMenuPanel.setRpgZonePosition(settings.rpgZonePosition);
  rpgMenuPanel.setTopographicTerrainDebugEnabled(settings.isTopographicTerrainDebugEnabled);
  rpgMenuPanel.setSharpTopographyShadows(settings.isSharpTopographyShadows);
  rpgRender.setSharpTopographyShadows(settings.isSharpTopographyShadows);
  rpgMenuPanel.setDeveloperVisual('set_rpg_viewport_debug', settings.isRpgViewportDebugEnabled);
  rpgMenuPanel.setDeveloperVisual('set_rpg_pathfinding_debug', settings.isRpgPathfindingDebugEnabled);
  rpgMenuPanel.setDeveloperVisual('set_rpg_verdure_wall_debug', settings.isRpgVerdureWallDebugEnabled);
  rpgMenuPanel.setDeveloperVisual('set_rpg_nadir_anchor_debug', settings.isRpgNadirAnchorDebugEnabled);
  rpgMenuPanel.setDeveloperVisual('set_rpg_boss_stage_debug', settings.isRpgBossStageDebugEnabled);
  rpgMenuPanel.setDeveloperVisual('set_topography_lighting_debug', settings.isTopographyLightingDebugEnabled);
  rpgMenuPanel.setDeveloperVisual('set_soft_impetus_asteroid_shadows', settings.isSoftImpetusAsteroidShadows);
  rpgMenuPanel.setDeveloperVisual('set_rpg_debug_overlay', settings.isRpgDebugOverlayEnabled);
  rpgRender.setRpgDebugOverlay(settings.isRpgDebugOverlayEnabled);

  // ── Menu toggle button (appended to the stats panel by the renderer) ──
  const menuToggleBtn = document.createElement('button');
  menuToggleBtn.className = 'rpg-menu-btn';
  menuToggleBtn.textContent = '⚔ Menu';
  menuToggleBtn.setAttribute('aria-label', 'Open RPG menu');
  function toggleRpgMenu(): void {
    const nowVisible = !rpgMenuPanel.isVisible;
    rpgMenuPanel.setVisible(nowVisible);
    if (nowVisible) {
      rpgMenuPanel.update(appState.game.rpg, appState.game.resources, settings.numberFormat, settings.isDevMode);
    }
  }

  menuToggleBtn.addEventListener('click', toggleRpgMenu);
  rpgRender.menuButtonContainer.appendChild(menuToggleBtn);

  const hiddenRackMenuBtn = document.createElement('button');
  hiddenRackMenuBtn.className = 'rpg-hidden-rack-menu-btn';
  hiddenRackMenuBtn.textContent = menuToggleBtn.textContent;
  hiddenRackMenuBtn.setAttribute('aria-label', 'Open RPG menu');
  hiddenRackMenuBtn.addEventListener('click', toggleRpgMenu);
  rpgContainer.appendChild(hiddenRackMenuBtn);

  const codexBtn = document.createElement('button');
  codexBtn.className = 'rpg-codex-btn rpg-codex-shortcut';
  codexBtn.setAttribute('aria-label', 'Open enemy codex');
  const codexSpriteWrap = document.createElement('span');
  codexSpriteWrap.className = 'rpg-codex-shortcut__sprite';
  for (const [path, className] of [
    [ENEMY_CODEX_ICON_PATH, 'rpg-codex-shortcut__icon'],
    [ENEMY_CODEX_GLOW_ICON_PATH, 'rpg-codex-shortcut__icon rpg-codex-shortcut__icon--glow'],
  ] as const) {
    const image = document.createElement('img');
    image.src = path;
    image.className = className;
    image.alt = '';
    codexSpriteWrap.appendChild(image);
  }
  ENEMY_CODEX_SHARD_ICON_PATHS.forEach((path, index) => {
    const shard = document.createElement('img');
    shard.src = path;
    shard.className = `rpg-codex-shortcut__shard rpg-codex-shortcut__shard--${index + 1}`;
    shard.alt = '';
    shard.setAttribute('aria-hidden', 'true');
    codexSpriteWrap.appendChild(shard);
  });
  codexBtn.appendChild(codexSpriteWrap);
  setCodexUnread = (unread) => { codexBtn.classList.toggle('rpg-codex-btn--unread', unread); };
  codexBtn.addEventListener('click', () => {
    setCodexUnread(false);
    rpgMenuPanel.update(appState.game.rpg, appState.game.resources, settings.numberFormat, settings.isDevMode);
    rpgMenuPanel.openEnemiesTab();
  });
  rpgContainer.appendChild(codexBtn);

  const skillTreeBtn = document.createElement('button');
  skillTreeBtn.className = 'rpg-skill-tree-btn rpg-codex-shortcut';
  skillTreeBtn.setAttribute('aria-label', 'Open skill tree');
  const skillSpriteWrap = document.createElement('span');
  skillSpriteWrap.className = 'rpg-codex-shortcut__sprite';
  for (const [path, className] of [
    [SKILL_CODEX_ICON_PATH, 'rpg-codex-shortcut__icon'],
    [SKILL_CODEX_GLOW_ICON_PATH, 'rpg-codex-shortcut__icon rpg-codex-shortcut__icon--glow'],
  ] as const) {
    const image = document.createElement('img');
    image.src = path;
    image.className = className;
    image.alt = '';
    skillSpriteWrap.appendChild(image);
  }
  SKILL_CODEX_SHARD_ICON_PATHS.forEach((path, index) => {
    const shard = document.createElement('img');
    shard.src = path;
    shard.className = `rpg-codex-shortcut__shard rpg-codex-shortcut__shard--${index + 1}`;
    shard.alt = '';
    shard.setAttribute('aria-hidden', 'true');
    skillSpriteWrap.appendChild(shard);
  });
  skillTreeBtn.appendChild(skillSpriteWrap);
  setSkillCodexUnread = (unread) => { skillTreeBtn.classList.toggle('rpg-skill-tree-btn--unread', unread); };
  skillTreeBtn.addEventListener('click', () => {
    skillPointUnreadTracker.markRead();
    rpgMenuPanel.update(appState.game.rpg, appState.game.resources, settings.numberFormat, settings.isDevMode);
    rpgMenuPanel.openSkillTreeTab();
  });
  rpgContainer.appendChild(skillTreeBtn);
  rpgRender.registerOverlayFadeElements([hiddenRackMenuBtn, codexBtn, skillTreeBtn]);

  const tabBar = createTabBar(dispatch);
  runtimeOwner.addCleanup(() => tabBar.dispose());
  root.appendChild(tabBar.element);

  const uiPanels: UIPanels = {
    tabBar,
    upgradePanel,
    resourcePanel,
    settingsPanel,
    loomPanel,
    equationPanel,
    achievementsPanel,
    panelsContainer,
    mainCanvasContainer: canvasContainer,
    rpgRender,
    rpgContainer,
    rpgMenuPanel,
  };

  setActiveTab(appState, uiPanels, appState.game, settings.isDevMode, settings.numberFormat);

  // ── Input listeners ──
  // Tap dispatch is handled inside wireCanvasPointerInput directly on cc.canvas,
  // which is more reliable on mobile (canvas has touch-action: none and pointer capture).
  const cleanupCanvasPointerInput = wireCanvasPointerInput(cc, appState, particles, audioSystem, dispatch);
  runtimeOwner.addCleanup(cleanupCanvasPointerInput);

  // ── Resize handler ──
  const onResize = (): void => {
    if (appState.activeTab !== 'rpg') {
      resizeCanvas(cc, canvasContainer);
      recomputeGenerators();
    }
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;
    if (w > 0 && h > 0) {
      bgAnimation.resize(w, h);
      vermiculateEffect.reset();
      substrateEffect.reset();
    }
    rpgRender.resize(rpgContainer);
  };
  const appWindowLifecycle = createAppWindowLifecycle({
    isResetting: () => isResettingGame,
    save: () => { saveGame(game); },
    writeLastActiveTimestamp,
    readLastActiveTimestamp,
    applyIdleRewards: (elapsedMs) => { applyIdleRewardsIfEligible(game, elapsedMs, idleOverlay); },
    setAudioFocused: (focused) => {
      isWindowFocused = focused;
      applyFocusedAudio();
    },
    resize: onResize,
    maxIdleMs: MAX_OFFLINE_HOURS * 3_600_000,
  });
  runtimeOwner.addCleanup(() => appWindowLifecycle.dispose());
  bgAnimation.resize(canvasContainer.clientWidth, canvasContainer.clientHeight);

  // ── Game loop ──
  const gameLoop = createGameLoop({
    appState,
    cc,
    particles,
    settings,
    uiPanels,
    bgAnimation,
    vermiculateEffect,
    substrateEffect,
    recomputeGenerators,
    hudOverlay,
    lastUnlockedTierCount: { value: appState.game.progression.unlockedTierCount },
    lastFrameMs: { value: performance.now() },
    audioSystem,
  });
  runtimeOwner.addCleanup(() => gameLoop.dispose());

  // Initial generator setup
  recomputeGenerators();

  // ── Fade out loading screen and start game loop ──
  await loadingScreen.fadeOut();

  // ── Idle reward check ──
  if (lastActiveTs !== null) {
    const elapsedMs = Math.min(Date.now() - lastActiveTs, MAX_OFFLINE_HOURS * 3_600_000);
    applyIdleRewardsIfEligible(game, elapsedMs, idleOverlay, settings.skipIdlePopupAtStart);
  }

  gameLoop.start();
  return runtimeOwner.runtime;
}
