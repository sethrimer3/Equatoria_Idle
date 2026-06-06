/**
 * citrine-stability.test.ts
 *
 * Regression tests for the Citrine+ generator-field min-velocity bug (PR #277 follow-up).
 *
 * Root cause: the old `genMinVel = min(minVelocity * (tierIndex+1), PL_MAX_VELOCITY)` formula
 * caused Citrine (tierIndex 4) and higher to have genMinVel == PL_MAX_VELOCITY, so they could
 * never decelerate inside their generator field and were flung past loom capture zones.
 *
 * Fix: tierBoost is now capped at GENERATOR_FIELD_MIN_VELOCITY_TIER_CAP (4), so Citrine+
 * get the same boost as Sunstone (×4 = 1.248) instead of being pinned at 1.5.
 */

import { describe, it, expect } from 'vitest';
import { updateParticlePhysics } from '../particle-physics';
import type { EquatoriaParticle } from '../particle-types';
import type { GeneratorInfo } from '../../../sim/particles/generator-state';
import { PL_MAX_VELOCITY } from '../../../data/particles/particle-life-config';
import { MIN_VELOCITY } from '../../../data/particles/particle-config';
import { MEDIUM_SIZE_INDEX } from '../../../data/particles/size-tiers';

// Internal constant mirrored here for test assertions.
// If the value changes in particle-physics.ts these tests will catch the mismatch.
const GENERATOR_FIELD_MIN_VELOCITY_TIER_CAP = 4;

function expectedGenMinVel(tierIndex: number): number {
  const tierBoost = Math.min(Math.max(1, tierIndex + 1), GENERATOR_FIELD_MIN_VELOCITY_TIER_CAP);
  return MIN_VELOCITY * tierBoost;
}

function makeParticle(tierId: string, tierIndex: number, overrides: Partial<EquatoriaParticle> = {}): EquatoriaParticle {
  return {
    isActive: true,
    x: 0, y: 0,
    vx: 0, vy: 0,
    tierId: tierId as EquatoriaParticle['tierId'],
    sizeIndex: MEDIUM_SIZE_INDEX,
    colorString: '#fff',
    glowColorString: null,
    size: 2,
    minVelocity: MIN_VELOCITY,
    maxVelocity: PL_MAX_VELOCITY,
    forceModifier: 1,
    tierIndex,
    isMerging: false,
    mergeTargetX: 0, mergeTargetY: 0,
    isForgeCrunchParticle: false,
    isLockedToPointer: false,
    pointerTargetX: 0, pointerTargetY: 0,
    nextVeerTimeMs: Infinity,
    trailX: new Float64Array(10),
    trailY: new Float64Array(10),
    trailHead: 0, trailCount: 0, trailFrameCounter: 0,
    suctionStartX: 0, suctionStartY: 0,
    dragReleaseTimeMs: 0,
    isCaptured: false,
    capturedById: '',
    particleId: 1,
    ...overrides,
  };
}

function makeGenerator(tierId: string, tierIndex: number, x: number, y: number, range: number): GeneratorInfo {
  return { tierId: tierId as GeneratorInfo['tierId'], x, y, range, tierIndex };
}

// ─── genMinVel formula assertions ───────────────────────────────

describe('generator-field min-velocity tier cap', () => {
  it('Sand (tierIndex 0) gets ×1 boost', () => {
    expect(expectedGenMinVel(0)).toBeCloseTo(MIN_VELOCITY * 1);
  });

  it('Sunstone (tierIndex 3) gets ×4 boost', () => {
    expect(expectedGenMinVel(3)).toBeCloseTo(MIN_VELOCITY * 4);
  });

  it('Citrine (tierIndex 4) gets ×4 boost — same as Sunstone, capped', () => {
    expect(expectedGenMinVel(4)).toBeCloseTo(expectedGenMinVel(3));
  });

  it('Emerald (tierIndex 5) gets ×4 boost — same cap', () => {
    expect(expectedGenMinVel(5)).toBeCloseTo(expectedGenMinVel(4));
  });

  it('Sapphire (tierIndex 6) gets ×4 boost — same cap', () => {
    expect(expectedGenMinVel(6)).toBeCloseTo(expectedGenMinVel(4));
  });

  it('Diamond (tierIndex 9) gets ×4 boost — same cap', () => {
    expect(expectedGenMinVel(9)).toBeCloseTo(expectedGenMinVel(4));
  });

  it('Nullstone (tierIndex 10) gets ×4 boost — same cap', () => {
    expect(expectedGenMinVel(10)).toBeCloseTo(expectedGenMinVel(4));
  });

  it('Citrine+ genMinVel is strictly less than PL_MAX_VELOCITY', () => {
    for (const ti of [4, 5, 6, 7, 8, 9, 10]) {
      expect(expectedGenMinVel(ti)).toBeLessThan(PL_MAX_VELOCITY);
    }
  });
});

// ─── updateParticlePhysics integration checks ───────────────────

