import { describe, expect, it } from 'vitest';
import {
  BOSS_TEMPO_BY_ID,
  getBossBeatMs,
  getBossTempoBpm,
  getBossTempoIntervalMs,
  getBossTempoSyncedLegacyIntervalMs,
} from '../boss-tempo-config';

describe('boss tempo config', () => {
  it('uses Quartz 60 BPM quarter and eighth note durations', () => {
    expect(getBossBeatMs(1)).toBe(1000);
    expect(getBossTempoIntervalMs(1, 1)).toBe(1000);
    expect(getBossTempoIntervalMs(1, 0.5)).toBe(500);
  });

  it('snaps legacy attack intervals to half-beat subdivisions', () => {
    expect(getBossTempoSyncedLegacyIntervalMs(1, 1800)).toBe(2000);
    expect(getBossTempoSyncedLegacyIntervalMs(1, 1300)).toBe(1500);
  });

  it('defines the complete reordered roster through The Solution at 180 BPM', () => {
    expect(Object.keys(BOSS_TEMPO_BY_ID).map(Number)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
    expect([9, 10, 11, 12, 13].map(getBossTempoBpm)).toEqual([140, 150, 160, 170, 180]);
  });
});
