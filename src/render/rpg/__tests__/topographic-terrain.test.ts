/**
 * topographic-terrain.test.ts — Unit tests for topographic terrain helpers.
 *
 * Verifies:
 *  1. isPointInsideTopographicTerrain respects growth01 scaling.
 *  2. segmentIntersectsTopographicTerrain respects growth01 scaling.
 *  3. circleIntersectsTopographicTerrain catches edge-proximity overlaps
 *     (circle centre outside polygon but edge within radius).
 *  4. terrainFirstIntersectionT returns less than 1 for a ray crossing terrain.
 *  5. hasTopographicTerrainLineOfSight returns false for a blocked ray.
 *  6. generateTopographicTerrain produces rings with monotonically increasing
 *     average radii (no ring crossings in the mean).
 *  7. No ring contains NaN or negative radius values.
 *  8. Each island polygon has at least RING_POINTS vertices.
 *  9. Ring radii are monotonically increasing POINT-BY-POINT (stricter than mean).
 * 10. Ruby laser applyLaserBeamHitSweep does not damage enemies behind a
 *     terrain-truncated beam endpoint.
 */

import { describe, it, expect } from 'vitest';
import type { TopographicTerrainState } from '../terrain/topographic-terrain';
import {
  isPointInsideTopographicTerrain,
  segmentIntersectsTopographicTerrain,
  circleIntersectsTopographicTerrain,
  terrainFirstIntersectionT,
  hasTopographicTerrainLineOfSight,
  generateTopographicTerrain,
  pushPointOutsideTopographicTerrain,
  computeTerrainRepulsionForce,
  signedDistanceToTerrainBoundary,
  RING_POINTS,
} from '../terrain/topographic-terrain';
import { applyLaserBeamHitSweep } from '../rpg-weapon-laser-beam-hits';
import type { LaserBeamHitSweepCtx } from '../rpg-weapon-laser-beam-hits';

// ── Helper: build a minimal terrain state with one square island ──────────

function buildSquareTerrain(
  cx: number,
  cy: number,
  halfSize: number,
  growth01 = 1,
  phase: 'visible' | 'growing' | 'shrinking' = 'visible',
): TopographicTerrainState {
  // solidOuterPolygon is in UNSCALED space; collision is scaled by growth01.
  const pts = [
    { x: cx - halfSize, y: cy - halfSize },
    { x: cx + halfSize, y: cy - halfSize },
    { x: cx + halfSize, y: cy + halfSize },
    { x: cx - halfSize, y: cy + halfSize },
  ];
  return {
    seed: 1,
    paletteId: 'default',
    phase,
    growth01,
    mergedContours: null,
    islands: [{
      centerX: cx,
      centerY: cy,
      outerRadius: Math.sqrt(2) * halfSize,
      solidOuterPolygon: pts,
      profile: { harmonics: [], elongationAngle: 0, elongationAmount: 0 },
      rings: [],
    }],
  } as unknown as TopographicTerrainState;
}

// ── Tests ─────────────────────────────────────────────────────────────────

describe('isPointInsideTopographicTerrain', () => {
  it('detects a point clearly inside the island', () => {
    const state = buildSquareTerrain(100, 100, 50);
    expect(isPointInsideTopographicTerrain(state, 100, 100)).toBe(true);
  });

  it('returns false for a point clearly outside', () => {
    const state = buildSquareTerrain(100, 100, 50);
    expect(isPointInsideTopographicTerrain(state, 200, 200)).toBe(false);
  });

  it('respects growth01=0.5 — point inside scaled polygon is still inside', () => {
    // At growth01=0.5 the effective island half-size is 25px around center (100,100).
    const state = buildSquareTerrain(100, 100, 50, 0.5);
    // Point at 115,100 is inside the half-scaled polygon (< 25px from center)
    expect(isPointInsideTopographicTerrain(state, 115, 100)).toBe(true);
  });

  it('respects growth01=0.5 — point inside unscaled but outside scaled polygon', () => {
    // At growth01=0.5 the effective half-size is 25px. A point at 140,100 (40px from center)
    // is outside the scaled polygon even though it would be inside the full-size polygon.
    const state = buildSquareTerrain(100, 100, 50, 0.5);
    expect(isPointInsideTopographicTerrain(state, 140, 100)).toBe(false);
  });

  it('returns false when phase is hidden', () => {
    const state = buildSquareTerrain(100, 100, 50, 1, 'visible');
    (state as any).phase = 'hidden';
    expect(isPointInsideTopographicTerrain(state, 100, 100)).toBe(false);
  });
});

