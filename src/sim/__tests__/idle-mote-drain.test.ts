/**
 * idle-mote-drain.test.ts — Verifies the idle-mote queue decomposition
 * and the contract between pendingIdleMotes and resource/particle accounting.
 *
 * Key invariants tested:
 *  - 101 idle motes → one sizeIndex-1 entry (count 1) + one sizeIndex-0 entry (count 1)
 *  - 100 idle motes → one sizeIndex-1 entry only (no tiny sizeIndex-0 entry)
 *  - Resources are NOT credited by simTick (drain is app-layer only now)
 *  - pendingMoteValue matches MERGE_THRESHOLD^sizeIndex
 */

import { describe, it, expect } from 'vitest';
import { createGameState, pendingMoteValue, simTick } from '../game-state';
import { queueIdleRewards } from '../idle/apply-idle-rewards';
import { getMotes } from '../resources';
import { MERGE_THRESHOLD } from '../../data/particles/size-tiers';
import type { IdleRewardSummary } from '../idle/idle-reward';
import { TIERS } from '../../data/tiers';

// Build a minimal IdleRewardSummary for a given sand mote count.
function makeSummary(totalMotes: number): IdleRewardSummary {
  return {
    minutesAway: 1,
    equivalenceBefore: 0,
    equivalenceAfter: totalMotes,
    equivalenceGained: totalMotes,
    tierRewards: TIERS.map(tier => ({
      tierId: tier.id,
      displayName: tier.displayName,
      color: tier.color,
      ratePerMinute: tier.id === 'sand' ? totalMotes : 0,
      totalMotes: tier.id === 'sand' ? totalMotes : 0,
      isUnlocked: tier.id === 'sand',
    })),
  };
}

// ─── pendingMoteValue ────────────────────────────────────────────

describe('pendingMoteValue', () => {
  it('returns 1 for sizeIndex 0', () => {
    expect(pendingMoteValue(0)).toBe(1);
  });
  it('returns MERGE_THRESHOLD for sizeIndex 1', () => {
    expect(pendingMoteValue(1)).toBe(MERGE_THRESHOLD);
  });
  it('returns MERGE_THRESHOLD^2 for sizeIndex 2', () => {
    expect(pendingMoteValue(2)).toBe(MERGE_THRESHOLD ** 2);
  });
});

// ─── queueIdleRewards decomposition ─────────────────────────────

describe('queueIdleRewards', () => {
  it('decomposes 101 sand motes into sizeIndex-1 (count 1) then sizeIndex-0 (count 1)', () => {
    const game = createGameState();
    queueIdleRewards(game, makeSummary(101));

    // Entry 0: one sizeIndex-1 mote worth 100
    expect(game.pendingIdleMotes[0]).toMatchObject({ tierId: 'sand', sizeIndex: 1, count: 1 });
    // Entry 1: one sizeIndex-0 mote worth 1
    expect(game.pendingIdleMotes[1]).toMatchObject({ tierId: 'sand', sizeIndex: 0, count: 1 });
    expect(game.pendingIdleMotes.length).toBe(2);
  });

  it('decomposes 100 sand motes into a single sizeIndex-1 entry', () => {
    const game = createGameState();
    queueIdleRewards(game, makeSummary(100));

    expect(game.pendingIdleMotes.length).toBe(1);
    expect(game.pendingIdleMotes[0]).toMatchObject({ tierId: 'sand', sizeIndex: 1, count: 1 });
  });

  it('decomposes 250 sand motes into sizeIndex-1 (count 2) then sizeIndex-0 (count 50)', () => {
    const game = createGameState();
    queueIdleRewards(game, makeSummary(250));

    expect(game.pendingIdleMotes[0]).toMatchObject({ tierId: 'sand', sizeIndex: 1, count: 2 });
    expect(game.pendingIdleMotes[1]).toMatchObject({ tierId: 'sand', sizeIndex: 0, count: 50 });
  });
});

// ─── simTick no longer drains pendingIdleMotes ──────────────────

describe('simTick does not drain pendingIdleMotes', () => {
  it('leaves the queue intact across multiple ticks', () => {
    const game = createGameState();
    queueIdleRewards(game, makeSummary(101));

    const pendingBefore = game.pendingIdleMotes.length;
    const entryCountBefore = game.pendingIdleMotes.map(e => e.count);

    // Run several ticks; none should drain the queue.
    simTick(game, 16);
    simTick(game, 16);

    // Queue length and per-entry counts must be unchanged.
    expect(game.pendingIdleMotes.length).toBe(pendingBefore);
    for (let i = 0; i < game.pendingIdleMotes.length; i++) {
      expect(game.pendingIdleMotes[i]!.count).toBe(entryCountBefore[i]);
    }
  });

  it('does not credit idle mote amounts to resources (only tiny loom production is allowed)', () => {
    const game = createGameState();
    queueIdleRewards(game, makeSummary(101));

    const sandBefore = getMotes(game.resources, 'sand');

    // 32 ms of ticks; the sand loom (level 1) produces a tiny fraction.
    simTick(game, 16);
    simTick(game, 16);

    const delta = getMotes(game.resources, 'sand') - sandBefore;
    // Any idle mote credit would be >= 1 (sizeIndex 0) or 100 (sizeIndex 1).
    // Loom production over 32 ms is well below 1 mote.
    expect(delta).toBeLessThan(1);
  });
});
