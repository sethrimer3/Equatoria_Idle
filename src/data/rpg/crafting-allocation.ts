import type { TierId } from '../tiers';
import { getTierForgeWeightBigInt } from './crafted-weapon-helpers';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';

export const MIN_SEGMENT_PCT = 1;
export const SEGMENT_STEP_PCT = 1;
export type TargetShares = number[];
type CrystalInventory = Map<string, number | bigint>;

export interface CraftingBudgetRange {
  minimumBudget: bigint;
  maximumBudget: bigint;
  feasible: boolean;
  limitingTierId?: TierId;
}

function ceilDiv(value: bigint, divisor: bigint): bigint {
  return (value + divisor - 1n) / divisor;
}

export function normalizeTargetShares(shares: number[]): TargetShares {
  if (shares.length === 0) return [];
  if (shares.length === 1) return [100];
  const result = shares.map(v => Math.max(MIN_SEGMENT_PCT, Math.round(v)));
  let delta = 100 - result.reduce((sum, value) => sum + value, 0);
  while (delta !== 0) {
    const direction = delta > 0 ? 1 : -1;
    const index = result
      .map((value, i) => ({ value, i }))
      .filter(entry => direction > 0 || entry.value > MIN_SEGMENT_PCT)
      .sort((a, b) => direction > 0 ? b.value - a.value : a.value - b.value)[0]?.i;
    if (index === undefined) break;
    result[index] += direction;
    delta -= direction;
  }
  return result;
}

/** Backward-compatible entry point; inputs may be fractions or percentage units. */
export function enforceMinSegmentSize(shares: number[], _minimum = MIN_SEGMENT_PCT): TargetShares {
  return normalizeTargetShares(shares.map(value => value <= 1 ? value * 100 : value));
}

export function snapToStep(value: number, step = 1): number {
  return Math.round(value / step) * step;
}

export function sharesFromHandles(handles: number[]): TargetShares {
  if (handles.length === 0) return [100];
  const result = [handles[0]];
  for (let i = 1; i < handles.length; i++) result.push(handles[i] - handles[i - 1]);
  result.push(100 - handles[handles.length - 1]);
  return result;
}

export function handlesFromShares(shares: number[]): number[] {
  const normalized = normalizeTargetShares(shares);
  let cumulative = 0;
  return normalized.slice(0, -1).map(value => (cumulative += value));
}

export function clampHandle(handleIndex: number, position: number, handles: number[], _minimum = MIN_SEGMENT_PCT): number {
  const left = handleIndex === 0 ? MIN_SEGMENT_PCT : handles[handleIndex - 1] + MIN_SEGMENT_PCT;
  const right = handleIndex === handles.length - 1 ? 100 - MIN_SEGMENT_PCT : handles[handleIndex + 1] - MIN_SEGMENT_PCT;
  return Math.max(left, Math.min(right, Math.round(position)));
}

export function computeBudgetRange(
  selectedTiers: TierId[],
  targetPercents: TargetShares,
  inventory: CrystalInventory,
  isDevMode = false,
): CraftingBudgetRange {
  let minimumBudget = 0n;
  let maximumBudget: bigint | undefined;
  let limitingTierId: TierId | undefined;
  for (let i = 0; i < selectedTiers.length; i++) {
    const p = BigInt(targetPercents[i] ?? 0);
    if (p <= 0n) continue;
    const tierId = selectedTiers[i];
    const weight = getTierForgeWeightBigInt(tierId);
    const tierMinimum = ceilDiv(weight * 100n, p);
    if (tierMinimum > minimumBudget) minimumBudget = tierMinimum;
    if (!isDevMode) {
      const tierMaximum = (BigInt(inventory.get(tierId) ?? 0) * weight * 100n) / p;
      if (maximumBudget === undefined || tierMaximum < maximumBudget) {
        maximumBudget = tierMaximum;
        limitingTierId = tierId;
      }
    }
  }
  if (isDevMode) maximumBudget = minimumBudget * 1_000_000n;
  maximumBudget ??= 0n;
  return { minimumBudget, maximumBudget, feasible: minimumBudget <= maximumBudget, limitingTierId };
}

export function computeMaxBudget(
  selectedTiers: TierId[],
  shares: number[],
  inventory: CrystalInventory,
  isDevMode = false,
): bigint {
  return computeBudgetRange(selectedTiers, enforceMinSegmentSize(shares), inventory, isDevMode).maximumBudget;
}

export function minimumPowerPct(range: CraftingBudgetRange): number {
  if (!range.feasible || range.maximumBudget <= 0n) return 100;
  return Number(ceilDiv(range.minimumBudget * 100n, range.maximumBudget));
}

export function allocateIngredients(
  selectedTiers: TierId[],
  targetPercents: TargetShares,
  inventory: CrystalInventory,
  powerPct: number,
  isDevMode = false,
): CraftedWeaponIngredient[] {
  const range = computeBudgetRange(selectedTiers, targetPercents, inventory, isDevMode);
  if (!range.feasible) return [];
  const pct = BigInt(Math.max(minimumPowerPct(range), Math.min(100, Math.round(powerPct))));
  const budget = range.maximumBudget * pct / 100n;
  const result: CraftedWeaponIngredient[] = [];
  for (let i = 0; i < selectedTiers.length; i++) {
    const tierId = selectedTiers[i];
    const p = BigInt(targetPercents[i] ?? 0);
    const count = budget * p / (100n * getTierForgeWeightBigInt(tierId));
    if (count > 0n) result.push({ tierId, refinedCount: count });
  }
  return result;
}

export function findNearestFeasibleHandle(
  handleIndex: number,
  attemptedPosition: number,
  handles: number[],
  selectedTiers: TierId[],
  inventory: CrystalInventory,
  isDevMode = false,
): number {
  const current = handles[handleIndex];
  const target = clampHandle(handleIndex, attemptedPosition, handles);
  const direction = target >= current ? 1 : -1;
  for (let candidate = target; direction > 0 ? candidate >= current : candidate <= current; candidate -= direction) {
    const next = [...handles];
    next[handleIndex] = candidate;
    if (computeBudgetRange(selectedTiers, sharesFromHandles(next), inventory, isDevMode).feasible) return candidate;
  }
  return current;
}
