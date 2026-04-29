/**
 * rpg-enemy-types.ts — TypeScript interfaces for all RPG enemy types.
 *
 * Covers all non-starter enemies: Emerald, Amber, Void, Quartz, Ruby,
 * Sunstone, Citrine, Iolite, Amethyst, Diamond, Nullstone, Boss,
 * Fracteryl, Eigenstein, plus weapon/missile/mine/ship entity types
 * that are spawned or used by these enemies or related systems:
 * EmeraldPlayerMissile, EmeraldSubMissile, EmeraldSwirlParticle,
 * SunstoneMine, SapphireShip, SapphireLaser, AmethystShip, AmethystLaser,
 * TeleportParticle, LuckyMote, LuckyMotePopup.
 *
 * Extracted from rpg-types.ts to keep that file under ~300 lines.
 * Starter enemy interfaces (LaserEnemy, SapphireEnemy, SapphireMissile)
 * remain in rpg-types.ts alongside player and weapon-system types.
 */

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
  danmakuLevel: number;
  /** Set when the boss is hit; cleared once the player is teleported back to safe zone. */
  isFiringPaused: boolean;
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

// ── Fracteryl enemy (tier 11) ─────────────────────────────────────

export interface FracterylEnemy {
  readonly kind: 'fracteryl';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  burstTimerMs: number;
  patrolTimerMs: number;
  orbitAngle: number;
  pulseMs: number;
}

export interface FracterylShard {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  hasHitPlayer: boolean;
  lifeMs: number;
  generation: number;
}

// ── Eigenstein enemy (tier 12) ────────────────────────────────────

export interface EigensteinEnemy {
  readonly kind: 'eigenstein';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  beamAngle: number;
  beamTimerMs: number;
  beamChargeMs: number;
  isChargingBeam: boolean;
  patrolTimerMs: number;
  pulseMs: number;
}

export interface EigensteinBeam {
  originX: number; originY: number;
  angle: number;
  atk: number;
  isActive: boolean;
  timerMs: number;
  maxTimerMs: number;
}

// ── Danmaku safe-zone warning ─────────────────────────────────────

export interface DanmakuSafeZone {
  x: number; y: number;
  angle: number;
  width: number;
  timerMs: number;
  maxTimerMs: number;
}


// ── Teleport particle ─────────────────────────────────────────────
export interface TeleportParticle {
  x: number; y: number; vx: number; vy: number;
  alpha: number; color: string;
}

// ── Emerald player missile (heat-seeking) ─────────────────────────

