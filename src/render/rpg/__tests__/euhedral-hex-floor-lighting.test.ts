/**
 * euhedral-hex-floor-lighting.test.ts — Unit tests for the Euhedral hex floor
 * local-to-world coordinate conversion used for terrain light sampling.
 *
 * Regression for the expanded-view terrain-lighting offset bug:
 *   When visibleBounds.left is negative (wide canvas), local cell centers must
 *   be shifted by worldOriginX/Y before comparing against world-space emitter
 *   positions.  Without the conversion the light tint appears offset to the left
 *   of the actual objects.
 */

import { describe, it, expect } from 'vitest';
import { localToWorldSamplePoint } from '../terrain/euhedral-hex-floor';

describe('localToWorldSamplePoint', () => {
  it('origin (0,0) leaves coordinates unchanged', () => {
    const { wx, wy } = localToWorldSamplePoint(180, 320, 0, 0);
    expect(wx).toBeCloseTo(180, 5);
    expect(wy).toBeCloseTo(320, 5);
  });

  it('negative worldOriginX (wide canvas) shifts local x to correct world x', () => {
    // visibleBounds.left ≈ -79.9 (the example from the problem statement)
    const { wx } = localToWorldSamplePoint(180, 0, -80, 0);
    expect(wx).toBeCloseTo(100, 5);
  });

  it('positive worldOriginX shifts local x correctly', () => {
    const { wx } = localToWorldSamplePoint(50, 0, 30, 0);
    expect(wx).toBeCloseTo(80, 5);
  });

  it('worldOriginY = 0 leaves y unchanged (common mobile case)', () => {
    const { wy } = localToWorldSamplePoint(0, 250, 0, 0);
    expect(wy).toBeCloseTo(250, 5);
  });

  it('non-zero worldOriginY shifts y correctly', () => {
    const { wy } = localToWorldSamplePoint(0, 100, 0, -40);
    expect(wy).toBeCloseTo(60, 5);
  });

  it('both origins applied simultaneously', () => {
    const { wx, wy } = localToWorldSamplePoint(200, 300, -80, -20);
    expect(wx).toBeCloseTo(120, 5);
    expect(wy).toBeCloseTo(280, 5);
  });

  it('reference device (origin 0,0): local center at safe-core center maps to world center', () => {
    const SAFE_W = 360;
    const SAFE_H = 640;
    const { wx, wy } = localToWorldSamplePoint(SAFE_W / 2, SAFE_H / 2, 0, 0);
    expect(wx).toBeCloseTo(SAFE_W / 2, 5);
    expect(wy).toBeCloseTo(SAFE_H / 2, 5);
  });

  it('wide view: local center at 0 maps to world origin offset', () => {
    // On a wide canvas visibleBounds.left = -100; local x=0 → world x=-100
    const { wx } = localToWorldSamplePoint(0, 0, -100, 0);
    expect(wx).toBeCloseTo(-100, 5);
  });
});
