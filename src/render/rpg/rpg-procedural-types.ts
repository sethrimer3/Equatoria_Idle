/**
 * rpg-procedural-types.ts — Type interfaces for the procedurally-animated
 * creature types introduced in the Equatoria Idle RPG tab.
 *
 * Each interface follows the canonical pattern:
 *   kind — discriminant string literal
 *   x, y, vx, vy — world position + velocity (px/frame at 60 fps)
 *   hp, maxHp, atk, def — combat stats (wave-scaled at spawn)
 *   animPhase — accumulated time accumulator for animation (seconds)
 *   hitFlashMs — remaining hit-flash overlay duration (ms)
 *   contactCdMs — countdown until contact damage can fire again (ms)
 */

// ── Dust Wisp ──────────────────────────────────────────────────────────────────
/** Gentle drifting mote with pulsing glow rings; harmless-looking but dangerous. */
export interface DustWispEnemy {
  kind: 'proc_dustwisp';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  patrolTimerMs: number;
}

// ── Ribbon Worm ────────────────────────────────────────────────────────────────
/** Segmented worm body that wiggles as it pursues the player. */
export interface RibbonWormEnemy {
  kind: 'proc_ribbonworm';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Segment center X positions; index 0 is the head (= enemy x). */
  segX: Float64Array;
  /** Segment center Y positions; index 0 is the head (= enemy y). */
  segY: Float64Array;
}

// ── Lantern Moth ───────────────────────────────────────────────────────────────
/** Floaty enemy with animated wing flaps; moves in a weaving sine-wave path. */
export interface LanternMothEnemy {
  kind: 'proc_lanternmoth';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Wing flap phase accumulator (seconds). */
  flapPhase: number;
}

// ── Eye Stalk ──────────────────────────────────────────────────────────────────
/** Round blob body with a spring-swaying eye stalk that tracks the player. */
export interface EyeStalkEnemy {
  kind: 'proc_eyestalk';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Stalk sway oscillation phase (seconds). */
  stalkPhase: number;
  /** Angle the pupil is currently facing (radians; tracks player). */
  eyeAngle: number;
}

// ── Floating Jellyfish ─────────────────────────────────────────────────────────
/** Transparent bell that pulses open and closed; tentacles trail behind. */
export interface JellyfishEnemy {
  kind: 'proc_jellyfish';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Bell expansion/contraction phase (seconds). */
  bellPhase: number;
  movementState: 'drift' | 'compress' | 'pulse' | 'coast' | 'recover';
  stateTimerMs: number;
  facingRad: number;
  targetX: number; targetY: number;
  wanderPhase: number;
  bellSize: number;
  bellTint: string;
  pulseCadenceMs: number;
  tailCount: number;
  segmentsPerTail: number;
  segLength: number;
  segX: Float64Array; segY: Float64Array;
  segPrevX: Float64Array; segPrevY: Float64Array;
}

// ── Cloth Ghost ────────────────────────────────────────────────────────────────
/** Translucent cloth sheet that flutters and ripples as it glides toward the player. */
export interface ClothGhostEnemy {
  kind: 'proc_clothghost';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Flutter ripple phase (seconds). */
  flutterPhase: number;
}

// ── Plant Turret ───────────────────────────────────────────────────────────────
/** Stationary root-anchored plant that sways and periodically fires spore projectiles. */
export interface PlantTurretEnemy {
  kind: 'proc_plantturret';
  x: number; y: number;
  vx: number; vy: number;  // effectively unused; turret stays anchored
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Stem sway phase (seconds). */
  stemPhase: number;
  /** Countdown until next projectile fires (ms). */
  fireTimerMs: number;
  /** Anchored root position X (set at spawn; turret returns here if displaced). */
  rootX: number;
  /** Anchored root position Y. */
  rootY: number;
}

// ── Gear Insect ────────────────────────────────────────────────────────────────
/** Mechanical bug with a spinning central gear and oscillating insect legs. */
export interface GearInsectEnemy {
  kind: 'proc_gearinsect';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Current rotation angle of the central gear (radians). */
  gearAngle: number;
  /** Leg animation phase (seconds). */
  legPhase: number;
}

// ── Spider Crawler ─────────────────────────────────────────────────────────────
/** Eight-legged spider with an alternating-pair walking cycle. */
export interface SpiderCrawlerEnemy {
  kind: 'proc_spidercrawler';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Leg walk cycle phase (seconds). */
  legPhase: number;
}

