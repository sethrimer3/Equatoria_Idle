/**
 * Particle merge logic — traditional merge at generators and
 * procedural seek-merge anywhere on screen.
 *
 * Performance notes:
 *  - selectRandom uses Fisher-Yates partial shuffle (O(k)) instead
 *    of repeated splice (O(n·k)).
 *  - Merge grouping reuses a module-level Map that is cleared each
 *    call rather than allocating a new one.
 */

import type { TierId } from '../../data/tiers';
import { TIER_BY_ID } from '../../data/tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';
import {
  MERGE_THRESHOLD,
  SMALL_SIZE_INDEX,
  MEDIUM_SIZE_INDEX,
} from '../../data/particles/size-tiers';
import {
  MAX_PARTICLES_FULL,
  PERFORMANCE_THRESHOLD,
  GENERATOR_CONVERSION_RADIUS,
  CONVERSION_SPREAD_VELOCITY,
  MERGE_GATHER_THRESHOLD,
  MERGE_TIMEOUT_MS,
  SHOCKWAVE_MAX_RADIUS,
  MAX_SHOCKWAVES,
  PROCEDURAL_MERGE_THRESHOLD,
  PROCEDURAL_SEEK_BASE_FORCE,
  PROCEDURAL_SEEK_RAMP_PER_SEC,
  PROCEDURAL_SEEK_SNAP_DIST,
  PROCEDURAL_MERGE_TIMEOUT_MS,
} from '../../data/particles/particle-config';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { EquatoriaParticle, ActiveMerge, ProceduralMerge, Shockwave } from './particle-types';
import { ParticlePool, initParticle } from './particle-pool';
import { getShockwaveScaleForSize } from './particle-shockwave';

// ─── Reusable grouping map ──────────────────────────────────────

interface TierSizeGroup {
  tierId: TierId;
  sizeIndex: SizeIndex;
  particles: EquatoriaParticle[];
}

/**
 * Module-level reusable map for grouping particles by tier+size.
 * Cleared before each use to avoid per-frame allocation.
 */
const _groupMap = new Map<number, TierSizeGroup>();

/**
 * Encode tierId index + sizeIndex into a single numeric key.
 * Assumes sizeIndex < 256 and tierIndex < 256.
 */
function groupKey(tierIndex: number, sizeIndex: SizeIndex): number {
  return (tierIndex << 8) | sizeIndex;
}

// ─── Fisher-Yates partial shuffle ────────────────────────────────

function selectRandom(
  group: EquatoriaParticle[],
  count: number,
): EquatoriaParticle[] {
  const n = group.length;
  const target = Math.min(count, n);
  // Partial Fisher-Yates shuffle — swap selected elements to front
  for (let i = 0; i < target; i++) {
    const j = i + Math.floor(Math.random() * (n - i));
    const tmp = group[i];
    group[i] = group[j];
    group[j] = tmp;
  }
  return group.slice(0, target);
}

// ─── Generator lookup ────────────────────────────────────────────

function getGeneratorForTier(
  tierId: TierId,
  generators: readonly GeneratorInfo[],
): GeneratorInfo | null {
  for (let i = 0, len = generators.length; i < len; i++) {
    if (generators[i].tierId === tierId) return generators[i];
  }
  return null;
}

// ─── Traditional merge at generators ─────────────────────────────

