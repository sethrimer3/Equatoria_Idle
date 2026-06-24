/**
 * Boss-level tempo definitions.
 *
 * Attack intervals are expressed as musical beat subdivisions from this single
 * source.  Set a boss's BPM here; a value of 0.5 means an eighth note, 1 is a
 * quarter note/on-beat hit, and 2 is every other beat.
 */

export interface BossTempoConfig {
  bpm: number;
}

const DEFAULT_BOSS_TEMPO: BossTempoConfig = { bpm: 60 };

/**
 * Each boss is intentionally explicit so its track can be retimed without
 * changing attack code. Add a new entry when a new boss receives music.
 */
export const BOSS_TEMPO_BY_ID: Readonly<Record<number, BossTempoConfig>> = {
  1: { bpm: 60 }, // Quartz Sovereign
  2: { bpm: 70 }, 3: { bpm: 80 }, 4: { bpm: 90 }, 5: { bpm: 100 },
  6: { bpm: 110 }, 7: { bpm: 120 }, 8: { bpm: 130 },
  9: { bpm: 140 }, 10: { bpm: 150 }, 11: { bpm: 160 },
  12: { bpm: 170 }, 13: { bpm: 180 },
};

export function getBossTempoBpm(bossId: number): number {
  return BOSS_TEMPO_BY_ID[bossId]?.bpm ?? DEFAULT_BOSS_TEMPO.bpm;
}

export function getBossBeatMs(bossId: number): number {
  return 60_000 / getBossTempoBpm(bossId);
}

/** Converts a musical beat subdivision to simulation milliseconds. */
export function getBossTempoIntervalMs(bossId: number, beats: number): number {
  return Math.max(0.125, beats) * getBossBeatMs(bossId);
}

/**
 * Converts the old 60-BPM millisecond tuning into a stable half-beat grid.
 * This keeps existing encounters paced as before while making BPM the only
 * value that controls their frequency.
 */
export function getBossTempoSyncedLegacyIntervalMs(bossId: number, legacyMs: number): number {
  const beats = Math.max(0.5, Math.round((legacyMs / 1000) * 2) / 2);
  return getBossTempoIntervalMs(bossId, beats);
}
