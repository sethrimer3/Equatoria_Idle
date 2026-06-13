export const PARTICLE_CANVAS_WIDTH = 320;
/** Scene scale used for non-particle world elements (forge/generators/layout). */
export const SCENE_ZOOM_SCALE = 0.8;
export const BASE_PARTICLE_SIZE = 0.75;
export const SIZE_MULTIPLIER = 2.5;
export const EXTRA_LARGE_SIZE_BONUS = 1.5;
export const MIN_VELOCITY = 0.312;
export const MAX_VELOCITY = 2;
const BASE_FORGE_RADIUS = 28;
export const FORGE_RADIUS = BASE_FORGE_RADIUS * SCENE_ZOOM_SCALE;
export const MAX_FORGE_ATTRACTION_DISTANCE = FORGE_RADIUS * 2 * 0.9 * 1.25;
export const SPAWNER_GRAVITY_RANGE_MULTIPLIER = 4;
export const MAX_PARTICLES_FULL = 2000;
export const PERFORMANCE_THRESHOLD = 1500;
export const MERGE_GATHER_SPEED = 10.0;
export const MERGE_GATHER_THRESHOLD = 2;
export const MERGE_TIMEOUT_MS = 2000;
export const SHOCKWAVE_SPEED = 3.0;
export const SHOCKWAVE_MAX_RADIUS = 53;
export const SHOCKWAVE_DURATION = 500;
export const SHOCKWAVE_PUSH_FORCE = 2.5;
export const SHOCKWAVE_EDGE_THICKNESS = 10;
export const SPAWNER_SIZE = 8.8;
export const SPAWNER_ROTATION_SPEED = 0.01;
export const FORGE_ROTATION_SPEED = 0.01;
export const SPAWNER_GRAVITY_RADIUS = SPAWNER_SIZE * SPAWNER_GRAVITY_RANGE_MULTIPLIER * 1.15 * 1.25;
export const GENERATOR_CONVERSION_RADIUS = 22;
export const GENERATOR_CIRCLE_RADIUS_FRACTION = 0.35;
export const VEER_ANGLE_MIN_DEG = 0.1;
export const VEER_ANGLE_MAX_DEG = 1;
export const VEER_INTERVAL_MIN_MS = 100;
export const VEER_INTERVAL_MAX_MS = 1000;
export const FORGE_VALID_WAIT_TIME_MS = 5000;
export const FORGE_CRUNCH_DURATION_MS = 1000;
export const FORGE_SPIN_UP_DURATION_MS = 4000;
export const FORGE_SPIN_DOWN_DURATION_MS = 3000;
/** Elapsed ms after validParticlesTimerMs is set at which the spin-up animation begins. */
export const FORGE_SPIN_UP_THRESHOLD_MS = FORGE_VALID_WAIT_TIME_MS - FORGE_SPIN_UP_DURATION_MS;
export const CONVERSION_SPREAD_VELOCITY = 3;
export const INTERACTION_RADIUS_FRACTION = 0.1;
export const DRAG_RELEASE_STILLNESS_MS = 120;
export const DRAG_RELEASE_SPEED_THRESHOLD = 0.02;
export const GENERATOR_FADE_IN_DURATION_MS = 1000;

/**
 * Speed multiplier applied to the maximum particle velocity while a particle
 * is locked to the pointer (being dragged).
 */
export const DRAG_BOOST_MULTIPLIER = 4;

/**
 * Duration in milliseconds over which the post-drag speed boost and Particle
 * Life inertness both fade linearly back to their normal values.
 */
export const DRAG_RELEASE_FADE_MS = 5000;
/** Free-flight speed cap (px/frame-unit) that drag-release boost fades to. Must match LOOM_OUTSIDE_MAX_SPEED. */
export const DRAG_RELEASE_FREE_MAX_SPEED = 6.5;
export const TRAIL_FADE = 0.15;
export const MAX_SHOCKWAVES = 5;

// ─── Edge repulsion ──────────────────────────────────────────────
/** Distance (canvas px) from edge where repulsion starts. */
export const EDGE_REPULSION_MARGIN = 12;
/** Maximum repulsion force at the very edge. */
export const EDGE_REPULSION_STRENGTH = 1.5;

// ─── Particle trails ────────────────────────────────────────────
/** Maximum trail length (number of stored positions) for medium particles. */
export const TRAIL_LENGTH_MEDIUM = 4;
/** Maximum trail length for large+ particles. */
export const TRAIL_LENGTH_LARGE = 10;
/** How many frames between trail position captures. */
export const TRAIL_CAPTURE_INTERVAL = 2;