export function attemptMerge(
  particles: EquatoriaParticle[],
  activeMerges: ActiveMerge[],
  mergeCooldownFrames: number,
  generators: readonly GeneratorInfo[],
  nowMs: number,
): number {
  if (activeMerges.length > 0 || mergeCooldownFrames > 0) return mergeCooldownFrames;

  _groupMap.clear();
  const convRadSq = GENERATOR_CONVERSION_RADIUS * GENERATOR_CONVERSION_RADIUS;

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isMerging) continue;
    const gen = getGeneratorForTier(p.tierId, generators);
    if (!gen) continue;
    const dx = p.x - gen.x;
    const dy = p.y - gen.y;
    if (dx * dx + dy * dy > convRadSq) continue;

    const key = groupKey(p.tierIndex, p.sizeIndex);
    let group = _groupMap.get(key);
    if (!group) {
      group = { tierId: p.tierId, sizeIndex: p.sizeIndex, particles: [] };
      _groupMap.set(key, group);
    }
    group.particles.push(p);
  }

  // Find candidates
  const candidates: TierSizeGroup[] = [];
  for (const group of _groupMap.values()) {
    if (group.particles.length >= MERGE_THRESHOLD) {
      candidates.push(group);
    }
  }

  // Clear group arrays for reuse (don't hold references)
  for (const group of _groupMap.values()) {
    if (!candidates.includes(group)) group.particles.length = 0;
  }

  if (candidates.length === 0) return mergeCooldownFrames;

  const selected = candidates[Math.floor(Math.random() * candidates.length)];
  const gen = getGeneratorForTier(selected.tierId, generators);
  if (!gen) {
    for (const c of candidates) c.particles.length = 0;
    return mergeCooldownFrames;
  }

  const toMerge = selectRandom(selected.particles, MERGE_THRESHOLD);
  for (let i = 0, len = toMerge.length; i < len; i++) {
    const p = toMerge[i];
    p.isMerging = true;
    p.mergeTargetX = gen.x;
    p.mergeTargetY = gen.y;
  }
  activeMerges.push({
    particles: toMerge,
    targetX: gen.x,
    targetY: gen.y,
    outputTierId: selected.tierId,
    outputSizeIndex: (selected.sizeIndex + 1) as SizeIndex,
    startTimeMs: nowMs,
    isTierConversion: false,
    conversionCount: 1,
  });

  // Clear remaining candidate arrays
  for (const c of candidates) c.particles.length = 0;

  return mergeCooldownFrames;
}

// ─── Process active merges ──────────────────────────────────────

export function processActiveMerges(
  particles: EquatoriaParticle[],
  activeMerges: ActiveMerge[],
  shockwaves: Shockwave[],
  pool: ParticlePool,
  spawnerRotations: Map<TierId, number>,
  nowMs: number,
  generators: readonly GeneratorInfo[],
): { particles: EquatoriaParticle[]; mergeCooldownFrames: number } {
  const toRemove = new Set<EquatoriaParticle>();
  let cooldown = 0;

  let writeIdx = 0;
  for (let mi = 0, mlen = activeMerges.length; mi < mlen; mi++) {
    const merge = activeMerges[mi];
    let allGathered = true;
    for (let pi = 0, plen = merge.particles.length; pi < plen; pi++) {
      const p = merge.particles[pi];
      const dx = p.x - merge.targetX;
      const dy = p.y - merge.targetY;
      if (dx * dx + dy * dy >= MERGE_GATHER_THRESHOLD * MERGE_GATHER_THRESHOLD) {
        allGathered = false;
        break;
      }
    }

    if (!allGathered && nowMs - merge.startTimeMs < MERGE_TIMEOUT_MS) {
      activeMerges[writeIdx++] = merge;
      continue;
    }

    // Merge complete
    for (let pi = 0, plen = merge.particles.length; pi < plen; pi++) {
      toRemove.add(merge.particles[pi]);
    }

    const spawnGen = getGeneratorForTier(merge.outputTierId, generators);
    const spawnX = merge.isTierConversion ? merge.targetX : (spawnGen?.x ?? merge.targetX);
    const spawnY = merge.isTierConversion ? merge.targetY : (spawnGen?.y ?? merge.targetY);

    const maxToCreate = merge.isTierConversion ? merge.conversionCount : 1;
    const spawnCount = Math.min(maxToCreate, MAX_PARTICLES_FULL - particles.length + merge.particles.length);
    for (let i = 0; i < spawnCount; i++) {
      const np = pool.acquire();
      initParticle(np, merge.outputTierId, merge.outputSizeIndex, spawnX, spawnY, nowMs);
      np.vx = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY;
      np.vy = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY;
      particles.push(np);
      if (!spawnerRotations.has(merge.outputTierId)) {
        spawnerRotations.set(merge.outputTierId, Math.random() * Math.PI * 2);
      }
    }

    if (!merge.isTierConversion && shockwaves.length < MAX_SHOCKWAVES) {
      const tier = TIER_BY_ID.get(merge.outputTierId);
      const shockwaveScale = getShockwaveScaleForSize(merge.outputSizeIndex);
      shockwaves.push({
        x: merge.targetX,
        y: merge.targetY,
        radius: 0,
        maxRadius: SHOCKWAVE_MAX_RADIUS * shockwaveScale,
        edgeThickness: 10 * Math.max(shockwaveScale, 0.1),
        pushForce: 2.5 * shockwaveScale,
        alpha: 0.8,
        timestampMs: nowMs,
        color: tier?.color ?? '#fff',
      });
    }

    cooldown = Math.max(cooldown, 1);
  }
  activeMerges.length = writeIdx;

  // Remove consumed particles
  if (toRemove.size > 0) {
    let wp = 0;
    for (let i = 0, len = particles.length; i < len; i++) {
      const p = particles[i];
      if (toRemove.has(p)) pool.release(p);
      else particles[wp++] = p;
    }
    particles.length = wp;
  }

  return { particles, mergeCooldownFrames: cooldown };
}

