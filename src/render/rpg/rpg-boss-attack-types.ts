/**
 * rpg-boss-attack-types.ts — Type definitions for the boss special attack system.
 *
 * Covers all six XScreenSaver-inspired attack families:
 *   grav        — gravitational orbital bodies with trails
 *   hexTrail    — hex-grid crawling lightning bolts
 *   mandala     — radial wave projectile bursts
 *   vermiculate — sinuous worm heads with deterministic drift
 *   missileRing — targeted missiles with expanding explosion rings
 *   motherSwarm — mother particle + follower cloud
 *
 * Trail ring buffers use Float64Array for compatibility with neon-trail-draw.ts.
 * The mulberry32 PRNG is used for all deterministic RNG inside attacks.
 */

// ── Deterministic PRNG (mulberry32) ──────────────────────────────────────────

export function createPrng(seed: number): () => number {
  let s = seed >>> 0;
  return function (): number {
    s += 0x6D2B79F5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 0x100000000;
  };
}

// ── Hazard mode ───────────────────────────────────────────────────────────────

export type HazardMode =
  | 'visualOnly'
  | 'headOnly'
  | 'freshTrailHazard'
  | 'delayedTrailHazard'
  | 'persistentSegmentHazard'
  | 'ringEdgeHazard'
  | 'filledCircleHazard';

// ── Trail ring buffer ─────────────────────────────────────────────────────────

export interface TrailRing {
  pointsX: Float64Array;
  pointsY: Float64Array;
  head: number;
  count: number;
  readonly cap: number;
}

export function createTrailRing(cap: number): TrailRing {
  return {
    pointsX: new Float64Array(cap),
    pointsY: new Float64Array(cap),
    head: 0,
    count: 0,
    cap,
  };
}

export function trailPush(trail: TrailRing, x: number, y: number): void {
  trail.pointsX[trail.head] = x;
  trail.pointsY[trail.head] = y;
  trail.head = (trail.head + 1) % trail.cap;
  if (trail.count < trail.cap) trail.count++;
}

// ── Grav attack ───────────────────────────────────────────────────────────────

export interface GravWell {
  x: number;
  y: number;
  strength: number;
  movingAngle: number;
}

export interface GravBody {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: TrailRing;
  color: string;
  glowColor: string;
  radius: number;
  hazardMode: HazardMode;
  ageMs: number;
}

export interface GravAttackInstance {
  readonly kind: 'grav';
  ageMs: number;
  durationMs: number;
  wells: GravWell[];
  bodies: GravBody[];
  softeningSquared: number;
  velocityCap: number;
  trailPersistenceMs: number;
  difficulty: number;
}

// ── Hex trail attack ──────────────────────────────────────────────────────────

export interface HexSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  ageMs: number;
  hazardMs: number;
  color: string;
  lingeringMs: number;
}

export interface HexBolt {
  qNow: number;
  rNow: number;
  qNext: number;
  rNext: number;
  progress: number;
  speed: number;
  color: string;
  glowColor: string;
  warnTimerMs: number;
  segments: HexSegment[];
  isWarning: boolean;
}

export interface HexAttackInstance {
  readonly kind: 'hexTrail';
  ageMs: number;
  durationMs: number;
  cellSize: number;
  originX: number;
  originY: number;
  bolts: HexBolt[];
  maxSegments: number;
  segmentHazardMs: number;
  lingeringTrailMs: number;
  difficulty: number;
  rng: () => number;
}

// ── Mandala attack ────────────────────────────────────────────────────────────

export interface MandalaProjectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  trail: TrailRing;
  color: string;
  glowColor: string;
  ageMs: number;
  hazardMode: HazardMode;
}

