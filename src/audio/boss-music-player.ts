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

  constructor(volume: () => number) {
    this._volume = volume;
  }

  start(beatLoop: string, bgLayers: readonly string[]): void {
    this._startLoops(beatLoop, bgLayers, 0.25);
  }

  startWithCassette(cassetteStartPath: string, beatLoopPath: string, bgLayers: readonly string[]): void {
    // Play cassette start as one-shot, then crossfade boss loops in over 2s
    this._playOneShot(cassetteStartPath);
    this._startLoops(beatLoopPath, bgLayers, 2.0);
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
    const ctx = getAudioContext();
    if (!ctx) return;
    for (const loop of this._loops) {
      loop.gain.gain.setTargetAtTime(volume * loop.volumeMultiplier, ctx.currentTime, 0.05);
    }
  }

  playPhrase(path: string): void {
    this._playOneShot(path);
  }

  private _startLoops(beatLoopPath: string, bgLayers: readonly string[], fadeSecs: number): void {
    const paths = [beatLoopPath, ...bgLayers];
    const key = paths.join('|');
    if (this._activeKey === key && this._loops.length > 0) return;
    this._fadeOutLoops(0.2);
    const ctx = getAudioContext();
    if (!ctx) return;
    this._activeKey = key;
    void Promise.all(paths.map((path) => loadAudioBuffer(ctx, path))).then((buffers) => {
      if (this._activeKey !== key) return;
      // Scheduling all sources against one timestamp keeps the BeatLoop and
      // selected full track phase-locked even when their files decode at different speeds.
      const startAt = ctx.currentTime + 0.05;
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
      if (!buffer) return;
      try {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this._volume(), ctx.currentTime);
        gain.connect(ctx.destination);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.start();
        source.onended = () => {
          try { gain.disconnect(); } catch { /* ignore */ }
        };
      } catch {
        // Audio is optional; ignore failures.
      }
    });
  }

  private _playOneShotWithCallback(path: string, onDone: () => void): void {
    const ctx = getAudioContext();
    if (!ctx) { setTimeout(onDone, 0); return; }
    void loadAudioBuffer(ctx, path).then((buffer) => {
      if (!buffer) { onDone(); return; }
      try {
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(this._volume(), ctx.currentTime);
        gain.connect(ctx.destination);
        const source = ctx.createBufferSource();
        source.buffer = buffer;
        source.connect(gain);
        source.start();
        source.onended = () => {
          try { gain.disconnect(); } catch { /* ignore */ }
          onDone();
        };
      } catch {
        onDone();
      }
    });
  }
}
