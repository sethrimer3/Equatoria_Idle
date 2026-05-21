/**
 * forge-field-forces.ts — Capture-field logic for the equation forge and looms.
 *
 * Each "field" has an inner capture radius and an outer attraction radius.
 * The equation forge field captures eligible particles when isActive (crunch in progress).
 * During the warm-up phase (isWarmingUp), eligible particles within the outer radius
 * receive a gravitational pull that intensifies as the warm-up progresses.
 * Loom fields immediately remove captured particles and fire the loom callback.
 */

import type { TierId } from '../../data/tiers';
import type { EquatoriaParticle } from './particle-types';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import {
  FORGE_TOTAL_WARMUP_MS,
  FORGE_GRAVITY_BASE,
  FORGE_GRAVITY_MAX,
} from '../../sim/forge/forge-state';
import { getSizeSmallEquivalent } from '../../data/particles/size-tiers';
import { MEDIUM_SIZE_INDEX } from '../../data/particles/size-tiers';

// ─── Types ───────────────────────────────────────────────────────

/** A capture/attraction field at a given canvas position. */
export interface ForgeFieldInfo {
  /** Unique identifier: 'forge' or 'loom_<tierId>'. */
  id: string;
  x: number;
  y: number;
  /** Inner radius — particles inside are captured. */
  captureRadius: number;
  /** Outer radius — particles inside receive a gentle attraction pull. */
  outerRadius: number;
  /**
   * Which particle tier this field attracts/captures.
   * null means all tiers (used by the equation forge).
   */
  compatibleTierId: TierId | null;
  isUnlocked: boolean;
}

export interface LoomCapture {
  particle: EquatoriaParticle;
  fieldId: string;
  inputTierId: TierId;
  mass: number;
}

// ─── Constants ───────────────────────────────────────────────────

/** Weak attraction strength toward a loom field (canvas px/s per unit). */
const LOOM_ATTRACTION_STRENGTH = 1.2;

// ─── Implementation ──────────────────────────────────────────────

/**
 * Apply capture-field forces to all eligible particles.
 *
 * - Particles within `captureRadius` of a field are captured (isCaptured=true).
 *   - Forge captures only happen during an active crunch (crunchState.isActive).
 *   - Loom captures are added to `newLoomCaptures` for post-loop processing.
 * - During forge warm-up, particles within `outerRadius` receive a gravitational
 *   pull that scales with warmup progress (FORGE_GRAVITY_BASE → FORGE_GRAVITY_MAX).
 * - Particles within `outerRadius` but outside `captureRadius` of loom fields
 *   receive a gentle pull.
 *
 * Eligible particles: sizeIndex >= MEDIUM_SIZE_INDEX, not isMerging, not already isCaptured.
 *
 * Performance: squared-distance comparisons are used to avoid Math.sqrt for the
 * majority of particles that are outside capture/outer range.
 */
export function applyForgeFieldForces(
  particles: EquatoriaParticle[],
  fields: readonly ForgeFieldInfo[],
  crunchState: ForgeCrunchState,
  newLoomCaptures: LoomCapture[],
  clampedDelta: number,
  nowMs: number,
): void {
  const fieldCount = fields.length;
  if (fieldCount === 0) return;

  // Pre-compute per-field squared radii and forge-check outside the particle loop
  // so these values are not recomputed for every particle.
  const captureRadSq = new Float64Array(fieldCount);
  const outerRadSq   = new Float64Array(fieldCount);
  const isForgeField = new Uint8Array(fieldCount);
  for (let fi = 0; fi < fieldCount; fi++) {
    const field = fields[fi];
    captureRadSq[fi] = field.captureRadius * field.captureRadius;
    outerRadSq[fi]   = field.outerRadius   * field.outerRadius;
    isForgeField[fi] = field.id === 'forge' ? 1 : 0;
  }

  // Pre-compute forge warmup gravity strength (same for all particles this step)
  let forgeWarmupGravity = 0;
  if (crunchState.isWarmingUp && crunchState.warmupStartMs !== null) {
    const warmupProgress = Math.min(1, (nowMs - crunchState.warmupStartMs) / FORGE_TOTAL_WARMUP_MS);
    forgeWarmupGravity = FORGE_GRAVITY_BASE + (FORGE_GRAVITY_MAX - FORGE_GRAVITY_BASE) * warmupProgress;
  }

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isCaptured || p.isMerging || p.sizeIndex < MEDIUM_SIZE_INDEX) continue;

    for (let fi = 0; fi < fieldCount; fi++) {
      const field = fields[fi];
      if (!field.isUnlocked) continue;
      if (field.compatibleTierId !== null && field.compatibleTierId !== p.tierId) continue;

      const dx = field.x - p.x;
      const dy = field.y - p.y;
      const distSq = dx * dx + dy * dy;

      if (distSq <= captureRadSq[fi]) {
        if (isForgeField[fi]) {
          // Forge capture only during active crunch
          if (crunchState.isActive) {
            p.isCaptured = true;
            p.capturedById = field.id;
            p.vx = 0;
            p.vy = 0;
          }
        } else {
          // Loom: immediate capture
          p.isCaptured = true;
          p.capturedById = field.id;
          p.vx = 0;
          p.vy = 0;
          newLoomCaptures.push({
            particle: p,
            fieldId: field.id,
            inputTierId: p.tierId,
            mass: getSizeSmallEquivalent(p.sizeIndex),
          });
        }
        break;
      }

      if (distSq <= outerRadSq[fi] && distSq > 1) {
        if (isForgeField[fi]) {
          // Forge warm-up: pull eligible particles toward the forge
          if (forgeWarmupGravity > 0) {
            const dist = Math.sqrt(distSq);
            const force = forgeWarmupGravity / (dist + 1);
            p.vx += (dx / dist) * force * clampedDelta;
            p.vy += (dy / dist) * force * clampedDelta;
          }
        } else {
          // Loom: gentle pull
          const dist = Math.sqrt(distSq);
          const force = LOOM_ATTRACTION_STRENGTH / (dist + 1);
          p.vx += (dx / dist) * force * clampedDelta;
          p.vy += (dy / dist) * force * clampedDelta;
        }
      }
    }
  }
}
