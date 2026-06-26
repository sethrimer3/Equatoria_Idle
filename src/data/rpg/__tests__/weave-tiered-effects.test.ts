/**
 * weave-tiered-effects.test.ts — Tests for the tiered weave-effect system.
 *
 * Covers:
 *   - weave-math-helpers: resolveOverflowChance, cappedChance, resolveCritLayers, resolveBoundedChain
 *   - weave-rolling: computeNamedEffectMagnitude, rollWeaveNamedEffectTiers, BASELINE_CRAFT_COST
 *   - equipment-modifiers: named tier passive stat contributions
 *   - weave-proc-effects: named tier proc triggers (damage, hit-enemy)
 *   - save round-trip: namedEffectTiers and effectMultiplier
 */

import { describe, it, expect } from 'vitest';
import {
  resolveOverflowChance,
  cappedChance,
  resolveCritLayers,
  resolveBoundedChain,
} from '../weave-math-helpers';
import {
  BASELINE_CRAFT_COST,
  computeNamedEffectMagnitude,
  rollWeaveNamedEffectTiers,
} from '../weave-rolling';
import { getEquippedWeaveModifiers } from '../equipment-modifiers';
import { createRpgSimState } from '../../../sim/rpg/rpg-state';
import {
  processNamedEffectPlayerDamagedProcs,
  processNamedEffectPlayerHitEnemyProcs,
  processNamedEffectPlayerLethalDamageProcs,
  getTotalNamedEffectMagnitude,
  getEmberDurationMult,
  getEmberPotencyMult,
  getEmberOverloadChancePct,
  QUICKENED_STITCH_MAX_STACKS,
  ECHO_NEARBY_RADIUS,
  ECHO_MAX_CHAIN_DEPTH,
} from '../weave-proc-effects';
import type { CraftedWeaveData, WeaveNamedEffectTier } from '../weave-types';
import { createGameState } from '../../../sim/game-state';
import { deserializeGameState } from '../../../settings/save-deserialize';
import { serializeGameState } from '../../../settings/save-serialize';

// ─── Shared helpers ────────────────────────────────────────────────────────────

const alwaysTrue = () => 0; // rng() = 0 → 0*100 = 0 < any positive pct → always passes
const alwaysFalse = () => 0.9999; // rng() ≈ 1 → almost never passes threshold

function makeWeaveWithNamedTiers(
  tiers: WeaveNamedEffectTier[],
  effectMultiplier = 1.0,
): CraftedWeaveData {
  return {
    id: 'w-test',
    name: 'Test Weave',
    ingredients: [],
    affixes: [],
    totalWeightedMoteValue: effectMultiplier * BASELINE_CRAFT_COST,
    forgeCraftLevel: 5,
    tierEffects: [],
    refinementLevel: 0,
    effects: [],
    namedEffectTiers: tiers,
    effectMultiplier,
  };
}

function makeStateWithWeave(weave: CraftedWeaveData) {
  const state = createRpgSimState();
  state.craftedWeaves = [weave];
  state.equippedWeaveSlots = [weave.id, null, null, null, null, null];
  return state;
}

// ─── resolveOverflowChance ────────────────────────────────────────────────────

describe('resolveOverflowChance', () => {
  it('0% → layers=0, partialChance=0', () => {
    expect(resolveOverflowChance(0)).toEqual({ layers: 0, partialChance: 0 });
  });

  it('50% → layers=0, partialChance=50', () => {
    expect(resolveOverflowChance(50)).toEqual({ layers: 0, partialChance: 50 });
  });

  it('100% → layers=1, partialChance=0', () => {
    expect(resolveOverflowChance(100)).toEqual({ layers: 1, partialChance: 0 });
  });

  it('150% → layers=1, partialChance=50', () => {
    expect(resolveOverflowChance(150)).toEqual({ layers: 1, partialChance: 50 });
  });

  it('200% → layers=2, partialChance=0', () => {
    expect(resolveOverflowChance(200)).toEqual({ layers: 2, partialChance: 0 });
  });

  it('350% → layers=3, partialChance=50', () => {
    expect(resolveOverflowChance(350)).toEqual({ layers: 3, partialChance: 50 });
  });

  it('negative values clamp to 0', () => {
    expect(resolveOverflowChance(-10)).toEqual({ layers: 0, partialChance: 0 });
  });
});

// ─── cappedChance ─────────────────────────────────────────────────────────────

describe('cappedChance', () => {
  it('x=0 → 0 for any maxPct', () => {
    expect(cappedChance(0, 75)).toBe(0);
    expect(cappedChance(0, 100, 2)).toBe(0);
  });

  it('is monotonically increasing in x', () => {
    const vals = [0.5, 1, 2, 5, 10, 100].map(x => cappedChance(x, 75));
    for (let i = 1; i < vals.length; i++) {
      expect(vals[i]).toBeGreaterThan(vals[i - 1]!);
    }
  });

  it('never reaches maxPct', () => {
    for (const x of [10, 100, 1000, 1e6]) {
      expect(cappedChance(x, 75)).toBeLessThan(75);
      expect(cappedChance(x, 100)).toBeLessThan(100);
    }
  });

  it('k=1, x=1, maxPct=75 → 37.5', () => {
    expect(cappedChance(1, 75, 1)).toBeCloseTo(37.5, 5);
  });

  it('larger k converges faster', () => {
    const slowApproach = cappedChance(1, 100, 0.5);
    const fastApproach = cappedChance(1, 100, 2.0);
    expect(fastApproach).toBeGreaterThan(slowApproach);
  });
});

