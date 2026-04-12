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
  tryAlivenMote,
  claimAchievement,
} from '../sim';
import type { TierId } from '../data/tiers';
import type { GameAction } from '../input';
import type { CanvasContext } from '../render/canvas';
import type { ParticleSystem } from '../render';
import type { SettingsState } from '../settings';
import type { AppState, UIPanels } from './app-types';
import type { NumberFormat } from '../util';
import type { AudioSystem } from '../audio';

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
    case 'aliven_mote': {
      const ok = tryAlivenMote(state.game, action.tierId as TierId, devMode);
      if (!ok) audioSystem?.onError();
      break;
    }
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
      Object.assign(state, { game: createGameState(), tapFlashAlpha: 0, activeTab: 'equation' });
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
