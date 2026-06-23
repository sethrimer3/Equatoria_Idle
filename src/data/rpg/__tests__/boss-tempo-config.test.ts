import { describe, expect, it } from 'vitest';
import {
  getBossBeatMs,
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
});