describe('segmentIntersectsTopographicTerrain', () => {
  it('returns true for a segment that crosses the island', () => {
    const state = buildSquareTerrain(100, 100, 50);
    // From outside (0,100) to outside (200,100), passing through (50–150,100)
    expect(segmentIntersectsTopographicTerrain(state, 0, 100, 200, 100)).toBe(true);
  });

  it('returns false for a segment that misses the island', () => {
    const state = buildSquareTerrain(100, 100, 50);
    // Horizontal line at y=200, far below the island (which spans y=50–150)
    expect(segmentIntersectsTopographicTerrain(state, 0, 200, 200, 200)).toBe(false);
  });

  it('returns true when one endpoint is inside the island', () => {
    const state = buildSquareTerrain(100, 100, 50);
    expect(segmentIntersectsTopographicTerrain(state, 100, 100, 300, 300)).toBe(true);
  });

  it('respects growth01=0.5', () => {
    // At growth01=0.5 the island spans [75,125] in each axis.
    // A segment from (0,80) to (130,80) crosses the half-scaled polygon.
    const state = buildSquareTerrain(100, 100, 50, 0.5);
    expect(segmentIntersectsTopographicTerrain(state, 0, 80, 200, 80)).toBe(true);
    // A segment at y=60 (outside [75,125]) should miss.
    expect(segmentIntersectsTopographicTerrain(state, 0, 60, 200, 60)).toBe(false);
  });
});

describe('circleIntersectsTopographicTerrain', () => {
  it('detects a circle whose centre is inside the polygon', () => {
    const state = buildSquareTerrain(100, 100, 50);
    expect(circleIntersectsTopographicTerrain(state, 100, 100, 5)).toBe(true);
  });

  it('detects a circle whose centre is outside but edge overlaps the polygon', () => {
    // Island spans [50,150] x [50,150].  Circle at (45, 100), radius 10 — centre
    // is 5px outside the left edge, but the circle extends 5px inward: it overlaps.
    const state = buildSquareTerrain(100, 100, 50);
    expect(circleIntersectsTopographicTerrain(state, 45, 100, 10)).toBe(true);
  });

  it('returns false when circle is clearly outside', () => {
    const state = buildSquareTerrain(100, 100, 50);
    expect(circleIntersectsTopographicTerrain(state, 200, 100, 5)).toBe(false);
  });

  it('edge proximity check with growth01=0.5', () => {
    // Scaled polygon spans [75,125] x [75,125].
    // Circle at (70,100), radius 10 — centre 5px outside, overlaps by 5px.
    const state = buildSquareTerrain(100, 100, 50, 0.5);
    expect(circleIntersectsTopographicTerrain(state, 70, 100, 10)).toBe(true);
    // Circle at (60,100), radius 5 — centre 15px outside, radius only 5px: no overlap.
    expect(circleIntersectsTopographicTerrain(state, 60, 100, 5)).toBe(false);
  });
});

describe('terrainFirstIntersectionT', () => {
  it('returns a value < 1 for a ray crossing the island', () => {
    const state = buildSquareTerrain(100, 100, 50);
    // Ray from (0,100) toward (1,0) direction, maxT=200 → will cross the island
    const t = terrainFirstIntersectionT(state, 0, 100, 1, 0, 200);
    expect(t).toBeLessThan(1);
  });

  it('returns 1 for a ray that misses the island', () => {
    const state = buildSquareTerrain(100, 100, 50);
    // Ray from (0,200) going right — below the island
    const t = terrainFirstIntersectionT(state, 0, 200, 1, 0, 400);
    expect(t).toBe(1);
  });
});

describe('hasTopographicTerrainLineOfSight', () => {
  it('returns false when terrain blocks the line segment', () => {
    const state = buildSquareTerrain(100, 100, 50);
    expect(hasTopographicTerrainLineOfSight(state, 0, 100, 200, 100)).toBe(false);
  });

  it('returns true when path is clear', () => {
    const state = buildSquareTerrain(100, 100, 50);
    expect(hasTopographicTerrainLineOfSight(state, 0, 200, 200, 200)).toBe(true);
  });

  it('returns true when terrain is null', () => {
    expect(hasTopographicTerrainLineOfSight(null, 0, 0, 100, 100)).toBe(true);
  });
});

