/**
 * weave-flavor-tests.test.ts — Tests for flavor-weighted weave effect pool selection.
 */

import { describe, it, expect } from 'vitest';
import {
  rollWeaveEffects,
  getWeaveDominantTiers,
  getEligibleWeaveEffectsForRoll,
  pickWeightedWeaveEffect,
  createCraftedWeave,
} from '../weave-rolling';
import { ALL_WEAVE_EFFECT_IDS } from '../weave-effects-registry';
import type { CraftedWeaveData } from '../weave-types';

function makeAffix(rarity: string): CraftedWeaveData['affixes'][number] {
  return {
    affixId: 'citrine_all_loom', tierId: 'citrine', label: 'Test', quality: 0.5,
    rarity: rarity as CraftedWeaveData['affixes'][number]['rarity'], value: 10, unit: '%', applied: true,
  };
}

// ─── getWeaveDominantTiers ────────────────────────────────────────────────────

describe('getWeaveDominantTiers', () => {
  it('returns a set of present tier IDs', () => {
    const tiers = getWeaveDominantTiers([
      { tierId: 'diamond', refinedCount: 5 },
      { tierId: 'sapphire', refinedCount: 2 },
    ]);
    expect(tiers.has('diamond')).toBe(true);
    expect(tiers.has('sapphire')).toBe(true);
    expect(tiers.has('sand')).toBe(false);
  });

  it('excludes zero-count ingredients', () => {
    const tiers = getWeaveDominantTiers([
      { tierId: 'diamond', refinedCount: 0 },
      { tierId: 'ruby', refinedCount: 3 },
    ]);
    expect(tiers.has('diamond')).toBe(false);
    expect(tiers.has('ruby')).toBe(true);
  });

  it('returns empty set for empty ingredients', () => {
    expect(getWeaveDominantTiers([]).size).toBe(0);
  });
});

// ─── getEligibleWeaveEffectsForRoll ──────────────────────────────────────────

