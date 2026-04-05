import {
  createGameState,
  tapEquation,
  tryPurchaseUpgrade,
  tryUnlockNextTier,
  simTick,
  getScore,
  buildEquationView,
  type GameState,
} from '../sim';
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
import { setupInputListeners, type GameAction, type TabId } from '../input';
import {
  createParticleDragState,
  handleParticleDragDown,
  handleParticleDragMove,
  handleParticleDragUp,
  type ParticleDragState,
} from '../input/particle-drag';
import { createTabBar, type TabBar } from '../ui/tabs';
import { createUpgradePanel, createResourcePanel, createSettingsPanel } from '../ui/panels';
import type { UpgradePanel } from '../ui/panels/upgrade-panel';
import type { ResourcePanel } from '../ui/panels/resource-panel';
import type { SettingsPanel } from '../ui/panels/settings-panel';
import { loadSettings, saveGame, loadGame, deleteSave } from '../settings';
import { AUTO_SAVE_INTERVAL_MS } from '../data/balance';
import { TIERS } from '../data/tiers';
import type { TierId } from '../data/tiers';
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

export function startApp(): void {
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

  // ── DOM structure ──
  const root = document.getElementById('app')!;
  root.innerHTML = '';

  const canvasContainer = document.createElement('div');
  canvasContainer.id = 'canvas-container';
  root.appendChild(canvasContainer);

  const cc = createGameCanvas(canvasContainer);

  const panelsContainer = document.createElement('div');
  panelsContainer.id = 'panels-container';
  root.appendChild(panelsContainer);

  const dispatch = (action: GameAction): void => handleAction(appState, action);

  const upgradePanel = createUpgradePanel(dispatch);
  const resourcePanel = createResourcePanel();
  const settingsPanel = createSettingsPanel(settings, dispatch);

  panelsContainer.appendChild(upgradePanel.element);
  panelsContainer.appendChild(resourcePanel.element);
  panelsContainer.appendChild(settingsPanel.element);

  const tabBar = createTabBar(dispatch);
  root.appendChild(tabBar.element);

  setActiveTab(appState, tabBar, upgradePanel, resourcePanel, settingsPanel);

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
    recomputeGenerators();
  };
  window.addEventListener('resize', onResize);

  // ── Action handler ──
  function handleAction(state: AppState, action: GameAction): void {
    switch (action.kind) {
      case 'tap': {
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
      case 'set_active_tab':
        state.activeTab = action.tabId;
        setActiveTab(state, tabBar, upgradePanel, resourcePanel, settingsPanel);
        break;
      case 'save_game':
        saveGame(state.game);
        break;
      case 'reset_game':
        deleteSave();
        Object.assign(state, { game: createGameState(), tapFlashAlpha: 0 });
        recomputeGenerators();
        break;
    }
  }

  function recomputeGenerators(): void {
    const equationCenterX = cc.widthPx / 2;
    const equationCenterY = cc.heightPx * 0.15;
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
      const cy = cc.heightPx * 0.15;
      for (const [tierId] of simResult.autoTapGains) {
        particles.emitAtPosition(cx, cy, 2, tierId, nowMs);
      }
    }

    if (appState.tapFlashAlpha > 0) {
      appState.tapFlashAlpha = Math.max(0, appState.tapFlashAlpha - deltaMs / 200);
    }
    appState.animPulse += deltaMs / 500;

    const equationCenterX = cc.widthPx / 2;
    const equationCenterY = cc.heightPx * 0.15;

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

    // ── Render ──
    clearCanvas(cc);
    drawBackground(cc, '#1a1a2e');

    drawGenerators(
      cc,
      appState.generatorState.generators,
      particles.spawnerRotations,
      appState.generatorState.fadeIns,
    );

    drawForge(cc, equationCenterX, equationCenterY, particles.forgeRotation, appState.forge, nowMs);

    const terms = buildEquationView(appState.game.equation);
    drawEquation(cc, terms, appState.tapFlashAlpha);

    drawScore(cc, getScore(appState.game));

    drawForgeCrunch(cc, equationCenterX, equationCenterY, appState.forge);

    particles.draw(cc);

    if (appState.game.equation.totalTapCount < 3) {
      drawTapHint(cc, appState.animPulse);
    }

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
    if (appState.activeTab === 'equation' || appState.activeTab === 'resources') {
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
  ): void {
    bar.setActiveTab(state.activeTab);
    upPanel.element.style.display = state.activeTab === 'equation' ? '' : 'none';
    resPanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
    setPanel.element.style.display = state.activeTab === 'settings' ? '' : 'none';

    upgradePanel.update(appState.game);
    resourcePanel.update(appState.game);
  }

  // Initial generator setup
  recomputeGenerators();

  requestAnimationFrame(gameLoop);
}
