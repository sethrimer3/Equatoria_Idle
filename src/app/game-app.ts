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
import { createBackgroundAnimation, createVermiculateEffect, createSubstrateEffect } from '../render/background';
import { setupInputListeners, type GameAction } from '../input';
import {
  createParticleDragState,
  handleParticleDragDown,
  handleParticleDragMove,
  handleParticleDragUp,
} from '../input/particle-drag';
import { createTabBar } from '../ui/tabs';
import { createUpgradePanel, createResourcePanel, createSettingsPanel, createLoomPanel, createEquationPanel, createAchievementsPanel } from '../ui/panels';
import { createHudOverlay } from '../ui/hud/hud-overlay';
import { createLoadingScreen } from '../ui/loading';
import { loadSettings, saveGame, loadGame, deleteSave, readLastActiveTimestamp, writeLastActiveTimestamp } from '../settings';
import { TIERS } from '../data/tiers';
import { createForgeCrunchState } from '../sim/forge';
import {
  createGeneratorState,
  computeGeneratorPositions,
} from '../sim/particles';
import { SPAWNER_GRAVITY_RADIUS } from '../data/particles/particle-config';
import { createAudioSystem } from '../audio';
import { createTraceEffect } from '../render/ui/trace-effect';
import { createRpgRender } from '../render/rpg/rpg-render';
import { createRpgMenuPanel } from '../ui/panels/rpg-menu-panel';

import type { AppState, UIPanels } from './app-types';
import { handleAction as handleActionImpl, setActiveTab } from './app-actions';
import { createGameLoop } from './app-game-loop';
import { createIdleOverlay } from '../ui/idle/idle-overlay';
import { calculateIdleRewards } from '../sim/idle/idle-reward';
import { queueIdleRewards } from '../sim/idle/apply-idle-rewards';

// ─── Bootstrap ──────────────────────────────────────────────────

