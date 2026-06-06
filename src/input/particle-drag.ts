import type { EquatoriaParticle } from '../render/particles/particle-system';
import {
  INTERACTION_RADIUS_FRACTION,
  DRAG_RELEASE_STILLNESS_MS,
  DRAG_RELEASE_SPEED_THRESHOLD,
} from '../data/particles/particle-config';
import { PL_MAX_VELOCITY } from '../data/particles/particle-life-config';

export interface ParticleDragState {
  isDown: boolean;
  canvasX: number;
  canvasY: number;
  prevX: number;
  prevY: number;
  prevTimeMs: number;
  velX: number;
  velY: number;
  /**
   * Particles currently locked to the pointer.
   * Populated on drag-down (O(n) scan, once per press) and cleared on drag-up.
   * Drag-move and drag-up iterate this tiny list instead of all particles.
   */
  lockedParticles: EquatoriaParticle[];
  /** Latest unprocessed pointermove position — flushed once per rAF frame. */
  pendingMoveX: number;
  pendingMoveY: number;
  pendingMoveT: number;
  hasPendingMove: boolean;
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
    lockedParticles: [],
    pendingMoveX: 0,
    pendingMoveY: 0,
    pendingMoveT: 0,
    hasPendingMove: false,
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
  state.hasPendingMove = false;
  state.lockedParticles.length = 0;

  const interactionRadius = Math.min(canvasWidth, canvasHeight) * INTERACTION_RADIUS_FRACTION;
  const radiusSq = interactionRadius * interactionRadius;

  // O(n) scan on press — unavoidable, fires only once per pointer-down event.
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    const dx = p.x - canvasX;
    const dy = p.y - canvasY;
    if (dx * dx + dy * dy <= radiusSq) {
      p.isLockedToPointer = true;
      p.pointerTargetX = canvasX;
      p.pointerTargetY = canvasY;
      state.lockedParticles.push(p);
    }
  }
}

/**
 * Record the latest pointer position from a pointermove event.
 * Does NOT scan or update particles — safe to call at event rate (120 Hz+).
 * Call flushParticleDragMove once per render frame to apply the update.
 */
export function recordParticleDragMove(
  state: ParticleDragState,
  canvasX: number,
  canvasY: number,
  nowMs: number,
): void {
  state.pendingMoveX = canvasX;
  state.pendingMoveY = canvasY;
  state.pendingMoveT = nowMs;
  state.hasPendingMove = true;
}

/**
 * Apply the latest pending pointermove to locked particles.
 * Must be called once per render frame (not per event) from the game loop.
 *
 * Performance strategy: pointermove can fire far more often than rAF (up to
 * 120+ Hz on mobile). By recording the latest position in the event handler
 * and flushing once per frame here, we eliminate repeated O(n) particle scans.
 * This function iterates only the small lockedParticles list (usually 0–10
 * items), not the full particle array.
 */
export function flushParticleDragMove(state: ParticleDragState): void {
  if (!state.hasPendingMove) return;
  state.hasPendingMove = false;

  const canvasX = state.pendingMoveX;
  const canvasY = state.pendingMoveY;
  const nowMs   = state.pendingMoveT;

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

  // Update only the (usually tiny) locked-particle list
  for (let i = 0, len = state.lockedParticles.length; i < len; i++) {
    state.lockedParticles[i].pointerTargetX = canvasX;
    state.lockedParticles[i].pointerTargetY = canvasY;
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
  void particles; // no longer needed: use lockedParticles cache
  state.isDown = false;
  state.hasPendingMove = false;

  const dt = nowMs - state.prevTimeMs;
  const speed = Math.sqrt(state.velX * state.velX + state.velY * state.velY);
  const isStationary = dt > DRAG_RELEASE_STILLNESS_MS || speed < DRAG_RELEASE_SPEED_THRESHOLD;

  const MS_PER_FRAME = 1000 / 60;
  const throwVx = state.velX * MS_PER_FRAME;
  const throwVy = state.velY * MS_PER_FRAME;
  const throwSpeedSq = throwVx * throwVx + throwVy * throwVy;

  // Iterate only the locked set (tiny list) — no full-array scan needed
  for (let i = 0, len = state.lockedParticles.length; i < len; i++) {
    const p = state.lockedParticles[i];
    p.isLockedToPointer = false;
    p.dragReleaseTimeMs = nowMs;
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
    } else if (throwSpeedSq > 0) {
      const throwSpeed = Math.sqrt(throwSpeedSq);
      const capScale = throwSpeed > PL_MAX_VELOCITY ? PL_MAX_VELOCITY / throwSpeed : 1;
      p.vx = throwVx * capScale;
      p.vy = throwVy * capScale;
    }
  }
  state.lockedParticles.length = 0;
}
