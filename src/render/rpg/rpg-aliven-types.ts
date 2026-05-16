/**
 * rpg-aliven-types.ts — Type definitions for the AlivenParticle enemy system.
 *
 * Each AlivenParticleGroup is a swarm of individual AlivenParticle objects.
 * Particles are individually damageable and the group is defeated only when
 * all of its particles are dead.
 */

/** Special ability a particle can trigger on cooldown. */
export type AlivenSpecialKind =
  | 'none'      // contact damage only
  | 'spitter'   // fires a slow bullet toward the player
  | 'dasher'    // briefly dashes toward the player
  | 'pulser'    // emits a shockwave that deals damage in range
  | 'healer'    // restores HP to nearby particles on cooldown
  | 'ember'     // leaves short-lived trail points (visual, no damage in v1)
  | 'splitter'  // spawns 2 child particles on death
  | 'orbiter'   // orbits around group centroid
  | 'ghost';    // periodically phases — invulnerable to damage during ghostMs

/** A single trail sample position. */
export interface AlivenTrailPoint {
  x: number;
  y: number;
}

/** One particle within an AlivenParticleGroup. */
export interface AlivenParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  isAlive: boolean;
  hp: number;
  maxHp: number;
  radiusPx: number;
  color: string;
  glowColor: string;
  /** Phase accumulator for the pulse animation (advances each frame). */
  pulseMs: number;
  /** Remaining ms of white hit-flash visual. */
  hitFlashMs: number;
  /** Remaining ms before this particle can deal contact damage again. */
  contactCdMs: number;
  specialKind: AlivenSpecialKind;
  /** Countdown until the next special trigger. */
  specialCdMs: number;
  specialCdMin: number;
  specialCdMax: number;
  /** Spitter only: remaining ms of windup animation before the bullet fires. */
  windupMs: number;
  /** Ghost only: remaining ms of ghost phase (particle cannot be damaged). */
  ghostMs: number;
  /** Short trail of recent positions for the comet effect. */
  trail: AlivenTrailPoint[];
  // ── Visual-only fields (not game-logic state) ──────────────────
  /** Pulser only: remaining ms for the expanding shockwave ring visual. */
  pulserFlashMs: number;
  /** Healer only: remaining ms to draw a beam to the last healed target. */
  healBeamMs: number;
  /** Healer only: x position of the last healed target (for beam visual). */
  healBeamTargetX: number;
  /** Healer only: y position of the last healed target (for beam visual). */
  healBeamTargetY: number;
}

/** A slow bullet fired by a spitter particle. */
export interface AlivenBullet {
  x: number;
  y: number;
  vx: number;
  vy: number;
  atk: number;
  color: string;
}

/** A group of AlivenParticles sharing a variant, tier, and lifecycle. */
export interface AlivenParticleGroup {
  readonly kind: 'aliven';
  /** Variant identifier (e.g. 'aliven_spark_cluster'). */
  variantId: string;
  /** Tier id used for lucky-mote drops (e.g. 'sapphire'). */
  tierId: string;
  /** XP multiplier applied on group defeat. */
  xpMult: number;
  /** Approximate centroid of alive particles, updated each frame. */
  cx: number;
  cy: number;
  /** Last known position used for the group death fluid explosion. */
  x: number;
  y: number;
  particles: AlivenParticle[];
  /** Cached count of alive particles — updated by updateCentroid each frame. */
  aliveCount: number;
  bullets: AlivenBullet[];
  /** How many particles have been activated so far (spawn-over-time). */
  spawnedCount: number;
  /** Total particles this group will have when fully spawned. */
  targetCount: number;
  /** Countdown until the next particle activates. */
  spawnCdMs: number;
  // ── Visual-only fields ──────────────────────────────────────────
  /** Remaining ms for the splitter-death burst ring visual. */
  splitFlashMs: number;
  /** Position of the last splitter death (for burst ring visual). */
  splitFlashX: number;
  splitFlashY: number;
}

/**
 * Context injected from rpg-render.ts into the per-frame aliven update functions.
 * Defined here (in the type module) so that both rpg-aliven-updates.ts and
 * rpg-aliven-specials.ts can import it without creating a circular dependency.
 */
export interface AlivenUpdateCtx {
  playerX: number;
  playerY: number;
  playerRadius: number;
  /** Current remaining i-frame duration (read-only from updates; use setPlayerIFramesMs to write). */
  playerIFramesMs: number;
  /** Grant the player i-frames directly (e.g. from spitter bullet hits). */
  setPlayerIFramesMs(ms: number): void;
  canvasW: number;
  canvasH: number;
  dealContactDamageToPlayer(atk: number): void;
}

/** Per-variant static tuning parameters, consumed by the factory. */
export interface AlivenVariantParams {
  tierId: string;
  color: string;
  glowColor: string;
  particleCount: number;
  radiusPx: number;
  /** Base HP per particle (scaled by getWaveStatScale at spawn time). */
  hpBase: number;
  /** Base ATK used for contact damage (scaled at spawn time). */
  atkBase: number;
  xpMult: number;
  spawnIntervalMs: number;
  specialKind: AlivenSpecialKind;
  specialCdMin: number;
  specialCdMax: number;
}
