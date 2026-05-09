/**
 * app-game-loop.ts — Game loop, render pipeline, and simulation tick.
 *
 * Extracted from game-app.ts to isolate the frame-by-frame update logic.
 */

import {
  simTick,
  getEquivalence,
  buildEquationView,
  getLoomRate,
  getWaveBoostMultiplier,
} from '../sim';
import {
  clearCanvas,
  drawBackground,
  drawGenerators,
  drawForge,
  drawForgeCrunch,
  type ParticleSystem,
} from '../render';
import { getGeneratorPointerPos, updateGeneratorRendererTime } from '../render/generators/generator-renderer';
import type { CanvasContext } from '../render/canvas';
import type { BackgroundAnimation, VermiculateEffect, SubstrateEffect } from '../render/background';
import type { SettingsState } from '../settings';
import { saveGame } from '../settings';
import { AUTO_SAVE_INTERVAL_MS } from '../data/balance';
import { ACHIEVEMENT_BY_ID } from '../data/achievements';
import { TIER_BY_ID } from '../data/tiers';
import type { TierId } from '../data/tiers';
import { computeOutputCompression } from '../util/particle-compression';
import type { AppState, UIPanels } from './app-types';
import { updateVisiblePanels } from './app-actions';
import type { HudOverlay } from '../ui/hud/hud-overlay';
import type { AudioSystem } from '../audio';

// ─── Game loop context ──────────────────────────────────────────

export interface GameLoopContext {
  appState: AppState;
  cc: CanvasContext;
  particles: ParticleSystem;
  settings: SettingsState;
  uiPanels: UIPanels;
  bgAnimation: BackgroundAnimation;
  vermiculateEffect: VermiculateEffect;
  substrateEffect: SubstrateEffect;
  recomputeGenerators: () => void;
  hudOverlay: HudOverlay;
  lastUnlockedTierCount: { value: number };
  lastFrameMs: { value: number };
  audioSystem?: AudioSystem;
}

// ─── Game loop ──────────────────────────────────────────────────

