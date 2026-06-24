/**
 * Capture-only field checks for the equation forge and looms.
 *
 * Normal equation-render motes intentionally receive no loom or forge
 * attraction, steering, containment, or attraction-specific velocity changes.
 * Fields only capture eligible motes that enter their inner capture radius.
 */

import type { TierId } from '../../data/tiers';
import { getSizeSmallEquivalent, MEDIUM_SIZE_INDEX } from '../../data/particles/size-tiers';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import type { EquatoriaParticle } from './particle-types';

export interface ForgeFieldInfo {
  id: string;
  x: number;
  y: number;
  /** Inner radius used for capture-only collision checks. */
  captureRadius: number;
  /** Visual influence radius; runtime mote movement does not use it. */
  outerRadius: number;
  /** null means all tiers (used by the equation forge). */
  compatibleTierId: TierId | null;
  isUnlocked: boolean;
}

export interface LoomCapture {
  particle: EquatoriaParticle;
  fieldId: string;
  inputTierId: TierId;
  mass: number;
}

// Pre-computed per-field capture radii squared — expanded on demand, never shrunk.
// Avoids recomputing field.captureRadius² for every (particle × field) pair per tick.
const _captureRadiiSq: number[] = [];

function didCrossCaptureRadius(
  p: EquatoriaParticle,
  field: ForgeFieldInfo,
  captureRadiusSq: number,
  clampedDelta: number,
): boolean {
  const previousX = p.x - p.vx * clampedDelta;
  const previousY = p.y - p.vy * clampedDelta;
  const stepX = p.x - previousX;
  const stepY = p.y - previousY;
  const stepLenSq = stepX * stepX + stepY * stepY;
  if (stepLenSq <= 0.0001) return false;

  const toFieldX = field.x - previousX;
  const toFieldY = field.y - previousY;
  const closestT = Math.max(0, Math.min(1, (toFieldX * stepX + toFieldY * stepY) / stepLenSq));
  const closestX = previousX + stepX * closestT;
  const closestY = previousY + stepY * closestT;
  const closestDx = field.x - closestX;
  const closestDy = field.y - closestY;
  return closestDx * closestDx + closestDy * closestDy <= captureRadiusSq;
}

export function applyCaptureFields(
  particles: EquatoriaParticle[],
  fields: readonly ForgeFieldInfo[],
  crunchState: ForgeCrunchState,
  newLoomCaptures: LoomCapture[],
  clampedDelta: number,
): void {
  // Pre-compute captureRadius² per field once rather than per (particle × field).
  const fieldCount = fields.length;
  while (_captureRadiiSq.length < fieldCount) _captureRadiiSq.push(0);
  for (let fi = 0; fi < fieldCount; fi++) {
    _captureRadiiSq[fi] = fields[fi].captureRadius * fields[fi].captureRadius;
  }

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isCaptured || p.isMerging || p.sizeIndex < MEDIUM_SIZE_INDEX) continue;

    for (let fi = 0; fi < fieldCount; fi++) {
      const field = fields[fi];
      if (!field.isUnlocked || field.captureRadius <= 0) continue;
      if (field.compatibleTierId !== null && field.compatibleTierId !== p.tierId) continue;

      const dx = field.x - p.x;
      const dy = field.y - p.y;
      const captureRadiusSq = _captureRadiiSq[fi];
      if (dx * dx + dy * dy > captureRadiusSq
        && !didCrossCaptureRadius(p, field, captureRadiusSq, clampedDelta)) {
        continue;
      }

      if (field.id === 'forge') {
        if (crunchState.isActive) {
          p.isCaptured = true;
          p.capturedById = field.id;
          p.vx = 0;
          p.vy = 0;
        }
      } else {
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
  }
}
