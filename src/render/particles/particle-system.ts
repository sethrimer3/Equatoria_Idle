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
  SUCTION_MERGE_INTERVAL_FRAMES,
  PARTICLE_LIMIT_INTERVAL_FRAMES,
  MAX_FRAME_DELTA_RATIO,
  MIN_FRAME_DELTA_RATIO,
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
import { checkAndStartForgeCrunch, completeForgeCrunch, completeEquationForgeCrunch } from './particle-forge';
import { applyForgeFieldForces } from './forge-field-forces';
import type { ForgeFieldInfo, LoomCapture } from './forge-field-forces';
import { updateShockwaves } from './particle-shockwave';
import { drawParticles, updateParticleRendererTime, getParticleRendererAnimTimeMs } from './particle-renderer';
import type { ParticleLifeDebugState } from './particle-life-debug';
import { drawParticleLifeDebug, createDefaultDebugState } from './particle-life-debug';
import { drawGrabVisual } from './particle-grab-visual';
import { resetGlowField } from './particle-glow-field';
import type { ParticleDragState } from '../../input/particle-drag';

// Re-export types for backward compatibility
export type { EquatoriaParticle, Particle, ActiveMerge, Shockwave, ParticleRenderOptions };
export type { ForgeFieldInfo } from './forge-field-forces';

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

// ─── Fixed-timestep substep constants ───────────────────────────

/**
 * Fixed simulation step size in milliseconds.
 * Targets two substeps per 60 fps render frame (≈ 8.33 ms each), giving
 * a stable, frame-rate-independent integration while keeping per-step
 * displacement small.
 */
const FIXED_STEP_MS = 1000 / 120; // ≈ 8.33 ms

/**
 * Maximum substeps simulated per render frame.
 * Caps work when the frame rate drops to prevent spiral-of-death behavior
 * (the simulation lags behind real time rather than accelerating).
 */
const MAX_SUBSTEPS_PER_FRAME = 4;

/**
 * Pre-computed clampedDelta for one fixed step relative to a 60 fps frame.
 * All per-step force and position integrations use this constant value so
 * behaviour is independent of the render frame rate.
 */