export function createGameLoop(ctx: GameLoopContext): (nowMs: number) => void {
  // Per-loom fractional particle accumulator (render-side only, not persisted).
  // Tracks sub-particle remainders so fractional emit rates average out correctly.
  const particleEmitAccumulators = new Map<TierId, number>();
  // Reused map for generator equation label rates (avoids per-frame allocation).
  const generatorRatesPerSec = new Map<TierId, number>();

  function gameLoop(nowMs: number): void {
    const deltaMs = Math.min(nowMs - ctx.lastFrameMs.value, 200);
    ctx.lastFrameMs.value = nowMs;

    // ── Always tick the main sim so looms, auto-tap, and pending idle motes
    // ── continue to run regardless of which tab is active. ──────────────
    const simResult = simTick(ctx.appState.game, deltaMs);

    // ── Auto-save (runs on every tab) ────────────────────────────
    if (nowMs - ctx.appState.game.lastSaveMs > AUTO_SAVE_INTERVAL_MS) {
      ctx.appState.game.lastSaveMs = nowMs;
      saveGame(ctx.appState.game);
    }

    // ── RPG tab: run independent render then skip main canvas draw ────────
    if (ctx.appState.activeTab === 'rpg') {
      const autoMove = ctx.uiPanels.rpgMenuPanel.isAutoMoveEnabled;
      ctx.uiPanels.rpgRender.setLowGraphicsMode(ctx.settings.graphicsQuality === 'low');
      ctx.uiPanels.rpgRender.setEnemyIndicatorStyle(ctx.settings.rpgEnemyIndicatorStyle);
      ctx.uiPanels.rpgRender.setNumberFormat(ctx.settings.numberFormat);
      ctx.uiPanels.rpgRender.setDevMode(ctx.settings.isDevMode);
      ctx.uiPanels.rpgRender.setInvincibilityMode(ctx.settings.isInvincibilityMode);
      ctx.uiPanels.rpgRender.update(deltaMs, autoMove);
      requestAnimationFrame(gameLoop);
      return;
    }

    // Fire achievement audio events for anything newly unlocked this tick
    if (ctx.audioSystem && simResult.newlyUnlockedAchievementIds.length > 0) {
      for (const id of simResult.newlyUnlockedAchievementIds) {
        const def = ACHIEVEMENT_BY_ID.get(id);
        ctx.audioSystem.onAchievementUnlocked(def?.isSecret === true);
      }
    }

    // Recompute generators when tiers are newly unlocked
    if (ctx.appState.game.progression.unlockedTierCount !== ctx.lastUnlockedTierCount.value) {
      ctx.lastUnlockedTierCount.value = ctx.appState.game.progression.unlockedTierCount;
      ctx.recomputeGenerators();
    }

    if (simResult.autoTapped && simResult.autoTapGains) {
      const cx = ctx.cc.widthPx / 2;
      const cy = ctx.cc.heightPx / 2;
      for (const [tierId] of simResult.autoTapGains) {
        ctx.particles.emitAtPosition(cx, cy, 2, tierId, nowMs);
      }
    }

    // Emit compressed particles at generator positions for loom production.
    // Each loom emits only the single highest-value size appropriate for its
    // current rate; no smaller-size leftovers are spawned.
    // Fractional rates are handled by delta-time accumulation.
    const deltaSec = deltaMs / 1000;
    const loomMultiplier = ctx.appState.game.achievements.loomMultiplierBonus;
    const loomWaveBoost = getWaveBoostMultiplier(ctx.appState.game.rpg);
    for (const loom of ctx.appState.game.looms.looms) {
      if (!loom.isUnlocked || loom.level <= 0) continue;

      const specialBonus = ctx.appState.game.looms.specialPurchased.has(loom.tierId) ? 2 : 1;
      const rawRate = getLoomRate(loom.tierId, loom.level) * loomMultiplier * loomWaveBoost * specialBonus;
      if (rawRate <= 0) continue;

      const { sizeIndex, emitRatePerSec } = computeOutputCompression(rawRate);

      // Accumulate fractional emit count; spawn whole particles only
      const acc = (particleEmitAccumulators.get(loom.tierId) ?? 0) + emitRatePerSec * deltaSec;
      const toEmit = Math.floor(acc);
      particleEmitAccumulators.set(loom.tierId, acc - toEmit);

      for (let i = 0; i < toEmit; i++) {
        ctx.particles.emit(loom.tierId, sizeIndex, ctx.appState.generatorState.generators, nowMs);
      }
    }

    if (ctx.appState.tapFlashAlpha > 0) {
      ctx.appState.tapFlashAlpha = Math.max(0, ctx.appState.tapFlashAlpha - deltaMs / 200);
    }
    ctx.appState.animPulse += deltaMs / 500;

    const equationCenterX = ctx.cc.widthPx / 2;
    const equationCenterY = ctx.cc.heightPx / 2;
    const isLowGraphics = ctx.settings.graphicsQuality === 'low';

    // Ensure generators are initialized on first frame
    if (ctx.appState.generatorState.generators.length === 0) {
      ctx.recomputeGenerators();
    }

    // Sync aliven state into particle system (cheap: at most 11 entries)
    const alivenedTierIndices = ctx.particles.alivenedTierIndices;
    alivenedTierIndices.clear();
    for (const tierId of ctx.appState.game.aliven.alivenedTierIds) {
      const tier = TIER_BY_ID.get(tierId as TierId);
      if (tier) alivenedTierIndices.add(tier.unlockOrder);
    }
    // Sync editable interaction matrix to particle system
    ctx.particles.interactionMatrix = ctx.appState.game.aliven.interactionMatrix;

    const particleAudioEvents = ctx.particles.update(
      deltaMs,
      nowMs,
      ctx.appState.generatorState.generators,
      equationCenterX,
      equationCenterY,
      ctx.cc.widthPx,
      ctx.cc.heightPx,
      ctx.appState.forge,
      { enableGlow: !isLowGraphics, enableTrails: !isLowGraphics },
      ctx.appState.game.equation.isForgeUnlocked,
    );

    // Fire particle/forge audio events
    if (ctx.audioSystem) {
      if (particleAudioEvents.mergesCompleted > 0) {
        ctx.audioSystem.onMotesMerged(particleAudioEvents.mergesCompleted);
      }
      if (particleAudioEvents.forgeSpinUpBegan)     ctx.audioSystem.onForgeSpinUpBegan();
      if (particleAudioEvents.forgeCrunchStarted)   ctx.audioSystem.onForgeCrunchStarted();
      if (particleAudioEvents.forgeSpinUpCancelled) ctx.audioSystem.onForgeSpinUpCancelled();

      // Update ambiance based on active tab every frame
      ctx.audioSystem.updateAmbianceForTab(ctx.appState.activeTab);
    }

    // ── Update background animation ──
    ctx.bgAnimation.update(deltaMs);
    updateGeneratorRendererTime(deltaMs);

    // ── Render ──
    clearCanvas(ctx.cc);
    drawBackground(ctx.cc, '#000000');
    if (ctx.settings.backgroundStyle === 'vermiculate') {
      ctx.vermiculateEffect.update(nowMs, ctx.cc.widthPx, ctx.cc.heightPx);
      ctx.vermiculateEffect.draw(ctx.cc.ctx);
    } else if (ctx.settings.backgroundStyle === 'substrate') {
      ctx.substrateEffect.update(nowMs, ctx.cc.widthPx, ctx.cc.heightPx);
      ctx.substrateEffect.draw(ctx.cc.ctx);
    }
    // 'none' → skip both

    drawGenerators(
      ctx.cc,
      ctx.appState.generatorState.generators,
      ctx.particles.spawnerRotations,
      ctx.appState.generatorState.fadeIns,
      _buildGeneratorRates(ctx, generatorRatesPerSec),
    );

    // Only draw forge on canvas if forge is unlocked (equation is now in HUD)
    if (ctx.appState.game.equation.isForgeUnlocked) {
      drawForge(ctx.cc, equationCenterX, equationCenterY, ctx.particles.forgeRotation, ctx.appState.forge, nowMs);
      drawForgeCrunch(ctx.cc, equationCenterX, equationCenterY, ctx.appState.forge);
    }

    const terms = buildEquationView(ctx.appState.game.equation);

    // Update DOM HUD overlay (equation, score, motes — non-pixelated)
    const pointerPos = getGeneratorPointerPos();
    ctx.hudOverlay.update({
      equivalence: getEquivalence(ctx.appState.game.resources),
      onScreenMotes: ctx.particles.getOnScreenMoteCount(),
      onScreenParticleCount: ctx.particles.getOnScreenParticleCount(),
      terms,
      tapFlashAlpha: ctx.appState.tapFlashAlpha,
      isForgeUnlocked: ctx.appState.game.equation.isForgeUnlocked,
      numberFormat: ctx.settings.numberFormat,
      generatorInfos: ctx.appState.generatorState.generators,
      generatorRatesPerSec: generatorRatesPerSec,
      canvasWidthPx: ctx.cc.widthPx,
      canvasHeightPx: ctx.cc.heightPx,
      pointerX: pointerPos.x,
      pointerY: pointerPos.y,
      generatorEquationVisibility: ctx.settings.generatorEquationVisibility,
    });

    ctx.particles.draw(
      ctx.cc,
      { enableGlow: !isLowGraphics, enableTrails: !isLowGraphics },
      ctx.appState.particleDrag,
      ctx.cc.widthPx,
      ctx.cc.heightPx,
      nowMs,
    );

    if (Math.floor(nowMs / 100) !== Math.floor((nowMs - deltaMs) / 100)) {
      updateVisiblePanels(ctx.appState, ctx.uiPanels, ctx.appState.game, ctx.settings.isDevMode, ctx.settings.numberFormat);
    }

    requestAnimationFrame(gameLoop);
  }

  return gameLoop;
}

/**
 * Populate and return a map of effective mote production rates (motes/sec) per tier,
 * accounting for loom level, achievement multiplier, and special loom bonus.
 * Mutates and returns the provided map to avoid per-frame allocation.
 */
function _buildGeneratorRates(
  ctx: GameLoopContext,
  out: Map<TierId, number>,
): ReadonlyMap<TierId, number> {
  out.clear();
  const loomMultiplier = ctx.appState.game.achievements.loomMultiplierBonus;
  const waveBoost = getWaveBoostMultiplier(ctx.appState.game.rpg);
  for (const loom of ctx.appState.game.looms.looms) {
    if (!loom.isUnlocked || loom.level <= 0) continue;
    const baseRate = getLoomRate(loom.tierId, loom.level) * loomMultiplier * waveBoost;
    const specialBonus = ctx.appState.game.looms.specialPurchased.has(loom.tierId) ? 2 : 1;
    out.set(loom.tierId, baseRate * specialBonus);
  }
  return out;
}
