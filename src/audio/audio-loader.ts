/**
 * audio-loader.ts — Fetch, decode, and cache AudioBuffers by URL path.
 *
 * Failed loads are cached as null so we never retry a broken path on
 * every frame. All errors are silently swallowed — audio failures must
 * never crash the game.
 */

const _cache = new Map<string, AudioBuffer | null>();
const _inflight = new Map<string, Promise<AudioBuffer | null>>();

/** Load and cache an AudioBuffer. Returns null on any failure. */
export async function loadAudioBuffer(
  ctx: AudioContext,
  path: string,
): Promise<AudioBuffer | null> {
  if (_cache.has(path)) return _cache.get(path) ?? null;
  const existing = _inflight.get(path);
  if (existing) return existing;

  const promise = (async (): Promise<AudioBuffer | null> => {
    try {
      const response = await fetch(path);
      if (!response.ok) {
        _cache.set(path, null);
        return null;
      }
      const arrayBuffer = await response.arrayBuffer();
      const audioBuffer = await ctx.decodeAudioData(arrayBuffer);
      _cache.set(path, audioBuffer);
      return audioBuffer;
    } catch {
      _cache.set(path, null);
      return null;
    } finally {
      _inflight.delete(path);
    }
  })();

  _inflight.set(path, promise);
  return promise;
}

/** Fire-and-forget preload for a list of paths. Errors are silently ignored. */
export function preloadAudioBuffers(ctx: AudioContext, paths: readonly string[]): void {
  for (const path of paths) {
    if (!_cache.has(path) && !_inflight.has(path)) {
      loadAudioBuffer(ctx, path).catch(() => { /* silently ignore */ });
    }
  }
}
