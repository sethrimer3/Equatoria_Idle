/**
 * render-resolution-policy.test.ts — Tests for the pure render-resolution policy.
 *
 * The policy caps a canvas's backing-store resolution by a pixel budget so
 * high-DPI / 4K displays don't rasterize a giant backing store every frame.
 * These tests pin the pure, deterministic behavior (no DOM), covering the
 * matrix required by the high-DPI performance fix.
 */

import { describe, it, expect } from 'vitest';
import {
  computeRenderResolution,
  pixelBudgetForQuality,
  AUTO_MAX_BACKING_PIXELS,
  HIGH_MAX_BACKING_PIXELS,
  BALANCED_MAX_BACKING_PIXELS,
  PERFORMANCE_MAX_BACKING_PIXELS,
  type RenderResolutionQuality,
} from '../render-resolution-policy';

const QUALITIES: RenderResolutionQuality[] = ['auto', 'high', 'balanced', 'performance'];

describe('computeRenderResolution — basic sizes at DPR 1', () => {
  it('360×640 @ DPR 1 is never capped (well under budget)', () => {
    for (const quality of QUALITIES) {
      const r = computeRenderResolution({ cssWidth: 360, cssHeight: 640, nativeDevicePixelRatio: 1, quality });
      expect(r.backingWidth).toBe(360);
      expect(r.backingHeight).toBe(640);
      expect(r.effectiveDevicePixelRatio).toBe(1);
      expect(r.resolutionScale).toBe(1);
      expect(r.wasCapped).toBe(false);
    }
  });

  it('1080p CSS area @ DPR 1: capped only when budget < area', () => {
    // 1920×1080 = 2.07 MP.
    const area = 1920 * 1080;
    for (const quality of QUALITIES) {
      const r = computeRenderResolution({ cssWidth: 1920, cssHeight: 1080, nativeDevicePixelRatio: 1, quality });
      const budget = pixelBudgetForQuality(quality);
      if (area <= budget) {
        expect(r.wasCapped).toBe(false);
        expect(r.physicalPixelCount).toBe(area);
      } else {
        expect(r.wasCapped).toBe(true);
        expect(r.physicalPixelCount).toBeLessThanOrEqual(budget * 1.02);
      }
    }
  });

  it('4K CSS area @ DPR 1 is capped for every tier', () => {
    // 3840×2160 = 8.29 MP > every budget.
    for (const quality of QUALITIES) {
      const r = computeRenderResolution({ cssWidth: 3840, cssHeight: 2160, nativeDevicePixelRatio: 1, quality });
      expect(r.wasCapped).toBe(true);
      expect(r.physicalPixelCount).toBeLessThanOrEqual(pixelBudgetForQuality(quality) * 1.02);
    }
  });
});

describe('computeRenderResolution — high DPR', () => {
  it('large area @ DPR 2 caps effective DPR below native', () => {
    const r = computeRenderResolution({ cssWidth: 1215, cssHeight: 2160, nativeDevicePixelRatio: 2, quality: 'auto' });
    expect(r.nativeDevicePixelRatio).toBe(2);
    expect(r.effectiveDevicePixelRatio).toBeLessThan(2);
    expect(r.wasCapped).toBe(true);
    expect(r.physicalPixelCount).toBeLessThanOrEqual(AUTO_MAX_BACKING_PIXELS * 1.02);
  });

  it('fractional DPR 1.25 is handled', () => {
    const r = computeRenderResolution({ cssWidth: 800, cssHeight: 600, nativeDevicePixelRatio: 1.25, quality: 'high' });
    expect(Number.isFinite(r.effectiveDevicePixelRatio)).toBe(true);
    expect(r.effectiveDevicePixelRatio).toBeLessThanOrEqual(1.25 + 1e-9);
    expect(r.backingWidth).toBeGreaterThan(0);
  });

  it('fractional DPR 1.5 preserves aspect ratio', () => {
    const cssW = 1000;
    const cssH = 500;
    const r = computeRenderResolution({ cssWidth: cssW, cssHeight: cssH, nativeDevicePixelRatio: 1.5, quality: 'balanced' });
    // Aspect ratio preserved within rounding.
    expect(Math.abs(r.backingWidth / r.backingHeight - cssW / cssH)).toBeLessThan(0.02);
  });
});

describe('computeRenderResolution — budget ordering', () => {
  it('High keeps at least as many pixels as Balanced/Performance on a large area', () => {
    const big = { cssWidth: 3840, cssHeight: 2160, nativeDevicePixelRatio: 1 } as const;
    const high = computeRenderResolution({ ...big, quality: 'high' });
    const balanced = computeRenderResolution({ ...big, quality: 'balanced' });
    const performance = computeRenderResolution({ ...big, quality: 'performance' });
    expect(high.physicalPixelCount).toBeGreaterThan(balanced.physicalPixelCount);
    expect(balanced.physicalPixelCount).toBeGreaterThan(performance.physicalPixelCount);
  });

  it('budgets match the documented constants', () => {
    expect(pixelBudgetForQuality('auto')).toBe(AUTO_MAX_BACKING_PIXELS);
    expect(pixelBudgetForQuality('high')).toBe(HIGH_MAX_BACKING_PIXELS);
    expect(pixelBudgetForQuality('balanced')).toBe(BALANCED_MAX_BACKING_PIXELS);
    expect(pixelBudgetForQuality('performance')).toBe(PERFORMANCE_MAX_BACKING_PIXELS);
  });

  it('explicit maxPixelBudget overrides the quality budget', () => {
    const r = computeRenderResolution({ cssWidth: 4000, cssHeight: 4000, nativeDevicePixelRatio: 1, quality: 'performance', maxPixelBudget: 4_000_000 });
    expect(r.physicalPixelCount).toBeLessThanOrEqual(4_000_000 * 1.02);
    expect(r.physicalPixelCount).toBeGreaterThan(PERFORMANCE_MAX_BACKING_PIXELS);
  });
});

