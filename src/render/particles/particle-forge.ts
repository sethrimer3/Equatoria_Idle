/**
 * Forge crunch integration for the particle system.
 *
 * Bridges between the authoritative forge-logic (sim layer) and the
 * visual particle layer without allocating temporary arrays each frame.
 */

import type { TierId } from '../../data/tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';
import type { EquatoriaParticle } from './particle-types';
import { ParticlePool, initParticle } from './particle-pool';
import {
  MAX_PARTICLES_FULL,
  FORGE_RADIUS,
  CONVERSION_SPREAD_VELOCITY,
} from '../../data/particles/particle-config';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import { checkForgeCrunch, startForgeCrunch, getCrunchOutput } from '../../sim/forge/forge-logic';
import type { ForgeParticleInfo } from '../../sim/forge/forge-logic';

/**
 * Reusable scratch array for forge-crunch particle infos.
 * We create new info objects (required since ForgeParticleInfo has
 * readonly properties) but reuse the outer array to reduce GC churn.
 */
let _scratchInfos: ForgeParticleInfo[] = [];

export function checkAndStartForgeCrunch(
  particles: EquatoriaParticle[],
  crunchState: ForgeCrunchState,
  forgeX: number,
  forgeY: number,
  nowMs: number,
): void {
  const len = particles.length;
  // Resize scratch array if needed
  if (_scratchInfos.length < len) {
    _scratchInfos.length = len;
  }
  // Build info objects
  for (let i = 0; i < len; i++) {
    const p = particles[i];
    _scratchInfos[i] = {
      tierId: p.tierId,
      sizeIndex: p.sizeIndex,
      x: p.x,
      y: p.y,
      isMerging: p.isMerging,
    };
  }
  // Truncate scratch array to exact particle count so checkForgeCrunch
  // iterates only the valid portion (it uses .filter which reads .length).
  _scratchInfos.length = len;

  const result = checkForgeCrunch(crunchState, _scratchInfos, forgeX, forgeY, FORGE_RADIUS, nowMs);
  if (result) {
    const resultSet = new Set(result);
    for (let i = 0; i < len; i++) {
      if (resultSet.has(_scratchInfos[i])) {
        const p = particles[i];
        p.isMerging = true;
        p.mergeTargetX = forgeX;
        p.mergeTargetY = forgeY;
        p.isForgeCrunchParticle = true;
      }
    }
    startForgeCrunch(crunchState, nowMs);
  }
}

export function completeForgeCrunch(
  particles: EquatoriaParticle[],
  pool: ParticlePool,
  spawnerRotations: Map<TierId, number>,
  forgeX: number,
  forgeY: number,
  nowMs: number,
): EquatoriaParticle[] {

  const toRemove = new Set<EquatoriaParticle>();

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (!p.isForgeCrunchParticle) continue;

    const output = getCrunchOutput(p.tierId, p.sizeIndex);
    toRemove.add(p);
    if (!output) continue;

    if (particles.length - toRemove.size + 1 < MAX_PARTICLES_FULL) {
      const np = pool.acquire();
      initParticle(np, output.outputTierId, output.outputSizeIndex as SizeIndex, forgeX, forgeY, nowMs);
      np.vx = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY;
      np.vy = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY;
      particles.push(np);
      if (!spawnerRotations.has(output.outputTierId)) {
        spawnerRotations.set(output.outputTierId, Math.random() * Math.PI * 2);
      }
    }
  }

  if (toRemove.size > 0) {
    let wp = 0;
    for (let i = 0, len = particles.length; i < len; i++) {
      const p = particles[i];
      if (toRemove.has(p)) pool.release(p);
      else particles[wp++] = p;
    }
    particles.length = wp;
  }

  return particles;
}
