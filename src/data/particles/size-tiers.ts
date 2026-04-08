/**
 * Size tiers for particles. SizeIndex is a plain number (0, 1, 2, …)
 * where each tier is 1 virtual pixel larger than the previous.
 * 100 particles of size N combine into 1 particle of size N+1.
 * This can happen indefinitely.
 */
export type SizeIndex = number;

export const MERGE_THRESHOLD = 100;
export const SMALL_SIZE_INDEX: SizeIndex = 0;
export const MEDIUM_SIZE_INDEX: SizeIndex = 1;
export const LARGE_SIZE_INDEX: SizeIndex = 2;
export const EXTRA_LARGE_SIZE_INDEX: SizeIndex = 3;

/**
 * Each size tier is (sizeIndex + 1) virtual pixels wide/tall.
 * Returns the pixel size for a given SizeIndex.
 */
export function getSizePixels(sizeIndex: SizeIndex): number {
  return sizeIndex + 1;
}

/**
 * Scale multiplier relative to base particle size.
 * Each tier adds 1 virtual pixel, so sizeIndex 0 → 1px, 1 → 2px, etc.
 */
export function getSizeScaleMultiplier(sizeIndex: SizeIndex): number {
  return sizeIndex + 1;
}

/** Minimum velocity modifier — larger particles move slower. */
export function getSizeMinVelocityModifier(sizeIndex: SizeIndex): number {
  return Math.max(0.1, 1.0 / (1 + sizeIndex * 0.25));
}

/** Maximum velocity modifier — larger particles have lower max speed. */
export function getSizeMaxVelocityModifier(sizeIndex: SizeIndex): number {
  if (sizeIndex === 0) return 1.0;
  return Math.max(0.3, 1.0 / (1 + sizeIndex * 0.15));
}

/** Force modifier — larger particles respond less to forces. */
export function getSizeForceModifier(sizeIndex: SizeIndex): number {
  return Math.max(0.08, 1.0 / (1 + sizeIndex * 0.2));
}

/** How many small-equivalents (size-0) a particle at the given size represents. */
export function getSizeSmallEquivalent(sizeIndex: SizeIndex): number {
  return Math.pow(MERGE_THRESHOLD, sizeIndex);
}

// ── Backward-compatible readonly arrays for existing code ──
// These are kept for existing read patterns but delegate to functions.
export const SIZE_SCALE_MULTIPLIERS: readonly number[] = [1.0, 2.0, 3.0, 4.0];
export const SIZE_MIN_VELOCITY_MODIFIERS: readonly number[] = [1.0, 0.8, 0.57, 0.5];
export const SIZE_MAX_VELOCITY_MODIFIERS: readonly number[] = [1.0, 0.85, 0.7, 0.6];
export const SIZE_FORCE_MODIFIERS: readonly number[] = [1.0, 0.85, 0.7, 0.55];
export const SIZE_SMALL_EQUIVALENTS: readonly number[] = [1, 100, 10000, 1000000];
