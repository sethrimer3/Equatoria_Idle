import { describe, expect, it } from 'vitest';
import { getBossBeatMs } from '../boss-bpm';
import { getBossBeatVisualState } from '../../../render/rpg/rpg-boss-beat-visuals';

describe('getBossBeatMs', () => {
  it('bossId 0 (Sand Warden) → 1200ms per beat', () => {
    expect(getBossBeatMs(0)).toBe(1200);
  });

  it('bossId 1 (Quartz) → 1000ms per beat', () => {
    expect(getBossBeatMs(1)).toBe(1000);
  });
});

describe('getBossBeatVisualState', () => {
  const BOSS_IDS = [0, 1] as const;

  for (const bossId of BOSS_IDS) {
    const beatMs = getBossBeatMs(bossId);

    describe(`bossId ${bossId} (beatMs=${beatMs})`, () => {
      it('beatPhase is 0 at elapsedMs=0', () => {
        expect(getBossBeatVisualState(bossId, 0).beatPhase).toBe(0);
      });

      it('beatPhase is ~0.5 at half a beat', () => {
        const state = getBossBeatVisualState(bossId, beatMs / 2);
        expect(state.beatPhase).toBeCloseTo(0.5, 10);
      });

      it('beatPulse is 1.0 at elapsedMs=0', () => {
        expect(getBossBeatVisualState(bossId, 0).beatPulse).toBe(1);
      });

      it('beatPulse is near 0 at 90% through a beat', () => {
        const state = getBossBeatVisualState(bossId, beatMs * 0.9);
        expect(state.beatPulse).toBeLessThan(0.01);
      });

      it('beatPulse decreases monotonically as beatPhase goes 0→1', () => {
        const steps = 20;
        let prev = Infinity;
        for (let i = 0; i <= steps; i++) {
          const t = (i / steps) * beatMs * 0.999;
          const { beatPulse } = getBossBeatVisualState(bossId, t);
          expect(beatPulse).toBeLessThanOrEqual(prev + 1e-10);
          prev = beatPulse;
        }
      });

      it('barPulse > 0 on downbeat (beatIndex % 4 === 0)', () => {
        // elapsedMs=0 → beatIndex=0, which is a downbeat
        const state = getBossBeatVisualState(bossId, 0);
        expect(state.isDownbeat).toBe(true);
        expect(state.barPulse).toBeGreaterThan(0);
      });

      it('barPulse is 0 when beatIndex % 4 !== 0', () => {
        // beatIndex=1 → not a downbeat
        const state = getBossBeatVisualState(bossId, beatMs * 1.01);
        expect(state.beatIndex).toBe(1);
        expect(state.isDownbeat).toBe(false);
        expect(state.barPulse).toBe(0);
      });
    });
  }

  it('unknown bossId falls back safely without throwing', () => {
    expect(() => getBossBeatVisualState(999, 500)).not.toThrow();
    const state = getBossBeatVisualState(999, 0);
    expect(state.beatPulse).toBe(1);
  });
});