// ─── resolveCritLayers ────────────────────────────────────────────────────────

describe('resolveCritLayers', () => {
  it('0% always returns 0', () => {
    expect(resolveCritLayers(0, alwaysTrue)).toBe(0);
    expect(resolveCritLayers(0, alwaysFalse)).toBe(0);
  });

  it('100% always returns 1 (guaranteed, no rng needed)', () => {
    expect(resolveCritLayers(100, alwaysFalse)).toBe(1);
  });

  it('150% with always-fail partial → 1', () => {
    expect(resolveCritLayers(150, alwaysFalse)).toBe(1);
  });

  it('150% with always-pass partial → 2', () => {
    expect(resolveCritLayers(150, alwaysTrue)).toBe(2);
  });

  it('200% → always 2 regardless of rng', () => {
    expect(resolveCritLayers(200, alwaysTrue)).toBe(2);
    expect(resolveCritLayers(200, alwaysFalse)).toBe(2);
  });

  it('50% with always-pass → 1', () => {
    expect(resolveCritLayers(50, alwaysTrue)).toBe(1);
  });

  it('50% with always-fail → 0', () => {
    expect(resolveCritLayers(50, alwaysFalse)).toBe(0);
  });

  it('very large values return proportional guaranteed layers', () => {
    // 1000% = 10 layers guaranteed, 0 partial
    expect(resolveCritLayers(1000, alwaysFalse)).toBe(10);
    expect(resolveCritLayers(1000, alwaysTrue)).toBe(10);
  });

  it('negative values always return 0', () => {
    expect(resolveCritLayers(-10, alwaysTrue)).toBe(0);
  });
});

// ─── resolveBoundedChain ──────────────────────────────────────────────────────

describe('resolveBoundedChain', () => {
  it('0% always returns 0', () => {
    expect(resolveBoundedChain(0, 3, alwaysTrue)).toBe(0);
  });

  it('100% returns maxDepth', () => {
    expect(resolveBoundedChain(100, 3, alwaysTrue)).toBe(3);
    expect(resolveBoundedChain(100, 0, alwaysTrue)).toBe(0);
  });

  it('chain breaks on first failure', () => {
    let callCount = 0;
    const failOn2nd = () => { callCount++; return callCount === 1 ? 0 : 0.999; };
    const result = resolveBoundedChain(50, 3, failOn2nd);
    expect(result).toBe(1); // first link passes, second fails → chain broken
  });

  it('maxDepth=0 always returns 0', () => {
    expect(resolveBoundedChain(100, 0, alwaysTrue)).toBe(0);
  });

  it('is bounded by maxDepth even at 100%', () => {
    for (const depth of [1, 2, 3, 5]) {
      expect(resolveBoundedChain(100, depth, alwaysTrue)).toBe(depth);
    }
  });

  it('chains capped at the ECHO_MAX_CHAIN_DEPTH constant', () => {
    expect(resolveBoundedChain(100, ECHO_MAX_CHAIN_DEPTH, alwaysTrue)).toBe(ECHO_MAX_CHAIN_DEPTH);
  });
});

// ─── BASELINE_CRAFT_COST ──────────────────────────────────────────────────────

describe('BASELINE_CRAFT_COST', () => {
  it('is 100', () => {
    expect(BASELINE_CRAFT_COST).toBe(100);
  });
});

// ─── computeNamedEffectMagnitude ──────────────────────────────────────────────

describe('computeNamedEffectMagnitude', () => {
  it('focus T1 = effectMultiplier × 5', () => {
    expect(computeNamedEffectMagnitude('focus', 1, 2.0)).toBeCloseTo(10.0, 5);
    expect(computeNamedEffectMagnitude('focus', 1, 1.0)).toBeCloseTo(5.0, 5);
    expect(computeNamedEffectMagnitude('focus', 1, 0)).toBe(0);
  });

  it('focus T2 = effectMultiplier × 10', () => {
    expect(computeNamedEffectMagnitude('focus', 2, 2.0)).toBeCloseTo(20.0, 5);
  });

  it('focus T3 = effectMultiplier × 12 (can exceed 75)', () => {
    // At effectMultiplier=10: 10 × 12 = 120 > 75
    expect(computeNamedEffectMagnitude('focus', 3, 10.0)).toBeCloseTo(120.0, 5);
  });

  it('quickness T1 = effectMultiplier × 3', () => {
    expect(computeNamedEffectMagnitude('quickness', 1, 1.0)).toBeCloseTo(3.0, 5);
  });

  it('quickness T2 uses cappedChance (never reaches 50)', () => {
    const val = computeNamedEffectMagnitude('quickness', 2, 100);
    expect(val).toBeLessThan(50);
    expect(val).toBeGreaterThan(0);
  });

  it('guard T1 = effectMultiplier × 5', () => {
    expect(computeNamedEffectMagnitude('guard', 1, 1.0)).toBeCloseTo(5.0, 5);
  });

  it('guard T3 uses cappedChance (never reaches 75)', () => {
    const val = computeNamedEffectMagnitude('guard', 3, 1000);
    expect(val).toBeLessThan(75);
    expect(val).toBeGreaterThan(0);
  });

  it('ward T1 uses cappedChance (never reaches 60)', () => {
    const val = computeNamedEffectMagnitude('ward', 1, 1000);
    expect(val).toBeLessThan(60);
  });

  it('ward T2 starts at 2.0 and caps at 5.0', () => {
    expect(computeNamedEffectMagnitude('ward', 2, 0)).toBeCloseTo(2.0, 2);
    expect(computeNamedEffectMagnitude('ward', 2, 1000)).toBeCloseTo(5.0, 2);
  });

  it('echo T1 magnitude scales linearly with effectMultiplier', () => {
    expect(computeNamedEffectMagnitude('echo', 1, 1.0)).toBeCloseTo(20.0, 5);
  });

  it('echo T2 starts at 1.0 and caps at 3.0', () => {
    expect(computeNamedEffectMagnitude('echo', 2, 0)).toBeCloseTo(1.0, 2);
    expect(computeNamedEffectMagnitude('echo', 2, 1000)).toBeCloseTo(3.0, 2);
  });

  it('echo T3 uses cappedChance (never reaches 50)', () => {
    const val = computeNamedEffectMagnitude('echo', 3, 1000);
    expect(val).toBeLessThan(50);
  });

  it('returns 0 for unknown effectId', () => {
    expect(computeNamedEffectMagnitude('unknown' as never, 1, 5)).toBe(0);
  });
});

