/**
 * Sprite tinting utility.
 * Colorizes white/grayscale sprites with a target color using multiply blending,
 * then restores original alpha. Results are cached by (src, color) key.
 */

import { getCachedImage } from './asset-loader';

/** Cache of tinted canvases keyed by `${src}|${color}`. */
const tintedCache = new Map<string, HTMLCanvasElement>();

/**
 * Creates an offscreen canvas containing the sprite tinted with the given color.
 * Uses multiply blend to preserve grayscale shading, then restores original alpha.
 */
export function createTintedCanvas(sprite: HTMLImageElement, color: string): HTMLCanvasElement {
  const w = sprite.naturalWidth || sprite.width || 64;
  const h = sprite.naturalHeight || sprite.height || 64;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;

  // Draw original sprite (white/grayscale with transparency)
  ctx.drawImage(sprite, 0, 0);

  // Multiply blend: white × color = color, gray × color = darker shade
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, w, h);

  // Restore original alpha channel so transparent areas remain transparent
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(sprite, 0, 0);

  return canvas;
}

/**
 * Returns a cached tinted canvas for the given sprite src and color.
 * Returns null if the source sprite is not yet loaded.
 */
export function getTintedSpriteCanvas(src: string, color: string): HTMLCanvasElement | null {
  const key = `${src}|${color}`;
  const cached = tintedCache.get(key);
  if (cached) return cached;

  const sprite = getCachedImage(src);
  if (!sprite) return null;

  const canvas = createTintedCanvas(sprite, color);
  tintedCache.set(key, canvas);
  return canvas;
}

/**
 * Invalidates the tint cache entry for a given (src, color) pair.
 * Call if the underlying sprite may have been replaced.
 */
export function invalidateTintedSprite(src: string, color: string): void {
  tintedCache.delete(`${src}|${color}`);
}
