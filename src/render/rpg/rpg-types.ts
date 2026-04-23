// rpg-types.ts — extracted from rpg-render.ts

export interface RpgMote {
  x: number; y: number;
  vx: number; vy: number;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

export interface RpgJoystick {
  isActive: boolean; pointerId: number;
  baseX: number; baseY: number;
  thumbX: number; thumbY: number;
}

export interface RpgKeyState {
  left: boolean; right: boolean;
  up: boolean; down: boolean;
}

export interface RpgPlayerStats {
  hp: number; maxHp: number;
  atk: number; def: number;
}

export type LaserPhase = 'idle' | 'decelerate' | 'dash' | 'overshoot' | 'cooldown';

export interface AttackTrailState {
  active: boolean;
  startX: number; startY: number;
  endX:   number; endY:   number;
  controlAngle: number;
  trailStartMs: number;
  trailEndMs:   number;
}

export interface LaserEnemy {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  phase: LaserPhase;
  phaseElapsedMs: number;
  dashDirX: number; dashDirY: number;
  dashTraveled: number;
  lockedTargetX: number; lockedTargetY: number;
  attackTrail: AttackTrailState;
  patrolTimerMs: number;
  hasHitPlayer: boolean;
}

export type RpgPhase = 'alive' | 'dying' | 'restarting';

export interface DeathParticle {
  x: number; y: number;
  vx: number; vy: number;
  alpha: number;
  size: number;
  color: string;
}

export interface SpawnEntry {
  enemyTypeId: string;
  timerMs: number;
}

/** Visual flash drawn at the point an enemy is hit by the player. */
export interface HitEffect {
  x: number; y: number;
  timerMs: number;
  color: string;
}

/** Visual line drawn from the player toward a struck enemy. */
export interface ShotLine {
  x1: number; y1: number;
  x2: number; y2: number;
  timerMs: number;
  color: string;
}

/** Floating text showing damage dealt or "BLOCKED". */
export interface DamageNumber {
  x: number; y: number;
  vx: number; vy: number;
  text: string;
  fontPx: number;
  color: string;
  timerMs: number;
}

/** Visual-only orbit particle for the equipped weapon. */
export interface WeaponOrbitParticle {
  /** Current angle in radians (advances each frame). */
  angle: number;
  /** Current computed position (updated from angle + player position). */
  x: number; y: number;
  /** Comet trail positions. */
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
  /** Tier color for this particle. */
  color: string;
  /** Glow color. */
  glowColor: string;
  /** Size in pixels (= weapon tier). */
  size: number;
}

/** Orbit projectile that damages enemies. */
export interface OrbitProjectile {
  /** Current angle in radians. */
  angle: number;
  /** Computed position. */
  x: number; y: number;
  /** Comet trail. */
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
  /** Per-target cooldown tracking (uses object identity as key). */
  hitCooldowns: Map<object, number>;
}

// ── Sapphire enemy and missile interfaces ─────────────────────

export interface SapphireEnemy {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  shieldHp: number; maxShieldHp: number;
  missileTimerMs: number;
  patrolTimerMs: number;
}

export interface SapphireMissile {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
  hasHitPlayer: boolean;
}

// ── Sand gatling projectile ────────────────────────────────────

export interface SandProjectile {
  x: number; y: number;
  vx: number; vy: number;
  lifeMs: number;
  /** Damage to deal on hit (pre-scaled: weapon tier × player ATK already applied at spawn). */
  scaledDamage: number;
}

// ── Quartz chain whip ──────────────────────────────────────────

export type ChainPhase = 'idle' | 'lashing' | 'retracting';

export interface ChainWhipState {
  phase: ChainPhase;
  phaseMs: number;
  cooldownMs: number;
  /** Tip lash target in world space. */
  targetX: number; targetY: number;
  /**
   * Node positions.
   * Index 0 = closest to player (smallest, least inertia).
   * Index CHAIN_NODES-1 = tip / attacker (largest, most inertia).
   */
  nodesX: Float64Array; nodesY: Float64Array;
  /** Node velocities for softbody physics. */
  nodesVx: Float64Array; nodesVy: Float64Array;
  /** Per-target hit cooldown for persistent damage. */
  hitCooldowns: Map<object, number>;
}

// ── Ruby laser beam visual ─────────────────────────────────────

export interface LaserBeamEffect {
  active: boolean;
  startX: number; startY: number;
  endX: number; endY: number;
  dirX: number; dirY: number;
  timerMs: number;
}

// ── Nullstone vortex weapon interfaces ────────────────────────

export interface NullstoneVortex {
  x: number; y: number;
  radiusPx: number;
  durationMs: number;
  maxDurationMs: number;
  spinAngle: number;
  damageTimerMs: number;
  /** Damage per tick, pre-computed at spawn (rawDamage / 3). */
  scaledDamage: number;
  weaponId: string;
}

export interface VortexWeaponState {
  /** Countdown until the next vortex fire. */
  cooldownMs: number;
}

// ── Diamond sword combo interfaces ────────────────────────────

export type SwordComboPhase = 'idle' | 'swing' | 'cooldown';

/** A disconnected prismatic arc visual spawned when the sword swipes. */
export interface SwipeEffect {
  /** Player position at moment of swipe. */
  x: number; y: number;
  /** Arc start angle (radians). */
  arcStart: number;
  /** Arc end angle (radians). */
  arcEnd: number;
  /** Sword reach used for the arc radius. */
  swordLength: number;
  timerMs: number;
  maxTimerMs: number;
}

/**
 * A thin prismatic diamond-shaped beam that appears from tail to tip,
 * then fades from tail to tip.
 */
export interface PrismaticBeamEffect {
  tailX: number; tailY: number;
  tipX:  number; tipY:  number;
  /** Animation progress: 0→1 = appearing, 1→2 = fading. */
  progress: number;
  /** Total duration in ms (split equally between appear and fade). */
  maxTimerMs: number;
}

export interface SwordComboState {
  phase: SwordComboPhase;
  /** Milliseconds elapsed in the current phase. */
  phaseMs: number;
  /** Total ms of cooldown before next swing starts. */
  cooldownMs: number;
  /** Enemies already struck in the current swing (reset each swing). */
  hitThisSwing: Set<object>;
  /** Current blade hinge angle (maintained with spring+inertia). */
  swordAngle: number;
  /** Angular velocity of the hinge. */
  swordAngularVel: number;
  /** Per-shard angles chained from handle (0) to tip (N-1). */
  shardAngles: number[];
  /** Swipe arc start angle (set when a swing begins). */
  swipeArcStart: number;
  /** Swipe arc end angle (set when a swing begins). */
  swipeArcEnd: number;
  /** Disconnected swipe-arc visuals. */
  swipeEffects: SwipeEffect[];
  /** Prismatic beam visuals spawned on enemy hit. */
  beamEffects: PrismaticBeamEffect[];
}

// ── Iolite poison bolt interfaces ─────────────────────────────

export interface IolitePoisonBolt {
  x: number; y: number;
  vx: number; vy: number;
  lifeMs: number;
  scaledDamage: number;
  tier: number;
  weaponId: string;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

export interface PoisonDebuff {
  remainingDamage: number;
  damagePerTick: number;
  tickTimerMs: number;
  maxHp: number;
  /** Returns true while the target enemy is still alive (hp > 0). */
  isAlive: () => boolean;
  /** Applies one tick of poison damage; returns actual damage dealt. */
  applyTick: (tick: number) => number;
  /** Returns current world position of the poisoned enemy for damage number display. */
  getPos: () => { x: number; y: number };
}

// ── Emerald enemy (blink-striker) ─────────────────────────────

export type EmeraldPhase = 'patrol' | 'charging' | 'blinking' | 'cooldown';

export interface EmeraldEnemy {
  readonly kind: 'emerald';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  phase: EmeraldPhase;
  phaseMs: number;
  patrolTimerMs: number;
  /** Origin of the last blink — fades as a ghost afterimage. */
  ghostX: number; ghostY: number; ghostAlpha: number;
  hasHitPlayer: boolean;
}

// ── Amber enemy (fan-gunner) ───────────────────────────────────

export interface AmberEnemy {
  readonly kind: 'amber';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  missileTimerMs: number;
  patrolTimerMs: number;
}

/** Amber shard — homing projectile fired in a fan spread by amber enemies. */
export interface AmberShard {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
  hasHitPlayer: boolean;
}

// ── Void enemy (slow bruiser) ──────────────────────────────────

export interface VoidEnemy {
  readonly kind: 'void';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  contactCdMs: number;   // ms until next contact damage tick
  pulseMs: number;       // accumulator for aura pulse animation
}

// ── Quartz enemy (crystal orbiter) ────────────────────────────

export interface QuartzEnemy {
  readonly kind: 'quartz';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  spikeTimerMs: number;
  strafeDirFlipMs: number;
  strafeDir: 1 | -1;
}

export interface QuartzSpike {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Ruby enemy (fast patroller) ────────────────────────────────

export interface RubyEnemy {
  readonly kind: 'ruby';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  boltTimerMs: number;
  patrolTimerMs: number;
  consecutiveShots: number;
}

export interface RubyBolt {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Sunstone enemy (orbiter) ───────────────────────────────────

export interface SunstoneEnemy {
  readonly kind: 'sunstone';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  pulseTimerMs: number;
  orbitAngle: number;
}

// ── Citrine enemy (fast patrol + homing bolts) ─────────────────

export interface CitrineEnemy {
  readonly kind: 'citrine';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  boltTimerMs: number;
  patrolTimerMs: number;
}

export interface CitrineBolt {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

// ── Iolite enemy (tanky beam-blaster) ─────────────────────────

export interface IoliteEnemy {
  readonly kind: 'iolite';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  beamTimerMs: number;
  patrolTimerMs: number;
}

// ── Amethyst enemy (crystal-shielder ring-burst) ──────────────

export interface AmethystEnemy {
  readonly kind: 'amethyst';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  shieldHp: number; maxShieldHp: number;
  burstTimerMs: number;
  patrolTimerMs: number;
}

export interface AmethystShard {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Diamond enemy (phase-shifter) ─────────────────────────────

export interface DiamondEnemy {
  readonly kind: 'diamond';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  phaseInvuln: boolean;
  phaseTimerMs: number;
  shardTimerMs: number;
  orbitAngle: number;
}

export interface DiamondShard {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Nullstone enemy (gravity well) ────────────────────────────

export interface NullstoneEnemy {
  readonly kind: 'nullstone';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  isAbsorbing: boolean;
  absorbTimerMs: number;
  absorbCdMs: number;
  tendrilTimerMs: number;
  patrolTimerMs: number;
  pulseMs: number;
}

export interface VoidTendril {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
}

// ── Boss enemy (unique per-100-wave boss) ─────────────────────────

export interface BossEnemy {
  readonly kind: 'boss';
  bossId: number;
  phaseIndex: 0 | 1 | 2;
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  attackTimerMs: number;
  secondaryTimerMs: number;
  orbitAngle: number;
  pulseMs: number;
  shieldHp: number;
  maxShieldHp: number;
  isInvuln: boolean;
  invulnTimerMs: number;
  isAbsorbing: boolean;
  absorbTimerMs: number;
  contactCdMs: number;
  phaseTransitionMs: number;
}

export interface BossProjectile {
  x: number; y: number;
  vx: number; vy: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
  maxLifeMs: number;
  color: string;
  glowColor: string;
  size: number;
  seekStr: number;
}

