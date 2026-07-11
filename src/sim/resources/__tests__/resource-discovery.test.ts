import { describe, expect, it } from 'vitest';
import { createResourceState, hasDiscoveredMote } from '../resource-state';

describe('mote discovery', () => {
  it('does not infer discovery from a positive current balance', () => {
    const resources = createResourceState();
    resources.moteTotals.set('eigenstein', 1);

    expect(hasDiscoveredMote(resources, 'eigenstein')).toBe(false);
  });

  it('keeps a mote discovered after its current balance is spent', () => {
    const resources = createResourceState();
    resources.lifetimeMotes.set('quartz', 1);
    resources.moteTotals.set('quartz', 0);

    expect(hasDiscoveredMote(resources, 'quartz')).toBe(true);
  });
});
