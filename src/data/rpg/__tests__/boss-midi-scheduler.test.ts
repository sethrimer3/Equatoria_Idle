import { describe, expect, it } from 'vitest';
import type { BossMidiNoteEvent } from '../boss-midi-parser';
import {
  advanceBossMidiScheduler,
  createBossMidiSchedulerState,
  resetBossMidiScheduler,
  seekBossMidiScheduler,
} from '../boss-midi-scheduler';
import { mapBossMidiNote } from '../boss-midi-config';

const events: BossMidiNoteEvent[] = [
  { timeMs: 100, durationMs: 50, beat: 0.2, durationBeats: 0.1, note: 36, velocity: 60, channel: 0 },
  { timeMs: 200, durationMs: 50, beat: 0.4, durationBeats: 0.1, note: 60, velocity: 110, channel: 1 },
  { timeMs: 450, durationMs: 50, beat: 0.9, durationBeats: 0.1, note: 72, velocity: 90, channel: 2 },
];

describe('boss MIDI scheduler', () => {
  it('triggers each note once and catches notes skipped by a long frame', () => {
    const state = createBossMidiSchedulerState();
    const fired: number[] = [];
    advanceBossMidiScheduler(state, events, 250, (event) => fired.push(event.note));
    expect(fired).toEqual([36, 60]);
    advanceBossMidiScheduler(state, events, 250, (event) => fired.push(event.note));
    expect(fired).toEqual([36, 60, 72]);
    advanceBossMidiScheduler(state, events, 500, (event) => fired.push(event.note));
    expect(fired).toEqual([36, 60, 72]);
  });

  it('can reset and seek cleanly', () => {
    const state = createBossMidiSchedulerState();
    const fired: number[] = [];
    advanceBossMidiScheduler(state, events, 500, (event) => fired.push(event.note));
    resetBossMidiScheduler(state);
    advanceBossMidiScheduler(state, events, 150, (event) => fired.push(event.note));
    expect(fired).toEqual([36, 60, 72, 36]);
    seekBossMidiScheduler(state, events, 250);
    advanceBossMidiScheduler(state, events, 300, (event) => fired.push(event.note));
    expect(fired).toEqual([36, 60, 72, 36, 72]);
  });

  it('maps exact note, pitch class, channel, and velocity intensity', () => {
    const mapped = mapBossMidiNote(events[1], {
      exactNotes: { 36: 'hexTrail' },
      pitchClasses: { 0: 'mandala' },
      channels: { 1: 'missileRing' },
      velocityRanges: [{ min: 100, max: 127, intensity: 1.5 }],
    });
    expect(mapped.kindConfig.kind).toBe('missileRing');
    expect(mapped.intensity).toBe(1.5);
    expect(mapped.kindConfig.params.maxMissiles).toBe(3);
  });
});