export async function startApp(): Promise<void> {
  const root = document.getElementById('app')!;
  root.innerHTML = '';

  // ── Loading screen ──
  const loadingScreen = await createLoadingScreen();
  root.appendChild(loadingScreen.element);

  // ── Preload essential sprites ──
  preloadGeneratorSprites();
  preloadForgeSprites();

  // ── Initialize game state ──
  const lastActiveTs = readLastActiveTimestamp();
  writeLastActiveTimestamp(); // immediately record so next session measures from now
  const savedGame = loadGame();
  const game = savedGame ?? createGameState();
  const settings = loadSettings();

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

  const forge = createForgeCrunchState();
  const generatorState = createGeneratorState();

  // ── Audio system ──
  const audioSystem = createAudioSystem(settings.musicVolume, settings.sfxVolume);

  const appState: AppState = {
    game,
    activeTab: 'equation',
    tapFlashAlpha: 0,
    animPulse: 0,
    forge,
    generatorState,
    particleDrag: createParticleDragState(),
    lastTapCanvasX: 0,
    lastTapCanvasY: 0,
    lastTapTimeMs: 0,
  };

  // ── Background effects ──
  const bgAnimation = createBackgroundAnimation();
  root.appendChild(bgAnimation.canvas);

  const vermiculateEffect = createVermiculateEffect();
  const substrateEffect = createSubstrateEffect({
    quality: settings.graphicsQuality === 'low' ? 'low' : 'high',
  });

  // ── Canvas container (full screen) ──
  const canvasContainer = document.createElement('div');
  canvasContainer.id = 'canvas-container';
  root.appendChild(canvasContainer);

  const cc = createGameCanvas(canvasContainer);

  // ── HUD overlay (DOM layer above canvas, non-pixelated) ──
  const hudOverlay = createHudOverlay();
  canvasContainer.appendChild(hudOverlay.element);

  // ── Idle reward overlay ──
  const idleOverlay = createIdleOverlay();
  root.appendChild(idleOverlay.element);

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
  const dispatch = (action: GameAction): void => {
    // Resume audio context on user interaction (autoplay policy)
    audioSystem.resumeContext().catch(() => { /* silently ignore */ });

    // Handle save/reset directly here since they need local closures
    if (action.kind === 'save_game') {
      saveGame(appState.game);
      return;
    }
    if (action.kind === 'reset_game') {
      deleteSave();
      particles.reset();
      Object.assign(appState, { game: createGameState(), tapFlashAlpha: 0, activeTab: 'equation' });
      recomputeGenerators();
      setActiveTab(appState, uiPanels, appState.game, settings.isDevMode, settings.numberFormat);
      return;
    }
    handleActionImpl(appState, action, cc, particles, settings, uiPanels, recomputeGenerators, audioSystem);
  };

  // ── Focus-aware audio pause ──
  let _isWindowFocused = document.visibilityState === 'visible';

  function applyFocusedAudio(): void {
    // If the setting is off, always keep audio running.
    audioSystem.setFocused(!settings.isMusicOnlyWhenFocused || _isWindowFocused);
  }

  document.addEventListener('visibilitychange', () => {
    _isWindowFocused = document.visibilityState === 'visible';
    applyFocusedAudio();
    // Write the last-active timestamp whenever the tab is hidden.
    if (document.visibilityState === 'hidden') {
      writeLastActiveTimestamp();
    }
  });

  window.addEventListener('blur', () => {
    _isWindowFocused = false;
    applyFocusedAudio();
  });

  window.addEventListener('focus', () => {
    _isWindowFocused = true;
    applyFocusedAudio();
  });

  // ── Trace effect overlay (golden outline + tracer circles for UI highlights) ──
  const traceEffect = createTraceEffect(root);

  // ── UI panels ──
  const upgradePanel = createUpgradePanel(dispatch);
  const resourcePanel = createResourcePanel();
  const settingsPanel = createSettingsPanel(settings, dispatch, audioSystem, applyFocusedAudio);
  const equationPanel = createEquationPanel(dispatch, traceEffect);
  const achievementsPanel = createAchievementsPanel(dispatch, audioSystem);

  // Wrap the equation-related panels into a container so they can be
  // injected as the "Equation" sub-tab of the combined Upgrades panel.
  const equationContentDiv = document.createElement('div');
  equationContentDiv.appendChild(equationPanel.element);
  equationContentDiv.appendChild(upgradePanel.element);
  equationContentDiv.appendChild(resourcePanel.element);

  const loomPanel = createLoomPanel(dispatch, traceEffect, equationContentDiv);

  panelsInner.appendChild(loomPanel.element);
  panelsInner.appendChild(achievementsPanel.element);
  panelsInner.appendChild(settingsPanel.element);

  // ── RPG container + render ──
  const rpgContainer = document.createElement('div');
  rpgContainer.id = 'rpg-container';
  rpgContainer.style.display = 'none';
  root.appendChild(rpgContainer);

  const rpgRender = createRpgRender(rpgContainer, appState.game.rpg);
  // Stats panel is positioned in the root (above the tab bar); visibility
  // is toggled by setActiveTab alongside rpgContainer.
  root.appendChild(rpgRender.statsPanel);

  // ── RPG menu panel (replaces weapon store) ──
  const rpgMenuPanel = createRpgMenuPanel(dispatch);
  rpgMenuPanel.element.style.display = 'none';
  root.appendChild(rpgMenuPanel.element);

  // ── Menu toggle button (appended to the stats panel by the renderer) ──
  const menuToggleBtn = document.createElement('button');
  menuToggleBtn.className = 'rpg-menu-btn';
  menuToggleBtn.textContent = '⚔ Menu';
  menuToggleBtn.setAttribute('aria-label', 'Open RPG menu');
  menuToggleBtn.addEventListener('click', () => {
    const nowVisible = !rpgMenuPanel.isVisible;
    rpgMenuPanel.setVisible(nowVisible);
    if (nowVisible) {
      rpgMenuPanel.update(appState.game.rpg, appState.game.resources, settings.numberFormat, settings.isDevMode);
    }
  });
  rpgRender.statsPanel.appendChild(menuToggleBtn);

  const tabBar = createTabBar(dispatch);
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
  setupInputListeners(canvasContainer, dispatch);

  const getCanvasCoords = (e: PointerEvent): { x: number; y: number } => {
    const rect = cc.canvas.getBoundingClientRect();
    const scaleX = cc.widthPx / rect.width;
    const scaleY = cc.heightPx / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  };

  cc.canvas.addEventListener('pointerdown', (e: PointerEvent) => {
    cc.canvas.setPointerCapture(e.pointerId);
    audioSystem.resumeContext().catch(() => { /* silently ignore */ });
    const pos = getCanvasCoords(e);
    handleParticleDragDown(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles, cc.widthPx, cc.heightPx);
  });
  cc.canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!appState.particleDrag.isDown) return;
    e.preventDefault();
    const pos = getCanvasCoords(e);
    handleParticleDragMove(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles);
  }, { passive: false });
  cc.canvas.addEventListener('pointerup', (e: PointerEvent) => {
    const pos = getCanvasCoords(e);
    handleParticleDragUp(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles);
  });
  cc.canvas.addEventListener('pointercancel', (e: PointerEvent) => {
    const pos = getCanvasCoords(e);
    handleParticleDragUp(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles);
  });

  // ── Resize handler ──
  const onResize = (): void => {
    resizeCanvas(cc, canvasContainer);
    const w = canvasContainer.clientWidth;
    const h = canvasContainer.clientHeight;
    bgAnimation.resize(w, h);
    vermiculateEffect.reset();
    substrateEffect.reset();
    recomputeGenerators();
    rpgRender.resize(rpgContainer);
  };
  window.addEventListener('resize', onResize);
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

  // Initial generator setup
  recomputeGenerators();

  // ── Fade out loading screen and start game loop ──
  await loadingScreen.fadeOut();

  // ── Idle reward check ──
  if (lastActiveTs !== null) {
    const elapsedMs = Date.now() - lastActiveTs;
    if (elapsedMs > 60_000) {
      const summary = calculateIdleRewards(game, elapsedMs);
      if (summary.tierRewards.some(r => r.totalMotes > 0)) {
        queueIdleRewards(game, summary);
        idleOverlay.show(summary);
      }
    }
  }

  requestAnimationFrame(gameLoop);
}
