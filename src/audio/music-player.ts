/**
 * music-player.ts — Crossfading 3-track music playlist.
 *
 * Play order is shuffled once at startup, then loops indefinitely.
 * Two alternating gain-node "slots" handle the 8-second crossfade between tracks.
 * Master gain controls overall music volume.
 */

import { getAudioContext } from './audio-context';
import { loadAudioBuffer } from './audio-loader';
import { MUSIC_PATHS } from './audio-paths';

const CROSSFADE_DURATION_S = 8;

/** −6 dB expressed as a linear multiplier (~0.501). Applied to the master gain. */
const MUSIC_DB_OFFSET_LINEAR = Math.pow(10, -6 / 20);

interface TrackSlot {
  source: AudioBufferSourceNode | null;
  gain: GainNode;
}

export class MusicPlayer {
  private _masterGain: GainNode | null = null;
  private _slots: [TrackSlot, TrackSlot] | null = null;
  private _trackOrder: number[] = [0, 1, 2];
  private _trackIndex = 0;
  private _volume: number;
  private _isStarted = false;
  private _nextTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(volume: number) {
    this._volume = volume;
    // Fisher-Yates shuffle once at startup for random play order
    for (let i = this._trackOrder.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this._trackOrder[i], this._trackOrder[j]] = [this._trackOrder[j]!, this._trackOrder[i]!];
    }
  }

  /** Begin playback. Should be called after first user interaction. */
  start(): void {
    if (this._isStarted) return;
    this._isStarted = true;
    this._setup();
  }

  setVolume(v: number): void {
    this._volume = v;
    const ctx = getAudioContext();
    if (!ctx || !this._masterGain) return;
    this._masterGain.gain.setTargetAtTime(v * MUSIC_DB_OFFSET_LINEAR, ctx.currentTime, 0.05);
  }

  private _setup(): void {
    const ctx = getAudioContext();
    if (!ctx) return;
    try {
      this._masterGain = ctx.createGain();
      this._masterGain.gain.setValueAtTime(this._volume * MUSIC_DB_OFFSET_LINEAR, ctx.currentTime);
      this._masterGain.connect(ctx.destination);

      const slotA: TrackSlot = { source: null, gain: ctx.createGain() };
      const slotB: TrackSlot = { source: null, gain: ctx.createGain() };
      slotA.gain.gain.setValueAtTime(0, ctx.currentTime);
      slotB.gain.gain.setValueAtTime(0, ctx.currentTime);
      slotA.gain.connect(this._masterGain);
      slotB.gain.connect(this._masterGain);
      this._slots = [slotA, slotB];

      void this._playNextTrack(0);
    } catch {
      // Silently ignore setup failures
    }
  }

  private async _playNextTrack(slotIndex: 0 | 1): Promise<void> {
    const ctx = getAudioContext();
    if (!ctx || !this._slots) return;

    try {
      const trackIdx = this._trackOrder[this._trackIndex % this._trackOrder.length]!;
      const path = MUSIC_PATHS[trackIdx];
      if (!path) return;

      const buffer = await loadAudioBuffer(ctx, path);
      if (!buffer || !this._slots) return;

      const slot = this._slots[slotIndex];
      const prevSlotIndex: 0 | 1 = slotIndex === 0 ? 1 : 0;
      const prevSlot = this._slots[prevSlotIndex];
      const now = ctx.currentTime;

      // Fade in the new slot
      slot.gain.gain.cancelScheduledValues(now);
      slot.gain.gain.setValueAtTime(0, now);
      slot.gain.gain.linearRampToValueAtTime(1, now + CROSSFADE_DURATION_S);

      // Fade out and stop the previous slot
      if (prevSlot.source) {
        const dyingSource = prevSlot.source;
        prevSlot.source = null;
        prevSlot.gain.gain.cancelScheduledValues(now);
        prevSlot.gain.gain.setValueAtTime(prevSlot.gain.gain.value, now);
        prevSlot.gain.gain.linearRampToValueAtTime(0, now + CROSSFADE_DURATION_S);
        // Schedule stop via Web Audio API for sample-accurate timing
        dyingSource.stop(now + CROSSFADE_DURATION_S + 0.1);
      }

      // Start the new source
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(slot.gain);
      source.start(now);
      slot.source = source;
      this._trackIndex++;

      // Schedule the next crossfade
      const timeUntilNextMs = Math.max(0, (buffer.duration - CROSSFADE_DURATION_S) * 1000);
      if (this._nextTimer !== null) clearTimeout(this._nextTimer);
      this._nextTimer = setTimeout(() => {
        this._nextTimer = null;
        void this._playNextTrack(prevSlotIndex);
      }, timeUntilNextMs);
    } catch {
      // Silently ignore playback failures
    }
  }
}
