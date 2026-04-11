/**
 * ParticleSystem — slim orchestrator that delegates to focused modules.
 *
 * Responsibilities:
 *  - Owns the particle array, merge/shockwave lists, pool, and
 *    Particle Life interaction matrix + settings
 *  - Runs the per-frame update pipeline:
 *      physics → trails → Particle Life forces → damping →
 *      wrap → merges → forge crunch → shockwaves
 *  - Delegates rendering to particle-renderer.ts
 *
 * Split modules:
 *  - particle-types.ts        — interfaces & type aliases
 *  - particle-pool.ts         — object pool & particle init
 *  - particle-physics.ts      — per-particle physics, edge repulsion, trails
 *  - particle-life.ts         — Particle Life pairwise force computation
 *  - particle-life-debug.ts   — debug visualizations for Particle Life
 *  - particle-merge.ts        — traditional + procedural merge logic
 *  - particle-forge.ts        — forge crunch integration
 *  - particle-shockwave.ts    — shockwave update + spatial grid
 *  - particle-renderer.ts     — batched draw calls
 *  - spatial-grid.ts          — numeric-keyed spatial hash grid
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
  FORGE_SPIN_UP_THRESHOLD_MS,
} from '../../data/particles/particle-config';
import { createDefaultInteractionMatrix } from '../../data/particles/interaction-matrix';
import { PL_ENABLE_SIZE_FORCE_BIAS_DEFAULT } from '../../data/particles/particle-life-config';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import { getForgeRotationMultiplier } from '../../sim/forge/forge-state';
import { updateForgeCrunch } from '../../sim/forge/forge-logic';

// ── Split modules ──
import type {
  EquatoriaParticle,
  ActiveMerge,
  Shockwave,
  ParticleRenderOptions,
  Particle,
} from './particle-types';
import { ParticlePool, initParticle } from './particle-pool';
import { updateParticlePhysics, applyEdgeRepulsion, updateTrails, clearTrails } from './particle-physics';
import {
  applyParticleLifeForces,
  applyParticleLifeDamping,
  applyWrapAround,
} from './particle-life';
import {
  attemptSuctionMerge,
  processActiveMerges,
  enforceParticleLimit,
} from './particle-merge';
import { checkAndStartForgeCrunch, completeForgeCrunch } from './particle-forge';
import { updateShockwaves } from './particle-shockwave';
import { drawParticles, updateParticleRendererTime, getParticleRendererAnimTimeMs } from './particle-renderer';
import type { ParticleLifeDebugState } from './particle-life-debug';
import { drawParticleLifeDebug, createDefaultDebugState } from './particle-life-debug';
import { drawGrabVisual } from './particle-grab-visual';
import type { ParticleDragState } from '../../input/particle-drag';

// Re-export types for backward compatibility
export type { EquatoriaParticle, Particle, ActiveMerge, Shockwave, ParticleRenderOptions };

// ─── Audio events returned from update() ────────────────────────

export interface ParticleAudioEvents {
  /** Number of mote merges completed this frame (both traditional and procedural). */
  mergesCompleted: number;
  /** True on the frame the forge crunch animation begins. */
  forgeCrunchStarted: boolean;
  /** True on the frame the forge spin-up threshold is crossed. */
  forgeSpinUpBegan: boolean;
  /** True on the frame the spin-up is aborted without a crunch. */
  forgeSpinUpCancelled: boolean;
}

// ─── Constants ───────────────────────────────────────────────────

/** Fallback spawn position when no matching generator is found (canvas center at 320px width). */
const DEFAULT_SPAWN_X = 160;
const DEFAULT_SPAWN_Y = 160;

// ─── ParticleSystem class ────────────────────────────────────────

export class ParticleSystem {
  particles: EquatoriaParticle[] = [];
  activeMerges: ActiveMerge[] = [];
  shockwaves: Shockwave[] = [];
  forgeRotation = 0;
  spawnerRotations: Map<TierId, number> = new Map();
  mergeCooldownFrames = 0;
  frameCount = 0;

  // ── Particle Life state ──
  /** 13×13 interaction matrix: matrix[source][target]. */
  interactionMatrix: number[][] = createDefaultInteractionMatrix();
  /** Whether larger motes exert stronger forces. */
  enableSizeForceBias: boolean = PL_ENABLE_SIZE_FORCE_BIAS_DEFAULT;
  /** Debug visualization toggles. */
  debugState: ParticleLifeDebugState = createDefaultDebugState();

  private readonly _pool = new ParticlePool();

  // ── Forge audio transition tracking ──
  /** Whether the forge was in spin-up state at the end of the last frame. */
  private _wasSpinningUp = false;
  /** Whether the forge crunch was active at the end of the last frame. */
  private _wasCrunchActive = false;

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

