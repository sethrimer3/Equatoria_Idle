/**
 * forge-field-forces.ts — Capture-field logic for the equation forge and looms.
 *
 * Each "field" has an inner capture radius and an outer attraction radius.
 * The equation forge field captures eligible particles when isActive (crunch in progress).
 * Loom fields immediately remove captured particles and fire the loom callback.
 */

import type { TierId } from '../../data/tiers';
import type { EquatoriaParticle } from './particle-types';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
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
 * - Particles within `outerRadius` but outside `captureRadius` receive a gentle pull.
 *
 * Eligible particles: sizeIndex >= MEDIUM_SIZE_INDEX, not isMerging, not already isCaptured.
 */
export function applyForgeFieldForces(
  particles: EquatoriaParticle[],
  fields: readonly ForgeFieldInfo[],
  crunchState: ForgeCrunchState,
  newLoomCaptures: LoomCapture[],
  clampedDelta: number,
): void {
  const fieldCount = fields.length;
  if (fieldCount === 0) return;

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isCaptured || p.isMerging || p.sizeIndex < MEDIUM_SIZE_INDEX) continue;

    for (let fi = 0; fi < fieldCount; fi++) {
      const field = fields[fi];
      if (!field.isUnlocked) continue;
      if (field.compatibleTierId !== null && field.compatibleTierId !== p.tierId) continue;

      const dx = field.x - p.x;
      const dy = field.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist <= field.captureRadius) {
        const isForgeField = field.id === 'forge';

        if (isForgeField) {
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

      // Gentle pull toward field when within outerRadius
      if (!field.id.startsWith('forge') && dist <= field.outerRadius && dist > 1) {
        const force = LOOM_ATTRACTION_STRENGTH / (dist + 1);
        p.vx += (dx / dist) * force * clampedDelta;
        p.vy += (dy / dist) * force * clampedDelta;
      }
    }
  }
}
