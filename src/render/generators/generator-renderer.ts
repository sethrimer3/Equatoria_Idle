import type { CanvasContext } from '../canvas';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { TierId } from '../../data/tiers';
import { TIER_BY_ID, TIERS } from '../../data/tiers';
import { SPAWNER_SIZE } from '../../data/particles/particle-config';
import { getGeneratorSpritePath } from '../assets/asset-paths';
import { getCachedImage, loadImage } from '../assets/asset-loader';
import { getTintedSpriteCanvas } from '../assets/sprite-tint';

// Module-level animation clock advanced by drawGenerators callers
let _genAnimTimeMs = 0;

/** Advance the generator renderer animation clock. Call once per frame. */
export function updateGeneratorRendererTime(deltaMs: number): void {
  _genAnimTimeMs += deltaMs;
}

/** Speed of prismatic hue cycling in degrees per second. */
const HUE_CYCLE_DEG_PER_SEC = 90;

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
): void {
  const ctx = cc.ctx;
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

  // Influence radius indicator
  if (isNullstone) {
    drawNullstoneRangeSwirl(ctx, x, y, influenceRange, alpha);
  } else {
    ctx.save();
    ctx.globalAlpha = alpha * 0.15;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(x, y, influenceRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}

/** Draw a pulsing purple swirl around the nullstone generator's influence range. */
function drawNullstoneRangeSwirl(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  range: number,
  alpha: number,
): void {
  const t = _genAnimTimeMs / 1000;
  const numArcs = 5;
  const arcSpan = (Math.PI * 2) / numArcs;

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
    grad.addColorStop(0, 'rgba(150,60,210,0)');
    grad.addColorStop(0.5, 'rgba(150,60,210,1)');
    grad.addColorStop(1, 'rgba(100,30,160,0)');

    ctx.strokeStyle = grad;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(x, y, range, startAngle, endAngle);
    ctx.stroke();
  }

  // Also draw a faint dashed circle so the boundary is still readable
  ctx.globalAlpha = alpha * 0.12;
  ctx.strokeStyle = '#9640d0';
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

  if (isNullstone) {
    drawNullstoneRangeSwirl(ctx, x, y, influenceRange, alpha);
  } else {
    ctx.save();
    ctx.globalAlpha = alpha * 0.15;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.arc(x, y, influenceRange, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
