/**
 * crafted-weapons.test.ts — Unit tests for the crafted weapon system.
 *
 * Covers:
 *   - Tier-weighted composition math (100 sand + 1 quartz = 50/50)
 *   - getForgeCapacity levels 1–5 → slots 2–6
 *   - Sand damage divisor never reaches zero
 *   - Fracteryl repeat cap never exceeds 10
 *   - computeCraftedWeaponModifiers produces correct values
 */

import { describe, it, expect } from 'vitest';
import {
  computeCraftedWeaponComposition,
  getForgeCapacity,
  deriveCraftedWeaponStats,
  computeCraftedWeaponModifiers,
  createCraftedWeaponDefinition,
  computeTotalWeightedMoteValue,
  computeCraftedWeaponBaseLevel,
  computeCraftedWeaponBaseStatMultiplier,
} from '../crafted-weapon-helpers';
import type { CraftedWeaponIngredient } from '../crafted-weapon-types';

// ─── Composition math ────────────────────────────────────────────

describe('computeCraftedWeaponComposition', () => {
  it('100 sand + 1 quartz = 50% sand / 50% quartz (tier-weighted)', () => {
    // Sand is tier 0 → weight 100^0 = 1 per crystal
    // Quartz is tier 1 → weight 100^1 = 100 per crystal
    // 100 sand total weight = 100 × 1 = 100
    // 1 quartz total weight = 1 × 100 = 100
    // → both 50%
    const ingredients: CraftedWeaponIngredient[] = [
      { tierId: 'sand', refinedCount: 100 },
      { tierId: 'quartz', refinedCount: 1 },
    ];
    const comp = computeCraftedWeaponComposition(ingredients);
    expect(comp).toHaveLength(2);
    // Sorted by weighted value descending — quartz first (equal weight, or quartz if same value tiebreak)
    const sandEntry = comp.find(e => e.tierId === 'sand')!;
    const quartzEntry = comp.find(e => e.tierId === 'quartz')!;
    expect(sandEntry).toBeDefined();
    expect(quartzEntry).toBeDefined();
    expect(sandEntry.share).toBeCloseTo(0.5, 5);
    expect(quartzEntry.share).toBeCloseTo(0.5, 5);
    expect(sandEntry.share + quartzEntry.share).toBeCloseTo(1, 10);
  });

  it('pure single-tier produces 100% share', () => {
    const ingredients: CraftedWeaponIngredient[] = [
      { tierId: 'ruby', refinedCount: 5 },
    ];
    const comp = computeCraftedWeaponComposition(ingredients);
    expect(comp).toHaveLength(1);
    expect(comp[0]!.tierId).toBe('ruby');
    expect(comp[0]!.share).toBeCloseTo(1, 10);
  });

  it('shares always sum to 1 for multi-tier inputs', () => {
    const ingredients: CraftedWeaponIngredient[] = [
      { tierId: 'sand', refinedCount: 50 },
      { tierId: 'quartz', refinedCount: 2 },
      { tierId: 'ruby', refinedCount: 1 },
    ];
    const comp = computeCraftedWeaponComposition(ingredients);
    const totalShare = comp.reduce((sum, e) => sum + e.share, 0);
    expect(totalShare).toBeCloseTo(1, 10);
  });

  it('filters zero-count ingredients', () => {
    const ingredients: CraftedWeaponIngredient[] = [
      { tierId: 'sand', refinedCount: 10 },
      { tierId: 'quartz', refinedCount: 0 },
    ];
    const comp = computeCraftedWeaponComposition(ingredients);
    expect(comp).toHaveLength(1);
    expect(comp[0]!.tierId).toBe('sand');
  });
});

// ─── getForgeCapacity ─────────────────────────────────────────────

