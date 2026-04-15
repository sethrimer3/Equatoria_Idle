/**
 * app-actions.ts — Action dispatch, tab switching, and UI update logic.
 *
 * Extracted from game-app.ts to keep the orchestrator lean.
 */

import {
  createGameState,
  tapEquation,
  tryPurchaseUpgrade,
  tryUnlockNextTier,
  tryUnlockEquationForge,
  tryUpgradeLoom,
  tryPurchaseSpecialLoom,
  tryAlivenMote,
  claimAchievement,
} from '../sim';
import { setInteractionMatrixCell, resetInteractionMatrix } from '../sim/aliven';
import type { TierId } from '../data/tiers';
import type { GameAction } from '../input';
import { DOUBLE_TAP_MAX_MS, DOUBLE_TAP_MAX_PX } from '../input';
import type { CanvasContext } from '../render/canvas';
import type { ParticleSystem } from '../render';
import type { SettingsState } from '../settings';
import type { AppState, UIPanels } from './app-types';
import type { NumberFormat } from '../util';
import type { AudioSystem } from '../audio';
import { GENERATOR_HIT_RADIUS_PX } from '../data/particles/particle-config';

// ─── Action handler ─────────────────────────────────────────────

export function handleAction(
  state: AppState,
  action: GameAction,
  cc: CanvasContext,
  particles: ParticleSystem,
  settings: SettingsState,
  uiPanels: UIPanels,
  recomputeGenerators: () => void,
  audioSystem?: AudioSystem,
): void {
  const devMode = settings.isDevMode;
  switch (action.kind) {
    case 'tap': {
      if (!state.game.equation.isForgeUnlocked) break;

      const rect = cc.canvas.getBoundingClientRect();
      const scaleX = cc.widthPx / rect.width;
      const scaleY = cc.heightPx / rect.height;
      const canvasX = (action.xScreen - rect.left) * scaleX;
      const canvasY = (action.yScreen - rect.top) * scaleY;

      const nowMs = performance.now();

      const timeSinceLast = nowMs - state.lastTapTimeMs;
      if (timeSinceLast < DOUBLE_TAP_MAX_MS) {
        const dx = canvasX - state.lastTapCanvasX;
        const dy = canvasY - state.lastTapCanvasY;
        const distSq = dx * dx + dy * dy;
        if (distSq < DOUBLE_TAP_MAX_PX * DOUBLE_TAP_MAX_PX) {
          for (const gen of state.generatorState.generators) {
            const gdx = canvasX - gen.x;
            const gdy = canvasY - gen.y;
            if (gdx * gdx + gdy * gdy < GENERATOR_HIT_RADIUS_PX * GENERATOR_HIT_RADIUS_PX) {
              particles.gatherMotesToGenerator(gen.tierId, gen.x, gen.y);
              state.lastTapTimeMs = 0;
              break;
            }
          }
        }
      }
      state.lastTapCanvasX = canvasX;
      state.lastTapCanvasY = canvasY;
      state.lastTapTimeMs = nowMs;

      const result = tapEquation(state.game);
      state.tapFlashAlpha = 1;

      for (const [tierId] of result.gains) {
        const count = settings.isReducedParticles
          ? Math.ceil(result.particleCount / 3)
          : result.particleCount;
        particles.emitAtPosition(canvasX, canvasY, count, tierId, performance.now());
      }
      break;
    }
    case 'purchase_upgrade': {
      const ok = tryPurchaseUpgrade(state.game, action.upgradeId, devMode);
      if (ok) audioSystem?.onBuyEquationUpgrade();
      else     audioSystem?.onError();
      break;
    }
    case 'unlock_next_tier': {
      const ok = tryUnlockNextTier(state.game, devMode);
      if (ok) { recomputeGenerators(); audioSystem?.onBuyEquationUpgrade(); }
      else      audioSystem?.onError();
      break;
    }
    case 'unlock_equation_forge': {
      const ok = tryUnlockEquationForge(state.game, devMode);
      if (ok) audioSystem?.onBuyEquationUpgrade();
      else     audioSystem?.onError();
      break;
    }
    case 'upgrade_loom': {
      const ok = tryUpgradeLoom(state.game, action.tierId as TierId, devMode);
      if (ok) audioSystem?.onBuyLoomUpgrade();
      else     audioSystem?.onError();
      break;
    }
    case 'upgrade_special_loom': {
      const ok = tryPurchaseSpecialLoom(state.game, action.tierId as TierId);
      if (ok) audioSystem?.onBuyLoomUpgrade();
      else     audioSystem?.onError();
      break;
    }
    case 'aliven_mote': {
      const ok = tryAlivenMote(state.game, action.tierId as TierId, devMode);
      if (!ok) audioSystem?.onError();
      break;
    }
    case 'set_interaction_matrix_cell':
      setInteractionMatrixCell(state.game.aliven, action.row, action.col, action.value);
      // Sync immediately so the particle system picks up the change on the next frame
      particles.interactionMatrix = state.game.aliven.interactionMatrix;
      break;
    case 'reset_interaction_matrix':
      resetInteractionMatrix(state.game.aliven);
      particles.interactionMatrix = state.game.aliven.interactionMatrix;
      break;
    case 'claim_achievement':
      claimAchievement(state.game.achievements, action.achievementId);
      break;
    case 'set_active_tab':
      state.activeTab = action.tabId;
      audioSystem?.onTabChange(action.tabId);
      setActiveTab(state, uiPanels, state.game, settings.isDevMode, settings.numberFormat);
      break;
    case 'save_game':
      // Handled directly — import kept light
      break;
    case 'reset_game':
      Object.assign(state, { game: createGameState(), tapFlashAlpha: 0, activeTab: 'equation', lastTapCanvasX: 0, lastTapCanvasY: 0, lastTapTimeMs: 0 });
      recomputeGenerators();
      setActiveTab(state, uiPanels, state.game, settings.isDevMode, settings.numberFormat);
      break;
  }
}

