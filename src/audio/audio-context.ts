/**
 * audio-context.ts — Web Audio API context singleton with Safari fallback.
 *
 * The context is created lazily on first call to getAudioContext() or
 * resumeAudioContext(), so it is only instantiated after a user gesture.
 */

type AudioContextConstructor = typeof AudioContext;

function getAudioContextConstructor(): AudioContextConstructor | null {
  if (typeof AudioContext !== 'undefined') return AudioContext;
  const w = window as unknown as { webkitAudioContext?: AudioContextConstructor };
  if (typeof w.webkitAudioContext !== 'undefined') return w.webkitAudioContext!;
  return null;
}

let _context: AudioContext | null = null;

/** Returns the shared AudioContext, creating it on first call. Returns null if unavailable. */
export function getAudioContext(): AudioContext | null {
  if (_context) return _context;
  try {
    const Ctor = getAudioContextConstructor();
    if (!Ctor) return null;
    _context = new Ctor();
    return _context;
  } catch {
    return null;
  }
}

/** Resumes a suspended context. Call on any user interaction. */
export async function resumeAudioContext(): Promise<void> {
  const ctx = getAudioContext();
  if (!ctx) return;
  if (ctx.state === 'suspended') {
    try {
      await ctx.resume();
    } catch {
      // Best effort — silently ignore
    }
  }
}