  /** Full physics + Particle Life + merge + forge crunch update. Returns audio events for this frame. */
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
    isForgeUnlocked: boolean,
  ): ParticleAudioEvents {
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

    // Per-particle physics (generator gravity, forge attraction, veer, clamping, bounce)
    const skipPhysics = this.particles.length > PERFORMANCE_THRESHOLD && this.frameCount % 2 === 0;
    if (!skipPhysics) {
      for (let i = 0, len = this.particles.length; i < len; i++) {
        updateParticlePhysics(
          this.particles[i], clampedDelta, nowMs, generators,
          forgeX, forgeY, canvasWidth, canvasHeight, isForgeUnlocked,
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

    // ── Particle Life interaction forces ──
    // Replaces the old Euler fluid dynamics system.
    // Computes pairwise forces from the 13×13 interaction matrix.
    // 1×1 motes are automatically skipped (inert rule).
    {
      const skipPL = this.particles.length > PERFORMANCE_THRESHOLD && this.frameCount % 2 !== 0;
      if (!skipPL) {
        applyParticleLifeForces(
          this.particles,
          this.interactionMatrix,
          this.enableSizeForceBias,
          clampedDelta,
          canvasWidth,
          canvasHeight,
        );
      }
    }

    // Velocity damping + max speed clamp
    applyParticleLifeDamping(this.particles, clampedDelta);

    // Toroidal wraparound
    applyWrapAround(this.particles, canvasWidth, canvasHeight);

    // Suction merges — check globally every 10 frames
    if (this.mergeCooldownFrames > 0) this.mergeCooldownFrames--;
    if (this.frameCount % 10 === 0) {
      attemptSuctionMerge(this.particles, this.activeMerges, generators, nowMs);
    }
    if (this.frameCount % 30 === 0) {
      this.particles = enforceParticleLimit(this.particles, this._pool, generators, nowMs);
    }

    // Active merge processing
    const mergeResult = processActiveMerges(
      this.particles, this.activeMerges, this.shockwaves,
      this._pool, this.spawnerRotations, nowMs, generators,
    );
    this.particles = mergeResult.particles;
    this.mergeCooldownFrames = Math.max(this.mergeCooldownFrames, mergeResult.mergeCooldownFrames);
    const mergesCompleted = mergeResult.completedCount;

    // Capture previous-frame forge state before updating
    const wasCrunchActive = this._wasCrunchActive;
    const wasSpinningUp   = this._wasSpinningUp;

    // Forge crunch (only when forge is unlocked)
    if (isForgeUnlocked) {
      checkAndStartForgeCrunch(this.particles, crunchState, forgeX, forgeY, nowMs);
    }
    if (updateForgeCrunch(crunchState, nowMs)) {
      this.particles = completeForgeCrunch(
        this.particles, this._pool, this.spawnerRotations, forgeX, forgeY, nowMs,
      );
    }

    // Detect forge audio transitions
    const isNowSpinningUp = (
      crunchState.validParticlesTimerMs !== null &&
      !crunchState.isActive &&
      (nowMs - crunchState.validParticlesTimerMs >= FORGE_SPIN_UP_THRESHOLD_MS)
    );
    const isCrunchNowActive = crunchState.isActive;

    const forgeCrunchStarted    = !wasCrunchActive && isCrunchNowActive;
    const forgeSpinUpBegan      = !wasSpinningUp && isNowSpinningUp;
    const forgeSpinUpCancelled  = wasSpinningUp && !isNowSpinningUp && !forgeCrunchStarted;

    this._wasSpinningUp   = isNowSpinningUp;
    this._wasCrunchActive = isCrunchNowActive;

    // Shockwaves
    this.shockwaves = updateShockwaves(this.shockwaves, this.particles, nowMs);

    return { mergesCompleted, forgeCrunchStarted, forgeSpinUpBegan, forgeSpinUpCancelled };
  }

  /** Render particles, shockwaves, grab overlay, and optional debug overlays to canvas. */
  draw(
    cc: CanvasContext,
    options: ParticleRenderOptions,
    dragState?: ParticleDragState,
    canvasWidth?: number,
    canvasHeight?: number,
  ): void {
    drawParticles(cc, this.particles, this.shockwaves, options);
    if (dragState !== undefined && canvasWidth !== undefined && canvasHeight !== undefined) {
      drawGrabVisual(cc, dragState, this.particles, canvasWidth, canvasHeight, getParticleRendererAnimTimeMs());
    }
    drawParticleLifeDebug(
      cc,
      this.particles,
      this.interactionMatrix,
      this.enableSizeForceBias,
      this.debugState,
    );
  }

  get particleCount(): number {
    return this.particles.length;
  }
}
