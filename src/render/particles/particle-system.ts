import type { CanvasContext } from '../canvas';
import type { TierId } from '../../data/tiers';
import { TIERS, TIER_BY_ID } from '../../data/tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';
import {
  MERGE_THRESHOLD,
  SMALL_SIZE_INDEX,
  MEDIUM_SIZE_INDEX,
  EXTRA_LARGE_SIZE_INDEX,
  SIZE_SCALE_MULTIPLIERS,
  SIZE_MIN_VELOCITY_MODIFIERS,
  SIZE_MAX_VELOCITY_MODIFIERS,
  SIZE_FORCE_MODIFIERS,
} from '../../data/particles/size-tiers';
import {
  BASE_PARTICLE_SIZE,
  MIN_VELOCITY,
  MAX_VELOCITY,
  ATTRACTION_STRENGTH,
  MAX_FORGE_ATTRACTION_DISTANCE,
  DISTANCE_SCALE,
  FORCE_SCALE,
  SPAWNER_GRAVITY_STRENGTH,
  SMALL_TIER_GENERATOR_GRAVITY_STRENGTH,
  MEDIUM_TIER_FORGE_GRAVITY_STRENGTH,
  MERGE_GATHER_SPEED,
  MERGE_GATHER_THRESHOLD,
  MERGE_TIMEOUT_MS,
  VEER_ANGLE_MIN_DEG,
  VEER_ANGLE_MAX_DEG,
  VEER_INTERVAL_MIN_MS,
  VEER_INTERVAL_MAX_MS,
  MAX_PARTICLES_FULL,
  PERFORMANCE_THRESHOLD,
  GENERATOR_CONVERSION_RADIUS,
  CONVERSION_SPREAD_VELOCITY,
  SHOCKWAVE_MAX_RADIUS,
  SHOCKWAVE_DURATION,
  MAX_SHOCKWAVES,
  FORGE_ROTATION_SPEED,
  SPAWNER_ROTATION_SPEED,
  FORGE_VALID_WAIT_TIME_MS,
  FORGE_SPIN_UP_DURATION_MS,
  FORGE_SPIN_DOWN_DURATION_MS,
  FORGE_RADIUS,
} from '../../data/particles/particle-config';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import { getForgeRotationMultiplier } from '../../sim/forge/forge-state';
import {
  checkForgeCrunch,
  startForgeCrunch,
  updateForgeCrunch,
  getCrunchOutput,
} from '../../sim/forge/forge-logic';
import type { ForgeParticleInfo } from '../../sim/forge/forge-logic';

// ─── Types ──────────────────────────────────────────────────────

export interface EquatoriaParticle {
  isActive: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  tierId: TierId;
  sizeIndex: SizeIndex;
  colorString: string;
  glowColorString: string | null;
  size: number;
  minVelocity: number;
  maxVelocity: number;
  forceModifier: number;
  tierIndex: number;
  isMerging: boolean;
  mergeTargetX: number;
  mergeTargetY: number;
  isForgeCrunchParticle: boolean;
  isLockedToPointer: boolean;
  pointerTargetX: number;
  pointerTargetY: number;
  nextVeerTimeMs: number;
}

export interface ActiveMerge {
  particles: EquatoriaParticle[];
  targetX: number;
  targetY: number;
  outputTierId: TierId;
  outputSizeIndex: SizeIndex;
  startTimeMs: number;
  isTierConversion: boolean;
  conversionCount: number;
}

export interface Shockwave {
  x: number;
  y: number;
  radius: number;
  alpha: number;
  timestampMs: number;
  color: string;
}

/** Backward-compatible alias. */
export type Particle = EquatoriaParticle;

// ─── Spatial hash grid ──────────────────────────────────────────

const GRID_CELL_SIZE = SHOCKWAVE_MAX_RADIUS;

interface SpatialGrid {
  cells: Map<string, EquatoriaParticle[]>;
}

function buildSpatialGrid(particles: EquatoriaParticle[]): SpatialGrid {
  const cells = new Map<string, EquatoriaParticle[]>();
  for (const p of particles) {
    const cx = Math.floor(p.x / GRID_CELL_SIZE);
    const cy = Math.floor(p.y / GRID_CELL_SIZE);
    const key = `${cx},${cy}`;
    let cell = cells.get(key);
    if (!cell) { cell = []; cells.set(key, cell); }
    cell.push(p);
  }
  return { cells };
}

