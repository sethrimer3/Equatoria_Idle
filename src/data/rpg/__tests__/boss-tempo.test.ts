import { describe, expect, it } from 'vitest';
import { getBossBpm, getBossBeatMs, beatsToMs, msToBeats, BOSS_BPM_BY_ID, computeNextBeatSpawnMs } from '../boss-bpm';
import { BOSS_MIDI_PATTERNS, getBossMidiPattern, mapBossMidiNote } from '../boss-midi-config';
import { BOSS_ATTACK_PROFILES, resolveAttackConfig } from '../../../render/rpg/rpg-boss-attack-config';
import { createBossMidiRuntimeState, beginBossMidiRuntime, resetBossMidiRuntime } from '../../../render/rpg/rpg-boss-midi-runtime';
import { computeBossOnsetMs } from '../boss-midi-scheduler';

// ── BPM mapping ───────────────────────────────────────────────────────────────

describe('getBossBpm', () => {
  it('bossId 0 → 50 BPM', () => expect(getBossBpm(0)).toBe(50));
  it('bossId 1 → 60 BPM', () => expect(getBossBpm(1)).toBe(60));
  it('bossId 2 → 70 BPM', () => expect(getBossBpm(2)).toBe(70));

  it('+10 BPM formula holds for bossId 0–10', () => {
    for (let id = 1; id <= 10; id++) {
      expect(getBossBpm(id)).toBe(getBossBpm(id - 1) + 10);
    }
  });

  it('BOSS_BPM_BY_ID covers bossId 0–10', () => {
    for (let id = 0; id <= 10; id++) {
      expect(BOSS_BPM_BY_ID[id]).toBe(getBossBpm(id));
    }
  });
});

// ── getBossBeatMs and beatsToMs ───────────────────────────────────────────────

describe('getBossBeatMs', () => {
  it('bossId 0 (50 BPM) → 1200 ms/beat', () => expect(getBossBeatMs(0)).toBe(1200));
  it('bossId 1 (60 BPM) → 1000 ms/beat', () => expect(getBossBeatMs(1)).toBe(1000));
  it('bossId 7 (120 BPM) → 500 ms/beat', () => expect(getBossBeatMs(7)).toBe(500));
  it('bossId 10 (150 BPM) → 400 ms/beat', () => expect(getBossBeatMs(10)).toBe(400));
});

describe('beatsToMs', () => {
  it('8 beats at 60 BPM = 8000 ms', () => expect(beatsToMs(1, 8)).toBe(8000));
  it('4 beats at 120 BPM = 2000 ms', () => expect(beatsToMs(7, 4)).toBe(2000));
  it('2.5 beats at 50 BPM = 3000 ms', () => expect(beatsToMs(0, 2.5)).toBe(3000));
});

describe('msToBeats', () => {
  it('8000 ms at 60 BPM = 8 beats', () => expect(msToBeats(1, 8000)).toBe(8));
  it('2000 ms at 120 BPM = 4 beats', () => expect(msToBeats(7, 2000)).toBe(4));
});

// ── Authored config has no *Ms timing fields ──────────────────────────────────

describe('BOSS_ATTACK_PROFILES beat authoring', () => {
  it('no profile entry has raw *Ms timing fields on the top level', () => {
    for (const profile of BOSS_ATTACK_PROFILES) {
      for (const phase of [profile.phase0Attacks, profile.phase1Attacks, profile.phase2Attacks]) {
        for (const cfg of phase) {
          expect('cooldownMs' in cfg).toBe(false);
          expect('durationMs' in cfg).toBe(false);
        }
      }
    }
  });

  it('no attack params contain raw ms timing field names', () => {
    const forbidden = ['warnMs', 'waveInterval', 'spawnInterval', 'trailHazardMs', 'trailFadeMs'];
    for (const profile of BOSS_ATTACK_PROFILES) {
      for (const phase of [profile.phase0Attacks, profile.phase1Attacks, profile.phase2Attacks]) {
        for (const cfg of phase) {
          for (const key of forbidden) {
            expect(key in cfg.params).toBe(false);
          }
        }
      }
    }
  });

  it('all phase attacks have cooldownBeats and durationBeats as numbers', () => {
    for (const profile of BOSS_ATTACK_PROFILES) {
      for (const phase of [profile.phase0Attacks, profile.phase1Attacks, profile.phase2Attacks]) {
        for (const cfg of phase) {
          expect(typeof cfg.cooldownBeats).toBe('number');
          expect(typeof cfg.durationBeats).toBe('number');
        }
      }
    }
  });
});

// ── resolveAttackConfig ───────────────────────────────────────────────────────

