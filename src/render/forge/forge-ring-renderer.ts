import { FORGE_RING_SPRITE_PATHS } from '../assets/asset-paths';
import { getCachedImage, loadImage } from '../assets/asset-loader';

interface ForgeRingConfig {
  readonly spritePath: string;
  readonly radiusScale: number;
  readonly rotationSpeedRadPerSec: number;
  readonly alpha: number;
  readonly phaseRad: number;
  readonly pulseAmount: number;
  readonly pulseSpeedRadPerSec: number;
}

/**
 * Ring configuration lives here so speed, scale, opacity, direction, and pulsing
 * can be tuned without touching the main forge renderer. The source artwork is
 * the five blurred tower-ring sprites from Thero Idle TD, copied under
 * ASSETS/SPRITES/equationForge/forgeRings for Equatoria's Vite/GitHub Pages path.
 */
const FORGE_RING_CONFIGS: readonly ForgeRingConfig[] = [
  { spritePath: FORGE_RING_SPRITE_PATHS[0], radiusScale: 3.35, rotationSpeedRadPerSec: 0.09, alpha: 0.24, phaseRad: 0.1, pulseAmount: 0, pulseSpeedRadPerSec: 0 },
  { spritePath: FORGE_RING_SPRITE_PATHS[1], radiusScale: 2.92, rotationSpeedRadPerSec: -0.16, alpha: 0.30, phaseRad: 1.4, pulseAmount: 0, pulseSpeedRadPerSec: 0 },
  { spritePath: FORGE_RING_SPRITE_PATHS[2], radiusScale: 2.48, rotationSpeedRadPerSec: 0.13, alpha: 0.40, phaseRad: 2.6, pulseAmount: 0, pulseSpeedRadPerSec: 0 },
  { spritePath: FORGE_RING_SPRITE_PATHS[3], radiusScale: 2.08, rotationSpeedRadPerSec: -0.24, alpha: 0.35, phaseRad: 3.8, pulseAmount: 0, pulseSpeedRadPerSec: 0 },
  { spritePath: FORGE_RING_SPRITE_PATHS[4], radiusScale: 1.72, rotationSpeedRadPerSec: 0.19, alpha: 0.45, phaseRad: 5.1, pulseAmount: 0.045, pulseSpeedRadPerSec: 1.1 },
];

export function preloadForgeRingSprites(): void {
  for (const path of FORGE_RING_SPRITE_PATHS) {
    loadImage(path).catch(() => undefined);
  }
}

export function drawForgeRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  forgeSize: number,
  nowMs: number,
  intensity: number,
): void {
  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  const timeSec = nowMs / 1000;

  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';

  for (const config of FORGE_RING_CONFIGS) {
    const sprite = getCachedImage(config.spritePath);
    if (!sprite || !sprite.complete || sprite.naturalWidth <= 0) continue;

    const pulse = config.pulseAmount === 0
      ? 0
      : Math.sin(timeSec * config.pulseSpeedRadPerSec + config.phaseRad) * config.pulseAmount;
    const radius = forgeSize * config.radiusScale * (1 + pulse);
    const scale = (radius * 2) / sprite.naturalWidth;
    const drawWidth = sprite.naturalWidth * scale;
    const drawHeight = sprite.naturalHeight * scale;
    const activeBoost = 1 + clampedIntensity * 0.22;
    const rotation = config.phaseRad + config.rotationSpeedRadPerSec * activeBoost * timeSec;

    ctx.globalAlpha = config.alpha * (0.55 + clampedIntensity * 0.45);
    ctx.rotate(rotation);
    ctx.drawImage(sprite, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.rotate(-rotation);
  }

  ctx.restore();
}
