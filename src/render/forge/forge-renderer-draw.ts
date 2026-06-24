/**
 * forge-renderer-draw.ts — Private draw helpers for forge-renderer.ts.
 *
 * Contains the sub-draw functions called internally by `drawForge` and
 * `drawLoomFieldAuras`.  Not intended for import outside forge-renderer.ts.
 *
 * Extracted from forge-renderer.ts to keep that file focused on its public API
 * (`preloadForgeSprites`, `drawForge`, `drawLoomFieldAuras`, `drawForgeCrunch`,
 * `drawForgeSacrificeFlash`) and the high-level rendering flow.
 */

import { colorWithAlpha } from '../assets/color-utils';

/** Fire gradient colors for the forge influence swirl (outer to inner heat). */
export const FORGE_FIRE_COLORS = [
  '#FFB21A',
  '#FFA31A',
  '#FF8A14',
  '#FF7412',
  '#F25C0F',
  '#D9470C',
  '#B7370A',
];

// Pre-resolved color stop strings for FORGE_FIRE_COLORS — eliminates repeated
// colorWithAlpha key-string allocations inside the per-frame draw loop.
const _fireTransparent = FORGE_FIRE_COLORS.map(c => colorWithAlpha(c, 0));
const _fireOpaque      = FORGE_FIRE_COLORS.map(c => colorWithAlpha(c, 1));

// Pre-allocated dash-pattern arrays — reused every frame to avoid ephemeral
// array allocation inside setLineDash().
const _DASH_2_4: number[] = [2, 4];
const _DASH_2_3: number[] = [2, 3];
const _DASH_3_6: number[] = [3, 6];
const _NO_DASH:  number[] = [];

/**
 * Draw a large, soft ambient glow behind the forge.
 * Uses a slow-pulsing radial gradient in warm golden tones so the forge
 * feels like a heat source — visible through the background animation.
 */
export function drawForgeBackgroundGlow(
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
 * Draw 1 or 2 heat rings that show how many taps have been accumulated
 * before the forge crunch fires.
 */
export function drawForgeHeatRings(
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
 * Draw the forge influence circle as a bidirectional swirl using fire colors.
 * One set of arcs rotates clockwise, the other counter-clockwise.
 */
export function drawForgeInfluenceSwirl(
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

      const startAngle = t * speed + i * arcSpan;
      const endAngle = startAngle + arcSpan * 0.55;

      const grad = ctx.createLinearGradient(
        x + Math.cos(startAngle) * range,
        y + Math.sin(startAngle) * range,
        x + Math.cos(endAngle) * range,
        y + Math.sin(endAngle) * range,
      );
      grad.addColorStop(0, _fireTransparent[colorIndex]);
      grad.addColorStop(0.5, _fireOpaque[(colorIndex + 1) % colorCount]);
      grad.addColorStop(1, _fireTransparent[colorIndex]);

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
  ctx.setLineDash(_DASH_2_4);
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash(_NO_DASH);
  ctx.restore();
}

export function drawForgeSprite(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  forgeSize: number,
  rotation: number,
  sprite: HTMLImageElement,
  spriteAlt: HTMLImageElement,
  coldSprite?: HTMLImageElement,
  coldSpriteAlt?: HTMLImageElement,
  fireAlpha = 1,
): void {
  const drawSize = forgeSize * 3;
  const clampedFireAlpha = Math.max(0, Math.min(1, fireAlpha));
  const coldAlpha = coldSprite && coldSpriteAlt ? 1 - clampedFireAlpha : 0;

  ctx.save();
  ctx.translate(x, y);

  // Cold and fiery sprites share these orientations so tap fade transitions stay smooth.
  if (coldSprite && coldSpriteAlt && coldAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = coldAlpha;
    ctx.rotate(-rotation);
    ctx.drawImage(coldSprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = coldAlpha * 0.7;
    ctx.rotate(rotation);
    ctx.drawImage(coldSpriteAlt, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
  }

  if (clampedFireAlpha > 0) {
    ctx.save();
    ctx.globalAlpha = clampedFireAlpha;
    ctx.rotate(-rotation);
    ctx.drawImage(sprite, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = clampedFireAlpha * 0.7;
    ctx.rotate(rotation);
    ctx.drawImage(spriteAlt, -drawSize / 2, -drawSize / 2, drawSize, drawSize);
    ctx.restore();
  }

  // Glow
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, forgeSize);
  gradient.addColorStop(0, `rgba(255,255,255,${0.07 + clampedFireAlpha * 0.08})`);
  gradient.addColorStop(1, 'rgba(255,255,255,0)');
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, forgeSize, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();
}

export function drawForgeFallback(
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

/**
 * Draw a faint colored aura around a single loom capture field.
 * Called from `drawLoomFieldAuras` in forge-renderer.ts.
 */
export function drawLoomAura(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  captureRadius: number,
  outerRadius: number,
  color: string,
  nowMs: number,
): void {
  const t = nowMs / 1000;
  const pulse = 0.5 + 0.5 * Math.sin(t * 1.8);

  ctx.save();

  // Soft fill inside capture radius
  const grad = ctx.createRadialGradient(x, y, 0, x, y, captureRadius);
  grad.addColorStop(0, colorWithAlpha(color, 0.06 * pulse));
  grad.addColorStop(1, colorWithAlpha(color, 0));
  ctx.fillStyle = grad;
  ctx.beginPath();
  ctx.arc(x, y, captureRadius, 0, Math.PI * 2);
  ctx.fill();

  // Inner capture ring
  ctx.strokeStyle = colorWithAlpha(color, 0.25 + 0.15 * pulse);
  ctx.lineWidth = 1.2;
  ctx.setLineDash(_DASH_2_3);
  ctx.beginPath();
  ctx.arc(x, y, captureRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash(_NO_DASH);

  // Outer attraction ring (dashed, more faint)
  ctx.strokeStyle = colorWithAlpha(color, 0.1 + 0.06 * pulse);
  ctx.lineWidth = 0.8;
  ctx.setLineDash(_DASH_3_6);
  ctx.beginPath();
  ctx.arc(x, y, outerRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash(_NO_DASH);

  ctx.restore();
}