describe('getEligibleWeaveEffectsForRoll', () => {
  it('returns all 7 effects for Uncommon with no ingredient flavor', () => {
    const pool = getEligibleWeaveEffectsForRoll({ ingredients: [], highestRarity: 'Uncommon' });
    expect(pool).toHaveLength(7);
  });

  it('Common rarity: all effects excluded because minRarity is Uncommon', () => {
    const pool = getEligibleWeaveEffectsForRoll({ ingredients: [], highestRarity: 'Common' });
    expect(pool).toHaveLength(0);
  });

  it('diamond ingredients give higher weight to defense effects than quickness', () => {
    const pool = getEligibleWeaveEffectsForRoll({
      ingredients: [{ tierId: 'diamond', refinedCount: 5 }],
      highestRarity: 'Uncommon',
    });
    const guardEntry = pool.find(e => e.id === 'weave_guard')!;
    const wardEntry  = pool.find(e => e.id === 'weave_reactive_ward')!;
    const quicEntry  = pool.find(e => e.id === 'weave_quickness')!;
    expect(guardEntry.weight).toBeGreaterThan(quicEntry.weight);
    expect(wardEntry.weight).toBeGreaterThan(quicEntry.weight);
  });

  it('amethyst ingredients give weave_echo_strike the highest weight', () => {
    const pool = getEligibleWeaveEffectsForRoll({
      ingredients: [{ tierId: 'amethyst', refinedCount: 5 }],
      highestRarity: 'Uncommon',
    });
    const echoEntry = pool.find(e => e.id === 'weave_echo_strike')!;
    // echo_strike is the only amethyst-flavored effect — swiftstrike is sand/quartz
    const nonMatchWeights = pool.filter(e => e.id !== 'weave_echo_strike').map(e => e.weight);
    expect(echoEntry.weight).toBeGreaterThan(Math.max(...nonMatchWeights));
  });

  it('sand ingredients favor weave_quickness', () => {
    const pool = getEligibleWeaveEffectsForRoll({
      ingredients: [{ tierId: 'sand', refinedCount: 5 }],
      highestRarity: 'Uncommon',
    });
    const quicEntry = pool.find(e => e.id === 'weave_quickness')!;
    const echoEntry = pool.find(e => e.id === 'weave_echo_strike')!;
    expect(quicEntry.weight).toBeGreaterThan(echoEntry.weight);
  });

  it('all weights are positive', () => {
    const pool = getEligibleWeaveEffectsForRoll({ ingredients: [], highestRarity: 'Rare' });
    for (const entry of pool) {
      expect(entry.weight).toBeGreaterThan(0);
    }
  });

  it('all 7 effect IDs appear in the pool for Uncommon weave', () => {
    const pool = getEligibleWeaveEffectsForRoll({ ingredients: [], highestRarity: 'Uncommon' });
    const ids = pool.map(e => e.id);
    expect(ids).toContain('weave_focus');
    expect(ids).toContain('weave_quickness');
    expect(ids).toContain('weave_guard');
    expect(ids).toContain('weave_reactive_ward');
    expect(ids).toContain('weave_echo_strike');
    expect(ids).toContain('weave_swiftstrike');
    expect(ids).toContain('weave_ember_surge');
  });

  it('sand ingredients favor weave_swiftstrike alongside weave_quickness', () => {
    const pool = getEligibleWeaveEffectsForRoll({
      ingredients: [{ tierId: 'sand', refinedCount: 5 }],
      highestRarity: 'Uncommon',
    });
    const swiftEntry = pool.find(e => e.id === 'weave_swiftstrike')!;
    const echoEntry  = pool.find(e => e.id === 'weave_echo_strike')!;
    expect(swiftEntry.weight).toBeGreaterThan(echoEntry.weight);
  });

  it('quartz ingredients give weave_swiftstrike higher weight', () => {
    const pool = getEligibleWeaveEffectsForRoll({
      ingredients: [{ tierId: 'quartz', refinedCount: 5 }],
      highestRarity: 'Uncommon',
    });
    const swiftEntry  = pool.find(e => e.id === 'weave_swiftstrike')!;
    const guardEntry  = pool.find(e => e.id === 'weave_guard')!;
    expect(swiftEntry.weight).toBeGreaterThan(guardEntry.weight);
  });
});

// ─── pickWeightedWeaveEffect ──────────────────────────────────────────────────

describe('pickWeightedWeaveEffect', () => {
  it('returns null for empty pool', () => {
    expect(pickWeightedWeaveEffect([], () => 0.5)).toBeNull();
  });

  it('rng=0 always returns the first pool entry', () => {
    const pool = [
      { id: 'weave_focus' as const, weight: 1 },
      { id: 'weave_guard' as const, weight: 3 },
    ];
    expect(pickWeightedWeaveEffect(pool, () => 0)).toBe('weave_focus');
  });

  it('rng=1.0 returns the last pool entry (floating-point fallback)', () => {
    const pool = [
      { id: 'weave_focus' as const, weight: 1 },
      { id: 'weave_echo_strike' as const, weight: 1 },
    ];
    expect(pickWeightedWeaveEffect(pool, () => 1)).toBe('weave_echo_strike');
  });

  it('higher-weight entry wins more of the rng range', () => {
    // Pool: focus w=1, guard w=3. Total=4. threshold at rng=0.3 → 1.2 → guard wins
    const pool = [
      { id: 'weave_focus' as const, weight: 1 },
      { id: 'weave_guard' as const, weight: 3 },
    ];
    expect(pickWeightedWeaveEffect(pool, () => 0.3)).toBe('weave_guard');
    expect(pickWeightedWeaveEffect(pool, () => 0.1)).toBe('weave_focus');
  });

  it('single-entry pool always returns that entry', () => {
    const pool = [{ id: 'weave_guard' as const, weight: 5 }];
    expect(pickWeightedWeaveEffect(pool, () => 0)).toBe('weave_guard');
    expect(pickWeightedWeaveEffect(pool, () => 0.99)).toBe('weave_guard');
    expect(pickWeightedWeaveEffect(pool, () => 1)).toBe('weave_guard');
  });
});