// ── Shape-profile generation validation ───────────────────────────────────

describe('generateTopographicTerrain — shared island profile', () => {
  /**
   * Computes the average radius of a ring by measuring each point's distance
   * from the island centre.
   */
  function averageRingRadius(
    ring: { points: Array<{ x: number; y: number }> },
    cx: number,
    cy: number,
  ): number {
    if (ring.points.length === 0) return 0;
    let sum = 0;
    for (const p of ring.points) {
      const dx = p.x - cx;
      const dy = p.y - cy;
      sum += Math.sqrt(dx * dx + dy * dy);
    }
    return sum / ring.points.length;
  }

  it('produces rings with monotonically increasing average radii', () => {
    // Run multiple seeds to check the invariant is stable.
    for (const seed of [1, 42, 137, 999, 0xdeadbeef]) {
      const state = generateTopographicTerrain(1, seed, 800, 600);
      for (const island of state.islands) {
        for (let i = 1; i < island.rings.length; i++) {
          const prevAvg = averageRingRadius(island.rings[i - 1], island.centerX, island.centerY);
          const currAvg = averageRingRadius(island.rings[i], island.centerX, island.centerY);
          expect(currAvg).toBeGreaterThan(prevAvg);
        }
      }
    }
  });

  it('ring radii are monotonically increasing point-by-point across adjacent rings', () => {
    // This is stricter than the average-radius test: for every point index,
    // ring[i] radius must be less than ring[i+1] radius (tiny tolerance of 0.5 px).
    // Because all rings share the same shape profile and point angles, this
    // should hold for well-formed terrain.
    const TOL = 0.5; // px — allow negligible floating-point error
    for (const seed of [1, 42, 137, 999, 0xdeadbeef]) {
      const state = generateTopographicTerrain(1, seed, 800, 600);
      for (const island of state.islands) {
        for (let i = 1; i < island.rings.length; i++) {
          const inner = island.rings[i - 1];
          const outer = island.rings[i];
          expect(inner.points.length).toBe(outer.points.length);
          for (let j = 0; j < inner.points.length; j++) {
            const pi = inner.points[j];
            const po = outer.points[j];
            const ri = Math.sqrt((pi.x - island.centerX) ** 2 + (pi.y - island.centerY) ** 2);
            const ro = Math.sqrt((po.x - island.centerX) ** 2 + (po.y - island.centerY) ** 2);
            expect(ro + TOL).toBeGreaterThan(ri);
          }
        }
      }
    }
  });

  it('finds an island with at least 7 rings and validates point-by-point ordering', () => {
    // Try several seeds until we get an island with ≥7 rings, then validate it.
    let found = false;
    for (let s = 0; s < 200 && !found; s++) {
      const state = generateTopographicTerrain(1, s * 31 + 7, 800, 600);
      for (const island of state.islands) {
        if (island.rings.length >= 7) {
          found = true;
          for (let i = 1; i < island.rings.length; i++) {
            const inner = island.rings[i - 1];
            const outer = island.rings[i];
            for (let j = 0; j < inner.points.length; j++) {
              const pi = inner.points[j];
              const po = outer.points[j];
              const ri = Math.sqrt((pi.x - island.centerX) ** 2 + (pi.y - island.centerY) ** 2);
              const ro = Math.sqrt((po.x - island.centerX) ** 2 + (po.y - island.centerY) ** 2);
              expect(ro + 0.5).toBeGreaterThan(ri);
            }
          }
          break;
        }
      }
    }
    // If no island with 7+ rings was found in 200 seeds, skip with a note.
    // (Acceptable: island ring count is random 2–9 so 7 rings is uncommon.)
    if (!found) {
      console.warn('No island with ≥7 rings found in 200 seeds; skipping high-ring-count validation.');
    }
  });

  it('produces no NaN or negative radii in any ring point', () => {
    for (const seed of [1, 42, 137, 999, 0xdeadbeef]) {
      const state = generateTopographicTerrain(1, seed, 800, 600);
      for (const island of state.islands) {
        for (const ring of island.rings) {
          for (const p of ring.points) {
            expect(Number.isFinite(p.x)).toBe(true);
            expect(Number.isFinite(p.y)).toBe(true);
            // Radius must be positive
            const dx = p.x - island.centerX;
            const dy = p.y - island.centerY;
            expect(dx * dx + dy * dy).toBeGreaterThan(0);
          }
        }
      }
    }
  });

  it('solid outer polygon has at least RING_POINTS vertices', () => {
    for (const seed of [1, 42, 137]) {
      const state = generateTopographicTerrain(1, seed, 800, 600);
      for (const island of state.islands) {
        expect(island.solidOuterPolygon.length).toBeGreaterThanOrEqual(RING_POINTS);
      }
    }
  });

  it('produces at least one island per call', () => {
    const state = generateTopographicTerrain(1, 12345, 800, 600);
    expect(state.islands.length).toBeGreaterThanOrEqual(1);
  });
});