// ─── rollWeaveNamedEffectTiers ────────────────────────────────────────────────

describe('rollWeaveNamedEffectTiers', () => {
  const singleIngredient = [{ tierId: 'ruby' as import('../../tiers').TierId, refinedCount: BigInt(5) }];

  // Affixes that give at least Uncommon rarity to unlock the pool
  const uncommonAffixes = [{
    affixId: 'ruby_loom_crit_chance' as import('../weave-types').WeaveAffixId,
    tierId: 'ruby' as import('../../tiers').TierId,
    label: 'Crit Chance',
    quality: 0.6,
    rarity: 'Uncommon' as import('../weave-types').WeaveRarity,
    value: 3,
    unit: '%',
    applied: true,
  }];

  it('returns [] for Common-only affixes', () => {
    const commonAffixes = [{ ...uncommonAffixes[0]!, quality: 0.2, rarity: 'Common' as import('../weave-types').WeaveRarity }];
    const result = rollWeaveNamedEffectTiers(commonAffixes, singleIngredient, 1.0, 1, alwaysTrue);
    expect(result).toEqual([]);
  });

  it('always returns T1 for Uncommon+ affixes', () => {
    const result = rollWeaveNamedEffectTiers(uncommonAffixes, singleIngredient, 1.0, 1, alwaysTrue);
    expect(result.length).toBeGreaterThanOrEqual(1);
    expect(result[0]!.tier).toBe(1);
  });

  it('all returned entries share the same effectId', () => {
    const result = rollWeaveNamedEffectTiers(uncommonAffixes, singleIngredient, 1.0, 5, alwaysTrue);
    const ids = new Set(result.map(e => e.effectId));
    expect(ids.size).toBe(1);
  });

  it('with alwaysTrue rng and forgeLevel=5, rolls T1+T2+T3', () => {
    const result = rollWeaveNamedEffectTiers(uncommonAffixes, singleIngredient, 1.0, 5, alwaysTrue);
    const tiers = result.map(e => e.tier).sort();
    expect(tiers).toEqual([1, 2, 3]);
  });

  it('with alwaysFalse rng, rolls only T1', () => {
    // alwaysFalse means tier2Chance roll fails (rng() = 0.9999 > any forge chance)
    const result = rollWeaveNamedEffectTiers(uncommonAffixes, singleIngredient, 1.0, 5, alwaysFalse);
    expect(result).toHaveLength(1);
    expect(result[0]!.tier).toBe(1);
  });

  it('forgeLevel=1 never rolls T3 without T2', () => {
    // forgeLevel=1 has 8% T2 chance, 0% T3 chance — with alwaysTrue rng, T2 fires but T3 never does
    const results = Array.from({ length: 20 }, () =>
      rollWeaveNamedEffectTiers(uncommonAffixes, singleIngredient, 1.0, 1, alwaysTrue),
    );
    for (const r of results) {
      const tiers = r.map(e => e.tier);
      // T3 can only appear if T2 appeared first
      if (tiers.includes(3)) {
        expect(tiers).toContain(2);
      }
    }
  });

  it('effectMultiplier affects magnitude', () => {
    const atX1 = rollWeaveNamedEffectTiers(uncommonAffixes, singleIngredient, 1.0, 5, alwaysTrue);
    const atX2 = rollWeaveNamedEffectTiers(uncommonAffixes, singleIngredient, 2.0, 5, alwaysTrue);
    // Same effectId, so T1 magnitudes should differ by factor of 2 for linear effects
    const t1At1 = atX1.find(e => e.tier === 1);
    const t1At2 = atX2.find(e => e.tier === 1);
    if (t1At1 && t1At2 && t1At1.effectId !== 'ward' && t1At1.effectId !== 'echo') {
      // Linear effects: magnitude doubles with effectMultiplier
      expect(t1At2.magnitude).toBeCloseTo(t1At1.magnitude * 2, 2);
    }
  });

  it('isApplied defaults to true for all rolled tiers', () => {
    const result = rollWeaveNamedEffectTiers(uncommonAffixes, singleIngredient, 1.0, 5, alwaysTrue);
    for (const net of result) {
      expect(net.isApplied).toBe(true);
    }
  });
});

// ─── Equipment modifiers: named tier passive stats ────────────────────────────

