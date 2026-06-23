/**
 * forge-mote-conversion.test.ts — 13 required tests for the drag-based mote forge economy.
 *
 * Test index:
 *  1.  No separate refined-mote economy is active (refinedCrystalsByTierId always empty)
 *  2.  Forge tapping is a no-op (tapEquationForge always returns false)
 *  3.  Dragging a valid 2×2 mote onto the forge converts only that mote
 *  4.  1×1 motes (SizeIndex 0) are rejected — not converted
 *  5.  Sand 2×2 → exactly 1 Quartz 1×1 at 100% efficiency
 *  6.  Sand 2×2 → exactly 2 Quartz 1×1 at 205% efficiency
 *  7.  Sand 3×3 at 125% efficiency → deterministic packing (1 Quartz 2×2 + 25 Quartz 1×1)
 *  8.  Conversion can be cancelled before the crunch moment
 *  9.  Conversion cannot be cancelled after the crunch moment
 * 10.  A pending mote cannot be double-converted
 * 11.  Low-graphics mode: renders only the largest size when larger sizes exist
 * 12.  Low-graphics mode: renders 1×1 motes when no larger sizes exist for that tier
 * 13.  Save migration: old refinedCrystalsByTierId values are converted to physical motes
 */

import { describe, it, expect } from 'vitest';
import { createForgeCrunchState } from '../forge/forge-state';
import {
  calcForgeConversionOutput,
  startForgeMoteConversion,
  cancelForgeMoteConversion,
  commitForgeMoteConversion,
  isForgeMoteConversionReady,
  FORGE_MOTE_CRUNCH_DELAY_MS,
} from '../forge/forge-mote-conversion';
import { filterMotesForLowGraphics, totalToSizeCounts } from '../resources/resource-state';
import { createResourceState, addMotes, getMotes } from '../resources';
import { applyForgeSacrifice, tapEquationForge, createGameState } from '../game-state';
import { deserializeGameState } from '../../settings/save-deserialize';
import type { SaveData } from '../../settings/save-types';
import type { TierId } from '../../data/tiers';

// ─── Test 1: No separate refined-mote economy ───────────────────

describe('Test 1 — no separate refined-mote economy', () => {
  it('refinedCrystalsByTierId is always empty on a new game state', () => {
    const game = createGameState();
    expect(game.rpg.refinedCrystalsByTierId.size).toBe(0);
  });

  it('applyForgeSacrifice never populates refinedCrystalsByTierId', () => {
    const game = createGameState();
    applyForgeSacrifice(game, new Map([['sand', 1_000_000]]));
    expect(game.rpg.refinedCrystalsByTierId.size).toBe(0);
  });
});

// ─── Test 2: Forge tapping is a no-op ───────────────────────────

describe('Test 2 — forge tapping is a no-op', () => {
  it('tapEquationForge always returns false and leaves forge state clean', () => {
    const game = createGameState();
    game.equation.isForgeUnlocked = true;
    const r1 = tapEquationForge(game, 0);
    const r2 = tapEquationForge(game, 1000);
    const r3 = tapEquationForge(game, 2000);
    expect(r1).toBe(false);
    expect(r2).toBe(false);
    expect(r3).toBe(false);
    expect(game.forge.heatTapCount).toBe(0);
    expect(game.forge.isWarmingUp).toBe(false);
  });
});

// ─── Test 3: Valid 2×2 mote converts only that mote ─────────────

describe('Test 3 — dragging a valid 2×2 mote converts only that mote', () => {
  it('commits and consumes exactly one 2×2 sand mote, adding quartz output', () => {
    const forge = createForgeCrunchState();
    const resources = createResourceState();

    // Place 2 sand 2×2 motes (value = 100 each → total 200) plus a 1×1 (value = 1)
    addMotes(resources, 'sand' as TierId, 201); // 2×(100) + 1×(1)

    const sandBefore = getMotes(resources, 'sand' as TierId);
    const quartzBefore = getMotes(resources, 'quartz' as TierId);

    // Start conversion for one 2×2 (SizeIndex 1)
    const started = startForgeMoteConversion(forge, 'sand' as TierId, 1, 0);
    expect(started).toBe(true);

    // Advance past the crunch moment
    expect(isForgeMoteConversionReady(forge, FORGE_MOTE_CRUNCH_DELAY_MS)).toBe(true);
    const result = commitForgeMoteConversion(forge, resources, 1.0);

    expect(result).not.toBeNull();
    // Sand decreased by exactly one 2×2 equivalent (100)
    expect(getMotes(resources, 'sand' as TierId)).toBe(sandBefore - 100);
    // Quartz increased (at 100% efficiency: 1 Quartz 1×1)
    expect(getMotes(resources, 'quartz' as TierId)).toBe(quartzBefore + 1);
  });
});

// ─── Test 4: 1×1 motes are rejected ─────────────────────────────

