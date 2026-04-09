import {
  createGameState,
  tapEquation,
  tryPurchaseUpgrade,
  tryUnlockNextTier,
  tryUnlockEquationForge,
  tryUpgradeLoom,
  simTick,
  getEquivalence,
  buildEquationView,
  type GameState,
} from '../sim';
import type { TierId } from '../data/tiers';
import {
  createGameCanvas,
  resizeCanvas,
  clearCanvas,
  drawBackground,
  ParticleSystem,
  drawEquation,
  drawScore,
  drawTapHint,
  drawGenerators,
  drawForge,
  drawForgeCrunch,
} from '../render';
import { preloadGeneratorSprites } from '../render/generators/generator-renderer';
import { preloadForgeSprites } from '../render/forge/forge-renderer';
import { createBackgroundAnimation, type BackgroundAnimation, createVermiculateEffect, type VermiculateEffect, createSubstrateEffect, type SubstrateEffect } from '../render/background';
import { setupInputListeners, type GameAction, type TabId } from '../input';
import {
  createParticleDragState,
  handleParticleDragDown,
  handleParticleDragMove,
  handleParticleDragUp,
  type ParticleDragState,
} from '../input/particle-drag';
import { createTabBar, type TabBar } from '../ui/tabs';
import { createUpgradePanel, createResourcePanel, createSettingsPanel, createLoomPanel, createEquationPanel, createAchievementsPanel } from '../ui/panels';
import type { UpgradePanel } from '../ui/panels/upgrade-panel';
import type { ResourcePanel } from '../ui/panels/resource-panel';
import type { SettingsPanel } from '../ui/panels/settings-panel';
import type { LoomPanel } from '../ui/panels/loom-panel';
import type { EquationPanel } from '../ui/panels/equation-panel';
import type { AchievementsPanel } from '../ui/panels/achievements-panel';
import { createLoadingScreen } from '../ui/loading';
import { loadSettings, saveGame, loadGame, deleteSave } from '../settings';
import { AUTO_SAVE_INTERVAL_MS } from '../data/balance';
import { TIERS } from '../data/tiers';
import { createForgeCrunchState, type ForgeCrunchState } from '../sim/forge';
import {
  createGeneratorState,
  computeGeneratorPositions,
  type GeneratorState,
} from '../sim/particles';
import { SPAWNER_GRAVITY_RADIUS } from '../data/particles/particle-config';
import { SMALL_SIZE_INDEX } from '../data/particles/size-tiers';

// ─── App state ──────────────────────────────────────────────────

interface AppState {
  game: GameState;
  activeTab: TabId;
  tapFlashAlpha: number;
  animPulse: number;
  forge: ForgeCrunchState;
  generatorState: GeneratorState;
  particleDrag: ParticleDragState;
}