describe('computeRenderResolution — edge cases', () => {
  it('very small dimensions never produce zero output', () => {
    const r = computeRenderResolution({ cssWidth: 1, cssHeight: 1, nativeDevicePixelRatio: 1, quality: 'auto' });
    expect(r.backingWidth).toBeGreaterThanOrEqual(1);
    expect(r.backingHeight).toBeGreaterThanOrEqual(1);
  });

  it('zero / negative dimensions fall back to 1px, no zero output', () => {
    for (const bad of [0, -100, NaN, Infinity, -Infinity]) {
      const r = computeRenderResolution({ cssWidth: bad, cssHeight: bad, nativeDevicePixelRatio: 1, quality: 'auto' });
      expect(r.backingWidth).toBeGreaterThanOrEqual(1);
      expect(r.backingHeight).toBeGreaterThanOrEqual(1);
      expect(Number.isFinite(r.physicalPixelCount)).toBe(true);
    }
  });

  it('non-finite / non-positive DPR falls back safely', () => {
    for (const bad of [0, -2, NaN, Infinity]) {
      const r = computeRenderResolution({ cssWidth: 800, cssHeight: 600, nativeDevicePixelRatio: bad, quality: 'auto' });
      expect(r.nativeDevicePixelRatio).toBeGreaterThanOrEqual(0.5);
      expect(r.nativeDevicePixelRatio).toBeLessThanOrEqual(4);
      expect(Number.isFinite(r.effectiveDevicePixelRatio)).toBe(true);
    }
  });

  it('extremely large dimensions clamp per-axis and stay finite', () => {
    const r = computeRenderResolution({ cssWidth: 100000, cssHeight: 100000, nativeDevicePixelRatio: 3, quality: 'high' });
    expect(r.backingWidth).toBeLessThanOrEqual(4096);
    expect(r.backingHeight).toBeLessThanOrEqual(4096);
    expect(r.backingWidth).toBeGreaterThan(0);
    expect(r.physicalPixelCount).toBeLessThanOrEqual(HIGH_MAX_BACKING_PIXELS * 1.02);
  });

  it('pathological aspect ratio (1×100000) clamps the long axis, preserves ratio direction', () => {
    const r = computeRenderResolution({ cssWidth: 1, cssHeight: 100000, nativeDevicePixelRatio: 1, quality: 'auto' });
    expect(r.backingHeight).toBeLessThanOrEqual(4096);
    expect(r.backingWidth).toBeGreaterThanOrEqual(1);
    expect(r.backingHeight).toBeGreaterThan(r.backingWidth);
  });
});

describe('computeRenderResolution — invariants', () => {
  it('effective DPR never exceeds native DPR', () => {
    for (const dpr of [0.75, 1, 1.25, 1.5, 2, 3]) {
      for (const quality of QUALITIES) {
        const r = computeRenderResolution({ cssWidth: 2000, cssHeight: 1500, nativeDevicePixelRatio: dpr, quality });
        expect(r.effectiveDevicePixelRatio).toBeLessThanOrEqual(r.nativeDevicePixelRatio + 1e-9);
        expect(r.resolutionScale).toBeGreaterThan(0);
        expect(r.resolutionScale).toBeLessThanOrEqual(1 + 1e-9);
      }
    }
  });

  it('effectiveDPR / nativeDPR === resolutionScale', () => {
    const r = computeRenderResolution({ cssWidth: 3000, cssHeight: 2000, nativeDevicePixelRatio: 2, quality: 'balanced' });
    expect(r.resolutionScale).toBeCloseTo(r.effectiveDevicePixelRatio / r.nativeDevicePixelRatio, 10);
  });

  it('backing dims are consistent with effective DPR', () => {
    const r = computeRenderResolution({ cssWidth: 1280, cssHeight: 800, nativeDevicePixelRatio: 2, quality: 'auto' });
    expect(r.backingWidth).toBe(Math.round(1280 * r.effectiveDevicePixelRatio));
    expect(r.backingHeight).toBe(Math.round(800 * r.effectiveDevicePixelRatio));
  });

  it('is deterministic — same input yields identical output', () => {
    const input = { cssWidth: 1600, cssHeight: 900, nativeDevicePixelRatio: 1.5, quality: 'auto' as const };
    expect(computeRenderResolution(input)).toEqual(computeRenderResolution(input));
  });

  it('all outputs are integers and non-zero', () => {
    const r = computeRenderResolution({ cssWidth: 1234, cssHeight: 567, nativeDevicePixelRatio: 1.7, quality: 'performance' });
    expect(Number.isInteger(r.backingWidth)).toBe(true);
    expect(Number.isInteger(r.backingHeight)).toBe(true);
    expect(r.backingWidth).toBeGreaterThan(0);
    expect(r.backingHeight).toBeGreaterThan(0);
  });
});
