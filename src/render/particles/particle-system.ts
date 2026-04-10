/**
 * ParticleSystem — slim orchestrator that delegates to focused modules.
 *
 * Responsibilities:
 *  - Owns the particle array, merge/shockwave lists, and pool
 *  - Runs the per-frame update pipeline (physics → trails → Euler →
 *    merges → forge crunch → shockwaves)
 *  - Delegates rendering to particle-renderer.ts
 *
 * Split from the original monolithic file into:
 *  - particle-types.ts    — interfaces & type aliases
 *  - particle-pool.ts     — object pool & particle init
 *  - particle-physics.ts  — per-particle physics, edge repulsion, trails
 *  - particle-merge.ts    — traditional + procedural merge logic
 *  - particle-forge.ts    — forge crunch integration
 *  - particle-shockwave.ts — shockwave update + spatial grid
 *  - particle-renderer.ts — batched draw calls
 *  - spatial-grid.ts      — numeric-keyed spatial hash grid
 */

import type { CanvasContext } from '../canvas';
import type { TierId } from '../../data/tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';
import { SMALL_SIZE_INDEX, getSizeSmallEquivalent } from '../../data/particles/size-tiers';
import {
  MIN_VELOCITY,
  MAX_VELOCITY,
  MAX_PARTICLES_FULL,
  PERFORMANCE_THRESHOLD,
  FORGE_ROTATION_SPEED,
  SPAWNER_ROTATION_SPEED,
  FORGE_VALID_WAIT_TIME_MS,
  FORGE_SPIN_UP_DURATION_MS,
  FORGE_SPIN_DOWN_DURATION_MS,
  EULER_FLUID_ENABLED,
} from '../../data/particles/particle-config';
import { applyEulerFluidForces } from './euler-fluid';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import { getForgeRotationMultiplier } from '../../sim/forge/forge-state';
import { updateForgeCrunch } from '../../sim/forge/forge-logic';

// ── Split modules ──
import type {
  EquatoriaParticle,
  ActiveMerge,
  ProceduralMerge,
  Shockwave,
  ParticleRenderOptions,
  Particle,
} from './particle-types';
import { ParticlePool, initParticle } from './particle-pool';
import { updateParticlePhysics, applyEdgeRepulsion, updateTrails, clearTrails } from './particle-physics';
import {
  attemptMerge,
  processActiveMerges,
  enforceParticleLimit,
  attemptProceduralMerge,
  updateProceduralMerges,
} from './particle-merge';
import { checkAndStartForgeCrunch, completeForgeCrunch } from './particle-forge';
import { updateShockwaves } from './particle-shockwave';
import { drawParticles, updateParticleRendererTime } from './particle-renderer';

// Re-export types for backward compatibility
export type { EquatoriaParticle, Particle, ActiveMerge, Shockwave, ParticleRenderOptions, ProceduralMerge };

// ─── Constants ───────────────────────────────────────────────────

/** Fallback spawn position when no matching generator is found (canvas center at 320px width). */
const DEFAULT_SPAWN_X = 160;
const DEFAULT_SPAWN_Y = 160;

// ─── ParticleSystem class ────────────────────────────────────────

export class ParticleSystem {
  particles: EquatoriaParticle[] = [];
  activeMerges: ActiveMerge[] = [];
  proceduralMerges: ProceduralMerge[] = [];
  shockwaves: Shockwave[] = [];
  forgeRotation = 0;
  spawnerRotations: Map<TierId, number> = new Map();
  mergeCooldownFrames = 0;
  frameCount = 0;

  private readonly _pool = new ParticlePool();

  /** Returns the total small-mote equivalents currently on screen. */
  getOnScreenMoteCount(): number {
    let total = 0;
    for (let i = 0, len = this.particles.length; i < len; i++) {
      total += getSizeSmallEquivalent(this.particles[i].sizeIndex);
    }
    return total;
  }

  /** Spawn a particle near the generator for this tier. */
  emit(
    tierId: TierId,
    sizeIndex: SizeIndex,
    generators: readonly GeneratorInfo[],
    nowMs: number,
  ): void {
    if (this.particles.length >= MAX_PARTICLES_FULL) return;
    let spawnX = DEFAULT_SPAWN_X, spawnY = DEFAULT_SPAWN_Y;
    for (let i = 0, len = generators.length; i < len; i++) {
      if (generators[i].tierId === tierId) { spawnX = generators[i].x; spawnY = generators[i].y; break; }
    }
    const p = this._pool.acquire();
    initParticle(p, tierId, sizeIndex, spawnX, spawnY, nowMs);
    if (!this.spawnerRotations.has(tierId)) {
      this.spawnerRotations.set(tierId, Math.random() * Math.PI * 2);
    }
    this.particles.push(p);
  }

