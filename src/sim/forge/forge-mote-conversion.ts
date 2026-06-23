/**
 * forge-mote-conversion.ts — Physical mote forge conversion logic.
 *
 * Implements the drag-based forge mechanic where a physical mote of size N
 * (SizeIndex N-1) is crunched into the next tier at size N-1 (SizeIndex N-2),
 * scaled by forge efficiency.
 *
 * Size–value table (MERGE_THRESHOLD = 100):
 *   1×1  (SizeIndex 0)  → value            1
 *   2×2  (SizeIndex 1)  → value          100
 *   3×3  (SizeIndex 2)  → value       10,000
 *   4×4  (SizeIndex 3)  → value    1,000,000
 *
 * Conversion rule:
 *   A mote at SizeIndex S converts to the next tier at SizeIndex S-1.
 *   1×1 motes (SizeIndex 0) are rejected — too small to crunch.
 *
 * Efficiency:
 *   totalOutputValue = floor(baseOutputValue * forgeEfficiency)
 *   Output is packed into the largest possible motes via totalToSizeCounts.
 */

import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';
import { getSizeSmallEquivalent } from '../../data/particles/size-tiers';
import { totalToSizeCounts, addMotes, spendMotes } from '../resources/resource-state';
import type { ResourceState } from '../resources/resource-state';
import type { ForgeCrunchState } from './forge-state';

// ─── Constants ────────────────────────────────────────────────────

/** Delay from drag-entry to crunch moment, in ms. */
export const FORGE_MOTE_CRUNCH_DELAY_MS = 2_000;

// ─── Types ────────────────────────────────────────────────────────

export interface ForgeMoteConversionResult {
  outputTierId: TierId;
  /** SizeIndex → count of output motes spawned. */
  outputCounts: Map<SizeIndex, number>;
}

// ─── Pure output calculation ──────────────────────────────────────

/**
 * Calculate the forge conversion output for a given mote.
 *
 * @param inputTierId    Tier of the source mote.
 * @param inputSizeIndex  SizeIndex of the source (must be ≥ 1; 1×1 = SizeIndex 0 is rejected).
 * @param forgeEfficiency  Multiplier (1.0 = 100%, 2.05 = 205%).
 * @returns Conversion result, or null if the input is invalid.
 */
export function calcForgeConversionOutput(
  inputTierId: TierId,
  inputSizeIndex: SizeIndex,
  forgeEfficiency: number,
): ForgeMoteConversionResult | null {
  if (inputSizeIndex < 1) return null; // 1×1 motes are rejected

  const tierIndex = TIERS.findIndex(t => t.id === inputTierId);
  if (tierIndex < 0 || tierIndex + 1 >= TIERS.length) return null;

  const outputTierId = TIERS[tierIndex + 1]!.id;
  const outputSizeIndex: SizeIndex = inputSizeIndex - 1;

  // Base value in smallest units of the output tier
  // SizeIndex S-1 → getSizeSmallEquivalent(S-1) = MERGE_THRESHOLD^(S-1)
  const baseOutputValue = getSizeSmallEquivalent(outputSizeIndex);
  const totalOutputValue = Math.floor(baseOutputValue * forgeEfficiency);

  const outputCounts = totalToSizeCounts(totalOutputValue);

  return { outputTierId, outputCounts };
}

// ─── State machine ────────────────────────────────────────────────

/**
 * Begin a forge mote conversion (player drags a mote onto the forge).
 * Returns false if another conversion is already pending, or if the mote
 * size is 1×1 (SizeIndex 0), which is too small to crunch.
 */
export function startForgeMoteConversion(
  forge: ForgeCrunchState,
  tierId: TierId,
  sizeIndex: SizeIndex,
  nowMs: number,
): boolean {
  if (forge.moteConversionState !== 'idle') return false;
  if (sizeIndex < 1) return false; // 1×1 rejected with physical feedback (caller's responsibility)

  forge.moteConversionState = 'forgePending';
  forge.moteConversionTierId = tierId;
  forge.moteConversionSizeIndex = sizeIndex;
  forge.moteConversionStartMs = nowMs;
  return true;
}

