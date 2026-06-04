/**
 * weave-rolling.test.ts — Unit tests for the Weave crafting system.
 *
 * Covers:
 *   - triangularRandom distribution properties
 *   - getWeaveRarity classification
 *   - computeWeavePowerScale scaling
 *   - One affix per distinct ingredient tier
 *   - Slot unlock count by forge level
 *   - Aggregation caps
 *   - Save/load defaults do not crash on old saves
 */

import { describe, it, expect } from 'vitest';
import {
  triangularFromU,
  getWeaveRarity,
  computeWeavePowerScale,
  createCraftedWeave,
  rollWeaveAffix,
} from '../weave-rolling';
import { getUnlockedWeaveSlotCount } from '../../../sim/forge/forge-state';
import { aggregateEquippedWeaveEffects } from '../weave-effects';
import { createRpgSimState } from '../../../sim/rpg/rpg-state';
import { createGameState } from '../../../sim/game-state';
import { deserializeGameState } from '../../../settings/save-deserialize';
import { serializeGameState } from '../../../settings/save-serialize';
import type { CraftedWeaveData } from '../weave-types';

// ─── triangularFromU ─────────────────────────────────────────────

describe('triangularFromU', () => {
  it('u=0 returns lo', () => {
    expect(triangularFromU(0, 1, 0.6, 0)).toBeCloseTo(0, 5);
  });

  it('u=1 returns hi', () => {
    expect(triangularFromU(0, 1, 0.6, 1)).toBeCloseTo(1, 5);
  });

  it('u=mode_fraction returns approximately the mode', () => {
    const lo = 0, hi = 1, mode = 0.6;
    const c = (mode - lo) / (hi - lo); // = 0.6
    const result = triangularFromU(lo, hi, mode, c);
    expect(result).toBeCloseTo(mode, 3);
  });

  it('output is bounded by [lo, hi]', () => {
    for (let u = 0; u <= 1; u += 0.05) {
      const v = triangularFromU(0, 1, 0.6, u);
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(1);
    }
  });

  it('is monotonically increasing in u', () => {
    const us = [0.1, 0.3, 0.5, 0.7, 0.9];
    const vals = us.map(u => triangularFromU(0, 1, 0.6, u));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1]!);
    }
  });

  it('mode=0.6 produces values above 0.5 for u near 0.5', () => {
    // The mode being biased above 0.5 means the median is > 0.5
    const v = triangularFromU(0, 1, 0.6, 0.5);
    expect(v).toBeGreaterThan(0.5);
  });
});

// ─── getWeaveRarity ──────────────────────────────────────────────

describe('getWeaveRarity', () => {
  it('q=0.00 → Common',    () => expect(getWeaveRarity(0.00)).toBe('Common'));
  it('q=0.39 → Common',    () => expect(getWeaveRarity(0.39)).toBe('Common'));
  it('q=0.40 → Uncommon',  () => expect(getWeaveRarity(0.40)).toBe('Uncommon'));
  it('q=0.64 → Uncommon',  () => expect(getWeaveRarity(0.64)).toBe('Uncommon'));
  it('q=0.65 → Rare',      () => expect(getWeaveRarity(0.65)).toBe('Rare'));
  it('q=0.81 → Rare',      () => expect(getWeaveRarity(0.81)).toBe('Rare'));
  it('q=0.82 → Epic',      () => expect(getWeaveRarity(0.82)).toBe('Epic'));
  it('q=0.93 → Epic',      () => expect(getWeaveRarity(0.93)).toBe('Epic'));
  it('q=0.94 → Legendary', () => expect(getWeaveRarity(0.94)).toBe('Legendary'));
  it('q=0.98 → Legendary', () => expect(getWeaveRarity(0.98)).toBe('Legendary'));
  it('q=0.99 → Mythic',    () => expect(getWeaveRarity(0.99)).toBe('Mythic'));
  it('q=1.00 → Mythic',    () => expect(getWeaveRarity(1.00)).toBe('Mythic'));
});

// ─── computeWeavePowerScale ───────────────────────────────────────

