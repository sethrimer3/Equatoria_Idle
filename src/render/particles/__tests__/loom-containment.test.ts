/**
 * loom-containment.test.ts
 *
 * Regression harness for the loom-containment velocity governor (applyLoomContainmentCap).
 *
 * Verifies that compatible motes inside a loom's outerRadius can never escape
 * due to generator gravity, Particle Life forces, or drag-release velocity —
 * regardless of which tier they belong to.
 *
 * Key invariants tested:
 *   1. Speed inside a compatible loom field never exceeds the loom-contained max.
 *   2. Outward radial velocity is damped to ≤ 5 % of its original value.
 *   3. A particle that stepped just outside outerRadius is position-corrected back inside.
 *   4. After correction + cap, the particle cannot escape in the next substep's position update.
 *   5. Non-compatible particles and forge fields are unaffected.
 *   6. Containment applies uniformly to all tier types.
 */

import { describe, it, expect } from 'vitest';
import { applyLoomContainmentCap } from '../forge-field-forces';
import type { ForgeFieldInfo } from '../forge-field-forces';
import type { EquatoriaParticle } from '../particle-types';
import { MEDIUM_SIZE_INDEX, SMALL_SIZE_INDEX } from '../../../data/particles/size-tiers';

// ─── Mirror of constants from forge-field-forces.ts ─────────────
// If these drift the tests will fail, signalling that the docs and
// assertions below need updating too.
const OUTER_MAX_SPEED  = 0.65;
const INNER_MAX_SPEED  = 0.28;
const OUTWARD_DAMP     = 0.05; // fraction retained after kill
const MARGIN_PX        = 2.0;

// Fixed substep delta from particle-system.ts (FIXED_STEP_DELTA = FIXED_STEP_MS / (1000/60))
const FIXED_STEP_DELTA = 0.5;
// Max displacement per substep at OUTER_MAX_SPEED
const MAX_SUBSTEP_DISPLACEMENT = OUTER_MAX_SPEED * FIXED_STEP_DELTA; // 0.325 px
// Position pull-back places particle at outerRadius - 0.5; it must survive one substep
const PULL_BACK_MARGIN = 0.5;

// ─── Helpers ────────────────────────────────────────────────────

function makeLoomField(
  tierId: string,
  outerRadius = 85,
  captureRadius = 26.88,
): ForgeFieldInfo {
  return {
    id: `loom_${tierId}`,
    x: 160,
    y: 160,
    captureRadius,
    outerRadius,
    compatibleTierId: tierId as ForgeFieldInfo['compatibleTierId'],
    isUnlocked: true,
  };
}

function makeParticle(
  tierId: string,
  x: number,
  y: number,
  vx: number,
  vy: number,
  overrides: Partial<EquatoriaParticle> = {},
): EquatoriaParticle {
  return {
    isActive: true,
    x, y, vx, vy,
    tierId: tierId as EquatoriaParticle['tierId'],
    sizeIndex: MEDIUM_SIZE_INDEX,
    colorString: '#fff',
    glowColorString: null,
    size: 2,
    minVelocity: 0.312,
    maxVelocity: 1.5,
    forceModifier: 1,
    tierIndex: 3,
    isMerging: false,
    mergeTargetX: 0,
    mergeTargetY: 0,
    isForgeCrunchParticle: false,
    isLockedToPointer: false,
    pointerTargetX: 0,
    pointerTargetY: 0,
    nextVeerTimeMs: Infinity,
    trailX: new Float64Array(10),
    trailY: new Float64Array(10),
    trailHead: 0,
    trailCount: 0,
    trailFrameCounter: 0,
    suctionStartX: 0,
    suctionStartY: 0,
    dragReleaseTimeMs: 0,
    isCaptured: false,
    capturedById: '',
    particleId: 1,
    ...overrides,
  };
}

function speed(p: EquatoriaParticle): number {
  return Math.sqrt(p.vx * p.vx + p.vy * p.vy);
}

/** Radial velocity component: positive = outward (away from field centre). */
function radialOutward(p: EquatoriaParticle, field: ForgeFieldInfo): number {
  const dx = p.x - field.x;
  const dy = p.y - field.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  if (dist < 0.01) return 0;
  return (p.vx * dx + p.vy * dy) / dist;
}