  /** Emit a burst at a specific canvas position (tap/auto-tap use). */
  emitAtPosition(
    centerX: number,
    centerY: number,
    count: number,
    tierId: TierId,
    nowMs: number,
  ): void {
    for (let i = 0; i < count; i++) {
      if (this.particles.length >= MAX_PARTICLES_FULL) return;
      const p = this._pool.acquire();
      initParticle(p, tierId, SMALL_SIZE_INDEX, centerX, centerY, nowMs);
      const angle = Math.random() * Math.PI * 2;
      const speed = MIN_VELOCITY + Math.random() * (MAX_VELOCITY - MIN_VELOCITY);
      p.vx = Math.cos(angle) * speed;
      p.vy = Math.sin(angle) * speed;
      this.particles.push(p);
    }
  }

  /** Full physics + merge + forge crunch update. */
  update(
    deltaMs: number,
    nowMs: number,
    generators: readonly GeneratorInfo[],
    forgeX: number,
    forgeY: number,
    canvasWidth: number,
    canvasHeight: number,
    crunchState: ForgeCrunchState,
    options: ParticleRenderOptions,
  ): void {
    this.frameCount++;
    const deltaRatio = deltaMs / (1000 / 60);
    const clampedDelta = Math.max(Math.min(deltaRatio, 3), 0.01);

    // Advance renderer animation clock
    updateParticleRendererTime(deltaMs);

    // Spawner rotations
    for (const [tierId] of this.spawnerRotations) {
      const rot = this.spawnerRotations.get(tierId) ?? 0;
      this.spawnerRotations.set(tierId, rot + SPAWNER_ROTATION_SPEED * clampedDelta);
    }

    // Forge rotation
    const spinMult = getForgeRotationMultiplier(
      crunchState, nowMs,
      FORGE_VALID_WAIT_TIME_MS, FORGE_SPIN_UP_DURATION_MS, FORGE_SPIN_DOWN_DURATION_MS,
    );
    this.forgeRotation += FORGE_ROTATION_SPEED * spinMult * clampedDelta;

    // Physics
    const skipPhysics = this.particles.length > PERFORMANCE_THRESHOLD && this.frameCount % 2 === 0;
    if (!skipPhysics) {
      for (let i = 0, len = this.particles.length; i < len; i++) {
        updateParticlePhysics(
          this.particles[i], clampedDelta, nowMs, generators,
          forgeX, forgeY, canvasWidth, canvasHeight,
        );
      }
      applyEdgeRepulsion(this.particles, canvasWidth, canvasHeight, clampedDelta);
    }

    // Trails
    if (options.enableTrails) {
      updateTrails(this.particles);
    } else {
      clearTrails(this.particles);
    }

    // Euler fluid dynamics
    if (EULER_FLUID_ENABLED) {
      const skipEuler = this.particles.length > PERFORMANCE_THRESHOLD && this.frameCount % 2 !== 0;
      if (!skipEuler) {
        applyEulerFluidForces(this.particles, clampedDelta);
      }
    }

    // Merges
    if (this.mergeCooldownFrames > 0) this.mergeCooldownFrames--;
    if (this.frameCount % 10 === 0) {
      this.mergeCooldownFrames = attemptMerge(
        this.particles, this.activeMerges, this.mergeCooldownFrames, generators, nowMs,
      );
    }
    if (this.frameCount % 30 === 0) {
      this.particles = enforceParticleLimit(this.particles, this._pool, generators, nowMs);
    }

    // Procedural seek-merge
    if (this.frameCount % 15 === 0) {
      attemptProceduralMerge(this.particles, this.proceduralMerges, nowMs);
    }
    this.particles = updateProceduralMerges(
      this.particles, this.proceduralMerges, this.shockwaves, this._pool, nowMs, clampedDelta,
    );

    // Active merge processing
    const mergeResult = processActiveMerges(
      this.particles, this.activeMerges, this.shockwaves,
      this._pool, this.spawnerRotations, nowMs, generators,
    );
    this.particles = mergeResult.particles;
    this.mergeCooldownFrames = Math.max(this.mergeCooldownFrames, mergeResult.mergeCooldownFrames);

    // Forge crunch
    checkAndStartForgeCrunch(this.particles, crunchState, forgeX, forgeY, nowMs);
    if (updateForgeCrunch(crunchState, nowMs)) {
      this.particles = completeForgeCrunch(
        this.particles, this._pool, this.spawnerRotations, forgeX, forgeY, nowMs,
      );
    }

    // Shockwaves
    this.shockwaves = updateShockwaves(this.shockwaves, this.particles, nowMs);
  }

  /** Render particles and shockwaves to canvas. */
  draw(cc: CanvasContext, options: ParticleRenderOptions): void {
    drawParticles(cc, this.particles, this.shockwaves, options);
  }

  get particleCount(): number {
    return this.particles.length;
  }
}
