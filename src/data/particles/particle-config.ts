export const PARTICLE_CANVAS_WIDTH = 320;
/** Scene scale used for non-particle world elements (forge/generators/layout). */
export const SCENE_ZOOM_SCALE = 0.8;
export const BASE_PARTICLE_SIZE = 0.75;
export const SIZE_MULTIPLIER = 2.5;
export const EXTRA_LARGE_SIZE_BONUS = 1.5;
export const MIN_VELOCITY = 0.312;
export const MAX_VELOCITY = 2;
export const ATTRACTION_STRENGTH = 1.5;
const BASE_FORGE_RADIUS = 28;
export const FORGE_RADIUS = BASE_FORGE_RADIUS * SCENE_ZOOM_SCALE;
export const MAX_FORGE_ATTRACTION_DISTANCE = FORGE_RADIUS * 2 * 0.9 * 1.25;
export const DISTANCE_SCALE = 0.01;
export const FORCE_SCALE = 0.01;
export const SPAWNER_GRAVITY_STRENGTH = 1.5;
export const SPAWNER_GRAVITY_RANGE_MULTIPLIER = 4;
export const SMALL_TIER_GENERATOR_GRAVITY_STRENGTH = 0.24;
export const MEDIUM_TIER_FORGE_GRAVITY_STRENGTH = 0.15;
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
export const MOUSE_ATTRACTION_STRENGTH = 3.0;
export const DRAG_RELEASE_STILLNESS_MS = 120;
export const DRAG_RELEASE_SPEED_THRESHOLD = 0.02;
export const GENERATOR_FADE_IN_DURATION_MS = 1000;
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
 * Higher value = faster / more "instantaneous" feel.
 */
export const SUCTION_GATHER_SPEED = 30.0;
/** Safety timeout — suction merge forcibly completes after this many ms. */
export const SUCTION_TIMEOUT_MS = 2000;

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
