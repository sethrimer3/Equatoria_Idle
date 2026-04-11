/**
 * Particle object pool & lifecycle management.
 *
 * Handles creation, initialisation and recycling of EquatoriaParticle
 * objects.  Reuses objects from a pool to avoid per-frame allocation.
 */

import type { TierId } from '../../data/tiers';
import { TIERS, TIER_BY_ID } from '../../data/tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';
import {
  getSizeScaleMultiplier,
  getSizeMinVelocityModifier,
  getSizeMaxVelocityModifier,
  getSizeForceModifier,
} from '../../data/particles/size-tiers';
import {
  BASE_PARTICLE_SIZE,
  MIN_VELOCITY,
  MAX_VELOCITY,
  VEER_INTERVAL_MIN_MS,
  VEER_INTERVAL_MAX_MS,
} from '../../data/particles/particle-config';
import type { EquatoriaParticle } from './particle-types';

// ─── Pre-computed tier-index lookup ──────────────────────────────

const TIER_INDEX_MAP: ReadonlyMap<TierId, number> = (() => {
  const m = new Map<TierId, number>();
  for (let i = 0; i < TIERS.length; i++) m.set(TIERS[i].id, i);
  return m;
})();

// ─── Maximum trail capacity for the ring-buffer ──────────────────

const MAX_TRAIL_CAPACITY = 16;

// ─── Blank particle factory ──────────────────────────────────────

function createBlankParticle(): EquatoriaParticle {
  return {
    isActive: false,
    x: 0, y: 0, vx: 0, vy: 0,
    tierId: 'sand' as TierId,
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
    suctionStartX: 0,
    suctionStartY: 0,
    isForgeCrunchParticle: false,
    isLockedToPointer: false,
    pointerTargetX: 0,
    pointerTargetY: 0,
    nextVeerTimeMs: 0,
    trailX: new Float64Array(MAX_TRAIL_CAPACITY),
    trailY: new Float64Array(MAX_TRAIL_CAPACITY),
    trailHead: 0,
    trailCount: 0,
    trailFrameCounter: 0,
  };
}

// ─── Init helper ─────────────────────────────────────────────────

export function initParticle(
  p: EquatoriaParticle,
  tierId: TierId,
  sizeIndex: SizeIndex,
  spawnX: number,
  spawnY: number,
  nowMs: number,
): void {
  const tier = TIER_BY_ID.get(tierId);
  const tierIndex = TIER_INDEX_MAP.get(tierId) ?? 0;
  p.isActive = true;
  p.tierId = tierId;
  p.sizeIndex = sizeIndex;
  p.x = spawnX + (Math.random() - 0.5) * 6;
  p.y = spawnY + (Math.random() - 0.5) * 6;
  p.vx = 0;
  p.vy = 0;
  p.colorString = tier?.color ?? '#fff';
  p.glowColorString = tier?.glowColor ?? null;
  p.size = BASE_PARTICLE_SIZE * getSizeScaleMultiplier(sizeIndex);
  p.minVelocity = MIN_VELOCITY * getSizeMinVelocityModifier(sizeIndex);
  p.maxVelocity = MAX_VELOCITY * getSizeMaxVelocityModifier(sizeIndex);
  p.forceModifier = getSizeForceModifier(sizeIndex);
  p.tierIndex = tierIndex;
  p.isMerging = false;
  p.mergeTargetX = 0;
  p.mergeTargetY = 0;
  p.suctionStartX = 0;
  p.suctionStartY = 0;
  p.isForgeCrunchParticle = false;
  p.isLockedToPointer = false;
  p.pointerTargetX = 0;
  p.pointerTargetY = 0;
  p.nextVeerTimeMs = nowMs + VEER_INTERVAL_MIN_MS + Math.random() * (VEER_INTERVAL_MAX_MS - VEER_INTERVAL_MIN_MS);
  p.trailHead = 0;
  p.trailCount = 0;
  p.trailFrameCounter = 0;
}

// ─── Pool ────────────────────────────────────────────────────────

export class ParticlePool {
  private readonly _pool: EquatoriaParticle[] = [];

  acquire(): EquatoriaParticle {
    return this._pool.pop() ?? createBlankParticle();
  }

  release(p: EquatoriaParticle): void {
    p.isActive = false;
    p.trailHead = 0;
    p.trailCount = 0;
    p.suctionStartX = 0;
    p.suctionStartY = 0;
    this._pool.push(p);
  }
}
