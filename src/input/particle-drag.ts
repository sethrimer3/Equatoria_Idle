import type { EquatoriaParticle } from '../render/particles/particle-system';
import {
  INTERACTION_RADIUS_FRACTION,
  DRAG_RELEASE_STILLNESS_MS,
  DRAG_RELEASE_SPEED_THRESHOLD,
} from '../data/particles/particle-config';

export interface ParticleDragState {
  isDown: boolean;
  canvasX: number;
  canvasY: number;
  prevX: number;
  prevY: number;
  prevTimeMs: number;
  velX: number;
  velY: number;
}

export function createParticleDragState(): ParticleDragState {
  return {
    isDown: false,
    canvasX: 0,
    canvasY: 0,
    prevX: 0,
    prevY: 0,
    prevTimeMs: 0,
    velX: 0,
    velY: 0,
  };
}

export function handleParticleDragDown(
  state: ParticleDragState,
  canvasX: number,
  canvasY: number,
  nowMs: number,
  particles: EquatoriaParticle[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  state.isDown = true;
  state.canvasX = canvasX;
  state.canvasY = canvasY;
  state.prevX = canvasX;
  state.prevY = canvasY;
  state.prevTimeMs = nowMs;
  state.velX = 0;
  state.velY = 0;

  const interactionRadius = Math.min(canvasWidth, canvasHeight) * INTERACTION_RADIUS_FRACTION;
  const radiusSq = interactionRadius * interactionRadius;

  for (const p of particles) {
    const dx = p.x - canvasX;
    const dy = p.y - canvasY;
    if (dx * dx + dy * dy <= radiusSq) {
      p.isLockedToPointer = true;
      p.pointerTargetX = canvasX;
      p.pointerTargetY = canvasY;
    }
  }
}

export function handleParticleDragMove(
  state: ParticleDragState,
  canvasX: number,
  canvasY: number,
  nowMs: number,
  particles: EquatoriaParticle[],
): void {
  const dt = nowMs - state.prevTimeMs;
  if (dt > 0) {
    state.velX = (canvasX - state.prevX) / dt;
    state.velY = (canvasY - state.prevY) / dt;
  }
  state.prevX = state.canvasX;
  state.prevY = state.canvasY;
  state.prevTimeMs = nowMs;
  state.canvasX = canvasX;
  state.canvasY = canvasY;

  for (const p of particles) {
    if (p.isLockedToPointer) {
      p.pointerTargetX = canvasX;
      p.pointerTargetY = canvasY;
    }
  }
}

export function handleParticleDragUp(
  state: ParticleDragState,
  canvasX: number,
  canvasY: number,
  nowMs: number,
  particles: EquatoriaParticle[],
): void {
  void canvasX;
  void canvasY;
  state.isDown = false;
  const dt = nowMs - state.prevTimeMs;
  const speed = Math.sqrt(state.velX * state.velX + state.velY * state.velY);
  const isStationary = dt > DRAG_RELEASE_STILLNESS_MS || speed < DRAG_RELEASE_SPEED_THRESHOLD;

  for (const p of particles) {
    if (p.isLockedToPointer) {
      p.isLockedToPointer = false;
      if (isStationary) {
        const pSpeed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
        const minVel = p.minVelocity;
        if (pSpeed > 0) {
          p.vx = (p.vx / pSpeed) * minVel;
          p.vy = (p.vy / pSpeed) * minVel;
        } else {
          const angle = Math.random() * Math.PI * 2;
          p.vx = Math.cos(angle) * minVel;
          p.vy = Math.sin(angle) * minVel;
        }
      }
    }
  }
}
