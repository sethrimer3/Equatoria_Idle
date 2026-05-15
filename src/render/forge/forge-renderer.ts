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
import { colorWithAlpha } from '../assets/color-utils';

/** Visual influence circle is drawn at 75 % of the physics range. */
const FORGE_INFLUENCE_VISUAL_SCALE = 0.75;

/** Fire gradient colors for the forge influence swirl (outer to inner heat). */
const FORGE_FIRE_COLORS = [
  '#FFB21A',
  '#FFA31A',
  '#FF8A14',
  '#FF7412',
  '#F25C0F',
  '#D9470C',
  '#B7370A',
];

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
 * Draw 1 or 2 heat rings that show how many taps have been accumulated
 * before the forge crunch fires.
 */
function drawForgeHeatRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  forgeSize: number,
  heatTapCount: number,
  nowMs: number,
): void {
  const t = nowMs / 1000;
  const ringColors = ['rgba(200, 100, 0,', 'rgba(255, 160, 0,'];
  const maxRings = Math.min(heatTapCount, 2);

  for (let i = 0; i < maxRings; i++) {
    const pulse = 0.6 + 0.4 * Math.sin(t * 2.5 + i * 1.2);
    const r = forgeSize * (1.6 + i * 0.5) * pulse;
    const color = ringColors[i];
    ctx.save();
    ctx.strokeStyle = `${color} ${0.5 + i * 0.2})`;
    ctx.lineWidth = 1.5 + i * 0.5;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

/**
 * Draw a large, soft ambient glow behind the forge.
 * Uses a slow-pulsing radial gradient in warm golden tones so the forge
 * feels like a heat source — visible through the background animation.
 */
function drawForgeBackgroundGlow(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  forgeSize: number,
  nowMs: number,
): void {
  const t     = nowMs / 1000;
  const pulse = 0.75 + 0.25 * Math.sin(t * 0.9);
  const r     = forgeSize * 5.5 * pulse;

  ctx.save();
  const grad = ctx.createRadialGradient(x, y, 0, x, y, r);
  grad.addColorStop(0,   `rgba(255, 200, 80, ${0.28 * pulse})`);
  grad.addColorStop(0.3, `rgba(255, 140, 40, ${0.18 * pulse})`);
  grad.addColorStop(0.6, `rgba(200,  80, 20, ${0.08 * pulse})`);
  grad.addColorStop(1,   'rgba(120, 40,  10, 0)');
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

/**
 * Draw the forge influence circle as a bidirectional swirl using fire colors.
 * One set of arcs rotates clockwise, the other counter-clockwise.
 */
function drawForgeInfluenceSwirl(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  range: number,
  nowMs: number,
): void {
  const t = nowMs / 1000;
  const numArcs = 5;
  const arcSpan = (Math.PI * 2) / numArcs;
  const colorCount = FORGE_FIRE_COLORS.length;

  ctx.save();
  ctx.globalAlpha = 0.22;

  for (let dir = 0; dir < 2; dir++) {
    const sign = dir === 0 ? 1 : -1;
    const speed = sign * 0.65;

    for (let i = 0; i < numArcs; i++) {
      const colorIndex = (i * 2) % colorCount;
      const color = FORGE_FIRE_COLORS[colorIndex];
      const colorNext = FORGE_FIRE_COLORS[(colorIndex + 1) % colorCount];

      const startAngle = t * speed + i * arcSpan;
      const endAngle = startAngle + arcSpan * 0.55;

      const grad = ctx.createLinearGradient(
        x + Math.cos(startAngle) * range,
        y + Math.sin(startAngle) * range,
        x + Math.cos(endAngle) * range,
        y + Math.sin(endAngle) * range,
      );
      grad.addColorStop(0, colorWithAlpha(color, 0));
      grad.addColorStop(0.5, colorWithAlpha(colorNext, 1));
      grad.addColorStop(1, colorWithAlpha(color, 0));

      ctx.strokeStyle = grad;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x, y, range, startAngle, endAngle);
      ctx.stroke();
    }
  }

  // Faint boundary circle
  ctx.globalAlpha = 0.1;
  ctx.strokeStyle = FORGE_FIRE_COLORS[0];
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawForgeSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  forgeSize: number,
  rotation: number,
  sprite: HTMLImageElement,
  spriteAlt: HTMLImageElement,
): void {
  const drawSize = forgeSize * 3;

  ctx.save();
  ctx.translate(x, y);

  // Draw primary forge sprite rotating one direction
  ctx.save();
  ctx.rotate(-rotation);
  ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
  ctx.restore();

  // Draw alt forge sprite rotating the other direction
  ctx.save();
  ctx.rotate(rotation);
  ctx.globalAlpha = 0.7;
  ctx.drawImage(spriteAlt, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
  ctx.restore();

  // Glow
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, forgeSize);
  gradient.addColorStop(0, 'rgba(255,255,255,0.15)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, forgeSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

function drawForgeFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  forgeSize: number,
  rotation: number,
): void {
  const halfPi6 = Math.PI / 6;

  ctx.save();
  ctx.translate(x, y);

  ctx.rotate(-rotation);
  ctx.strokeStyle = 'rgba(200,200,255,0.5)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, forgeSize);
  ctx.lineTo(forgeSize * Math.cos(halfPi6), -forgeSize * Math.sin(halfPi6));
  ctx.lineTo(-forgeSize * Math.cos(halfPi6), -forgeSize * Math.sin(halfPi6));
  ctx.closePath();
  ctx.stroke();

  ctx.rotate(rotation * 2);
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 1.5;
  ctx.beginPath();
  ctx.moveTo(0, -forgeSize);
  ctx.lineTo(forgeSize * Math.cos(halfPi6), forgeSize * Math.sin(halfPi6));
  ctx.lineTo(-forgeSize * Math.cos(halfPi6), forgeSize * Math.sin(halfPi6));
  ctx.closePath();
  ctx.stroke();

  ctx.rotate(-rotation);
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, forgeSize);
  gradient.addColorStop(0, 'rgba(255,255,255,0.25)');
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, forgeSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
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