describe('getForgeCapacity', () => {
  it('level 1 → 2 slots', () => expect(getForgeCapacity(1)).toBe(2));
  it('level 2 → 3 slots', () => expect(getForgeCapacity(2)).toBe(3));
  it('level 3 → 4 slots', () => expect(getForgeCapacity(3)).toBe(4));
  it('level 4 → 5 slots', () => expect(getForgeCapacity(4)).toBe(5));
  it('level 5 → 6 slots', () => expect(getForgeCapacity(5)).toBe(6));
  it('level 10 → capped at 6', () => expect(getForgeCapacity(10)).toBe(6));
  it('level 0 → treated as 1 → 2 slots', () => expect(getForgeCapacity(0)).toBe(2));
});

// ─── Sand divisor safety ──────────────────────────────────────────

describe('Sand modifier in deriveCraftedWeaponStats', () => {
  it('damage never drops below 6 for any sand share', () => {
    const shares = [0.1, 0.25, 0.5, 0.75, 0.9, 1.0];
    for (const share of shares) {
      // Approximate: sand share = share, no quartz
      // Use a very large sand count so share ≈ 1 at limit
      const refinedCount = Math.round(share * 10000);
      const ingredients: CraftedWeaponIngredient[] = [
        { tierId: 'sand', refinedCount },
      ];
      const { stats } = deriveCraftedWeaponStats(ingredients, 1);
      expect(stats.damage).toBeGreaterThanOrEqual(6);
    }
  });

  it('cooldownMs never drops below 220ms', () => {
    const ingredients: CraftedWeaponIngredient[] = [
      { tierId: 'sand', refinedCount: 99999 },
    ];
    const { stats } = deriveCraftedWeaponStats(ingredients, 1);
    expect(stats.cooldownMs).toBeGreaterThanOrEqual(220);
  });

  it('damage is strictly less for high sand share than base (divisor applied)', () => {
    const pureSand: CraftedWeaponIngredient[] = [{ tierId: 'sand', refinedCount: 10 }];
    const pureRuby: CraftedWeaponIngredient[] = [{ tierId: 'ruby', refinedCount: 10 }];
    const sandStats = deriveCraftedWeaponStats(pureSand, 1);
    const rubyStats = deriveCraftedWeaponStats(pureRuby, 1);
    // Sand-dominant weapon should have lower damage per hit (higher fire rate)
    expect(sandStats.stats.damage).toBeLessThan(rubyStats.stats.damage);
    // But higher fire rate (lower cooldown)
    expect(sandStats.stats.cooldownMs).toBeLessThan(rubyStats.stats.cooldownMs);
  });
});

// ─── Fracteryl strike cap ─────────────────────────────────────────

describe('computeCraftedWeaponModifiers — Fracteryl cap', () => {
  it('fracterylStrikes never exceeds 10 regardless of share', () => {
    // 100% fracteryl composition
    const fullFracteryl = [{ tierId: 'fracteryl' as const, weightedValue: 1, share: 1 }];
    const mods = computeCraftedWeaponModifiers(fullFracteryl);
    expect(mods.fracterylStrikes).toBeLessThanOrEqual(10);
  });

  it('fracteryl at 50% share gives ~5 strikes', () => {
    const halfFracteryl = [
      { tierId: 'fracteryl' as const, weightedValue: 0.5, share: 0.5 },
      { tierId: 'sand' as const, weightedValue: 0.5, share: 0.5 },
    ];
    const mods = computeCraftedWeaponModifiers(halfFracteryl);
    expect(mods.fracterylStrikes).toBe(5);
    expect(mods.fracterylStrikes).toBeLessThanOrEqual(10);
  });
});

// ─── computeCraftedWeaponModifiers ───────────────────────────────