// ─── Enforce particle limit ─────────────────────────────────────

export function enforceParticleLimit(
  particles: EquatoriaParticle[],
  pool: ParticlePool,
  generators: readonly GeneratorInfo[],
  nowMs: number,
): EquatoriaParticle[] {
  if (particles.length < PERFORMANCE_THRESHOLD) return particles;

  const smallByTier = new Map<TierId, EquatoriaParticle[]>();
  const convRadSq = GENERATOR_CONVERSION_RADIUS * GENERATOR_CONVERSION_RADIUS;
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.sizeIndex !== SMALL_SIZE_INDEX || p.isMerging) continue;
    const gen = getGeneratorForTier(p.tierId, generators);
    if (!gen) continue;
    const dx = p.x - gen.x;
    const dy = p.y - gen.y;
    if (dx * dx + dy * dy > convRadSq) continue;
    let arr = smallByTier.get(p.tierId);
    if (!arr) { arr = []; smallByTier.set(p.tierId, arr); }
    arr.push(p);
  }

  const toRemove = new Set<EquatoriaParticle>();
  for (const [tierId, group] of smallByTier) {
    while (group.length >= MERGE_THRESHOLD && particles.length - toRemove.size > PERFORMANCE_THRESHOLD) {
      const batch = group.splice(0, MERGE_THRESHOLD);
      for (let i = 0; i < batch.length; i++) toRemove.add(batch[i]);
      const gen = getGeneratorForTier(tierId, generators);
      if (!gen) continue;
      const np = pool.acquire();
      initParticle(np, tierId, MEDIUM_SIZE_INDEX, gen.x, gen.y, nowMs);
      particles.push(np);
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

// ─── Procedural merge (seek & combine anywhere) ──────────────────

const _proceduralGroupMap = new Map<number, TierSizeGroup>();

export function attemptProceduralMerge(
  particles: EquatoriaParticle[],
  proceduralMerges: ProceduralMerge[],
  nowMs: number,
): void {
  _proceduralGroupMap.clear();

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isMerging || p.isProceduralSeeking) continue;
    const key = groupKey(p.tierIndex, p.sizeIndex);
    let group = _proceduralGroupMap.get(key);
    if (!group) {
      group = { tierId: p.tierId, sizeIndex: p.sizeIndex, particles: [] };
      _proceduralGroupMap.set(key, group);
    }
    group.particles.push(p);
  }

  for (const group of _proceduralGroupMap.values()) {
    if (group.particles.length < PROCEDURAL_MERGE_THRESHOLD) {
      group.particles.length = 0;
      continue;
    }

    const selected = selectRandom(group.particles, PROCEDURAL_MERGE_THRESHOLD);

    let cx = 0, cy = 0;
    for (let i = 0, len = selected.length; i < len; i++) {
      cx += selected[i].x;
      cy += selected[i].y;
    }
    cx /= selected.length;
    cy /= selected.length;

    for (let i = 0, len = selected.length; i < len; i++) {
      const p = selected[i];
      p.isProceduralSeeking = true;
      p.proceduralTargetX = cx;
      p.proceduralTargetY = cy;
    }

    proceduralMerges.push({
      particles: selected,
      sizeIndex: group.sizeIndex,
      tierId: group.tierId,
      startTimeMs: nowMs,
      centroidX: cx,
      centroidY: cy,
    });

    group.particles.length = 0;
  }
}

