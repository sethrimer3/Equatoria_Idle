/**
 * Per-particle physics: gravity, veer, velocity clamping, bounce,
 * edge repulsion, and trail capture.
 *
 * Pure functions — no mutable module-level state.
 */

import type { EquatoriaParticle } from './particle-types';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import {
  SPAWNER_GRAVITY_STRENGTH,
  SMALL_TIER_GENERATOR_GRAVITY_STRENGTH,
  MEDIUM_TIER_FORGE_GRAVITY_STRENGTH,
  ATTRACTION_STRENGTH,
  MAX_FORGE_ATTRACTION_DISTANCE,
  DISTANCE_SCALE,
  FORCE_SCALE,
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
  DRAG_BOOST_MULTIPLIER,
  DRAG_RELEASE_FADE_MS,
  GENERATOR_ROTATION_STRENGTH,
} from '../../data/particles/particle-config';
import { PL_MAX_VELOCITY } from '../../data/particles/particle-life-config';
import {
  SMALL_SIZE_INDEX,
  MEDIUM_SIZE_INDEX,
  LARGE_SIZE_INDEX,
  EXTRA_LARGE_SIZE_INDEX,
} from '../../data/particles/size-tiers';

// ─── Per-particle physics step ──────────────────────────────────

export function updateParticlePhysics(
  p: EquatoriaParticle,
  clampedDelta: number,
  nowMs: number,
  generators: readonly GeneratorInfo[],
  forgeX: number,
  forgeY: number,
  canvasWidth: number,
  canvasHeight: number,
  isForgeUnlocked: boolean,
): void {
  let isInsideGeneratorField = false;

  if (p.isMerging) {
    const dx = p.mergeTargetX - p.x;
    const dy = p.mergeTargetY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      const angle = Math.atan2(dy, dx);
      const gatherSpeed = SUCTION_GATHER_SPEED * clampedDelta;
      p.vx = Math.cos(angle) * gatherSpeed;
      p.vy = Math.sin(angle) * gatherSpeed;
    } else {
      p.vx = 0;
      p.vy = 0;
    }
  } else if (p.isLockedToPointer) {
    const dx = p.pointerTargetX - p.x;
    const dy = p.pointerTargetY - p.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 1) {
      const force = 3.0 * p.forceModifier;
      const angle = Math.atan2(dy, dx);
      p.vx += Math.cos(angle) * force * clampedDelta;
      p.vy += Math.sin(angle) * force * clampedDelta;
    } else {
      const damping = Math.pow(0.8, clampedDelta);
      p.vx *= damping;
      p.vy *= damping;
    }
  } else {
    // Generator gravity
    if (p.sizeIndex < EXTRA_LARGE_SIZE_INDEX) {
      for (let gi = 0, glen = generators.length; gi < glen; gi++) {
        const gen = generators[gi];
        if (gen.tierId !== p.tierId) continue;
        const dx = gen.x - p.x;
        const dy = gen.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist <= gen.range && dist > 0.5) {
          isInsideGeneratorField = true;
          const force = (SPAWNER_GRAVITY_STRENGTH / (dist * DISTANCE_SCALE)) * p.forceModifier;
          const angle = Math.atan2(dy, dx);
          p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
          p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
          // Rotational force — smooth CW/CCW variation per generator
          const rotPhase = gen.tierIndex * 1.23 + nowMs * 0.00018;
          const rotStrength = Math.sin(rotPhase) * GENERATOR_ROTATION_STRENGTH;
          const perpX = -(dy / dist);
          const perpY = dx / dist;
          p.vx += perpX * rotStrength * FORCE_SCALE * clampedDelta;
          p.vy += perpY * rotStrength * FORCE_SCALE * clampedDelta;
        }
        if (p.sizeIndex === SMALL_SIZE_INDEX && dist > 0.5 && dist <= gen.range * 2) {
          const force = (SMALL_TIER_GENERATOR_GRAVITY_STRENGTH / (dist * DISTANCE_SCALE)) * p.forceModifier;
          const angle = Math.atan2(dy, dx);
          p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
          p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
        }
      }
    }

    // Forge attraction (only when forge is unlocked)
    if (isForgeUnlocked) {
      const fdx = forgeX - p.x;
      const fdy = forgeY - p.y;
      const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
      const isForgeAttractable = p.sizeIndex >= MEDIUM_SIZE_INDEX;
      const forgeRange = p.sizeIndex >= EXTRA_LARGE_SIZE_INDEX ? Infinity : MAX_FORGE_ATTRACTION_DISTANCE;
      if (isForgeAttractable && fdist <= forgeRange && fdist > 1) {
        const force = (ATTRACTION_STRENGTH / (fdist * DISTANCE_SCALE)) * p.forceModifier;
        const angle = Math.atan2(fdy, fdx);
        p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
        p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
      }
      if (p.sizeIndex === MEDIUM_SIZE_INDEX && fdist > 0.5) {
        const force = (MEDIUM_TIER_FORGE_GRAVITY_STRENGTH / (fdist * DISTANCE_SCALE)) * p.forceModifier;
        const angle = Math.atan2(fdy, fdx);
        p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
        p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
      }
    }
  }

  // Veer
  if (!p.isMerging && !p.isLockedToPointer && nowMs >= p.nextVeerTimeMs) {
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
  //      Generator fields use a boosted floor so particles stay active near spawners.
  // Max: effective max velocity accounts for the drag-boost fade.
  //      While locked to pointer: 4× PL_MAX_VELOCITY.
  //      Within DRAG_RELEASE_FADE_MS after release: linearly interpolates from
  //      4× back to 1× PL_MAX_VELOCITY.
  //      Otherwise: PL_MAX_VELOCITY unchanged.
  const genMinVel = p.minVelocity * Math.max(1, p.tierIndex + 1);
  const minVel = isInsideGeneratorField ? genMinVel : p.minVelocity;

  let effectiveMaxVel: number;
  if (p.isLockedToPointer) {
    effectiveMaxVel = PL_MAX_VELOCITY * DRAG_BOOST_MULTIPLIER;
  } else if (p.dragReleaseTimeMs > 0) {
    const elapsed = nowMs - p.dragReleaseTimeMs;
    if (elapsed < DRAG_RELEASE_FADE_MS) {
      const t = elapsed / DRAG_RELEASE_FADE_MS;
      effectiveMaxVel = PL_MAX_VELOCITY * (DRAG_BOOST_MULTIPLIER - t * (DRAG_BOOST_MULTIPLIER - 1));
    } else {
      effectiveMaxVel = PL_MAX_VELOCITY;
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

  // Position update
  p.x += p.vx * clampedDelta;
  p.y += p.vy * clampedDelta;

  // Bounce / clamp
  if (!p.isLockedToPointer) {
    const bounce = 0.8;
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