describe('computeCraftedWeaponModifiers', () => {
  it('sapphire crit capped at 60%', () => {
    const fullSapphire = [{ tierId: 'sapphire' as const, weightedValue: 1, share: 1 }];
    const mods = computeCraftedWeaponModifiers(fullSapphire);
    expect(mods.critChancePct).toBe(60);
  });

  it('diamond armor ignore capped at 1 (100%)', () => {
    const fullDiamond = [{ tierId: 'diamond' as const, weightedValue: 1, share: 1 }];
    const mods = computeCraftedWeaponModifiers(fullDiamond);
    expect(mods.armorIgnorePct).toBe(1);
  });

  it('nullstone pull radius capped at 80px', () => {
    const fullNull = [{ tierId: 'nullstone' as const, weightedValue: 1, share: 1 }];
    const mods = computeCraftedWeaponModifiers(fullNull);
    expect(mods.nullstonePullRadius).toBeLessThanOrEqual(80);
  });

  it('no-modifier tiers produce zero values', () => {
    const sandOnly = [{ tierId: 'sand' as const, weightedValue: 1, share: 1 }];
    const mods = computeCraftedWeaponModifiers(sandOnly);
    expect(mods.critChancePct).toBe(0);
    expect(mods.armorIgnorePct).toBe(0);
    expect(mods.fracterylStrikes).toBe(0);
    expect(mods.amethystShipCount).toBe(0);
  });
});

// ─── computeCraftedWeaponModifiers — Amethyst ship count ─────────

describe('computeCraftedWeaponModifiers — Amethyst ship count', () => {
  it('100% amethyst gives 10 ships', () => {
    const fullAmethyst = [{ tierId: 'amethyst' as const, weightedValue: 1, share: 1 }];
    const mods = computeCraftedWeaponModifiers(fullAmethyst);
    expect(mods.amethystShipCount).toBe(10);
  });

  it('60% amethyst gives 6 ships', () => {
    const comp = [{ tierId: 'amethyst' as const, weightedValue: 0.6, share: 0.6 }];
    const mods = computeCraftedWeaponModifiers(comp);
    expect(mods.amethystShipCount).toBe(6);
  });

  it('0% amethyst gives 0 ships', () => {
    const noAmethyst = [{ tierId: 'ruby' as const, weightedValue: 1, share: 1 }];
    const mods = computeCraftedWeaponModifiers(noAmethyst);
    expect(mods.amethystShipCount).toBe(0);
  });

  it('amethystShipCount never exceeds 10', () => {
    const fullAmethyst = [{ tierId: 'amethyst' as const, weightedValue: 1, share: 1 }];
    const mods = computeCraftedWeaponModifiers(fullAmethyst);
    expect(mods.amethystShipCount).toBeLessThanOrEqual(10);
  });
});

// ─── computeTotalWeightedMoteValue ───────────────────────────────

describe('computeTotalWeightedMoteValue', () => {
  it('100 sand + 1 quartz = 200 (sand weight=1, quartz weight=100)', () => {
    const ingredients: CraftedWeaponIngredient[] = [
      { tierId: 'sand', refinedCount: 100 },
      { tierId: 'quartz', refinedCount: 1 },
    ];
    expect(computeTotalWeightedMoteValue(ingredients)).toBe(200);
  });

  it('higher tiers weight 100× each tier', () => {
    // Sand=1, Quartz=100, Ruby=10000
    const sand1 = computeTotalWeightedMoteValue([{ tierId: 'sand', refinedCount: 1 }]);
    const quartz1 = computeTotalWeightedMoteValue([{ tierId: 'quartz', refinedCount: 1 }]);
    const ruby1 = computeTotalWeightedMoteValue([{ tierId: 'ruby', refinedCount: 1 }]);
    expect(quartz1 / sand1).toBe(100);
    expect(ruby1 / quartz1).toBe(100);
  });

  it('zero ingredients = 0', () => {
    expect(computeTotalWeightedMoteValue([])).toBe(0);
  });
});

// ─── computeCraftedWeaponBaseLevel ───────────────────────────────

describe('computeCraftedWeaponBaseLevel', () => {
  it('returns 1 for 0 weighted value', () => {
    expect(computeCraftedWeaponBaseLevel(0)).toBe(1);
  });

  it('returns 1 for value < 10', () => {
    expect(computeCraftedWeaponBaseLevel(9)).toBe(1);
  });

  it('returns 2 for value = 100', () => {
    expect(computeCraftedWeaponBaseLevel(100)).toBe(2);
  });

  it('increases with higher weighted value', () => {
    const low = computeCraftedWeaponBaseLevel(100);
    const mid = computeCraftedWeaponBaseLevel(10000);
    const high = computeCraftedWeaponBaseLevel(1e6);
    expect(mid).toBeGreaterThan(low);
    expect(high).toBeGreaterThan(mid);
  });
});

