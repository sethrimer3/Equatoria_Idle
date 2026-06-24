/**
 * Per-particle physics: gravity, veer, velocity clamping, bounce,
 * edge repulsion, and trail capture.
 *
 * Pure functions — no mutable module-level state.
 */

import type { EquatoriaParticle } from './particle-types';
import {
  SUCTION_GATHER_SPEED,
  VEER_ANGLE_MIN_DEG,
  VEER_ANGLE_MAX_DEG,
  VEER_INTERVAL_MIN_MS,
  VEER_INTERVAL_MAX_MS,
  EDGE_REPULSION_MARGIN,
  EDGE_REPULSION_STRENGTH,
  TRAIL_LENGTH_MEDIUM,
  TRAIL_LENGTH_LARGE,
  TRAIL_CAPTURE_INTERVAL,
  DRAG_RELEASE_FADE_MS,
  DRAG_RELEASE_FREE_MAX_SPEED,
  POINTER_LOCKED_DAMPING,
} from '../../data/particles/particle-config';
import { PL_MAX_VELOCITY } from '../../data/particles/particle-life-config';
import { particleTweaks } from '../../data/particles/particle-tweaks';
import {
  MEDIUM_SIZE_INDEX,
  LARGE_SIZE_INDEX,
} from '../../data/particles/size-tiers';

// ─── Per-particle physics step ──────────────────────────────────

export function updateParticlePhysics(
  p: EquatoriaParticle,
  clampedDelta: number,
  nowMs: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  if (p.isMerging) {
    const dx = p.mergeTargetX - p.x;
    const dy = p.mergeTargetY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      // Direct normalized vector avoids atan2+cos+sin
      const gatherSpeed = SUCTION_GATHER_SPEED * clampedDelta / dist;
      p.vx = dx * gatherSpeed;
      p.vy = dy * gatherSpeed;
    } else {
      p.vx = 0;
      p.vy = 0;
    }
  } else if (p.isCaptured) {
    // Captured particles hold position — skip regular forces
    p.vx = 0;
    p.vy = 0;
  } else if (p.isLockedToPointer) {
    const dx = p.pointerTargetX - p.x;
    const dy = p.pointerTargetY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      // Direct normalized vector avoids atan2+cos+sin
      const force = particleTweaks.pointerLockedForce * p.forceModifier * clampedDelta / dist;
      p.vx += dx * force;
      p.vy += dy * force;
    } else {
      const damping = Math.pow(POINTER_LOCKED_DAMPING, clampedDelta);
      p.vx *= damping;
      p.vy *= damping;
    }
  }

  // Veer
  if (!p.isMerging && !p.isCaptured && !p.isLockedToPointer && nowMs >= p.nextVeerTimeMs) {
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > 0) {
      const veerDeg = VEER_ANGLE_MIN_DEG + Math.random() * (VEER_ANGLE_MAX_DEG - VEER_ANGLE_MIN_DEG);
      const veerAngle = veerDeg * (Math.PI / 180);
      const dir = Math.random() < 0.5 ? -1 : 1;
      const cosT = Math.cos(veerAngle * dir);
      const sinT = Math.sin(veerAngle * dir);
      const newVx = p.vx * cosT - p.vy * sinT;
      const newVy = p.vx * sinT + p.vy * cosT;
      p.vx = newVx;
      p.vy = newVy;
    }
    p.nextVeerTimeMs = nowMs + VEER_INTERVAL_MIN_MS + Math.random() * (VEER_INTERVAL_MAX_MS - VEER_INTERVAL_MIN_MS);
  }

  // Velocity clamping
  // Min: size-based floor to keep particles from stalling entirely.
  // Max: effective max velocity accounts for the drag-boost fade.
  //      While locked to pointer: 4× PL_MAX_VELOCITY.
  //      Within DRAG_RELEASE_FADE_MS after release: linearly interpolates from
  //      4× back to 1× PL_MAX_VELOCITY.
  //      Otherwise: PL_MAX_VELOCITY unchanged.
  const minVel = p.minVelocity;

  let effectiveMaxVel: number;
  if (p.isLockedToPointer) {
    effectiveMaxVel = PL_MAX_VELOCITY * particleTweaks.dragBoostMultiplier;
  } else if (p.dragReleaseTimeMs > 0) {
    const elapsed = nowMs - p.dragReleaseTimeMs;
    if (elapsed < DRAG_RELEASE_FADE_MS) {
      const t = elapsed / DRAG_RELEASE_FADE_MS;
      const boostMax = PL_MAX_VELOCITY * particleTweaks.dragBoostMultiplier;
      effectiveMaxVel = boostMax + t * (DRAG_RELEASE_FREE_MAX_SPEED - boostMax);
    } else {
      effectiveMaxVel = DRAG_RELEASE_FREE_MAX_SPEED;
    }
  } else {
    effectiveMaxVel = PL_MAX_VELOCITY;
  }

  const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  if (speed > effectiveMaxVel) {
    p.vx = (p.vx / speed) * effectiveMaxVel;
    p.vy = (p.vy / speed) * effectiveMaxVel;
  } else if (speed < minVel && speed > 0) {
    p.vx = (p.vx / speed) * minVel;
    p.vy = (p.vy / speed) * minVel;
  } else if (speed === 0) {
    const angle = Math.random() * Math.PI * 2;
    p.vx = Math.cos(angle) * minVel;
    p.vy = Math.sin(angle) * minVel;
  }

  // Position update — skip for captured particles (they hold position)
  if (!p.isCaptured) {
    p.x += p.vx * clampedDelta;
    p.y += p.vy * clampedDelta;
  }

  // Bounce / clamp
  if (!p.isLockedToPointer) {
    const bounce = particleTweaks.particleWallBounce;
    if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * bounce; }
    if (p.x > canvasWidth) { p.x = canvasWidth; p.vx = -Math.abs(p.vx) * bounce; }
    if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * bounce; }
    if (p.y > canvasHeight) { p.y = canvasHeight; p.vy = -Math.abs(p.vy) * bounce; }
  } else {
    p.x = Math.max(0, Math.min(canvasWidth, p.x));
    p.y = Math.max(0, Math.min(canvasHeight, p.y));
  }
}

