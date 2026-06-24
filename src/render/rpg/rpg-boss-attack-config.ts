/**
 * rpg-boss-attack-config.ts — Data-driven attack profiles for all 10 bosses.
 *
 * All timing fields are authored in BEATS relative to each boss's BPM.
 * Call resolveAttackConfig() once before spawning to convert to runtime ms.
 *
 * Each boss has up to three phase configs (phase0/1/2 matching BossEnemy.phaseIndex).
 * The special attacks run ALONGSIDE the existing BossProjectile system.
 */

import { getBossBeatMs } from '../../data/rpg/boss-bpm';

export type BossAttackKind =
  | 'grav'
  | 'hexTrail'
  | 'mandala'
  | 'vermiculate'
  | 'missileRing'
  | 'motherSwarm'
  | 'quartzSignature';

/** Beat-authored attack config — all timing fields are in beats relative to boss BPM. */
export interface BossAttackKindConfig {
  kind: BossAttackKind;
  /** Minimum beats between this attack kind re-firing (per boss). */
  cooldownBeats: number;
  /** Added to BossAttackState.activePressure while this attack instance is alive. */
  pressureScore: number;
  /** Lifetime of the attack instance in beats. */
  durationBeats: number;
  /**
   * Beat-grid granularity for spawn alignment (default 1.0 = every beat).
   * 0.5 = every half-beat, 0.25 = every quarter-beat.
   * When cooldown expires, the scheduler waits for the next multiple of this
   * value (in beats from fight start) before spawning.
   */
  gridBeats?: number;
  /** Kind-specific numeric/boolean/string overrides.  Timing params use *Beats names. */
  params: Record<string, number | boolean | string>;
}

/** Runtime attack config — millisecond values produced by resolveAttackConfig(). */
export interface RuntimeAttackConfig {
  kind: BossAttackKind;
  cooldownMs: number;
  pressureScore: number;
  durationMs: number;
  params: Record<string, number | boolean | string>;
}

/**
 * Convert a beat-authored BossAttackKindConfig to a RuntimeAttackConfig by
 * multiplying all *Beats timing fields by the boss's ms-per-beat value.
 * This is the single central resolver — call it once at spawn time.
 */
export function resolveAttackConfig(bossId: number, beatConfig: BossAttackKindConfig): RuntimeAttackConfig {
  // Reject legacy ms fields — all timing must be authored in beats.
  const legacy = beatConfig as unknown as Record<string, unknown>;
  if ('cooldownMs' in legacy) throw new Error(`resolveAttackConfig: found legacy field 'cooldownMs' on kind='${beatConfig.kind}' — author in cooldownBeats instead`);
  if ('durationMs' in legacy) throw new Error(`resolveAttackConfig: found legacy field 'durationMs' on kind='${beatConfig.kind}' — author in durationBeats instead`);

  const beatMs = getBossBeatMs(bossId);
  const params: Record<string, number | boolean | string> = { ...beatConfig.params };

  if ('warnBeats' in params) {
    params['warnMs'] = (params['warnBeats'] as number) * beatMs;
    delete params['warnBeats'];
  }
  if ('waveIntervalBeats' in params) {
    params['waveInterval'] = (params['waveIntervalBeats'] as number) * beatMs;
    delete params['waveIntervalBeats'];
  }
  if ('spawnIntervalBeats' in params) {
    params['spawnInterval'] = (params['spawnIntervalBeats'] as number) * beatMs;
    delete params['spawnIntervalBeats'];
  }
  if ('trailHazardBeats' in params) {
    params['trailHazardMs'] = (params['trailHazardBeats'] as number) * beatMs;
    delete params['trailHazardBeats'];
  }
  if ('trailFadeBeats' in params) {
    params['trailFadeMs'] = (params['trailFadeBeats'] as number) * beatMs;
    delete params['trailFadeBeats'];
  }

  return {
    kind: beatConfig.kind,
    cooldownMs: beatConfig.cooldownBeats * beatMs,
    pressureScore: beatConfig.pressureScore,
    durationMs: beatConfig.durationBeats * beatMs,
    params,
  };
}

export interface BossAttackProfileConfig {
  bossId: number;
  bossName: string;
  /** Don't spawn a new attack if activePressure >= maxPressure. */
  maxPressure: number;
  phase0Attacks: BossAttackKindConfig[];
  phase1Attacks: BossAttackKindConfig[];
  phase2Attacks: BossAttackKindConfig[];
}

