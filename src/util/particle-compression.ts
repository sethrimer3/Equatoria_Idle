/**
 * particle-compression.ts — Utility for compressing generator output into
 * the highest particle size whose value fits the raw production rate.
 *
 * Size progression rule:
 *   SizeIndex 0 (1×1) → value 1       (= 100^0)
 *   SizeIndex 1 (2×2) → value 100     (= 100^1)
 *   SizeIndex 2 (3×3) → value 10,000  (= 100^2)
 *   SizeIndex 3 (4×4) → value 1,000,000 (= 100^3)
 *   …and so on indefinitely
 *
 * Compression rule:
 *   Given rawRatePerSec (in 1×1 equivalents per second):
 *     sizeIndex     = floor( log(rawRate) / log(100) )  (clamped ≥ 0)
 *     emitRatePerSec = rawRate / 100^sizeIndex
 *
 * Examples:
 *    50 raw/s  →  50    × 1×1 / s   (sizeIndex 0)
 *   100 raw/s  →   1.0  × 2×2 / s   (sizeIndex 1)
 *   120 raw/s  →   1.2  × 2×2 / s   (sizeIndex 1)
 *  10000 raw/s →   1.0  × 3×3 / s   (sizeIndex 2)
 */

import type { SizeIndex } from '../data/particles/size-tiers';
import { MERGE_THRESHOLD, getSizeSmallEquivalent } from '../data/particles/size-tiers';

/** Pre-computed log(MERGE_THRESHOLD) to avoid re-computing each call. */
const LOG_MERGE_THRESHOLD = Math.log(MERGE_THRESHOLD);

export interface CompressionResult {
  /** The compressed particle size to emit (0 = 1×1, 1 = 2×2, …). */
  sizeIndex: SizeIndex;
  /** How many particles of `sizeIndex` to emit per second. */
  emitRatePerSec: number;
  /** Human-readable size label, e.g. "2×2". */
  sizeLabel: string;
}

/**
 * Convert a raw production rate (1×1 equivalents/sec) into a single
 * compressed output size and the corresponding emit rate.
 *
 * A generator should emit ONLY this size — no lower-size leftovers.
 * The average total value emitted per second equals rawRatePerSec.
 */
export function computeOutputCompression(rawRatePerSec: number): CompressionResult {
  if (rawRatePerSec <= 0) {
    return { sizeIndex: 0, emitRatePerSec: 0, sizeLabel: '1×1' };
  }

  // Highest sizeIndex whose value (100^sizeIndex) ≤ rawRatePerSec.
  // A small epsilon guards against floating-point underflow at exact power-of-100 boundaries
  // (e.g. log(1000000)/log(100) = 2.9999...9996 in IEEE 754 instead of exactly 3).
  const sizeIndex: SizeIndex = Math.max(
    0,
    Math.floor(Math.log(rawRatePerSec) / LOG_MERGE_THRESHOLD + 1e-9),
  );

  // Emit rate = rawRate / value of one particle at this size
  const sizeValue = getSizeSmallEquivalent(sizeIndex);
  const emitRatePerSec = rawRatePerSec / sizeValue;

  const dim = sizeIndex + 1;
  const sizeLabel = `${dim}×${dim}`;

  return { sizeIndex, emitRatePerSec, sizeLabel };
}
