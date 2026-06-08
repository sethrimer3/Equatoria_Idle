/**
 * horizon-pentagon-types.ts — Type definitions for the Horizon pentagon mirror enemy.
 *
 * One HorizonPentagonGroup is spawned per wave slot.  It owns:
 *   – A single "real" body (the only one that takes player damage).
 *   – Zero or more shadow bodies (one per active mirror line).
 *   – Flat projectile buckets shared by all bodies (missiles, bullets).
 *   – Per-body laser state (each body fires from its own position).
 *   – Visual puff particles emitted when the real body swaps into a shadow.
 */

// ── Homing missile ────────────────────────────────────────────────────────────

export interface HorizonMissile {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
  explodeFlashMs: number;  // > 0 when playing the pre-explosion flash
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

// ── Gatling bullet ────────────────────────────────────────────────────────────

export interface HorizonBullet {
  x: number; y: number;
  vx: number; vy: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Laser charge-up + fire ───────────────────────────────────────────────────

export type HorizonLaserPhase = 'charging' | 'firing';

export interface HorizonLaserState {
  /** Body position the laser originates from. */
  originX: number; originY: number;
  /** Current aim direction (unit vector). Slowly tracks player during charging. */
  dirX: number; dirY: number;
  phase: HorizonLaserPhase;
  /** Counts down from CHARGE_MS (charging) or FIRE_MS (firing). */
  timerMs: number;
  atk: number;
}

// ── Shadow body ───────────────────────────────────────────────────────────────

export interface HorizonShadowBody {
  x: number; y: number;
  /** Per-body attack countdowns (ms until next attack attempt). */
  missileTimerMs: number;
  laserTimerMs: number;
  gatlingTimerMs: number;
  activeLaser: HorizonLaserState | null;
}

// ── Puff particle ─────────────────────────────────────────────────────────────

export interface HorizonPuffParticle {
  x: number; y: number;
  vx: number; vy: number;
  lifeMs: number;
  maxLifeMs: number;
}

// ── Main group entity ─────────────────────────────────────────────────────────

export interface HorizonPentagonGroup {
  readonly kind: 'horizon_pentagon';

  // ── Real body position / stats ──────────────────────────────────
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;

  // ── Real body animation ─────────────────────────────────────────
  pulseMs: number;

  // ── Real body attack countdowns ─────────────────────────────────
  missileTimerMs: number;
  laserTimerMs: number;
  gatlingTimerMs: number;
  activeLaser: HorizonLaserState | null;

  // ── Swap system ─────────────────────────────────────────────────
  // swapCdMs > 0 means the entity is briefly invulnerable after a swap.
  swapCdMs: number;

  // ── Mirror system ────────────────────────────────────────────────
  // Absolute Y-coordinates (canvas/world space) of the active mirror lines.
  mirrorLineYs: number[];

  // ── Shadow bodies (one per mirror line) ─────────────────────────
  shadows: HorizonShadowBody[];

  // ── Shared projectile buckets ────────────────────────────────────
  // Both real body and shadows push into these arrays.
  missiles: HorizonMissile[];
  bullets:  HorizonBullet[];

  // ── Visual puff particles ────────────────────────────────────────
  puffs: HorizonPuffParticle[];
}