const FIXED_STEP_DELTA = FIXED_STEP_MS / (1000 / 60); // ≈ 0.5

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
  /**
   * Set of tier indices (by unlockOrder) that have been alivened.
   * Only alivened particles participate in Particle Life forces.
   * Updated externally from game state each frame.
   */
  alivenedTierIndices: Set<number> = new Set();
  /** Debug visualization toggles. */
  debugState: ParticleLifeDebugState = createDefaultDebugState();

  private readonly _pool = new ParticlePool();

  /** Accumulates unprocessed frame time for fixed-timestep substep integration. */
  private _accumMs = 0;

  // ── Forge audio transition tracking ──
  /** Whether the forge was in spin-up state at the end of the last frame. */
  private _wasSpinningUp = false;
  /** Whether the forge crunch was active at the end of the last frame. */
  private _wasCrunchActive = false;

  // ── Capture fields (forge + looms) ───────────────────────────────
  /** Forge and loom capture fields, updated each frame from app-game-loop. */
  forgeFields: ForgeFieldInfo[] = [];
  /** Scratch buffer for loom captures accumulated during substeps. */
  private readonly _newLoomCaptures: LoomCapture[] = [];

  // ── Callbacks ────────────────────────────────────────────────────
  /**
   * Fired once per loom-captured particle.
   * The app layer routes this to `processLoomCapture` in the sim.
   */
  onParticleCapturedByLoom?: (fieldId: string, inputTierId: string, mass: number) => void;
  /**
   * Fired when an equation forge sacrifice crunch completes.
   * The app layer routes this to `applyForgeSacrifice` in the sim.
   */
  onEquationForgeCrunchCompleted?: (sacrifices: Map<string, number>) => void;

  /** Update the set of capture/attraction fields for this frame. */
  setForgeFields(fields: ForgeFieldInfo[]): void {
    this.forgeFields = fields;
  }

  /** Returns the total small-mote equivalents currently on screen. */
  getOnScreenMoteCount(): number {
    let total = 0;
    for (let i = 0, len = this.particles.length; i < len; i++) {
      total += getSizeSmallEquivalent(this.particles[i].sizeIndex);
    }
    return total;
  }

  /** Returns the raw on-screen particle count (ignores size/value). */
  getOnScreenParticleCount(): number {
    return this.particles.length;
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

  /** Rush all particles of the given tier toward the generator position. */
  gatherMotesToGenerator(tierId: TierId, genX: number, genY: number): void {
    for (const p of this.particles) {
      if (p.tierId !== tierId) continue;
      if (p.isLockedToPointer) continue;
      const dx = genX - p.x;
      const dy = genY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy) || 1;
      const speed = 15.0;
      p.vx = (dx / dist) * speed;
      p.vy = (dy / dist) * speed;
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

    // ── Frame-level updates (once per render frame) ──────────────

    // Advance renderer animation clock
    updateParticleRendererTime(deltaMs);

    // Spawner and forge rotations use the actual frame delta so they
    // remain smooth at any frame rate independently of the substep count.
    const frameRatio = deltaMs / (1000 / 60);
    const frameDelta = Math.max(Math.min(frameRatio, MAX_FRAME_DELTA_RATIO), MIN_FRAME_DELTA_RATIO);

    for (const [tierId] of this.spawnerRotations) {
      const rot = this.spawnerRotations.get(tierId) ?? 0;
      this.spawnerRotations.set(tierId, rot + SPAWNER_ROTATION_SPEED * frameDelta);
    }

    const spinMult = getForgeRotationMultiplier(
      crunchState, nowMs,
      FORGE_VALID_WAIT_TIME_MS, FORGE_SPIN_UP_DURATION_MS, FORGE_SPIN_DOWN_DURATION_MS,
    );
    this.forgeRotation += FORGE_ROTATION_SPEED * spinMult * frameDelta;

    // ── Fixed-timestep simulation substeps ───────────────────────
    // Accumulate frame time, then drain it in fixed-size steps.
    // Capping the accumulator prevents spiral-of-death when frames are slow.
    this._accumMs = Math.min(this._accumMs + deltaMs, FIXED_STEP_MS * MAX_SUBSTEPS_PER_FRAME);

    // Performance flags are evaluated once per frame so even-/odd-frame
    // alternation still alternates per render frame, not per substep.
    const skipPhysics = this.particles.length > PERFORMANCE_THRESHOLD && this.frameCount % 2 === 0;
    const skipPL      = this.particles.length > PERFORMANCE_THRESHOLD && this.frameCount % 2 !== 0;

    while (this._accumMs >= FIXED_STEP_MS) {
      this._accumMs -= FIXED_STEP_MS;

      // Per-particle physics (generator gravity, forge attraction, veer, clamping, bounce)
      if (!skipPhysics) {
        for (let i = 0, len = this.particles.length; i < len; i++) {
          updateParticlePhysics(
            this.particles[i], FIXED_STEP_DELTA, nowMs, generators,
            forgeX, forgeY, canvasWidth, canvasHeight, isForgeUnlocked,
          );
        }
        applyEdgeRepulsion(this.particles, canvasWidth, canvasHeight, FIXED_STEP_DELTA);
      }

      // Particle Life interaction forces
      // Computes pairwise forces from the 13×13 interaction matrix.
      // 1×1 motes are automatically skipped (inert rule).
      if (!skipPL) {
        applyParticleLifeForces(
          this.particles,
          this.interactionMatrix,
          this.alivenedTierIndices,
          this.enableSizeForceBias,
          FIXED_STEP_DELTA,
          canvasWidth,
          canvasHeight,
          nowMs,
        );
      }

      // Capture-field forces — after PL so PL can't override capture
      applyForgeFieldForces(
        this.particles,
        this.forgeFields,
        crunchState,
        this._newLoomCaptures,
        FIXED_STEP_DELTA,
      );

      // Velocity damping + max speed clamp
      applyParticleLifeDamping(this.particles, FIXED_STEP_DELTA, nowMs);

      // Toroidal wraparound
      applyWrapAround(this.particles, canvasWidth, canvasHeight);
    }

    // ── Post-simulation (once per render frame) ──────────────────

    // Trails
    if (options.enableTrails) {
      updateTrails(this.particles);
    } else {
      clearTrails(this.particles);
    }

    // Suction merges — check globally every 10 frames
    if (this.mergeCooldownFrames > 0) this.mergeCooldownFrames--;
    if (this.frameCount % SUCTION_MERGE_INTERVAL_FRAMES === 0) {
      attemptSuctionMerge(this.particles, this.activeMerges, generators, nowMs);
    }
    if (this.frameCount % PARTICLE_LIMIT_INTERVAL_FRAMES === 0) {
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

    // ── Loom captures — remove captured loom particles and fire callbacks ──
    if (this._newLoomCaptures.length > 0) {
      // Remove loom-captured particles from the array (released in-place)
      let wp = 0;
      const capturedSet = new Set<EquatoriaParticle>(this._newLoomCaptures.map(c => c.particle));
      for (let i = 0, len = this.particles.length; i < len; i++) {
        const p = this.particles[i];
        if (capturedSet.has(p)) {
          this._pool.release(p);
        } else {
          this.particles[wp++] = p;
        }
      }
      this.particles.length = wp;

      // Fire callbacks for each captured particle
      if (this.onParticleCapturedByLoom) {
        for (let ci = 0; ci < this._newLoomCaptures.length; ci++) {
          const c = this._newLoomCaptures[ci];
          this.onParticleCapturedByLoom(c.fieldId, c.inputTierId as string, c.mass);
        }
      }
      this._newLoomCaptures.length = 0;
    }

    // Capture previous-frame forge state before updating
    const wasCrunchActive = this._wasCrunchActive;
    const wasSpinningUp   = this._wasSpinningUp;

    // Forge crunch (only when forge is unlocked)
    if (isForgeUnlocked) {
      checkAndStartForgeCrunch(this.particles, crunchState, forgeX, forgeY, nowMs);
    }
    if (updateForgeCrunch(crunchState, nowMs)) {
      const sacrifices = completeEquationForgeCrunch(this.particles, this._pool);
      if (sacrifices.size > 0 && this.onEquationForgeCrunchCompleted) {
        this.onEquationForgeCrunchCompleted(sacrifices);
      }
      // Fallback: also run visual completeForgeCrunch if no sacrifices (legacy compat)
      if (sacrifices.size === 0) {
        this.particles = completeForgeCrunch(
          this.particles, this._pool, this.spawnerRotations, forgeX, forgeY, nowMs,
        );
      }
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
    nowMs?: number,
  ): void {
    const renderNow = nowMs ?? performance.now();
    drawParticles(cc, this.particles, this.shockwaves, this.activeMerges, options, renderNow);
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

  /**
   * Clear all particles and reset transient visual state.
   * Called on game reset so the particle simulation starts fresh.
   */
  reset(): void {
    // Release all active particles back to the pool
    for (let i = 0, len = this.particles.length; i < len; i++) {
      this._pool.release(this.particles[i]);
    }
    this.particles.length = 0;
    this.activeMerges.length = 0;
    this.shockwaves.length = 0;
    this.spawnerRotations.clear();
    this.alivenedTierIndices.clear();
    this.forgeRotation = 0;
    this.mergeCooldownFrames = 0;
    this.frameCount = 0;
    this._accumMs = 0;
    this._wasSpinningUp = false;
    this._wasCrunchActive = false;
    this._newLoomCaptures.length = 0;
    this.forgeFields = [];
    // Clear glow field so the previous session's glow does not persist
    resetGlowField();
  }

  get particleCount(): number {
    return this.particles.length;
  }
}
