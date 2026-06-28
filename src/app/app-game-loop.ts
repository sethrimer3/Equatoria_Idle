/**
 * app-game-loop.ts — Game loop, render pipeline, and simulation tick.
 *
 * Extracted from game-app.ts to isolate the frame-by-frame update logic.
 */

import {
  simTick,
  getLoomRate,
  getWaveBoostMultiplier,
  processLoomCapture,
  applyForgeSacrifice,
  addMotes,
  pendingMoteValue,
} from '../sim';
import { tickForgeWarmup } from '../sim/forge/forge-state';
import { getLoomInputTierId } from '../sim/looms';
import {
  clearCanvas,
  drawBackground,
  resetCanvasRenderState,
  drawGenerators,
  drawForge,
  drawForgeCrunch,
  drawForgeSacrificeFlash,
  drawLoomFieldAuras,
  type ParticleSystem,
} from '../render';
import type { ForgeFieldInfo } from '../render/particles/forge-field-forces';
import { FORGE_RADIUS, MAX_FORGE_ATTRACTION_DISTANCE } from '../data/particles/particle-config';
import { GENERATOR_RADIUS_PX } from '../sim/particles/generator-state';

// Distance between adjacent generators on the 11-slot ring (chord length).
// Loom outerRadius must reach at least to the centre of the previous-tier
// generator so compatible motes are steered inward before they overshoot.
const _ADJACENT_GEN_DIST = 2 * GENERATOR_RADIUS_PX * Math.sin(Math.PI / 11);
const LOOM_OUTER_RADIUS = Math.max(FORGE_RADIUS * 3.8, _ADJACENT_GEN_DIST + 10);
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
import { drawIdleViewportDebug } from '../render/canvas/idle-viewport-debug';
import { flushParticleDragMove } from '../input/particle-drag';
import { tickForgeDrag } from './forge-drag-detection';
import { perfStats, resetPerfStats, drawPerfStats } from '../render/debug/perf-stats';

interface QueuedAchievementNotification {
  readonly isSecret: boolean;
}

