import { FORGE_RING_SPRITE_PATHS } from '../assets/asset-paths';
import { getCachedImage, loadImage } from '../assets/asset-loader';
import { FORGE_RING_ACTIVE_SPIN_MULTIPLIER } from '../../sim/forge/forge-state';

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

/**
 * Draw forge rings.
 *
 * @param activeRingCount     How many of the available rings are currently lit (0–forgeLevelRingCount).
 *   Lit rings spin at FORGE_RING_ACTIVE_SPIN_MULTIPLIER times their base speed and render at full
 *   alpha. Unlit available rings continue their subtle idle animation at reduced opacity.
 * @param intensity           Fire-intensity scalar (0–1) used for unlit ring alpha.
 * @param forgeLevelRingCount How many rings exist at the current forge level (1–5). Rings beyond
 *   this count (the outermost ones) are completely hidden. Defaults to 5 (all rings visible).
 *   Rings are unlocked inward: level 1 = innermost ring only; level 5 = all rings.
 */
export function drawForgeRings(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  forgeSize: number,
  nowMs: number,
  intensity: number,
  activeRingCount = 0,
  forgeLevelRingCount = 5,
): void {
  const clampedIntensity = Math.max(0, Math.min(1, intensity));
  const timeSec = nowMs / 1000;
  // Rings are indexed 0 (outermost) to 4 (innermost).
  // At forge level N, only the innermost N rings are visible.
  const firstVisibleRingIndex = FORGE_RING_CONFIGS.length - forgeLevelRingCount;

  ctx.save();
  ctx.translate(x, y);
  ctx.globalCompositeOperation = 'lighter';

  for (let ringIndex = 0; ringIndex < FORGE_RING_CONFIGS.length; ringIndex++) {
    if (ringIndex < firstVisibleRingIndex) continue;

    const config = FORGE_RING_CONFIGS[ringIndex];
    const sprite = getCachedImage(config.spritePath);
    if (!sprite || !sprite.complete || sprite.naturalWidth <= 0) continue;

    // A ring is lit if it falls within the first activeRingCount visible rings
    // counting outward from the outermost visible ring.
    const isLit = (ringIndex - firstVisibleRingIndex) < activeRingCount;

    const pulse = config.pulseAmount === 0
      ? 0
      : Math.sin(timeSec * config.pulseSpeedRadPerSec + config.phaseRad) * config.pulseAmount;
    const radius = forgeSize * config.radiusScale * (1 + pulse);
    const scale = (radius * 2) / sprite.naturalWidth;
    const drawWidth = sprite.naturalWidth * scale;
    const drawHeight = sprite.naturalHeight * scale;

    // Lit rings spin at the active multiplier; unlit rings use the fire-intensity boost
    const speedBoost = isLit
      ? FORGE_RING_ACTIVE_SPIN_MULTIPLIER
      : 1 + clampedIntensity * 0.22;
    const rotation = config.phaseRad + config.rotationSpeedRadPerSec * speedBoost * timeSec;

    // Lit rings are at full opacity; unlit rings blend with fire intensity
    const alpha = isLit
      ? config.alpha * 1.8  // brighter when lit
      : config.alpha * (0.55 + clampedIntensity * 0.45);
    ctx.globalAlpha = Math.min(1, alpha);

    ctx.rotate(rotation);
    ctx.drawImage(sprite, -drawWidth / 2, -drawHeight / 2, drawWidth, drawHeight);
    ctx.rotate(-rotation);
  }

  ctx.restore();
}
