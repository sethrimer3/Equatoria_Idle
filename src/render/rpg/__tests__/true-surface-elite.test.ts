import { describe, expect, it } from 'vitest';
import { createTrueSurfaceElite, isTrueSurfaceCoreVulnerable, isTrueSurfacePointTargetable, TRUE_SURFACE_ROTATION } from '../true-surface-elite';

describe('True surface elites', () => {
  it('creates finite scaffold points for every True elite surface', () => {
    for (const kind of TRUE_SURFACE_ROTATION) {
      const points = createTrueSurfaceElite(kind, 20);
      expect(points.length).toBeGreaterThan(40);
      expect(points.every(p => Number.isFinite(p.anchorX) && Number.isFinite(p.anchorY) && Number.isFinite(p.anchorZ))).toBe(true);
    }
  });

  it('keeps the Dini core protected until every scaffold point is activated', () => {
    const points = createTrueSurfaceElite('dini', 20);
    const core = points.find(p => p.surfaceCore)!;
    expect(isTrueSurfaceCoreVulnerable(core, points)).toBe(false);
    expect(isTrueSurfacePointTargetable(core, points)).toBe(false);
    for (const p of points) if (!p.surfaceCore) p.surfaceActivated = true;
    expect(isTrueSurfaceCoreVulnerable(core, points)).toBe(true);
    expect(isTrueSurfacePointTargetable(core, points)).toBe(true);
  });

  it('creates a denser Bohemian Dome super elite with long particle trails', () => {
    const points = createTrueSurfaceElite('bohemian_dome', 20);
    const nodes = points.filter(p => !p.surfaceCore);
    expect(nodes.length).toBeGreaterThan(200);
    expect(nodes.every(p => p.surfaceTrailX?.length === 48 && p.surfaceTrailY?.length === 48)).toBe(true);
  });
});