export interface MandalaAttackInstance {
  readonly kind: 'mandala';
  ageMs: number;
  durationMs: number;
  originX: number;
  originY: number;
  projectiles: MandalaProjectile[];
  waveTimerMs: number;
  waveInterval: number;
  radialCount: number;
  waveAngle: number;
  angularDrift: number;
  trailPersistenceMs: number;
  projectileSpeed: number;
  safeGapCount: number;
  safeGapWidth: number;
  difficulty: number;
  rng: () => number;
}

// ── Vermiculate attack ────────────────────────────────────────────────────────

export interface WormHead {
  x: number;
  y: number;
  angle: number;
  angularVelocity: number;
  speed: number;
  maxTurnRate: number;
  noisePhase: number;
  trail: TrailRing;
  color: string;
  glowColor: string;
  hazardMode: HazardMode;
  radius: number;
}

export interface VermiculateAttackInstance {
  readonly kind: 'vermiculate';
  ageMs: number;
  durationMs: number;
  worms: WormHead[];
  trailPersistenceMs: number;
  difficulty: number;
  rng: () => number;
}

// ── Missile-ring attack ───────────────────────────────────────────────────────

export type MissileState = 'flying' | 'exploding' | 'lingering' | 'fading';

export interface BossAttackMissile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  angle: number;
  speed: number;
  color: string;
  glowColor: string;
  state: MissileState;
  stateTimerMs: number;
  explodeRingRadius: number;
  explodeRingMax: number;
  trail: TrailRing;
  ageMs: number;
  hasFired: boolean;
}

export interface MissileAttackInstance {
  readonly kind: 'missileRing';
  ageMs: number;
  durationMs: number;
  missiles: BossAttackMissile[];
  launchIntervalMs: number;
  launchTimerMs: number;
  nextLaunchIndex: number;
  difficulty: number;
  rng: () => number;
}

// ── Mother-swarm attack ───────────────────────────────────────────────────────

export interface MotherParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  trail: TrailRing;
  color: string;
  glowColor: string;
  ageMs: number;
  radius: number;
  noisePhase: number;
  angularVelocity: number;
}

export interface FollowerParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed: number;
  trail: TrailRing;
  color: string;
  glowColor: string;
  ageMs: number;
  radius: number;
  index: number;
  noiseOffset: number;
}

export interface SwarmAttackInstance {
  readonly kind: 'motherSwarm';
  ageMs: number;
  durationMs: number;
  mother: MotherParticle;
  followers: FollowerParticle[];
  trailPersistenceMs: number;
  difficulty: number;
  rng: () => number;
}

// ── Union type ────────────────────────────────────────────────────────────────

export interface QuartzSignatureTrailSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  iteration: number;
  ageMs: number;
  hazardMs: number;
}

export interface QuartzSignatureMissile {
  x: number;
  y: number;
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  angle: number;
  iteration: number;
  beatProgressMs: number;
  active: boolean;
}

export interface QuartzSignatureAttackInstance {
  readonly kind: 'quartzSignature';
  ageMs: number;
  durationMs: number;
  missiles: QuartzSignatureMissile[];
  trailSegments: QuartzSignatureTrailSegment[];
  beatMs: number;
  stepDistance: number;
  maxIteration: number;
  trailHazardMs: number;
  trailFadeMs: number;
  color: string;
  glowColor: string;
  difficulty: number;
}

export type BossAttackInstance =
  | GravAttackInstance
  | HexAttackInstance
  | MandalaAttackInstance
  | VermiculateAttackInstance
  | MissileAttackInstance
  | SwarmAttackInstance
  | QuartzSignatureAttackInstance;

// ── Boss attack state (held in rpg-render.ts closure) ────────────────────────

export interface BossAttackState {
  attacks: BossAttackInstance[];
  /** key: `${bossId}_${kind}` → ms remaining on cooldown */
  schedulerCooldowns: Map<string, number>;
  /** Sum of pressure scores of all currently active attacks */
  activePressure: number;
}

export function createBossAttackState(): BossAttackState {
  return {
    attacks: [],
    schedulerCooldowns: new Map(),
    activePressure: 0,
  };
}