/**
 * Attempt to cancel the pending conversion (player drags mote back out).
 * Only succeeds while state is 'forgePending' AND the crunch moment has
 * not yet passed (nowMs < startMs + FORGE_MOTE_CRUNCH_DELAY_MS).
 *
 * Returns true on success; false if it is too late to cancel.
 */
export function cancelForgeMoteConversion(
  forge: ForgeCrunchState,
  nowMs: number,
): boolean {
  if (forge.moteConversionState !== 'forgePending') return false;
  if (
    forge.moteConversionStartMs !== null &&
    nowMs - forge.moteConversionStartMs >= FORGE_MOTE_CRUNCH_DELAY_MS
  ) {
    return false; // Crunch moment has already passed — cannot cancel
  }
  forge.moteConversionState = 'forgeCancelling';
  return true;
}

/**
 * Returns true when the crunch moment has been reached for the pending conversion.
 * The caller (game loop) should invoke commitForgeMoteConversion when this returns true.
 */
export function isForgeMoteConversionReady(
  forge: ForgeCrunchState,
  nowMs: number,
): boolean {
  if (forge.moteConversionState !== 'forgePending' || forge.moteConversionStartMs === null) {
    return false;
  }
  return nowMs - forge.moteConversionStartMs >= FORGE_MOTE_CRUNCH_DELAY_MS;
}

/**
 * Commit the forge conversion at the crunch moment.
 *
 * Atomically:
 *   1. Sets state to 'forgeCommitted' (consumed exactly once).
 *   2. Spends the source mote value from the input tier's inventory.
 *   3. Adds output motes to the output tier's inventory.
 *   4. Resets state to 'idle'.
 *
 * Returns the conversion result, or null if the state is not 'forgePending'
 * or if the resources are insufficient.
 */
export function commitForgeMoteConversion(
  forge: ForgeCrunchState,
  resources: ResourceState,
  forgeEfficiency: number,
): ForgeMoteConversionResult | null {
  if (forge.moteConversionState !== 'forgePending') return null;
  if (forge.moteConversionTierId === null || forge.moteConversionSizeIndex === null) return null;

  const result = calcForgeConversionOutput(
    forge.moteConversionTierId as TierId,
    forge.moteConversionSizeIndex,
    forgeEfficiency,
  );
  if (!result) {
    resetForgeMoteConversion(forge);
    return null;
  }

  // Consume source mote (value in smallest units of its tier)
  const inputValue = getSizeSmallEquivalent(forge.moteConversionSizeIndex);
  if (!spendMotes(resources, forge.moteConversionTierId as TierId, inputValue)) {
    // Not enough motes (should not happen in normal play — reset gracefully)
    resetForgeMoteConversion(forge);
    return null;
  }

  // Mark as committed — source consumed exactly once
  forge.moteConversionState = 'forgeCommitted';

  // Add output motes
  for (const [sizeIndex, count] of result.outputCounts) {
    const outputValue = getSizeSmallEquivalent(sizeIndex) * count;
    addMotes(resources, result.outputTierId, outputValue);
  }

  // Return to idle immediately after commit
  forge.moteConversionState = 'idle';
  forge.moteConversionTierId = null;
  forge.moteConversionSizeIndex = null;
  forge.moteConversionStartMs = null;

  return result;
}

/**
 * Reset the forge mote conversion state to idle.
 * Call after a 'forgeCancelling' animation completes, or after an error.
 */
export function resetForgeMoteConversion(forge: ForgeCrunchState): void {
  forge.moteConversionState = 'idle';
  forge.moteConversionTierId = null;
  forge.moteConversionSizeIndex = null;
  forge.moteConversionStartMs = null;
}