// ─── Edge repulsion ──────────────────────────────────────────────

export function applyEdgeRepulsion(
  particles: EquatoriaParticle[],
  canvasWidth: number,
  canvasHeight: number,
  clampedDelta: number,
): void {
  const margin = EDGE_REPULSION_MARGIN;
  const strength = EDGE_REPULSION_STRENGTH;
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isMerging || p.isLockedToPointer) continue;
    if (p.x < margin) {
      const t = 1 - p.x / margin;
      p.vx += strength * t * t * clampedDelta;
    }
    const rightDist = canvasWidth - p.x;
    if (rightDist < margin) {
      const t = 1 - rightDist / margin;
      p.vx -= strength * t * t * clampedDelta;
    }
    if (p.y < margin) {
      const t = 1 - p.y / margin;
      p.vy += strength * t * t * clampedDelta;
    }
    const bottomDist = canvasHeight - p.y;
    if (bottomDist < margin) {
      const t = 1 - bottomDist / margin;
      p.vy -= strength * t * t * clampedDelta;
    }
  }
}

// ─── Trail capture (ring buffer) ─────────────────────────────────

export function updateTrails(particles: EquatoriaParticle[]): void {
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.sizeIndex < MEDIUM_SIZE_INDEX) continue;
    p.trailFrameCounter++;
    if (p.trailFrameCounter < TRAIL_CAPTURE_INTERVAL) continue;
    p.trailFrameCounter = 0;

    const maxLen = p.sizeIndex === MEDIUM_SIZE_INDEX
      ? TRAIL_LENGTH_MEDIUM
      : TRAIL_LENGTH_LARGE + (p.sizeIndex - LARGE_SIZE_INDEX) * 2;

    // Clamp to buffer capacity
    const capacity = p.trailX.length;
    const effectiveMax = Math.min(maxLen, capacity);

    // Write at head position
    const writeIdx = p.trailHead;
    p.trailX[writeIdx] = p.x;
    p.trailY[writeIdx] = p.y;
    p.trailHead = (writeIdx + 1) % capacity;
    if (p.trailCount < effectiveMax) p.trailCount++;
  }
}

export function clearTrails(particles: EquatoriaParticle[]): void {
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    p.trailHead = 0;
    p.trailCount = 0;
  }
}

/**
 * Read trail position at logical index `idx` (0 = oldest, count-1 = newest).
 * Returns the position via the out-parameter to avoid allocation.
 */
export function getTrailPosition(
  p: EquatoriaParticle,
  idx: number,
  out: { x: number; y: number },
): void {
  const capacity = p.trailX.length;
  const startIdx = (p.trailHead - p.trailCount + capacity) % capacity;
  const realIdx = (startIdx + idx) % capacity;
  out.x = p.trailX[realIdx];
  out.y = p.trailY[realIdx];
}
