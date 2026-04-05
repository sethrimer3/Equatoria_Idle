/**
 * Utility for loading image assets.
 * Provides caching, batched preloading, and progress callbacks.
 */

const imageCache = new Map<string, HTMLImageElement>();

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
