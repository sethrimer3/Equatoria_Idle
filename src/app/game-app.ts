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
import { preloadGeneratorSprites, updateGeneratorPointerPos, clearGeneratorPointerPos } from '../render/generators/generator-renderer';
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
import { loadSettings, saveGame, loadGame, deleteSave, readLastActiveTimestamp, writeLastActiveTimestamp, saveSettings } from '../settings';
import { TIERS } from '../data/tiers';
import { createForgeCrunchState } from '../sim/forge';
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

import type { AppState, UIPanels } from './app-types';
import { handleAction as handleActionImpl, setActiveTab } from './app-actions';
import { createGameLoop } from './app-game-loop';
import { createIdleOverlay } from '../ui/idle/idle-overlay';
import { calculateIdleRewards } from '../sim/idle/idle-reward';
import { queueIdleRewards } from '../sim/idle/apply-idle-rewards';
import { makePageBreak } from '../ui/ui-helpers';

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
  // Tracks whether the tab has been hidden at least once since app start,
  // so we can run an idle-reward check when the player returns to the tab.
  let _wasHiddenSinceStart = false;

  function applyFocusedAudio(): void {
    // If the setting is off, always keep audio running.
    audioSystem.setFocused(!settings.isMusicOnlyWhenFocused || _isWindowFocused);
  }

  document.addEventListener('visibilitychange', () => {
    _isWindowFocused = document.visibilityState === 'visible';
    applyFocusedAudio();
    if (document.visibilityState === 'hidden') {
      _wasHiddenSinceStart = true;
      writeLastActiveTimestamp();
      saveGame(game);
    } else if (document.visibilityState === 'visible' && _wasHiddenSinceStart) {
      // Player returned to the tab — check for idle rewards for the time away.
      // The hidden handler already wrote the departure timestamp, so just read it.
      const hiddenTs = readLastActiveTimestamp();
      if (hiddenTs !== null) {
        const elapsedMs = Math.min(Date.now() - hiddenTs, MAX_OFFLINE_HOURS * 3_600_000);
        if (elapsedMs > 60_000) {
          const summary = calculateIdleRewards(game, elapsedMs);
          if (summary.tierRewards.some(r => r.totalMotes > 0)) {
            queueIdleRewards(game, summary);
            idleOverlay.show(summary);
          }
        }
      }
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
  // Equation panel is created first so we can pass its highlight callback to the resource panel.
  // We use a late-binding ref to avoid a circular setup order.
  let equationPanelRef: ReturnType<typeof createEquationPanel> | null = null;
  const resourcePanel = createResourcePanel((tierId) => {
    equationPanelRef?.setHighlightedTier(tierId);
  });
  const settingsPanel = createSettingsPanel(settings, dispatch, audioSystem, applyFocusedAudio);
  const achievementsPanel = createAchievementsPanel(dispatch, audioSystem);

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

  const rpgRender = createRpgRender(rpgContainer, appState.game.rpg, {
    onLuckyMoteCollected: (tierId: TierId, bonusPct: number) => {
      const current = appState.game.resources.moteTotals.get(tierId) ?? 0;
      // Apply percentage bonus; ensure at least 1 mote so the drop is never worthless
      // even when the player has not yet collected any motes of this tier.
      const bonus = Math.max(1, current * bonusPct / 100);
      addMotes(appState.game.resources, tierId, bonus);
    },
    onError: () => { audioSystem.onError(); },
  });
  rpgRender.setNumberFormat(settings.numberFormat);
  // Stats panel is positioned in the root (above the tab bar); visibility
  // is toggled by setActiveTab alongside rpgContainer.
  root.appendChild(rpgRender.statsPanel);

  // ── Helper: apply the RPG bar position setting to DOM elements ──
  function applyRpgBarPosition(atTop: boolean): void {
    rpgRender.statsPanel.classList.toggle('rpg-bar-at-top', atTop);
    rpgContainer.classList.toggle('rpg-bar-at-top', atTop);
    rpgMenuPanel.element.classList.toggle('rpg-bar-at-top', atTop);
  }

  // ── RPG menu panel (replaces weapon store) ──
  const rpgMenuPanel = createRpgMenuPanel(dispatch, (atTop) => {
    settings.rpgBarAtTop = atTop;
    saveSettings(settings);
    applyRpgBarPosition(atTop);
    rpgMenuPanel.setRpgBarAtTop(atTop);
  });
  rpgMenuPanel.element.style.display = 'none';
  root.appendChild(rpgMenuPanel.element);

  // Apply saved bar position immediately after panel is in the DOM
  applyRpgBarPosition(settings.rpgBarAtTop);
  rpgMenuPanel.setRpgBarAtTop(settings.rpgBarAtTop);

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
  rpgRender.menuButtonContainer.appendChild(menuToggleBtn);

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
    if (appState.activeTab !== 'rpg') {
      updateGeneratorPointerPos(pos.x, pos.y);
    }
    handleParticleDragDown(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles, cc.widthPx, cc.heightPx);
  });
  cc.canvas.addEventListener('pointermove', (e: PointerEvent) => {
    const pos = getCanvasCoords(e);
    // Track pointer for generator label proximity opacity (idle canvas only).
    if (appState.activeTab !== 'rpg') {
      updateGeneratorPointerPos(pos.x, pos.y);
    }
    if (!appState.particleDrag.isDown) return;
    e.preventDefault();
    handleParticleDragMove(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles);
  }, { passive: false });
  cc.canvas.addEventListener('pointerleave', () => {
    clearGeneratorPointerPos();
  });
  cc.canvas.addEventListener('pointerup', (e: PointerEvent) => {
    const pos = getCanvasCoords(e);
    handleParticleDragUp(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles);
    clearGeneratorPointerPos();
  });
  cc.canvas.addEventListener('pointercancel', (e: PointerEvent) => {
    const pos = getCanvasCoords(e);
    handleParticleDragUp(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles);
    clearGeneratorPointerPos();
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
    const elapsedMs = Math.min(Date.now() - lastActiveTs, MAX_OFFLINE_HOURS * 3_600_000);
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
