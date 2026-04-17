/**
 * Particle merge logic — suction merge at generators.
 *
 * When any (tierId, sizeIndex) group reaches MERGE_THRESHOLD particles,
 * all 100 are immediately teleported to their generator center and an
 * animated trail plays for MERGE_TRAIL_DRAW_DURATION_MS + MERGE_TRAIL_ERASE_DURATION_MS
 * before the merge is finalised and the larger particle is spawned.
 *
 * Only MERGE_TRAIL_COUNT of the 100 particles display a trail; the rest are
 * invisible during the animation (skipped in rendering).
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
  SHOCKWAVE_MAX_RADIUS,
  MAX_SHOCKWAVES,
  MERGE_TRAIL_COUNT,
  MERGE_TRAIL_DRAW_DURATION_MS,
  MERGE_TRAIL_ERASE_DURATION_MS,
  MERGE_TRAIL_CURVE_ANGLE_DEG,
} from '../../data/particles/particle-config';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { EquatoriaParticle, ActiveMerge, Shockwave } from './particle-types';
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

/**
 * Select `count` random particles from `group` using a partial
 * Fisher-Yates shuffle. **Mutates** `group` in-place by swapping
 * selected elements to the front — callers should not rely on the
 * original order of `group` after this call.
 */
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

// ─── Suction merge (global count → generator pull) ───────────────

/**
 * When any (tierId, sizeIndex) group reaches MERGE_THRESHOLD (100) particles,
 * all MERGE_THRESHOLD particles are immediately teleported to their generator
 * center and an animated trail plays before the merge is finalised.
 * Only MERGE_TRAIL_COUNT particles display a visible trail; the rest are
 * held invisibly at the generator until the animation completes.
 */
export function attemptSuctionMerge(
  particles: EquatoriaParticle[],
  activeMerges: ActiveMerge[],
  generators: readonly GeneratorInfo[],
  nowMs: number,
): void {
  _groupMap.clear();

  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.isMerging) continue; // already in-flight
    const key = groupKey(p.tierIndex, p.sizeIndex);
    let group = _groupMap.get(key);
    if (!group) {
      group = { tierId: p.tierId, sizeIndex: p.sizeIndex, particles: [] };
      _groupMap.set(key, group);
    }
    group.particles.push(p);
  }

  for (const group of _groupMap.values()) {
    if (group.particles.length < MERGE_THRESHOLD) {
      group.particles.length = 0;
      continue;
    }

    const gen = getGeneratorForTier(group.tierId, generators);
    if (!gen) {
      group.particles.length = 0;
      continue;
    }

    const toMerge = group.particles.length === MERGE_THRESHOLD
      ? group.particles.slice()
      : selectRandom(group.particles, MERGE_THRESHOLD);

    // Select which particles display trails (up to MERGE_TRAIL_COUNT).
    // We shuffle only the first MERGE_TRAIL_COUNT slots so the selection is random.
    const numTrails = Math.min(MERGE_TRAIL_COUNT, toMerge.length);
    const trailStartXY: number[] = [];
    const trailCurveAngles: number[] = [];

    for (let ti = 0; ti < numTrails; ti++) {
      const j = ti + Math.floor(Math.random() * (toMerge.length - ti));
      const tmp = toMerge[ti];
      toMerge[ti] = toMerge[j];
      toMerge[j] = tmp;
      trailStartXY.push(toMerge[ti].x, toMerge[ti].y);
      trailCurveAngles.push((Math.random() * 2 - 1) * MERGE_TRAIL_CURVE_ANGLE_DEG * (Math.PI / 180));
    }

    const tier = TIER_BY_ID.get(group.tierId);

    // Teleport ALL particles to the generator immediately.
    for (let i = 0, len = toMerge.length; i < len; i++) {
      const p = toMerge[i];
      p.isMerging = true;
      p.mergeTargetX = gen.x;
      p.mergeTargetY = gen.y;
      p.suctionStartX = p.x;
      p.suctionStartY = p.y;
      // Teleport: place at generator with a tiny random scatter so they don't
      // all stack exactly — keeps physics well-behaved during the wait.
      p.x = gen.x + (Math.random() - 0.5) * 2;
      p.y = gen.y + (Math.random() - 0.5) * 2;
      p.vx = 0;
      p.vy = 0;
      // Clear stale trail data so no old positions bleed through.
      p.trailHead = 0;
      p.trailCount = 0;
    }

    activeMerges.push({
      particles: toMerge,
      targetX: gen.x,
      targetY: gen.y,
      outputTierId: group.tierId,
      outputSizeIndex: (group.sizeIndex + 1) as SizeIndex,
      startTimeMs: nowMs,
      isTierConversion: false,
      conversionCount: 1,
      trailColor: tier?.color ?? '#ffffff',
      trailStartXY,
      trailCurveAngles,
      trailCount: numTrails,
      trailAnimStartMs: nowMs,
      trailDrawDurationMs: MERGE_TRAIL_DRAW_DURATION_MS,
      trailEraseDurationMs: MERGE_TRAIL_ERASE_DURATION_MS,
    });

    group.particles.length = 0;
  }
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
): { particles: EquatoriaParticle[]; mergeCooldownFrames: number; completedCount: number } {
  const toRemove = new Set<EquatoriaParticle>();
  let cooldown = 0;
  let completedCount = 0;

  let writeIdx = 0;
  for (let mi = 0, mlen = activeMerges.length; mi < mlen; mi++) {
    const merge = activeMerges[mi];

    // Wait for the trail animation to finish before completing the merge.
    const animDuration = merge.trailDrawDurationMs + merge.trailEraseDurationMs;
    if (nowMs - merge.trailAnimStartMs < animDuration) {
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
    completedCount++;
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

  return { particles, mergeCooldownFrames: cooldown, completedCount };
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


