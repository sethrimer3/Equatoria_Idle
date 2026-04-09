/**
 * Shockwave update logic.
 *
 * Handles expanding shockwaves and applying impulse forces to nearby
 * particles via the spatial grid.
 */

import type { EquatoriaParticle, Shockwave } from './particle-types';
import type { SizeIndex } from '../../data/particles/size-tiers';
import { SHOCKWAVE_DURATION } from '../../data/particles/particle-config';
import { buildSpatialGrid, forEachNearby } from './spatial-grid';

export function getShockwaveScaleForSize(sizeIndex: SizeIndex): number {
  return Math.max(0, sizeIndex) * 0.05;
}

export function updateShockwaves(
  shockwaves: Shockwave[],
  particles: EquatoriaParticle[],
  nowMs: number,
): Shockwave[] {
  // Filter and update shockwave parameters
  let writeIdx = 0;
  for (let i = 0, len = shockwaves.length; i < len; i++) {
    const sw = shockwaves[i];
    const elapsed = nowMs - sw.timestampMs;
    if (elapsed >= SHOCKWAVE_DURATION || sw.maxRadius <= 0) continue;
    const progress = elapsed / SHOCKWAVE_DURATION;
    sw.radius = sw.maxRadius * progress;
    sw.alpha = 0.8 * (1 - elapsed / SHOCKWAVE_DURATION);
    shockwaves[writeIdx++] = sw;
  }
  shockwaves.length = writeIdx;

  // Apply forces to nearby particles
  if (shockwaves.length > 0) {
    const grid = buildSpatialGrid(particles);
    for (let si = 0, slen = shockwaves.length; si < slen; si++) {
      const sw = shockwaves[si];
      const queryRadius = sw.radius + sw.edgeThickness;
      const rMin = sw.radius - sw.edgeThickness;
      const rMinSq = rMin * rMin;
      const rMaxSq = queryRadius * queryRadius;
      const swx = sw.x;
      const swy = sw.y;
      const pushForce = sw.pushForce;

      forEachNearby(grid, swx, swy, queryRadius, (p) => {
        if (p.isMerging) return;
        const dx = p.x - swx;
        const dy = p.y - swy;
        const distSq = dx * dx + dy * dy;
        if (distSq < rMinSq || distSq > rMaxSq) return;
        const dist = Math.sqrt(distSq);
        if (dist < 0.1) return;
        p.vx += (dx / dist) * pushForce;
        p.vy += (dy / dist) * pushForce;
      });
    }
  }

  return shockwaves;
}
