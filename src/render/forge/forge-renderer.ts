import type { CanvasContext } from '../canvas';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import {
  getForgeRotationMultiplier,
  getActiveRingCount,
  getForgeWarmupProgress,
} from '../../sim/forge/forge-state';
import {
  FORGE_RADIUS,
  MAX_FORGE_ATTRACTION_DISTANCE,
  FORGE_VALID_WAIT_TIME_MS,
  FORGE_SPIN_UP_DURATION_MS,
  FORGE_SPIN_DOWN_DURATION_MS,
} from '../../data/particles/particle-config';
import {
  FORGE_COLD_SPRITE_ALT_PATH,
  FORGE_COLD_SPRITE_PATH,
  FORGE_SPRITE_ALT_LEGACY_PATH,
  FORGE_SPRITE_ALT_PATH,
  FORGE_SPRITE_LEGACY_PATH,
  FORGE_SPRITE_PATH,
} from '../assets/asset-paths';
import { getCachedImage, loadImage } from '../assets/asset-loader';
import { TIER_BY_ID } from '../../data/tiers';
import { drawForgeRings, preloadForgeRingSprites } from './forge-ring-renderer';
import {
  drawForgeBackgroundGlow,
  drawForgeHeatRings,
  drawForgeInfluenceSwirl,
  drawForgeSprite,
  drawForgeFallback,
  drawLoomAura,
} from './forge-renderer-draw';
import type { ForgeFieldInfo } from '../particles/forge-field-forces';

/** Visual influence circle is drawn at 75 % of the physics range. */
const FORGE_INFLUENCE_VISUAL_SCALE = 0.75;
const FORGE_COLD_ROTATION_MULTIPLIER = 0.18;
const FORGE_FIRE_FADE_DURATION_MS = 900;

/** Preload forge sprites. Call once at startup. */
export function preloadForgeSprites(): void {
  loadImage(FORGE_SPRITE_PATH).catch(() => loadImage(FORGE_SPRITE_LEGACY_PATH).catch(() => undefined));
  loadImage(FORGE_SPRITE_ALT_PATH).catch(() => loadImage(FORGE_SPRITE_ALT_LEGACY_PATH).catch(() => undefined));
  loadImage(FORGE_COLD_SPRITE_PATH).catch(() => undefined);
  loadImage(FORGE_COLD_SPRITE_ALT_PATH).catch(() => undefined);
  preloadForgeRingSprites();
}

