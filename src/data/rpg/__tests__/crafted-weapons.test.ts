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
