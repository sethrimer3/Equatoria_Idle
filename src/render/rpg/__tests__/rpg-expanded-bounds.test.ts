import { describe, it, expect } from 'vitest';
import type { TopographicTerrainState } from '../terrain/topographic-terrain';
import { computeLaserBeamMaxT } from '../rpg-weapon-laser-beam';
import {
  generateVerdureCaveWalls,
  isPointInVerdureWall,
  pushPointOutsideVerdureWall,
  applyVerdureWallsToNavGrid,
} from '../terrain/verdure-cave-walls';
import { buildRpgNavigationGrid } from '../terrain/rpg-pathfinding';

function buildSquareTerrain(cx: number, cy: number, halfSize: number): TopographicTerrainState {
  const pts = [
    { x: cx - halfSize, y: cy - halfSize },
    { x: cx + halfSize, y: cy - halfSize },
    { x: cx + halfSize, y: cy + halfSize },
    { x: cx - halfSize, y: cy + halfSize },
  ];
  return {
    seed: 1,
    paletteId: 'default',
    phase: 'visible',
    growth01: 1,
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

describe('Ruby laser expanded viewport clipping', () => {
  const viewport = { left: -220, top: -140, right: 620, bottom: 820 };

  it('reaches viewport.left when fired left from outside the old safe core', () => {
    const t = computeLaserBeamMaxT(-80, 240, -1, 0, viewport, null);
    expect(t).toBeCloseTo(140, 5);
  });

  it('reaches viewport.top when fired up from outside the old safe core', () => {
    const t = computeLaserBeamMaxT(180, -40, 0, -1, viewport, null);
    expect(t).toBeCloseTo(100, 5);
  });

  it('still reaches viewport.right and viewport.bottom for positive directions', () => {
    expect(computeLaserBeamMaxT(180, 240, 1, 0, viewport, null)).toBeCloseTo(440, 5);
    expect(computeLaserBeamMaxT(180, 240, 0, 1, viewport, null)).toBeCloseTo(580, 5);
  });

  it('terrain truncation still shortens the beam before the viewport edge', () => {
    const terrain = buildSquareTerrain(100, 240, 20);
    const unclipped = computeLaserBeamMaxT(-80, 240, 1, 0, viewport, null);
    const clipped = computeLaserBeamMaxT(-80, 240, 1, 0, viewport, terrain);
    expect(unclipped).toBeCloseTo(700, 5);
    expect(clipped).toBeLessThan(unclipped);
    expect(-80 + clipped).toBeCloseTo(80, 1);
  });
});

describe('Verdure cave walls with nonzero-origin active bounds', () => {
  const bounds = { left: -180, top: -90, width: 760, height: 920 };

  it('uses the activeBounds origin for wall tests and push-out', () => {
    const state = generateVerdureCaveWalls(42, bounds);
    const wallX = bounds.left + 4;
    const wallY = bounds.top + bounds.height * 0.5;
    const centerX = bounds.left + bounds.width * 0.5;
    const centerY = bounds.top + bounds.height * 0.5;

    expect(isPointInVerdureWall(state, wallX, wallY)).toBe(true);
    expect(isPointInVerdureWall(state, centerX, centerY)).toBe(false);

    const out = { x: wallX, y: wallY };
    expect(pushPointOutsideVerdureWall(state, wallX, wallY, out, 6)).toBe(true);
    expect(out.x).toBeGreaterThan(bounds.left);
    expect(isPointInVerdureWall(state, out.x, out.y)).toBe(false);
  });

  it('marks nav-grid wall cells using the same world-space origin', () => {
    const state = generateVerdureCaveWalls(42, bounds);
    const navGrid = buildRpgNavigationGrid(null, bounds.width, bounds.height, 20, bounds.left, bounds.top);
    applyVerdureWallsToNavGrid(state, navGrid);

    const leftWallCell = Math.floor(bounds.height * 0.5 / navGrid.cellSizePx) * navGrid.cols;
    expect(navGrid.blocked[leftWallCell]).toBe(1);

    const centerCol = Math.floor((bounds.width * 0.5) / navGrid.cellSizePx);
    const centerRow = Math.floor((bounds.height * 0.5) / navGrid.cellSizePx);
    expect(navGrid.blocked[centerRow * navGrid.cols + centerCol]).toBe(0);
  });
});