describe('getEquippedWeaveModifiers – named tier passive contributions', () => {
  it('focus T1 contributes weaponDamagePct', () => {
    const weave = makeWeaveWithNamedTiers([
      { tier: 1, effectId: 'focus', magnitude: 10.0, isApplied: true },
    ]);
    const mods = getEquippedWeaveModifiers([weave.id], [weave]);
    expect(mods.weaponDamagePct).toBeCloseTo(10.0, 5);
  });

  it('quickness T1 contributes cooldownPct', () => {
    const weave = makeWeaveWithNamedTiers([
      { tier: 1, effectId: 'quickness', magnitude: 6.0, isApplied: true },
    ]);
    const mods = getEquippedWeaveModifiers([weave.id], [weave]);
    expect(mods.cooldownPct).toBeCloseTo(6.0, 5);
  });

  it('guard T1 contributes playerDefensePct', () => {
    const weave = makeWeaveWithNamedTiers([
      { tier: 1, effectId: 'guard', magnitude: 8.0, isApplied: true },
    ]);
    const mods = getEquippedWeaveModifiers([weave.id], [weave]);
    expect(mods.playerDefensePct).toBeCloseTo(8.0, 5);
  });

  it('focus T2 contributes critDamagePct', () => {
    const weave = makeWeaveWithNamedTiers([
      { tier: 2, effectId: 'focus', magnitude: 15.0, isApplied: true },
    ]);
    const mods = getEquippedWeaveModifiers([weave.id], [weave]);
    expect(mods.critDamagePct).toBeCloseTo(15.0, 5);
  });

  it('focus T3 contributes rawNamedCritChancePct (unclamped, can exceed 75)', () => {
    const weave = makeWeaveWithNamedTiers([
      { tier: 3, effectId: 'focus', magnitude: 120.0, isApplied: true },
    ]);
    const mods = getEquippedWeaveModifiers([weave.id], [weave]);
    expect(mods.rawNamedCritChancePct).toBeCloseTo(120.0, 5);
    // Standard critChancePct should still be 0 (not double-counted)
    expect(mods.critChancePct).toBe(0);
  });

  it('ward/echo/quickness T2/T3 do NOT contribute static passive stats', () => {
    const weave = makeWeaveWithNamedTiers([
      { tier: 2, effectId: 'ward', magnitude: 3.0, isApplied: true },
      { tier: 3, effectId: 'echo', magnitude: 25.0, isApplied: true },
    ]);
    const mods = getEquippedWeaveModifiers([weave.id], [weave]);
    expect(mods.weaponDamagePct).toBe(0);
    expect(mods.critDamagePct).toBe(0);
    expect(mods.playerDefensePct).toBe(0);
    expect(mods.cooldownPct).toBe(0);
  });

  it('isApplied=false entries are skipped', () => {
    const weave = makeWeaveWithNamedTiers([
      { tier: 1, effectId: 'focus', magnitude: 10.0, isApplied: false },
    ]);
    const mods = getEquippedWeaveModifiers([weave.id], [weave]);
    expect(mods.weaponDamagePct).toBe(0);
  });

  it('stacks contributions from multiple equipped weaves', () => {
    const w1 = makeWeaveWithNamedTiers([{ tier: 1, effectId: 'focus', magnitude: 5.0, isApplied: true }]);
    const w2 = { ...makeWeaveWithNamedTiers([{ tier: 1, effectId: 'focus', magnitude: 7.0, isApplied: true }]), id: 'w-test-2' };
    const mods = getEquippedWeaveModifiers([w1.id, w2.id], [w1, w2]);
    expect(mods.weaponDamagePct).toBeCloseTo(12.0, 5);
  });

  it('does not double-count if both effects[] and namedEffectTiers contribute the same stat', () => {
    // New weaves have effects=[] (empty) when namedEffectTiers is populated — no overlap.
    const weave = makeWeaveWithNamedTiers([{ tier: 1, effectId: 'focus', magnitude: 5.0, isApplied: true }]);
    weave.effects = []; // explicitly empty (what createCraftedWeave does)
    const mods = getEquippedWeaveModifiers([weave.id], [weave]);
    expect(mods.weaponDamagePct).toBeCloseTo(5.0, 5);
  });
});

// ─── processNamedEffectPlayerDamagedProcs ────────────────────────────────────

