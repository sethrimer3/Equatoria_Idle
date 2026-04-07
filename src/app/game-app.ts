import {
  createGameState,
  tapEquation,
  tryPurchaseUpgrade,
  tryUnlockNextTier,
  tryUnlockEquationForge,
  tryUpgradeLoom,
  simTick,
  getScore,
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
import { createBackgroundAnimation, type BackgroundAnimation, createVermiculateEffect, type VermiculateEffect } from '../render/background';
import { setupInputListeners, type GameAction, type TabId } from '../input';
import {
  createParticleDragState,
  handleParticleDragDown,
  handleParticleDragMove,
  handleParticleDragUp,
  type ParticleDragState,
} from '../input/particle-drag';
import { createTabBar, type TabBar } from '../ui/tabs';
import { createUpgradePanel, createResourcePanel, createSettingsPanel, createLoomPanel, createEquationPanel } from '../ui/panels';
import type { UpgradePanel } from '../ui/panels/upgrade-panel';
import type { ResourcePanel } from '../ui/panels/resource-panel';
import type { SettingsPanel } from '../ui/panels/settings-panel';
import type { LoomPanel } from '../ui/panels/loom-panel';
import type { EquationPanel } from '../ui/panels/equation-panel';
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

  const forge = createForgeCrunchState();
  const generatorState = createGeneratorState();

  const appState: AppState = {
    game,
    activeTab: 'equation',
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
  const vermiculateCanvas = document.createElement('canvas');
  vermiculateCanvas.className = 'vermiculate-canvas';
  root.appendChild(vermiculateCanvas);
  const vermiculateCtx = vermiculateCanvas.getContext('2d')!;
  const vermiculateEffect: VermiculateEffect = createVermiculateEffect();

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
  const equationPanel = createEquationPanel();

  panelsInner.appendChild(equationPanel.element);
  panelsInner.appendChild(loomPanel.element);
  panelsInner.appendChild(upgradePanel.element);
  panelsInner.appendChild(resourcePanel.element);
  panelsInner.appendChild(settingsPanel.element);

  const tabBar = createTabBar(dispatch);
  root.appendChild(tabBar.element);

  setActiveTab(appState, tabBar, upgradePanel, resourcePanel, settingsPanel, loomPanel, equationPanel, panelsContainer);

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
    const pos = getCanvasCoords(e);
    handleParticleDragDown(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles, cc.widthPx, cc.heightPx);
  });
  cc.canvas.addEventListener('pointermove', (e: PointerEvent) => {
    if (!appState.particleDrag.isDown) return;
    const pos = getCanvasCoords(e);
    handleParticleDragMove(appState.particleDrag, pos.x, pos.y, e.timeStamp, particles.particles);
  });
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
    vermiculateCanvas.width = w;
    vermiculateCanvas.height = h;
    recomputeGenerators();
  };
  window.addEventListener('resize', onResize);

  // Initial background size
  bgAnimation.resize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  vermiculateCanvas.width = canvasContainer.clientWidth;
  vermiculateCanvas.height = canvasContainer.clientHeight;

  // ── Action handler ──
  function handleAction(state: AppState, action: GameAction): void {
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
        tryPurchaseUpgrade(state.game, action.upgradeId);
        break;
      case 'unlock_next_tier':
        tryUnlockNextTier(state.game);
        recomputeGenerators();
        break;
      case 'unlock_equation_forge':
        tryUnlockEquationForge(state.game);
        break;
      case 'upgrade_loom':
        tryUpgradeLoom(state.game, action.tierId as TierId);
        break;
      case 'set_active_tab':
        state.activeTab = action.tabId;
        setActiveTab(state, tabBar, upgradePanel, resourcePanel, settingsPanel, loomPanel, equationPanel, panelsContainer);
        break;
      case 'save_game':
        saveGame(state.game);
        break;
      case 'reset_game':
        deleteSave();
        Object.assign(state, { game: createGameState(), tapFlashAlpha: 0, activeTab: 'equation' as TabId });
        recomputeGenerators();
        setActiveTab(state, tabBar, upgradePanel, resourcePanel, settingsPanel, loomPanel, equationPanel, panelsContainer);
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

    if (appState.tapFlashAlpha > 0) {
      appState.tapFlashAlpha = Math.max(0, appState.tapFlashAlpha - deltaMs / 200);
    }
    appState.animPulse += deltaMs / 500;

    const equationCenterX = cc.widthPx / 2;
    const equationCenterY = cc.heightPx / 2;

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
    );

    // ── Update background animation ──
    bgAnimation.update(deltaMs);

    // ── Update and draw vermiculate background ──
    const vW = vermiculateCanvas.width;
    const vH = vermiculateCanvas.height;
    vermiculateEffect.update(nowMs, vW, vH);
    vermiculateCtx.clearRect(0, 0, vW, vH);
    vermiculateEffect.draw(vermiculateCtx);

    // ── Render ──
    clearCanvas(cc);
    drawBackground(cc, '#000000');

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

    drawScore(cc, getScore(appState.game));

    particles.draw(cc);

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
      loomPanel.update(appState.game);
    } else if (appState.activeTab === 'equation') {
      equationPanel.update(appState.game);
    } else if (appState.activeTab === 'resources') {
      upgradePanel.update(appState.game);
      resourcePanel.update(appState.game);
    }
  }

  function setActiveTab(
    state: AppState,
    bar: TabBar,
    upPanel: UpgradePanel,
    resPanel: ResourcePanel,
    setPanel: SettingsPanel,
    lPanel: LoomPanel,
    eqPanel: EquationPanel,
    panelsCont: HTMLElement,
  ): void {
    bar.setActiveTab(state.activeTab);

    // All tabs except canvas-only view show panels
    const shouldShowPanels = true;
    panelsCont.classList.toggle('panels-visible', shouldShowPanels);

    // Show/hide individual panels
    eqPanel.element.style.display = state.activeTab === 'equation' ? '' : 'none';
    lPanel.element.style.display = state.activeTab === 'looms' ? '' : 'none';
    upPanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
    resPanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
    setPanel.element.style.display = state.activeTab === 'settings' ? '' : 'none';

    // Immediately update visible panel
    if (state.activeTab === 'looms') {
      lPanel.update(appState.game);
    } else if (state.activeTab === 'equation') {
      eqPanel.update(appState.game);
    } else if (state.activeTab === 'resources') {
      upPanel.update(appState.game);
      resPanel.update(appState.game);
    }
  }

  // Initial generator setup
  recomputeGenerators();

  // ── Fade out loading screen and start game loop ──
  await loadingScreen.fadeOut();
  requestAnimationFrame(gameLoop);
}
