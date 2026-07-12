/**
 * sfx-player.ts — SFX playback engine.
 *
 * All SFX route through a master gain node controlled by sfxVolume.
 * Forge charging gets its own dedicated gain node for independent fade
 * control, still routed through the master.
 *
 * Polyphony limiting is enforced at the call site (motes merging, max 2).
 */

import { getAudioContext } from './audio-context';
import { loadAudioBuffer } from './audio-loader';

const FORGE_CRUNCH_FADE_S  = 0.2;
const FORGE_CANCEL_FADE_S  = 0.5;
const FORGE_SPIN_UP_FADE_S = 4.0;
const MOTES_MAX_POLYPHONY  = 2;
const D_MAJOR_FROM_C4_PLAYBACK_RATES: readonly number[] = [
  2 ** (2 / 12),  // D4
  2 ** (4 / 12),  // E4
  2 ** (6 / 12),  // F#4
  2 ** (7 / 12),  // G4
  2 ** (9 / 12),  // A4
  2 ** (11 / 12), // B4
  2 ** (13 / 12), // C#5
  2 ** (14 / 12), // D5
];

export class SfxPlayer {
  private _masterGain: GainNode | null = null;
  private _volume: number;

  private _chargingSource: AudioBufferSourceNode | null = null;
  private _chargingGain: GainNode | null = null;

  private _motesActiveCount = 0;
  private _isEnabled = true;

  constructor(volume: number) {
    this._volume = volume;
  }

  setVolume(v: number): void {
    this._volume = v;
    const ctx = getAudioContext();
    if (!ctx || !this._masterGain) return;
    this._masterGain.gain.setTargetAtTime(v, ctx.currentTime, 0.05);
  }

  setEnabled(enabled: boolean): void {
    if (this._isEnabled === enabled) return;
    this._isEnabled = enabled;
    if (!enabled) {
      this._motesActiveCount = 0;
      this._stopCharging(0);
    }
  }

  /** Play a single SFX by path. Errors are silently swallowed. */
  async play(path: string): Promise<void> {
    if (!this._isEnabled) return;
    const master = this._getMasterGain();
    const ctx = getAudioContext();
    if (!ctx || !master) return;
    try {
      const buffer = await loadAudioBuffer(ctx, path);
      if (!buffer || !this._isEnabled) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(master);
      source.start();
    } catch {
      // Silently ignore
    }
  }

  /** Play a single SFX by path with a playback-rate pitch shift. */
  async playPitched(path: string, playbackRate: number): Promise<void> {
    if (!this._isEnabled) return;
    const master = this._getMasterGain();
    const ctx = getAudioContext();
    if (!ctx || !master) return;
    try {
      const buffer = await loadAudioBuffer(ctx, path);
      if (!buffer || !this._isEnabled) return;
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.playbackRate.setValueAtTime(playbackRate, ctx.currentTime);
      source.connect(master);
      source.start();
    } catch {
      // Silently ignore
    }
  }

  /** Play a random entry from paths. */
  playRandom(paths: readonly string[]): void {
    if (!this._isEnabled) return;
    if (paths.length === 0) return;
    void this.play(paths[Math.floor(Math.random() * paths.length)]!);
  }

  /**
   * Play a random SFX with polyphony limiting.
   * onEnd is called when playback ends (even on error) for counter bookkeeping.
   */
  playPolyphonyLimited(
    paths: readonly string[],
    onEnd: () => void,
  ): void {
    if (!this._isEnabled) {
      onEnd();
      return;
    }
    const ctx = getAudioContext();
    const master = this._getMasterGain();
    if (!ctx || !master || paths.length === 0) {
      onEnd();
      return;
    }
    const path = paths[Math.floor(Math.random() * paths.length)]!;
    loadAudioBuffer(ctx, path)
      .then(buffer => {
        if (!buffer || !this._isEnabled) { onEnd(); return; }
        try {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(master);
          source.onended = onEnd;
          source.start();
        } catch {
          onEnd();
        }
      })
      .catch(() => { onEnd(); });
  }