export interface EmeraldPlayerMissile {
  x: number; y: number;
  vx: number; vy: number;
  /** Scaled damage to deal on impact. */
  scaledDamage: number;
  /** Weapon tier — determines how many sub-missiles spawn on explosion. */
  tier: number;
  /** Accumulated ms during which no enemy was within detection range. */
  noTargetMs: number;
  /** True while decelerating to a stop (no enemy could be reached). */
  isFizzling: boolean;
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

// ── Emerald sub-missile (tiny heat-seeker spawned from main missile) ───────────

export interface EmeraldSubMissile {
  x: number; y: number;
  vx: number; vy: number;
  /** Damage dealt on impact (fraction of parent damage). */
  scaledDamage: number;
  /** Phase offset for squiggle wobble (radians). */
  squigglePhase: number;
  /** Accumulated ms alive — drives the fuel/deceleration lifecycle. */
  lifetimeMs: number;
  /** Accumulated ms spent at near-zero speed after fuel runs out (triggers post-stop explosion). */
  stoppedMs: number;
  trailX: Float32Array; trailY: Float32Array;
  trailHead: number; trailCount: number;
}

// ── Emerald swirl particle (visual-only, spawned by sub-missile AOE explosion) ─

export interface EmeraldSwirlParticle {
  x: number; y: number;
  vx: number; vy: number;
  /** Remaining life (ms). */
  lifeMs: number;
}

// ── Sunstone mine ─────────────────────────────────────────────────

export interface SunstoneMine {
  x: number; y: number;
  /** Remaining fuse time in ms. Reaches 0 → explode. */
  fuseMs: number;
  maxFuseMs: number;
  /** Mine HP — when it reaches 0 the mine explodes prematurely. */
  hp: number;
  maxHp: number;
  /** Scaled damage delivered by the explosion. */
  scaledDamage: number;
  /** AOE explosion radius (px). */
  aoeRadius: number;
  /** Proximity trigger radius (px) — explodes when an enemy enters this range. */
  proximityRadius: number;
}

// ── Sapphire companion ship ───────────────────────────────────────

export interface SapphireShip {
  x: number; y: number;
  vx: number; vy: number;
  /** Current orbital angle around target (radians). */
  orbitAngle: number;
  /** ms until next laser fires. */
  fireCooldownMs: number;
  /** Weapon base damage (pre-scaled). */
  baseDamage: number;
  /** Trail for motion visualization. */
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

export interface SapphireLaser {
  x: number; y: number;
  vx: number; vy: number;
  /** Lateral (perpendicular) velocity component for curving effect. */
  lateralVx: number; lateralVy: number;
  /** Per-frame rotation applied to velocity vector. */
  curveDir: number; // +1 or -1
  /** Remaining life (ms). */
  lifeMs: number;
  /** Pre-computed scaled damage. */
  scaledDamage: number;
  /** Trail. */
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

// ── Amethyst companion ship ───────────────────────────────────────

export interface AmethystShip {
  x: number; y: number;
  vx: number; vy: number;
  /** Current orbital angle around target (radians). */
  orbitAngle: number;
  /** ms until next laser fires. */
  fireCooldownMs: number;
  /** Weapon base damage (pre-scaled, then 30× multiplier applied). */
  baseDamage: number;
  /** Trail for motion visualization. */
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

export interface AmethystLaser {
  x: number; y: number;
  /** Center point of the spiral. */
  centerX: number; centerY: number;
  /** Current spiral radius (shrinks over time). */
  radius: number;
  /** Current spiral angle (radians). */
  angle: number;
  /** Remaining life (ms). */
  lifeMs: number;
  /** Pre-computed scaled damage (30× base). */
  scaledDamage: number;
  /** Intended target; laser dissipates when this target dies or is hit. */
  targetEnemy: object | null;
  /** Enemies already pierced this lifetime (avoid repeat hits). */
  piercedEnemies: Set<object>;
  /** Trail. */
  trailX: Float64Array; trailY: Float64Array;
  trailHead: number; trailCount: number;
}

// ── Lucky mote drop (luck mechanic) ───────────────────────────────

/**
 * A lucky mote drop spawned on an enemy's death when the luck check passes.
 * Floats near the death position and magnetizes toward the player when they
 * are close. Collecting it applies a percentage bonus to the matching mote
 * tier in the player's resource pool.
 */
export interface LuckyMote {
  x: number; y: number;
  vx: number; vy: number;
  /** Tier identifier — determines mote color and resource bonus target. */
  tierId: string;
  /** Main fill color (from TierDefinition). */
  color: string;
  /** Glow/border color (from TierDefinition, or golden override). */
  glowColor: string;
  /** Percentage bonus applied to tierId mote total when collected (e.g. 0.5 = +0.5%). */
  bonusPct: number;
  /** Accumulated time for pulse animation (seconds). */
  pulseTimeS: number;
}

/**
 * Floating popup text shown when the player collects a lucky mote.
 * Appears at the player's position and floats in the direction from the
 * player toward where the mote was, then decelerates quickly.
 */
export interface LuckyMotePopup {
  x: number; y: number;
  vx: number; vy: number;
  /** Text to display (e.g. "+0.5%"). */
  text: string;
  /** Text color (tier color). */
  color: string;
  /** Small swatch color (same as tier mote). */
  swatchColor: string;
  /** Remaining life in ms. */
  timerMs: number;
  /** Total duration in ms. */
  maxTimerMs: number;
}