export function updateProceduralMerges(
  particles: EquatoriaParticle[],
  proceduralMerges: ProceduralMerge[],
  shockwaves: Shockwave[],
  pool: ParticlePool,
  nowMs: number,
  clampedDelta: number,
): EquatoriaParticle[] {
  const toRemove = new Set<EquatoriaParticle>();

  let writeIdx = 0;
  for (let mi = 0, mlen = proceduralMerges.length; mi < mlen; mi++) {
    const merge = proceduralMerges[mi];
    const elapsedMs = nowMs - merge.startTimeMs;
    const elapsedSec = elapsedMs / 1000;

    let cx = 0, cy = 0, count = 0;
    for (let pi = 0, plen = merge.particles.length; pi < plen; pi++) {
      const p = merge.particles[pi];
      if (!p.isActive) continue;
      cx += p.x; cy += p.y; count++;
    }
    if (count === 0) continue;
    cx /= count;
    cy /= count;
    merge.centroidX = cx;
    merge.centroidY = cy;

    const seekForce = PROCEDURAL_SEEK_BASE_FORCE + PROCEDURAL_SEEK_RAMP_PER_SEC * elapsedSec;

    let allGathered = true;
    for (let pi = 0, plen = merge.particles.length; pi < plen; pi++) {
      const p = merge.particles[pi];
      if (!p.isActive) continue;
      const dx = cx - p.x;
      const dy = cy - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > PROCEDURAL_SEEK_SNAP_DIST) {
        allGathered = false;
        const angle = Math.atan2(dy, dx);
        p.vx += Math.cos(angle) * seekForce * clampedDelta;
        p.vy += Math.sin(angle) * seekForce * clampedDelta;
      }
      p.proceduralTargetX = cx;
      p.proceduralTargetY = cy;
    }

    if (allGathered || elapsedMs >= PROCEDURAL_MERGE_TIMEOUT_MS) {
      for (let pi = 0, plen = merge.particles.length; pi < plen; pi++) {
        const p = merge.particles[pi];
        if (p.isActive) toRemove.add(p);
      }

      if (particles.length - toRemove.size + 1 <= MAX_PARTICLES_FULL) {
        const np = pool.acquire();
        const newSizeIndex = (merge.sizeIndex + 1) as SizeIndex;
        initParticle(np, merge.tierId, newSizeIndex, cx, cy, nowMs);
        np.vx = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY * 0.5;
        np.vy = (Math.random() - 0.5) * CONVERSION_SPREAD_VELOCITY * 0.5;
        particles.push(np);

        if (shockwaves.length < MAX_SHOCKWAVES) {
          const tier = TIER_BY_ID.get(merge.tierId);
          const shockwaveScale = getShockwaveScaleForSize(newSizeIndex);
          shockwaves.push({
            x: cx,
            y: cy,
            radius: 0,
            maxRadius: SHOCKWAVE_MAX_RADIUS * shockwaveScale,
            edgeThickness: 10 * Math.max(shockwaveScale, 0.1),
            pushForce: 2.5 * shockwaveScale,
            alpha: 0.6,
            timestampMs: nowMs,
            color: tier?.color ?? '#fff',
          });
        }
      }
      continue; // don't keep this merge
    }

    proceduralMerges[writeIdx++] = merge;
  }
  proceduralMerges.length = writeIdx;

  if (toRemove.size > 0) {
    let wp = 0;
    for (let i = 0, len = particles.length; i < len; i++) {
      const p = particles[i];
      if (toRemove.has(p)) {
        p.isProceduralSeeking = false;
        pool.release(p);
      } else {
        particles[wp++] = p;
      }
    }
    particles.length = wp;
  }

  return particles;
}
