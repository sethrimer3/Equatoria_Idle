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
 *   - Passive effects: rolling, equip aggregation, invalid id safety, save round-trip
 */

import { describe, it, expect } from 'vitest';
import {
  triangularFromU,
  getWeaveRarity,
  computeWeavePowerScale,
  getForgeEffectUnlockChances,
  rollWeaveTierEffects,
  createCraftedWeave,
  rollWeaveAffix,
  rollWeavePassiveEffects,
} from '../weave-rolling';
import { getLensEffectUnlockChances } from '../lens-definitions';
import { getUnlockedWeaveSlotCount } from '../../../sim/forge/forge-state';
import { aggregateEquippedWeaveEffects } from '../weave-effects';
import { getEquippedWeaveModifiers } from '../equipment-modifiers';
import { createRpgSimState } from '../../../sim/rpg/rpg-state';
import { createGameState } from '../../../sim/game-state';
import { craftWeave } from '../../../sim/game-state';
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
      tierEffects: [],
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

// ─── Shared forge chance table ────────────────────────────────────

describe('getForgeEffectUnlockChances — shared table used by weaves and lenses', () => {
  it('forge level 1: tier2=0.08, tier3=0.00', () => {
    expect(getForgeEffectUnlockChances(1)).toEqual({ tier2Chance: 0.08, tier3Chance: 0.00 });
  });
  it('forge level 3: tier2=0.24, tier3=0.03', () => {
    expect(getForgeEffectUnlockChances(3)).toEqual({ tier2Chance: 0.24, tier3Chance: 0.03 });
  });
  it('forge level 5: tier2=0.48, tier3=0.12', () => {
    expect(getForgeEffectUnlockChances(5)).toEqual({ tier2Chance: 0.48, tier3Chance: 0.12 });
  });
  it('returns level-5 values for out-of-range levels', () => {
    expect(getForgeEffectUnlockChances(99)).toEqual(getForgeEffectUnlockChances(5));
  });
  it('lens getLensEffectUnlockChances delegates to same table', () => {
    expect(getLensEffectUnlockChances(1)).toEqual(getForgeEffectUnlockChances(1));
    expect(getLensEffectUnlockChances(5)).toEqual(getForgeEffectUnlockChances(5));
  });
});

// ─── rollWeaveTierEffects — T1 always present ─────────────────────

describe('rollWeaveTierEffects — T1 always generated', () => {
  const neverT2Rng = () => 1; // rng returning 1 never triggers T2/T3 (1 < chance is false)

  it('single tier → exactly 1 T1 effect with never-trigger rng', () => {
    const effects = rollWeaveTierEffects([{ tierId: 'ruby', refinedCount: 5 }], 1, neverT2Rng);
    const t1s = effects.filter(e => e.effectTier === 1);
    expect(t1s).toHaveLength(1);
    expect(t1s[0]!.tierId).toBe('ruby');
    expect(t1s[0]!.effectTier).toBe(1);
  });

  it('two tiers → two T1 effects', () => {
    const effects = rollWeaveTierEffects(
      [{ tierId: 'sand', refinedCount: 3 }, { tierId: 'quartz', refinedCount: 2 }],
      3,
      neverT2Rng,
    );
    expect(effects.filter(e => e.effectTier === 1)).toHaveLength(2);
  });

  it('sunstone produces no tier effects (no naming entry)', () => {
    const effects = rollWeaveTierEffects([{ tierId: 'sunstone', refinedCount: 5 }], 1, neverT2Rng);
    expect(effects).toHaveLength(0);
  });
});

// ─── rollWeaveTierEffects — T2 probabilistic ─────────────────────

describe('rollWeaveTierEffects — T2 probabilistic', () => {
  it('T2 rolls when rng returns below tier2Chance', () => {
    // forge level 1, tier2Chance=0.08
    // Call order per tier: quality(T1), chance(T2); return 0.07 on chance call (even index)
    let callCount = 0;
    const rng = () => {
      callCount++;
      return callCount % 2 === 0 ? 0.07 : 0.5;
    };
    const effects = rollWeaveTierEffects([{ tierId: 'ruby', refinedCount: 5 }], 1, rng);
    const t2s = effects.filter(e => e.effectTier === 2);
    expect(t2s).toHaveLength(1);
    expect(t2s[0]!.tierId).toBe('ruby');
  });

  it('T2 does not roll when rng returns at or above tier2Chance', () => {
    // 0.5 ≥ 0.08 → no T2
    const effects = rollWeaveTierEffects([{ tierId: 'ruby', refinedCount: 5 }], 1, () => 0.5);
    expect(effects.filter(e => e.effectTier === 2)).toHaveLength(0);
  });
});

