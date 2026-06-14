import { describe, expect, it } from 'vitest';
import { makeGalaxyState, nextGalaxyStreamDamage, resetGalaxyWaveHitChain } from '../true-galaxy-enemy';

describe('True Galaxy enemy', () => {
  it('builds a dense deterministic particle cloud', () => {
    const galaxy = makeGalaxyState(12);
    expect(galaxy.particles.length).toBe(180);
  });

  it('doubles stream damage after each wave hit and resets', () => {
    resetGalaxyWaveHitChain();
    expect([nextGalaxyStreamDamage(), nextGalaxyStreamDamage(), nextGalaxyStreamDamage()]).toEqual([2, 4, 8]);
    resetGalaxyWaveHitChain();
    expect(nextGalaxyStreamDamage()).toBe(2);
  });
});