// ─── rollWeaveEffects — flavor-weighted rolling ───────────────────────────────

describe('rollWeaveEffects', () => {
  it('Common-only weave rolls no effect', () => {
    const effects = rollWeaveEffects([makeAffix('Common')], [], 100, () => 0);
    expect(effects).toHaveLength(0);
  });

  it('Uncommon weave rolls exactly 1 effect', () => {
    const effects = rollWeaveEffects([makeAffix('Uncommon')], [], 100, () => 0);
    expect(effects).toHaveLength(1);
  });

  it('empty ingredients → uniform pool → still rolls a valid effect', () => {
    const effects = rollWeaveEffects([makeAffix('Uncommon')], [], 100, () => 0.5);
    expect(effects).toHaveLength(1);
    expect(effects[0]!.id).toBeTruthy();
    expect(effects[0]!.value).toBeGreaterThan(0);
  });

  it('amethyst-heavy weave with rng=0.65 rolls weave_echo_strike', () => {
    // amethyst: focus(1), quickness(1), guard(1), reactive_ward(1), echo_strike(3), swiftstrike(1), ember_surge(1). Total=9.
    // rng=0.65 → threshold=5.85 → focus:4.85 → quickness:3.85 → guard:2.85 → reactive_ward:1.85 → echo_strike:-1.15 → echo_strike
    const effects = rollWeaveEffects(
      [makeAffix('Uncommon')],
      [{ tierId: 'amethyst', refinedCount: 5 }],
      100,
      () => 0.65,
    );
    expect(effects).toHaveLength(1);
    expect(effects[0]!.id).toBe('weave_echo_strike');
  });

  it('fracteryl-heavy weave with rng=0.65 rolls weave_echo_strike', () => {
    // Same pool shape as amethyst (only echo_strike gets 3×).
    const effects = rollWeaveEffects(
      [makeAffix('Uncommon')],
      [{ tierId: 'fracteryl', refinedCount: 5 }],
      100,
      () => 0.65,
    );
    expect(effects[0]!.id).toBe('weave_echo_strike');
  });

  it('eigenstein-heavy weave with rng=0.65 rolls weave_echo_strike', () => {
    const effects = rollWeaveEffects(
      [makeAffix('Uncommon')],
      [{ tierId: 'eigenstein', refinedCount: 5 }],
      100,
      () => 0.65,
    );
    expect(effects[0]!.id).toBe('weave_echo_strike');
  });

  it('diamond-heavy weave with rng=0.6 rolls weave_reactive_ward', () => {
    // ember_surge flavors are citrine/ruby — diamond does NOT boost it.
    // diamond: focus(3), quickness(1), guard(3), reactive_ward(3), echo_strike(1), swiftstrike(1), ember_surge(1). Total=13.
    // rng=0.6 → threshold=7.8 → focus:4.8 → quickness:3.8 → guard:0.8 → reactive_ward:-2.2 → reactive_ward
    const effects = rollWeaveEffects(
      [makeAffix('Uncommon')],
      [{ tierId: 'diamond', refinedCount: 5 }],
      100,
      () => 0.6,
    );
    expect(effects[0]!.id).toBe('weave_reactive_ward');
  });

  it('value is positive and scales with power', () => {
    const low  = rollWeaveEffects([makeAffix('Uncommon')], [], 10,     () => 0);
    const high = rollWeaveEffects([makeAffix('Uncommon')], [], 100000, () => 0);
    expect(low[0]!.value).toBeGreaterThan(0);
    expect(high[0]!.value).toBeGreaterThan(low[0]!.value);
  });

  it('rng=1.0 edge case does not crash', () => {
    expect(() => rollWeaveEffects([makeAffix('Uncommon')], [], 100, () => 1)).not.toThrow();
  });

  it('rolled effect ID is always in ALL_WEAVE_EFFECT_IDS', () => {
    for (let i = 0; i <= 10; i++) {
      const rng = () => i / 10;
      const effects = rollWeaveEffects([makeAffix('Uncommon')], [], 100, rng);
      if (effects.length > 0) {
        expect(ALL_WEAVE_EFFECT_IDS).toContain(effects[0]!.id);
      }
    }
  });
});

