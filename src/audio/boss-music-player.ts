import { getAudioContext } from './audio-context';
import { loadAudioBuffer } from './audio-loader';

interface LoopSource {
  source: AudioBufferSourceNode;
  gain: GainNode;
}

export class BossMusicPlayer {
  private readonly _volume: () => number;
  private _loops: LoopSource[] = [];
  private _activeKey: string | null = null;

  constructor(volume: () => number) {
    this._volume = volume;
  }

  start(beatLoop: string, bgLayers: readonly string[]): void {
    const paths = [beatLoop, ...bgLayers];
    const key = paths.join('|');
    if (this._activeKey === key && this._loops.length > 0) return;
    this.stop();
    const ctx = getAudioContext();
    if (!ctx) return;
    this._activeKey = key;
    for (const path of paths) {
      void loadAudioBuffer(ctx, path).then((buffer) => {
        if (!buffer || this._activeKey !== key) return;
        try {
          const now = ctx.currentTime;
          const gain = ctx.createGain();
          gain.gain.setValueAtTime(0, now);
          gain.gain.linearRampToValueAtTime(this._volume(), now + 0.25);
          gain.connect(ctx.destination);
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(gain);
          source.start();
          this._loops.push({ source, gain });
        } catch {
          // Audio is optional; ignore failures.
        }
      });
    }
  }

  stop(): void {
    this._activeKey = null;
    const ctx = getAudioContext();
    for (const loop of this._loops) {
      try {
        if (ctx) {
          const now = ctx.currentTime;
          loop.gain.gain.cancelScheduledValues(now);
          loop.gain.gain.setValueAtTime(loop.gain.gain.value, now);
          loop.gain.gain.linearRampToValueAtTime(0, now + 0.2);
          loop.source.stop(now + 0.22);
        } else {
          loop.source.stop();
        }
      } catch {
        // Already stopped or unavailable.
      }
    }
    this._loops = [];
  }

  setVolume(volume: number): void {
    const ctx = getAudioContext();
    if (!ctx) return;
    for (const loop of this._loops) {
      loop.gain.gain.setTargetAtTime(volume, ctx.currentTime, 0.05);
    }
  }

  playPhrase(path: string): void {
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
}