// ─── rollWeaveTierEffects — T3 strict ordering ────────────────────

describe('rollWeaveTierEffects — T3 only when T2 rolled (strict ordering)', () => {
  it('no T3 at forge level 1 (tier3Chance=0)', () => {
    const effects = rollWeaveTierEffects([{ tierId: 'ruby', refinedCount: 5 }], 1, () => 0);
    expect(effects.filter(e => e.effectTier === 3)).toHaveLength(0);
  });

  it('T3 rolls at forge level 5 when T2 also rolls', () => {
    // Call order: quality(T1), chance(T2), quality(T2), chance(T3), quality(T3)
    const values = [0.5, 0.05, 0.5, 0.05, 0.5]; // indices 1 and 3 are below tier2/tier3 chance
    let i = 0;
    const rng = () => values[i++] ?? 0.5;
    const effects = rollWeaveTierEffects([{ tierId: 'sapphire', refinedCount: 5 }], 5, rng);
    expect(effects.filter(e => e.effectTier === 2)).toHaveLength(1);
    expect(effects.filter(e => e.effectTier === 3)).toHaveLength(1);
  });

  it('T3 does not roll if T2 was not rolled (strict ordering)', () => {
    // T2 chance call returns 0.5 (≥ 0.48, so T2 skipped); T3 should not even be attempted
    // forge level 5: tier2Chance=0.48, tier3Chance=0.12
    // rng: quality for T1 then chance for T2 (0.5 → T2 skipped, T3 skipped entirely)
    let callCount = 0;
    const rng = () => {
      callCount++;
      return callCount === 2 ? 0.5 : 0.5; // even if T3 somehow got a call, return 0.5
    };
    const effects = rollWeaveTierEffects([{ tierId: 'sapphire', refinedCount: 5 }], 5, rng);
    expect(effects.filter(e => e.effectTier === 3)).toHaveLength(0);
  });
});

// ─── rollWeaveTierEffects — effect properties ─────────────────────

describe('rollWeaveTierEffects — effect properties', () => {
  it('all rolled effects have isApplied: false (stubs)', () => {
    const effects = rollWeaveTierEffects([{ tierId: 'sand', refinedCount: 5 }], 5, () => 0);
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) {
      expect(e.isApplied).toBe(false);
    }
  });

  it('T1 name contains "(STUB)"', () => {
    const effects = rollWeaveTierEffects([{ tierId: 'sand', refinedCount: 5 }], 1, () => 1);
    const t1 = effects.find(e => e.effectTier === 1);
    expect(t1?.name).toContain('STUB');
  });

  it('descriptions start with "STUB:"', () => {
    const effects = rollWeaveTierEffects([{ tierId: 'ruby', refinedCount: 5 }], 5, () => 0);
    for (const e of effects) {
      expect(e.description).toMatch(/^STUB:/);
    }
  });

  it('keys use "wt" prefix to distinguish from lens keys', () => {
    const effects = rollWeaveTierEffects([{ tierId: 'sand', refinedCount: 5 }], 1, () => 1);
    const t1 = effects.find(e => e.effectTier === 1);
    expect(t1?.key).toBe('sand_wt1');
  });

  it('magnitude is positive', () => {
    const effects = rollWeaveTierEffects([{ tierId: 'citrine', refinedCount: 5 }], 1, () => 1);
    for (const e of effects) {
      expect(e.magnitude).toBeGreaterThan(0);
    }
  });

  it('higher forge level increases tier2/tier3 odds (sanity check via shared table)', () => {
    const low = getForgeEffectUnlockChances(1);
    const high = getForgeEffectUnlockChances(5);
    expect(high.tier2Chance).toBeGreaterThan(low.tier2Chance);
    expect(high.tier3Chance).toBeGreaterThan(low.tier3Chance);
  });
});

// ─── createCraftedWeave — includes tierEffects ────────────────────

