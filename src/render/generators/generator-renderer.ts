import type { CanvasContext } from '../canvas';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { TierId } from '../../data/tiers';
import { TIER_BY_ID } from '../../data/tiers';
import { SPAWNER_SIZE } from '../../data/particles/particle-config';

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

    drawGenerator(ctx, gen.x, gen.y, tier.color, tier.glowColor, rotation, fadeAlpha, gen.range);
  }
}

function drawGenerator(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  glowColor: string,
  rotation: number,
  alpha: number,
  influenceRange: number,
): void {
  if (alpha <= 0) return;
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.translate(x, y);

  const size = SPAWNER_SIZE;
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
  const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 1.5);
  gradient.addColorStop(0, `${glowColor}44`);
  gradient.addColorStop(1, `${glowColor}00`);
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(0, 0, size * 1.5, 0, Math.PI * 2);
  ctx.fill();

  ctx.restore();

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