describe('resolveAttackConfig', () => {
  it('cooldownBeats × beatMs = cooldownMs for bossId 1 (60 BPM)', () => {
    const resolved = resolveAttackConfig(1, {
      kind: 'vermiculate',
      cooldownBeats: 8,
      pressureScore: 1,
      durationBeats: 12,
      params: {},
    });
    expect(resolved.cooldownMs).toBe(8000);
    expect(resolved.durationMs).toBe(12000);
  });

  it('resolves waveIntervalBeats → waveInterval in ms (mandala)', () => {
    const resolved = resolveAttackConfig(1, {
      kind: 'mandala',
      cooldownBeats: 6,
      pressureScore: 1,
      durationBeats: 10,
      params: { radialCount: 6, safeGaps: 2, waveIntervalBeats: 2.5, speed: 80 },
    });
    expect(resolved.params['waveInterval']).toBe(2500); // 2.5 beats × 1000ms
    expect('waveIntervalBeats' in resolved.params).toBe(false);
  });

  it('resolves trailHazardBeats and trailFadeBeats for quartzSignature', () => {
    const resolved = resolveAttackConfig(1, {
      kind: 'quartzSignature',
      cooldownBeats: 0,
      pressureScore: 2,
      durationBeats: 5.5,
      params: { stepDistance: 112, maxIteration: 3, trailHazardBeats: 2, trailFadeBeats: 0.5 },
    });
    expect(resolved.params['trailHazardMs']).toBe(2000); // 2 beats × 1000ms
    expect(resolved.params['trailFadeMs']).toBe(500);    // 0.5 beats × 1000ms
    expect('trailHazardBeats' in resolved.params).toBe(false);
    expect('trailFadeBeats' in resolved.params).toBe(false);
  });

  it('resolves warnBeats → warnMs in params', () => {
    const resolved = resolveAttackConfig(0, {
      kind: 'hexTrail',
      cooldownBeats: 12,
      pressureScore: 1,
      durationBeats: 8,
      params: { boltCount: 1, warnBeats: 1, cellSize: 30, hazardMode: 'headOnly' },
    });
    expect(resolved.params['warnMs']).toBe(1200); // 1 beat × 1200ms (50 BPM)
    expect('warnBeats' in resolved.params).toBe(false);
  });

  it('non-timing params pass through unchanged', () => {
    const resolved = resolveAttackConfig(1, {
      kind: 'grav',
      cooldownBeats: 4,
      pressureScore: 2,
      durationBeats: 10,
      params: { bodyCount: 3, wellCount: 1, strength: 0.002, hazardMode: 'visualOnly' },
    });
    expect(resolved.params['bodyCount']).toBe(3);
    expect(resolved.params['strength']).toBe(0.002);
    expect(resolved.params['hazardMode']).toBe('visualOnly');
  });
});

// ── MIDI durationBeats drives attack duration ─────────────────────────────────

describe('mapBossMidiNote uses event.durationBeats', () => {
  const mapping = {
    lowNote: 'mandala' as const,
    midNote: 'hexTrail' as const,
    highNote: 'vermiculate' as const,
  };

  it('maps a note with durationBeats=5 → kindConfig.durationBeats=5', () => {
    const event = { timeMs: 0, durationMs: 5000, beat: 0, durationBeats: 5, note: 36, velocity: 80, channel: 0 };
    const mapped = mapBossMidiNote(event, mapping, 1);
    expect(mapped.kindConfig.durationBeats).toBe(5);
  });

  it('clamps durationBeats below 0.25', () => {
    const event = { timeMs: 0, durationMs: 10, beat: 0, durationBeats: 0.01, note: 36, velocity: 80, channel: 0 };
    const mapped = mapBossMidiNote(event, mapping, 1);
    expect(mapped.kindConfig.durationBeats).toBe(0.25);
  });

  it('clamps durationBeats above 20', () => {
    const event = { timeMs: 0, durationMs: 99999, beat: 0, durationBeats: 100, note: 36, velocity: 80, channel: 0 };
    const mapped = mapBossMidiNote(event, mapping, 1);
    expect(mapped.kindConfig.durationBeats).toBe(20);
  });

  it('mandala params contain waveIntervalBeats not waveInterval', () => {
    const event = { timeMs: 0, durationMs: 2000, beat: 0, durationBeats: 2, note: 36, velocity: 80, channel: 0 };
    const mapped = mapBossMidiNote(event, mapping, 1);
    expect('waveIntervalBeats' in mapped.kindConfig.params).toBe(true);
    expect('waveInterval' in mapped.kindConfig.params).toBe(false);
  });
});

// ── Quartz signature uses getBossBeatMs, not a hardcoded constant ─────────────

