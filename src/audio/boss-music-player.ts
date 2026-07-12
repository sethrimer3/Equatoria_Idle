import { getAudioContext } from './audio-context';
import { loadAudioBuffer } from './audio-loader';

interface LoopSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
  volumeMultiplier: number;
}

const BEAT_LOOP_VOLUME_MULTIPLIER = Math.pow(10, -14 / 20);

export class BossMusicPlayer {
  private readonly _volume: () => number;
  private _loops: LoopSource[] = [];
  private _activeKey: string | null = null;
  private readonly _oneShots = new Set<AudioBufferSourceNode>();
  private readonly _callbackTimers = new Set<ReturnType<typeof setTimeout>>();
  private _isDisposed = false;

  constructor(volume: () => number) {
    this._volume = volume;
  }

  start(beatLoop: string, bgLayers: readonly string[], onPrimaryTrackReady?: (durationMs: number) => void): void {
    if (this._isDisposed) return;
    this._startLoops(beatLoop, bgLayers, 0.25, onPrimaryTrackReady);
  }

  startWithCassette(cassetteStartPath: string, beatLoopPath: string, bgLayers: readonly string[], onPrimaryTrackReady?: (durationMs: number) => void): void {
    if (this._isDisposed) return;
    // Play cassette start as one-shot, then crossfade boss loops in over 2s
    this._playOneShot(cassetteStartPath);
    this._startLoops(beatLoopPath, bgLayers, 2.0, onPrimaryTrackReady);
  }

  stop(): void {
    this._fadeOutLoops(0.2);
  }

  stopWithCassette(cassetteEndPath: string, onDone: () => void): void {
    // Fade out all loops over 2s while cassette end plays simultaneously
    this._fadeOutLoops(2.0);
    this._playOneShotWithCallback(cassetteEndPath, onDone);
  }

  setVolume(volume: number): void {
    if (this._isDisposed) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    for (const loop of this._loops) {
      loop.gain.gain.setTargetAtTime(volume * loop.volumeMultiplier, ctx.currentTime, 0.05);
    }
  }

  playCassetteStart(path: string, onDone: () => void): void {
    if (this._isDisposed) return;
    this._playOneShotWithCallback(path, onDone);
  }

  playPhrase(path: string): void {
    if (this._isDisposed) return;
    this._playOneShot(path);
  }

  private _startLoops(beatLoopPath: string, bgLayers: readonly string[], fadeSecs: number, onPrimaryTrackReady?: (durationMs: number) => void): void {
    const paths = [beatLoopPath, ...bgLayers];
    const key = paths.join('|');
    if (this._activeKey === key && this._loops.length > 0) return;
    this._fadeOutLoops(0.2);
    const ctx = getAudioContext();
    if (!ctx) return;
    this._activeKey = key;
    void Promise.all(paths.map((path) => loadAudioBuffer(ctx, path))).then((buffers) => {
      if (this._activeKey !== key || this._isDisposed) return;
      // Scheduling all sources against one timestamp keeps the BeatLoop and
      // selected full track phase-locked even when their files decode at different speeds.
      const startAt = ctx.currentTime + 0.05;
      const primaryTrackBuffer = buffers.length > 1 ? buffers[1] : null;
      if (primaryTrackBuffer && onPrimaryTrackReady) {
        onPrimaryTrackReady(primaryTrackBuffer.duration * 1000);
      }
      for (let i = 0; i < buffers.length; i++) {
        const buffer = buffers[i];
        if (!buffer) continue;
        try {
          const volumeMultiplier = i === 0 ? BEAT_LOOP_VOLUME_MULTIPLIER : 1;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, startAt);
          gain.gain.linearRampToValueAtTime(this._volume() * volumeMultiplier, startAt + fadeSecs);
          gain.connect(ctx.destination);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(gain);
          source.start(startAt);
          this._loops.push({ source, gain, volumeMultiplier });
        } catch {
          // Audio is optional; ignore failures.
        }
      }
    });
  }

  private _fadeOutLoops(fadeSecs: number): void {
    this._activeKey = null;
    const ctx = getAudioContext();
    const loops = this._loops;
    this._loops = [];
    for (const loop of loops) {
      try {
        if (ctx) {
          const now = ctx.currentTime;
          loop.gain.gain.cancelScheduledValues(now);
          loop.gain.gain.setValueAtTime(loop.gain.gain.value, now);
          loop.gain.gain.linearRampToValueAtTime(0, now + fadeSecs);
          loop.source.stop(now + fadeSecs + 0.05);
        } else {
          loop.source.stop();
        }
      } catch {
        // Already stopped or unavailable.
      }
    }
  }

  private _playOneShot(path: string): void {
    const ctx = getAudioContext();
    if (!ctx) return;
    void loadAudioBuffer(ctx, path).then((buffer) => {
      if (!buffer || this._isDisposed) return;
      try {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this._volume(), ctx.currentTime);
        gain.connect(ctx.destination);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.start();
        this._oneShots.add(source);
        source.onended = () => {
          this._oneShots.delete(source);
          try { gain.disconnect(); } catch { /* ignore */ }
        };
      } catch {
        // Audio is optional; ignore failures.
      }
    });
  }

  private _playOneShotWithCallback(path: string, onDone: () => void): void {
    const ctx = getAudioContext();
    if (!ctx) {
      const timerId = setTimeout(() => {
        this._callbackTimers.delete(timerId);
        if (!this._isDisposed) onDone();
      }, 0);
      this._callbackTimers.add(timerId);
      return;
    }
    void loadAudioBuffer(ctx, path).then((buffer) => {
      if (this._isDisposed) return;
      if (!buffer) { onDone(); return; }
      try {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this._volume(), ctx.currentTime);
        gain.connect(ctx.destination);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.start();
        this._oneShots.add(source);
        source.onended = () => {
          this._oneShots.delete(source);
          try { gain.disconnect(); } catch { /* ignore */ }
          onDone();
        };
      } catch {
        onDone();
      }
    });
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    this._activeKey = null;
    const loops = this._loops;
    this._loops = [];
    for (const loop of loops) {
      try { loop.source.stop(); } catch { /* already stopped */ }
      try { loop.source.disconnect(); } catch { /* already disconnected */ }
      try { loop.gain.disconnect(); } catch { /* already disconnected */ }
    }
    for (const source of this._oneShots) {
      source.onended = null;
      try { source.stop(); } catch { /* already stopped */ }
      try { source.disconnect(); } catch { /* already disconnected */ }
    }
    this._oneShots.clear();
    for (const timerId of this._callbackTimers) clearTimeout(timerId);
    this._callbackTimers.clear();
  }
}
