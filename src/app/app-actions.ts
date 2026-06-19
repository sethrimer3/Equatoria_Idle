/**
 * app-actions.ts — Action dispatch, tab switching, and UI update logic.
 *
 * Extracted from game-app.ts to keep the orchestrator lean.
 */

import {
  tapEquation,
  tryPurchaseUpgrade,
  tryUnlockNextTier,
  tryUnlockEquationForge,
  tryUpgradeLoom,
  tryPurchaseSpecialLoom,
  tryAlivenMote,
  tryUpgradeLoomEfficiencyAction,
  tapEquationForge,
  claimAchievement,
  claimAllUnlockedAchievements,
  craftWeapon,
  craftWeave,
  craftLens,
  attachLensToWeapon,
  grantSampleLensWeaveItems,
  grantEquipmentReward,
} from '../sim';
import { rollLensDrop, rollWeaveDrop, rollEquipmentReward } from '../data/rpg/equipment-rewards';
import { getUnlockedWeaveSlotCount } from '../sim/forge/forge-state';
import { setInteractionMatrixCell, resetInteractionMatrix } from '../sim/aliven';
import { getMotes, spendMotes } from '../sim/resources';
import { WEAPON_BY_ID } from '../data/rpg/weapon-definitions';
import { RPG_UPGRADE_BY_ID } from '../data/rpg/rpg-upgrade-definitions';
import { getRpgUpgradeLevel, getWeaponTierUpgradeCost, getMaxEquippedWeapons, MAX_WEAPON_TIER, isBossUnlocked, MIN_BOSS_SPEED_PCT, MAX_BOSS_SPEED_PCT, BOSS_SPEED_STEP } from '../sim/rpg/rpg-state';
import { canPurchaseRpgSkill } from '../data/rpg/rpg-skill-tree-definitions';
import type { TierId } from '../data/tiers';
import type { GameAction } from '../input';
import { DOUBLE_TAP_MAX_MS, DOUBLE_TAP_MAX_PX } from '../input';
import type { CanvasContext } from '../render/canvas';
import { resizeCanvas } from '../render/canvas';
import type { ParticleSystem } from '../render';
import type { SettingsState } from '../settings';
import { saveSettings } from '../settings';
import type { AppState, UIPanels } from './app-types';
import type { NumberFormat } from '../util';
import type { AudioSystem } from '../audio';
import { GENERATOR_HIT_RADIUS_PX, MAX_FORGE_ATTRACTION_DISTANCE, FORGE_TOUCH_TAP_MULTIPLIER } from '../data/particles/particle-config';

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
      // Touch/mobile gets a larger tap area (FORGE_TOUCH_TAP_MULTIPLIER) to
      // compensate for imprecise finger input.
      const forgeCenterX = cc.widthPx / 2;
      const forgeCenterY = cc.heightPx / 2;
      const tapDx = canvasX - forgeCenterX;
      const tapDy = canvasY - forgeCenterY;
      const tapRadiusMultiplier = action.isTouchInput ? FORGE_TOUCH_TAP_MULTIPLIER : 1.0;
      const forgeInfluenceRadius = MAX_FORGE_ATTRACTION_DISTANCE * tapRadiusMultiplier;
      if (tapDx * tapDx + tapDy * tapDy > forgeInfluenceRadius * forgeInfluenceRadius) break;

      tapEquation(state.game);
      tapEquationForge(state.game, state.game.elapsedMs, nowMs);
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
      const ok = tryPurchaseSpecialLoom(state.game, action.tierId as TierId, devMode);
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
    case 'claim_all_achievements':
      claimAllUnlockedAchievements(state.game.achievements);
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
      // Find the first empty slot
      let firstEmpty = -1;
      for (let s = 0; s < maxSlots; s++) {
        if (!state.game.rpg.equippedWeaponSlots.has(s)) { firstEmpty = s; break; }
      }
      if (firstEmpty === -1) { audioSystem?.onError(); break; }
      state.game.rpg.equippedWeaponIds.add(action.weaponId);
      state.game.rpg.equippedWeaponSlots.set(firstEmpty, action.weaponId);
      state.game.rpg.equipChangedDuringInterwave = true;
      uiPanels.rpgRender.notifyEquip();
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'equip_weapon_to_slot': {
      if (!state.game.rpg.purchasedWeaponIds.has(action.weaponId)) { audioSystem?.onError(); break; }
      const maxSlots = getMaxEquippedWeapons(state.game.rpg);
      if (action.slotIndex < 0 || action.slotIndex >= maxSlots) { audioSystem?.onError(); break; }
      // Remove any weapon already in this slot
      const prevWeapon = state.game.rpg.equippedWeaponSlots.get(action.slotIndex);
      if (prevWeapon) {
        state.game.rpg.equippedWeaponIds.delete(prevWeapon);
        state.game.rpg.equippedWeaponSlots.delete(action.slotIndex);
      }
      // Remove the new weapon from any other slot it might currently occupy
      for (const [slot, wid] of state.game.rpg.equippedWeaponSlots) {
        if (wid === action.weaponId) {
          state.game.rpg.equippedWeaponSlots.delete(slot);
          break;
        }
      }
      state.game.rpg.equippedWeaponIds.add(action.weaponId);
      state.game.rpg.equippedWeaponSlots.set(action.slotIndex, action.weaponId);
      state.game.rpg.equipChangedDuringInterwave = true;
      uiPanels.rpgRender.notifyEquip();
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'unequip_weapon': {
      state.game.rpg.equippedWeaponIds.delete(action.weaponId);
      for (const [slot, wid] of state.game.rpg.equippedWeaponSlots) {
        if (wid === action.weaponId) {
          state.game.rpg.equippedWeaponSlots.delete(slot);
          break;
        }
      }
      state.game.rpg.equipChangedDuringInterwave = true;
      uiPanels.rpgRender.notifyEquip();
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'swap_weapon_slots': {
      const { slotA, slotB } = action;
      const maxSlots = getMaxEquippedWeapons(state.game.rpg);
      if (slotA < 0 || slotA >= maxSlots || slotB < 0 || slotB >= maxSlots || slotA === slotB) break;
      const idA = state.game.rpg.equippedWeaponSlots.get(slotA) ?? null;
      const idB = state.game.rpg.equippedWeaponSlots.get(slotB) ?? null;
      if (idA) state.game.rpg.equippedWeaponSlots.set(slotB, idA);
      else state.game.rpg.equippedWeaponSlots.delete(slotB);
      if (idB) state.game.rpg.equippedWeaponSlots.set(slotA, idB);
      else state.game.rpg.equippedWeaponSlots.delete(slotA);
      // Re-derive the Set from the Map to stay in sync
      state.game.rpg.equippedWeaponIds.clear();
      for (const [, wid] of state.game.rpg.equippedWeaponSlots) state.game.rpg.equippedWeaponIds.add(wid);
      state.game.rpg.equipChangedDuringInterwave = true;
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
      const check = canPurchaseRpgSkill(state.game.rpg, state.game.resources, action.upgradeId, devMode);
      if (!check.ok) { audioSystem?.onError(); break; }
      const upgradeDef = RPG_UPGRADE_BY_ID.get(action.upgradeId)!;
      const currentLevel = getRpgUpgradeLevel(state.game.rpg, action.upgradeId);
      if (!devMode) {
        state.game.rpg.unspentSkillPoints -= upgradeDef.skillPointCost;
        if (upgradeDef.costPerLevel > 0) spendMotes(state.game.resources, upgradeDef.costTierId, upgradeDef.costPerLevel);
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
    case 'dev_grant_sample_equipment': {
      if (!devMode) break;
      grantSampleLensWeaveItems(state.game);
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'dev_grant_random_lens': {
      if (!devMode) break;
      const spec = rollLensDrop({
        zoneId: state.game.rpg.activeZoneId,
        subzoneId: state.game.rpg.activeSubzoneId,
        wave: state.game.rpg.currentWaveByZone[state.game.rpg.activeZoneId] || state.game.rpg.highestWaveReached || 1,
        forgeLevel: getRpgUpgradeLevel(state.game.rpg, 'forge_craft_level') + 1,
        source: 'dev',
        rng: () => 0,
      });
      if (spec) grantEquipmentReward(state.game, spec);
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'dev_grant_random_weave': {
      if (!devMode) break;
      const spec = rollWeaveDrop({
        zoneId: state.game.rpg.activeZoneId,
        subzoneId: state.game.rpg.activeSubzoneId,
        wave: state.game.rpg.currentWaveByZone[state.game.rpg.activeZoneId] || state.game.rpg.highestWaveReached || 1,
        forgeLevel: getRpgUpgradeLevel(state.game.rpg, 'forge_craft_level') + 1,
        source: 'dev',
        rng: () => 0,
      });
      if (spec) grantEquipmentReward(state.game, spec);
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'dev_simulate_equipment_rewards': {
      if (!devMode) break;
      const counts: Record<string, number> = {};
      for (let i = 0; i < 100; i++) {
        const spec = rollEquipmentReward({
          zoneId: state.game.rpg.activeZoneId,
          subzoneId: state.game.rpg.activeSubzoneId,
          wave: state.game.rpg.currentWaveByZone[state.game.rpg.activeZoneId] || state.game.rpg.highestWaveReached || 1,
          forgeLevel: getRpgUpgradeLevel(state.game.rpg, 'forge_craft_level') + 1,
          source: i % 10 === 0 ? 'elite' : 'normal',
        });
        const key = spec ? `${spec.source}:${spec.kind}` : 'none';
        counts[key] = (counts[key] ?? 0) + 1;
      }
      console.table(counts);
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
    case 'set_invincibility_mode': {
      settings.isInvincibilityMode = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setInvincibilityMode(action.enabled);
      uiPanels.rpgRender.setInvincibilityMode(action.enabled);
      break;
    }
    case 'set_topographic_terrain_debug': {
      settings.isTopographicTerrainDebugEnabled = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setTopographicTerrainDebugEnabled(action.enabled);
      uiPanels.rpgRender.setTopographicTerrainDebugEnabled(devMode && action.enabled);
      break;
    }
    case 'set_rpg_viewport_debug':
      settings.isRpgViewportDebugEnabled = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setDeveloperVisual(action.kind, action.enabled);
      break;
    case 'set_rpg_pathfinding_debug':
      settings.isRpgPathfindingDebugEnabled = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setDeveloperVisual(action.kind, action.enabled);
      break;
    case 'set_rpg_verdure_wall_debug':
      settings.isRpgVerdureWallDebugEnabled = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setDeveloperVisual(action.kind, action.enabled);
      break;
    case 'set_rpg_nadir_anchor_debug':
      settings.isRpgNadirAnchorDebugEnabled = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setDeveloperVisual(action.kind, action.enabled);
      break;
    case 'set_rpg_boss_stage_debug':
      settings.isRpgBossStageDebugEnabled = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setDeveloperVisual(action.kind, action.enabled);
      break;
    case 'set_topography_lighting_debug':
      settings.isTopographyLightingDebugEnabled = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setDeveloperVisual(action.kind, action.enabled);
      break;
    case 'set_sharp_topography_shadows': {
      settings.isSharpTopographyShadows = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setSharpTopographyShadows(action.enabled);
      uiPanels.rpgRender.setSharpTopographyShadows(action.enabled);
      break;
    }
    case 'set_soft_impetus_asteroid_shadows':
      settings.isSoftImpetusAsteroidShadows = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setDeveloperVisual(action.kind, action.enabled);
      break;
    case 'set_rpg_pixelated_render':
      settings.isRpgPixelatedRender = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setDeveloperVisual(action.kind, action.enabled);
      break;
    case 'set_rpg_debug_overlay':
      settings.isRpgDebugOverlayEnabled = action.enabled;
      saveSettings(settings);
      uiPanels.rpgMenuPanel.setDeveloperVisual(action.kind, action.enabled);
      uiPanels.rpgRender.setRpgDebugOverlay(action.enabled);
      break;
    case 'upgrade_loom_efficiency': {
      const ok = tryUpgradeLoomEfficiencyAction(state.game, action.tierId as TierId, devMode);
      if (!ok) audioSystem?.onError();
      break;
    }
    case 'craft_weapon': {
      const ok = craftWeapon(state.game, action.ingredients as import('../data/rpg/crafted-weapon-types').CraftedWeaponIngredient[], devMode);
      if (ok) {
        audioSystem?.onBuyLoomUpgrade();
        uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      } else {
        audioSystem?.onError();
      }
      break;
    }
    case 'toggle_sand_blade': {
      state.game.rpg.sandBladeEnabled = !state.game.rpg.sandBladeEnabled;
      uiPanels.rpgMenuPanel.update(state.game.rpg, state.game.resources, settings.numberFormat, devMode);
      break;
    }
    case 'craft_weave': {
      const ok = craftWeave(state.game, action.ingredients as import('../data/rpg/crafted-weapon-types').CraftedWeaponIngredient[], devMode);
      if (ok) {
        audioSystem?.onBuyLoomUpgrade();
      } else {
        audioSystem?.onError();
      }
      break;
    }
    case 'craft_lens': {
      const ok = craftLens(state.game, action.ingredients as import('../data/rpg/crafted-weapon-types').CraftedWeaponIngredient[], devMode);
      if (ok) {
        audioSystem?.onBuyLoomUpgrade();
      } else {
        audioSystem?.onError();
      }
      break;
    }
    case 'attach_lens_to_weapon': {
      const ok = attachLensToWeapon(state.game, action.lensId, action.weaponId);
      if (!ok) audioSystem?.onError();
      break;
    }
    case 'equip_weave_to_slot': {
      const { weaveId, slotIndex } = action;
      const weave = state.game.rpg.craftedWeaves.find(w => w.id === weaveId);
      if (!weave) { audioSystem?.onError(); break; }
      const unlocked = getUnlockedWeaveSlotCount(state.game.forge.forgeLevel);
      if (slotIndex < 0 || slotIndex >= unlocked) { audioSystem?.onError(); break; }
      // Remove the weave from any other slot it currently occupies
      for (let i = 0; i < 6; i++) {
        if (state.game.rpg.equippedWeaveSlots[i] === weaveId) {
          state.game.rpg.equippedWeaveSlots[i] = null;
        }
      }
      state.game.rpg.equippedWeaveSlots[slotIndex] = weaveId;
      break;
    }
    case 'unequip_weave': {
      const { weaveId } = action;
      for (let i = 0; i < 6; i++) {
        if (state.game.rpg.equippedWeaveSlots[i] === weaveId) {
          state.game.rpg.equippedWeaveSlots[i] = null;
        }
      }
      break;
    }
    case 'move_weave_slot': {
      const { fromSlotIndex, toSlotIndex } = action;
      const unlocked = getUnlockedWeaveSlotCount(state.game.forge.forgeLevel);
      if (
        fromSlotIndex < 0 || fromSlotIndex >= 6 ||
        toSlotIndex < 0 || toSlotIndex >= unlocked
      ) { audioSystem?.onError(); break; }
      const tmp = state.game.rpg.equippedWeaveSlots[fromSlotIndex];
      state.game.rpg.equippedWeaveSlots[fromSlotIndex] = state.game.rpg.equippedWeaveSlots[toSlotIndex];
      state.game.rpg.equippedWeaveSlots[toSlotIndex] = tmp;
      break;
    }
    case 'set_active_tab':
      state.activeTab = action.tabId;
      audioSystem?.onTabChange(action.tabId);
      setActiveTab(state, uiPanels, state.game, settings.isDevMode, settings.numberFormat);
      if (action.tabId !== 'rpg') {
        resizeCanvas(cc, uiPanels.mainCanvasContainer);
        recomputeGenerators();
      }
      break;
    case 'save_game':
      // Handled directly in game-app.ts before this function is reached.
      break;
    // Note: 'reset_game' is also intercepted in game-app.ts (calls deleteSave +
    // particles.reset) and never reaches this handler. No case needed here.
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
    panels.loomPanel.update(game, numberFormat, isDevMode);
    panels.equationPanel.update(game, isDevMode, numberFormat);
    panels.upgradePanel.update(game, isDevMode, numberFormat);
    panels.resourcePanel.update(game, numberFormat);
  } else if (state.activeTab === 'achievements') {
    panels.achievementsPanel.update(game, numberFormat);
  } else if (state.activeTab === 'settings') {
    // Update the Balance Forecast panel if dev mode is enabled
    if (isDevMode) {
      panels.settingsPanel.balanceForecastPanel.update(game);
    }
  } else if (state.activeTab === 'rpg') {
    // RPG menu is only re-rendered when visible; calling update here
    // pre-populates its state so it shows current data immediately when opened.
    panels.rpgMenuPanel.update(game.rpg, game.resources, numberFormat, isDevMode);
  }
}
