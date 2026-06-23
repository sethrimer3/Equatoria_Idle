/**
 * zone-weighted-drops.test.ts — Tests for zone-biased weighted tier picking
 * and boss quality floor on equipment rewards.
 */

import { describe, it, expect } from 'vitest';
import { rollLensDrop, rollWeaveDrop, type EquipmentRewardRollContext } from '../equipment-rewards';
import { createCraftedLens } from '../lens-rolling';
import { createCraftedWeave } from '../weave-rolling';

function makeCtx(overrides: Partial<EquipmentRewardRollContext> = {}): EquipmentRewardRollContext {
  return {
    zoneId: 'euhedral',
    wave: 80,
    forgeLevel: 5,
    source: 'normal',
    rng: Math.random,
    ...overrides,
  };
}

// ─── Zone-weighted tier bias ──────────────────────────────────────────────────

describe('zone-weighted lens tier drops', () => {
  it('euhedral: sand drops more often than sapphire over many rolls', () => {
    const tierCounts: Record<string, number> = {};
    let calls = 0;
    // Use seeded rng that cycles through values to get a representative sample
    const rng = () => {
      const vals = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9];
      return vals[calls++ % vals.length]!;
    };
    for (let i = 0; i < 200; i++) {
      const spec = rollLensDrop(makeCtx({ zoneId: 'euhedral', wave: 99, forgeLevel: 5, rng }));
      if (!spec) continue;
      for (const ing of spec.ingredients) {
        tierCounts[ing.tierId] = (tierCounts[ing.tierId] ?? 0) + 1;
      }
    }
    // Sand (weight 50) should appear much more than sapphire (weight 5)
    const sandCount = tierCounts['sand'] ?? 0;
    const sapphireCount = tierCounts['sapphire'] ?? 0;
    expect(sandCount).toBeGreaterThan(sapphireCount);
  });

  it('horizon: eigenstein/fracteryl drops are possible at high wave', () => {
    const tiers = new Set<string>();
    let calls = 0;
    const rng = () => {
      const vals = [0.0, 0.3, 0.6, 0.9, 0.15, 0.45, 0.75];
      return vals[calls++ % vals.length]!;
    };
    for (let i = 0; i < 100; i++) {
      const spec = rollLensDrop(makeCtx({ zoneId: 'horizon', wave: 99, forgeLevel: 5, rng }));
      if (!spec) continue;
      for (const ing of spec.ingredients) tiers.add(ing.tierId);
    }
    // Horizon zone should be able to produce eigenstein or fracteryl
    expect(tiers.has('eigenstein') || tiers.has('fracteryl') || tiers.has('nullstone')).toBe(true);
  });

  it('euhedral: only euhedral zone tiers appear in drops', () => {
    const forbiddenTiers = new Set(['fracteryl', 'eigenstein', 'amethyst', 'emerald', 'citrine', 'iolite']);
    let calls = 0;
    const rng = () => {
      const vals = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5];
      return vals[calls++ % vals.length]!;
    };
    for (let i = 0; i < 100; i++) {
      const spec = rollLensDrop(makeCtx({ zoneId: 'euhedral', wave: 99, forgeLevel: 5, rng }));
      if (!spec) continue;
      for (const ing of spec.ingredients) {
        expect(forbiddenTiers.has(ing.tierId)).toBe(false);
      }
    }
  });

  it('verdure weave drops emerald tier items', () => {
    const tiers = new Set<string>();
    let calls = 0;
    const rng = () => {
      const vals = [0.0, 0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
      return vals[calls++ % vals.length]!;
    };
    for (let i = 0; i < 100; i++) {
      const spec = rollWeaveDrop(makeCtx({ zoneId: 'verdure', wave: 60, forgeLevel: 5, rng }));
      if (!spec) continue;
      for (const ing of spec.ingredients) tiers.add(ing.tierId);
    }
    expect(tiers.has('emerald')).toBe(true);
  });
});

// ─── Boss quality floor ───────────────────────────────────────────────────────

