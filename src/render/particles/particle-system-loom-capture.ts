import type { EquatoriaParticle } from './particle-types';
import { ParticlePool } from './particle-pool';
import type { LoomCapture } from './forge-field-forces';

/**
 * Removes loom-captured particles, returns them to the pool, and emits callbacks.
 * Uses a reusable Set scratch buffer from ParticleSystem to avoid per-frame Set allocation.
 */
export function processLoomCaptures(
  particles: EquatoriaParticle[],
  captures: LoomCapture[],
  pool: ParticlePool,
  onParticleCapturedByLoom: ((fieldId: string, inputTierId: string, mass: number) => void) | undefined,
  capturedParticleScratch: Set<EquatoriaParticle>,
): EquatoriaParticle[] {
  if (captures.length === 0) return particles;

  // Build captured lookup in a reusable set (no new Set allocation).
  capturedParticleScratch.clear();
  for (let i = 0, len = captures.length; i < len; i++) {
    capturedParticleScratch.add(captures[i].particle);
  }

  // Remove loom-captured particles in-place.
  let wp = 0;
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (capturedParticleScratch.has(p)) {
      pool.release(p);
    } else {
      particles[wp++] = p;
    }
  }
  particles.length = wp;

  // Fire callbacks for each captured particle.
  if (onParticleCapturedByLoom) {
    for (let i = 0, len = captures.length; i < len; i++) {
      const c = captures[i];
      onParticleCapturedByLoom(c.fieldId, c.inputTierId as string, c.mass);
    }
  }

  captures.length = 0;
  capturedParticleScratch.clear();
  return particles;
}