// ── Ruby laser terrain-truncation regression ──────────────────────────────

describe('applyLaserBeamHitSweep — terrain truncation regression', () => {
  /**
   * Regression: enemies behind a terrain-truncated beam endpoint must not
   * receive damage.  The beam uses `isWithinBeam(tProj > tMax)` to gate
   * damage, so a correctly truncated `tMax` already protects enemies
   * behind the terrain.  This test proves that invariant end-to-end.
   *
   * Layout (horizontal beam going right, island in the middle):
   *
   *   origin(0,100) ──beam──► [island at (150,100) halfSize=30] ──► far(500,100)
   *
   * Expected:
   *   • Enemy at (80, 100)  — before island — receives damage.
   *   • Enemy at (400, 100) — after island  — does NOT receive damage.
   */
  it('does not damage an enemy behind the truncated beam endpoint', () => {
    const terrain = buildSquareTerrain(150, 100, 30); // island spanning x=120..180

    const beamOriginX = 0, beamOriginY = 100;
    const dirX = 1, dirY = 0;
    const tFull = 500;

    // Compute the fraction where the beam first hits the island.
    const fraction = terrainFirstIntersectionT(terrain as unknown as TopographicTerrainState, beamOriginX, beamOriginY, dirX, dirY, tFull);
    const tMax = tFull * fraction; // should be ≈120 (left edge of island)

    // Sanity: tMax must be less than the full beam length.
    expect(tMax).toBeLessThan(tFull);

    // Enemies relative to origin.
    const earlyEnemy = { x: 80,  y: 100, hp: 100, maxHp: 100, atk: 10 };
    const lateEnemy  = { x: 400, y: 100, hp: 100, maxHp: 100, atk: 10 };

    let earlyHit = false;
    let lateHit  = false;

    const noop0 = () => 0;
    const noop1 = () => 0;

    const sweepCtx: LaserBeamHitSweepCtx = {
      originX: beamOriginX,
      originY: beamOriginY,
      dirX,
      dirY,
      tMax,
      baseDamage: 50,
      beamColor: '#f00',
      beamGlow: '#f00',
      hitEffects: [],
      bossEnemy: null,
      enemies: [earlyEnemy as any, lateEnemy as any],
      sapphireEnemies: [],
      sapphireMissiles: [],
      emeraldEnemies: [],
      amberEnemies: [],
      amberShards: [],
      voidEnemies: [],
      quartzEnemies: [],
      rubyEnemies: [],
      sunstoneEnemies: [],
      citrineEnemies: [],
      ioliteEnemies: [],
      amethystEnemies: [],
      diamondEnemies: [],
      nullstoneEnemies: [],
      fracterylEnemies: [],
      eigensteinEnemies: [],
      eliteEnemies: [],
      alivenGroups: [],
      damageEnemy: (e: any, dmg: number) => {
        if (e === earlyEnemy) earlyHit = true;
        if (e === lateEnemy)  lateHit  = true;
        return dmg;
      },
      damageSapphireEnemy: noop0,
      damageMissile: noop0,
      damageEmeraldEnemy: noop0,
      damageAmberEnemy: noop0,
      damageAmberShard: noop0,
      damageVoidEnemy: noop0,
      damageQuartzEnemy: noop0,
      damageRubyEnemy: noop0,
      damageSunstoneEnemy: noop0,
      damageCitrineEnemy: noop0,
      damageIoliteEnemy: noop0,
      damageAmethystEnemy: noop0,
      damageDiamondEnemy: noop0,
      damageNullstoneEnemy: noop0,
      damageFracterylEnemy: noop0,
      damageEigensteinEnemy: noop0,
      damageEliteEnemy: noop0,
      damageBossEnemy: noop1,
      damageAlivenParticle: noop0,
      spawnDamageNumber: () => {},
    };

    applyLaserBeamHitSweep(sweepCtx);

    expect(earlyHit).toBe(true);
    expect(lateHit).toBe(false);
  });
});