/** Configuration object grouping all UI panels for tab switching. */
interface UIPanels {
  tabBar: TabBar;
  upgradePanel: UpgradePanel;
  resourcePanel: ResourcePanel;
  settingsPanel: SettingsPanel;
  loomPanel: LoomPanel;
  equationPanel: EquationPanel;
  achievementsPanel: AchievementsPanel;
  panelsContainer: HTMLElement;
}

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
  const savedGame = loadGame();
  const game = savedGame ?? createGameState();
  const settings = loadSettings();

  // ── Preload Pixelify Sans font for canvas rendering ──
  try {
    await document.fonts.load("bold 12px 'Pixelify Sans'");
  } catch {
    // Font load failure is non-fatal; fall back to monospace
  }

  const forge = createForgeCrunchState();
  const generatorState = createGeneratorState();

  const appState: AppState = {
    game,
    activeTab: 'looms',
    tapFlashAlpha: 0,
    animPulse: 0,
    forge,
    generatorState,
    particleDrag: createParticleDragState(),
  };

  // ── Background animation ──
  const bgAnimation: BackgroundAnimation = createBackgroundAnimation();
  root.appendChild(bgAnimation.canvas);

  // ── Vermiculate background effect ──
  const vermiculateEffect: VermiculateEffect = createVermiculateEffect();

  // ── Substrate background effect ──
  const substrateEffect: SubstrateEffect = createSubstrateEffect({
    quality: settings.graphicsQuality === 'low' ? 'low' : 'high',
  });

  // ── Canvas container (full screen) ──
  const canvasContainer = document.createElement('div');
  canvasContainer.id = 'canvas-container';
  root.appendChild(canvasContainer);

  const cc = createGameCanvas(canvasContainer);

  // ── Panels overlay container ──
  const panelsContainer = document.createElement('div');
  panelsContainer.id = 'panels-container';
  root.appendChild(panelsContainer);

  const panelsInner = document.createElement('div');
  panelsInner.className = 'panels-inner';
  panelsContainer.appendChild(panelsInner);

  const dispatch = (action: GameAction): void => handleAction(appState, action);

  const upgradePanel = createUpgradePanel(dispatch);
  const resourcePanel = createResourcePanel();
  const settingsPanel = createSettingsPanel(settings, dispatch);
  const loomPanel = createLoomPanel(dispatch);
  const equationPanel = createEquationPanel(dispatch);
  const achievementsPanel = createAchievementsPanel();

  panelsInner.appendChild(equationPanel.element);
  panelsInner.appendChild(loomPanel.element);
  panelsInner.appendChild(upgradePanel.element);
  panelsInner.appendChild(resourcePanel.element);
  panelsInner.appendChild(achievementsPanel.element);
  panelsInner.appendChild(settingsPanel.element);

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
  };

  setActiveTab(appState, uiPanels);

  // ── Particle system ──
  const particles = new ParticleSystem();

  let lastUnlockedTierCount = appState.game.progression.unlockedTierCount;

  // ── Input ──
  setupInputListeners(canvasContainer, dispatch);

  // Drag listeners for particle interaction
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
    // Capture the pointer so pointermove/pointerup are always delivered to this
    // element even when the pointer moves outside its bounds (critical for drag).
    cc.canvas.setPointerCapture(e.pointerId);
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
  };
  window.addEventListener('resize', onResize);

  // Initial background size
  bgAnimation.resize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  // ── Action handler ──
  function handleAction(state: AppState, action: GameAction): void {
    const devMode = settings.isDevMode;
    switch (action.kind) {
      case 'tap': {
        if (!state.game.equation.isForgeUnlocked) break;
        const result = tapEquation(state.game);
        state.tapFlashAlpha = 1;

        const rect = cc.canvas.getBoundingClientRect();
        const scaleX = cc.widthPx / rect.width;
        const scaleY = cc.heightPx / rect.height;
        const canvasX = (action.xScreen - rect.left) * scaleX;
        const canvasY = (action.yScreen - rect.top) * scaleY;

        for (const [tierId] of result.gains) {
          const count = settings.isReducedParticles
            ? Math.ceil(result.particleCount / 3)
            : result.particleCount;
          particles.emitAtPosition(canvasX, canvasY, count, tierId, performance.now());
        }
        break;
      }
      case 'purchase_upgrade':
        tryPurchaseUpgrade(state.game, action.upgradeId, devMode);
        break;
      case 'unlock_next_tier':
        tryUnlockNextTier(state.game, devMode);
        recomputeGenerators();
        break;
      case 'unlock_equation_forge':
        tryUnlockEquationForge(state.game, devMode);
        break;
      case 'upgrade_loom':
        tryUpgradeLoom(state.game, action.tierId as TierId, devMode);
        break;
      case 'set_active_tab':
        state.activeTab = action.tabId;
        setActiveTab(state, uiPanels);
        break;
      case 'save_game':
        saveGame(state.game);
        break;
      case 'reset_game':
        deleteSave();
        Object.assign(state, { game: createGameState(), tapFlashAlpha: 0, activeTab: 'looms' });
        recomputeGenerators();
        setActiveTab(state, uiPanels);
        break;
    }
  }

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

  // ── Game loop ──
  let lastFrameMs = performance.now();

  function gameLoop(nowMs: number): void {
    const deltaMs = Math.min(nowMs - lastFrameMs, 200);
    lastFrameMs = nowMs;

    const simResult = simTick(appState.game, deltaMs);

    // Recompute generators when tiers are newly unlocked
    if (appState.game.progression.unlockedTierCount !== lastUnlockedTierCount) {
      lastUnlockedTierCount = appState.game.progression.unlockedTierCount;
      recomputeGenerators();
    }

    if (simResult.autoTapped && simResult.autoTapGains) {
      const cx = cc.widthPx / 2;
      const cy = cc.heightPx / 2;
      for (const [tierId] of simResult.autoTapGains) {
        particles.emitAtPosition(cx, cy, 2, tierId, nowMs);
      }
    }

    // Emit particles at generator positions for loom production ticks
    for (const [tierId] of simResult.loomGains) {
      particles.emit(tierId, SMALL_SIZE_INDEX, appState.generatorState.generators, nowMs);
    }

    if (appState.tapFlashAlpha > 0) {
      appState.tapFlashAlpha = Math.max(0, appState.tapFlashAlpha - deltaMs / 200);
    }
    appState.animPulse += deltaMs / 500;

    const equationCenterX = cc.widthPx / 2;
    const equationCenterY = cc.heightPx / 2;
    const isLowGraphics = settings.graphicsQuality === 'low';

    // Ensure generators are initialized on first frame
    if (appState.generatorState.generators.length === 0) {
      recomputeGenerators();
    }

    particles.update(
      deltaMs,
      nowMs,
      appState.generatorState.generators,
      equationCenterX,
      equationCenterY,
      cc.widthPx,
      cc.heightPx,
      appState.forge,
      { enableGlow: !isLowGraphics, enableTrails: !isLowGraphics },
    );

    // ── Update background animation ──
    bgAnimation.update(deltaMs);

    // ── Render ──
    clearCanvas(cc);
    drawBackground(cc, '#000000');
    if (settings.backgroundStyle === 'vermiculate') {
      vermiculateEffect.update(nowMs, cc.widthPx, cc.heightPx);
      vermiculateEffect.draw(cc.ctx);
    } else if (settings.backgroundStyle === 'substrate') {
      substrateEffect.update(nowMs, cc.widthPx, cc.heightPx);
      substrateEffect.draw(cc.ctx);
    }
    // 'none' → skip both

    drawGenerators(
      cc,
      appState.generatorState.generators,
      particles.spawnerRotations,
      appState.generatorState.fadeIns,
    );

    // Only draw forge and equation on canvas if forge is unlocked
    if (appState.game.equation.isForgeUnlocked) {
      drawForge(cc, equationCenterX, equationCenterY, particles.forgeRotation, appState.forge, nowMs);

      const terms = buildEquationView(appState.game.equation);
      drawEquation(cc, terms, appState.tapFlashAlpha);

      drawForgeCrunch(cc, equationCenterX, equationCenterY, appState.forge);

      if (appState.game.equation.totalTapCount < 3) {
        drawTapHint(cc, appState.animPulse);
      }
    }

    drawScore(cc, getEquivalence(appState.game.resources), particles.getOnScreenMoteCount(), settings.numberFormat);

    particles.draw(cc, { enableGlow: !isLowGraphics, enableTrails: !isLowGraphics });

    if (Math.floor(nowMs / 100) !== Math.floor((nowMs - deltaMs) / 100)) {
      updateUI();
    }

    if (nowMs - appState.game.lastSaveMs > AUTO_SAVE_INTERVAL_MS) {
      appState.game.lastSaveMs = nowMs;
      saveGame(appState.game);
    }

    requestAnimationFrame(gameLoop);
  }

  function updateUI(): void {
    if (appState.activeTab === 'looms') {
      uiPanels.loomPanel.update(appState.game, settings.numberFormat);
    } else if (appState.activeTab === 'resources') {
      uiPanels.equationPanel.update(appState.game, settings.isDevMode, settings.numberFormat);
      uiPanels.upgradePanel.update(appState.game, settings.isDevMode, settings.numberFormat);
      uiPanels.resourcePanel.update(appState.game, settings.numberFormat);
    } else if (appState.activeTab === 'achievements') {
      uiPanels.achievementsPanel.update(appState.game, settings.numberFormat);
    }
  }

  function setActiveTab(state: AppState, panels: UIPanels): void {
    panels.tabBar.setActiveTab(state.activeTab);

    // Equation tab shows canvas only; all other tabs show panel overlays
    const shouldShowPanels = state.activeTab !== 'equation';
    panels.panelsContainer.classList.toggle('panels-visible', shouldShowPanels);

    // Show/hide individual panels
    panels.equationPanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
    panels.loomPanel.element.style.display = state.activeTab === 'looms' ? '' : 'none';
    panels.upgradePanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
    panels.resourcePanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
    panels.achievementsPanel.element.style.display = state.activeTab === 'achievements' ? '' : 'none';
    panels.settingsPanel.element.style.display = state.activeTab === 'settings' ? '' : 'none';

    // Immediately update visible panel
    if (state.activeTab === 'looms') {
      panels.loomPanel.update(appState.game, settings.numberFormat);
    } else if (state.activeTab === 'resources') {
      panels.equationPanel.update(appState.game, settings.isDevMode, settings.numberFormat);
      panels.upgradePanel.update(appState.game, settings.isDevMode, settings.numberFormat);
      panels.resourcePanel.update(appState.game, settings.numberFormat);
    } else if (state.activeTab === 'achievements') {
      panels.achievementsPanel.update(appState.game, settings.numberFormat);
    }
  }

  // Initial generator setup
  recomputeGenerators();

  // ── Fade out loading screen and start game loop ──
  await loadingScreen.fadeOut();
  requestAnimationFrame(gameLoop);
}
