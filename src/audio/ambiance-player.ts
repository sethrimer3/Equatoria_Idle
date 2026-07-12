/**
 * ambiance-player.ts — Looping background ambiance with smooth fade in/out.
 *
 * The source node is created only once (on first activation) and loops
 * indefinitely. Tab switches control the gain node to fade in/out.
 * Target gain is sfxVolume * 10^(-10/20) ≈ sfxVolume * 0.316 (−10 dB offset).
 */

import { getAudioContext } from './audio-context';
import { loadAudioBuffer } from './audio-loader';
import { AMBIANCE_PATH } from './audio-paths';

/** −10 dB expressed as a linear multiplier. */
const AMBIANCE_LINEAR_MULTIPLIER = Math.pow(10, -10 / 20);
const FADE_DURATION_S = 1.0;

export class AmbiancePlayer {
  private _gainNode: GainNode | null = null;
  private _sourceNode: AudioBufferSourceNode | null = null;
  private _sfxVolume: number;
  private _isActive = false;
  private _hasStarted = false;
  private _isDisposed = false;

  constructor(sfxVolume: number) {
    this._sfxVolume = sfxVolume;
  }

  /** Update the sfxVolume reference. Adjusts gain immediately if currently active. */
  setSfxVolume(v: number): void {
    if (this._isDisposed) return;
    this._sfxVolume = v;
    if (!this._gainNode || !this._isActive) return;
    const ctx = getAudioContext();
    if (!ctx) return;
    const target = v * AMBIANCE_LINEAR_MULTIPLIER;
    this._gainNode.gain.setTargetAtTime(target, ctx.currentTime, 0.05);
  }

  /** Fade the ambiance in (active=true) or out (active=false). */
  setActive(active: boolean): void {
    if (this._isDisposed) return;
    if (this._isActive === active) return;
    this._isActive = active;

    const ctx = getAudioContext();
    if (!ctx) return;

    if (!this._hasStarted && active) {
      this._hasStarted = true;
      void this._initSource(ctx);
      return;
    }

    if (!this._gainNode) return;
    const now = ctx.currentTime;
    this._gainNode.gain.cancelScheduledValues(now);
    this._gainNode.gain.setValueAtTime(this._gainNode.gain.value, now);

    if (active) {
      const target = this._sfxVolume * AMBIANCE_LINEAR_MULTIPLIER;
      this._gainNode.gain.linearRampToValueAtTime(target, now + FADE_DURATION_S);
    } else {
      this._gainNode.gain.linearRampToValueAtTime(0, now + FADE_DURATION_S);
    }
  }

  private async _initSource(ctx: AudioContext): Promise<void> {
    try {
      const buffer = await loadAudioBuffer(ctx, AMBIANCE_PATH);
      if (!buffer || this._isDisposed) return;

      this._gainNode = ctx.createGain();
      this._gainNode.gain.setValueAtTime(0, ctx.currentTime);
      this._gainNode.connect(ctx.destination);

      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.loop = true;
      source.connect(this._gainNode);
      source.start();
      this._sourceNode = source;

      // If still active by the time the buffer loaded, fade in
      if (this._isActive) {
        const now = ctx.currentTime;
        const target = this._sfxVolume * AMBIANCE_LINEAR_MULTIPLIER;
        this._gainNode.gain.linearRampToValueAtTime(target, now + FADE_DURATION_S);
      }
    } catch {
      // Silently ignore
    }
  }

  dispose(): void {
    if (this._isDisposed) return;
    this._isDisposed = true;
    if (this._sourceNode) {
      try { this._sourceNode.stop(); } catch { /* already stopped */ }
      try { this._sourceNode.disconnect(); } catch { /* already disconnected */ }
      this._sourceNode = null;
    }
    if (this._gainNode) {
      try { this._gainNode.disconnect(); } catch { /* already disconnected */ }
      this._gainNode = null;
    }
  }
}
