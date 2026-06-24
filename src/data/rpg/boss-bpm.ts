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

export function getBossBpm(bossId: number): number {
  return BOSS_BPM.get(bossId) ?? 60;
}