export function drawForge(
  cc: CanvasContext,
  forgeX: number,
  forgeY: number,
  forgeRotation: number,
  crunchState: ForgeCrunchState,
  nowMs: number,
  heatTapCount = 0,
): void {
  const ctx = cc.ctx;
  const forgeSize = FORGE_RADIUS;
  const spinMult = getForgeRotationMultiplier(
    crunchState, nowMs,
    FORGE_VALID_WAIT_TIME_MS, FORGE_SPIN_UP_DURATION_MS, FORGE_SPIN_DOWN_DURATION_MS,
  );
  const fireAlpha = getForgeFireAlpha(crunchState, nowMs);
  const idleSpinMult = FORGE_COLD_ROTATION_MULTIPLIER + (spinMult - FORGE_COLD_ROTATION_MULTIPLIER) * fireAlpha;
  const effectiveRotation = forgeRotation * idleSpinMult;

  // Warmup progress drives a brightening/pulsing core glow
  const warmupProgress = getForgeWarmupProgress(crunchState, nowMs);
  const activeRingCount = getActiveRingCount(crunchState, nowMs);

  // ── Large soft glow — drawn first so it sits just above the background ──
  // During warmup the glow intensifies with warmup progress
  const glowAlpha = Math.max(fireAlpha, warmupProgress * 0.85);
  if (glowAlpha > 0.05) {
    ctx.save();
    ctx.globalAlpha = glowAlpha;
    drawForgeBackgroundGlow(ctx, forgeX, forgeY, forgeSize, nowMs);
    ctx.restore();
  }

  drawForgeRings(ctx, forgeX, forgeY, forgeSize, nowMs, fireAlpha, activeRingCount);

  // ── Heat rings — drawn before the sprite, one ring per tap ──────────────
  if (heatTapCount > 0 && !crunchState.isActive && !crunchState.isWarmingUp) {
    drawForgeHeatRings(ctx, forgeX, forgeY, forgeSize, heatTapCount, nowMs);
  }

  const sprite = getCachedImage(FORGE_SPRITE_PATH) ?? getCachedImage(FORGE_SPRITE_LEGACY_PATH);
  const spriteAlt = getCachedImage(FORGE_SPRITE_ALT_PATH) ?? getCachedImage(FORGE_SPRITE_ALT_LEGACY_PATH);
  const coldSprite = getCachedImage(FORGE_COLD_SPRITE_PATH);
  const coldSpriteAlt = getCachedImage(FORGE_COLD_SPRITE_ALT_PATH);

  // Blend warmup progress into sprite fire alpha so the forge visually activates
  const spriteFireAlpha = Math.max(fireAlpha, warmupProgress);
  if (sprite && spriteAlt) {
    drawForgeSprite(ctx, forgeX, forgeY, forgeSize, effectiveRotation, sprite, spriteAlt, coldSprite, coldSpriteAlt, spriteFireAlpha);
  } else {
    drawForgeFallback(ctx, forgeX, forgeY, forgeSize, effectiveRotation);
  }

  // Attraction radius — bidirectional fire swirl, 25 % smaller than physics range
  const swirlAlpha = Math.max(fireAlpha, warmupProgress * 0.7);
  if (swirlAlpha > 0.05) {
    ctx.save();
    ctx.globalAlpha = swirlAlpha;
    drawForgeInfluenceSwirl(ctx, forgeX, forgeY, MAX_FORGE_ATTRACTION_DISTANCE * FORGE_INFLUENCE_VISUAL_SCALE, nowMs);
    ctx.restore();
  }
}

function getForgeFireAlpha(crunchState: ForgeCrunchState, nowMs: number): number {
  if (crunchState.isActive) return 1;
  // During warm-up, fire alpha rises with warmup progress
  if (crunchState.isWarmingUp && crunchState.warmupStartMs !== null) {
    const progress = Math.min(1, (nowMs - crunchState.warmupStartMs) / (9_000));
    return Math.min(1, progress * 1.2);
  }
  if (crunchState.heatTapCount <= 0 || crunchState.lastHeatTapMs <= 0) return 0;
  const elapsedMs = Math.max(0, nowMs - crunchState.lastHeatTapMs);
  return Math.max(0, 1 - elapsedMs / FORGE_FIRE_FADE_DURATION_MS);
}

/**
 * Draw faint colored aura rings around each active loom capture field.
 * Call this after drawGenerators and before drawForge so auras sit beneath particles.
 */
export function drawLoomFieldAuras(
  cc: CanvasContext,
  fields: readonly ForgeFieldInfo[],
  nowMs: number,
): void {
  for (const field of fields) {
    if (field.id === 'forge' || !field.compatibleTierId) continue;
    if (!field.isUnlocked) continue;
    const tier = TIER_BY_ID.get(field.compatibleTierId);
    if (!tier) continue;
    drawLoomAura(cc.ctx, field.x, field.y, field.captureRadius, field.outerRadius, tier.color, nowMs);
  }
}