// ── Merged contour generation ─────────────────────────────────────────────

describe('generateTopographicTerrain — merged contours', () => {
  it('state.mergedContours is non-null after generation', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    expect(state.mergedContours).not.toBeNull();
  });

  it('mergedContours has at least one level', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    expect(state.mergedContours!.levels.length).toBeGreaterThan(0);
  });

  it('mergedContours.solidBoundaries is non-empty', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    expect(state.mergedContours!.solidBoundaries.length).toBeGreaterThan(0);
  });

  it('every solidBoundary polyline has at least 3 points', () => {
    for (const seed of [1, 42, 999]) {
      const state = generateTopographicTerrain(1, seed, 800, 600);
      for (const boundary of state.mergedContours!.solidBoundaries) {
        expect(boundary.length).toBeGreaterThanOrEqual(3);
      }
    }
  });

  it('solid boundary points are within canvas bounds (with one-cell margin)', () => {
    const W = 800, H = 600;
    const CELL = 8; // one marching-squares cell beyond canvas edge is acceptable
    for (const seed of [1, 42, 999]) {
      const state = generateTopographicTerrain(1, seed, W, H);
      for (const boundary of state.mergedContours!.solidBoundaries) {
        for (const pt of boundary) {
          expect(pt.x).toBeGreaterThanOrEqual(-CELL);
          expect(pt.x).toBeLessThanOrEqual(W + CELL);
          expect(pt.y).toBeGreaterThanOrEqual(-CELL);
          expect(pt.y).toBeLessThanOrEqual(H + CELL);
        }
      }
    }
  });

  it('centroid is within canvas bounds', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    const mc = state.mergedContours!;
    expect(mc.centroidX).toBeGreaterThan(0);
    expect(mc.centroidX).toBeLessThan(800);
    expect(mc.centroidY).toBeGreaterThan(0);
    expect(mc.centroidY).toBeLessThan(600);
  });

  it('all levels have the same number of levels across multiple seeds', () => {
    // All generated terrains should produce the same fixed number of contour levels.
    const levelCounts = [1, 42, 137, 999].map(seed =>
      generateTopographicTerrain(1, seed, 800, 600).mergedContours!.levels.length,
    );
    expect(new Set(levelCounts).size).toBe(1); // all the same
  });

  it('outermost level (index 0) solidBoundaries match levels[0].polylines', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    const mc = state.mergedContours!;
    expect(mc.solidBoundaries).toBe(mc.levels[0].polylines);
  });

  it('level thresholds decrease from innermost to outermost (index 0 has smallest threshold)', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    const levels = state.mergedContours!.levels;
    for (let i = 1; i < levels.length; i++) {
      // Outermost (index 0) has threshold ≈ 1.0; innermost has highest threshold.
      expect(levels[i].threshold).toBeGreaterThan(levels[i - 1].threshold);
    }
  });
});

// ── isPointInsideTopographicTerrain with merged contours ──────────────────

describe('isPointInsideTopographicTerrain — with merged contours', () => {
  it('island centre is inside terrain', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1; // fully grown
    const island = state.islands[0];
    // The island centre is well inside the outer ring.
    expect(isPointInsideTopographicTerrain(state, island.centerX, island.centerY)).toBe(true);
  });

  it('a point far from all islands is outside terrain', () => {
    // Choose a point at the canvas edge, which is always outside any island
    // (TERRAIN_EDGE_MARGIN and PLAYER_EXCLUSION_RADIUS prevent placement there).
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    // Corner points are always outside island bounds.
    expect(isPointInsideTopographicTerrain(state, 5, 5)).toBe(false);
    expect(isPointInsideTopographicTerrain(state, 795, 595)).toBe(false);
  });

  it('returns false when growth01 is 0', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    // growth01 defaults to 0 from generateTopographicTerrain
    const island = state.islands[0];
    expect(isPointInsideTopographicTerrain(state, island.centerX, island.centerY)).toBe(false);
  });
});