describe('Quartz signature timing is data-driven', () => {
  it('BOSS_MIDI_PATTERNS[bossId=1] has signatureAttack.intervalBeats', () => {
    const pattern = getBossMidiPattern(1);
    expect(pattern?.signatureAttack).toBeDefined();
    expect(typeof pattern?.signatureAttack?.intervalBeats).toBe('number');
  });

  it('beginBossMidiRuntime initialises nextSignatureMs using getBossBeatMs(1) × intervalBeats', () => {
    const state = createBossMidiRuntimeState();
    beginBossMidiRuntime(state, 1);
    const pattern = getBossMidiPattern(1)!;
    const expectedMs = getBossBeatMs(1) * pattern.signatureAttack!.intervalBeats;
    expect(state.nextSignatureMs).toBe(expectedMs);
  });

  it('nextSignatureMs for bossId 1 equals 5 × 1000ms = 5000ms', () => {
    const state = createBossMidiRuntimeState();
    beginBossMidiRuntime(state, 1);
    expect(state.nextSignatureMs).toBe(5000);
  });

  it('resetBossMidiRuntime disables signature (nextSignatureMs = Infinity)', () => {
    const state = createBossMidiRuntimeState();
    beginBossMidiRuntime(state, 1);
    expect(state.nextSignatureMs).toBe(5000);
    resetBossMidiRuntime(state);
    expect(state.nextSignatureMs).toBe(Infinity);
  });

  it('quartzSignature config params use trailHazardBeats not trailHazardMs', () => {
    const pattern = getBossMidiPattern(1)!;
    const cfg = pattern.signatureAttack!.config;
    expect('trailHazardBeats' in cfg.params).toBe(true);
    expect('trailHazardMs' in cfg.params).toBe(false);
    expect('trailFadeBeats' in cfg.params).toBe(true);
    expect('trailFadeMs' in cfg.params).toBe(false);
  });
});

// ── BOSS_MIDI_PATTERNS uses beat fields ───────────────────────────────────────

describe('BOSS_MIDI_PATTERNS signature config is beat-authored', () => {
  it('all pattern signatureAttack configs have cooldownBeats not cooldownMs', () => {
    for (const p of BOSS_MIDI_PATTERNS) {
      if (!p.signatureAttack) continue;
      expect('cooldownBeats' in p.signatureAttack.config).toBe(true);
      expect('cooldownMs' in p.signatureAttack.config).toBe(false);
      expect('durationBeats' in p.signatureAttack.config).toBe(true);
      expect('durationMs' in p.signatureAttack.config).toBe(false);
    }
  });
});

// ── computeNextBeatSpawnMs — beat-grid alignment ──────────────────────────────

describe('computeNextBeatSpawnMs', () => {
  it('bossId 0 (50 BPM) → 1200 ms/beat', () => expect(getBossBeatMs(0)).toBe(1200));
  it('bossId 1 (60 BPM) → 1000 ms/beat', () => expect(getBossBeatMs(1)).toBe(1000));
  it('bossId 7 (120 BPM) → 500 ms/beat',  () => expect(getBossBeatMs(7)).toBe(500));

  it('full-beat grid (gridBeats=1) at 50 BPM: snaps to beat 1 = 1200ms for small elapsed', () => {
    // 1ms into fight → next beat boundary is beat 1 = 1200ms
    expect(computeNextBeatSpawnMs(1, 0, 1.0)).toBe(1200);
  });

  it('full-beat grid (gridBeats=1) at 60 BPM: snaps to beat 1 = 1000ms for small elapsed', () => {
    expect(computeNextBeatSpawnMs(1, 1, 1.0)).toBe(1000);
  });

  it('full-beat grid: snaps to current beat when exactly on a beat boundary', () => {
    // elapsed = 2000ms = exactly beat 2 at 60 BPM → spawn at beat 2
    expect(computeNextBeatSpawnMs(2000, 1, 1.0)).toBe(2000);
  });

  it('full-beat grid: snaps to next beat when between beats', () => {
    // elapsed = 1300ms (between beat 1 and 2 at 60 BPM) → next beat = 2000ms
    expect(computeNextBeatSpawnMs(1300, 1, 1.0)).toBe(2000);
  });

  it('half-beat grid (gridBeats=0.5) at 60 BPM: valid spawns at 500ms multiples', () => {
    expect(computeNextBeatSpawnMs(1,   1, 0.5)).toBe(500);   // 1ms → next half-beat = 500ms
    expect(computeNextBeatSpawnMs(499, 1, 0.5)).toBe(500);   // just before boundary
    expect(computeNextBeatSpawnMs(500, 1, 0.5)).toBe(500);   // exactly on boundary → spawn now
    expect(computeNextBeatSpawnMs(501, 1, 0.5)).toBe(1000);  // just past boundary → next
  });

  it('quarter-beat grid (gridBeats=0.25) at 60 BPM: valid spawns at 250ms multiples', () => {
    expect(computeNextBeatSpawnMs(1,   1, 0.25)).toBe(250);
    expect(computeNextBeatSpawnMs(249, 1, 0.25)).toBe(250);
    expect(computeNextBeatSpawnMs(250, 1, 0.25)).toBe(250);  // exactly on boundary
    expect(computeNextBeatSpawnMs(251, 1, 0.25)).toBe(500);  // just past → next
  });

  it('full-beat grid at 50 BPM: beat 3 = 3600ms', () => {
    expect(computeNextBeatSpawnMs(3600, 0, 1.0)).toBe(3600);
  });

  it('full-beat grid at 50 BPM: 3601ms → next beat = 4800ms', () => {
    expect(computeNextBeatSpawnMs(3601, 0, 1.0)).toBe(4800);
  });
});

