import type { CanvasContext } from '../canvas';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { TierId } from '../../data/tiers';
import { TIER_BY_ID, TIERS } from '../../data/tiers';
import { SPAWNER_SIZE } from '../../data/particles/particle-config';
import { getGeneratorSpritePath } from '../assets/asset-paths';
import { getCachedImage, loadImage } from '../assets/asset-loader';
import { getTintedSpriteCanvas } from '../assets/sprite-tint';
import { colorWithAlpha } from '../assets/color-utils';
import { formatNumber } from '../../util';

// Module-level animation clock advanced by drawGenerators callers
let _genAnimTimeMs = 0;

/** Advance the generator renderer animation clock. Call once per frame. */
export function updateGeneratorRendererTime(deltaMs: number): void {
  _genAnimTimeMs += deltaMs;
}

/** Speed of prismatic hue cycling in degrees per second. */
const HUE_CYCLE_DEG_PER_SEC = 90;

/** Visual influence circle is drawn at 75 % of the physics range. */
const INFLUENCE_VISUAL_SCALE = 0.75;

/** Preload generator sprites for all tiers. Call once at startup. */
export function preloadGeneratorSprites(): void {
  for (let i = 0; i < TIERS.length; i++) {
    loadImage(getGeneratorSpritePath(i));
  }
}

export function drawGenerators(
  cc: CanvasContext,
  generators: readonly GeneratorInfo[],
  spawnerRotations: ReadonlyMap<TierId, number>,
  fadeIns: ReadonlyMap<TierId, number>,
  ratesPerSec: ReadonlyMap<TierId, number>,
): void {
  const ctx = cc.ctx;
  const canvasCenterX = cc.widthPx / 2;
  const canvasCenterY = cc.heightPx / 2;
  for (const gen of generators) {
    const rotation = spawnerRotations.get(gen.tierId) ?? 0;
    const fadeAlpha = fadeIns.get(gen.tierId) ?? 1;
    const tier = TIER_BY_ID.get(gen.tierId);
    if (!tier) continue;

    const isDiamond = gen.tierId === 'diamond';
    const isNullstone = gen.tierId === 'nullstone';

    const spritePath = getGeneratorSpritePath(tier.unlockOrder);

    // Use tinted (color-corrected) sprite; fall back to raw sprite while tint is being cached
    const tinted = getTintedSpriteCanvas(spritePath, tier.color);
    if (tinted) {
      drawGeneratorTinted(ctx, gen.x, gen.y, tinted, rotation, fadeAlpha, gen.range, tier.color, isDiamond, isNullstone);
    } else {
      const sprite = getCachedImage(spritePath);
      if (sprite) {
        drawGeneratorTinted(ctx, gen.x, gen.y, sprite, rotation, fadeAlpha, gen.range, tier.color, isDiamond, isNullstone);
      } else {
        // Fallback: draw procedural generator while sprite loads
        drawGeneratorFallback(ctx, gen.x, gen.y, tier.color, tier.glowColor, rotation, fadeAlpha, gen.range, isDiamond, isNullstone);
      }
    }

    // Draw motes-per-second equation label outward from canvas center
    const rate = ratesPerSec.get(gen.tierId) ?? 0;
    if (rate > 0) {
      const dx = gen.x - canvasCenterX;
      const dy = gen.y - canvasCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 1;
      const labelOffset = SPAWNER_SIZE * 5 / 2 + 7;
      const labelX = gen.x + nx * labelOffset;
      const labelY = gen.y + ny * labelOffset;
      ctx.globalAlpha = fadeAlpha;
      drawGeneratorEquationLabel(ctx, labelX, labelY, rate, tier.color);
      ctx.globalAlpha = 1;
    }
  }
}

function drawGeneratorTinted(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  sprite: HTMLImageElement | HTMLCanvasElement,
  rotation: number,
  alpha: number,
  influenceRange: number,
  color: string,
  isDiamond: boolean,
  isNullstone: boolean,
): void {
  if (alpha <= 0) return;
  const size = SPAWNER_SIZE * 5;

  // Nullstone: dark purple glow behind sprite
  if (isNullstone) {
    ctx.save();
    ctx.globalAlpha = alpha * 0.6;
    ctx.shadowBlur = size * 1.2;
    ctx.shadowColor = '#6a0dad';
    const glowGrad = ctx.createRadialGradient(x, y, 0, x, y, size * 0.9);
    glowGrad.addColorStop(0, 'rgba(106,13,173,0.35)');
    glowGrad.addColorStop(1, 'rgba(106,13,173,0)');
    ctx.fillStyle = glowGrad;
    ctx.beginPath();
    ctx.arc(x, y, size * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.restore();
  }

  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);
  ctx.rotate(rotation);

  // Diamond: cycling prismatic shadow glow around sprite
  if (isDiamond) {
    const t = _genAnimTimeMs / 1000;
    const hue = (t * HUE_CYCLE_DEG_PER_SEC) % 360;
    ctx.shadowBlur = size * 0.8;
    ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
  }

  ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
  ctx.shadowBlur = 0;
  ctx.restore();

  // Diamond: prismatic overlay shimmer on top of sprite
  if (isDiamond) {
    const t = _genAnimTimeMs / 1000;
    const hue1 = (t * HUE_CYCLE_DEG_PER_SEC) % 360;
    const hue2 = (hue1 + 120) % 360;
    ctx.save();
    ctx.globalAlpha = alpha * 0.25;
    ctx.globalCompositeOperation = 'screen';
    ctx.translate(x, y);
    ctx.rotate(rotation);
    const prismGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.6);
    prismGrad.addColorStop(0, `hsl(${hue1}, 100%, 80%)`);
    prismGrad.addColorStop(0.5, `hsl(${hue2}, 100%, 70%)`);
    prismGrad.addColorStop(1, `hsla(${(hue1 + 240) % 360}, 100%, 60%, 0)`);
    ctx.fillStyle = prismGrad;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.6, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  // Influence radius indicator — swirl in tier color, 25 % smaller than physics range
  drawRangeSwirl(ctx, x, y, influenceRange * INFLUENCE_VISUAL_SCALE, alpha, color);
}

