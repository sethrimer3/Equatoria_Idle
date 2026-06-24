import type { BossMidiNoteEvent } from './boss-midi-parser';
import { getBossBeatMs } from './boss-bpm';

export interface BossMidiSchedulerState {
  elapsedMs: number;
  nextIndex: number;
}

export function createBossMidiSchedulerState(): BossMidiSchedulerState {
  return { elapsedMs: 0, nextIndex: 0 };
}

export function resetBossMidiScheduler(state: BossMidiSchedulerState): void {
  state.elapsedMs = 0;
  state.nextIndex = 0;
}

export function seekBossMidiScheduler(state: BossMidiSchedulerState, events: readonly BossMidiNoteEvent[], elapsedMs: number): void {
  state.elapsedMs = Math.max(0, elapsedMs);
  let idx = 0;
  while (idx < events.length && events[idx].timeMs <= state.elapsedMs) idx++;
  state.nextIndex = idx;
}

/**
 * Override embedded-MIDI-tempo timing with boss BPM.
 * Uses event.beat (ticks / ppq, tempo-independent) × boss ms-per-beat.
 * This ensures notes fire on the boss's own beat grid regardless of
 * what tempo was written into the MIDI file.
 */
export function computeBossOnsetMs(event: BossMidiNoteEvent, bossId: number): number {
  return event.beat * getBossBeatMs(bossId);
}

export function advanceBossMidiScheduler(
  state: BossMidiSchedulerState,
  events: readonly BossMidiNoteEvent[],
  deltaMs: number,
  onNote: (event: BossMidiNoteEvent) => void,
): void {
  if (deltaMs <= 0 || events.length === 0) return;
  const previousMs = state.elapsedMs;
  const nextMs = previousMs + deltaMs;
  while (state.nextIndex < events.length) {
    const event = events[state.nextIndex];
    if (event.timeMs > nextMs) break;
    if (event.timeMs > previousMs || previousMs === 0) onNote(event);
    state.nextIndex++;
  }
  state.elapsedMs = nextMs;
}
