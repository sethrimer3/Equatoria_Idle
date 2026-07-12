/**
 * Utility for loading image assets.
 * Provides caching, batched preloading, and progress callbacks.
 */

const imageCache = new Map<string, HTMLImageElement>();
const chromaKeyCache = new Map<string, HTMLCanvasElement>();

/** Load a single image, returning from cache if available. */
export function loadImage(src: string): Promise<HTMLImageElement> {
  const cached = imageCache.get(src);
  if (cached) return Promise.resolve(cached);

  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      imageCache.set(src, img);
      resolve(img);
    };
    img.onerror = () => reject(new Error(`Failed to load image: ${src}`));
    img.src = src;
  });
}

/** Get a cached image synchronously. Returns undefined if not yet loaded. */
export function getCachedImage(src: string): HTMLImageElement | undefined {
  return imageCache.get(src);
}

/**
 * Return a cached copy of an image with pixels near the supplied RGB color
 * made transparent. The source image must already be loaded.
 */
export function getChromaKeyedImage(
  src: string,
  red: number,
  green: number,
  blue: number,
  tolerance = 24,
): CanvasImageSource | undefined {
  const source = imageCache.get(src);
  if (!source) return undefined;

  const cacheKey = `${src}|${red},${green},${blue}|${tolerance}`;
  const cached = chromaKeyCache.get(cacheKey);
  if (cached) return cached;

  const canvas = document.createElement('canvas');
  canvas.width = source.naturalWidth || source.width;
  canvas.height = source.naturalHeight || source.height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context || canvas.width === 0 || canvas.height === 0) return source;

  try {
    context.drawImage(source, 0, 0);
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const pixels = imageData.data;
    const toleranceSquared = tolerance * tolerance;
    for (let i = 0; i < pixels.length; i += 4) {
      const redDelta = pixels[i]! - red;
      const greenDelta = pixels[i + 1]! - green;
      const blueDelta = pixels[i + 2]! - blue;
      if (
        redDelta * redDelta +
        greenDelta * greenDelta +
        blueDelta * blueDelta <= toleranceSquared
      ) {
        pixels[i + 3] = 0;
      }
    }
    context.putImageData(imageData, 0, 0);
  } catch {
    // Pixel readback can be rejected for tainted or restricted canvases.
    // Keep rendering with the unprocessed source rather than aborting the frame.
    return source;
  }
  chromaKeyCache.set(cacheKey, canvas);
  return canvas;
}

/** Preload multiple images with a progress callback. */
export async function preloadImages(
  paths: string[],
  onProgress?: (loaded: number, total: number) => void,
): Promise<HTMLImageElement[]> {
  const total = paths.length;
  let loaded = 0;
  const results: HTMLImageElement[] = [];

  for (const path of paths) {
    try {
      const img = await loadImage(path);
      results.push(img);
    } catch {
      // Create a 1x1 transparent fallback so we don't break rendering
      const fallback = new Image();
      fallback.width = 1;
      fallback.height = 1;
      results.push(fallback);
    }
    loaded++;
    onProgress?.(loaded, total);
  }

  return results;
}
