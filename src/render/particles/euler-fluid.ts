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
  EULER_CORE_RADIUS,
} from '../../data/particles/particle-config';

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

/** Interleave two 16-bit signed integers into a 32-bit numeric key.
 *  Works for grid coordinates within ±32767, which covers any
 *  reasonable canvas size. Avoids string allocation in the hot path. */
function gridKey(cx: number, cy: number): number {
  return ((cx & 0xFFFF) << 16) | (cy & 0xFFFF);
}

interface EulerGrid {
  cells: Map<number, EulerParticle[]>;
}

function buildEulerGrid(particles: EulerParticle[]): EulerGrid {
  const cells = new Map<number, EulerParticle[]>();
  for (const p of particles) {
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

function queryEulerNearby(grid: EulerGrid, x: number, y: number): EulerParticle[] {
  const result: EulerParticle[] = [];
  const cx0 = Math.floor((x - EULER_INFLUENCE_RADIUS) / EULER_CELL_SIZE);
  const cx1 = Math.floor((x + EULER_INFLUENCE_RADIUS) / EULER_CELL_SIZE);
  const cy0 = Math.floor((y - EULER_INFLUENCE_RADIUS) / EULER_CELL_SIZE);
  const cy1 = Math.floor((y + EULER_INFLUENCE_RADIUS) / EULER_CELL_SIZE);
  const r2 = EULER_INFLUENCE_RADIUS * EULER_INFLUENCE_RADIUS;
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const cell = grid.cells.get(gridKey(cx, cy));
      if (!cell) continue;
      for (const p of cell) {
        const dx = p.x - x;
        const dy = p.y - y;
        if (dx * dx + dy * dy <= r2) result.push(p);
      }
    }
  }
  return result;
}

// ─── Force application ───────────────────────────────────────────

/**
 * For each particle, compute the velocity contribution from all
 * higher-tier nearby particles. Higher-tier particles act as point
 * sources that push lower-tier particles away (radial repulsion)
 * with a strength proportional to the tier difference.
 *
 * Uses a spatial grid for O(n) neighbour lookups instead of O(n²).
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

  for (const b of particles) {
    if (b.isMerging || b.isLockedToPointer) continue;

    const nearby = queryEulerNearby(grid, b.x, b.y);

    let totalFx = 0;
    let totalFy = 0;

    for (const a of nearby) {
      if (a === b) continue;
      // Only higher-tier particles push lower-tier ones.
      if (a.tierIndex <= b.tierIndex) continue;

      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const distSq = dx * dx + dy * dy;
      if (distSq < 0.000001) continue; // skip coincident particles — avoids sqrt + div-by-zero

      const dist = Math.sqrt(distSq);

      const tierDiff = a.tierIndex - b.tierIndex;
      const strength = EULER_BASE_STRENGTH + EULER_TIER_SCALE * tierDiff;
      // Inverse-distance falloff with core radius to prevent singularity
      // (mirrors: force = strength / (dist + coreRadius) from EulerFluidEffect.js)
      const force = strength / (dist + EULER_CORE_RADIUS);

      const nx = dx / dist;
      const ny = dy / dist;

      // Radial (repulsive) component
      totalFx += nx * force;
      totalFy += ny * force;

      // Tangential (swirl) component — 30 % of radial force so
      // displaced particles spiral away rather than flying straight out.
      totalFx += (-ny) * force * 0.3;
      totalFy += nx * force * 0.3;
    }

    if (totalFx === 0 && totalFy === 0) continue;

    // Clamp total Euler force contribution to EULER_MAX_FORCE.
    // Use squared magnitude comparison to avoid sqrt when not needed.
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
