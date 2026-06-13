/**
 * particle-tweaks.ts — Mutable runtime overrides for particle physics constants.
 *
 * These values mirror a subset of the compile-time constants in
 * particle-config.ts and particle-life-config.ts.  They start at the
 * same defaults but can be changed at runtime (e.g. from the developer
 * mode section in the settings panel) without reloading the page.
 *
 * Physics hot-paths read from `particleTweaks` instead of the frozen
 * module constants so that live edits take effect immediately.
 */

export interface ParticleTweaks {
  /** Base minimum speed for newly spawned particles (canvas px/frame-unit). */
  minVelocity: number;
  /** Force applied toward the pointer while a particle is dragged (drag speed). */
  pointerLockedForce: number;
  /** Max-velocity multiplier while a particle is locked to the pointer. */
  dragBoostMultiplier: number;
  /** Velocity coefficient retained after bouncing off a canvas wall (0–1). */
  particleWallBounce: number;
  /** Particle Life maximum velocity (canvas px/frame-unit). */
  plMaxVelocity: number;
  /** Particle Life per-step velocity damping factor. */
  plVelocityDamping: number;
  /** Particle Life interaction-matrix force scale. */
  plMatrixForceScale: number;
  /** Particle Life short-range protective repulsion strength. */
  plProtectedRepulsionStrength: number;
}

export const PARTICLE_TWEAKS_DEFAULTS: Readonly<ParticleTweaks> = {
  minVelocity: 0.312,
  pointerLockedForce: 3.0,
  dragBoostMultiplier: 4,
  particleWallBounce: 0.8,
  plMaxVelocity: 1.5,
  plVelocityDamping: 0.992,
  plMatrixForceScale: 0.10,
  plProtectedRepulsionStrength: 1.4,
};

/** Mutable runtime config — write to this object to change physics live. */
export const particleTweaks: ParticleTweaks = { ...PARTICLE_TWEAKS_DEFAULTS };

/** Reset all tweaks to their default values. */
export function resetParticleTweaks(): void {
  Object.assign(particleTweaks, PARTICLE_TWEAKS_DEFAULTS);
}
