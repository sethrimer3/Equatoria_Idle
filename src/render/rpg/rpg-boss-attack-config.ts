/**
 * rpg-boss-attack-config.ts — Data-driven attack profiles for all 10 bosses.
 *
 * Each boss has up to three phase configs (phase0/1/2 matching BossEnemy.phaseIndex).
 * The new special attacks (grav, hexTrail, mandala, vermiculate, missileRing, motherSwarm)
 * run ALONGSIDE the existing BossProjectile system — not instead of it.
 */

export type BossAttackKind =
  | 'grav'
  | 'hexTrail'
  | 'mandala'
  | 'vermiculate'
  | 'missileRing'
  | 'motherSwarm'
  | 'quartzSignature';

export interface BossAttackKindConfig {
  kind: BossAttackKind;
  /** Minimum ms between this attack kind re-firing (per boss). */
  cooldownMs: number;
  /** Added to BossAttackState.activePressure while this attack instance is alive. */
  pressureScore: number;
  /** Lifetime of the attack instance in ms. */
  durationMs: number;
  /** Kind-specific numeric/boolean/string overrides applied at spawn time. */
  params: Record<string, number | boolean | string>;
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
  // Boss 0 — Sand Warden (tutorial: slow telegraph, visual-only warning, simple mandala)
  {
    bossId: 0, bossName: 'Sand Warden', maxPressure: 1,
    phase0Attacks: [
      // Warning pulse: purely visual, teaches the player that something is coming
      {
        kind: 'grav', cooldownMs: 12000, pressureScore: 0, durationMs: 3000,
        params: { bodyCount: 2, wellCount: 1, strength: 0, hazardMode: 'visualOnly' },
      },
      // Sand Line: generous 1500 ms telegraph so the player can read and dodge
      {
        kind: 'hexTrail', cooldownMs: 14000, pressureScore: 1, durationMs: 10000,
        params: { boltCount: 1, warnMs: 1500, cellSize: 30, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 10000, pressureScore: 1, durationMs: 10000,
        params: { boltCount: 1, warnMs: 1200, cellSize: 28, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownMs: 14000, pressureScore: 1, durationMs: 8000,
        params: { radialCount: 5, safeGaps: 3, waveInterval: 3000, speed: 50 },
      },
    ],
    phase2Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 8000, pressureScore: 1, durationMs: 10000,
        params: { boltCount: 1, warnMs: 1000, cellSize: 26, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownMs: 10000, pressureScore: 1, durationMs: 8000,
        params: { radialCount: 6, safeGaps: 2, waveInterval: 2500, speed: 55 },
      },
    ],
  },

  // Boss 1 — Quartz Sovereign (slow intro: single harmless worm)
  {
    bossId: 1, bossName: 'Quartz Sovereign', maxPressure: 2,
    phase0Attacks: [
      {
        kind: 'vermiculate', cooldownMs: 8000, pressureScore: 1, durationMs: 12000,
        params: { wormCount: 1, speed: 55, maxTurnRate: 1.2, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'vermiculate', cooldownMs: 6000, pressureScore: 1, durationMs: 12000,
        params: { wormCount: 1, speed: 65, maxTurnRate: 1.4, hazardMode: 'headOnly' },
      },
      {
        kind: 'hexTrail', cooldownMs: 10000, pressureScore: 1, durationMs: 10000,
        params: { boltCount: 1, warnMs: 900, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'vermiculate', cooldownMs: 4000, pressureScore: 2, durationMs: 12000,
        params: { wormCount: 2, speed: 75, maxTurnRate: 1.6, hazardMode: 'headOnly' },
      },
    ],
  },

  // Boss 2 — Ruby King (hex trail with long warning period)
  {
    bossId: 2, bossName: 'Ruby King', maxPressure: 2,
    phase0Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 7000, pressureScore: 1, durationMs: 12000,
        params: { boltCount: 1, warnMs: 1200, cellSize: 28, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 5000, pressureScore: 2, durationMs: 12000,
        params: { boltCount: 2, warnMs: 900, cellSize: 26, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 4000, pressureScore: 2, durationMs: 14000,
        params: { boltCount: 2, warnMs: 700, cellSize: 24, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'vermiculate', cooldownMs: 8000, pressureScore: 1, durationMs: 10000,
        params: { wormCount: 1, speed: 70, hazardMode: 'headOnly' },
      },
    ],
  },

  // Boss 3 — Sunstone Herald (slow ring-edge missiles)
  {
    bossId: 3, bossName: 'Sunstone Herald', maxPressure: 3,
    phase0Attacks: [
      {
        kind: 'missileRing', cooldownMs: 7000, pressureScore: 1, durationMs: 14000,
        params: { maxMissiles: 2, spawnInterval: 4000, explosionRadius: 35, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'missileRing', cooldownMs: 5000, pressureScore: 2, durationMs: 14000,
        params: { maxMissiles: 3, spawnInterval: 3000, explosionRadius: 40, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'missileRing', cooldownMs: 4000, pressureScore: 2, durationMs: 14000,
        params: { maxMissiles: 4, spawnInterval: 2500, explosionRadius: 45, hazardMode: 'ringEdgeHazard' },
      },
      {
        kind: 'grav', cooldownMs: 10000, pressureScore: 1, durationMs: 10000,
        params: { bodyCount: 2, wellCount: 1, strength: 0.0018, hazardMode: 'visualOnly' },
      },
    ],
  },

  // Boss 4 — Citrine Weaver (grav wells with visual trails)
  {
    bossId: 4, bossName: 'Citrine Weaver', maxPressure: 3,
    phase0Attacks: [
      {
        kind: 'grav', cooldownMs: 6000, pressureScore: 2, durationMs: 14000,
        params: { bodyCount: 3, wellCount: 1, strength: 0.002, moving: false, hazardMode: 'visualOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'grav', cooldownMs: 5000, pressureScore: 2, durationMs: 14000,
        params: { bodyCount: 4, wellCount: 2, strength: 0.0025, moving: true, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'grav', cooldownMs: 4000, pressureScore: 3, durationMs: 16000,
        params: { bodyCount: 5, wellCount: 2, strength: 0.003, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownMs: 8000, pressureScore: 1, durationMs: 10000,
        params: { radialCount: 6, safeGaps: 2, waveInterval: 2500 },
      },
    ],
  },

  // Boss 5 — Iolite Colossus (radial mandala with clear gaps)
  {
    bossId: 5, bossName: 'Iolite Colossus', maxPressure: 3,
    phase0Attacks: [
      {
        kind: 'mandala', cooldownMs: 6000, pressureScore: 2, durationMs: 14000,
        params: { radialCount: 6, safeGaps: 2, waveInterval: 2200, speed: 70 },
      },
    ],
    phase1Attacks: [
      {
        kind: 'mandala', cooldownMs: 5000, pressureScore: 2, durationMs: 14000,
        params: { radialCount: 8, safeGaps: 2, waveInterval: 1800, speed: 80 },
      },
    ],
    phase2Attacks: [
      {
        kind: 'mandala', cooldownMs: 4000, pressureScore: 3, durationMs: 14000,
        params: { radialCount: 10, safeGaps: 1, waveInterval: 1500, speed: 90 },
      },
    ],
  },

  // Boss 6 — Amethyst Breaker (hexTrail + vermiculate combination)
  {
    bossId: 6, bossName: 'Amethyst Breaker', maxPressure: 4,
    phase0Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 6000, pressureScore: 2, durationMs: 12000,
        params: { boltCount: 1, warnMs: 800, cellSize: 26 },
      },
      {
        kind: 'vermiculate', cooldownMs: 7000, pressureScore: 1, durationMs: 12000,
        params: { wormCount: 1, speed: 60, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 5000, pressureScore: 2, durationMs: 12000,
        params: { boltCount: 2, warnMs: 700, cellSize: 24 },
      },
      {
        kind: 'vermiculate', cooldownMs: 6000, pressureScore: 2, durationMs: 12000,
        params: { wormCount: 2, speed: 70, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 4000, pressureScore: 2, durationMs: 12000,
        params: { boltCount: 2, warnMs: 600, cellSize: 22, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'vermiculate', cooldownMs: 5000, pressureScore: 2, durationMs: 12000,
        params: { wormCount: 2, speed: 80, hazardMode: 'freshTrailHazard' },
      },
    ],
  },

  // Boss 7 — Diamond Eternal (motherSwarm + secondary missiles)
  {
    bossId: 7, bossName: 'Diamond Eternal', maxPressure: 4,
    phase0Attacks: [
      {
        kind: 'motherSwarm', cooldownMs: 7000, pressureScore: 2, durationMs: 16000,
        params: { followerCount: 30, attractionStr: 0.08, hazardMode: 'headOnly' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'motherSwarm', cooldownMs: 6000, pressureScore: 2, durationMs: 16000,
        params: { followerCount: 50, attractionStr: 0.10, hazardMode: 'headOnly' },
      },
      {
        kind: 'missileRing', cooldownMs: 9000, pressureScore: 1, durationMs: 12000,
        params: { maxMissiles: 2, spawnInterval: 4500, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'motherSwarm', cooldownMs: 5000, pressureScore: 2, durationMs: 16000,
        params: { followerCount: 60, attractionStr: 0.12, hazardMode: 'filledCircleHazard' },
      },
      {
        kind: 'missileRing', cooldownMs: 7000, pressureScore: 2, durationMs: 12000,
        params: { maxMissiles: 3, spawnInterval: 3500, hazardMode: 'ringEdgeHazard' },
      },
    ],
  },

  // Boss 8 — Nullstone Devourer (grav moving wells + mandala)
  {
    bossId: 8, bossName: 'Nullstone Devourer', maxPressure: 5,
    phase0Attacks: [
      {
        kind: 'grav', cooldownMs: 5000, pressureScore: 2, durationMs: 14000,
        params: { bodyCount: 4, wellCount: 2, strength: 0.003, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownMs: 8000, pressureScore: 2, durationMs: 12000,
        params: { radialCount: 8, safeGaps: 1, waveInterval: 2000, speed: 75 },
      },
    ],
    phase1Attacks: [
      {
        kind: 'grav', cooldownMs: 4000, pressureScore: 3, durationMs: 14000,
        params: { bodyCount: 5, wellCount: 3, strength: 0.0035, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownMs: 6000, pressureScore: 2, durationMs: 12000,
        params: { radialCount: 10, safeGaps: 1, waveInterval: 1800, speed: 85 },
      },
    ],
    phase2Attacks: [
      {
        kind: 'grav', cooldownMs: 3500, pressureScore: 3, durationMs: 14000,
        params: { bodyCount: 6, wellCount: 3, strength: 0.004, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'mandala', cooldownMs: 5000, pressureScore: 2, durationMs: 12000,
        params: { radialCount: 12, safeGaps: 1, waveInterval: 1500, speed: 95 },
      },
    ],
  },

  // Boss 9 — Void Nexus (hex + swarm + missiles)
  {
    bossId: 9, bossName: 'Void Nexus', maxPressure: 6,
    phase0Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 6000, pressureScore: 2, durationMs: 12000,
        params: { boltCount: 2, warnMs: 700, cellSize: 24 },
      },
      {
        kind: 'motherSwarm', cooldownMs: 8000, pressureScore: 2, durationMs: 14000,
        params: { followerCount: 40, hazardMode: 'headOnly' },
      },
      {
        kind: 'missileRing', cooldownMs: 10000, pressureScore: 2, durationMs: 14000,
        params: { maxMissiles: 3, spawnInterval: 3500, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase1Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 5000, pressureScore: 2, durationMs: 12000,
        params: { boltCount: 3, warnMs: 600, cellSize: 22 },
      },
      {
        kind: 'motherSwarm', cooldownMs: 7000, pressureScore: 2, durationMs: 14000,
        params: { followerCount: 50, hazardMode: 'headOnly' },
      },
      {
        kind: 'missileRing', cooldownMs: 8000, pressureScore: 2, durationMs: 14000,
        params: { maxMissiles: 4, spawnInterval: 3000, hazardMode: 'ringEdgeHazard' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'hexTrail', cooldownMs: 4000, pressureScore: 2, durationMs: 12000,
        params: { boltCount: 3, warnMs: 500, cellSize: 20, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'motherSwarm', cooldownMs: 6000, pressureScore: 2, durationMs: 14000,
        params: { followerCount: 70, hazardMode: 'filledCircleHazard' },
      },
      {
        kind: 'missileRing', cooldownMs: 6000, pressureScore: 2, durationMs: 14000,
        params: { maxMissiles: 5, spawnInterval: 2500, hazardMode: 'ringEdgeHazard' },
      },
    ],
  },

  // Boss 10 — Equation Incarnate (all 6 families, phased progression)
  {
    bossId: 10, bossName: 'Equation Incarnate', maxPressure: 8,
    phase0Attacks: [
      {
        kind: 'vermiculate', cooldownMs: 5000, pressureScore: 2, durationMs: 12000,
        params: { wormCount: 2, speed: 70, hazardMode: 'headOnly' },
      },
      {
        kind: 'hexTrail', cooldownMs: 6000, pressureScore: 2, durationMs: 12000,
        params: { boltCount: 2, warnMs: 600, cellSize: 22 },
      },
      {
        kind: 'mandala', cooldownMs: 7000, pressureScore: 2, durationMs: 12000,
        params: { radialCount: 8, safeGaps: 1, waveInterval: 1800, speed: 85 },
      },
    ],
    phase1Attacks: [
      {
        kind: 'grav', cooldownMs: 5000, pressureScore: 2, durationMs: 14000,
        params: { bodyCount: 4, wellCount: 2, strength: 0.003, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'missileRing', cooldownMs: 6000, pressureScore: 2, durationMs: 14000,
        params: { maxMissiles: 4, spawnInterval: 3000, hazardMode: 'ringEdgeHazard' },
      },
      {
        kind: 'motherSwarm', cooldownMs: 7000, pressureScore: 2, durationMs: 14000,
        params: { followerCount: 50, hazardMode: 'headOnly' },
      },
    ],
    phase2Attacks: [
      {
        kind: 'grav', cooldownMs: 4000, pressureScore: 3, durationMs: 14000,
        params: { bodyCount: 6, wellCount: 3, strength: 0.004, moving: true, hazardMode: 'headOnly' },
      },
      {
        kind: 'hexTrail', cooldownMs: 4000, pressureScore: 2, durationMs: 12000,
        params: { boltCount: 3, warnMs: 500, cellSize: 20, hazardMode: 'persistentSegmentHazard' },
      },
      {
        kind: 'mandala', cooldownMs: 4500, pressureScore: 2, durationMs: 12000,
        params: { radialCount: 12, safeGaps: 1, waveInterval: 1400, speed: 100 },
      },
      {
        kind: 'motherSwarm', cooldownMs: 5000, pressureScore: 2, durationMs: 14000,
        params: { followerCount: 80, hazardMode: 'filledCircleHazard' },
      },
      {
        kind: 'missileRing', cooldownMs: 5000, pressureScore: 2, durationMs: 14000,
        params: { maxMissiles: 5, spawnInterval: 2500, hazardMode: 'ringEdgeHazard' },
      },
      {
        kind: 'vermiculate', cooldownMs: 5000, pressureScore: 2, durationMs: 12000,
        params: { wormCount: 3, speed: 85, hazardMode: 'freshTrailHazard' },
      },
    ],
  },
];

/** Returns the attack profile for a given bossId, or null if not found. */
export function getBossAttackProfile(bossId: number): BossAttackProfileConfig | null {
  return BOSS_ATTACK_PROFILES.find(p => p.bossId === bossId) ?? null;
}