// ─── Tab switching ──────────────────────────────────────────────

export function setActiveTab(
  state: AppState,
  panels: UIPanels,
  game: import('../sim').GameState,
  isDevMode: boolean,
  numberFormat: NumberFormat,
): void {
  panels.tabBar.setActiveTab(state.activeTab);
  panels.tabBar.updateAchievementIndicator(game);

  // Equation tab shows canvas only; all other tabs show panel overlays
  const shouldShowPanels = state.activeTab !== 'equation';
  panels.panelsContainer.classList.toggle('panels-visible', shouldShowPanels);

  // Show/hide individual panels
  panels.equationPanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
  panels.loomPanel.element.style.display = state.activeTab === 'looms' ? '' : 'none';
  panels.upgradePanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
  panels.resourcePanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
  panels.achievementsPanel.element.style.display = state.activeTab === 'achievements' ? '' : 'none';
  panels.achievementsPanel.setVisible(state.activeTab === 'achievements');
  panels.settingsPanel.element.style.display = state.activeTab === 'settings' ? '' : 'none';

  // Immediately update visible panel
  updateVisiblePanels(state, panels, game, isDevMode, numberFormat);
}

// ─── UI update ──────────────────────────────────────────────────

export function updateVisiblePanels(
  state: AppState,
  panels: UIPanels,
  game: import('../sim').GameState,
  isDevMode: boolean,
  numberFormat: NumberFormat,
): void {
  panels.tabBar.updateAchievementIndicator(game);

  if (state.activeTab === 'looms') {
    panels.loomPanel.update(game, numberFormat);
  } else if (state.activeTab === 'resources') {
    panels.equationPanel.update(game, isDevMode, numberFormat);
    panels.upgradePanel.update(game, isDevMode, numberFormat);
    panels.resourcePanel.update(game, numberFormat);
  } else if (state.activeTab === 'achievements') {
    panels.achievementsPanel.update(game, numberFormat);
  }
}
