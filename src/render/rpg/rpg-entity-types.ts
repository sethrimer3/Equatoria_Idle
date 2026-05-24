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
  /** Visual opacity from enemy proximity: 0.3 far away, 1 near a target. */
  proximityAlpha: number;
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
  /** Visual opacity from enemy proximity: 0.3 far away, 1 near a target. */
  proximityAlpha: number;
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
  /** Elapsed time since this mote spawned (ms). Used for timing achievements. */
  ageMs: number;
  /** True if this mote was dropped by an elite enemy. */
  fromElite: boolean;
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
