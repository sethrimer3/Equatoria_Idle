/**
 * forge-loom-economy.test.ts — Unit tests for the core loom economy functions
 * and confirmation that the legacy forge-tap mechanic is fully disabled.
 *
 * Covers:
 *   - tapEquationForge (now a no-op — always returns false)
 *   - applyForgeSacrifice (now a no-op — always returns empty Map)
 *   - applyLoomCapture (input → output conversion, fractional progress, efficiency modifies threshold)
 *   - getLoomInputTierId (sand returns null, quartz returns sand, ruby returns quartz, unknown is safe)
 */

import { describe, it, expect } from 'vitest';
import { applyForgeSacrifice, tapEquationForge } from '../game-state';
import {
  getLoomInputTierId,
  applyLoomCapture,
  getLoomConversionThreshold,
} from '../looms';
import { createGameState } from '../game-state';
import { getMotes } from '../resources';
import type { TierId } from '../../data/tiers';

// ─── tapEquationForge (no-op) ────────────────────────────────────

describe('tapEquationForge', () => {
  it('always returns false — forge tapping is no longer a mechanic', () => {
    const game = createGameState();
    game.equation.isForgeUnlocked = true;
    expect(tapEquationForge(game, 0)).toBe(false);
    expect(tapEquationForge(game, 1000)).toBe(false);
    expect(tapEquationForge(game, 2000)).toBe(false);
    // No heat-tap counter side effects
    expect(game.forge.heatTapCount).toBe(0);
  });
});

// ─── applyForgeSacrifice (no-op) ────────────────────────────────

describe('applyForgeSacrifice', () => {
  it('returns an empty Map and does not mutate any forge state', () => {
    const game = createGameState();
    const sacrifices = new Map<string, number>([['sand', 5000], ['quartz', 2000]]);
    const result = applyForgeSacrifice(game, sacrifices);
    expect(result.size).toBe(0);
    // No sacrifice progress accumulated
    expect(game.forge.sacrificeProgressByTierId.size).toBe(0);
    // No refined-crystal progress accumulated
    expect(game.forge.refinedProgressByTierId.size).toBe(0);
    // refinedCrystalsByTierId is always empty
    expect(game.rpg.refinedCrystalsByTierId.size).toBe(0);
  });

  it('does not grant refined crystals even for large sacrifice amounts', () => {
    const game = createGameState();
    applyForgeSacrifice(game, new Map([['diamond', 1_000_000]]));
    expect(game.rpg.refinedCrystalsByTierId.size).toBe(0);
  });
});

// ─── applyLoomCapture ────────────────────────────────────────────

describe('applyLoomCapture', () => {
  function makeSetup() {
    const game = createGameState();
    const quartzLoom = game.looms.looms.find(l => l.tierId === 'quartz');
    if (quartzLoom) quartzLoom.isUnlocked = true;
    return game;
  }

  it('converts input-tier mass into output-tier motes at the default threshold', () => {
    const game = makeSetup();
    const threshold = getLoomConversionThreshold(0);
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
    expect(threshold1).toBeLessThan(getLoomConversionThreshold(0));
    applyLoomCapture(game.looms, game.resources, 'sand' as TierId, threshold1);
    expect(getMotes(game.resources, 'quartz' as TierId)).toBe(1);
  });

  it('does nothing for sand (no input tier)', () => {
    const game = createGameState();
    const before = getMotes(game.resources, 'sand' as TierId);
    applyLoomCapture(game.looms, game.resources, 'sand' as TierId, 9999);
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
    expect(getLoomInputTierId('unknown_tier' as TierId)).toBeNull();
  });
});