export const BOSS_ATTACK_PROFILES: BossAttackProfileConfig[] = [
  // Boss 0 — Sand Warden (50 BPM, beatMs=1200ms)
  {
    bossId: 0, bossName: 'Sand Warden', maxPressure: 1,
    phase0Attacks: [
      // Warning pulse: purely visual
      {
        kind: 'grav', cooldownBeats: 10, pressureScore: 0, durationBeats: 2.5,
        params: { bodyCount: 2, wellCount: 1, strength: 0, hazardMode: 'visualOnly' },
      },
      // Sand Line: 1-beat telegraph at 50 BPM = 1200 ms — generous for a tutorial boss
      {
        kind: 'hexTrail', cooldownBeats: 12, pressureScore: 1, durationBeats: 8,
        params: { boltCount: 1, warnBeats: 1, cellSize: 30, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 8, pressureScore: 1, durationBeats: 8,
        params: { boltCount: 1, warnBeats: 1, cellSize: 28, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownBeats: 12, pressureScore: 1, durationBeats: 6,
        params: { radialCount: 5, safeGaps: 3, waveIntervalBeats: 2.5, speed: 50 },
      },
    ],
    phase2Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 6, pressureScore: 1, durationBeats: 8,
        params: { boltCount: 1, warnBeats: 1, cellSize: 26, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownBeats: 8, pressureScore: 1, durationBeats: 6,
        params: { radialCount: 6, safeGaps: 2, waveIntervalBeats: 2, speed: 55 },
      },
    ],
  },

  // Boss 1 — Quartz Sovereign (60 BPM, beatMs=1000ms)
  {
    bossId: 1, bossName: 'Quartz Sovereign', maxPressure: 2,
    phase0Attacks: [
      {
        kind: 'vermiculate', cooldownBeats: 8, pressureScore: 1, durationBeats: 12,
        params: { wormCount: 1, speed: 55, maxTurnRate: 1.2, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'vermiculate', cooldownBeats: 6, pressureScore: 1, durationBeats: 12,
        params: { wormCount: 1, speed: 65, maxTurnRate: 1.4, hazardMode: 'headOnly' },
      },
      {
        kind: 'hexTrail', cooldownBeats: 10, pressureScore: 1, durationBeats: 10,
        params: { boltCount: 1, warnBeats: 1, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'vermiculate', cooldownBeats: 4, pressureScore: 2, durationBeats: 12,
        params: { wormCount: 2, speed: 75, maxTurnRate: 1.6, hazardMode: 'headOnly' },
      },
    ],
  },

  // Boss 2 — Ruby King (70 BPM, beatMs≈857ms)
  {
    bossId: 2, bossName: 'Ruby King', maxPressure: 2,
    phase0Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 8, pressureScore: 1, durationBeats: 14,
        params: { boltCount: 1, warnBeats: 1.5, cellSize: 28, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 6, pressureScore: 2, durationBeats: 14,
        params: { boltCount: 2, warnBeats: 1, cellSize: 26, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 4, pressureScore: 2, durationBeats: 16,
        params: { boltCount: 2, warnBeats: 1, cellSize: 24, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'vermiculate', cooldownBeats: 8, pressureScore: 1, durationBeats: 12,
        params: { wormCount: 1, speed: 70, hazardMode: 'headOnly' },
      },
    ],
  },

  // Boss 3 — Sunstone Herald (80 BPM, beatMs=750ms)
  {
    bossId: 3, bossName: 'Sunstone Herald', maxPressure: 3,
    phase0Attacks: [
      {
        kind: 'missileRing', cooldownBeats: 8, pressureScore: 1, durationBeats: 20,
        params: { maxMissiles: 2, spawnIntervalBeats: 4, explosionRadius: 35, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'missileRing', cooldownBeats: 6, pressureScore: 2, durationBeats: 20,
        params: { maxMissiles: 3, spawnIntervalBeats: 4, explosionRadius: 40, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'missileRing', cooldownBeats: 4, pressureScore: 2, durationBeats: 20,
        params: { maxMissiles: 4, spawnIntervalBeats: 4, explosionRadius: 45, hazardMode: 'ringEdgeHazard' },
      },
      {
        kind: 'grav', cooldownBeats: 12, pressureScore: 1, durationBeats: 12,
        params: { bodyCount: 2, wellCount: 1, strength: 0.0018, hazardMode: 'visualOnly' },
      },
    ],
  },

  // Boss 4 — Citrine Weaver (90 BPM, beatMs≈667ms)
  {
    bossId: 4, bossName: 'Citrine Weaver', maxPressure: 3,
    phase0Attacks: [
      {
        kind: 'grav', cooldownBeats: 8, pressureScore: 2, durationBeats: 20,
        params: { bodyCount: 3, wellCount: 1, strength: 0.002, moving: false, hazardMode: 'visualOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'grav', cooldownBeats: 8, pressureScore: 2, durationBeats: 20,
        params: { bodyCount: 4, wellCount: 2, strength: 0.0025, moving: true, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'grav', cooldownBeats: 6, pressureScore: 3, durationBeats: 24,
        params: { bodyCount: 5, wellCount: 2, strength: 0.003, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownBeats: 12, pressureScore: 1, durationBeats: 16,
        params: { radialCount: 6, safeGaps: 2, waveIntervalBeats: 4 },
      },
    ],
  },

  // Boss 5 — Iolite Colossus (100 BPM, beatMs=600ms)
  {
    bossId: 5, bossName: 'Iolite Colossus', maxPressure: 3,
    phase0Attacks: [
      {
        kind: 'mandala', cooldownBeats: 10, pressureScore: 2, durationBeats: 24,
        params: { radialCount: 6, safeGaps: 2, waveIntervalBeats: 4, speed: 70 },
      },
    ],
    phase1Attacks: [
      {
        kind: 'mandala', cooldownBeats: 8, pressureScore: 2, durationBeats: 24,
        params: { radialCount: 8, safeGaps: 2, waveIntervalBeats: 3, speed: 80 },
      },
    ],
    phase2Attacks: [
      {
        kind: 'mandala', cooldownBeats: 6, pressureScore: 3, durationBeats: 24,
        params: { radialCount: 10, safeGaps: 1, waveIntervalBeats: 2.5, speed: 90 },
      },
    ],
  },

  // Boss 6 — Amethyst Breaker (110 BPM, beatMs≈545ms)
  {
    bossId: 6, bossName: 'Amethyst Breaker', maxPressure: 4,
    phase0Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 12, pressureScore: 2, durationBeats: 20,
        params: { boltCount: 1, warnBeats: 1.5, cellSize: 26 },
      },
      {
        kind: 'vermiculate', cooldownBeats: 12, pressureScore: 1, durationBeats: 20,
        params: { wormCount: 1, speed: 60, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 8, pressureScore: 2, durationBeats: 20,
        params: { boltCount: 2, warnBeats: 1, cellSize: 24 },
      },
      {
        kind: 'vermiculate', cooldownBeats: 12, pressureScore: 2, durationBeats: 20,
        params: { wormCount: 2, speed: 70, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 8, pressureScore: 2, durationBeats: 20,
        params: { boltCount: 2, warnBeats: 1, cellSize: 22, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'vermiculate', cooldownBeats: 8, pressureScore: 2, durationBeats: 20,
        params: { wormCount: 2, speed: 80, hazardMode: 'freshTrailHazard' },
      },
    ],
  },

  // Boss 7 — Diamond Eternal (120 BPM, beatMs=500ms)
  // durationBeats=32 for motherSwarm is intentional: 32 × 500ms = 16s sustained swarm cloud,
  // the defining late-game hazard of this boss.
  {
    bossId: 7, bossName: 'Diamond Eternal', maxPressure: 4,
    phase0Attacks: [
      {
        kind: 'motherSwarm', cooldownBeats: 12, pressureScore: 2, durationBeats: 32,
        params: { followerCount: 30, attractionStr: 0.08, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'motherSwarm', cooldownBeats: 12, pressureScore: 2, durationBeats: 32,
        params: { followerCount: 50, attractionStr: 0.10, hazardMode: 'headOnly' },
      },
      {
        kind: 'missileRing', cooldownBeats: 20, pressureScore: 1, durationBeats: 24,
        params: { maxMissiles: 2, spawnIntervalBeats: 8, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'motherSwarm', cooldownBeats: 10, pressureScore: 2, durationBeats: 32,
        params: { followerCount: 60, attractionStr: 0.12, hazardMode: 'filledCircleHazard' },
      },
      {
        kind: 'missileRing', cooldownBeats: 16, pressureScore: 2, durationBeats: 24,
        params: { maxMissiles: 3, spawnIntervalBeats: 8, hazardMode: 'ringEdgeHazard' },
      },
    ],
  },

  // Boss 8 — Nullstone Devourer (130 BPM, beatMs≈462ms)
  // durationBeats=32 for grav is intentional: 32 × 462ms ≈ 14.8s sustained orbital hazard.
  // durationBeats=24 for mandala is intentional: keeps the wave field alive for a full phrase.
  {
    bossId: 8, bossName: 'Nullstone Devourer', maxPressure: 5,
    phase0Attacks: [
      {
        kind: 'grav', cooldownBeats: 12, pressureScore: 2, durationBeats: 32,
        params: { bodyCount: 4, wellCount: 2, strength: 0.003, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownBeats: 16, pressureScore: 2, durationBeats: 24,
        params: { radialCount: 8, safeGaps: 1, waveIntervalBeats: 4, speed: 75 },
      },
    ],
    phase1Attacks: [
      {
        kind: 'grav', cooldownBeats: 8, pressureScore: 3, durationBeats: 32,
        params: { bodyCount: 5, wellCount: 3, strength: 0.0035, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownBeats: 12, pressureScore: 2, durationBeats: 24,
        params: { radialCount: 10, safeGaps: 1, waveIntervalBeats: 4, speed: 85 },
      },
    ],
    phase2Attacks: [
      {
        kind: 'grav', cooldownBeats: 8, pressureScore: 3, durationBeats: 32,
        params: { bodyCount: 6, wellCount: 3, strength: 0.004, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownBeats: 12, pressureScore: 2, durationBeats: 24,
        params: { radialCount: 12, safeGaps: 1, waveIntervalBeats: 3, speed: 95 },
      },
    ],
  },

  // Boss 9 — Void Nexus (140 BPM, beatMs≈429ms)
  // durationBeats 28–32 are intentional: this is a multi-hazard boss designed to maintain
  // overlapping long-lived attacks simultaneously. 32 × 429ms ≈ 13.7s per hazard.
  {
    bossId: 11, bossName: 'Void Nexus', maxPressure: 6,
    phase0Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 14, pressureScore: 2, durationBeats: 28,
        params: { boltCount: 2, warnBeats: 1.5, cellSize: 24 },
      },
      {
        kind: 'motherSwarm', cooldownBeats: 20, pressureScore: 2, durationBeats: 32,
        params: { followerCount: 40, hazardMode: 'headOnly' },
      },
      {
        kind: 'missileRing', cooldownBeats: 24, pressureScore: 2, durationBeats: 32,
        params: { maxMissiles: 3, spawnIntervalBeats: 8, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 12, pressureScore: 2, durationBeats: 28,
        params: { boltCount: 3, warnBeats: 1.5, cellSize: 22 },
      },
      {
        kind: 'motherSwarm', cooldownBeats: 16, pressureScore: 2, durationBeats: 32,
        params: { followerCount: 50, hazardMode: 'headOnly' },
      },
      {
        kind: 'missileRing', cooldownBeats: 20, pressureScore: 2, durationBeats: 32,
        params: { maxMissiles: 4, spawnIntervalBeats: 8, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 8, pressureScore: 2, durationBeats: 28,
        params: { boltCount: 3, warnBeats: 1, cellSize: 20, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'motherSwarm', cooldownBeats: 14, pressureScore: 2, durationBeats: 32,
        params: { followerCount: 70, hazardMode: 'filledCircleHazard' },
      },
      {
        kind: 'missileRing', cooldownBeats: 16, pressureScore: 2, durationBeats: 32,
        params: { maxMissiles: 5, spawnIntervalBeats: 6, hazardMode: 'ringEdgeHazard' },
      },
    ],
  },

  // Boss 10 — Equation Incarnate (150 BPM, beatMs=400ms)
  // durationBeats 32–36 are intentional: the final boss is designed to layer all attack
  // families simultaneously. 36 × 400ms = 14.4s per hazard, filling the entire phase window.
  {
    bossId: 12, bossName: 'The Problem', maxPressure: 8,
    phase0Attacks: [
      {
        kind: 'vermiculate', cooldownBeats: 12, pressureScore: 2, durationBeats: 32,
        params: { wormCount: 2, speed: 70, hazardMode: 'headOnly' },
      },
      {
        kind: 'hexTrail', cooldownBeats: 16, pressureScore: 2, durationBeats: 32,
        params: { boltCount: 2, warnBeats: 1.5, cellSize: 22 },
      },
      {
        kind: 'mandala', cooldownBeats: 16, pressureScore: 2, durationBeats: 32,
        params: { radialCount: 8, safeGaps: 1, waveIntervalBeats: 4, speed: 85 },
      },
    ],
    phase1Attacks: [
      {
        kind: 'grav', cooldownBeats: 12, pressureScore: 2, durationBeats: 36,
        params: { bodyCount: 4, wellCount: 2, strength: 0.003, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'missileRing', cooldownBeats: 16, pressureScore: 2, durationBeats: 36,
        params: { maxMissiles: 4, spawnIntervalBeats: 8, hazardMode: 'ringEdgeHazard' },
      },
      {
        kind: 'motherSwarm', cooldownBeats: 16, pressureScore: 2, durationBeats: 36,
        params: { followerCount: 50, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'grav', cooldownBeats: 12, pressureScore: 3, durationBeats: 36,
        params: { bodyCount: 6, wellCount: 3, strength: 0.004, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'hexTrail', cooldownBeats: 12, pressureScore: 2, durationBeats: 32,
        params: { boltCount: 3, warnBeats: 1.25, cellSize: 20, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'mandala', cooldownBeats: 12, pressureScore: 2, durationBeats: 32,
        params: { radialCount: 12, safeGaps: 1, waveIntervalBeats: 4, speed: 100 },
      },
      {
        kind: 'motherSwarm', cooldownBeats: 12, pressureScore: 2, durationBeats: 36,
        params: { followerCount: 80, hazardMode: 'filledCircleHazard' },
      },
      {
        kind: 'missileRing', cooldownBeats: 12, pressureScore: 2, durationBeats: 36,
        params: { maxMissiles: 5, spawnIntervalBeats: 6, hazardMode: 'ringEdgeHazard' },
      },
      {
        kind: 'vermiculate', cooldownBeats: 12, pressureScore: 2, durationBeats: 32,
        params: { wormCount: 3, speed: 85, hazardMode: 'freshTrailHazard' },
      },
    ],
  },
  // Boss 9 — Fracteryl Manifestation (140 BPM, beatMs≈429ms)
  // Recursive splitting theme: mandala rings echo on each wave, vermiculate tendrils branch,
  // motherSwarm resolves as follower clouds mimicking fractal spore dispersal.
  {
    bossId: 9, bossName: 'Fracteryl Manifestation', maxPressure: 6,
    phase0Attacks: [
      {
        kind: 'mandala', cooldownBeats: 14, pressureScore: 2, durationBeats: 28,
        params: { radialCount: 8, safeGaps: 1, waveIntervalBeats: 3, speed: 80 },
      },
      {
        kind: 'vermiculate', cooldownBeats: 18, pressureScore: 1, durationBeats: 24,
        params: { wormCount: 1, speed: 55, maxTurnRate: 1.2, hazardMode: 'headOnly' },
      },
      {
        kind: 'motherSwarm', cooldownBeats: 20, pressureScore: 2, durationBeats: 28,
        params: { followerCount: 25, attractionStr: 0.07, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'mandala', cooldownBeats: 12, pressureScore: 2, durationBeats: 28,
        params: { radialCount: 10, safeGaps: 1, waveIntervalBeats: 2.5, speed: 90 },
      },
      {
        kind: 'vermiculate', cooldownBeats: 14, pressureScore: 2, durationBeats: 24,
        params: { wormCount: 2, speed: 65, maxTurnRate: 1.4, hazardMode: 'headOnly' },
      },
      {
        kind: 'hexTrail', cooldownBeats: 16, pressureScore: 2, durationBeats: 24,
        params: { boltCount: 2, warnBeats: 1.5, cellSize: 24, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'mandala', cooldownBeats: 10, pressureScore: 2, durationBeats: 28,
        params: { radialCount: 12, safeGaps: 1, waveIntervalBeats: 2, speed: 100 },
      },
      {
        kind: 'vermiculate', cooldownBeats: 12, pressureScore: 2, durationBeats: 24,
        params: { wormCount: 2, speed: 80, hazardMode: 'freshTrailHazard' },
      },
      {
        kind: 'motherSwarm', cooldownBeats: 14, pressureScore: 2, durationBeats: 28,
        params: { followerCount: 50, attractionStr: 0.10, hazardMode: 'filledCircleHazard' },
      },
    ],
  },

  // Boss 10 — Eigenstein Entity (150 BPM, beatMs=400ms)
  // Linear-algebra theme: hexTrail sweeps define invariant lanes, grav wells lock coordinate
  // quadrants, mandala rotations map eigenvalue rotation patterns.
  {
    bossId: 10, bossName: 'Eigenstein Entity', maxPressure: 7,
    phase0Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 12, pressureScore: 2, durationBeats: 28,
        params: { boltCount: 2, warnBeats: 1.5, cellSize: 22, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownBeats: 14, pressureScore: 2, durationBeats: 24,
        params: { radialCount: 8, safeGaps: 2, waveIntervalBeats: 3, speed: 80 },
      },
      {
        kind: 'grav', cooldownBeats: 18, pressureScore: 2, durationBeats: 28,
        params: { bodyCount: 2, wellCount: 1, strength: 0.0025, moving: false, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 10, pressureScore: 2, durationBeats: 28,
        params: { boltCount: 3, warnBeats: 1.25, cellSize: 20, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'grav', cooldownBeats: 14, pressureScore: 3, durationBeats: 32,
        params: { bodyCount: 3, wellCount: 2, strength: 0.003, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownBeats: 14, pressureScore: 2, durationBeats: 24,
        params: { radialCount: 10, safeGaps: 1, waveIntervalBeats: 2.5, speed: 90 },
      },
    ],
    phase2Attacks: [
      {
        kind: 'hexTrail', cooldownBeats: 8, pressureScore: 2, durationBeats: 28,
        params: { boltCount: 4, warnBeats: 1, cellSize: 18, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'grav', cooldownBeats: 12, pressureScore: 3, durationBeats: 32,
        params: { bodyCount: 4, wellCount: 2, strength: 0.0038, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownBeats: 12, pressureScore: 2, durationBeats: 24,
        params: { radialCount: 12, safeGaps: 1, waveIntervalBeats: 2, speed: 100 },
      },
    ],
  },

  // Boss 13 — The Solution (180 BPM, beatMs≈333ms)
  // Final synthesis theme: all prior attack families resolved into clean, readable patterns.
  // durationBeats=28–32 at 180 BPM ≈ 9.3–10.7s — shorter than The Problem to keep the
  // curtain dense but fair: high BPM means more beats per hazard window.
  {
    bossId: 13, bossName: 'The Solution', maxPressure: 8,
    phase0Attacks: [
      {
        kind: 'mandala', cooldownBeats: 12, pressureScore: 2, durationBeats: 28,
        params: { radialCount: 10, safeGaps: 2, waveIntervalBeats: 3, speed: 90 },
      },
      {
        kind: 'missileRing', cooldownBeats: 14, pressureScore: 2, durationBeats: 28,
        params: { maxMissiles: 3, spawnIntervalBeats: 4, hazardMode: 'ringEdgeHazard' },
      },
      {
        kind: 'grav', cooldownBeats: 16, pressureScore: 1, durationBeats: 24,
        params: { bodyCount: 3, wellCount: 1, strength: 0.002, moving: false, hazardMode: 'visualOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'mandala', cooldownBeats: 10, pressureScore: 2, durationBeats: 28,
        params: { radialCount: 12, safeGaps: 1, waveIntervalBeats: 2.5, speed: 100 },
      },
      {
        kind: 'hexTrail', cooldownBeats: 12, pressureScore: 2, durationBeats: 28,
        params: { boltCount: 2, warnBeats: 1.5, cellSize: 22, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'motherSwarm', cooldownBeats: 14, pressureScore: 2, durationBeats: 28,
        params: { followerCount: 50, attractionStr: 0.10, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'mandala', cooldownBeats: 10, pressureScore: 2, durationBeats: 32,
        params: { radialCount: 14, safeGaps: 1, waveIntervalBeats: 2, speed: 110 },
      },
      {
        kind: 'grav', cooldownBeats: 12, pressureScore: 3, durationBeats: 32,
        params: { bodyCount: 5, wellCount: 3, strength: 0.0045, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'hexTrail', cooldownBeats: 12, pressureScore: 2, durationBeats: 28,
        params: { boltCount: 3, warnBeats: 1.25, cellSize: 20, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'missileRing', cooldownBeats: 12, pressureScore: 2, durationBeats: 32,
        params: { maxMissiles: 5, spawnIntervalBeats: 4, hazardMode: 'ringEdgeHazard' },
      },
    ],
  },
];

/** Returns the attack profile for a given bossId, or null if not found. */
export function getBossAttackProfile(bossId: number): BossAttackProfileConfig | null {
  return BOSS_ATTACK_PROFILES.find(p => p.bossId === bossId) ?? null;
}
