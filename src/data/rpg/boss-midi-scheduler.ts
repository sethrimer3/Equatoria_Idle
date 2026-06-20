import type { BossMidiNoteEvent } from './boss-midi-parser';

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
