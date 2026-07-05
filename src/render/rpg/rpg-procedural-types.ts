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
/** Segmented worm body that coils, telegraphs, then lunges at the player. */
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
  /** Per-segment contact cooldown so body segments can hit independently. */
  segContactCdMs: Float64Array;
  /** Behaviour state: pursue → coil (telegraph) → lunge (dash) → recover. */
  wormState: 'pursue' | 'coil' | 'lunge' | 'recover';
  /** Remaining ms in the current wormState. */
  stateTimerMs: number;
  /** Locked lunge direction, set when leaving the coil state. */
  lungeDirX: number;
  lungeDirY: number;
  /** Coil curl amount 0-1, eased up during coil and eased back down after. */
  coilAmount: number;
}

// ── Lantern Moth ───────────────────────────────────────────────────────────────
/** Floaty insect-like enemy with a charge-and-pulse light-lure attack. */
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
  /** Per-wing phase offsets so left/right flap asymmetrically. */
  wingPhaseOffsetL: number;
  wingPhaseOffsetR: number;
  /** Hover bob phase (seconds), independent of flap timing. */
  hoverPhase: number;
  /** Lantern-lure behaviour state. */
  lureState: 'idle' | 'charge' | 'pulse';
  /** Remaining ms in the current lureState. */
  lureTimerMs: number;
  /** 0-1 charge-up glow strength, eased toward 1 while charging. */
  chargeGlow: number;
}

// ── Eye Stalk ──────────────────────────────────────────────────────────────────
/** Round blob body with a spring-swaying eye stalk that charges and fires a gaze beam. */
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
  /** Spring-lag stalk tip offset (world px), trails behind the body. */
  stalkLagX: number;
  stalkLagY: number;
  /** Gaze-attack behaviour state. */
  gazeState: 'idle' | 'charge' | 'fire' | 'blink';
  /** Remaining ms in the current gazeState. */
  gazeTimerMs: number;
  /** Locked beam direction angle, set when charge begins. */
  beamAngle: number;
  /** 0 = eyes open, 1 = fully closed (blink). */
  blinkAmount: number;
  /** True once the current fire window has already dealt damage. */
  beamHasHit: boolean;
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
/** Translucent cloth sheet that flutters, phases through terrain, and unfurls a wrap telegraph. */
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
  /** Corner-lag offsets for the four sheet corners (world px, trailing behind body motion). */
  cornerLagX: Float64Array;
  cornerLagY: Float64Array;
  /** Ghost behaviour state: solid → intangible (phase-drift) → wrap (telegraph+attack) → solid. */
  ghostState: 'solid' | 'intangible' | 'wrap';
  /** Remaining ms in the current ghostState. */
  stateTimerMs: number;
  /** 0-1 expanding wrap-arc radius fraction, used for the wrap telegraph draw. */
  wrapFraction: number;
  /** True once the current wrap has already dealt damage. */
  wrapHasHit: boolean;
}

// ── Plant Turret ───────────────────────────────────────────────────────────────
/** Stationary root-anchored plant that bends toward the player, blooms, and fires spore variants. */
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
  /** Eased stem-bend offset toward the player (world px), smoothed each frame. */
  bendX: number;
  bendY: number;
  /** Bud behaviour state: closed → opening (telegraph) → open (fire) → recoil. */
  budState: 'closed' | 'opening' | 'open' | 'recoil';
  /** Remaining ms in the current budState. */
  budTimerMs: number;
  /** Number of shots fired so far; cycles regular/burst/arc spore variety. */
  shotIndex: number;
}

// ── Gear Insect ────────────────────────────────────────────────────────────────
/** Mechanical bug that scuttles in bursts, then charges and ricochets off walls. */
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
  /** Behaviour state: scuttle (burst move) → pause → charge (telegraph) → ricochet. */
  moveState: 'scuttle' | 'pause' | 'charge' | 'ricochet';
  /** Remaining ms in the current moveState. */
  stateTimerMs: number;
  /** Locked ricochet direction, set when leaving the charge state. */
  chargeDirX: number;
  chargeDirY: number;
}

// ── Spider Crawler ─────────────────────────────────────────────────────────────
/** Eight-legged spider with IK-style stepping that stalks, sidesteps, pounces, and recovers. */
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
  /** Behaviour state: stalk → sidestep → crouch (telegraph) → pounce → recover. */
  spiderState: 'stalk' | 'sidestep' | 'crouch' | 'pounce' | 'recover';
  /** Remaining ms in the current spiderState. */
  stateTimerMs: number;
  /** Sidestep direction sign (+1/-1), flipped each sidestep entry. */
  sidestepDir: number;
  /** 0-1 crouch/anticipation squash amount, eased up before a pounce. */
  crouchAmount: number;
  /** Planted foot world positions (4 feet: front-left/right, back-left/right). */
  footX: Float64Array;
  footY: Float64Array;
  /** Countdown until the web-cone hazard may fire again (ms). */
  webCdMs: number;
  /** Remaining ms the web-cone telegraph/hazard is visible/active. */
  webActiveMs: number;
  /** Locked web-cone aim angle, set when the web is triggered. */
  webAngle: number;
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
