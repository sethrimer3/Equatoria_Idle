/**
 * crafting-allocation.test.ts — Tests for the crafting page percentage allocator helpers.
 *
 * Covers:
 *   - enforceMinSegmentSize: always sums to 1, minimum enforced
 *   - sharesFromHandles / handlesFromShares: round-trip
 *   - clampHandle: minimum segment constraint
 *   - computeMaxBudget: inventory constraint, dev mode
 *   - allocateIngredients: shares → counts, inventory clamping, min-1 guarantee
 */

import { describe, it, expect } from 'vitest';
import {
  enforceMinSegmentSize,
  snapToStep,
  sharesFromHandles,
  handlesFromShares,
  clampHandle,
  computeMaxBudget,
  allocateIngredients,
  MIN_SEGMENT_PCT,
} from '../crafting-allocation';
import type { TierId } from '../../tiers';

// ─── enforceMinSegmentSize ───────────────────────────────────────────────────

describe('enforceMinSegmentSize', () => {
  it('single segment stays [1]', () => {
    expect(enforceMinSegmentSize([1])).toEqual([1]);
  });

  it('sums to 1 after enforcement', () => {
    const result = enforceMinSegmentSize([0.95, 0.05]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
  });

  it('each segment is at least minFraction', () => {
    const minF = MIN_SEGMENT_PCT / 100;
    const result = enforceMinSegmentSize([0.99, 0.01]);
    for (const s of result) {
      expect(s).toBeGreaterThanOrEqual(minF - 1e-9);
    }
  });

  it('equal shares remain equal after enforcement', () => {
    const result = enforceMinSegmentSize([0.5, 0.5]);
    expect(result[0]).toBeCloseTo(0.5, 5);
    expect(result[1]).toBeCloseTo(0.5, 5);
  });

  it('three segments — all enforced, sum to 1', () => {
    const result = enforceMinSegmentSize([0.9, 0.08, 0.02], 0.05);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    for (const s of result) {
      expect(s).toBeGreaterThanOrEqual(0.05 - 1e-9);
    }
  });
});

// ─── snapToStep ─────────────────────────────────────────────────────────────

describe('snapToStep', () => {
  it('snaps 0.034 to 0.03 at 1% step', () => {
    expect(snapToStep(0.034, 0.01)).toBeCloseTo(0.03, 5);
  });

  it('snaps 0.035 to 0.04 at 1% step', () => {
    expect(snapToStep(0.035, 0.01)).toBeCloseTo(0.04, 5);
  });
});

// ─── sharesFromHandles / handlesFromShares ───────────────────────────────────

describe('sharesFromHandles', () => {
  it('no handles → [1]', () => {
    expect(sharesFromHandles([])).toEqual([1]);
  });

  it('one handle at 0.5 → [0.5, 0.5]', () => {
    const result = sharesFromHandles([0.5]);
    expect(result[0]).toBeCloseTo(0.5, 5);
    expect(result[1]).toBeCloseTo(0.5, 5);
  });

  it('two handles → three segments summing to 1', () => {
    const result = sharesFromHandles([0.3, 0.7]);
    const sum = result.reduce((a, b) => a + b, 0);
    expect(sum).toBeCloseTo(1, 10);
    expect(result[0]).toBeCloseTo(0.3, 5);
    expect(result[1]).toBeCloseTo(0.4, 5);
    expect(result[2]).toBeCloseTo(0.3, 5);
  });
});

describe('handlesFromShares round-trip', () => {
  it('handles → shares → handles is identity', () => {
    const handles = [0.3, 0.65];
    const shares = sharesFromHandles(handles);
    const reconstructed = handlesFromShares(shares);
    for (let i = 0; i < handles.length; i++) {
      expect(reconstructed[i]).toBeCloseTo(handles[i], 9);
    }
  });
});

// ─── clampHandle ────────────────────────────────────────────────────────────

describe('clampHandle', () => {
  it('prevents handle from pushing segment below minFraction', () => {
    const handles = [0.3, 0.7];
    // Try to move handle[0] too far right, would crush segment[1] < 5%
    const clamped = clampHandle(0, 0.68, handles, 0.05);
    expect(clamped).toBeCloseTo(0.65, 5); // handle[1]=0.7 minus 0.05
  });

  it('prevents handle from going too far left', () => {
    const handles = [0.3, 0.7];
    // Try to move handle[0] to 0.02 — left bound is minFraction (0.05)
    const clamped = clampHandle(0, 0.02, handles, 0.05);
    expect(clamped).toBeCloseTo(0.05, 5);
  });
});

// ─── computeMaxBudget ───────────────────────────────────────────────────────

describe('computeMaxBudget', () => {
  it('returns 0 when any active tier has no inventory', () => {
    const inventory: Map<TierId, number> = new Map([
      ['sand', 100],
      ['quartz', 0],
    ]);
    const budget = computeMaxBudget(
      ['sand', 'quartz'],
      [0.5, 0.5],
      inventory,
      false,
    );
    expect(budget).toBe(0);
  });

  it('returns non-zero in dev mode even with empty inventory', () => {
    const inventory: Map<TierId, number> = new Map();
    const budget = computeMaxBudget(
      ['sand'],
      [1],
      inventory,
      true,
    );
    expect(budget).toBeGreaterThan(0);
  });

  it('limiting tier constrains the budget', () => {
    // sand weight = 100^0 = 1, quartz weight = 100^1 = 100
    // 50 sand, 1 quartz, equal 50/50 shares
    // sand budget: 50 * 1 / 0.5 = 100
    // quartz budget: 1 * 100 / 0.5 = 200
    // max = min(100, 200) = 100
    const inventory: Map<TierId, number> = new Map([
      ['sand', 50],
      ['quartz', 1],
    ]);
    const budget = computeMaxBudget(
      ['sand', 'quartz'],
      [0.5, 0.5],
      inventory,
      false,
    );
    expect(budget).toBeCloseTo(100, 5);
  });
});

// ─── allocateIngredients ─────────────────────────────────────────────────────

describe('allocateIngredients', () => {
  it('produces correct floor counts from budget', () => {
    // sand: 1 crystal = 1 weight; quartz: 1 crystal = 100 weight
    // 50 sand, 1 quartz → maxBudget = 100, equal shares
    // budget=100: sand = floor(100*0.5/1)=50, quartz = floor(100*0.5/100)=0 → forced to 1
    const inventory: Map<TierId, number> = new Map([
      ['sand', 50],
      ['quartz', 1],
    ]);
    const result = allocateIngredients(
      ['sand', 'quartz'],
      [0.5, 0.5],
      inventory,
      1.0,
      false,
    );
    const sandEntry = result.find(e => e.tierId === 'sand');
    const quartzEntry = result.find(e => e.tierId === 'quartz');
    expect(sandEntry).toBeDefined();
    expect(quartzEntry).toBeDefined();
    // sand count capped to 50 (inventory)
    expect(sandEntry!.refinedCount).toBeLessThanOrEqual(50);
    expect(quartzEntry!.refinedCount).toBeGreaterThanOrEqual(1);
  });

  it('respects powerFraction scaling', () => {
    const inventory: Map<TierId, number> = new Map([['sand', 100]]);
    const fullResult = allocateIngredients(['sand'], [1], inventory, 1.0, false);
    const halfResult = allocateIngredients(['sand'], [1], inventory, 0.5, false);
    expect(fullResult[0]!.refinedCount).toBeGreaterThan(halfResult[0]!.refinedCount);
  });

  it('inventory clamped in non-dev mode', () => {
    const inventory: Map<TierId, number> = new Map([['sand', 10]]);
    const result = allocateIngredients(['sand'], [1], inventory, 1.0, false);
    expect(result[0]!.refinedCount).toBeLessThanOrEqual(10);
  });

  it('returns empty array when maxBudget = 0', () => {
    const inventory: Map<TierId, number> = new Map([['quartz', 0]]);
    const result = allocateIngredients(['quartz'], [1], inventory, 1.0, false);
    expect(result).toHaveLength(0);
  });

  it('forge capacity respected — only selected tiers appear', () => {
    // Only 2 tiers selected even though more exist in inventory
    const inventory: Map<TierId, number> = new Map([
      ['sand', 50],
      ['quartz', 1],
      ['ruby', 1],
    ]);
    const result = allocateIngredients(
      ['sand', 'quartz'],
      [0.5, 0.5],
      inventory,
      1.0,
      false,
    );
    expect(result.every(e => e.tierId === 'sand' || e.tierId === 'quartz')).toBe(true);
    expect(result.find(e => e.tierId === 'ruby')).toBeUndefined();
  });
});