describe('computeWeavePowerScale', () => {
  it('total=0 → scale=1.0', () => {
    expect(computeWeavePowerScale(0)).toBeCloseTo(1.0, 5);
  });

  it('scale increases with total weighted value', () => {
    const a = computeWeavePowerScale(100);
    const b = computeWeavePowerScale(10000);
    const c = computeWeavePowerScale(1e6);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });

  it('scale at total=1000 is approximately 2.0', () => {
    // sqrt(1 + log10(1001)) ≈ sqrt(1 + 3.0004) ≈ 2.0
    const s = computeWeavePowerScale(1000);
    expect(s).toBeCloseTo(2.0, 1);
  });

  it('does not grow faster than sqrt(log)', () => {
    const s1 = computeWeavePowerScale(1e6);
    const s2 = computeWeavePowerScale(1e12);
    // doubling total in log space adds much less than doubling scale
    expect(s2 / s1).toBeLessThan(1.5);
  });
});

// ─── One affix per distinct tier ─────────────────────────────────

describe('createCraftedWeave — one affix per distinct ingredient tier', () => {
  it('single tier → one affix', () => {
    const weave = createCraftedWeave('weave_test_1', [{ tierId: 'citrine', refinedCount: 5 }], 1);
    expect(weave.affixes).toHaveLength(1);
    expect(weave.affixes[0]!.tierId).toBe('citrine');
  });

  it('two tiers → two affixes', () => {
    const weave = createCraftedWeave('weave_test_2', [
      { tierId: 'sand', refinedCount: 10 },
      { tierId: 'quartz', refinedCount: 1 },
    ], 1);
    expect(weave.affixes).toHaveLength(2);
    const tierIds = weave.affixes.map(a => a.tierId);
    expect(tierIds).toContain('sand');
    expect(tierIds).toContain('quartz');
  });

  it('three tiers → three affixes', () => {
    const weave = createCraftedWeave('weave_test_3', [
      { tierId: 'ruby', refinedCount: 1 },
      { tierId: 'sapphire', refinedCount: 1 },
      { tierId: 'diamond', refinedCount: 1 },
    ], 1);
    expect(weave.affixes).toHaveLength(3);
  });

  it('sunstone (no family) contributes to power but not affixes', () => {
    const weave = createCraftedWeave('weave_test_sunstone', [
      { tierId: 'sunstone', refinedCount: 5 },
      { tierId: 'citrine', refinedCount: 2 },
    ], 1);
    // Only citrine has a defined family; sunstone should be skipped
    expect(weave.affixes).toHaveLength(1);
    expect(weave.affixes[0]!.tierId).toBe('citrine');
    expect(weave.totalWeightedMoteValue).toBeGreaterThan(0);
  });

  it('duplicate tier entries are merged before rolling', () => {
    const weave = createCraftedWeave('weave_test_dup', [
      { tierId: 'sand', refinedCount: 5 },
      { tierId: 'sand', refinedCount: 3 },
    ], 1);
    // Both sand entries → merged → one sand affix
    expect(weave.affixes).toHaveLength(1);
  });
});

// ─── Affix quality and rarity ─────────────────────────────────────

describe('rollWeaveAffix', () => {
  it('returns an affix with quality in [0,1] for known tier', () => {
    const affix = rollWeaveAffix('citrine', 1000);
    expect(affix).not.toBeNull();
    expect(affix!.quality).toBeGreaterThanOrEqual(0);
    expect(affix!.quality).toBeLessThanOrEqual(1);
  });

  it('returns null for sunstone (no defined family)', () => {
    const affix = rollWeaveAffix('sunstone', 1000);
    expect(affix).toBeNull();
  });

  it('rarity matches quality', () => {
    const affix = rollWeaveAffix('ruby', 500);
    expect(affix).not.toBeNull();
    expect(affix!.rarity).toBe(getWeaveRarity(affix!.quality));
  });

  it('value is positive', () => {
    const affix = rollWeaveAffix('emerald', 200);
    expect(affix).not.toBeNull();
    expect(affix!.value).toBeGreaterThan(0);
  });
});

// ─── Slot unlock count by forge level ────────────────────────────