describe('createCraftedWeave — tierEffects attached', () => {
  it('weave always has a tierEffects array', () => {
    const weave = createCraftedWeave('w1', [{ tierId: 'citrine', refinedCount: 5 }], 1);
    expect(Array.isArray(weave.tierEffects)).toBe(true);
  });

  it('at least one T1 tier effect per distinct mote type', () => {
    const weave = createCraftedWeave('w2', [{ tierId: 'ruby', refinedCount: 5 }], 1, () => 1);
    const t1s = weave.tierEffects.filter(e => e.effectTier === 1);
    expect(t1s).toHaveLength(1);
    expect(t1s[0]!.tierId).toBe('ruby');
  });

  it('two distinct tiers → two T1 tier effects', () => {
    const weave = createCraftedWeave(
      'w3',
      [{ tierId: 'sand', refinedCount: 3 }, { tierId: 'quartz', refinedCount: 2 }],
      1,
      () => 1,
    );
    expect(weave.tierEffects.filter(e => e.effectTier === 1)).toHaveLength(2);
  });

  it('forge level 5 with always-trigger rng yields T1+T2+T3', () => {
    const weave = createCraftedWeave('w4', [{ tierId: 'emerald', refinedCount: 5 }], 5, () => 0);
    const t1s = weave.tierEffects.filter(e => e.effectTier === 1);
    const t2s = weave.tierEffects.filter(e => e.effectTier === 2);
    const t3s = weave.tierEffects.filter(e => e.effectTier === 3);
    expect(t1s).toHaveLength(1);
    expect(t2s).toHaveLength(1);
    expect(t3s).toHaveLength(1);
  });
});

// ─── Save/load — tierEffects persist and back-compat ─────────────

describe('save/load — weave tierEffects', () => {
  it('crafted weave tierEffects survive a serialize/deserialize round-trip', () => {
    const state = createGameState();
    craftWeave(state, [{ tierId: 'diamond', refinedCount: 5 }], true);
    const saved = serializeGameState(state);
    const restored = deserializeGameState(saved);
    const weave = restored.rpg.craftedWeaves[0];
    expect(weave).toBeDefined();
    expect(Array.isArray(weave!.tierEffects)).toBe(true);
    expect(weave!.tierEffects.length).toBeGreaterThan(0);
    // All restored tier effects must have isApplied: false
    for (const e of weave!.tierEffects) {
      expect(e.isApplied).toBe(false);
    }
  });

  it('old weave save without tierEffects deserializes safely with empty array', () => {
    const state = createGameState();
    craftWeave(state, [{ tierId: 'sand', refinedCount: 3 }], true);
    const saved = serializeGameState(state);
    // Strip tierEffects from saved weaves to simulate a pre-v33 save
    if (saved.rpg?.craftedWeaves) {
      for (const w of saved.rpg.craftedWeaves) {
        delete (w as Record<string, unknown>)['tierEffects'];
      }
    }
    const restored = deserializeGameState(saved);
    const weave = restored.rpg.craftedWeaves[0];
    expect(weave).toBeDefined();
    expect(weave!.tierEffects).toEqual([]);
  });
});

// ─── rollWeavePassiveEffects ──────────────────────────────────────

describe('rollWeavePassiveEffects', () => {
  function makeAffix(rarity: string): CraftedWeaveData['affixes'][number] {
    return {
      affixId: 'citrine_all_loom',
      tierId: 'citrine',
      label: 'Test',
      quality: rarity === 'Uncommon' ? 0.5 : rarity === 'Common' ? 0.1 : 0.8,
      rarity: rarity as CraftedWeaveData['affixes'][number]['rarity'],
      value: 10,
      unit: '%',
      applied: true,
    };
  }

  it('Common-only weave → no effect', () => {
    const effects = rollWeavePassiveEffects([makeAffix('Common')], 100);
    expect(effects).toHaveLength(0);
  });

  it('Uncommon affix → exactly 1 effect', () => {
    const effects = rollWeavePassiveEffects([makeAffix('Uncommon')], 100, () => 0);
    expect(effects).toHaveLength(1);
    expect(effects[0]!.id).toBeTruthy();
    expect(effects[0]!.value).toBeGreaterThan(0);
  });

  it('Rare affix → exactly 1 effect', () => {
    const effects = rollWeavePassiveEffects([makeAffix('Rare')], 100, () => 0);
    expect(effects).toHaveLength(1);
  });

  it('higher rarity produces larger value than Uncommon', () => {
    const uncommon = rollWeavePassiveEffects([makeAffix('Uncommon')], 100, () => 0);
    const legendary = rollWeavePassiveEffects([makeAffix('Legendary')], 100, () => 0);
    expect(legendary[0]!.value).toBeGreaterThan(uncommon[0]!.value);
  });

  it('empty affix list → no effect', () => {
    const effects = rollWeavePassiveEffects([], 100);
    expect(effects).toHaveLength(0);
  });
});

