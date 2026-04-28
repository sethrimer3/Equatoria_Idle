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
import { getMotes, spendMotes } from '../sim/resources';
import { WEAPON_BY_ID } from '../data/rpg/weapon-definitions';
import { RPG_UPGRADE_BY_ID } from '../data/rpg/rpg-upgrade-definitions';
import { getRpgUpgradeLevel, getWeaponTierUpgradeCost, getMaxEquippedWeapons, MAX_WEAPON_TIER, isBossUnlocked, MIN_BOSS_SPEED_PCT, MAX_BOSS_SPEED_PCT, BOSS_SPEED_STEP } from '../sim/rpg/rpg-state';
import type { TierId } from '../data/tiers';
import type { GameAction } from '../input';
import { DOUBLE_TAP_MAX_MS, DOUBLE_TAP_MAX_PX } from '../input';
import type { CanvasContext } from '../render/canvas';
import type { ParticleSystem } from '../render';
import type { SettingsState } from '../settings';
import type { AppState, UIPanels } from './app-types';
import type { NumberFormat } from '../util';
import type { AudioSystem } from '../audio';
import { GENERATOR_HIT_RADIUS_PX, MAX_FORGE_ATTRACTION_DISTANCE } from '../data/particles/particle-config';

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

      // Double-tap generator gather — works at any position, no forge-radius restriction.
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
              // Reset so a third tap within the window doesn't trigger again
              state.lastTapTimeMs = 0;
              break;
            }
          }
        }
      }
      state.lastTapCanvasX = canvasX;
      state.lastTapCanvasY = canvasY;
      state.lastTapTimeMs = nowMs;

      // Equation tap only registers within the forge's radius of influence.
      const forgeCenterX = cc.widthPx / 2;
      const forgeCenterY = cc.heightPx / 2;
      const tapDx = canvasX - forgeCenterX;
      const tapDy = canvasY - forgeCenterY;
      const forgeInfluenceRadiusSq = MAX_FORGE_ATTRACTION_DISTANCE * MAX_FORGE_ATTRACTION_DISTANCE;
      if (tapDx * tapDx + tapDy * tapDy > forgeInfluenceRadiusSq) break;

      tapEquation(state.game);
      state.tapFlashAlpha = 1;
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
    case 'purchase_weapon': {
      const weaponDef = WEAPON_BY_ID.get(action.weaponId);
      if (!weaponDef) { audioSystem?.onError(); break; }
      if (state.game.rpg.purchasedWeaponIds.has(action.weaponId)) break;
      if (!devMode) {
        const balance = getMotes(state.game.resources, weaponDef.costTierId);
        if (balance < weaponDef.cost) { audioSystem?.onError(); break; }
        spendMotes(state.game.resources, weaponDef.costTierId, weaponDef.cost);
      }
      state.game.rpg.purchasedWeaponIds.add(action.weaponId);
      state.game.rpg.weaponTiersByWeaponId.set(action.weaponId, 1);
      audioSystem?.onBuyLoomUpgrade();
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'equip_weapon': {
      if (!state.game.rpg.purchasedWeaponIds.has(action.weaponId)) { audioSystem?.onError(); break; }
      const maxSlots = getMaxEquippedWeapons(state.game.rpg);
      if (state.game.rpg.equippedWeaponIds.size >= maxSlots) { audioSystem?.onError(); break; }
      state.game.rpg.equippedWeaponIds.add(action.weaponId);
      uiPanels.rpgRender.notifyEquip();
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'unequip_weapon': {
      state.game.rpg.equippedWeaponIds.delete(action.weaponId);
      uiPanels.rpgRender.notifyEquip();
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'upgrade_weapon_tier': {
      const weaponDef = WEAPON_BY_ID.get(action.weaponId);
      if (!weaponDef) { audioSystem?.onError(); break; }
      if (!state.game.rpg.purchasedWeaponIds.has(action.weaponId)) { audioSystem?.onError(); break; }
      const currentTier = state.game.rpg.weaponTiersByWeaponId.get(action.weaponId) ?? 1;
      if (currentTier >= MAX_WEAPON_TIER) { audioSystem?.onError(); break; }
      const tierUpgradeCost = getWeaponTierUpgradeCost(weaponDef.cost, currentTier);
      if (!devMode) {
        const balance = getMotes(state.game.resources, weaponDef.costTierId);
        if (balance < tierUpgradeCost) { audioSystem?.onError(); break; }
        spendMotes(state.game.resources, weaponDef.costTierId, tierUpgradeCost);
      }
      state.game.rpg.weaponTiersByWeaponId.set(action.weaponId, currentTier + 1);
      audioSystem?.onBuyLoomUpgrade();
      uiPanels.rpgRender.notifyEquip();
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'purchase_rpg_upgrade': {
      const upgradeDef = RPG_UPGRADE_BY_ID.get(action.upgradeId);
      if (!upgradeDef) { audioSystem?.onError(); break; }
      const currentLevel = getRpgUpgradeLevel(state.game.rpg, action.upgradeId);
      if (currentLevel >= upgradeDef.maxLevel) break;
      if (!devMode) {
        const balance = getMotes(state.game.resources, upgradeDef.costTierId);
        if (balance < upgradeDef.costPerLevel) { audioSystem?.onError(); break; }
        spendMotes(state.game.resources, upgradeDef.costTierId, upgradeDef.costPerLevel);
      }
      state.game.rpg.rpgUpgradeLevels.set(action.upgradeId, currentLevel + 1);
      audioSystem?.onBuyLoomUpgrade();
      // Notify the render so speed multiplier updates immediately.
      uiPanels.rpgRender.notifyEquip();
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'set_respawn_wave': {
      const w = action.wave;
      if (w !== 0 && w % 10 !== 0) break;
      if (w > state.game.rpg.highestWaveReached && w !== 0) break;
      state.game.rpg.respawnWave = w;
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'dev_jump_wave': {
      if (!devMode) break;
      const wv = action.wave;
      if (wv < 1 || (wv % 10 !== 0 && wv !== 1)) break;
      uiPanels.rpgRender.devJumpToWave(wv);
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'respawn_now': {
      uiPanels.rpgRender.respawnNow();
      uiPanels.rpgMenuPanel.setVisible(false);
      break;
    }
    case 'start_boss_fight': {
      const { bossId } = action;
      if (bossId < 1 || bossId > 10) { audioSystem?.onError(); break; }
      if (!isBossUnlocked(bossId, state.game.rpg.highestWaveReached) && !devMode) {
        audioSystem?.onError(); break;
      }
      uiPanels.rpgMenuPanel.setVisible(false);
      uiPanels.rpgRender.startBossFight(bossId);
      break;
    }
    case 'set_boss_speed': {
      const { pct } = action;
      if (pct < MIN_BOSS_SPEED_PCT || pct > MAX_BOSS_SPEED_PCT || pct % BOSS_SPEED_STEP !== 0) {
        audioSystem?.onError(); break;
      }
      state.game.rpg.bossSpeedPct = pct;
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
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

  const isRpg = state.activeTab === 'rpg';
  const isEquation = state.activeTab === 'equation';

  // RPG tab hides the main canvas and shows its own canvas container.
  // Equation tab shows the main canvas only (no panel overlay).
  // All other tabs show the panel overlay on top of the main canvas.
  panels.mainCanvasContainer.style.display = isRpg ? 'none' : '';
  panels.rpgContainer.style.display = isRpg ? '' : 'none';
  panels.rpgRender.statsPanel.style.display = isRpg ? '' : 'none';
  panels.rpgRender.setActive(isRpg);
  // Hide RPG menu when leaving RPG tab.
  if (!isRpg) panels.rpgMenuPanel.setVisible(false);
  // Resize now that the container is visible so the canvas fills correctly.
  if (isRpg) {
    panels.rpgRender.resize(panels.rpgContainer);
  }

  // Slide the panel overlay in for non-equation, non-RPG tabs.
  const shouldShowPanels = !isEquation && !isRpg;
  panels.panelsContainer.classList.toggle('panels-visible', shouldShowPanels);

  // Show/hide individual panels
  panels.loomPanel.element.style.display = state.activeTab === 'resources' ? '' : 'none';
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

  if (state.activeTab === 'resources') {
    // The combined Upgrades tab (loomPanel) handles all three sub-tabs:
    // Equation, Loom, Aliven. Update the underlying panels so they stay
    // current regardless of which sub-tab is showing.
    panels.loomPanel.update(game, numberFormat);
    panels.equationPanel.update(game, isDevMode, numberFormat);
    panels.upgradePanel.update(game, isDevMode, numberFormat);
    panels.resourcePanel.update(game, numberFormat);
  } else if (state.activeTab === 'achievements') {
    panels.achievementsPanel.update(game, numberFormat);
  } else if (state.activeTab === 'rpg') {
    // RPG menu is only re-rendered when visible; calling update here
    // pre-populates its state so it shows current data immediately when opened.
    panels.rpgMenuPanel.update(game.rpg, game.resources, numberFormat, isDevMode);
  }
}