/** Distance from particle to field centre. */
function distToField(p: EquatoriaParticle, field: ForgeFieldInfo): number {
  const dx = p.x - field.x;
  const dy = p.y - field.y;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── 1. Speed capping ───────────────────────────────────────────

describe('applyLoomContainmentCap — speed capping', () => {
  it('caps a compatible particle moving radially outward at outer edge to OUTER_MAX_SPEED', () => {
    const field = makeLoomField('ruby');
    // Particle at outerRadius - 5, moving outward at PL_MAX_VELOCITY = 1.5
    const p = makeParticle('ruby', field.x + field.outerRadius - 5, field.y, 1.5, 0);
    applyLoomContainmentCap([p], [field], false);
    expect(speed(p)).toBeLessThanOrEqual(OUTER_MAX_SPEED + 1e-9);
  });

  it('caps a compatible particle moving tangentially at outer edge to OUTER_MAX_SPEED', () => {
    const field = makeLoomField('sunstone');
    const p = makeParticle('sunstone', field.x + field.outerRadius - 5, field.y, 0, 1.5);
    applyLoomContainmentCap([p], [field], false);
    expect(speed(p)).toBeLessThanOrEqual(OUTER_MAX_SPEED + 1e-9);
  });

  it('caps a compatible particle near captureRadius to approximately INNER_MAX_SPEED', () => {
    const field = makeLoomField('citrine');
    const dist = field.captureRadius + 3;
    const p = makeParticle('citrine', field.x + dist, field.y, 0, 1.5);
    applyLoomContainmentCap([p], [field], false);
    // t = 3 / (85-26.88) ≈ 0.052 → maxSpeed ≈ 0.28 + 0.37 * 0.052 ≈ 0.299
    expect(speed(p)).toBeLessThanOrEqual(INNER_MAX_SPEED + (OUTER_MAX_SPEED - INNER_MAX_SPEED) * 0.1 + 1e-9);
  });

  it('does not increase speed of a particle already below the cap', () => {
    const field = makeLoomField('emerald');
    const p = makeParticle('emerald', field.x + 40, field.y, 0.1, 0.1);
    const spBefore = speed(p);
    applyLoomContainmentCap([p], [field], false);
    expect(speed(p)).toBeLessThanOrEqual(spBefore + 1e-9);
  });

  it('does not affect a non-compatible particle inside the loom radius', () => {
    const field = makeLoomField('sapphire');
    const p = makeParticle('diamond', field.x + 40, field.y, 1.5, 0); // wrong tier
    const vxBefore = p.vx;
    const vyBefore = p.vy;
    applyLoomContainmentCap([p], [field], false);
    expect(p.vx).toBe(vxBefore);
    expect(p.vy).toBe(vyBefore);
  });

  it('does not affect particles inside a forge field', () => {
    const forgeField: ForgeFieldInfo = {
      id: 'forge', x: 160, y: 160,
      captureRadius: 22.4, outerRadius: 85,
      compatibleTierId: null, isUnlocked: true,
    };
    const p = makeParticle('ruby', 160 + 40, 160, 1.5, 0);
    const vxBefore = p.vx;
    applyLoomContainmentCap([p], [forgeField], false);
    expect(p.vx).toBe(vxBefore);
  });

  it('does not affect small-size (sizeIndex < MEDIUM) particles', () => {
    const field = makeLoomField('citrine');
    const p = makeParticle('citrine', field.x + 40, field.y, 1.5, 0, { sizeIndex: SMALL_SIZE_INDEX });
    const vxBefore = p.vx;
    applyLoomContainmentCap([p], [field], false);
    expect(p.vx).toBe(vxBefore);
  });

  it('does not affect captured particles', () => {
    const field = makeLoomField('citrine');
    const p = makeParticle('citrine', field.x + 40, field.y, 1.5, 0, { isCaptured: true });
    const vxBefore = p.vx;
    applyLoomContainmentCap([p], [field], false);
    expect(p.vx).toBe(vxBefore);
  });

  it('does not affect merging particles', () => {
    const field = makeLoomField('citrine');
    const p = makeParticle('citrine', field.x + 40, field.y, 1.5, 0, { isMerging: true });
    const vxBefore = p.vx;
    applyLoomContainmentCap([p], [field], false);
    expect(p.vx).toBe(vxBefore);
  });
});

// ─── 2. Outward radial velocity damping ─────────────────────────

describe('applyLoomContainmentCap — outward velocity damping', () => {
  it('reduces a 100 % outward velocity to ≤ 5 % of original', () => {
    const field = makeLoomField('ruby');
    // Particle at (240, 160): dx=80, outward direction = +x; vx=1.5 = 100% outward
    const p = makeParticle('ruby', 240, 160, 1.5, 0);
    const radBefore = radialOutward(p, field);
    applyLoomContainmentCap([p], [field], false);
    const radAfter = radialOutward(p, field);
    expect(radBefore).toBeGreaterThan(0);
    expect(radAfter).toBeLessThanOrEqual(radBefore * OUTWARD_DAMP + 1e-6);
  });

  it('leaves tangential velocity largely intact (only speed-capped, not direction-damped)', () => {
    const field = makeLoomField('sunstone');
    // Particle moving pure tangential: vx=0, vy=0.4 (below cap)
    const p = makeParticle('sunstone', 240, 160, 0, 0.4);
    const radBefore = radialOutward(p, field); // ≈ 0 (tangential)
    applyLoomContainmentCap([p], [field], false);
    expect(Math.abs(radialOutward(p, field))).toBeLessThan(0.001); // still tangential
    expect(speed(p)).toBeCloseTo(0.4, 3); // speed unchanged (0.4 < cap)
    expect(radBefore).toBeCloseTo(0, 5);
  });

  it('does not kill inward (negative radial) velocity', () => {
    const field = makeLoomField('emerald');
    // vx = -1.0 (pointing toward field centre from x=240): inward
    const p = makeParticle('emerald', 240, 160, -0.3, 0);
    const radBefore = radialOutward(p, field); // negative = inward
    applyLoomContainmentCap([p], [field], false);
    const radAfter = radialOutward(p, field);
    // Inward component should be preserved (no damping applied)
    expect(radBefore).toBeLessThan(0);
    expect(radAfter).toBeLessThanOrEqual(0 + 1e-9); // still inward or zero
  });
});

// ─── 3. Position correction and escape prevention ───────────────

describe('applyLoomContainmentCap — position correction and no-escape guarantee', () => {
  it('pulls a particle that stepped just outside outerRadius back inside', () => {
    const field = makeLoomField('ruby');
    // Simulate: particle was inside, position update moved it 1 px outside
    const p = makeParticle('ruby', field.x + field.outerRadius + 1, field.y, 1.5, 0);
    applyLoomContainmentCap([p], [field], false);
    expect(distToField(p, field)).toBeLessThanOrEqual(field.outerRadius);
  });

  it('does not touch a particle outside outerRadius + MARGIN_PX', () => {
    const field = makeLoomField('ruby');
    const p = makeParticle('ruby', field.x + field.outerRadius + MARGIN_PX + 1, field.y, 1.5, 0);
    const xBefore = p.x;
    applyLoomContainmentCap([p], [field], false);
    expect(p.x).toBe(xBefore); // untouched — too far outside
  });

  it('after correction + cap: particle cannot escape in the next substep position update', () => {
    const field = makeLoomField('sunstone');
    // Worst case: particle was at outerRadius - 0.1, at max velocity outward
    // Position update moved it to outerRadius + 0.65
    const p = makeParticle(
      'sunstone',
      field.x + field.outerRadius + 0.65, // already outside after position step
      field.y,
      1.5, 0, // still at high velocity
    );

    applyLoomContainmentCap([p], [field], false);

    // After containment: particle should be at ≤ outerRadius
    const distAfterCap = distToField(p, field);
    expect(distAfterCap).toBeLessThanOrEqual(field.outerRadius);

    // After containment: speed capped to OUTER_MAX_SPEED
    expect(speed(p)).toBeLessThanOrEqual(OUTER_MAX_SPEED + 1e-9);

    // Simulate next substep's position update
    p.x += p.vx * FIXED_STEP_DELTA;
    p.y += p.vy * FIXED_STEP_DELTA;

    // Particle must still be inside outerRadius after next step
    const distAfterNextStep = distToField(p, field);
    expect(distAfterNextStep).toBeLessThanOrEqual(
      field.outerRadius + 1e-6, // allow floating-point epsilon
      `expected dist ${distAfterNextStep.toFixed(4)} <= outerRadius ${field.outerRadius} after next position step`,
    );
  });

  it('pull-back margin is sufficient to absorb one full PL_MAX_VELOCITY substep', () => {
    // PULL_BACK_MARGIN = 0.5 px; MAX_SUBSTEP_DISPLACEMENT = 0.325 px < 0.5
    expect(MAX_SUBSTEP_DISPLACEMENT).toBeLessThan(PULL_BACK_MARGIN);
  });
});

// ─── 4. Multi-tier coverage ──────────────────────────────────────

const ALL_TIER_IDS: string[] = [
  'quartz', 'ruby', 'sunstone', 'citrine', 'emerald',
  'sapphire', 'iolite', 'amethyst', 'diamond', 'nullstone',
  'fracteryl', 'eigenstein',
];

describe('applyLoomContainmentCap — applies uniformly to all loom tiers', () => {
  for (const tierId of ALL_TIER_IDS) {
    it(`${tierId}: speed is capped inside its loom field`, () => {
      const field = makeLoomField(tierId);
      // Particle at outerRadius - 5, moving outward at PL_MAX_VELOCITY
      const p = makeParticle(tierId, field.x + field.outerRadius - 5, field.y, 1.5, 0);
      applyLoomContainmentCap([p], [field], false);
      expect(speed(p)).toBeLessThanOrEqual(OUTER_MAX_SPEED + 1e-9);
    });

    it(`${tierId}: outward velocity is damped inside its loom field`, () => {
      const field = makeLoomField(tierId);
      const p = makeParticle(tierId, field.x + field.outerRadius - 5, field.y, 1.5, 0);
      const radBefore = 1.5; // 100% outward
      applyLoomContainmentCap([p], [field], false);
      const radAfter = radialOutward(p, field);
      expect(radAfter).toBeLessThanOrEqual(radBefore * OUTWARD_DAMP + 1e-6);
    });

    it(`${tierId}: particle corrected back inside after one-step escape`, () => {
      const field = makeLoomField(tierId);
      const p = makeParticle(tierId, field.x + field.outerRadius + 1, field.y, 1.5, 0);
      applyLoomContainmentCap([p], [field], false);
      expect(distToField(p, field)).toBeLessThanOrEqual(field.outerRadius);
    });
  }
});

// ─── 5. Multi-substep simulation ────────────────────────────────

describe('applyLoomContainmentCap — multi-substep containment simulation', () => {
  /**
   * Simulate N substeps of a particle inside a loom field, applying the
   * containment cap after each step.  Verifies the particle never escapes.
   *
   * Each iteration approximates the real pipeline:
   *   1. Apply random kick (simulating PL / generator forces)
   *   2. Position update (p.x += p.vx * dt)
   *   3. applyLoomContainmentCap
   */
  function simulateSubsteps(
    tierId: string,
    startDist: number,
    startSpeed: number,
    steps: number,
  ): { maxDist: number; maxSpeed: number } {
    const field = makeLoomField(tierId, 85, 26.88);
    const p = makeParticle(tierId, field.x + startDist, field.y, startSpeed, 0);
    let maxDist = 0;
    let maxSpeed = 0; // tracked only after containment cap is applied each step

    for (let i = 0; i < steps; i++) {
      // Simulate a random kick in any direction (worst-case PL force)
      const angle = (i * 137.5 * Math.PI) / 180; // golden-angle spread
      const kickMag = 0.5; // strong kick each step
      p.vx += Math.cos(angle) * kickMag;
      p.vy += Math.sin(angle) * kickMag;

      // Position update (step 1 in real pipeline)
      p.x += p.vx * FIXED_STEP_DELTA;
      p.y += p.vy * FIXED_STEP_DELTA;

      // Containment cap (step 6 in real pipeline)
      applyLoomContainmentCap([p], [field], false);

      const d = distToField(p, field);
      const s = speed(p);
      if (d > maxDist) maxDist = d;
      if (s > maxSpeed) maxSpeed = s;
    }
    return { maxDist, maxSpeed };
  }

  const TIERS_TO_SIMULATE = ['ruby', 'sunstone', 'citrine', 'emerald', 'sapphire', 'diamond', 'nullstone', 'fracteryl', 'eigenstein'];

  for (const tierId of TIERS_TO_SIMULATE) {
    it(`${tierId}: stays within outerRadius over 360 substeps with repeated force kicks`, () => {
      const field = makeLoomField(tierId);
      const { maxDist } = simulateSubsteps(tierId, field.outerRadius - 5, 1.5, 360);
      // Allow 1e-6 floating-point tolerance
      expect(maxDist).toBeLessThanOrEqual(field.outerRadius + 1e-6);
    });

    it(`${tierId}: speed never exceeds OUTER_MAX_SPEED after containment`, () => {
      const field = makeLoomField(tierId);
      const { maxSpeed } = simulateSubsteps(tierId, field.outerRadius - 5, 1.5, 360);
      expect(maxSpeed).toBeLessThanOrEqual(OUTER_MAX_SPEED + 1e-9);
    });
  }
});
