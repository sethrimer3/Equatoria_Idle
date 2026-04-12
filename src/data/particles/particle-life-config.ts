/**
 * Particle Life simulation constants.
 *
 * These parameters control the Particle Life force model that replaced
 * the previous Euler fluid-dynamics system.  Tuning this file directly
 * changes how motes interact with each other visually.
 *
 * Conceptual force curve for two non-inert motes within interactionRadius:
 *
 *   distance < protectedRadius:
 *     Always strong repulsion (prevents singularity collapse).
 *
 *   protectedRadius <= distance < interactionRadius:
 *     Force = interactionMatrix[a][b] * envelope(distance)
 *     where envelope tapers smoothly from 1 to 0 at the outer radius.
 *
 *   distance >= interactionRadius:
 *     No force.
 */

// ─── Radii ───────────────────────────────────────────────────────

/** Maximum distance (canvas px) at which motes influence each other. */
export const PL_INTERACTION_RADIUS = 50;

/**
 * Short-range protective repulsion radius (canvas px).
 * Any pair closer than this always experiences strong outward push
 * regardless of interaction-matrix sign.
 */
export const PL_PROTECTED_RADIUS = 4.0;

// ─── Force strengths ─────────────────────────────────────────────

/**
 * Multiplier for the matrix-controlled mid-range force.
 * Higher values make the interaction matrix entries feel stronger.
 */
export const PL_MATRIX_FORCE_SCALE = 0.6;

/**
 * Strength of the protective short-range repulsion.
 * This acts independently of the matrix — always pushes apart.
 */
export const PL_PROTECTED_REPULSION_STRENGTH = 1.8;

// ─── Velocity integration ────────────────────────────────────────

/**
 * Velocity damping factor applied each frame.
 * At 60 fps, effective per-second retention ≈ 0.992^60 ≈ 61.9 %.
 * Low enough that thrown clusters coast visibly for several seconds
 * while Particle Life forces continue shaping their internal structure.
 */
export const PL_VELOCITY_DAMPING = 0.992;

/**
 * Maximum velocity magnitude (canvas px per frame-unit).
 * Raised to allow thrown particles to travel at meaningful throw speed
 * without being immediately clamped back to near-zero values.
 */
export const PL_MAX_VELOCITY = 8.0;

// ─── Size-force bias ─────────────────────────────────────────────

/**
 * Global toggle: when true, larger motes exert / receive stronger
 * forces proportional to sqrt(sizePixels).
 * When false, all sizes behave identically (sizeFactor = 1).
 */
export const PL_ENABLE_SIZE_FORCE_BIAS_DEFAULT = true;

// ─── Performance ─────────────────────────────────────────────────

/**
 * Spatial-grid cell size for Particle Life neighbour lookups.
 * Should be ≥ PL_INTERACTION_RADIUS so each lookup touches at most
 * a 3×3 neighbourhood.
 */
export const PL_GRID_CELL_SIZE = PL_INTERACTION_RADIUS;
