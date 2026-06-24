/**
 * forge-drag-detection.ts — Integrates physical particle drag with the forge
 * mote-conversion state machine.
 *
 * Extracted as a pure function (no canvas required) so it can be tested
 * without a full render context.
 *
 * Called once per frame from app-game-loop.ts, after flushParticleDragMove.
 */

import type { ForgeCrunchState } from '../sim/forge/forge-state';
import {
  startForgeMoteConversion,
  cancelForgeMoteConversion,
  commitForgeMoteConversion,
  resetForgeMoteConversion,
  isForgeMoteConversionReady,
} from '../sim/forge/forge-mote-conversion';
import type { ResourceState } from '../sim/resources/resource-state';
import type { ParticleDragState } from '../input/particle-drag';
import type { EquatoriaParticle } from '../render/particles/particle-types';

// Push-away speed applied to rejected 1×1 motes (canvas units per frame at 60 fps).
export const FORGE_REJECT_PUSH_SPEED = 8;

/**
 * Tick the forge drag / mote-conversion state machine for one frame.
 *
 * Responsibilities:
 *  - When a dragged particle enters the forge capture radius and the forge is
 *    idle:
 *      • If the mote is 1×1 (SizeIndex 0) → push it away and release from drag.
 *      • Otherwise → start a pending forge conversion for that exact particle.
 *  - While a conversion is pending:
 *      • Commit it at the crunch moment (even if the pointer is no longer down).
 *      • Cancel it if the particle leaves the forge radius before the crunch.
 *  - After a cancel animation frame → reset state to idle.
 *
 * @param forge           The forge state (moteConversionState lives here).
 * @param resources       Game resources (moteTotals) — updated on commit.
 * @param dragState       Pointer drag state with the locked-particle list.
 * @param forgeX          Canvas X of the forge centre.
 * @param forgeY          Canvas Y of the forge centre.
 * @param captureRadius   Radius within which a particle is "inside" the forge.
 * @param nowMs           Current wall-clock timestamp in ms.
 * @param onParticleCommitted  Called with the committed particleId so the
 *                             particle system can remove the exact particle.
 */
export function tickForgeDrag(
  forge: ForgeCrunchState,
  resources: ResourceState,
  dragState: ParticleDragState,
  forgeX: number,
  forgeY: number,
  captureRadius: number,
  nowMs: number,
  onParticleCommitted: (particleId: number) => void,
): void {
  const captureRadiusSq = captureRadius * captureRadius;
  const state = forge.moteConversionState;

  if (state === 'forgePending') {
    // Commit takes priority over cancel: check crunch moment first.
    if (isForgeMoteConversionReady(forge, nowMs)) {
      const idToRemove = forge.moteConversionParticleId;
      commitForgeMoteConversion(forge, resources, forge.forgeEfficiency);
      if (idToRemove !== null) onParticleCommitted(idToRemove);
      return;
    }

    // Check if the pending particle is still inside the forge.
    let pendingInForge = false;
    if (dragState.isDown) {
      const pendingId = forge.moteConversionParticleId;
      for (let i = 0, len = dragState.lockedParticles.length; i < len; i++) {
        const p = dragState.lockedParticles[i];
        if (p.particleId === pendingId) {
          const dx = p.x - forgeX;
          const dy = p.y - forgeY;
          pendingInForge = dx * dx + dy * dy <= captureRadiusSq;
          break;
        }
      }
    }

    if (!pendingInForge) {
      cancelForgeMoteConversion(forge, nowMs);
    }
    return;
  }

  if (state === 'forgeCancelling') {
    // No cancel animation at present — reset to idle immediately.
    resetForgeMoteConversion(forge);
    return;
  }

  // state === 'idle': look for a dragged particle entering the forge.
  if (!dragState.isDown || dragState.lockedParticles.length === 0) return;

  for (let i = 0, len = dragState.lockedParticles.length; i < len; i++) {
    const p = dragState.lockedParticles[i] as EquatoriaParticle;
    const dx = p.x - forgeX;
    const dy = p.y - forgeY;
    if (dx * dx + dy * dy > captureRadiusSq) continue;

    if (p.sizeIndex < 1) {
      // 1×1 mote — reject with a push-away impulse and release from drag.
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      p.vx = (dx / dist) * FORGE_REJECT_PUSH_SPEED;
      p.vy = (dy / dist) * FORGE_REJECT_PUSH_SPEED;
      p.isLockedToPointer = false;
    } else {
      startForgeMoteConversion(forge, p.tierId, p.sizeIndex, p.particleId, nowMs);
    }
    break; // Only one particle can enter per frame.
  }
}