describe('Test 4 — 1×1 motes (SizeIndex 0) are rejected', () => {
  it('startForgeMoteConversion returns false for SizeIndex 0', () => {
    const forge = createForgeCrunchState();
    const started = startForgeMoteConversion(forge, 'sand' as TierId, 0, 0);
    expect(started).toBe(false);
    expect(forge.moteConversionState).toBe('idle');
  });

  it('calcForgeConversionOutput returns null for SizeIndex 0', () => {
    const result = calcForgeConversionOutput('sand' as TierId, 0, 1.0);
    expect(result).toBeNull();
  });
});

// ─── Test 5: Sand 2×2 → 1 Quartz 1×1 at 100% efficiency ────────

describe('Test 5 — Sand 2×2 → exactly 1 Quartz 1×1 at 100% efficiency', () => {
  it('produces outputCounts = { 0 → 1 } (one Quartz 1×1)', () => {
    const result = calcForgeConversionOutput('sand' as TierId, 1, 1.0);
    expect(result).not.toBeNull();
    expect(result!.outputTierId).toBe('quartz');
    expect(result!.outputCounts.get(0)).toBe(1);
    expect(result!.outputCounts.size).toBe(1);
  });
});

// ─── Test 6: Sand 2×2 → 2 Quartz 1×1 at 205% efficiency ────────

describe('Test 6 — Sand 2×2 → 2 Quartz 1×1 at 205% efficiency', () => {
  it('floor(1 × 2.05) = 2 → outputCounts = { 0 → 2 }', () => {
    const result = calcForgeConversionOutput('sand' as TierId, 1, 2.05);
    expect(result).not.toBeNull();
    expect(result!.outputTierId).toBe('quartz');
    expect(result!.outputCounts.get(0)).toBe(2);
    expect(result!.outputCounts.size).toBe(1);
  });
});

// ─── Test 7: Sand 3×3 at 125% efficiency → deterministic packing ─

describe('Test 7 — Sand 3×3 at 125% efficiency → 1 Quartz 2×2 + 25 Quartz 1×1', () => {
  it('floor(100 × 1.25) = 125 → base-100 packing: { 0 → 25, 1 → 1 }', () => {
    // SizeIndex 2 = 3×3; converts to Quartz at SizeIndex 1
    // baseOutputValue = getSizeSmallEquivalent(1) = 100
    // totalOutputValue = floor(100 × 1.25) = 125
    // totalToSizeCounts(125): 125 % 100 = 25 → size 0; floor(125/100) = 1 → size 1
    const result = calcForgeConversionOutput('sand' as TierId, 2, 1.25);
    expect(result).not.toBeNull();
    expect(result!.outputTierId).toBe('quartz');
    expect(result!.outputCounts.get(0)).toBe(25); // 25 Quartz 1×1
    expect(result!.outputCounts.get(1)).toBe(1);  // 1 Quartz 2×2
    expect(result!.outputCounts.size).toBe(2);
  });

  it('totalToSizeCounts(125) matches the expected packing directly', () => {
    const counts = totalToSizeCounts(125);
    expect(counts.get(0)).toBe(25);
    expect(counts.get(1)).toBe(1);
  });
});

// ─── Test 8: Cancel before crunch moment ────────────────────────

describe('Test 8 — conversion can be cancelled before the crunch moment', () => {
  it('cancelForgeMoteConversion returns true when called before crunch moment', () => {
    const forge = createForgeCrunchState();
    startForgeMoteConversion(forge, 'sand' as TierId, 1, 0);
    // Cancel at t=500ms (well before 2000ms crunch moment)
    const cancelled = cancelForgeMoteConversion(forge, 500);
    expect(cancelled).toBe(true);
    expect(forge.moteConversionState).toBe('forgeCancelling');
  });

  it('no motes are consumed when cancelled', () => {
    const forge = createForgeCrunchState();
    const resources = createResourceState();
    addMotes(resources, 'sand' as TierId, 100);
    startForgeMoteConversion(forge, 'sand' as TierId, 1, 0);
    cancelForgeMoteConversion(forge, 500);
    // Mote inventory must be unchanged
    expect(getMotes(resources, 'sand' as TierId)).toBe(100);
  });
});

// ─── Test 9: Cannot cancel after crunch moment ──────────────────

describe('Test 9 — conversion cannot be cancelled after the crunch moment', () => {
  it('cancelForgeMoteConversion returns false at or after FORGE_MOTE_CRUNCH_DELAY_MS', () => {
    const forge = createForgeCrunchState();
    startForgeMoteConversion(forge, 'sand' as TierId, 1, 0);
    // Try to cancel exactly at the crunch moment
    const cancelled = cancelForgeMoteConversion(forge, FORGE_MOTE_CRUNCH_DELAY_MS);
    expect(cancelled).toBe(false);
    expect(forge.moteConversionState).toBe('forgePending'); // state unchanged
  });

  it('isForgeMoteConversionReady is true at or after the delay', () => {
    const forge = createForgeCrunchState();
    startForgeMoteConversion(forge, 'sand' as TierId, 1, 0);
    expect(isForgeMoteConversionReady(forge, FORGE_MOTE_CRUNCH_DELAY_MS - 1)).toBe(false);
    expect(isForgeMoteConversionReady(forge, FORGE_MOTE_CRUNCH_DELAY_MS)).toBe(true);
  });
});

