/**
 * rpg-procedural-types.ts — Type interfaces for the 11 procedurally-animated
 * creature types introduced in the Equatoria Idle RPG tab.
 *
 * Each interface follows the canonical pattern:
 *   kind — discriminant string literal
 *   x, y, vx, vy — world position + velocity (px/frame at 60 fps)
 *   hp, maxHp, atk, def — combat stats (wave-scaled at spawn)
 *   animPhase — accumulated time accumulator for animation (seconds)
 *   hitFlashMs — remaining hit-flash overlay duration (ms)
 *   contactCdMs — countdown until contact damage can fire again (ms)
 *
 * PlantProjectile is the only projectile emitted by these creatures (by the
 * PlantTurret type).  All other creatures deal only contact damage.
 *
 * Enemy type IDs (used in wave-definitions.ts spawn lists).
 * All proc creatures first appear in procedural waves (26+); the wave-N+ figure
 * below reflects the procedural-generator threshold, not any pre-defined wave.
 *   'proc_dustwisp'     — Dust Wisp,             wave 26+ (generator threshold: 5)
 *   'proc_ribbonworm'   — Ribbon Worm,            wave 26+ (generator threshold: 7)
 *   'proc_lanternmoth'  — Lantern Moth,           wave 26+ (generator threshold: 8)
 *   'proc_eyestalk'     — Eye Stalk,              wave 26+ (generator threshold: 10)
 *   'proc_jellyfish'    — Floating Jellyfish,     wave 26+ (generator threshold: 12)
 *   'proc_clothghost'   — Cloth Ghost,            wave 26+ (generator threshold: 14)
 *   'proc_plantturret'  — Plant Turret,           wave 26+ (generator threshold: 16)
 *   'proc_gearinsect'   — Gear Insect,            wave 26+ (generator threshold: 19)
 *   'proc_spidercrawler'— Spider Crawler,         wave 26+ (generator threshold: 22)
 *   'proc_moteswarm'    — Magnetic Mote Swarm,    wave 26+ (generator threshold: 26)
 *   'proc_shadowhand'   — Shadow Hand,            wave 32+
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