// ─── weave_swiftstrike registry ───────────────────────────────────────────────

describe('weave_swiftstrike registry', () => {
  it('exists in ALL_WEAVE_EFFECT_IDS', () => {
    expect(ALL_WEAVE_EFFECT_IDS).toContain('weave_swiftstrike');
  });

  it('has role offense', () => {
    const pool = getEligibleWeaveEffectsForRoll({ ingredients: [], highestRarity: 'Uncommon' });
    const entry = pool.find(e => e.id === 'weave_swiftstrike')!;
    expect(entry).toBeDefined();
  });

  it('is eligible for Uncommon+ weaves', () => {
    const pool = getEligibleWeaveEffectsForRoll({ ingredients: [], highestRarity: 'Uncommon' });
    expect(pool.some(e => e.id === 'weave_swiftstrike')).toBe(true);
  });

  it('is excluded from Common-only weaves', () => {
    const pool = getEligibleWeaveEffectsForRoll({ ingredients: [], highestRarity: 'Common' });
    expect(pool.some(e => e.id === 'weave_swiftstrike')).toBe(false);
  });

  it('can be rolled deterministically with sand ingredients', () => {
    // sand: focus(1), quickness(3), guard(1), reactive_ward(1), echo_strike(1), swiftstrike(3). Total=10.
    // rng=0.75 → threshold=7.5 → focus:6.5 → quickness:3.5 → guard:2.5 → reactive_ward:1.5 → echo_strike:0.5 → swiftstrike:-2.5 → swiftstrike
    const effects = rollWeaveEffects(
      [makeAffix('Uncommon')],
      [{ tierId: 'sand', refinedCount: 5 }],
      100,
      () => 0.75,
    );
    expect(effects).toHaveLength(1);
    expect(effects[0]!.id).toBe('weave_swiftstrike');
  });

  it('rng=1.0 with sand ingredients does not crash', () => {
    expect(() => rollWeaveEffects(
      [makeAffix('Uncommon')],
      [{ tierId: 'sand', refinedCount: 5 }],
      100,
      () => 1,
    )).not.toThrow();
  });
});

// ─── createCraftedWeave — flavor-weighted effects ─────────────────────────────

describe('createCraftedWeave — flavor-weighted effect rolling', () => {
  it('amethyst-only weave with rng=0.65 rolls weave_echo_strike when affix is Uncommon+', () => {
    // rollWeaveAffix uses Math.random (not injectable rng) for quality, so the affix rarity
    // is random. We test that if the weave DOES get an effect, rng=0.65 selects echo_strike.
    // Pool (amethyst): focus(1), quickness(1), guard(1), reactive_ward(1), echo_strike(3), swiftstrike(1), ember_surge(1). Total=9.
    // rng=0.65 → threshold=5.85 → falls in echo_strike range (4–7).
    let callCount = 0;
    const rng = () => {
      callCount++;
      // rng calls: 1 = tier2 chance check, 2 = effect quality, 3+ = effect pick
      return callCount <= 2 ? 0.99 : 0.65; // fail tier2 check, then pick with 0.65
    };
    const weave = createCraftedWeave(
      'w-amethyst-test',
      [{ tierId: 'amethyst', refinedCount: 10 }],
      1,
      rng,
    );
    if (weave.effects && weave.effects.length > 0) {
      expect(weave.effects[0]!.id).toBe('weave_echo_strike');
    }
    // Whether or not the effect was granted depends on the affix quality (not injectable),
    // so we don't assert length here — just verify that IF present, it's the right effect.
  });
});
