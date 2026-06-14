import { describe, expect, it } from 'vitest';
import { createTrueSurfaceElite, isTrueSurfaceCoreVulnerable, isTrueSurfacePointTargetable } from '../true-surface-elite';

describe('True surface elites', () => {
  it('creates finite corkscrew and Dini scaffold points', () => {
    for (const kind of ['corkscrew', 'dini'] as const) {
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
});
