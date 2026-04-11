/**
 * Particle Life interaction system — pairwise force computation.
 *
 * Replaces the Euler fluid-dynamics model with autonomous particle
 * interactions governed by a 13×13 interaction matrix and size-based
 * gating / scaling.
 *
 * Algorithm:
 *   1. Build a spatial hash grid (cell size = PL_INTERACTION_RADIUS).
 *   2. For each non-inert mote, query the 3×3 neighbourhood.
 *   3. For each nearby non-inert neighbour within PL_INTERACTION_RADIUS:
 *      a. If distance < PL_PROTECTED_RADIUS → strong repulsion (collapse prevention).
 *      b. Else → matrix-controlled force with smooth taper to 0 at outer radius.
 *   4. Optionally scale force by sqrt(sizeA) * sqrt(sizeB) when size-bias is enabled.
 *
 * Complexity: O(n·k) where k is average neighbours per particle —
 * effectively O(n) with the spatial grid.
 *
 * This module is purely physics — it does not read or write any
 * authoritative simulation state and produces no visual output.
 */

import {
  PL_INTERACTION_RADIUS,
  PL_PROTECTED_RADIUS,
  PL_MATRIX_FORCE_SCALE,
  PL_PROTECTED_REPULSION_STRENGTH,
  PL_MAX_VELOCITY,
  PL_VELOCITY_DAMPING,
  PL_GRID_CELL_SIZE,
} from '../../data/particles/particle-life-config';
import type { EquatoriaParticle } from './particle-types';
import { getSizePixels } from '../../data/particles/size-tiers';

// ─── Spatial grid (module-local, zero-allocation reuse) ──────────

const INV_CELL = 1 / PL_GRID_CELL_SIZE;
const R2 = PL_INTERACTION_RADIUS * PL_INTERACTION_RADIUS;

function gridKey(cx: number, cy: number): number {
  return ((cx & 0xFFFF) << 16) | (cy & 0xFFFF);
}

/** Reusable grid structure — cleared each frame, not reallocated. */
const _gridCells = new Map<number, EquatoriaParticle[]>();
/** Pool of cell arrays to avoid per-frame allocation. */
const _cellPool: EquatoriaParticle[][] = [];

function acquireCell(): EquatoriaParticle[] {
  const c = _cellPool.pop();
  if (c) { c.length = 0; return c; }
  return [];
}

function buildParticleLifeGrid(
  particles: EquatoriaParticle[],
): void {
  // Return all cells to pool
  for (const cell of _gridCells.values()) {
    _cellPool.push(cell);
  }
  _gridCells.clear();

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    // Skip inert (1×1) and special-state particles
    if (getSizePixels(p.sizeIndex) === 1) continue;
    if (p.isMerging || p.isLockedToPointer) continue;

    const cx = Math.floor(p.x * INV_CELL);
    const cy = Math.floor(p.y * INV_CELL);
    const key = gridKey(cx, cy);
    let cell = _gridCells.get(key);
    if (!cell) {
      cell = acquireCell();
      _gridCells.set(key, cell);
    }
    cell.push(p);
  }
}

// ─── Pre-computed sqrt table for size-force bias ─────────────────
// Sizes typically range 0–10ish; cache up to 32 for safety.
// Entry i stores sqrt(i+1) which is sqrt(sizePixels) for sizeIndex i.
const _sqrtCache = new Float64Array(32);
for (let i = 0; i < _sqrtCache.length; i++) {
  _sqrtCache[i] = Math.sqrt(i + 1);
}

function getSizeFactor(sizeIndex: number): number {
  const sizePixels = sizeIndex + 1; // mirrors getSizePixels()
  return sizePixels < _sqrtCache.length ? _sqrtCache[sizePixels - 1] : Math.sqrt(sizePixels);
}

// ─── Force envelope (smooth taper) ───────────────────────────────
// Maps distance ∈ [protectedRadius, interactionRadius] → [1, 0]
// using a cosine ease-out for smoothness.
const RANGE = PL_INTERACTION_RADIUS - PL_PROTECTED_RADIUS;
const INV_RANGE = 1.0 / RANGE;
const PI = Math.PI;

function envelope(dist: number): number {
  const t = (dist - PL_PROTECTED_RADIUS) * INV_RANGE; // 0 at inner, 1 at outer
  // Cosine taper: 1 at t=0, 0 at t=1
  return 0.5 * (1 + Math.cos(t * PI));
}

// ─── Wraparound distance helpers ─────────────────────────────────

function wrapDelta(d: number, size: number): number {
  if (d > size * 0.5) return d - size;
  if (d < -size * 0.5) return d + size;
  return d;
}

// ─── Main force application ──────────────────────────────────────

/**
 * Apply Particle Life pairwise forces to all non-inert particles.
 *
 * @param particles      Active particle array.
 * @param interactionMatrix  13×13 matrix[source][target].
 * @param enableSizeBias Whether to scale forces by sqrt(size).
 * @param clampedDelta   Frame delta ratio (deltaMs / (1000/60)), clamped.
 * @param canvasWidth    Current canvas width in px.
 * @param canvasHeight   Current canvas height in px.
 */