// ── computeBossOnsetMs — MIDI onset uses boss BPM ────────────────────────────

describe('computeBossOnsetMs', () => {
  it('MIDI event at beat=4, bossId=1 (60 BPM) → onset 4000ms regardless of embedded timeMs', () => {
    const event = { timeMs: 2000, durationMs: 500, beat: 4, durationBeats: 1, note: 60, velocity: 80, channel: 0 };
    expect(computeBossOnsetMs(event, 1)).toBe(4000);
  });

  it('bossId=0 (50 BPM): beat 2 → 2400ms', () => {
    const event = { timeMs: 0, durationMs: 0, beat: 2, durationBeats: 1, note: 60, velocity: 80, channel: 0 };
    expect(computeBossOnsetMs(event, 0)).toBe(2400);
  });

  it('bossId=7 (120 BPM): beat 8 → 4000ms', () => {
    const event = { timeMs: 99999, durationMs: 0, beat: 8, durationBeats: 1, note: 60, velocity: 80, channel: 0 };
    expect(computeBossOnsetMs(event, 7)).toBe(4000); // 8 × 500ms
  });

  it('beat=0 → 0ms for any boss', () => {
    const event = { timeMs: 9999, durationMs: 0, beat: 0, durationBeats: 0, note: 60, velocity: 80, channel: 0 };
    expect(computeBossOnsetMs(event, 1)).toBe(0);
    expect(computeBossOnsetMs(event, 0)).toBe(0);
  });
});

// ── resolveAttackConfig: explicit rejection of legacy *Ms fields ──────────────

describe('resolveAttackConfig rejects legacy ms fields', () => {
  it('throws with field name if cooldownMs is present on the input config', () => {
    expect(() => resolveAttackConfig(1, {
      kind: 'mandala',
      cooldownBeats: 0,
      // @ts-expect-error intentionally passing legacy field to verify runtime rejection
      cooldownMs: 8000,
      pressureScore: 1,
      durationBeats: 12,
      params: {},
    })).toThrow(/cooldownMs/);
  });

  it('throws with field name if durationMs is present on the input config', () => {
    expect(() => resolveAttackConfig(1, {
      kind: 'mandala',
      cooldownBeats: 0,
      pressureScore: 1,
      durationBeats: 0,
      // @ts-expect-error intentionally passing legacy field to verify runtime rejection
      durationMs: 12000,
      params: {},
    })).toThrow(/durationMs/);
  });

  it('resolves all *Beats fields correctly for bossId 0 (50 BPM)', () => {
    const resolved = resolveAttackConfig(0, {
      kind: 'hexTrail',
      cooldownBeats: 10,
      pressureScore: 1,
      durationBeats: 8,
      params: { boltCount: 1, warnBeats: 1, cellSize: 30 },
    });
    expect(resolved.cooldownMs).toBe(12000); // 10 × 1200ms
    expect(resolved.durationMs).toBe(9600);  // 8 × 1200ms
    expect(resolved.params['warnMs']).toBe(1200);
  });

  it('resolves all *Beats fields correctly for bossId 1 (60 BPM)', () => {
    const resolved = resolveAttackConfig(1, {
      kind: 'mandala',
      cooldownBeats: 6,
      pressureScore: 1,
      durationBeats: 10,
      params: { radialCount: 6, safeGaps: 2, waveIntervalBeats: 2.5, speed: 80 },
    });
    expect(resolved.cooldownMs).toBe(6000);  // 6 × 1000ms
    expect(resolved.durationMs).toBe(10000); // 10 × 1000ms
    expect(resolved.params['waveInterval']).toBe(2500); // 2.5 × 1000ms
  });
});