// ─── Suction merge (global count → generator pull) ──────────────
/**
 * Speed at which particles travel toward their generator during a suction merge.
 * Units: canvas pixels per frame-unit (clampedDelta ≈ 1 at 60 fps).
 */
export const SUCTION_GATHER_SPEED = 30.0;
/** Safety timeout — suction merge forcibly completes after this many ms. */
export const SUCTION_TIMEOUT_MS = 2000;
/**
 * Width multiplier for suction trail lines relative to the particle's rendered size.
 * Applied as: lineWidth = max(1, particle.size * SUCTION_TRAIL_WIDTH_SCALE).
 */
export const SUCTION_TRAIL_WIDTH_SCALE = 0.7;

// ─── Merge trail animation ───────────────────────────────────────
/** Number of particles (of the 100 that merge) that display an animated trail. */
export const MERGE_TRAIL_COUNT = 20;
/** Duration of the draw phase (trail grows from particle toward generator). */
export const MERGE_TRAIL_DRAW_DURATION_MS = 150;
/** Duration of the erase phase (trail disappears from tail toward tip). */
export const MERGE_TRAIL_ERASE_DURATION_MS = 150;
/** Maximum random curve angle for suction merge trails, in degrees. Trails curve randomly between ±this value. */
export const MERGE_TRAIL_CURVE_ANGLE_DEG = 10;

// ─── Merge ray rendering (absorption effect) ─────────────────────
/** Max absorption rays sampled per active merge in crisp/high-DPI mode. */
export const MERGE_RAY_COUNT_CRISP = 4;
/** Max absorption rays sampled per active merge in pixelated mode. */
export const MERGE_RAY_COUNT_PIXELATED = 6;
/** Global per-frame ctx.stroke() budget for merge rays in crisp/high-DPI mode. */
export const MERGE_RAY_BUDGET_CRISP = 28;
/** Global per-frame ctx.stroke() budget for merge rays in pixelated mode. */
export const MERGE_RAY_BUDGET_PIXELATED = 64;
/** Canvas-space hit radius for detecting a tap on a generator (px). */
export const GENERATOR_HIT_RADIUS_PX = 24;

// ─── Forge tap radius ────────────────────────────────────────────
/**
 * Multiplier applied to MAX_FORGE_ATTRACTION_DISTANCE for touch/mobile input.
 * Makes the forge significantly easier to hit with a finger without changing
 * precision for mouse users (who use × 1.0).
 */
export const FORGE_TOUCH_TAP_MULTIPLIER = 1.5;

// ─── Pointer-locked particle physics ────────────────────────────
/** Force strength applied toward the pointer target while a particle is locked to the pointer. */
export const POINTER_LOCKED_FORCE = 3.0;
/**
 * Per-step velocity decay factor while a particle is locked to the pointer and stationary.
 * Applied as Math.pow(POINTER_LOCKED_DAMPING, clampedDelta).
 */
export const POINTER_LOCKED_DAMPING = 0.8;

// ─── Wall bounce ─────────────────────────────────────────────────
/** Velocity coefficient retained after bouncing off a canvas edge (0–1). */
export const PARTICLE_WALL_BOUNCE = 0.8;

// ─── Frame-interval constants for ParticleSystem ────────────────
/** Number of render frames between suction-merge eligibility checks. */
export const SUCTION_MERGE_INTERVAL_FRAMES = 10;
/** Number of render frames between particle-count limit enforcement passes. */
export const PARTICLE_LIMIT_INTERVAL_FRAMES = 30;
/** Maximum frame-delta ratio cap, preventing spiral-of-death on slow frames. */
export const MAX_FRAME_DELTA_RATIO = 3;
/** Minimum frame-delta ratio floor, preventing effectively-zero time steps. */
export const MIN_FRAME_DELTA_RATIO = 0.01;

// ─── Euler fluid dynamics (REMOVED) ──────────────────────────────
// The Euler inter-particle fluid system has been replaced by the
// Particle Life interaction model.  See particle-life-config.ts and
// interaction-matrix.ts for the new constants.
//
// Legacy constants kept below ONLY for backward-compatibility in case
// any external code still imports them.  They are no longer used by
// the particle system.
/** @deprecated Replaced by Particle Life system. */
export const EULER_FLUID_ENABLED = false;
/** @deprecated Replaced by Particle Life system. */
export const EULER_INFLUENCE_RADIUS = 40;
/** @deprecated Replaced by Particle Life system. */
export const EULER_BASE_STRENGTH = 0.8;
/** @deprecated Replaced by Particle Life system. */
export const EULER_TIER_SCALE = 0.25;
/** @deprecated Replaced by Particle Life system. */
export const EULER_MAX_FORCE = 2.0;
/** @deprecated Replaced by Particle Life system. */
export const EULER_CORE_RADIUS = 3.0;
