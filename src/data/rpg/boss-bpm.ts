/**
 * boss-bpm.ts — Centralised BPM map for every boss encounter.
 *
 * The tempo here is informational / audio-pacing only; combat mechanics do not
 * read from it directly.  The Sand Warden is the slowest at 50 BPM, each
 * subsequent boss increasing by 10 BPM.
 */

export const BOSS_BPM: ReadonlyMap<number, number> = new Map([
  [0,   50],  // Sand Warden
  [1,   60],  // Quartz Sovereign
  [2,   70],  // Ruby King
  [3,   80],  // Sunstone Herald
  [4,   90],  // Citrine Weaver
  [5,  100],  // Iolite Colossus
  [6,  110],  // Amethyst Breaker
  [7,  120],  // Diamond Eternal
  [8,  130],  // Nullstone Devourer
  [9,  140],  // Void Nexus
  [10, 150],  // Equation Incarnate
]);

/** Flat Record form of BOSS_BPM — for indexed access without Map overhead. */
export const BOSS_BPM_BY_ID: Record<number, number> = Object.fromEntries(BOSS_BPM);

export function getBossBpm(bossId: number): number {
  return BOSS_BPM.get(bossId) ?? 60;
}

/** Milliseconds per beat for a given boss. */
export function getBossBeatMs(bossId: number): number {
  return 60000 / getBossBpm(bossId);
}

/** Convert a beat count to milliseconds for a given boss. */
export function beatsToMs(bossId: number, beats: number): number {
  return beats * getBossBeatMs(bossId);
}

/** Convert milliseconds to beats for a given boss. */
export function msToBeats(bossId: number, ms: number): number {
  return ms / getBossBeatMs(bossId);
}