// ─── Passive effects — equip/unequip aggregation ─────────────────

describe('passive effects — getEquippedWeaveModifiers', () => {
  function weaveWithEffect(id: string, effectId: string, value: number): CraftedWeaveData {
    return {
      id,
      name: 'Test',
      ingredients: [],
      totalWeightedMoteValue: 100,
      forgeCraftLevel: 1,
      affixes: [],
      tierEffects: [],
      refinementLevel: 0,
      effects: [{ id: effectId, value }],
    };
  }

  it('weave_focus equipped → weaponDamagePct increases', () => {
    const weave = weaveWithEffect('w1', 'weave_focus', 4.0);
    const mods = getEquippedWeaveModifiers(['w1'], [weave]);
    expect(mods.weaponDamagePct).toBeCloseTo(4.0, 5);
  });

  it('weave_quickness equipped → cooldownPct increases', () => {
    const weave = weaveWithEffect('w1', 'weave_quickness', 2.5);
    const mods = getEquippedWeaveModifiers(['w1'], [weave]);
    expect(mods.cooldownPct).toBeCloseTo(2.5, 5);
  });

  it('weave_guard equipped → playerDefensePct increases', () => {
    const weave = weaveWithEffect('w1', 'weave_guard', 3.0);
    const mods = getEquippedWeaveModifiers(['w1'], [weave]);
    expect(mods.playerDefensePct).toBeCloseTo(3.0, 5);
  });

  it('unequipped weave does not affect modifiers', () => {
    const weave = weaveWithEffect('w1', 'weave_focus', 10.0);
    // Weave exists in inventory but slot is null
    const mods = getEquippedWeaveModifiers([null], [weave]);
    expect(mods.weaponDamagePct).toBe(0);
  });

  it('unknown/invalid effect id is ignored safely', () => {
    const weave = weaveWithEffect('w1', 'totally_invalid_effect_xyz', 99.0);
    const mods = getEquippedWeaveModifiers(['w1'], [weave]);
    expect(mods.weaponDamagePct).toBe(0);
    expect(mods.cooldownPct).toBe(0);
    expect(mods.playerDefensePct).toBe(0);
  });

  it('multiple equipped weaves with same effect stack additively', () => {
    const w1 = weaveWithEffect('w1', 'weave_focus', 3.0);
    const w2 = weaveWithEffect('w2', 'weave_focus', 2.0);
    const mods = getEquippedWeaveModifiers(['w1', 'w2'], [w1, w2]);
    expect(mods.weaponDamagePct).toBeCloseTo(5.0, 5);
  });
});

// ─── Passive effects — save/load round-trip ───────────────────────

describe('passive effects — save/load round-trip', () => {
  it('crafted weave effects survive serialize/deserialize', () => {
    const state = createGameState();
    // Use ruby tier to get Uncommon+ affixes and thus trigger an effect roll
    craftWeave(state, [{ tierId: 'ruby', refinedCount: 50 }], true);
    const weave = state.rpg.craftedWeaves[0]!;
    // Manually set a known effect to test persistence regardless of rng outcome
    weave.effects = [{ id: 'weave_focus', value: 3.7 }];

    const saved = serializeGameState(state);
    const restored = deserializeGameState(saved);
    const restoredWeave = restored.rpg.craftedWeaves[0];
    expect(restoredWeave).toBeDefined();
    expect(restoredWeave!.effects).toHaveLength(1);
    expect(restoredWeave!.effects![0]!.id).toBe('weave_focus');
    expect(restoredWeave!.effects![0]!.value).toBeCloseTo(3.7, 5);
  });

  it('old weave save without effects field deserializes with empty effects', () => {
    const state = createGameState();
    craftWeave(state, [{ tierId: 'sand', refinedCount: 3 }], true);
    const saved = serializeGameState(state);
    if (saved.rpg?.craftedWeaves) {
      for (const w of saved.rpg.craftedWeaves) {
        delete (w as Record<string, unknown>)['effects'];
      }
    }
    const restored = deserializeGameState(saved);
    const restoredWeave = restored.rpg.craftedWeaves[0];
    expect(restoredWeave).toBeDefined();
    expect(restoredWeave!.effects ?? []).toEqual([]);
  });
});