// ── pushPointOutsideTopographicTerrain — nearest-boundary logic ───────────

describe('pushPointOutsideTopographicTerrain — nearest-boundary logic', () => {
  it('pushes a point at the island centre to outside the boundary', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const island = state.islands[0];
    const pushed = { x: 0, y: 0 };
    const moved = pushPointOutsideTopographicTerrain(state, island.centerX, island.centerY, pushed, 2);
    expect(moved).toBe(true);
    // After push the entity must be outside all solid boundaries.
    expect(isPointInsideTopographicTerrain(state, pushed.x, pushed.y)).toBe(false);
  });

  it('does not push a point that is already outside', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const pushed = { x: 0, y: 0 };
    // Corner of canvas — always outside.
    const moved = pushPointOutsideTopographicTerrain(state, 5, 5, pushed, 2);
    expect(moved).toBe(false);
    expect(pushed.x).toBe(5);
    expect(pushed.y).toBe(5);
  });

  it('pushed result is outside terrain for multiple seeds', () => {
    for (const seed of [1, 42, 137]) {
      const state = generateTopographicTerrain(1, seed, 800, 600);
      state.growth01 = 1;
      const island = state.islands[0];
      const pushed = { x: 0, y: 0 };
      pushPointOutsideTopographicTerrain(state, island.centerX, island.centerY, pushed, 2);
      expect(isPointInsideTopographicTerrain(state, pushed.x, pushed.y)).toBe(false);
    }
  });

  it('pushed result is close to the boundary (< outerRadius + generous margin)', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const island = state.islands[0];
    const pushed = { x: 0, y: 0 };
    pushPointOutsideTopographicTerrain(state, island.centerX, island.centerY, pushed, 4);
    const mc = state.mergedContours!;
    const dx = pushed.x - mc.centroidX, dy = pushed.y - mc.centroidY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    // Should be within outerRadius * 1.5 + margin of the centroid (loose bound).
    expect(dist).toBeLessThan(island.outerRadius * 1.6 + 10);
  });

  it('works with square-terrain fallback (mergedContours=null)', () => {
    const state = buildSquareTerrain(100, 100, 50);
    const pushed = { x: 0, y: 0 };
    const moved = pushPointOutsideTopographicTerrain(state, 100, 100, pushed, 2);
    expect(moved).toBe(true);
    expect(isPointInsideTopographicTerrain(state, pushed.x, pushed.y)).toBe(false);
  });
});

// ── computeTerrainRepulsionForce ──────────────────────────────────────────

describe('computeTerrainRepulsionForce', () => {
  it('returns zero depth and zero force when point is outside', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const force = { x: 0, y: 0 };
    const depth = computeTerrainRepulsionForce(state, 5, 5, 1.0, force);
    expect(depth).toBe(0);
    expect(force.x).toBe(0);
    expect(force.y).toBe(0);
  });

  it('returns positive depth and non-zero force when point is inside terrain', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const island = state.islands[0];
    const force = { x: 0, y: 0 };
    const depth = computeTerrainRepulsionForce(state, island.centerX, island.centerY, 1.0, force);
    expect(depth).toBeGreaterThan(0);
    const mag = Math.sqrt(force.x ** 2 + force.y ** 2);
    expect(mag).toBeGreaterThan(0);
  });

  it('force is directed outward (away from terrain interior)', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const island = state.islands[0];
    const force = { x: 0, y: 0 };
    const depth = computeTerrainRepulsionForce(state, island.centerX, island.centerY, 1.0, force);
    expect(depth).toBeGreaterThan(0);

    // After applying force to a velocity of zero, the resulting position
    // should move away from the island interior, i.e. the entity should be
    // further from the centroid.
    const mc = state.mergedContours!;
    const preDist = Math.hypot(island.centerX - mc.centroidX, island.centerY - mc.centroidY);
    const postX = island.centerX + force.x, postY = island.centerY + force.y;
    const postDist = Math.hypot(postX - mc.centroidX, postY - mc.centroidY);
    expect(postDist).toBeGreaterThan(preDist);
  });

  it('returns 0 when growth01 = 0', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    (state as any).growth01 = 0;
    const force = { x: 0, y: 0 };
    const depth = computeTerrainRepulsionForce(state, 400, 300, 1.0, force);
    expect(depth).toBe(0);
  });
});