describe('boss quality floor', () => {
  it('boss drop specs have qualityFloor of 0.45', () => {
    let calls = 0;
    const rng = () => {
      const vals = [0.0, 0.0, 0.0];
      return vals[calls++ % vals.length]!;
    };
    const spec = rollLensDrop(makeCtx({ source: 'boss', rng }));
    expect(spec).not.toBeNull();
    expect(spec!.qualityFloor).toBe(0.45);
  });

  it('normal drop specs have qualityFloor of 0', () => {
    const spec = rollLensDrop(makeCtx({ source: 'normal', rng: () => 0 }));
    expect(spec).not.toBeNull();
    expect(spec!.qualityFloor).toBe(0);
  });

  it('createCraftedLens with qualityFloor=0.45 produces no Common-rarity effects', () => {
    const ingredients = [{ tierId: 'ruby' as const, refinedCount: 10 }];
    // Use a deterministic rng that would produce low quality without the floor
    const lowRng = () => 0.01; // would give quality ~0.01 without floor → Common
    const lens = createCraftedLens('test_boss', ingredients, 5, lowRng, { qualityFloor: 0.45 });
    for (const effect of lens.effects) {
      expect(effect.rarity).not.toBe('Common');
    }
  });

  it('createCraftedWeave with qualityFloor=0.45 produces no Common-rarity effects', () => {
    const ingredients = [{ tierId: 'emerald' as const, refinedCount: 10 }];
    const lowRng = () => 0.01;
    const weave = createCraftedWeave('test_boss_weave', ingredients, 5, lowRng, { qualityFloor: 0.45 });
    for (const effect of weave.tierEffects) {
      expect(effect.rarity).not.toBe('Common');
    }
  });
});

// ─── Source metadata ──────────────────────────────────────────────────────────

describe('source metadata on reward specs', () => {
  it('rollLensDrop includes zoneId and wave from context', () => {
    const spec = rollLensDrop(makeCtx({
      zoneId: 'verdure',
      wave: 55,
      source: 'elite',
      rng: () => 0,
    }));
    expect(spec).not.toBeNull();
    expect(spec!.zoneId).toBe('verdure');
    expect(spec!.wave).toBe(55);
  });

  it('rollWeaveDrop includes zoneId and wave from context', () => {
    const spec = rollWeaveDrop(makeCtx({
      zoneId: 'impetus',
      wave: 30,
      source: 'boss',
      rng: () => 0,
    }));
    expect(spec).not.toBeNull();
    expect(spec!.zoneId).toBe('impetus');
    expect(spec!.wave).toBe(30);
  });
});

// ─── Source metadata on created items ────────────────────────────────────────

describe('source metadata stored on created items', () => {
  it('lens created with sourceZone stores it correctly', () => {
    const lens = createCraftedLens(
      'test_lens', [{ tierId: 'sapphire', refinedCount: 5 }], 3,
      undefined, { sourceZone: 'caustics', sourceWave: 42, sourceType: 'elite' },
    );
    expect(lens.sourceZone).toBe('caustics');
    expect(lens.sourceWave).toBe(42);
    expect(lens.sourceType).toBe('elite');
  });

  it('lens created without sourceZone has undefined metadata (migration safe)', () => {
    const lens = createCraftedLens('test_lens2', [{ tierId: 'sand', refinedCount: 3 }], 1);
    expect(lens.sourceZone).toBeUndefined();
    expect(lens.sourceWave).toBeUndefined();
    expect(lens.sourceType).toBeUndefined();
  });

  it('weave created with sourceZone stores it correctly', () => {
    const weave = createCraftedWeave(
      'test_weave', [{ tierId: 'emerald', refinedCount: 5 }], 3,
      undefined, { sourceZone: 'verdure', sourceWave: 60, sourceType: 'boss' },
    );
    expect(weave.sourceZone).toBe('verdure');
    expect(weave.sourceWave).toBe(60);
    expect(weave.sourceType).toBe('boss');
  });

  it('boss lens gets flavor name with "Grand" prefix (no zone)', () => {
    const lens = createCraftedLens(
      'test_boss', [{ tierId: 'ruby', refinedCount: 5 }], 3,
      undefined, { sourceType: 'boss' },
    );
    expect(lens.name).toContain('Grand');
  });

  it('boss lens with zone gets "Apex" prefix', () => {
    const lens = createCraftedLens(
      'test_boss_zone', [{ tierId: 'ruby', refinedCount: 5 }], 3,
      undefined, { sourceType: 'boss', sourceZone: 'caustics' },
    );
    expect(lens.name).toBe('Apex Ruby Lens');
  });
});
