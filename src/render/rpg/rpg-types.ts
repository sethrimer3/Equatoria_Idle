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
  /** HP regenerated per second, expressed as a percentage of maxHp (e.g. 1 = 1 %/s). */
  regen: number;
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
  /** Primary fill color. When sourceColor is also set, this is the gradient end (target/enemy) color. */
  color: string;
  timerMs: number;
  /**
   * Optional source (weapon/attacker) color for gradient fills.
   * When present, the damage number renders a gradient from sourceColor (top/start)
   * to color (bottom/end), making each hit visually reflect both who hit and what was hit.
   */
  sourceColor?: string;
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
  /** Elapsed lifetime in ms — missile self-destructs after MISSILE_MAX_LIFETIME_MS. */
  lifetimeMs: number;
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
  /** Per-link polygon side counts (3-7), generated once when weapon spawns. */
  linkSides: Uint8Array;
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

export type SwordComboPhase = 'idle' | 'swing' | 'combo_window' | 'spin_combo';

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
  /** True when the current (or next) swing moves from right to left. Alternates each swing. */
  swingIsRightToLeft: boolean;
  /** Number of consecutive crescent slashes completed in the current combo (0–4). */
  comboCount: number;
  /** Current spin angle during 'spin_combo' phase (radians, 0 → 6π). */
  spinComboAngle: number;
  /** How many full-rotation damage ticks have been applied during the combo so far. */
  spinComboDamageTicks: number;
}

// ── Iolite poison bolt interfaces ─────────────────────────────

export interface IolitePoisonBolt {
  x: number; y: number;
  vx: number; vy: number;
  lifeMs: number;
  scaledDamage: number;
  tier: number;
  weaponId: string;
  /** Extra damage added per poison tick from Iolite in a crafted weapon (0 for standard weapons). */
  bonusDmgPerTick: number;
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

// ── Targeting types ───────────────────────────────────────────────
// Shared by rpg-render.ts (targeting helpers) and rpg-weapon-systems.ts.

import type {
  EmeraldEnemy, AmberEnemy, AmberShard, VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard, DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril, FracterylEnemy, FracterylShard, EigensteinEnemy,
  BossEnemy, EliteEnemy,
} from './rpg-enemy-types';
import type { AlivenParticle } from './rpg-aliven-types';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
} from './rpg-procedural-types';
import type {
  PolyominoEnemy, FissilePolyominoEnemy, RefractorPolyominoEnemy,
} from './polyomino-enemy-types';

export type TargetKind = 'laser' | 'sapphire' | 'missile' | 'emerald' | 'amber' | 'ambershard' | 'void'
  | 'quartz' | 'quartzspike' | 'ruby' | 'rubybolt' | 'sunstone' | 'citrine' | 'citrinebolt'
  | 'iolite' | 'amethyst' | 'amethystshard' | 'diamond' | 'diamondshard' | 'nullstone' | 'voidtendril'
  | 'fracteryl' | 'fracterylshard' | 'eigenstein'
  | 'verdure_polyomino' | 'verdure_polyomino_fissile' | 'verdure_polyomino_refractor'
  | 'elite'
  | 'aliven_particle'
  | 'boss'
  | 'proc_dustwisp' | 'proc_ribbonworm' | 'proc_lanternmoth' | 'proc_eyestalk'
  | 'proc_jellyfish' | 'proc_clothghost' | 'proc_plantturret' | 'proc_gearinsect'
  | 'proc_spidercrawler' | 'proc_moteswarm' | 'proc_shadowhand'
  | 'proc_sandfish' | 'proc_quartzfish' | 'proc_rubyfish' | 'proc_sunstonefish'
  | 'proc_emeraldfish' | 'proc_sapphirefish' | 'proc_amethystfish' | 'proc_diamondfish'
  | 'proc_plantproj'
  | 'verdure_plant'
  | 'binary_ring'
  | 'nadir_cube_point';

export interface ClosestTarget {
  kind: TargetKind;
  x: number; y: number;
  distSq: number;
  laser?: LaserEnemy;
  sapphire?: SapphireEnemy;
  missile?: SapphireMissile;
  emerald?: EmeraldEnemy;
  amber?: AmberEnemy;
  ambershard?: AmberShard;
  void?: VoidEnemy;
  quartz?: QuartzEnemy;
  quartzspike?: QuartzSpike;
  ruby?: RubyEnemy;
  rubybolt?: RubyBolt;
  sunstone?: SunstoneEnemy;
  citrine?: CitrineEnemy;
  citrinebolt?: CitrineBolt;
  iolite?: IoliteEnemy;
  amethyst?: AmethystEnemy;
  amethystshard?: AmethystShard;
  diamond?: DiamondEnemy;
  diamondshard?: DiamondShard;
  nullstone?: NullstoneEnemy;
  voidtendril?: VoidTendril;
  fracteryl?: FracterylEnemy;
  fracterylshard?: FracterylShard;
  eigenstein?: EigensteinEnemy;
  polyomino?: PolyominoEnemy;
  fissilePolyomino?: FissilePolyominoEnemy;
  refractorPolyomino?: RefractorPolyominoEnemy;
  elite?: EliteEnemy;
  /** AlivenParticle individual particle (aliven_particle targets). */
  alivenParticle?: AlivenParticle;
  /** Parent group of the targeted AlivenParticle. */
  alivenGroup?: import('./rpg-aliven-types').AlivenParticleGroup;
  boss?: BossEnemy;
  // ── Procedural creature targets ──────────────────────────────────────────
  dustWisp?: DustWispEnemy;
  ribbonWorm?: RibbonWormEnemy;
  lanternMoth?: LanternMothEnemy;
  eyeStalk?: EyeStalkEnemy;
  jellyfish?: JellyfishEnemy;
  clothGhost?: ClothGhostEnemy;
  plantTurret?: PlantTurretEnemy;
  gearInsect?: GearInsectEnemy;
  spiderCrawler?: SpiderCrawlerEnemy;
  moteSwarm?: MoteSwarmEnemy;
  shadowHand?: ShadowHandEnemy;
  sandFish?: SandFishEnemy;
  quartzFish?: QuartzFishEnemy;
  rubyFish?: RubyFishEnemy;
  sunstoneFish?: SunstoneFishEnemy;
  emeraldFish?: EmeraldFishEnemy;
  sapphireFish?: SapphireFishEnemy;
  amethystFish?: AmethystFishEnemy;
  diamondFish?: DiamondFishEnemy;
  plantProj?: PlantProjectile;
  /** Verdure zone environmental plant (targetable hazard). */
  verdurePlant?: import('./terrain/rpg-verdure-growth').VerdurePlant;
  binaryRing?: import('./rpg-binary-ring-encounter').BinaryRingEnemy;
  nadirCubePoint?: import('./nadir-cube-point-types').NadirCubePointEnemy;
}

// ── Enemy entity types ─────────────────────────────────────────────
// All enemy-entity interfaces (EmeraldEnemy → LuckyMotePopup) have been
// moved to rpg-enemy-types.ts.
