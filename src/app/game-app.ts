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
} from '../render';
import { setupInputListeners, type GameAction, type TabId } from '../input';
import { createTabBar, type TabBar } from '../ui/tabs';
import { createUpgradePanel, createResourcePanel, createSettingsPanel } from '../ui/panels';
import type { UpgradePanel } from '../ui/panels/upgrade-panel';
import type { ResourcePanel } from '../ui/panels/resource-panel';
import type { SettingsPanel } from '../ui/panels/settings-panel';
import { loadSettings, saveGame, loadGame, deleteSave } from '../settings';
import { AUTO_SAVE_INTERVAL_MS } from '../data/balance';
import { TIER_BY_ID } from '../data/tiers';

// ─── App state ──────────────────────────────────────────────────

interface AppState {
  game: GameState;
  activeTab: TabId;
  tapFlashAlpha: number;
  animPulse: number;
}

// ─── Bootstrap ──────────────────────────────────────────────────

export function startApp(): void {
  // Load or create game state
  const savedGame = loadGame();
  const game = savedGame ?? createGameState();
  const settings = loadSettings();

  const appState: AppState = {
    game,
    activeTab: 'equation',
    tapFlashAlpha: 0,
    animPulse: 0,
  };

  // ── DOM structure ──
  const root = document.getElementById('app')!;
  root.innerHTML = '';

  // Canvas area (top section)
  const canvasContainer = document.createElement('div');
  canvasContainer.id = 'canvas-container';
  root.appendChild(canvasContainer);

  const cc = createGameCanvas(canvasContainer);

  // Panels container (middle section, scrollable)
  const panelsContainer = document.createElement('div');
  panelsContainer.id = 'panels-container';
  root.appendChild(panelsContainer);

  // Dispatch
  const dispatch = (action: GameAction): void => handleAction(appState, action);

  // Panels
  const upgradePanel = createUpgradePanel(dispatch);
  const resourcePanel = createResourcePanel();
  const settingsPanel = createSettingsPanel(settings, dispatch);

  panelsContainer.appendChild(upgradePanel.element);
  panelsContainer.appendChild(resourcePanel.element);
  panelsContainer.appendChild(settingsPanel.element);

  // Tab bar (bottom)
  const tabBar = createTabBar(dispatch);
  root.appendChild(tabBar.element);

  // Set initial tab
  setActiveTab(appState, tabBar, upgradePanel, resourcePanel, settingsPanel);

  // ── Particle system ──
  const particles = new ParticleSystem();

  // ── Input ──
  setupInputListeners(canvasContainer, dispatch);

  // ── Resize handler ──
  const onResize = () => resizeCanvas(cc, canvasContainer);
  window.addEventListener('resize', onResize);

  // ── Action handler ──
  function handleAction(state: AppState, action: GameAction): void {
    switch (action.kind) {
      case 'tap': {
        const result = tapEquation(state.game);
        state.tapFlashAlpha = 1;

        // Convert screen coords to canvas coords for particles
        const rect = cc.canvas.getBoundingClientRect();
        const scaleX = cc.widthPx / rect.width;
        const scaleY = cc.heightPx / rect.height;
        const canvasX = (action.xScreen - rect.left) * scaleX;
        const canvasY = (action.yScreen - rect.top) * scaleY;

        // Emit particles for each tier gained
        for (const [tierId] of result.gains) {
          const tier = TIER_BY_ID.get(tierId);
          if (tier) {
            const count = settings.isReducedParticles
              ? Math.ceil(result.particleCount / 3)
              : result.particleCount;
            particles.emit(canvasX, canvasY, count, tier.color, tier.glowColor);
          }
        }
        break;
      }
      case 'purchase_upgrade':
        tryPurchaseUpgrade(state.game, action.upgradeId);
        break;
      case 'unlock_next_tier':
        tryUnlockNextTier(state.game);
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
        break;
    }
  }

  // ── Game loop ──
  let lastFrameMs = performance.now();

  function gameLoop(nowMs: number): void {
    const deltaMs = Math.min(nowMs - lastFrameMs, 200); // clamp large gaps
    lastFrameMs = nowMs;

    // Simulation tick
    const simResult = simTick(appState.game, deltaMs);

    // Auto-tap particles
    if (simResult.autoTapped && simResult.autoTapGains) {
      const cx = cc.widthPx / 2;
      const cy = cc.heightPx * 0.15;
      for (const [tierId] of simResult.autoTapGains) {
        const tier = TIER_BY_ID.get(tierId);
        if (tier) {
          particles.emit(cx, cy, 2, tier.color, tier.glowColor);
        }
      }
    }

    // Decay tap flash
    if (appState.tapFlashAlpha > 0) {
      appState.tapFlashAlpha = Math.max(0, appState.tapFlashAlpha - deltaMs / 200);
    }

    // Animation pulse
    appState.animPulse += deltaMs / 500;

    // Update particles
    particles.update(deltaMs, cc.widthPx, cc.heightPx);

    // ── Render ──
    clearCanvas(cc);
    drawBackground(cc, '#1a1a2e');

    // Equation
    const terms = buildEquationView(appState.game.equation);
    drawEquation(cc, terms, appState.tapFlashAlpha);

    // Score
    drawScore(cc, getScore(appState.game));

    // Particles
    particles.draw(cc);

    // Tap hint for new players
    if (appState.game.equation.totalTapCount < 3) {
      drawTapHint(cc, appState.animPulse);
    }

    // ── UI update (throttled to ~10fps for DOM perf) ──
    if (Math.floor(nowMs / 100) !== Math.floor((nowMs - deltaMs) / 100)) {
      updateUI();
    }

    // Auto-save
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

    // Force UI update when switching tabs
    upgradePanel.update(appState.game);
    resourcePanel.update(appState.game);
  }

  // Start the loop
  requestAnimationFrame(gameLoop);
}