// ── Magnetic Mote Swarm ────────────────────────────────────────────────────────
/** Cluster of orbiting charged motes that slowly spiral toward the player. */
export interface MoteSwarmEnemy {
  kind: 'proc_moteswarm';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Angular speed accumulator for the swarm cluster rotation (radians). */
  swarmAngle: number;
  /** Individual orbit angle for each mote in the swarm (radians). */
  moteAngles: Float64Array;
}

// ── Shadow Hand ────────────────────────────────────────────────────────────────
/** Disembodied dark hand that slowly reaches toward the player before grasping. */
export interface ShadowHandEnemy {
  kind: 'proc_shadowhand';
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  /** Current phase of the grasp cycle ('idle' → 'reaching' → 'grasping' → 'retracting'). */
  graspPhase: number;
  /** 0–1 fraction along the reach extension (for drawing finger position). */
  reachFraction: number;
}

// ── Fish enemies ───────────────────────────────────────────────────────────────
interface BaseFishEnemy {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;
  swimAngle: number;
  turnPhase: number;
  /** A* path state for terrain-aware navigation around Caustics topology. */
  pathState: import('./terrain/rpg-pathfinding').RpgPathState;
  /** Accumulated ms during which the fish has had near-zero movement speed. */
  stuckMs: number;
  /** Remaining ms of post-stuck recovery period (boosted terrain avoidance). */
  stuckRecoveryMs: number;
}

export interface SandFishEnemy extends BaseFishEnemy {
  kind: 'proc_sandfish';
  lungeTimerMs: number;
}

export interface QuartzFishEnemy extends BaseFishEnemy {
  kind: 'proc_quartzfish';
  shieldHp: number;
  shieldBroken: boolean;
}

export interface RubyFishEnemy extends BaseFishEnemy {
  kind: 'proc_rubyfish';
  dashState: 'idle' | 'windup' | 'dash' | 'recovery';
  dashTimerMs: number;
  dashVx: number;
  dashVy: number;
}

export interface SunstoneFishEnemy extends BaseFishEnemy {
  kind: 'proc_sunstonefish';
  mineTimerMs: number;
}

export interface EmeraldFishEnemy extends BaseFishEnemy {
  kind: 'proc_emeraldfish';
  isMini: boolean;
  splitDone: boolean;
}

export interface SapphireFishEnemy extends BaseFishEnemy {
  kind: 'proc_sapphirefish';
  boltTimerMs: number;
}

export interface AmethystFishEnemy extends BaseFishEnemy {
  kind: 'proc_amethystfish';
  teleportCdMs: number;
}

export interface DiamondFishEnemy extends BaseFishEnemy {
  kind: 'proc_diamondfish';
  armorActive: boolean;
  armorTimerMs: number;
}

// ── Schooling type alias ───────────────────────────────────────────────────────

/**
 * Minimal interface a fish entity must satisfy to participate in boids
 * schooling.  All eight BaseFishEnemy subtypes satisfy this shape.
 * Used as the read-only shared school list passed into schoolSwimStep.
 */
export interface SchoolableFish {
  x: number; y: number;
  vx: number; vy: number;
  swimAngle: number;
  turnPhase: number;
  animPhase: number;
  /** Only set on EmeraldFishEnemy; true for the smaller split sub-fish. */
  isMini?: boolean;
}

// ── Plant Projectile ───────────────────────────────────────────────────────────
/** Spore pod fired by the PlantTurret; dealt once on first hit then expires. */
export interface PlantProjectile {
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number;
  lifeMs: number;
  hasHitPlayer: boolean;
}

// ── Fish projectiles / visuals ─────────────────────────────────────────────────
export interface FishMine {
  x: number; y: number;
  vx: number; vy: number;
  armedMs: number;
  lifeMs: number;
  atk: number;
}

export interface FishSpike {
  x: number; y: number;
  vx: number; vy: number;
  lifeMs: number;
  atk: number;
  hasHit: boolean;
}

export interface FishBolt {
  x: number; y: number;
  vx: number; vy: number;
  lifeMs: number;
  atk: number;
  hasHit: boolean;
}

export interface FishDecoy {
  x: number; y: number;
  lifeMs: number;
  swimAngle: number;
  animPhase: number;
}