/**
 * Draw a pulsing color swirl around a generator's influence range.
 * Used for all tiers; the nullstone used this exclusively before, now all do.
 */
function drawRangeSwirl(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  range: number,
  alpha: number,
  color: string,
): void {
  const t = _genAnimTimeMs / 1000;
  const numArcs = 5;
  const arcSpan = (Math.PI * 2) / numArcs;

  // Parse color into rgba components for gradient stops
  // We pass the hex/rgb color as-is and embed alpha via globalAlpha.
  ctx.save();
  ctx.globalAlpha = alpha * 0.18;

  for (let i = 0; i < numArcs; i++) {
    const startAngle = t * 0.8 + i * arcSpan;
    const endAngle = startAngle + arcSpan * 0.55;

    const grad = ctx.createLinearGradient(
      x + Math.cos(startAngle) * range,
      y + Math.sin(startAngle) * range,
      x + Math.cos(endAngle) * range,
      y + Math.sin(endAngle) * range,
    );
    grad.addColorStop(0, colorWithAlpha(color, 0));
    grad.addColorStop(0.5, colorWithAlpha(color, 1));
    grad.addColorStop(1, colorWithAlpha(color, 0));

    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, range, startAngle, endAngle);
    ctx.stroke();
  }

  // Faint dashed boundary circle
  ctx.globalAlpha = alpha * 0.12;
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.setLineDash([2, 4]);
  ctx.beginPath();
  ctx.arc(x, y, range, 0, Math.PI * 2);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawGeneratorFallback(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  glowColor: string,
  rotation: number,
  alpha: number,
  influenceRange: number,
  isDiamond: boolean,
  isNullstone: boolean,
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  const size = SPAWNER_SIZE * 2;
  const halfPi6 = Math.PI / 6;

  ctx.rotate(-rotation);
  ctx.strokeStyle = `${color}99`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(0, size);
  ctx.lineTo(size * Math.cos(halfPi6), -size * Math.sin(halfPi6));
  ctx.lineTo(-size * Math.cos(halfPi6), -size * Math.sin(halfPi6));
  ctx.closePath();
  ctx.stroke();

  ctx.rotate(rotation * 2);
  ctx.strokeStyle = `${color}cc`;
  ctx.beginPath();
  ctx.moveTo(0, -size);
  ctx.lineTo(size * Math.cos(halfPi6), size * Math.sin(halfPi6));
  ctx.lineTo(-size * Math.cos(halfPi6), size * Math.sin(halfPi6));
  ctx.closePath();
  ctx.stroke();

  ctx.rotate(-rotation);

  if (isDiamond) {
    const t = _genAnimTimeMs / 1000;
    const hue = (t * HUE_CYCLE_DEG_PER_SEC) % 360;
    ctx.shadowBlur = size * 3;
    ctx.shadowColor = `hsl(${hue}, 100%, 70%)`;
  } else if (isNullstone) {
    ctx.shadowBlur = size * 3;
    ctx.shadowColor = '#6a0dad';
  }

  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.5);
  gradient.addColorStop(0, `${glowColor}44`);
  gradient.addColorStop(1, `${glowColor}00`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
  ctx.fill();
  ctx.shadowBlur = 0;

  ctx.restore();

  // Influence radius indicator — swirl in tier color, 25 % smaller than physics range
  drawRangeSwirl(ctx, x, y, influenceRange * INFLUENCE_VISUAL_SCALE, alpha, color);
}

/**
 * Format a motes/sec rate for the generator equation label.
 * Shows decimals for sub-1 rates, integers for small values, and abbreviated for large.
 */
function formatGeneratorRate(rate: number): string {
  if (rate < 1) return rate.toFixed(2);
  if (rate < 1000) return String(Math.floor(rate));
  return formatNumber(rate);
}

/**
 * Draw a motes-per-second equation label near a generator, using the same
 * outlined text style as the main equation forge.
 * Segments: rate in tier color, "/s" in neutral grey.
 */
function drawGeneratorEquationLabel(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  rate: number,
  tierColor: string,
): void {
  const fontSize = 5;
  ctx.font = `600 ${fontSize}px 'Cormorant Garamond', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const rateStr = formatGeneratorRate(rate);
  const charWidth = ctx.measureText('0').width;

  const segments: Array<{ text: string; color: string }> = [
    { text: rateStr, color: tierColor },
    { text: '/s', color: '#888' },
  ];

  let totalWidth = 0;
  for (const seg of segments) totalWidth += seg.text.length * charWidth;
  let drawX = x - totalWidth / 2;

  for (const seg of segments) {
    ctx.fillStyle = seg.color;
    drawEquationOutlinedText(ctx, seg.text, drawX + (seg.text.length * charWidth) / 2, y);
    drawX += seg.text.length * charWidth;
  }
}

/**
 * Draw outlined text in the same style as the main equation: white outer stroke,
 * black inner stroke, then fill.
 */
function drawEquationOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): void {
  ctx.lineJoin = 'round';
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#fff';
  ctx.strokeText(text, x, y);
  ctx.lineWidth = 1.5;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}