  /** Play a motes-merge SFX, capped at MOTES_MAX_POLYPHONY simultaneous voices. */
  playMotesMerge(paths: readonly string[], dropletPath: string): void {
    if (!this._isEnabled) return;
    if (this._motesActiveCount >= MOTES_MAX_POLYPHONY) return;
    this._motesActiveCount++;
    this.playPolyphonyLimited(paths, () => {
      this._motesActiveCount = Math.max(0, this._motesActiveCount - 1);
    });
    const rate = D_MAJOR_FROM_C4_PLAYBACK_RATES[
      Math.floor(Math.random() * D_MAJOR_FROM_C4_PLAYBACK_RATES.length)
    ]!;
    void this.playPitched(dropletPath, rate);
  }

  /** Begin the forge charging loop, fading in over FORGE_SPIN_UP_FADE_S seconds. */
  startForgeCharging(paths: readonly string[]): void {
    if (!this._isEnabled) return;
    this._stopCharging(0);  // clear any previous
    const ctx = getAudioContext();
    const master = this._getMasterGain();
    if (!ctx || !master || paths.length === 0) return;

    const path = paths[Math.floor(Math.random() * paths.length)]!;
    loadAudioBuffer(ctx, path)
      .then(buffer => {
        if (!buffer || !this._isEnabled) return;
        try {
          const now = ctx.currentTime;
          const chargingGain = ctx.createGain();
          chargingGain.gain.setValueAtTime(0, now);
          chargingGain.gain.linearRampToValueAtTime(1, now + FORGE_SPIN_UP_FADE_S);
          chargingGain.connect(master);

          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.loop = true;
          source.connect(chargingGain);
          source.start();

          this._chargingSource = source;
          this._chargingGain   = chargingGain;
        } catch {
          // Silently ignore
        }
      })
      .catch(() => { /* silently ignore */ });
  }

  /** Crunch started: quickly fade out charging, immediately play a crunch SFX. */
  onForgeCrunch(crunchPaths: readonly string[]): void {
    if (!this._isEnabled) return;
    this._stopCharging(FORGE_CRUNCH_FADE_S * 1000);
    this.playRandom(crunchPaths);
  }

  /** Crunch completed: layer the heavy impact over any other forge SFX. */
  onForgeCrunchCompleted(boomPath: string): void {
    if (!this._isEnabled) return;
    void this.play(boomPath);
  }

  /** Spin-up aborted: fade out charging over 500 ms. */
  onForgeChargingCancelled(): void {
    if (!this._isEnabled) return;
    this._stopCharging(FORGE_CANCEL_FADE_S * 1000);
  }

  // ─── Private helpers ────────────────────────────────────────────

  private _getMasterGain(): GainNode | null {
    const ctx = getAudioContext();
    if (!ctx) return null;
    if (!this._masterGain) {
      try {
        this._masterGain = ctx.createGain();
        this._masterGain.gain.setValueAtTime(this._volume, ctx.currentTime);
        this._masterGain.connect(ctx.destination);
      } catch {
        return null;
      }
    }
    return this._masterGain;
  }

  private _stopCharging(fadeDurationMs: number): void {
    const source = this._chargingSource;
    const gain   = this._chargingGain;
    this._chargingSource = null;
    this._chargingGain   = null;

    if (!source || !gain) return;

    const ctx = getAudioContext();
    const fadeSec = fadeDurationMs / 1000;

    if (!ctx || fadeSec <= 0) {
      try { source.stop(); } catch { /* ignore */ }
      try { gain.disconnect(); } catch { /* ignore */ }
      return;
    }

    try {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(gain.gain.value, now);
      gain.gain.linearRampToValueAtTime(0, now + fadeSec);
      // Use Web Audio scheduling for sample-accurate stop
      source.stop(now + fadeSec);
      source.onended = () => {
        try { gain.disconnect(); } catch { /* ignore */ }
      };
    } catch {
      try { source.stop(); }    catch { /* ignore */ }
      try { gain.disconnect(); } catch { /* ignore */ }
    }
  }

  dispose(): void {
    this._isEnabled = false;
    this._motesActiveCount = 0;
    this._stopCharging(0);
    if (this._masterGain) {
      try { this._masterGain.disconnect(); } catch { /* already disconnected */ }
      this._masterGain = null;
    }
  }
}
