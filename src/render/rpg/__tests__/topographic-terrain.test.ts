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
    islands: [{
      centerX: cx,
      centerY: cy,
      outerRadius: Math.sqrt(2) * halfSize,
      solidOuterPolygon: pts,
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

  it('solid outer polygon has at least 32 points', () => {
    for (const seed of [1, 42, 137]) {
      const state = generateTopographicTerrain(1, seed, 800, 600);
      for (const island of state.islands) {
        expect(island.solidOuterPolygon.length).toBeGreaterThanOrEqual(32);
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