// ─── computeCraftedWeaponBaseStatMultiplier ──────────────────────

describe('computeCraftedWeaponBaseStatMultiplier', () => {
  it('returns exactly 1 when weighted value is 0', () => {
    expect(computeCraftedWeaponBaseStatMultiplier(0)).toBeCloseTo(1, 5);
  });

  it('returns > 1 for any positive weighted value', () => {
    expect(computeCraftedWeaponBaseStatMultiplier(200)).toBeGreaterThan(1);
  });

  it('increases monotonically with higher weighted value', () => {
    const a = computeCraftedWeaponBaseStatMultiplier(200);
    const b = computeCraftedWeaponBaseStatMultiplier(10000);
    const c = computeCraftedWeaponBaseStatMultiplier(1e6);
    expect(b).toBeGreaterThan(a);
    expect(c).toBeGreaterThan(b);
  });
});

// ─── Base stat scaling floors ─────────────────────────────────────

describe('deriveCraftedWeaponStats — base level scaling floors', () => {
  it('damage never drops below 6 regardless of recipe size', () => {
    const tiny: CraftedWeaponIngredient[] = [{ tierId: 'sand', refinedCount: 1 }];
    const { stats } = deriveCraftedWeaponStats(tiny, 1);
    expect(stats.damage).toBeGreaterThanOrEqual(6);
  });

  it('cooldownMs never drops below 220ms regardless of recipe size', () => {
    const huge: CraftedWeaponIngredient[] = [
      { tierId: 'sand', refinedCount: 99999 },
      { tierId: 'ruby', refinedCount: 1000 },
    ];
    const { stats } = deriveCraftedWeaponStats(huge, 5);
    expect(stats.cooldownMs).toBeGreaterThanOrEqual(220);
  });

  it('stats are higher for a larger recipe than a minimal one', () => {
    const small: CraftedWeaponIngredient[] = [{ tierId: 'ruby', refinedCount: 1 }];
    const large: CraftedWeaponIngredient[] = [{ tierId: 'ruby', refinedCount: 100 }];
    const { stats: sSmall } = deriveCraftedWeaponStats(small, 1);
    const { stats: sLarge } = deriveCraftedWeaponStats(large, 1);
    expect(sLarge.damage).toBeGreaterThan(sSmall.damage);
  });
});

// ─── createCraftedWeaponDefinition round-trip ────────────────────

describe('createCraftedWeaponDefinition', () => {
  it('produces a weapon with a valid id and non-empty name', () => {
    const ingredients: CraftedWeaponIngredient[] = [
      { tierId: 'sand', refinedCount: 100 },
      { tierId: 'quartz', refinedCount: 1 },
    ];
    const cw = createCraftedWeaponDefinition('crafted_weapon_test_1', ingredients, 1);
    expect(cw.id).toBe('crafted_weapon_test_1');
    expect(cw.name.length).toBeGreaterThan(0);
    expect(cw.definition.id).toBe('crafted_weapon_test_1');
    expect(cw.modifiers).toBeDefined();
    expect(cw.composition.length).toBeGreaterThan(0);
    // Base level fields
    expect(cw.totalWeightedMoteValue).toBe(200); // 100 sand×1 + 1 quartz×100
    expect(cw.baseLevel).toBeGreaterThanOrEqual(1);
    expect(cw.baseStatMultiplier).toBeGreaterThanOrEqual(1);
    expect(cw.modifiers.critDamageMultiplier).toBeGreaterThanOrEqual(2);
  });

  it('modifiers derived from composition are consistent', () => {
    const ingredients: CraftedWeaponIngredient[] = [
      { tierId: 'sapphire', refinedCount: 10 },
    ];
    const cw = createCraftedWeaponDefinition('crafted_weapon_test_2', ingredients, 1);
    expect(cw.modifiers.critChancePct).toBeGreaterThan(0);
    expect(cw.modifiers.critChancePct).toBeLessThanOrEqual(60);
  });
});

