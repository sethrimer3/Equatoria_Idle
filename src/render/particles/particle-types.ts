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
  /** X position when this particle entered suction-merge state (used for trail rendering). */
  suctionStartX: number;
  /** Y position when this particle entered suction-merge state (used for trail rendering). */
  suctionStartY: number;
  /**
   * Timestamp (ms) when this particle was last released from pointer drag.
   * 0 means not recently dragged.  Used to apply the post-drag speed boost
   * fade and Particle Life inertness fade over DRAG_RELEASE_FADE_MS.
   */
  dragReleaseTimeMs: number;
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
  /**
   * Trail animation data for suction merges (null for forge-crunch / tier-conversion).
   * trailStartXY: flat [x0,y0, x1,y1, …] for up to MERGE_TRAIL_COUNT selected trails.
   * trailCurveAngles: per-trail random curve offset in radians (−10°…+10°).
   */
  trailColor: string;
  trailStartXY: number[] | null;
  trailCurveAngles: number[] | null;
  trailCount: number;
  trailAnimStartMs: number;
  trailDrawDurationMs: number;
  trailEraseDurationMs: number;
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