// ─── Test 10: Double-conversion prevention ───────────────────────

describe('Test 10 — pending forge mote cannot be double-converted', () => {
  it('startForgeMoteConversion returns false when a conversion is already pending', () => {
    const forge = createForgeCrunchState();
    const started1 = startForgeMoteConversion(forge, 'sand' as TierId, 1, 0);
    const started2 = startForgeMoteConversion(forge, 'quartz' as TierId, 1, 100);
    expect(started1).toBe(true);
    expect(started2).toBe(false);
    // The original pending conversion must still be intact
    expect(forge.moteConversionTierId).toBe('sand');
    expect(forge.moteConversionSizeIndex).toBe(1);
  });

  it('commitForgeMoteConversion consumes the source mote exactly once', () => {
    const forge = createForgeCrunchState();
    const resources = createResourceState();
    addMotes(resources, 'sand' as TierId, 100); // exactly one 2×2 worth
    startForgeMoteConversion(forge, 'sand' as TierId, 1, 0);

    const result1 = commitForgeMoteConversion(forge, resources, 1.0);
    expect(result1).not.toBeNull();

    // State is back to idle after commit — a second commit must fail
    const result2 = commitForgeMoteConversion(forge, resources, 1.0);
    expect(result2).toBeNull();

    // Sand is now 0 (consumed once, not twice)
    expect(getMotes(resources, 'sand' as TierId)).toBe(0);
  });
});

// ─── Test 11: Low-graphics mode — largest size rendered ─────────

describe('Test 11 — low-graphics mode renders only largest size per tier when larger exist', () => {
  it('returns only the largest non-zero size entry', () => {
    // 3 Quartz 1×1, 2 Quartz 2×2, 1 Quartz 3×3
    const sizeCounts = new Map<number, number>([[0, 3], [1, 2], [2, 1]]);
    const filtered = filterMotesForLowGraphics(sizeCounts);
    expect(filtered.size).toBe(1);
    expect(filtered.get(2)).toBe(1); // only the 3×3 count survives
    expect(filtered.has(0)).toBe(false);
    expect(filtered.has(1)).toBe(false);
  });

  it('ignores size entries with zero count', () => {
    const sizeCounts = new Map<number, number>([[0, 5], [1, 0], [2, 3]]);
    const filtered = filterMotesForLowGraphics(sizeCounts);
    expect(filtered.size).toBe(1);
    expect(filtered.get(2)).toBe(3);
  });
});

// ─── Test 12: Low-graphics mode — 1×1 rendered when no larger ───

describe('Test 12 — low-graphics mode renders 1×1 when no larger sizes exist', () => {
  it('returns 1×1 (SizeIndex 0) entry when that is the only non-zero size', () => {
    const sizeCounts = new Map<number, number>([[0, 7]]);
    const filtered = filterMotesForLowGraphics(sizeCounts);
    expect(filtered.size).toBe(1);
    expect(filtered.get(0)).toBe(7);
  });

  it('returns empty Map when sizeCounts is empty', () => {
    const filtered = filterMotesForLowGraphics(new Map());
    expect(filtered.size).toBe(0);
  });
});

// ─── Test 13: Save migration ─────────────────────────────────────

describe('Test 13 — save migration converts old refinedCrystalsByTierId to physical motes', () => {
  it('converts old refined-crystal values to moteTotals and leaves refinedCrystalsByTierId empty', () => {
    // Build a minimal v34 save with non-zero refinedCrystalsByTierId
    const minimalSave: SaveData = {
      version: 34,
      timestamp: 0,
      equation: { segments: [], totalTapCount: 0, isForgeUnlocked: false },
      resources: { moteSizeCounts: {}, lifetimeMotes: {} },
      progression: { upgradeLevels: {}, unlockedTierCount: 1, autoTapLevel: 0, globalMultiplier: 1 },
      looms: { looms: [] },
      achievements: { unlockedIds: [], claimedIds: [] },
      aliven: { alivenedTierIds: [] },
      rpg: {
        highestWaveReached: 0,
        purchasedWeaponIds: [],
        // Old refined-crystal values: 5 sand refined crystals, 3 quartz
        refinedCrystalsByTierId: { sand: '5', quartz: '3' },
      },
      elapsedMs: 0,
    };

    const state = deserializeGameState(minimalSave);

    // Old crystals must be in moteTotals now
    expect(getMotes(state.resources, 'sand' as TierId)).toBe(5);
    expect(getMotes(state.resources, 'quartz' as TierId)).toBe(3);

    // refinedCrystalsByTierId must be empty — the field is never repopulated
    expect(state.rpg.refinedCrystalsByTierId.size).toBe(0);
  });
});
