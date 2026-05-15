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


// ── Elite enemies (one per tier, polygon-shaped mini-bosses) ─────────────────

/**
 * One tier per elite: quartz=triangle, ruby=square, sunstone=pentagon, citrine=hexagon,
 * iolite=heptagon, amethyst=octagon, diamond=nonagon, nullstone=decagon.
 */
export type EliteTier =
  | 'quartz' | 'ruby' | 'sunstone' | 'citrine'
  | 'iolite' | 'amethyst' | 'diamond' | 'nullstone';

/**
 * Elite enemy — rare polygon mini-boss for each crystal tier.
 * Body is a regular polygon (sides = tier index + 3, starting at 3 for quartz).
 * Reuses existing projectile arrays (quartzSpikes, rubyBolts, etc.) for its attacks.
 */
export interface EliteEnemy {
  readonly kind: 'elite';
  tier: EliteTier;
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  /** Primary attack countdown. */
  attack1TimerMs: number;
  /** Secondary attack countdown (also used for phase cycling by diamond elite). */
  attack2TimerMs: number;
  /** Animation pulse accumulator (ms). */
  pulseMs: number;
  /** Orbit angle — used by diamond elite during its invuln phase. */
  orbitAngle: number;
  /**
   * True while immune to damage.
   * Diamond elite: true while in the fast-orbit invuln phase.
   * Nullstone elite: briefly true during the Event Horizon singularity burst.
   */
  isInvuln: boolean;
  /** Counts down the current invuln-phase duration (ms). */
  invulnTimerMs: number;
  /**
   * Multi-purpose timer:
   * Iolite elite: counts down active gravity-well duration (> 0 = gravity active).
   * Others: unused.
   */
  gravityTimerMs: number;
  /** Patrol direction-change timer. */
  patrolTimerMs: number;
  /** Current shield HP (amethyst elite only). */
  shieldHp: number;
  /** Max shield HP (amethyst elite only). */
  maxShieldHp: number;
  /**
   * Flag for one-shot events:
   * Nullstone elite: true after the Event Horizon burst has fired.
   * Amethyst elite: true while the shield-burst has fired in this shield-break cycle;
   *   reset to false when the shield regenerates fully.
   */
  hasTriggeredLowHp: boolean;
  /**
   * Countdown for a pending second attack salvo (ms).  -1 = inactive.
   * Quartz elite:    fires a second set of 3 spikes when this reaches 0.
   * Amethyst elite:  fires a second ring of 8 shards when this reaches 0.
   */
  pendingSalvoMs: number;
  /** Time at which this elite was spawned (performance.now() ms). Used for timing achievements. */
  spawnTimeMs: number;
}


// ── Player weapon and pickup entity types ────────────────────────────────────
// Re-exported here for backward compatibility — defined in rpg-entity-types.ts.
export type { TeleportParticle, EmeraldPlayerMissile, EmeraldSubMissile, EmeraldSwirlParticle,
  SunstoneMine, SapphireShip, SapphireLaser, AmethystShip, AmethystLaser,
  LuckyMote, LuckyMotePopup } from './rpg-entity-types';