describe('updateParticlePhysics — Citrine+ genMinVel is not PL_MAX_VELOCITY', () => {
  const GEN_X = 160, GEN_Y = 160;
  const CANVAS = 320;

  // A particle starting at rest inside a generator field should be bumped up to
  // genMinVel (not PL_MAX_VELOCITY) after one physics step.
  function runOneStep(tierIndex: number, tierId: string): number {
    const p = makeParticle(tierId, tierIndex, {
      x: GEN_X,
      y: GEN_Y + 12, // inside range (dist=12 > GRAVITY_MIN_DIST=0.5, dist=12 <= 50)
      vx: 0, vy: 0,
    });
    const gen = makeGenerator(tierId, tierIndex, GEN_X, GEN_Y, 50);
    updateParticlePhysics(p, 1, 0, [gen], GEN_X, GEN_Y, CANVAS, CANVAS, false);
    return Math.sqrt(p.vx * p.vx + p.vy * p.vy);
  }

  it('Citrine (tierIndex 4) speed after one step equals capped genMinVel, not PL_MAX_VELOCITY', () => {
    const speed = runOneStep(4, 'citrine');
    expect(speed).toBeLessThan(PL_MAX_VELOCITY);
    expect(speed).toBeCloseTo(expectedGenMinVel(4), 3);
  });

  it('Emerald (tierIndex 5) speed after one step equals capped genMinVel, not PL_MAX_VELOCITY', () => {
    const speed = runOneStep(5, 'emerald');
    expect(speed).toBeLessThan(PL_MAX_VELOCITY);
    expect(speed).toBeCloseTo(expectedGenMinVel(5), 3);
  });

  it('Sapphire (tierIndex 6) speed after one step equals capped genMinVel, not PL_MAX_VELOCITY', () => {
    const speed = runOneStep(6, 'sapphire');
    expect(speed).toBeLessThan(PL_MAX_VELOCITY);
    expect(speed).toBeCloseTo(expectedGenMinVel(6), 3);
  });

  it('Diamond (tierIndex 9) speed after one step equals capped genMinVel, not PL_MAX_VELOCITY', () => {
    const speed = runOneStep(9, 'diamond');
    expect(speed).toBeLessThan(PL_MAX_VELOCITY);
    expect(speed).toBeCloseTo(expectedGenMinVel(9), 3);
  });

  it('Nullstone (tierIndex 10) speed after one step equals capped genMinVel, not PL_MAX_VELOCITY', () => {
    const speed = runOneStep(10, 'nullstone');
    expect(speed).toBeLessThan(PL_MAX_VELOCITY);
    expect(speed).toBeCloseTo(expectedGenMinVel(10), 3);
  });
});

// ─── Bounded simulation: particle stays near its generator ───────

describe('updateParticlePhysics — Citrine+ stays near generator over many steps', () => {
  const GEN_X = 160, GEN_Y = 160;
  const CANVAS = 320;
  const GEN_RANGE = 50;

  function simulate(tierIndex: number, tierId: string, steps: number): { maxDist: number; finalSpeed: number } {
    const p = makeParticle(tierId, tierIndex, {
      x: GEN_X + GEN_RANGE * 0.5,
      y: GEN_Y,
      vx: 0, vy: 0,
    });
    const gen = makeGenerator(tierId, tierIndex, GEN_X, GEN_Y, GEN_RANGE);
    let maxDist = 0;
    for (let i = 0; i < steps; i++) {
      updateParticlePhysics(p, 1, i * 16, [gen], GEN_X, GEN_Y, CANVAS, CANVAS, false);
      const dx = p.x - GEN_X;
      const dy = p.y - GEN_Y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > maxDist) maxDist = dist;
    }
    return { maxDist, finalSpeed: Math.sqrt(p.vx * p.vx + p.vy * p.vy) };
  }

  // Particles bounce off the canvas walls so their distance from the generator
  // is bounded by sqrt(160^2+160^2) ≈ 226 px on the 320-px canvas.
  // 210 px leaves headroom while catching genuine corner-pinning regressions.
  const ESCAPE_DIST = 210;

  for (const [tierId, tierIndex] of [
    ['citrine', 4],
    ['emerald', 5],
    ['sapphire', 6],
    ['diamond', 9],
    ['nullstone', 10],
  ] as [string, number][]) {
    it(`${tierId} (tierIndex ${tierIndex}) stays within ${ESCAPE_DIST} px of its generator over 180 steps`, () => {
      const { maxDist } = simulate(tierIndex, tierId, 180);
      expect(maxDist).toBeLessThan(ESCAPE_DIST);
    });

    it(`${tierId} (tierIndex ${tierIndex}) final speed does not exceed PL_MAX_VELOCITY`, () => {
      const { finalSpeed } = simulate(tierIndex, tierId, 180);
      expect(finalSpeed).toBeLessThanOrEqual(PL_MAX_VELOCITY + 1e-9);
    });
  }
});
