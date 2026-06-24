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
  [9,  140],  // Fracteryl Manifestation
  [10, 150],  // Eigenstein Entity
  [11, 160],  // Void Nexus
  [12, 170],  // The Problem
  [13, 180],  // The Solution
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

/**
 * Given elapsed fight time and a beat-grid size, returns the next beat-aligned
 * spawn time in ms from fight start.
 *
 * If elapsedFightMs is exactly on a boundary (within floating-point tolerance),
 * that boundary is returned (spawn now). Otherwise snaps to the next boundary.
 *
 * @param elapsedFightMs  Accumulated ms since the fight began.
 * @param bossId          Determines ms-per-beat.
 * @param gridBeats       Grid granularity: 1.0 = every beat, 0.5 = every half-beat, etc.
 */
export function computeNextBeatSpawnMs(
  elapsedFightMs: number,
  bossId: number,
  gridBeats: number,
): number {
  const beatMs = getBossBeatMs(bossId);
  const elapsedBeats = elapsedFightMs / beatMs;
  // Subtract a small epsilon before ceil so that values already on a beat boundary
  // (possibly drifted slightly past it by float accumulation) snap to that beat.
  const nextBeat = Math.ceil(elapsedBeats / gridBeats - 1e-9) * gridBeats;
  return nextBeat * beatMs;
}
