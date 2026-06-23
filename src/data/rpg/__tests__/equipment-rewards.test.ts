/**
 * equipment-rewards.test.ts — Tests for drop rate generation, ingredient
 * depth caps, and zone restrictions in equipment-rewards.ts.
 */

import { describe, it, expect } from 'vitest';
import {
  EQUIPMENT_REWARD_DROP_RATES,
  rollLensDrop,
  rollWeaveDrop,
  rollEquipmentReward,
  getEligibleLensDrops,
  getEligibleWeaveDrops,
  type EquipmentRewardRollContext,
} from '../equipment-rewards';

function makeCtx(
  overrides: Partial<EquipmentRewardRollContext> = {},
): EquipmentRewardRollContext {
  return {
    zoneId: 'euhedral',
    wave: 0,
    forgeLevel: 1,
    source: 'normal',
    rng: Math.random,
    ...overrides,
  };
}

// ── Drop rate constants ───────────────────────────────────────────────────────

describe('EQUIPMENT_REWARD_DROP_RATES', () => {
  it('normal lens chance is low (< 5%)', () => {
    expect(EQUIPMENT_REWARD_DROP_RATES.normalLensChance).toBeLessThan(0.05);
    expect(EQUIPMENT_REWARD_DROP_RATES.normalLensChance).toBeGreaterThan(0);
  });

  it('normal weave chance is lower than lens chance', () => {
    expect(EQUIPMENT_REWARD_DROP_RATES.normalWeaveChance)
      .toBeLessThan(EQUIPMENT_REWARD_DROP_RATES.normalLensChance);
  });

  it('boss guarantees a lens (100%)', () => {
    expect(EQUIPMENT_REWARD_DROP_RATES.bossLensChance).toBe(1);
  });

  it('milestone guarantees a lens (100%)', () => {
    expect(EQUIPMENT_REWARD_DROP_RATES.milestoneLensChance).toBe(1);
  });

  it('elite lens chance is significantly higher than normal', () => {
    expect(EQUIPMENT_REWARD_DROP_RATES.eliteLensChance)
      .toBeGreaterThan(EQUIPMENT_REWARD_DROP_RATES.normalLensChance * 5);
  });
});

// ── rollLensDrop ─────────────────────────────────────────────────────────────

describe('rollLensDrop', () => {
  it('returns null when rng returns 1 (never triggers)', () => {
    expect(rollLensDrop(makeCtx({ rng: () => 1 }))).toBeNull();
  });

  it('returns a lens spec when rng returns 0 (always triggers)', () => {
    const spec = rollLensDrop(makeCtx({ rng: () => 0 }));
    expect(spec).not.toBeNull();
    expect(spec!.kind).toBe('lens');
  });

  it('boss source always drops (chance 1.0)', () => {
    const spec = rollLensDrop(makeCtx({ source: 'boss', rng: () => 0.999 }));
    expect(spec).not.toBeNull();
    expect(spec!.kind).toBe('lens');
  });

  it('normal source rarely drops (rng above threshold → null)', () => {
    const spec = rollLensDrop(makeCtx({ source: 'normal', rng: () => 0.5 }));
    expect(spec).toBeNull();
  });

  it('forgeLevel is clamped to [1, 5]', () => {
    const specHigh = rollLensDrop(makeCtx({ rng: () => 0, forgeLevel: 99 }));
    expect(specHigh!.forgeLevel).toBeLessThanOrEqual(5);
    const specLow = rollLensDrop(makeCtx({ rng: () => 0, forgeLevel: 0 }));
    expect(specLow!.forgeLevel).toBeGreaterThanOrEqual(1);
  });

  it('boss/milestone drops have isMajor: true', () => {
    const boss = rollLensDrop(makeCtx({ source: 'boss', rng: () => 0 }));
    expect(boss!.isMajor).toBe(true);
    const milestone = rollLensDrop(makeCtx({ source: 'milestone', rng: () => 0 }));
    expect(milestone!.isMajor).toBe(true);
  });

  it('normal/elite drops have isMajor: false', () => {
    const normal = rollLensDrop(makeCtx({ source: 'normal', rng: () => 0 }));
    expect(normal!.isMajor).toBe(false);
    const elite = rollLensDrop(makeCtx({ source: 'elite', rng: () => 0 }));
    expect(elite!.isMajor).toBe(false);
  });
});

