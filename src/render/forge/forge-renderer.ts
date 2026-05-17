import type { CanvasContext } from '../canvas';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import { getForgeRotationMultiplier } from '../../sim/forge/forge-state';
import {
  FORGE_RADIUS,
  MAX_FORGE_ATTRACTION_DISTANCE,
  FORGE_VALID_WAIT_TIME_MS,
  FORGE_SPIN_UP_DURATION_MS,
  FORGE_SPIN_DOWN_DURATION_MS,
} from '../../data/particles/particle-config';
import {
  FORGE_SPRITE_ALT_LEGACY_PATH,
  FORGE_SPRITE_ALT_PATH,
  FORGE_SPRITE_LEGACY_PATH,
  FORGE_SPRITE_PATH,
} from '../assets/asset-paths';
import { getCachedImage, loadImage } from '../assets/asset-loader';
import { TIER_BY_ID } from '../../data/tiers';
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

/** Preload forge sprites. Call once at startup. */
export function preloadForgeSprites(): void {
  loadImage(FORGE_SPRITE_PATH).catch(() => loadImage(FORGE_SPRITE_LEGACY_PATH).catch(() => undefined));
  loadImage(FORGE_SPRITE_ALT_PATH).catch(() => loadImage(FORGE_SPRITE_ALT_LEGACY_PATH).catch(() => undefined));
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
  const effectiveRotation = forgeRotation * spinMult;

  // ── Large soft glow — drawn first so it sits just above the background ──
  drawForgeBackgroundGlow(ctx, forgeX, forgeY, forgeSize, nowMs);

  // ── Heat rings — drawn before the sprite, one ring per tap ──────────────
  if (heatTapCount > 0 && !crunchState.isActive) {
    drawForgeHeatRings(ctx, forgeX, forgeY, forgeSize, heatTapCount, nowMs);
  }

  const sprite = getCachedImage(FORGE_SPRITE_PATH) ?? getCachedImage(FORGE_SPRITE_LEGACY_PATH);
  const spriteAlt = getCachedImage(FORGE_SPRITE_ALT_PATH) ?? getCachedImage(FORGE_SPRITE_ALT_LEGACY_PATH);

  if (sprite && spriteAlt) {
    drawForgeSprite(ctx, forgeX, forgeY, forgeSize, effectiveRotation, sprite, spriteAlt);
  } else {
    drawForgeFallback(ctx, forgeX, forgeY, forgeSize, effectiveRotation);
  }

  // Attraction radius — bidirectional fire swirl, 25 % smaller than physics range
  drawForgeInfluenceSwirl(ctx, forgeX, forgeY, MAX_FORGE_ATTRACTION_DISTANCE * FORGE_INFLUENCE_VISUAL_SCALE, nowMs);
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

  ctx.restore();
}