function queryNearby(grid: SpatialGrid, x: number, y: number, radius: number): EquatoriaParticle[] {
  const result: EquatoriaParticle[] = [];
  const cx0 = Math.floor((x - radius) / GRID_CELL_SIZE);
  const cx1 = Math.floor((x + radius) / GRID_CELL_SIZE);
  const cy0 = Math.floor((y - radius) / GRID_CELL_SIZE);
  const cy1 = Math.floor((y + radius) / GRID_CELL_SIZE);
  const r2 = radius * radius;
  for (let cx = cx0; cx <= cx1; cx++) {
    for (let cy = cy0; cy <= cy1; cy++) {
      const cell = grid.cells.get(`${cx},${cy}`);
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

// ─── Particle helpers ───────────────────────────────────────────

function initParticle(
  p: EquatoriaParticle,
  tierId: TierId,
  sizeIndex: SizeIndex,
  spawnX: number,
  spawnY: number,
  nowMs: number,
): void {
  const tier = TIER_BY_ID.get(tierId);
  const tierIndex = TIERS.findIndex(t => t.id === tierId);
  p.isActive = true;
  p.tierId = tierId;
  p.sizeIndex = sizeIndex;
  p.x = spawnX + (Math.random() - 0.5) * 6;
  p.y = spawnY + (Math.random() - 0.5) * 6;
  p.vx = 0;
  p.vy = 0;
  p.colorString = tier?.color ?? '#fff';
  p.glowColorString = tier?.glowColor ?? null;
  p.size = BASE_PARTICLE_SIZE * (SIZE_SCALE_MULTIPLIERS[sizeIndex] ?? 1);
  p.minVelocity = MIN_VELOCITY * (SIZE_MIN_VELOCITY_MODIFIERS[sizeIndex] ?? 1);
  p.maxVelocity = MAX_VELOCITY * (SIZE_MAX_VELOCITY_MODIFIERS[sizeIndex] ?? 1);
  p.forceModifier = SIZE_FORCE_MODIFIERS[sizeIndex] ?? 1;
  p.tierIndex = tierIndex >= 0 ? tierIndex : 0;
  p.isMerging = false;
  p.mergeTargetX = 0;
  p.mergeTargetY = 0;
  p.isForgeCrunchParticle = false;
  p.isLockedToPointer = false;
  p.pointerTargetX = 0;
  p.pointerTargetY = 0;
  p.nextVeerTimeMs = nowMs + VEER_INTERVAL_MIN_MS + Math.random() * (VEER_INTERVAL_MAX_MS - VEER_INTERVAL_MIN_MS);
}

function createBlankParticle(): EquatoriaParticle {
  return {
    isActive: false,
    x: 0, y: 0, vx: 0, vy: 0,
    tierId: 'sand',
    sizeIndex: 0 as SizeIndex,
    colorString: '#fff',
    glowColorString: null,
    size: 1,
    minVelocity: MIN_VELOCITY,
    maxVelocity: MAX_VELOCITY,
    forceModifier: 1,
    tierIndex: 0,
    isMerging: false,
    mergeTargetX: 0,
    mergeTargetY: 0,
    isForgeCrunchParticle: false,
    isLockedToPointer: false,
    pointerTargetX: 0,
    pointerTargetY: 0,
    nextVeerTimeMs: 0,
  };
}

// ─── ParticleSystem class ────────────────────────────────────────

export class ParticleSystem {
  particles: EquatoriaParticle[] = [];
  activeMerges: ActiveMerge[] = [];
  shockwaves: Shockwave[] = [];
  forgeRotation = 0;
  spawnerRotations: Map<TierId, number> = new Map();
  mergeCooldownFrames = 0;
  frameCount = 0;

  private readonly _pool: EquatoriaParticle[] = [];

  private _acquireParticle(): EquatoriaParticle {
    return this._pool.pop() ?? createBlankParticle();
  }

  private _releaseParticle(p: EquatoriaParticle): void {
    p.isActive = false;
    this._pool.push(p);
  }

  /** Spawn a particle near the generator for this tier. */
  emit(
    tierId: TierId,
    sizeIndex: SizeIndex,
    generators: readonly GeneratorInfo[],
    nowMs: number,
  ): void {
    if (this.particles.length >= MAX_PARTICLES_FULL) return;
    const gen = generators.find(g => g.tierId === tierId);
    const spawnX = gen?.x ?? 160;
    const spawnY = gen?.y ?? 160;
    const p = this._acquireParticle();
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
      const p = this._acquireParticle();
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
  ): void {
    this.frameCount++;
    const deltaRatio = deltaMs / (1000 / 60);
    const clampedDelta = Math.max(Math.min(deltaRatio, 3), 0.01);

    for (const [tierId] of this.spawnerRotations) {
      const rot = this.spawnerRotations.get(tierId) ?? 0;
      this.spawnerRotations.set(tierId, rot + SPAWNER_ROTATION_SPEED * clampedDelta);
    }

    const spinMult = getForgeRotationMultiplier(
      crunchState, nowMs,
      FORGE_VALID_WAIT_TIME_MS, FORGE_SPIN_UP_DURATION_MS, FORGE_SPIN_DOWN_DURATION_MS,
    );
    this.forgeRotation += FORGE_ROTATION_SPEED * spinMult * clampedDelta;

    const skipPhysics = this.particles.length > PERFORMANCE_THRESHOLD && this.frameCount % 2 === 0;
    if (!skipPhysics) {
      for (const p of this.particles) {
        this._updateParticlePhysics(p, clampedDelta, nowMs, generators, forgeX, forgeY, canvasWidth, canvasHeight);
      }
    }

    if (this.mergeCooldownFrames > 0) this.mergeCooldownFrames--;
    if (this.frameCount % 10 === 0) this._attemptMerge(generators, nowMs);
    if (this.frameCount % 30 === 0) this._enforceParticleLimit(generators, nowMs);

    this._processActiveMerges(nowMs, generators);
    this._checkForgeCrunch(crunchState, forgeX, forgeY, nowMs);
    if (updateForgeCrunch(crunchState, nowMs)) {
      this._completeForgeCrunch(crunchState, forgeX, forgeY, generators, nowMs);
    }

    this._updateShockwaves(nowMs);
  }

  private _updateParticlePhysics(
    p: EquatoriaParticle,
    clampedDelta: number,
    nowMs: number,
    generators: readonly GeneratorInfo[],
    forgeX: number,
    forgeY: number,
    canvasWidth: number,
    canvasHeight: number,
  ): void {
    let isInsideGeneratorField = false;

    if (p.isMerging) {
      const dx = p.mergeTargetX - p.x;
      const dy = p.mergeTargetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const angle = Math.atan2(dy, dx);
        const gatherSpeed = MERGE_GATHER_SPEED * clampedDelta;
        const swirlStrength = 0.3 * (1 - Math.min(dist / 50, 1));
        const tangentAngle = angle + Math.PI / 2;
        p.vx = Math.cos(angle) * gatherSpeed + Math.cos(tangentAngle) * swirlStrength * gatherSpeed;
        p.vy = Math.sin(angle) * gatherSpeed + Math.sin(tangentAngle) * swirlStrength * gatherSpeed;
      } else {
        p.vx = 0;
        p.vy = 0;
      }
    } else if (p.isLockedToPointer) {
      const dx = p.pointerTargetX - p.x;
      const dy = p.pointerTargetY - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > 1) {
        const force = 3.0 * p.forceModifier;
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * force * clampedDelta;
        p.vy += Math.sin(angle) * force * clampedDelta;
      } else {
        const damping = Math.pow(0.8, clampedDelta);
        p.vx *= damping;
        p.vy *= damping;
      }
    } else {
      if (p.sizeIndex !== EXTRA_LARGE_SIZE_INDEX) {
        for (const gen of generators) {
          if (gen.tierId !== p.tierId) continue;
          const dx = gen.x - p.x;
          const dy = gen.y - p.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist <= gen.range && dist > 0.5) {
            isInsideGeneratorField = true;
            const force = (SPAWNER_GRAVITY_STRENGTH / (dist * DISTANCE_SCALE)) * p.forceModifier;
            const angle = Math.atan2(dy, dx);
            p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
            p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
          }
          if (p.sizeIndex === SMALL_SIZE_INDEX && dist > 0.5) {
            const force = (SMALL_TIER_GENERATOR_GRAVITY_STRENGTH / (dist * DISTANCE_SCALE)) * p.forceModifier;
            const angle = Math.atan2(dy, dx);
            p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
            p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
          }
        }
      }

      const fdx = forgeX - p.x;
      const fdy = forgeY - p.y;
      const fdist = Math.sqrt(fdx * fdx + fdy * fdy);
      const isForgeAttractable = p.sizeIndex >= MEDIUM_SIZE_INDEX;
      const forgeRange = p.sizeIndex === EXTRA_LARGE_SIZE_INDEX ? Infinity : MAX_FORGE_ATTRACTION_DISTANCE;
      if (isForgeAttractable && fdist <= forgeRange && fdist > 1) {
        const force = (ATTRACTION_STRENGTH / (fdist * DISTANCE_SCALE)) * p.forceModifier;
        const angle = Math.atan2(fdy, fdx);
        p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
        p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
      }
      if (p.sizeIndex === MEDIUM_SIZE_INDEX && fdist > 0.5) {
        const force = (MEDIUM_TIER_FORGE_GRAVITY_STRENGTH / (fdist * DISTANCE_SCALE)) * p.forceModifier;
        const angle = Math.atan2(fdy, fdx);
        p.vx += Math.cos(angle) * force * FORCE_SCALE * clampedDelta;
        p.vy += Math.sin(angle) * force * FORCE_SCALE * clampedDelta;
      }
    }

    if (!p.isMerging && !p.isLockedToPointer && nowMs >= p.nextVeerTimeMs) {
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      if (speed > 0) {
        const veerDeg = VEER_ANGLE_MIN_DEG + Math.random() * (VEER_ANGLE_MAX_DEG - VEER_ANGLE_MIN_DEG);
        const veerAngle = veerDeg * (Math.PI / 180);
        const dir = Math.random() < 0.5 ? -1 : 1;
        const cosT = Math.cos(veerAngle * dir);
        const sinT = Math.sin(veerAngle * dir);
        const newVx = p.vx * cosT - p.vy * sinT;
        const newVy = p.vx * sinT + p.vy * cosT;
        p.vx = newVx;
        p.vy = newVy;
      }
      p.nextVeerTimeMs = nowMs + VEER_INTERVAL_MIN_MS + Math.random() * (VEER_INTERVAL_MAX_MS - VEER_INTERVAL_MIN_MS);
    }

    const genMinVel = p.minVelocity * Math.max(1, p.tierIndex + 1);
    const minVel = isInsideGeneratorField ? genMinVel : p.minVelocity;
    const genMaxVel = genMinVel * 5 * 0.9;
    const allowedMaxVel = isInsideGeneratorField ? Math.min(p.maxVelocity, genMaxVel) : p.maxVelocity;
    const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
    if (speed > allowedMaxVel) {
      p.vx = (p.vx / speed) * allowedMaxVel;
      p.vy = (p.vy / speed) * allowedMaxVel;
    } else if (speed < minVel && speed > 0) {
      p.vx = (p.vx / speed) * minVel;
      p.vy = (p.vy / speed) * minVel;
    } else if (speed === 0) {
      const angle = Math.random() * Math.PI * 2;
      p.vx = Math.cos(angle) * minVel;
      p.vy = Math.sin(angle) * minVel;
    }

    p.x += p.vx * clampedDelta;
    p.y += p.vy * clampedDelta;

    if (!p.isLockedToPointer) {
      const bounce = 0.8;
      if (p.x < 0) { p.x = 0; p.vx = Math.abs(p.vx) * bounce; }
      if (p.x > canvasWidth) { p.x = canvasWidth; p.vx = -Math.abs(p.vx) * bounce; }
      if (p.y < 0) { p.y = 0; p.vy = Math.abs(p.vy) * bounce; }
      if (p.y > canvasHeight) { p.y = canvasHeight; p.vy = -Math.abs(p.vy) * bounce; }
    } else {
      p.x = Math.max(0, Math.min(canvasWidth, p.x));
      p.y = Math.max(0, Math.min(canvasHeight, p.y));
    }
  }

  private _getGeneratorForTier(tierId: TierId, generators: readonly GeneratorInfo[]): GeneratorInfo | null {
    return generators.find(g => g.tierId === tierId) ?? null;
  }

  private _attemptMerge(generators: readonly GeneratorInfo[], nowMs: number): void {
    if (this.activeMerges.length > 0 || this.mergeCooldownFrames > 0) return;

    const byTierAndSize = new Map<string, EquatoriaParticle[]>();
    for (const p of this.particles) {
      if (p.isMerging) continue;
      const gen = this._getGeneratorForTier(p.tierId, generators);
      if (!gen) continue;
      const dx = p.x - gen.x;
      const dy = p.y - gen.y;
      if (dx * dx + dy * dy > GENERATOR_CONVERSION_RADIUS * GENERATOR_CONVERSION_RADIUS) continue;
      const key = `${p.tierId}-${p.sizeIndex}`;
      let group = byTierAndSize.get(key);
      if (!group) { group = []; byTierAndSize.set(key, group); }
      group.push(p);
    }

    const candidates: { tierId: TierId; sizeIndex: SizeIndex; group: EquatoriaParticle[] }[] = [];
    for (const [key, group] of byTierAndSize) {
      if (group.length < MERGE_THRESHOLD) continue;
      const dashIdx = key.lastIndexOf('-');
      const tierId = key.substring(0, dashIdx) as TierId;
      const sizeIndex = parseInt(key.substring(dashIdx + 1), 10) as SizeIndex;
      if (sizeIndex < EXTRA_LARGE_SIZE_INDEX) {
        candidates.push({ tierId, sizeIndex, group });
      }
    }
    if (candidates.length === 0) return;

    const selected = candidates[Math.floor(Math.random() * candidates.length)];
    const gen = this._getGeneratorForTier(selected.tierId, generators);
    if (!gen) return;

    const toMerge = this._selectRandom(selected.group, MERGE_THRESHOLD);
    for (const p of toMerge) {
      p.isMerging = true;
      p.mergeTargetX = gen.x;
      p.mergeTargetY = gen.y;
    }
    this.activeMerges.push({
      particles: toMerge,
      targetX: gen.x,
      targetY: gen.y,
      outputTierId: selected.tierId,
      outputSizeIndex: (selected.sizeIndex + 1) as SizeIndex,
      startTimeMs: nowMs,
      isTierConversion: false,
      conversionCount: 1,
    });
  }

  private _selectRandom(group: EquatoriaParticle[], count: number): EquatoriaParticle[] {
    const pool = group.slice();
    const selected: EquatoriaParticle[] = [];
    const target = Math.min(count, pool.length);
    for (let i = 0; i < target; i++) {
      const idx = Math.floor(Math.random() * pool.length);
      selected.push(pool[idx]);
      pool.splice(idx, 1);
    }
    return selected;
  }

  private _processActiveMerges(nowMs: number, generators: readonly GeneratorInfo[]): void {
    const toRemove = new Set<EquatoriaParticle>();
    this.activeMerges = this.activeMerges.filter(merge => {
      const allGathered = merge.particles.every(p => {
        const dx = p.x - merge.targetX;
        const dy = p.y - merge.targetY;
        return Math.sqrt(dx * dx + dy * dy) < MERGE_GATHER_THRESHOLD;
      });
      if (!allGathered && nowMs - merge.startTimeMs < MERGE_TIMEOUT_MS) return true;

      for (const p of merge.particles) toRemove.add(p);

      const spawnX = merge.isTierConversion
        ? merge.targetX
        : (generators.find(g => g.tierId === merge.outputTierId)?.x ?? merge.targetX);
      const spawnY = merge.isTierConversion
        ? merge.targetY
        : (generators.find(g => g.tierId === merge.outputTierId)?.y ?? merge.targetY);

      const maxToCreate = merge.isTierConversion ? merge.conversionCount : 1;
      const spawnCount = Math.min(maxToCreate, MAX_PARTICLES_FULL - this.particles.length + merge.particles.length);
      for (let i = 0; i < spawnCount; i++) {
        const np = this._acquireParticle();
        initParticle(np, merge.outputTierId, merge.outputSizeIndex, spawnX, spawnY, nowMs);
        np.vx = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY;
        np.vy = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY;
        this.particles.push(np);
        if (!this.spawnerRotations.has(merge.outputTierId)) {
          this.spawnerRotations.set(merge.outputTierId, Math.random() * Math.PI * 2);
        }
      }

      if (!merge.isTierConversion && this.shockwaves.length < MAX_SHOCKWAVES) {
        const tier = TIER_BY_ID.get(merge.outputTierId);
        this.shockwaves.push({
          x: merge.targetX,
          y: merge.targetY,
          radius: 0,
          alpha: 0.8,
          timestampMs: nowMs,
          color: tier?.color ?? '#fff',
        });
      }

      this.mergeCooldownFrames = Math.max(this.mergeCooldownFrames, 1);
      return false;
    });

    if (toRemove.size > 0) {
      const remaining: EquatoriaParticle[] = [];
      for (const p of this.particles) {
        if (toRemove.has(p)) this._releaseParticle(p);
        else remaining.push(p);
      }
      this.particles = remaining;
    }
  }

  private _enforceParticleLimit(generators: readonly GeneratorInfo[], nowMs: number): void {
    if (this.particles.length < PERFORMANCE_THRESHOLD) return;

    const smallByTier = new Map<TierId, EquatoriaParticle[]>();
    for (const p of this.particles) {
      if (p.sizeIndex !== SMALL_SIZE_INDEX || p.isMerging) continue;
      const gen = this._getGeneratorForTier(p.tierId, generators);
      if (!gen) continue;
      const dx = p.x - gen.x;
      const dy = p.y - gen.y;
      if (dx * dx + dy * dy > GENERATOR_CONVERSION_RADIUS * GENERATOR_CONVERSION_RADIUS) continue;
      let arr = smallByTier.get(p.tierId);
      if (!arr) { arr = []; smallByTier.set(p.tierId, arr); }
      arr.push(p);
    }

    const toRemove = new Set<EquatoriaParticle>();
    for (const [tierId, group] of smallByTier) {
      while (group.length >= MERGE_THRESHOLD && this.particles.length - toRemove.size > PERFORMANCE_THRESHOLD) {
        const batch = group.splice(0, MERGE_THRESHOLD);
        for (const p of batch) toRemove.add(p);
        const gen = this._getGeneratorForTier(tierId, generators);
        if (!gen) continue;
        const np = this._acquireParticle();
        initParticle(np, tierId, MEDIUM_SIZE_INDEX, gen.x, gen.y, nowMs);
        this.particles.push(np);
      }
    }
    if (toRemove.size > 0) {
      const remaining: EquatoriaParticle[] = [];
      for (const p of this.particles) {
        if (toRemove.has(p)) this._releaseParticle(p);
        else remaining.push(p);
      }
      this.particles = remaining;
    }
  }

  private _checkForgeCrunch(
    crunchState: ForgeCrunchState,
    forgeX: number,
    forgeY: number,
    nowMs: number,
  ): void {
    const particleInfos: ForgeParticleInfo[] = this.particles.map(p => ({
      tierId: p.tierId,
      sizeIndex: p.sizeIndex,
      x: p.x,
      y: p.y,
      isMerging: p.isMerging,
    }));
    const result = checkForgeCrunch(crunchState, particleInfos, forgeX, forgeY, FORGE_RADIUS, nowMs);
    if (result) {
      // Build a set of indexes into particleInfos for O(1) lookup
      const resultSet = new Set(result);
      for (let i = 0; i < this.particles.length; i++) {
        if (resultSet.has(particleInfos[i])) {
          const p = this.particles[i];
          p.isMerging = true;
          p.mergeTargetX = forgeX;
          p.mergeTargetY = forgeY;
          p.isForgeCrunchParticle = true;
        }
      }
      startForgeCrunch(crunchState, nowMs);
    }
  }

  private _completeForgeCrunch(
    crunchState: ForgeCrunchState,
    forgeX: number,
    forgeY: number,
    _generators: readonly GeneratorInfo[],
    nowMs: number,
  ): void {
    void crunchState;
    const crunchParticles = this.particles.filter(p => p.isForgeCrunchParticle);
    const toRemove = new Set<EquatoriaParticle>();

    for (const p of crunchParticles) {
      const output = getCrunchOutput(p.tierId, p.sizeIndex);
      if (!output) { toRemove.add(p); continue; }

      toRemove.add(p);
      if (this.particles.length - toRemove.size + 1 < MAX_PARTICLES_FULL) {
        const np = this._acquireParticle();
        initParticle(np, output.outputTierId, output.outputSizeIndex as SizeIndex, forgeX, forgeY, nowMs);
        np.vx = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY;
        np.vy = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY;
        this.particles.push(np);
        if (!this.spawnerRotations.has(output.outputTierId)) {
          this.spawnerRotations.set(output.outputTierId, Math.random() * Math.PI * 2);
        }
      }
    }

    if (toRemove.size > 0) {
      const remaining: EquatoriaParticle[] = [];
      for (const p of this.particles) {
        if (toRemove.has(p)) this._releaseParticle(p);
        else remaining.push(p);
      }
      this.particles = remaining;
    }
  }

  private _updateShockwaves(nowMs: number): void {
    this.shockwaves = this.shockwaves.filter(sw => {
      const elapsed = nowMs - sw.timestampMs;
      if (elapsed >= SHOCKWAVE_DURATION) return false;
      sw.radius += 3.0;
      sw.alpha = 0.8 * (1 - elapsed / SHOCKWAVE_DURATION);
      return true;
    });

    if (this.shockwaves.length > 0) {
      const grid = buildSpatialGrid(this.particles);
      for (const sw of this.shockwaves) {
        const nearby = queryNearby(grid, sw.x, sw.y, sw.radius + 10);
        for (const p of nearby) {
          if (p.isMerging) continue;
          const dx = p.x - sw.x;
          const dy = p.y - sw.y;
          const distSq = dx * dx + dy * dy;
          const rMin = sw.radius - 10;
          const rMax = sw.radius + 10;
          if (distSq < rMin * rMin || distSq > rMax * rMax) continue;
          const dist = Math.sqrt(distSq);
          if (dist < 0.1) continue;
          p.vx += (dx / dist) * 2.5;
          p.vy += (dy / dist) * 2.5;
        }
      }
    }
  }

  /** Render particles and shockwaves to canvas. */
  draw(cc: CanvasContext): void {
    const ctx = cc.ctx;

    const batches = new Map<string, { color: string; glow: string | null; size: number; positions: Array<{ x: number; y: number }> }>();
    for (const p of this.particles) {
      const key = `${p.colorString}|${p.glowColorString ?? 'ng'}|${p.size}`;
      let batch = batches.get(key);
      if (!batch) {
        batch = { color: p.colorString, glow: p.glowColorString, size: p.size, positions: [] };
        batches.set(key, batch);
      }
      batch.positions.push({ x: p.x, y: p.y });
    }

    for (const batch of batches.values()) {
      if (batch.glow) {
        ctx.shadowBlur = batch.size * 3;
        ctx.shadowColor = batch.glow;
      } else {
        ctx.shadowBlur = 0;
      }
      ctx.fillStyle = batch.color;
      const half = batch.size / 2;
      for (const pos of batch.positions) {
        ctx.fillRect(Math.floor(pos.x - half), Math.floor(pos.y - half), Math.ceil(batch.size), Math.ceil(batch.size));
      }
    }
    ctx.shadowBlur = 0;

    for (const sw of this.shockwaves) {
      ctx.strokeStyle = sw.color;
      ctx.globalAlpha = sw.alpha;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(sw.x, sw.y, sw.radius, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
  }

  getForgeParticleInfos(): ForgeParticleInfo[] {
    return this.particles.map(p => ({
      tierId: p.tierId,
      sizeIndex: p.sizeIndex,
      x: p.x,
      y: p.y,
      isMerging: p.isMerging,
    }));
  }

  get particleCount(): number {
    return this.particles.length;
  }
}