describe('processNamedEffectPlayerDamagedProcs', () => {
  it('returns no effect when namedEffectTiers is empty', () => {
    const state = makeStateWithWeave(makeWeaveWithNamedTiers([]));
    const result = processNamedEffectPlayerDamagedProcs(state, { rawAtkValue: 100, finalDmg: 80 });
    expect(result.guardBlocked).toBe(false);
    expect(result.wardShieldConverted).toBe(0);
    expect(result.reflectedDmg).toBe(0);
  });

  it('guard T3: full block when rng passes', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 3, effectId: 'guard', magnitude: 50, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    const result = processNamedEffectPlayerDamagedProcs(state, {
      rawAtkValue: 100, finalDmg: 80, rng: alwaysTrue,
    });
    expect(result.guardBlocked).toBe(true);
  });

  it('guard T3: no block when rng fails', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 3, effectId: 'guard', magnitude: 50, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    const result = processNamedEffectPlayerDamagedProcs(state, {
      rawAtkValue: 100, finalDmg: 80, rng: alwaysFalse,
    });
    expect(result.guardBlocked).toBe(false);
  });

  it('ward T1: converts damage to shield when rng passes', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 1, effectId: 'ward', magnitude: 30, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    const initialShield = state.playerShieldHp;
    const result = processNamedEffectPlayerDamagedProcs(state, {
      rawAtkValue: 100, finalDmg: 80, rng: alwaysTrue,
    });
    expect(result.wardShieldConverted).toBe(80);
    expect(state.playerShieldHp).toBeGreaterThan(initialShield);
  });

  it('ward T1: no conversion when rng fails', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 1, effectId: 'ward', magnitude: 30, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    const result = processNamedEffectPlayerDamagedProcs(state, {
      rawAtkValue: 100, finalDmg: 80, rng: alwaysFalse,
    });
    expect(result.wardShieldConverted).toBe(0);
  });

  it('ward T2: multiplies shield amount', () => {
    const weave = makeWeaveWithNamedTiers([
      { tier: 1, effectId: 'ward', magnitude: 30, isApplied: true },
      { tier: 2, effectId: 'ward', magnitude: 2.0, isApplied: true }, // 2× multiplier
    ]);
    const state = makeStateWithWeave(weave);
    processNamedEffectPlayerDamagedProcs(state, { rawAtkValue: 100, finalDmg: 80, rng: alwaysTrue });
    // Shield should be 80 * 2.0 = 160 (no T3 replenishment)
    expect(state.playerShieldHp).toBeCloseTo(160, 5);
  });

  it('guard T2: reflects portion of finalDmg', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 2, effectId: 'guard', magnitude: 25, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    const result = processNamedEffectPlayerDamagedProcs(state, {
      rawAtkValue: 100, finalDmg: 80,
    });
    expect(result.reflectedDmg).toBeCloseTo(80 * 0.25, 5); // 25% of 80 = 20
  });

  it('guard T2 reflection suppressed when isReflected=true (anti-recursion)', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 2, effectId: 'guard', magnitude: 25, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    const result = processNamedEffectPlayerDamagedProcs(state, {
      rawAtkValue: 100, finalDmg: 80, isReflected: true,
    });
    expect(result.reflectedDmg).toBe(0);
  });

  it('tracks wardHighestIncomingDamage from rawAtkValue', () => {
    const state = createRpgSimState();
    state.craftedWeaves = [];
    state.equippedWeaveSlots = [null, null, null, null, null, null];
    processNamedEffectPlayerDamagedProcs(state, { rawAtkValue: 500, finalDmg: 400 });
    expect(state.wardHighestIncomingDamage).toBe(500);
    // Lower value does not reduce the tracked highest
    processNamedEffectPlayerDamagedProcs(state, { rawAtkValue: 200, finalDmg: 150 });
    expect(state.wardHighestIncomingDamage).toBe(500);
  });

  it('returns no effect when finalDmg <= 0', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 3, effectId: 'guard', magnitude: 100, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    const result = processNamedEffectPlayerDamagedProcs(state, { rawAtkValue: 0, finalDmg: 0 });
    expect(result.guardBlocked).toBe(false);
  });
});

// ─── processNamedEffectPlayerHitEnemyProcs ───────────────────────────────────