export function drawForgeCrunch(
  cc: CanvasContext,
  forgeX: number,
  forgeY: number,
  crunchState: ForgeCrunchState,
): void {
  if (!crunchState.isActive) return;
  const ctx = cc.ctx;
  const progress = crunchState.progress;
  const currentRadius = FORGE_RADIUS * (1 - progress);
  const alphaCurve = Math.sin(progress * Math.PI);
  const alpha = alphaCurve * 0.8;

  ctx.save();
  ctx.strokeStyle = `rgba(255,255,255,${alpha})`;
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(forgeX, forgeY, currentRadius, 0, Math.PI * 2);
  ctx.stroke();

  ctx.strokeStyle = `rgba(200,200,255,${alpha * 0.5})`;
  ctx.lineWidth = 6;
  ctx.beginPath();
  ctx.arc(forgeX, forgeY, currentRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();
}

/** Duration in ms for the post-sacrifice shockwave ring animation. */
const SACRIFICE_FLASH_DURATION_MS = 600;

/**
 * Draw a brief expanding shockwave ring at the forge when a sacrifice crunch completes.
 * Call this every frame; the effect is derived from the elapsed time since the flash.
 *
 * @param forgeSacrificeFlashMs - timestamp when the crunch completed (from AppState),
 *   or 0 if no flash has occurred yet.
 */
export function drawForgeSacrificeFlash(
  cc: CanvasContext,
  forgeX: number,
  forgeY: number,
  nowMs: number,
  forgeSacrificeFlashMs: number,
  lastRefinedCrystalsGained?: Map<string, number>,
): void {
  if (forgeSacrificeFlashMs === 0) return;
  const elapsed = nowMs - forgeSacrificeFlashMs;
  if (elapsed < 0 || elapsed > SACRIFICE_FLASH_DURATION_MS) return;

  const t = elapsed / SACRIFICE_FLASH_DURATION_MS; // 0 → 1
  const ctx = cc.ctx;

  ctx.save();

  // Primary expanding ring: starts tight, fades as it expands
  const ringRadius = FORGE_RADIUS * (1 + t * 5);
  const ringAlpha = (1 - t) * 0.9;
  ctx.strokeStyle = `rgba(255, 220, 100, ${ringAlpha})`;
  ctx.lineWidth = 2.5 * (1 - t * 0.6);
  ctx.beginPath();
  ctx.arc(forgeX, forgeY, ringRadius, 0, Math.PI * 2);
  ctx.stroke();

  // Soft secondary ring, slightly larger and more transparent
  const ring2Radius = FORGE_RADIUS * (1 + t * 3.5);
  const ring2Alpha = (1 - t) * 0.4;
  ctx.strokeStyle = `rgba(200, 180, 255, ${ring2Alpha})`;
  ctx.lineWidth = 4 * (1 - t);
  ctx.beginPath();
  ctx.arc(forgeX, forgeY, ring2Radius, 0, Math.PI * 2);
  ctx.stroke();

  // Brief center flash glow (only visible in the first 20% of the animation)
  if (t < 0.2) {
    const flashT = 1 - t / 0.2;
    const flashRadius = FORGE_RADIUS * 1.5;
    const grad = ctx.createRadialGradient(forgeX, forgeY, 0, forgeX, forgeY, flashRadius);
    grad.addColorStop(0, `rgba(255, 230, 120, ${0.45 * flashT})`);
    grad.addColorStop(1, 'rgba(255, 230, 120, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(forgeX, forgeY, flashRadius, 0, Math.PI * 2);
    ctx.fill();
  }

  // Crystal gain text — rises and fades over the second half of the flash
  if (lastRefinedCrystalsGained && lastRefinedCrystalsGained.size > 0 && t < 0.85) {
    const textAlpha = t < 0.2 ? t / 0.2 : (1 - (t - 0.2) / 0.65);
    const riseY = forgeY - 28 - t * 44;
    ctx.globalAlpha = Math.max(0, textAlpha);
    ctx.font = 'bold 11px monospace';
    ctx.textAlign = 'center';
    let lineOffset = 0;
    for (const [tierId, count] of lastRefinedCrystalsGained) {
      const color = TIER_BY_ID.get(tierId as import('../../data/tiers').TierId)?.color ?? '#fff172';
      ctx.fillStyle = color;
      ctx.fillText(`+${count} ${tierId} crystal${count !== 1 ? 's' : ''}`, forgeX, riseY - lineOffset);
      lineOffset += 14;
    }
    ctx.globalAlpha = 1;
    ctx.textAlign = 'left';
  }

  ctx.restore();
}
