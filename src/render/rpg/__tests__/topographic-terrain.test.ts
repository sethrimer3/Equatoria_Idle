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
 */

import { describe, it, expect } from 'vitest';
import type { TopographicTerrainState } from '../terrain/topographic-terrain';
import {
  isPointInsideTopographicTerrain,
  segmentIntersectsTopographicTerrain,
  circleIntersectsTopographicTerrain,
  terrainFirstIntersectionT,
  hasTopographicTerrainLineOfSight,
} from '../terrain/topographic-terrain';

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
