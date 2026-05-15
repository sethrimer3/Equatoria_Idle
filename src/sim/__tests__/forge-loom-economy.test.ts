/**
 * forge-loom-economy.test.ts — Unit tests for the core forge/loom economy functions.
 *
 * Covers:
 *   - tapForgeHeat (heat accumulation, 3-tap crunch trigger, timeout reset)
 *   - applyForgeSacrifice (sacrifice mass progress, threshold conversion, fractional remainder)
 *   - applyLoomCapture (input → output conversion, fractional progress, efficiency modifies threshold)
 *   - getLoomInputTierId (sand returns null, quartz returns sand, ruby returns quartz, unknown is safe)
 */

import { describe, it, expect } from 'vitest';
import {
  createForgeCrunchState,
  tapForgeHeat,
  tickForgeHeatTimeout,
  HEAT_TAP_COUNT_FOR_CRUNCH,
} from '../forge/forge-state';
import { applyForgeSacrifice } from '../game-state';
import {
  createLoomState as _createLoomState,  // imported for test clarity but not directly called
  getLoomInputTierId,
  applyLoomCapture,
  getLoomConversionThreshold,
  tryUpgradeLoomEfficiency as _tryUpgradeLoomEfficiency,
} from '../looms';
import { createGameState } from '../game-state';
import { getMotes } from '../resources';
import type { TierId } from '../../data/tiers';

// ─── tapForgeHeat ────────────────────────────────────────────────

describe('tapForgeHeat', () => {
  it('increments heatTapCount on the first tap', () => {
    const state = createForgeCrunchState();
    const result = tapForgeHeat(state, 0);
    expect(result).toBe(false);
    expect(state.heatTapCount).toBe(1);
  });

  it('returns true and resets heat count on the third tap', () => {
    const state = createForgeCrunchState();
    tapForgeHeat(state, 0);
    tapForgeHeat(state, 1);
    const result = tapForgeHeat(state, 2);
    expect(result).toBe(true);
    expect(state.heatTapCount).toBe(0);
  });

  it(`requires exactly ${HEAT_TAP_COUNT_FOR_CRUNCH} taps to trigger`, () => {
    const state = createForgeCrunchState();
    for (let i = 1; i < HEAT_TAP_COUNT_FOR_CRUNCH; i++) {
      expect(tapForgeHeat(state, i)).toBe(false);
    }
    expect(tapForgeHeat(state, HEAT_TAP_COUNT_FOR_CRUNCH)).toBe(true);
  });

  it('returns false while a crunch is already active', () => {
    const state = createForgeCrunchState();
    state.isActive = true;
    const result = tapForgeHeat(state, 0);
    expect(result).toBe(false);
    expect(state.heatTapCount).toBe(0); // not incremented while active
  });
});

// ─── tickForgeHeatTimeout ────────────────────────────────────────

describe('tickForgeHeatTimeout', () => {
  it('resets heat count when 30 seconds have elapsed since the last tap', () => {
    const state = createForgeCrunchState();
    // Use a non-zero base time so the lastHeatTapMs guard in tickForgeHeatTimeout passes
    tapForgeHeat(state, 1_000);
    expect(state.heatTapCount).toBe(1);
    // Simulate 31 seconds passing after the tap
    tickForgeHeatTimeout(state, 32_000);
    expect(state.heatTapCount).toBe(0);
  });

  it('does not reset if the timeout has not elapsed', () => {
    const state = createForgeCrunchState();
    tapForgeHeat(state, 1_000);
    tickForgeHeatTimeout(state, 6_000);
    expect(state.heatTapCount).toBe(1);
  });
});

// ─── applyForgeSacrifice ─────────────────────────────────────────