describe('getUnlockedWeaveSlotCount', () => {
  it('forgeLevel=1 → 2 unlocked', () => expect(getUnlockedWeaveSlotCount(1)).toBe(2));
  it('forgeLevel=2 → 3 unlocked', () => expect(getUnlockedWeaveSlotCount(2)).toBe(3));
  it('forgeLevel=3 → 4 unlocked', () => expect(getUnlockedWeaveSlotCount(3)).toBe(4));
  it('forgeLevel=4 → 5 unlocked', () => expect(getUnlockedWeaveSlotCount(4)).toBe(5));
  it('forgeLevel=5 → 6 unlocked', () => expect(getUnlockedWeaveSlotCount(5)).toBe(6));
  it('forgeLevel=0 → clamped to 2', () => expect(getUnlockedWeaveSlotCount(0)).toBe(2));
  it('forgeLevel=10 → capped at 6', () => expect(getUnlockedWeaveSlotCount(10)).toBe(6));
});

// ─── Aggregation caps ─────────────────────────────────────────────

describe('aggregateEquippedWeaveEffects — caps', () => {
  function makeWeaveWithAffix(id: string, affixId: string, value: number): CraftedWeaveData {
    return {
      id,
      name: 'Test Weave',
      ingredients: [],
      totalWeightedMoteValue: 1000,
      forgeCraftLevel: 1,
      affixes: [{
        affixId: affixId as import('../weave-types').WeaveAffixId,
        tierId: 'diamond',
        label: 'Test',
        quality: 0.9,
        rarity: 'Epic',
        value,
        unit: '%',
        applied: true,
      }],
    };
  }

  it('upgrade cost reduction capped at 50%', () => {
    const weaves = Array(6).fill(null).map((_, i) =>
      makeWeaveWithAffix(`w${i}`, 'diamond_upgrade_cost', 15),
    );
    const effects = aggregateEquippedWeaveEffects(weaves);
    expect(effects.upgradeCostReductionFrac).toBeLessThanOrEqual(0.5);
  });

  it('achievement reduction capped at 35%', () => {
    const weaves = Array(6).fill(null).map((_, i) =>
      makeWeaveWithAffix(`w${i}`, 'nullstone_achievement_reduce', 10),
    );
    const effects = aggregateEquippedWeaveEffects(weaves);
    expect(effects.achievementReductionFrac).toBeLessThanOrEqual(0.35);
  });

  it('crafting rarity bonus capped at 30%', () => {
    const weaves = Array(6).fill(null).map((_, i) =>
      makeWeaveWithAffix(`w${i}`, 'sapphire_rare_affix_chance', 10),
    );
    const effects = aggregateEquippedWeaveEffects(weaves);
    expect(effects.craftingRarityBonusFrac).toBeLessThanOrEqual(0.3);
  });

  it('null slots are ignored', () => {
    const effects = aggregateEquippedWeaveEffects([null, null, null, null, null, null]);
    expect(effects.loomOutputBonus).toBe(0);
    expect(effects.upgradeCostReductionFrac).toBe(0);
  });

  it('citrine_all_loom bonus is accumulated correctly', () => {
    const weaves = [
      makeWeaveWithAffix('w1', 'citrine_all_loom', 15),
      makeWeaveWithAffix('w2', 'citrine_all_loom', 10),
    ];
    const effects = aggregateEquippedWeaveEffects([weaves[0], weaves[1], null, null, null, null]);
    expect(effects.loomOutputBonus).toBeCloseTo(0.25, 5); // (15 + 10) / 100
  });
});

// ─── Save/load migration safety ───────────────────────────────────

describe('save/load defaults for old saves', () => {
  it('rpgState defaults produce empty weave inventory', () => {
    const state = createRpgSimState();
    expect(state.craftedWeaves).toEqual([]);
    expect(state.equippedWeaveSlots).toHaveLength(6);
    expect(state.equippedWeaveSlots.every(s => s === null)).toBe(true);
  });

  it('deserializing an old save (no weave fields) does not crash', () => {
    const base = createGameState();
    // Simulate an old save with no weave fields
    const save = serializeGameState(base);
    // Strip the v31+ fields to mimic an older save format
    delete (save.rpg as Record<string, unknown>)['craftedWeaves'];
    delete (save.rpg as Record<string, unknown>)['equippedWeaveSlots'];
    const restored = deserializeGameState(save);
    expect(restored.rpg.craftedWeaves).toEqual([]);
    expect(restored.rpg.equippedWeaveSlots).toHaveLength(6);
  });
});