describe('processNamedEffectPlayerHitEnemyProcs', () => {
  it('does nothing when namedEffectTiers is empty', () => {
    const state = makeStateWithWeave(makeWeaveWithNamedTiers([]));
    let called = false;
    processNamedEffectPlayerHitEnemyProcs(state, {
      finalDmg: 100, onExtraAttack: () => { called = true; }, onEchoHit: () => { called = true; },
    });
    expect(called).toBe(false);
  });

  it('quickness T2: fires extra attack on proc', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 2, effectId: 'quickness', magnitude: 50, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    let extraAttacks = 0;
    processNamedEffectPlayerHitEnemyProcs(state, {
      finalDmg: 100, rng: alwaysTrue,
      onExtraAttack: () => { extraAttacks++; },
    });
    expect(extraAttacks).toBeGreaterThanOrEqual(1);
  });

  it('quickness T2 suppressed when isExtraAttack=true (anti-recursion)', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 2, effectId: 'quickness', magnitude: 99, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    let extraAttacks = 0;
    processNamedEffectPlayerHitEnemyProcs(state, {
      finalDmg: 100, isExtraAttack: true, rng: alwaysTrue,
      onExtraAttack: () => { extraAttacks++; },
    });
    expect(extraAttacks).toBe(0);
  });

  it('echo T1: fires echo hit on proc', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 1, effectId: 'echo', magnitude: 20, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    let echoHits = 0;
    let echoTotal = 0;
    processNamedEffectPlayerHitEnemyProcs(state, {
      finalDmg: 100, rng: alwaysTrue,
      onEchoHit: (dmg) => { echoHits++; echoTotal += dmg; },
    });
    expect(echoHits).toBeGreaterThanOrEqual(1);
    // Echo damage = 100 * (20/100) = 20
    expect(echoTotal).toBeGreaterThanOrEqual(20);
  });

  it('echo T1 suppressed when isEchoHit=true (anti-recursion)', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 1, effectId: 'echo', magnitude: 20, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    let echoHits = 0;
    processNamedEffectPlayerHitEnemyProcs(state, {
      finalDmg: 100, isEchoHit: true, rng: alwaysTrue,
      onEchoHit: () => { echoHits++; },
    });
    expect(echoHits).toBe(0);
  });

  it('echo T2: multiplies echo damage', () => {
    const weave = makeWeaveWithNamedTiers([
      { tier: 1, effectId: 'echo', magnitude: 20, isApplied: true },
      { tier: 2, effectId: 'echo', magnitude: 2.0, isApplied: true }, // 2× echo damage
    ]);
    const state = makeStateWithWeave(weave);
    let echoTotal = 0;
    processNamedEffectPlayerHitEnemyProcs(state, {
      finalDmg: 100, rng: alwaysTrue,
      onEchoHit: (dmg) => { echoTotal += dmg; },
    });
    // Base echo = 20, T2 mult = 2.0 → first echo = 40; chains reduce by 0.75 each
    expect(echoTotal).toBeGreaterThan(20);
  });

  it('does nothing when finalDmg <= 0', () => {
    const weave = makeWeaveWithNamedTiers([{ tier: 1, effectId: 'echo', magnitude: 20, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    let echoHits = 0;
    processNamedEffectPlayerHitEnemyProcs(state, {
      finalDmg: 0, rng: alwaysTrue,
      onEchoHit: () => { echoHits++; },
    });
    expect(echoHits).toBe(0);
  });
});

// ─── Quickened Stitch T3 stack mechanics ─────────────────────────────────────

describe('Quickened Stitch T3 stack mechanics', () => {
  it('accumulates stacks and releases at cap', () => {
    const magnitude = 100; // 100% stack rate — always adds 1 stack
    const weave = makeWeaveWithNamedTiers([{ tier: 3, effectId: 'quickness', magnitude, isApplied: true }]);
    const state = makeStateWithWeave(weave);
    let burstFired = 0;

    const opts = {
      finalDmg: 100,
      rng: alwaysTrue,
      onExtraAttack: () => { burstFired++; },
    };

    // Each call adds 1 stack (from 100%); at QUICKENED_STITCH_MAX_STACKS it releases
    for (let i = 0; i < QUICKENED_STITCH_MAX_STACKS; i++) {
      processNamedEffectPlayerHitEnemyProcs(state, opts);
    }

    // After max stacks: burst fires and stacks reset
    expect(state.quickenedStitchAttackStacks).toBe(0);
    expect(burstFired).toBe(QUICKENED_STITCH_MAX_STACKS);
  });
});

// ─── Shield state mechanics ────────────────────────────────────────────────────

describe('playerShieldHp mechanics', () => {
  it('starts at 0', () => {
    const state = createRpgSimState();
    expect(state.playerShieldHp).toBe(0);
  });

  it('wardHighestIncomingDamage starts at 0', () => {
    const state = createRpgSimState();
    expect(state.wardHighestIncomingDamage).toBe(0);
  });

  it('quickenedStitchAttackStacks starts at 0', () => {
    const state = createRpgSimState();
    expect(state.quickenedStitchAttackStacks).toBe(0);
  });
});

// ─── getTotalNamedEffectMagnitude helper ──────────────────────────────────────

describe('getTotalNamedEffectMagnitude', () => {
  it('sums magnitudes across matching equipped weaves', () => {
    const w1 = makeWeaveWithNamedTiers([{ tier: 1, effectId: 'focus', magnitude: 5.0, isApplied: true }]);
    const w2 = { ...makeWeaveWithNamedTiers([{ tier: 1, effectId: 'focus', magnitude: 7.0, isApplied: true }]), id: 'w-test-2' };
    const state = createRpgSimState();
    state.craftedWeaves = [w1, w2];
    state.equippedWeaveSlots = [w1.id, w2.id, null, null, null, null];
    const total = getTotalNamedEffectMagnitude(state, 'focus', 1);
    expect(total).toBeCloseTo(12.0, 5);
  });

  it('returns 0 when no matching entries', () => {
    const state = createRpgSimState();
    expect(getTotalNamedEffectMagnitude(state, 'echo', 3)).toBe(0);
  });
});

// ─── Save round-trip ──────────────────────────────────────────────────────────

describe('save round-trip: namedEffectTiers', () => {
  it('serializes and restores namedEffectTiers and effectMultiplier', () => {
    const gameState = createGameState();
    const weave = makeWeaveWithNamedTiers([
      { tier: 1, effectId: 'focus', magnitude: 5.0, isApplied: true },
      { tier: 2, effectId: 'focus', magnitude: 10.0, isApplied: true },
    ], 1.5);
    gameState.rpg.craftedWeaves = [weave];

    const saveData = serializeGameState(gameState);
    const savedWeave = saveData.rpg?.craftedWeaves?.[0];
    expect(savedWeave?.namedEffectTiers).toHaveLength(2);
    expect(savedWeave?.effectMultiplier).toBeCloseTo(1.5, 5);

    const restored = deserializeGameState(saveData);
    const restoredWeave = restored.rpg.craftedWeaves[0];
    expect(restoredWeave?.namedEffectTiers).toHaveLength(2);
    expect(restoredWeave?.namedEffectTiers?.[0]?.effectId).toBe('focus');
    expect(restoredWeave?.namedEffectTiers?.[0]?.magnitude).toBeCloseTo(5.0, 5);
    expect(restoredWeave?.effectMultiplier).toBeCloseTo(1.5, 5);
  });

  it('old saves without namedEffectTiers default to []', () => {
    const gameState = createGameState();
    const oldWeave: CraftedWeaveData = {
      id: 'old-weave',
      name: 'Old Weave',
      ingredients: [],
      affixes: [],
      totalWeightedMoteValue: 100,
      forgeCraftLevel: 1,
      tierEffects: [],
      refinementLevel: 0,
      effects: [{ id: 'weave_focus', value: 3.0 }],
      // namedEffectTiers intentionally absent
    };
    gameState.rpg.craftedWeaves = [oldWeave];

    const saveData = serializeGameState(gameState);
    // Simulate old save by removing the namedEffectTiers field
    const savedWeave = saveData.rpg?.craftedWeaves?.[0];
    if (savedWeave) {
      delete (savedWeave as Record<string, unknown>).namedEffectTiers;
      delete (savedWeave as Record<string, unknown>).effectMultiplier;
    }

    const restored = deserializeGameState(saveData);
    const restoredWeave = restored.rpg.craftedWeaves[0];
    expect(restoredWeave?.namedEffectTiers ?? []).toHaveLength(0);
    expect(restoredWeave?.effectMultiplier).toBeUndefined();
    // Old effects[] still intact
    expect(restoredWeave?.effects?.[0]?.id).toBe('weave_focus');
  });
});

// ─── Constants ────────────────────────────────────────────────────────────────

describe('proc-effects constants', () => {
  it('QUICKENED_STITCH_MAX_STACKS is a positive integer', () => {
    expect(Number.isInteger(QUICKENED_STITCH_MAX_STACKS)).toBe(true);
    expect(QUICKENED_STITCH_MAX_STACKS).toBeGreaterThan(0);
  });

  it('ECHO_NEARBY_RADIUS is a positive number', () => {
    expect(ECHO_NEARBY_RADIUS).toBeGreaterThan(0);
  });

  it('ECHO_MAX_CHAIN_DEPTH is a positive integer', () => {
    expect(Number.isInteger(ECHO_MAX_CHAIN_DEPTH)).toBe(true);
    expect(ECHO_MAX_CHAIN_DEPTH).toBeGreaterThan(0);
  });
});

// ─── Last Thread (undying) ────────────────────────────────────────────────────

describe('Last Thread (undying) — processNamedEffectPlayerLethalDamageProcs', () => {
  function makeUndyingState(tiers: { tier: 1 | 2 | 3; magnitude: number }[]) {
    const weave = makeWeaveWithNamedTiers(
      tiers.map(t => ({ tier: t.tier, effectId: 'undying' as const, magnitude: t.magnitude, isApplied: true })),
    );
    return makeStateWithWeave(weave);
  }

  const baseOpts = {
    finalDmg: 100,
    currentHp: 50,
    playerBaseAtk: 80,
    playerMaxCritAtk: 160,
    attackerAtk: 70,
    attackerIsBoss: false,
  };

  it('T1: survives lethal damage when rng passes', () => {
    const state = makeUndyingState([{ tier: 1, magnitude: 60 }]);
    let survived = false;
    const result = processNamedEffectPlayerLethalDamageProcs(state, {
      ...baseOpts,
      rng: alwaysTrue,
      onSurvive: () => { survived = true; },
    });
    expect(result.survived).toBe(true);
    expect(result.counterDeath).toBe(false);
    expect(survived).toBe(true);
  });

  it('T1: does not trigger when rng fails', () => {
    const state = makeUndyingState([{ tier: 1, magnitude: 60 }]);
    const result = processNamedEffectPlayerLethalDamageProcs(state, {
      ...baseOpts,
      rng: alwaysFalse,
    });
    expect(result.survived).toBe(false);
    expect(result.counterDeath).toBe(false);
  });

  it('T2: counter-death when rng passes and attackerAtk ≤ playerBaseAtk', () => {
    const state = makeUndyingState([{ tier: 2, magnitude: 45 }]);
    let survived = false;
    let counterKill = false;
    const result = processNamedEffectPlayerLethalDamageProcs(state, {
      ...baseOpts,
      attackerAtk: 80, // exactly equal to playerBaseAtk
      rng: alwaysTrue,
      onSurvive: () => { survived = true; },
      onCounterDeath: () => { counterKill = true; },
    });
    expect(result.survived).toBe(true);
    expect(result.counterDeath).toBe(true);
    expect(survived).toBe(true);
    expect(counterKill).toBe(true);
  });

  it('T2: no counter-death when attackerAtk > playerBaseAtk', () => {
    const state = makeUndyingState([{ tier: 2, magnitude: 45 }]);
    const result = processNamedEffectPlayerLethalDamageProcs(state, {
      ...baseOpts,
      attackerAtk: 81, // just over playerBaseAtk
      rng: alwaysTrue,
    });
    // T2 condition fails; no other tiers → no survival
    expect(result.survived).toBe(false);
    expect(result.counterDeath).toBe(false);
  });

  it('T3: counter-death checked before T2 (resolution order)', () => {
    const state = makeUndyingState([
      { tier: 2, magnitude: 45 },
      { tier: 3, magnitude: 55 },
    ]);
    const calls: string[] = [];
    const result = processNamedEffectPlayerLethalDamageProcs(state, {
      ...baseOpts,
      attackerAtk: 100, // > playerBaseAtk (80) but ≤ playerMaxCritAtk (160)
      rng: alwaysTrue,
      onSurvive: () => { calls.push('survive'); },
      onCounterDeath: () => { calls.push('counter'); },
    });
    expect(result.survived).toBe(true);
    expect(result.counterDeath).toBe(true);
    // T3 fires first; T2 never gets to run
    expect(calls).toEqual(['survive', 'counter']);
  });

  it('T3: no counter-death when attackerAtk > playerMaxCritAtk', () => {
    const state = makeUndyingState([{ tier: 3, magnitude: 55 }]);
    const result = processNamedEffectPlayerLethalDamageProcs(state, {
      ...baseOpts,
      attackerAtk: 200, // > playerMaxCritAtk (160)
      rng: alwaysTrue,
    });
    expect(result.survived).toBe(false);
  });

  it('undyingProcActive guard prevents double-trigger within same event', () => {
    const state = makeUndyingState([{ tier: 1, magnitude: 60 }]);
    state.undyingProcActive = true; // pre-set the guard (simulates nested call)
    const result = processNamedEffectPlayerLethalDamageProcs(state, {
      ...baseOpts,
      rng: alwaysTrue,
    });
    // Function early-returns without touching the flag (caller owns it)
    expect(result.survived).toBe(false);
    expect(state.undyingProcActive).toBe(true); // unchanged — function didn't set it
  });

  it('does not trigger on non-lethal damage (no undying weave equipped)', () => {
    const state = createRpgSimState(); // no weave
    const result = processNamedEffectPlayerLethalDamageProcs(state, {
      ...baseOpts,
      rng: alwaysTrue,
    });
    expect(result.survived).toBe(false);
    expect(result.counterDeath).toBe(false);
  });

  it('boss attackers skip T2/T3 counter-death but T1 still works', () => {
    const state = makeUndyingState([
      { tier: 2, magnitude: 45 },
      { tier: 1, magnitude: 60 },
    ]);
    let survived = false;
    let counterKill = false;
    const result = processNamedEffectPlayerLethalDamageProcs(state, {
      ...baseOpts,
      attackerIsBoss: true,
      attackerAtk: 50, // would qualify for T2 if not boss
      rng: alwaysTrue,
      onSurvive: () => { survived = true; },
      onCounterDeath: () => { counterKill = true; },
    });
    // T1 should still fire; T2 should be skipped due to boss flag
    expect(result.survived).toBe(true);
    expect(result.counterDeath).toBe(false);
    expect(survived).toBe(true);
    expect(counterKill).toBe(false);
  });
});

// ─── Ember Surge helpers ──────────────────────────────────────────────────────

describe('Ember Surge — getEmberDurationMult / getEmberPotencyMult / getEmberOverloadChancePct', () => {
  function makeEmberState(tiers: { tier: 1 | 2 | 3; magnitude: number }[]) {
    const weave = makeWeaveWithNamedTiers(
      tiers.map(t => ({ tier: t.tier, effectId: 'ember' as const, magnitude: t.magnitude, isApplied: true })),
    );
    return makeStateWithWeave(weave);
  }

  it('T1 duration mult: no ember weave → 1.0 (no bonus)', () => {
    const state = createRpgSimState();
    expect(getEmberDurationMult(state)).toBe(1.0);
  });

  it('T1 duration mult: 100% bonus → 2.0x', () => {
    const state = makeEmberState([{ tier: 1, magnitude: 100 }]);
    expect(getEmberDurationMult(state)).toBeCloseTo(2.0, 5);
  });

  it('T1 duration mult: caps at 200% bonus → 3.0x', () => {
    const state = makeEmberState([{ tier: 1, magnitude: 300 }]); // > cap of 200
    expect(getEmberDurationMult(state)).toBeCloseTo(3.0, 5); // 1 + 200/100 = 3.0
  });

  it('T2 potency mult: no ember weave → 1.0', () => {
    const state = createRpgSimState();
    expect(getEmberPotencyMult(state)).toBe(1.0);
  });

  it('T2 potency mult: 75% bonus → 1.75x', () => {
    const state = makeEmberState([{ tier: 2, magnitude: 75 }]);
    expect(getEmberPotencyMult(state)).toBeCloseTo(1.75, 5);
  });

  it('T2 potency mult: caps at 150% bonus → 2.5x', () => {
    const state = makeEmberState([{ tier: 2, magnitude: 200 }]); // > cap of 150
    expect(getEmberPotencyMult(state)).toBeCloseTo(2.5, 5); // 1 + 150/100 = 2.5
  });

  it('T3 overload chance: no ember weave → 0', () => {
    const state = createRpgSimState();
    expect(getEmberOverloadChancePct(state)).toBe(0);
  });

  it('T3 overload chance: returns magnitude directly', () => {
    const state = makeEmberState([{ tier: 3, magnitude: 28 }]);
    expect(getEmberOverloadChancePct(state)).toBeCloseTo(28, 5);
  });

  it('magnitude formula: T1 uses min(x*15, 200) cap', () => {
    // x=5 → min(75, 200) = 75 → durationMult = 1+75/100 = 1.75
    const mag5 = computeNamedEffectMagnitude('ember', 1, 5);
    expect(mag5).toBeCloseTo(75, 1);
    // x=20 → min(300, 200) = 200 → hits cap
    const mag20 = computeNamedEffectMagnitude('ember', 1, 20);
    expect(mag20).toBeCloseTo(200, 1);
  });

  it('magnitude formula: T2 uses min(x*12, 150) cap', () => {
    const mag5 = computeNamedEffectMagnitude('ember', 2, 5);
    expect(mag5).toBeCloseTo(60, 1);
    const mag20 = computeNamedEffectMagnitude('ember', 2, 20);
    expect(mag20).toBeCloseTo(150, 1);
  });

  it('magnitude formula: T3 uses cappedChance asymptotic formula', () => {
    const mag1 = computeNamedEffectMagnitude('ember', 3, 1);
    expect(mag1).toBeGreaterThan(0);
    expect(mag1).toBeLessThan(40); // cappedChance(x, 40, 0.8) < 40
  });
});