describe('applyForgeSacrifice', () => {
  it('accumulates sacrifice mass in sacrificeProgressByTierId', () => {
    const game = createGameState();
    const sacrifices = new Map<string, number>([['sand', 500]]);
    applyForgeSacrifice(game, sacrifices);
    expect(game.forge.sacrificeProgressByTierId.get('sand')).toBe(500);
  });

  it('converts progress into equation upgrades at the threshold', () => {
    const THRESHOLD = 2_000;
    const game = createGameState();
    const sacrifices = new Map<string, number>([['sand', THRESHOLD]]);
    applyForgeSacrifice(game, sacrifices);
    // After exactly one threshold's worth of mass, progress should be 0
    expect(game.forge.sacrificeProgressByTierId.get('sand')).toBe(0);
    // The equation state should have been updated (at minimum no error thrown)
    expect(game.equation).toBeTruthy();
  });

  it('stores fractional progress below the threshold', () => {
    const game = createGameState();
    const sacrifices = new Map<string, number>([['sand', 800]]);
    applyForgeSacrifice(game, sacrifices);
    expect(game.forge.sacrificeProgressByTierId.get('sand')).toBe(800);
    // Add more that pushes over the 2000 threshold
    const sacrifices2 = new Map<string, number>([['sand', 1500]]);
    applyForgeSacrifice(game, sacrifices2);
    // Total 2300: one conversion, 300 remaining
    expect(game.forge.sacrificeProgressByTierId.get('sand')).toBe(300);
  });

  it('handles multiple tiers independently', () => {
    const game = createGameState();
    applyForgeSacrifice(game, new Map([['sand', 100], ['quartz', 200]]));
    expect(game.forge.sacrificeProgressByTierId.get('sand')).toBe(100);
    expect(game.forge.sacrificeProgressByTierId.get('quartz')).toBe(200);
  });
});

// ─── applyLoomCapture ────────────────────────────────────────────

describe('applyLoomCapture', () => {
  /** Create a minimal resource state with quartz loom unlocked. */
  function makeSetup() {
    const game = createGameState();
    // Unlock quartz loom so applyLoomCapture can target it
    const quartzLoom = game.looms.looms.find(l => l.tierId === 'quartz');
    if (quartzLoom) quartzLoom.isUnlocked = true;
    return game;
  }

  it('converts input-tier mass into output-tier motes at the default threshold', () => {
    const game = makeSetup();
    const threshold = getLoomConversionThreshold(0); // efficiency level 0
    // Send exactly one threshold worth of sand mass to the quartz loom
    applyLoomCapture(game.looms, game.resources, 'sand' as TierId, threshold);
    expect(getMotes(game.resources, 'quartz' as TierId)).toBe(1);
  });

  it('preserves fractional conversion progress below the threshold', () => {
    const game = makeSetup();
    const threshold = getLoomConversionThreshold(0);
    const partial = threshold * 0.4;
    applyLoomCapture(game.looms, game.resources, 'sand' as TierId, partial);
    expect(getMotes(game.resources, 'quartz' as TierId)).toBe(0);
    const quartzLoom = game.looms.looms.find(l => l.tierId === 'quartz')!;
    expect(quartzLoom.conversionProgress).toBeCloseTo(partial, 5);
  });

  it('efficiency level lowers the conversion threshold', () => {
    const game = makeSetup();
    const quartzLoom = game.looms.looms.find(l => l.tierId === 'quartz')!;
    quartzLoom.conversionEfficiencyLevel = 1;
    const threshold1 = getLoomConversionThreshold(1);
    // The level-1 threshold should be lower than level-0
    expect(threshold1).toBeLessThan(getLoomConversionThreshold(0));
    // Sending that amount should produce exactly 1 mote
    applyLoomCapture(game.looms, game.resources, 'sand' as TierId, threshold1);
    expect(getMotes(game.resources, 'quartz' as TierId)).toBe(1);
  });

  it('does nothing for sand (no input tier)', () => {
    const game = createGameState();
    const before = getMotes(game.resources, 'sand' as TierId);
    // sand has no loom that accepts sand as input
    applyLoomCapture(game.looms, game.resources, 'sand' as TierId, 9999);
    // Sand motes should not change from loom capture
    expect(getMotes(game.resources, 'sand' as TierId)).toBe(before);
  });
});

// ─── getLoomInputTierId ──────────────────────────────────────────

describe('getLoomInputTierId', () => {
  it('returns null for sand (first tier, no input)', () => {
    expect(getLoomInputTierId('sand' as TierId)).toBeNull();
  });

  it('returns sand for quartz (second tier)', () => {
    expect(getLoomInputTierId('quartz' as TierId)).toBe('sand');
  });

  it('returns quartz for ruby (third tier)', () => {
    expect(getLoomInputTierId('ruby' as TierId)).toBe('quartz');
  });

  it('returns null for an unknown tier id without throwing', () => {
    // The function should safely return null for unrecognised tier IDs
    // (findIndex returns -1, which is ≤ 0).
    expect(getLoomInputTierId('unknown_tier' as TierId)).toBeNull();
  });
});
