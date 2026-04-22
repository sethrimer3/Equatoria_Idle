/**
 * Euler fluid dynamics — inter-particle force computation.
 *
 * Higher-tier particles act as point sources that push lower-tier
 * particles away (radial repulsion) with a strength proportional to
 * the tier difference.  A 30 % tangential (swirl) component is added
 * so that displaced particles spiral away rather than being pushed
 * straight out, matching the aesthetic of EulerFluidEffect.js from
 * the reference implementation.
 *
 * This module is purely physics — it does not read or write any
 * authoritative simulation state and produces no visual output.
 *
 * Algorithm complexity: O(n) via spatial grid — a 2-D hash grid with
 * cell size equal to EULER_INFLUENCE_RADIUS is built once per call and
 * used for all neighbour look-ups.
 */

import {
  EULER_INFLUENCE_RADIUS,
  EULER_BASE_STRENGTH,
  EULER_TIER_SCALE,
  EULER_MAX_FORCE,
} from '../../data/particles/particle-config';
import { gridKey } from './spatial-grid';

// ─── Minimal particle interface ──────────────────────────────────
// Using a structural interface avoids a circular import with
// particle-system.ts.  EquatoriaParticle satisfies this type.

interface EulerParticle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  tierIndex: number;
  isMerging: boolean;
  isLockedToPointer: boolean;
}

// ─── Spatial grid ────────────────────────────────────────────────

/** Cell size matches the influence radius so each look-up touches at
 *  most a 3 × 3 neighbourhood of cells. */
const EULER_CELL_SIZE = EULER_INFLUENCE_RADIUS;

interface EulerGrid {
  cells: Map<number, EulerParticle[]>;
}

function buildEulerGrid(particles: EulerParticle[]): EulerGrid {
  const cells = new Map<number, EulerParticle[]>();
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isMerging || p.isLockedToPointer) continue;
    const cx = Math.floor(p.x / EULER_CELL_SIZE);
    const cy = Math.floor(p.y / EULER_CELL_SIZE);
    const key = gridKey(cx, cy);
    let cell = cells.get(key);
    if (!cell) { cell = []; cells.set(key, cell); }
    cell.push(p);
  }
  return { cells };
}

// Pre-computed grid search bounds
const INV_CELL_SIZE = 1 / EULER_CELL_SIZE;
const R2 = EULER_INFLUENCE_RADIUS * EULER_INFLUENCE_RADIUS;

// ─── Force application ───────────────────────────────────────────

/**
 * For each particle, compute the velocity contribution from all
 * higher-tier nearby particles. Higher-tier particles act as point
 * sources that push lower-tier particles away (radial repulsion)
 * with a strength proportional to the tier difference.
 *
 * Uses a spatial grid for O(n) neighbour lookups instead of O(n²).
 * Neighbour iteration is inlined (no result-array allocation) for
 * maximum performance in the hot path.
 *
 * Rules:
 *  - Same-tier particles do NOT affect each other.
 *  - Merging particles are immune (they are converging intentionally).
 *  - Pointer-locked (dragged) particles are immune.
 *  - Force is one-directional: only high-tier → low-tier.
 *
 * @param particles   Active particle array (EquatoriaParticle[] works).
 * @param clampedDelta  Frame delta ratio (deltaMs / (1000/60)), clamped.
 */
export function applyEulerFluidForces(
  particles: EulerParticle[],
  clampedDelta: number,
): void {
  const grid = buildEulerGrid(particles);

  for (let bi = 0, blen = particles.length; bi < blen; bi++) {
    const b = particles[bi];
    if (b.isMerging || b.isLockedToPointer) continue;

    let totalFx = 0;
    let totalFy = 0;

    // Inline neighbour query to avoid allocating a result array
    const bx = b.x;
    const by = b.y;
    const cx0 = Math.floor((bx - EULER_INFLUENCE_RADIUS) * INV_CELL_SIZE);
    const cx1 = Math.floor((bx + EULER_INFLUENCE_RADIUS) * INV_CELL_SIZE);
    const cy0 = Math.floor((by - EULER_INFLUENCE_RADIUS) * INV_CELL_SIZE);
    const cy1 = Math.floor((by + EULER_INFLUENCE_RADIUS) * INV_CELL_SIZE);

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = grid.cells.get(gridKey(cx, cy));
        if (!cell) continue;
        for (let ci = 0, clen = cell.length; ci < clen; ci++) {
          const a = cell[ci];
          if (a === b) continue;
          // Only higher-tier particles push lower-tier ones.
          if (a.tierIndex <= b.tierIndex) continue;

          const dx = bx - a.x;
          const dy = by - a.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > R2 || distSq < 0.000001) continue;

          const dist = Math.sqrt(distSq);

          const tierDiff = a.tierIndex - b.tierIndex;
          const strength = EULER_BASE_STRENGTH + EULER_TIER_SCALE * tierDiff;

          // Quadratic falloff: t = 1 at the source, 0 at the influence
          // boundary.  Squaring t concentrates the effect near the source
          // and ensures the force reaches exactly zero at EULER_INFLUENCE_RADIUS,
          // preventing particles from accumulating in a ring at the edge.
          const t = 1.0 - dist / EULER_INFLUENCE_RADIUS;
          if (t <= 0) continue;
          const force = strength * t * t;

          const nx = dx / dist;
          const ny = dy / dist;

          // Radial (repulsive) component
          totalFx += nx * force;
          totalFy += ny * force;

          // Tangential (swirl) component — 30 % of radial force
          totalFx += (-ny) * force * 0.3;
          totalFy += nx * force * 0.3;
        }
      }
    }

    if (totalFx === 0 && totalFy === 0) continue;

    // Clamp total Euler force contribution to EULER_MAX_FORCE.
    const totalForceSq = totalFx * totalFx + totalFy * totalFy;
    if (totalForceSq > EULER_MAX_FORCE * EULER_MAX_FORCE) {
      const scale = EULER_MAX_FORCE / Math.sqrt(totalForceSq);
      totalFx *= scale;
      totalFy *= scale;
    }

    b.vx += totalFx * clampedDelta;
    b.vy += totalFy * clampedDelta;
  }
}
