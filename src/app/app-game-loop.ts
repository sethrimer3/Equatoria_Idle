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
} from '../sim';
import {
  clearCanvas,
  drawBackground,
  drawGenerators,
  drawForge,
  drawForgeCrunch,
  type ParticleSystem,
} from '../render';
import { updateGeneratorRendererTime } from '../render/generators/generator-renderer';
import type { CanvasContext } from '../render/canvas';
import type { BackgroundAnimation, VermiculateEffect, SubstrateEffect } from '../render/background';
import type { SettingsState } from '../settings';
import { saveGame } from '../settings';
import { AUTO_SAVE_INTERVAL_MS } from '../data/balance';
import { ACHIEVEMENT_BY_ID } from '../data/achievements';
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

  function gameLoop(nowMs: number): void {
    const deltaMs = Math.min(nowMs - ctx.lastFrameMs.value, 200);
    ctx.lastFrameMs.value = nowMs;

    const simResult = simTick(ctx.appState.game, deltaMs);

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
    const loomMultiplier = ctx.appState.game.achievements.loomMultiplierBonus;
    for (const loom of ctx.appState.game.looms.looms) {
      if (!loom.isUnlocked || loom.level <= 0) continue;

      const rawRate = getLoomRate(loom.tierId, loom.level) * loomMultiplier;
      if (rawRate <= 0) continue;

      const { sizeIndex, emitRatePerSec } = computeOutputCompression(rawRate);

      // Accumulate fractional emit count; spawn whole particles only
      let acc = (particleEmitAccumulators.get(loom.tierId) ?? 0) + emitRatePerSec * deltaMs / 1000;
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
    );

    // Only draw forge on canvas if forge is unlocked (equation is now in HUD)
    if (ctx.appState.game.equation.isForgeUnlocked) {
      drawForge(ctx.cc, equationCenterX, equationCenterY, ctx.particles.forgeRotation, ctx.appState.forge, nowMs);
      drawForgeCrunch(ctx.cc, equationCenterX, equationCenterY, ctx.appState.forge);
    }

    const terms = buildEquationView(ctx.appState.game.equation);

    // Update DOM HUD overlay (equation, score, motes — non-pixelated)
    ctx.hudOverlay.update({
      equivalence: getEquivalence(ctx.appState.game.resources),
      onScreenMotes: ctx.particles.getOnScreenMoteCount(),
      terms,
      tapFlashAlpha: ctx.appState.tapFlashAlpha,
      isForgeUnlocked: ctx.appState.game.equation.isForgeUnlocked,
      numberFormat: ctx.settings.numberFormat,
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

    if (nowMs - ctx.appState.game.lastSaveMs > AUTO_SAVE_INTERVAL_MS) {
      ctx.appState.game.lastSaveMs = nowMs;
      saveGame(ctx.appState.game);
    }

    requestAnimationFrame(gameLoop);
  }

  return gameLoop;
}