export function applyParticleLifeForces(
  particles: EquatoriaParticle[],
  interactionMatrix: number[][],
  enableSizeBias: boolean,
  clampedDelta: number,
  canvasWidth: number,
  canvasHeight: number,
): void {
  buildParticleLifeGrid(particles);

  for (let bi = 0, blen = particles.length; bi < blen; bi++) {
    const b = particles[bi];

    // Rule 1: 1×1 motes are fully inert — skip entirely.
    if (getSizePixels(b.sizeIndex) === 1) continue;
    if (b.isMerging || b.isLockedToPointer) continue;

    let totalFx = 0;
    let totalFy = 0;

    const bx = b.x;
    const by = b.y;
    const bType = b.tierIndex;
    const bSizeFactor = enableSizeBias ? getSizeFactor(b.sizeIndex) : 1;

    // Query 3×3 neighbourhood
    const cx0 = Math.floor((bx - PL_INTERACTION_RADIUS) * INV_CELL);
    const cx1 = Math.floor((bx + PL_INTERACTION_RADIUS) * INV_CELL);
    const cy0 = Math.floor((by - PL_INTERACTION_RADIUS) * INV_CELL);
    const cy1 = Math.floor((by + PL_INTERACTION_RADIUS) * INV_CELL);

    for (let cx = cx0; cx <= cx1; cx++) {
      for (let cy = cy0; cy <= cy1; cy++) {
        const cell = _gridCells.get(gridKey(cx, cy));
        if (!cell) continue;
        for (let ci = 0, clen = cell.length; ci < clen; ci++) {
          const a = cell[ci];
          if (a === b) continue;

          // Compute offset with toroidal wrap
          let dx = bx - a.x;
          let dy = by - a.y;
          dx = wrapDelta(dx, canvasWidth);
          dy = wrapDelta(dy, canvasHeight);

          const distSq = dx * dx + dy * dy;
          if (distSq > R2 || distSq < 0.0001) continue;

          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;

          let fx: number;
          let fy: number;

          if (dist < PL_PROTECTED_RADIUS) {
            // Zone 1 — Protected radius: strong repulsion.
            // Force increases as distance approaches 0 (linear ramp).
            const t = 1 - dist / PL_PROTECTED_RADIUS; // 1 at center, 0 at boundary
            const repulse = PL_PROTECTED_REPULSION_STRENGTH * t;
            fx = nx * repulse;
            fy = ny * repulse;
          } else {
            // Zone 2 — Matrix-controlled region.
            // a exerts force on b: interactionMatrix[a.type][b.type]
            const matrixVal = interactionMatrix[a.tierIndex][bType];
            const env = envelope(dist);
            const strength = matrixVal * PL_MATRIX_FORCE_SCALE * env;

            // Size-force bias: larger motes exert/receive stronger forces
            const aSizeFactor = enableSizeBias ? getSizeFactor(a.sizeIndex) : 1;
            const combinedSizeFactor = aSizeFactor * bSizeFactor;

            // Positive matrix = attraction (force toward a → negative of offset direction)
            // Negative matrix = repulsion (force away from a → positive offset direction)
            // Since (nx, ny) points FROM a TO b, attraction is -nx, repulsion is +nx.
            fx = -nx * strength * combinedSizeFactor;
            fy = -ny * strength * combinedSizeFactor;
          }

          totalFx += fx;
          totalFy += fy;
        }
      }
    }

    // Apply accumulated force to velocity
    b.vx += totalFx * clampedDelta;
    b.vy += totalFy * clampedDelta;
  }
}

/**
 * Apply velocity damping and clamp max speed for all particles.
 * Called after force accumulation and before position integration.
 */
export function applyParticleLifeDamping(
  particles: EquatoriaParticle[],
  clampedDelta: number,
): void {
  // Compute per-frame damping (adjust for variable timestep)
  const damping = Math.pow(PL_VELOCITY_DAMPING, clampedDelta);

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isMerging || p.isLockedToPointer) continue;

    p.vx *= damping;
    p.vy *= damping;

    // Clamp maximum velocity
    const speedSq = p.vx * p.vx + p.vy * p.vy;
    if (speedSq > PL_MAX_VELOCITY * PL_MAX_VELOCITY) {
      const scale = PL_MAX_VELOCITY / Math.sqrt(speedSq);
      p.vx *= scale;
      p.vy *= scale;
    }
  }
}

/**
 * Apply toroidal wraparound to particle positions.
 */
export function applyWrapAround(
  particles: EquatoriaParticle[],
  canvasWidth: number,
  canvasHeight: number,
): void {
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isMerging) continue;
    // Wrap X
    if (p.x < 0) p.x += canvasWidth;
    else if (p.x > canvasWidth) p.x -= canvasWidth;
    // Wrap Y
    if (p.y < 0) p.y += canvasHeight;
    else if (p.y > canvasHeight) p.y -= canvasHeight;
  }
}
