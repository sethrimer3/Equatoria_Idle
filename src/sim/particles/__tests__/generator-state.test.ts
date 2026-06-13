import { describe, expect, it } from 'vitest';
import { TIERS } from '../../../data/tiers';
import { computeGeneratorPositions, createGeneratorState, GENERATOR_RADIUS_PX } from '../generator-state';

describe('generator layout', () => {
  it('uses an outer base-tier ring and an inner late-tier triangle', () => {
    const state = createGeneratorState();
    const centerX = 160;
    const centerY = 320;
    computeGeneratorPositions(state, 320, 640, centerX, centerY, new Set(TIERS.map(tier => tier.id)), 24);

    const distanceFromCenter = (tierId: string) => {
      const generator = state.generators.find(candidate => candidate.tierId === tierId);
      expect(generator).toBeDefined();
      return Math.hypot(generator!.x - centerX, generator!.y - centerY);
    };

    for (const tier of TIERS.slice(0, 10)) {
      expect(distanceFromCenter(tier.id)).toBeCloseTo(GENERATOR_RADIUS_PX);
    }
    for (const tier of TIERS.slice(10)) {
      expect(distanceFromCenter(tier.id)).toBeCloseTo(GENERATOR_RADIUS_PX / 2);
    }

    const innerGenerators = state.generators.slice(10);
    const sideLengths = innerGenerators.map((generator, index) => {
      const next = innerGenerators[(index + 1) % innerGenerators.length];
      return Math.hypot(generator.x - next.x, generator.y - next.y);
    });
    expect(sideLengths[0]).toBeCloseTo(sideLengths[1]);
    expect(sideLengths[1]).toBeCloseTo(sideLengths[2]);
  });
});
