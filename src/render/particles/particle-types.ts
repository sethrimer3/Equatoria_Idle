/**
 * Core type definitions for the particle system.
 *
 * All particle-related interfaces and type aliases live here to avoid
 * circular imports between the physics, merge, rendering and
 * orchestration modules.
 */

import type { TierId } from '../../data/tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';

// ─── Particle ────────────────────────────────────────────────────

export interface EquatoriaParticle {
  isActive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tierId: TierId;
  sizeIndex: SizeIndex;
  colorString: string;
  glowColorString: string | null;
  size: number;
  minVelocity: number;
  maxVelocity: number;
  forceModifier: number;
  tierIndex: number;
  isMerging: boolean;
  mergeTargetX: number;
  mergeTargetY: number;
  isForgeCrunchParticle: boolean;
  isLockedToPointer: boolean;
  pointerTargetX: number;
  pointerTargetY: number;
  nextVeerTimeMs: number;
  /** Ring-buffer trail positions for medium+ particles. */
  trailX: Float64Array;
  trailY: Float64Array;
  /** Current write head in the ring buffer. */
  trailHead: number;
  /** Number of valid entries in the ring buffer. */
  trailCount: number;
  /** Frame counter for trail capture throttling. */
  trailFrameCounter: number;
  /** Whether this particle is in a procedural seek-merge group. */
  isProceduralSeeking: boolean;
  /** Target centroid X for procedural seek-merge. */
  proceduralTargetX: number;
  /** Target centroid Y for procedural seek-merge. */
  proceduralTargetY: number;
}

/** Backward-compatible alias. */
export type Particle = EquatoriaParticle;

// ─── Merge ───────────────────────────────────────────────────────

export interface ActiveMerge {
  particles: EquatoriaParticle[];
  targetX: number;
  targetY: number;
  outputTierId: TierId;
  outputSizeIndex: SizeIndex;
  startTimeMs: number;
  isTierConversion: boolean;
  conversionCount: number;
}

/** Tracks a group of same-size particles that are seeking each other out. */
export interface ProceduralMerge {
  particles: EquatoriaParticle[];
  sizeIndex: SizeIndex;
  tierId: TierId;
  startTimeMs: number;
  centroidX: number;
  centroidY: number;
}

// ─── Shockwave ───────────────────────────────────────────────────

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  maxRadius: number;
  edgeThickness: number;
  pushForce: number;
  alpha: number;
  timestampMs: number;
  color: string;
}

// ─── Render options ──────────────────────────────────────────────

export interface ParticleRenderOptions {
  enableGlow: boolean;
  enableTrails: boolean;
}