const ACHIEVEMENT_NOTIFICATION_SPACING_MS = 700;

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
  // Reused array for forge/loom capture fields (rebuilt each frame, not reallocated).
  const forgeFieldsBuffer: ForgeFieldInfo[] = [];
  const achievementNotificationQueue: QueuedAchievementNotification[] = [];
  let nextAchievementNotificationMs = 0;

  // Cooldown for loom-capture audio: play at most once per 400 ms to avoid spam.
  let _loomAudioLastMs = 0;
  const LOOM_AUDIO_COOLDOWN_MS = 400;

  // ── Auto-graphics FPS tracking ───────────────────────────────
  // Rolling window of the last N frame delta-times for a stable avg-FPS estimate.
  const AUTO_FPS_WINDOW = 60;
  const _frameDeltasMs = new Float32Array(AUTO_FPS_WINDOW).fill(16.67);
  let _frameDeltaIdx = 0;
  let _autoGlow = true;
  let _autoTrails = true;
  let _autoReducedParticles = false;
  // Hysteresis: require FPS to drop further to disable than to re-enable.
  const DISABLE_GLOW_BELOW_FPS    = 40;
  const REENABLE_GLOW_ABOVE_FPS   = 50;
  const DISABLE_TRAILS_BELOW_FPS  = 50;
  const REENABLE_TRAILS_ABOVE_FPS = 55;
  const REDUCE_PARTICLES_BELOW_FPS  = 30;
  const RESTORE_PARTICLES_ABOVE_FPS = 40;

  // ── One-time particle system callback wiring ─────────────────
  ctx.particles.onParticleCapturedByLoom = (_, inputTierId, mass) => {
    processLoomCapture(ctx.appState.game, inputTierId as TierId, mass);
    // Play a soft merge-style sound for loom captures, rate-limited to avoid spam.
    if (ctx.audioSystem) {
      const nowAudio = performance.now();
      if (nowAudio - _loomAudioLastMs > LOOM_AUDIO_COOLDOWN_MS) {
        _loomAudioLastMs = nowAudio;
        ctx.audioSystem.onMotesMerged(1);
      }
    }
  };
  ctx.particles.onEquationForgeCrunchCompleted = (sacrifices) => {
    const crystalsGained = applyForgeSacrifice(ctx.appState.game, sacrifices);
    ctx.audioSystem?.onForgeCrunchCompleted();
    // Record the timestamp so the sacrifice flash visual plays this frame.
    ctx.appState.forgeSacrificeFlashMs = performance.now();
    ctx.appState.lastRefinedCrystalsGained = crystalsGained;
  };

  function gameLoop(nowMs: number): void {
    const deltaMs = Math.min(nowMs - ctx.lastFrameMs.value, 200);
    ctx.lastFrameMs.value = nowMs;

    // ── Always tick the main sim so looms, auto-tap, and pending idle motes
    // ── continue to run regardless of which tab is active. ──────────────
    const simResult = simTick(ctx.appState.game, deltaMs);

    // ── Advance the forge warm-up timer using wall-clock time ────────────
    // (tickForgeWarmup internally calls startEquationForgeCrunch when the
    //  9-second warm-up completes, so no additional action is needed here.)
    tickForgeWarmup(ctx.appState.forge, nowMs);

    // ── Auto-save (runs on every tab) ────────────────────────────
    if (nowMs - ctx.appState.game.lastSaveMs > AUTO_SAVE_INTERVAL_MS) {
      ctx.appState.game.lastSaveMs = nowMs;
      saveGame(ctx.appState.game);
    }

    // ── RPG tab: run independent render then skip main canvas draw ────────
    if (ctx.appState.activeTab === 'rpg') {
      const autoMove = ctx.uiPanels.rpgMenuPanel.isAutoMoveEnabled;
      ctx.uiPanels.rpgRender.setLowGraphicsMode(ctx.settings.graphicsQuality === 'low');
      ctx.uiPanels.rpgRender.setScreenShakeEnabled(ctx.settings.isScreenShakeEnabled);
      ctx.uiPanels.rpgRender.setEnemyIndicatorStyle(ctx.settings.rpgEnemyIndicatorStyle);
      ctx.uiPanels.rpgRender.setNumberFormat(ctx.settings.numberFormat);
      ctx.uiPanels.rpgRender.setDevMode(ctx.settings.isDevMode);
      ctx.uiPanels.rpgRender.setInvincibilityMode(ctx.settings.isInvincibilityMode);
      ctx.uiPanels.rpgRender.setDeveloperVisuals({
        viewport: ctx.settings.isRpgViewportDebugEnabled,
        pathfinding: ctx.settings.isRpgPathfindingDebugEnabled,
        verdureWalls: ctx.settings.isRpgVerdureWallDebugEnabled,
        nadirAnchors: ctx.settings.isRpgNadirAnchorDebugEnabled,
        bossStage: ctx.settings.isRpgBossStageDebugEnabled,
        topographyLighting: ctx.settings.isTopographyLightingDebugEnabled,
        softImpetusAsteroidShadows: ctx.settings.isSoftImpetusAsteroidShadows,
        rpgPixelatedRender: ctx.settings.isRpgPixelatedRender,
      });
      ctx.uiPanels.rpgRender.setTopographicTerrainDebugEnabled(
        ctx.settings.isDevMode && ctx.settings.isTopographicTerrainDebugEnabled,
      );
      ctx.uiPanels.rpgRender.update(deltaMs, autoMove);
      requestAnimationFrame(gameLoop);
      return;
    }

    // Queue achievement notification effects instead of firing every unlock at
    // once. Large unlock batches otherwise stack popups and layer loud SFX.
    if (simResult.newlyUnlockedAchievementIds.length > 0) {
      for (const id of simResult.newlyUnlockedAchievementIds) {
        const def = ACHIEVEMENT_BY_ID.get(id);
        achievementNotificationQueue.push({ isSecret: def?.isSecret === true });
      }
    }
    if (achievementNotificationQueue.length > 0 && nowMs >= nextAchievementNotificationMs) {
      const notification = achievementNotificationQueue.shift()!;
      ctx.audioSystem?.onAchievementUnlocked(notification.isSecret);
      ctx.uiPanels.tabBar.showAchievedPopup();
      nextAchievementNotificationMs = nowMs + ACHIEVEMENT_NOTIFICATION_SPACING_MS;
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

    // ── Compute effective graphics flags ─────────────────────────
    const gfxQuality = ctx.settings.graphicsQuality;
    const isLowGraphics  = gfxQuality === 'low';
    const isAutoGraphics = gfxQuality === 'auto';

    // Update FPS rolling window (skip first frame where deltaMs may be 0).
    if (deltaMs > 0) {
      _frameDeltasMs[_frameDeltaIdx % AUTO_FPS_WINDOW] = deltaMs;
      _frameDeltaIdx++;
    }

    if (isAutoGraphics && _frameDeltaIdx >= AUTO_FPS_WINDOW) {
      let sumMs = 0;
      for (let _i = 0; _i < AUTO_FPS_WINDOW; _i++) sumMs += _frameDeltasMs[_i];
      const avgFps = (AUTO_FPS_WINDOW * 1000) / sumMs;

      // Hysteretic thresholds to avoid oscillation at the boundary.
      if (_autoTrails  && avgFps < DISABLE_TRAILS_BELOW_FPS)  _autoTrails  = false;
      if (!_autoTrails && avgFps > REENABLE_TRAILS_ABOVE_FPS)  _autoTrails  = true;
      if (_autoGlow    && avgFps < DISABLE_GLOW_BELOW_FPS)    _autoGlow    = false;
      if (!_autoGlow   && avgFps > REENABLE_GLOW_ABOVE_FPS)   _autoGlow    = true;
      if (!_autoReducedParticles && avgFps < REDUCE_PARTICLES_BELOW_FPS)  _autoReducedParticles = true;
      if (_autoReducedParticles  && avgFps > RESTORE_PARTICLES_ABOVE_FPS) _autoReducedParticles = false;
    }

    // Resolve to concrete per-frame booleans.
    let effectiveGlow: boolean;
    let effectiveTrails: boolean;
    let effectiveReducedParticles: boolean;
    if (isAutoGraphics) {
      effectiveGlow             = _autoGlow;
      effectiveTrails           = _autoTrails;
      effectiveReducedParticles = _autoReducedParticles;
    } else if (isLowGraphics) {
      effectiveGlow             = false;
      effectiveTrails           = false;
      effectiveReducedParticles = true;
    } else {
      effectiveGlow             = true;
      effectiveTrails           = true;
      effectiveReducedParticles = ctx.settings.isReducedParticles;
    }

    // Ensure generators are initialized on first frame
    if (ctx.appState.generatorState.generators.length === 0) {
      ctx.recomputeGenerators();
    }

    // Drain one pending idle mote per frame as a real physical particle.
    // Only runs here (not in simTick) so particles are visible on the equation
    // canvas and resources are credited exactly when the particle spawns.
    // RPG tab never reaches this point (early return above), satisfying the
    // "do not drain while activeTab === 'rpg'" requirement.
    if (ctx.appState.game.pendingIdleMotes.length > 0) {
      const entry = ctx.appState.game.pendingIdleMotes[0]!;
      ctx.particles.emit(entry.tierId, entry.sizeIndex, ctx.appState.generatorState.generators, nowMs);
      addMotes(ctx.appState.game.resources, entry.tierId, pendingMoteValue(entry.sizeIndex));
      entry.count--;
      if (entry.count <= 0) {
        ctx.appState.game.pendingIdleMotes.shift();
      }
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

    // ── Build capture fields for forge and looms ────────────────
    forgeFieldsBuffer.length = 0;
    if (ctx.appState.game.equation.isForgeUnlocked) {
      forgeFieldsBuffer.push({
        id: 'forge',
        x: equationCenterX,
        y: equationCenterY,
        captureRadius: FORGE_RADIUS,
        outerRadius: MAX_FORGE_ATTRACTION_DISTANCE,
        compatibleTierId: null,
        isUnlocked: true,
      });
    }
    for (const loom of ctx.appState.game.looms.looms) {
      if (!loom.isUnlocked) continue;
      const inputTierId = getLoomInputTierId(loom.tierId);
      if (!inputTierId) continue; // sand loom has no input tier
      // Position loom field at the generator for the loom's OUTPUT tier
      let loomX = equationCenterX, loomY = equationCenterY;
      for (const gen of ctx.appState.generatorState.generators) {
        if (gen.tierId === loom.tierId) { loomX = gen.x; loomY = gen.y; break; }
      }
      forgeFieldsBuffer.push({
        id: `loom_${loom.tierId}`,
        x: loomX,
        y: loomY,
        captureRadius: FORGE_RADIUS * 1.2,
        outerRadius: LOOM_OUTER_RADIUS,
        compatibleTierId: inputTierId,
        isUnlocked: true,
      });
    }
    ctx.particles.setForgeFields(forgeFieldsBuffer);

    const isDevMode = ctx.settings.isDevMode;
    if (isDevMode) resetPerfStats();

    // Flush batched pointermove — applies the latest pointer position to locked
    // particles once per frame instead of once per event (see particle-drag.ts).
    const _t0drag = isDevMode ? performance.now() : 0;
    flushParticleDragMove(ctx.appState.particleDrag);

    // Forge drag detection: check if any dragged particle entered the forge
    // capture radius, start/cancel/commit mote conversion accordingly.
    if (ctx.appState.game.equation.isForgeUnlocked) {
      tickForgeDrag(
        ctx.appState.forge,
        ctx.appState.game.resources,
        ctx.appState.particleDrag,
        equationCenterX,
        equationCenterY,
        FORGE_RADIUS,
        nowMs,
        (particleId) => ctx.particles.removeParticleById(particleId),
      );
    }

    if (isDevMode) perfStats.dragFlushMs = performance.now() - _t0drag;

    const _t0update = isDevMode ? performance.now() : 0;
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
      isDevMode,
    );
    if (isDevMode) {
      perfStats.updateMs = performance.now() - _t0update;
      perfStats.particleCount = ctx.particles.particleCount;
    }

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
    const _t0render = isDevMode ? performance.now() : 0;
    resetCanvasRenderState(ctx.cc);
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

    // Draw loom-field auras beneath particles (after generators, before forge)
    drawLoomFieldAuras(ctx.cc, forgeFieldsBuffer, nowMs);

    // Only draw forge on canvas if forge is unlocked (equation is now in HUD)
    if (ctx.appState.game.equation.isForgeUnlocked) {
      drawForge(ctx.cc, equationCenterX, equationCenterY, ctx.particles.forgeRotation, ctx.appState.forge, nowMs, ctx.appState.forge.heatTapCount);
      drawForgeCrunch(ctx.cc, equationCenterX, equationCenterY, ctx.appState.forge);
      // Post-crunch sacrifice shockwave flash
      drawForgeSacrificeFlash(ctx.cc, equationCenterX, equationCenterY, nowMs, ctx.appState.forgeSacrificeFlashMs, ctx.appState.lastRefinedCrystalsGained);
    }

    // The visible equation and equivalence displays were intentionally retired.
    // Keep the active HUD focused on mote counts and loom production rates.
    const pointerPos = getGeneratorPointerPos();
    ctx.hudOverlay.update({
      onScreenMotes: ctx.particles.getOnScreenMoteCount(),
      onScreenParticleCount: ctx.particles.getOnScreenParticleCount(),
      numberFormat: ctx.settings.numberFormat,
      generatorInfos: ctx.appState.generatorState.generators,
      generatorRatesPerSec: generatorRatesPerSec,
      canvasWidthPx: ctx.cc.widthPx,
      canvasHeightPx: ctx.cc.heightPx,
      pointerX: pointerPos.x,
      pointerY: pointerPos.y,
      generatorEquationVisibility: ctx.settings.generatorEquationVisibility,
    });

    const _t0ptc = isDevMode ? performance.now() : 0;
    ctx.particles.draw(
      ctx.cc,
      { enableGlow: !isLowGraphics, enableTrails: !isLowGraphics },
      ctx.appState.particleDrag,
      ctx.cc.widthPx,
      ctx.cc.heightPx,
      nowMs,
      ctx.settings.lowGraphicsMotes,
    );
    if (isDevMode) perfStats.particleDrawMs = performance.now() - _t0ptc;

    // Dev-mode overlays (drawn last so they are always visible)
    if (isDevMode) {
      perfStats.renderMs = performance.now() - _t0render;
      if (ctx.settings.isIdleViewportDebugEnabled) {
        drawIdleViewportDebug(ctx.cc);
      }
      drawPerfStats(ctx.cc.ctx, ctx.cc.widthPx, ctx.cc.heightPx);
    }

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