// ── signedDistanceToTerrainBoundary ───────────────────────────────────────

describe('signedDistanceToTerrainBoundary', () => {
  it('returns negative distance for a point inside terrain', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const island = state.islands[0];
    const nearest = { x: 0, y: 0 };
    const dist = signedDistanceToTerrainBoundary(state, island.centerX, island.centerY, nearest);
    expect(dist).toBeLessThan(0);
  });

  it('nearest boundary point is close to the outer contour (within island radius)', () => {
    // The nearest point returned by signedDistanceToTerrainBoundary lies on the
    // merged outer contour edge.  Verify it is within the island's bounding box.
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const island = state.islands[0];
    const nearest = { x: 0, y: 0 };
    signedDistanceToTerrainBoundary(state, island.centerX, island.centerY, nearest);
    const dx = nearest.x - island.centerX, dy = nearest.y - island.centerY;
    const nearestDist = Math.sqrt(dx * dx + dy * dy);
    // Nearest boundary point must be within outerRadius + generous margin.
    expect(nearestDist).toBeLessThan(island.outerRadius * 1.6 + 10);
  });

  it('returns positive distance for a point outside terrain', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const nearest = { x: 0, y: 0 };
    const dist = signedDistanceToTerrainBoundary(state, 5, 5, nearest);
    expect(dist).toBeGreaterThan(0);
  });

  it('returns Infinity for hidden phase', () => {
    const state = generateTopographicTerrain(1, 42, 800, 600);
    (state as any).phase = 'hidden';
    const dist = signedDistanceToTerrainBoundary(state, 400, 300, null);
    expect(dist).toBe(Infinity);
  });
});

// ── Center dots are dev-only ──────────────────────────────────────────────

describe('terrain rendering — center dots are dev-only', () => {
  it('renderTopographicTerrain exists as an export', async () => {
    // Import to check it is exported (rendering itself can't be called without a
    // real Canvas, but we can verify the export surface is correct).
    const module = await import('../terrain/topographic-terrain');
    expect(typeof module.renderTopographicTerrain).toBe('function');
    // setTopographicTerrainDevMode controls the dot-only dev overlay.
    expect(typeof module.setTopographicTerrainDevMode).toBe('function');
  });
});

// ── No tunnelling: a pushed point cannot be inside terrain ────────────────

describe('collision guarantee — no tunnelling into terrain interior', () => {
  it('a point pushed from island centre is outside all solid boundaries', () => {
    // Covers the "player cannot remain inside terrain" acceptance criterion.
    for (const seed of [1, 42, 137, 999]) {
      const state = generateTopographicTerrain(1, seed, 800, 600);
      state.growth01 = 1;
      for (const island of state.islands) {
        const pushed = { x: 0, y: 0 };
        pushPointOutsideTopographicTerrain(state, island.centerX, island.centerY, pushed, 2);
        expect(isPointInsideTopographicTerrain(state, pushed.x, pushed.y)).toBe(false);
      }
    }
  });

  it('points on a fine grid inside any island are pushed outside by pushPointOutsideTopographicTerrain', () => {
    // Verifies that every interior point can be pushed to a safe location.
    const state = generateTopographicTerrain(1, 42, 800, 600);
    state.growth01 = 1;
    const pushed = { x: 0, y: 0 };
    // Sample a grid inside the bounding box of the first island.
    const island = state.islands[0];
    const r = island.outerRadius * 0.85;
    for (let dx = -r; dx <= r; dx += r / 4) {
      for (let dy = -r; dy <= r; dy += r / 4) {
        const px = island.centerX + dx, py = island.centerY + dy;
        if (!isPointInsideTopographicTerrain(state, px, py)) continue;
        pushPointOutsideTopographicTerrain(state, px, py, pushed, 2);
        expect(isPointInsideTopographicTerrain(state, pushed.x, pushed.y)).toBe(false);
      }
    }
  });
});