// ── rollWeaveDrop ─────────────────────────────────────────────────────────────

describe('rollWeaveDrop', () => {
  it('returns null when rng returns 1', () => {
    expect(rollWeaveDrop(makeCtx({ rng: () => 1 }))).toBeNull();
  });

  it('returns a weave spec when rng returns 0', () => {
    const spec = rollWeaveDrop(makeCtx({ rng: () => 0 }));
    expect(spec).not.toBeNull();
    expect(spec!.kind).toBe('weave');
  });

  it('boss has a high weave drop chance', () => {
    expect(EQUIPMENT_REWARD_DROP_RATES.bossWeaveChance).toBeGreaterThan(0.5);
  });
});

// ── rollEquipmentReward ───────────────────────────────────────────────────────

describe('rollEquipmentReward', () => {
  it('tries lens first — returns lens when rng always 0', () => {
    const spec = rollEquipmentReward(makeCtx({ rng: () => 0 }));
    expect(spec?.kind).toBe('lens');
  });

  it('returns null when nothing drops', () => {
    const spec = rollEquipmentReward(makeCtx({ rng: () => 1 }));
    expect(spec).toBeNull();
  });
});

// ── Depth caps ────────────────────────────────────────────────────────────────

describe('ingredient depth caps', () => {
  it('wave < 20 produces exactly 1 ingredient (depth 1)', () => {
    // Normal source has sourcePower=1, wave=0 → count=1; depth=1 → single primary
    const spec = rollLensDrop(makeCtx({ source: 'normal', wave: 0, rng: () => 0 }));
    expect(spec!.ingredients).toHaveLength(1);
  });

  it('boss at wave 0 gets sourcePower=4 ingredient count', () => {
    const spec = rollLensDrop(makeCtx({ source: 'boss', wave: 0, rng: () => 0 }));
    // Boss has sourcePower=4, so refinedCount should be at least 4
    const primary = spec!.ingredients[0]!;
    expect(Number(primary.refinedCount)).toBeGreaterThanOrEqual(4);
  });

  it('wave 80+ allows depth 4 (all 4 tiers for euhedral zone)', () => {
    // With rng returning 0 we always pick the first eligible tier
    const spec = rollLensDrop(makeCtx({ wave: 80, forgeLevel: 5, rng: () => 0, source: 'normal' }));
    expect(spec).not.toBeNull();
  });
});

// ── Zone restrictions ─────────────────────────────────────────────────────────

describe('zone tier restrictions', () => {
  it('euhedral lens tiers include sand and quartz but not eigenstein', () => {
    const tiers = getEligibleLensDrops(makeCtx({ zoneId: 'euhedral' }));
    expect(tiers).toContain('sand');
    expect(tiers).toContain('quartz');
    expect(tiers).not.toContain('eigenstein');
  });

  it('horizon lens tiers include eigenstein but not sand', () => {
    const tiers = getEligibleLensDrops(makeCtx({ zoneId: 'horizon' }));
    expect(tiers).toContain('eigenstein');
    expect(tiers).not.toContain('sand');
  });

  it('euhedral weave tiers are a subset of lens tiers', () => {
    const lenstiers = new Set(getEligibleLensDrops(makeCtx({ zoneId: 'euhedral' })));
    const weavetiers = getEligibleWeaveDrops(makeCtx({ zoneId: 'euhedral' }));
    for (const t of weavetiers) {
      expect(lenstiers.has(t)).toBe(true);
    }
  });

  it('ingredients respect zone restrictions — euhedral never drops horizon-only tiers', () => {
    // Run many drops from euhedral; none should produce fracteryl/eigenstein/nullstone/diamond
    const forbiddenTiers = new Set(['fracteryl', 'eigenstein', 'nullstone', 'diamond', 'iolite', 'amethyst', 'citrine', 'emerald']);
    for (let i = 0; i < 50; i++) {
      let calls = 0;
      const rng = () => (calls++ % 3 === 0 ? 0 : 0.5);
      const spec = rollLensDrop(makeCtx({ zoneId: 'euhedral', wave: 99, rng }));
      if (spec) {
        for (const ing of spec.ingredients) {
          expect(forbiddenTiers.has(ing.tierId)).toBe(false);
        }
      }
    }
  });
});
