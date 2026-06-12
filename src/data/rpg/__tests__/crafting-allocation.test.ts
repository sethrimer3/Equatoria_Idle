import { describe, expect, it } from 'vitest';
import {
  MIN_SEGMENT_PCT,
  allocateIngredients,
  computeBudgetRange,
  findNearestFeasibleHandle,
  minimumPowerPct,
  normalizeTargetShares,
  sharesFromHandles,
} from '../crafting-allocation';
import type { TierId } from '../../tiers';

const inventory = (entries: Array<[TierId, bigint]>) => new Map<string, bigint>(entries);

describe('integer target shares', () => {
  it('uses a 1% minimum and sums exactly to 100', () => {
    const shares = normalizeTargetShares([98.6, 0.4, 1]);
    expect(MIN_SEGMENT_PCT).toBe(1);
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(100);
    expect(Math.min(...shares)).toBeGreaterThanOrEqual(1);
  });

  it('derives exact shares from integer handles', () => {
    expect(sharesFromHandles([1, 37])).toEqual([1, 36, 63]);
  });
});

describe('feasibility-aware allocation', () => {
  it('rejects widely separated tiers without enough lower-tier inventory', () => {
    const range = computeBudgetRange(['sand', 'emerald'], [1, 99], inventory([['sand', 1n], ['emerald', 1n]]));
    expect(range.feasible).toBe(false);
    expect(range.limitingTierId).toBe('sand');
  });

  it('clamps a handle to the nearest feasible percentage', () => {
    const inv = inventory([['sand', 100n], ['quartz', 1n]]);
    expect(findNearestFeasibleHandle(0, 1, [50], ['sand', 'quartz'], inv)).toBe(20);
  });

  it('does not force a one-crystal insertion', () => {
    const result = allocateIngredients(['sand', 'quartz'], [50, 50], inventory([['sand', 50n], ['quartz', 1n]]), 100);
    expect(result).toEqual([]);
  });

  it('enforces minimum Power and leaves surplus unused', () => {
    const inv = inventory([['sand', 10_000n], ['quartz', 10n]]);
    const range = computeBudgetRange(['sand', 'quartz'], [50, 50], inv);
    const minimum = minimumPowerPct(range);
    const result = allocateIngredients(['sand', 'quartz'], [50, 50], inv, 1);
    expect(minimum).toBeGreaterThanOrEqual(1);
    expect(BigInt(result.find(i => i.tierId === 'sand')!.refinedCount)).toBeLessThan(10_000n);
  });

  it('uses a real synthetic dev budget and keeps composition close', () => {
    const result = allocateIngredients(['sand', 'emerald'], [50, 50], new Map(), 100, true);
    const sandWeight = BigInt(result.find(i => i.tierId === 'sand')!.refinedCount);
    const emeraldWeight = BigInt(result.find(i => i.tierId === 'emerald')!.refinedCount) * 10_000_000_000n;
    expect(sandWeight).toBeGreaterThan(9_999n);
    expect(sandWeight).toBe(emeraldWeight);
  });

  it('allocates exactly above 1e30', () => {
    const huge = 10n ** 31n;
    const result = allocateIngredients(['sand'], [100], inventory([['sand', huge]]), 100);
    expect(result[0]!.refinedCount).toBe(huge);
  });
});