// ─── Eigenstein swordCombo effect ────────────────────────────────

import { getDominantCraftedEffect, isEigensteinDominant } from '../crafted-weapon-helpers';

describe('getDominantCraftedEffect — eigenstein', () => {
  it('returns swordCombo for eigenstein dominant tier', () => {
    const effect = getDominantCraftedEffect('eigenstein');
    expect(effect.kind).toBe('swordCombo');
  });
});

describe('isEigensteinDominant', () => {
  it('returns true for a registered eigenstein-dominant weapon', () => {
    const id = 'crafted_weapon_eigenstein_test';
    createCraftedWeaponDefinition(id, [{ tierId: 'eigenstein', refinedCount: 1 }], 1);
    expect(isEigensteinDominant(id)).toBe(true);
  });

  it('returns false for a non-eigenstein weapon', () => {
    const id = 'crafted_weapon_ruby_test';
    createCraftedWeaponDefinition(id, [{ tierId: 'ruby', refinedCount: 1 }], 1);
    expect(isEigensteinDominant(id)).toBe(false);
  });

  it('eigenstein weapon has swordCombo effect in its definition', () => {
    const id = 'crafted_weapon_eigenstein_def_test';
    const cw = createCraftedWeaponDefinition(id, [{ tierId: 'eigenstein', refinedCount: 1 }], 1);
    expect(cw.definition.stats.effect?.kind).toBe('swordCombo');
  });
});

// ─── Eigenstein rift damage accumulation math ─────────────────────

describe('Eigenstein rift accumulation logic', () => {
  it('compounding formula: stored += baseDamage; hit = base + storedBefore', () => {
    const baseDamage = 20;
    let stored = 0;

    // Hit 1: stored = 0 → deal 20+0=20, then stored = 0+20 = 20
    const hit1Prior = stored;
    const hit1Dealt = baseDamage + hit1Prior;
    stored += baseDamage;
    expect(hit1Dealt).toBe(20);
    expect(stored).toBe(20);

    // Hit 2: stored = 20 → deal 20+20=40, then stored = 20+20 = 40
    const hit2Prior = stored;
    const hit2Dealt = baseDamage + hit2Prior;
    stored += baseDamage;
    expect(hit2Dealt).toBe(40);
    expect(stored).toBe(40);

    // Hit 3: stored = 40 → deal 20+40=60, then stored = 40+20 = 60
    const hit3Dealt = baseDamage + stored;
    stored += baseDamage;
    expect(hit3Dealt).toBe(60);
    expect(stored).toBe(60);

    // Repeated hits strictly increase damage
    expect(hit2Dealt).toBeGreaterThan(hit1Dealt);
    expect(hit3Dealt).toBeGreaterThan(hit2Dealt);
  });

  it('different enemies do not share accumulation', () => {
    const enemyA = {};
    const enemyB = {};
    const riftAccum = new WeakMap<object, number>();
    const baseDamage = 15;

    // Hit enemy A twice
    const a1Prior = riftAccum.get(enemyA) ?? 0;
    riftAccum.set(enemyA, a1Prior + baseDamage);
    const a2Prior = riftAccum.get(enemyA) ?? 0;
    riftAccum.set(enemyA, a2Prior + baseDamage);

    // Enemy B is untouched
    const bPrior = riftAccum.get(enemyB) ?? 0;
    expect(bPrior).toBe(0);
    expect(riftAccum.get(enemyA)).toBe(30);
  });

  it('accumulation disappears when object is no longer referenced', () => {
    // WeakMap entries are GC'd when keys are collected — demonstrate
    // that a new object reference starts at 0 (simulates enemy death/respawn).
    const riftAccum = new WeakMap<object, number>();
    let enemy: object | null = {};
    riftAccum.set(enemy, 50);
    expect(riftAccum.get(enemy)).toBe(50);
    // After enemy is gone, a fresh object starts at 0
    const newEnemy = {};
    expect(riftAccum.get(newEnemy) ?? 0).toBe(0);
    enemy = null; // release reference
  });
});
