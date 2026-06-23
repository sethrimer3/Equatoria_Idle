/**
 * inventory-sorting.test.ts — Tests for pure sort helpers in item-sort-helpers.ts.
 *
 * All tests are deterministic and do not depend on random number generation.
 */

import { describe, it, expect } from 'vitest';
import {
  getLensPowerScore, getLensRarityScore, getLensZoneScore, getLensNewestScore,
  getWeavePowerScore, getWeaveRarityScore, getWeaveZoneScore, getWeaveNewestScore,
  compareLens, compareWeave, type ItemSortMode,
} from '../item-sort-helpers';
import type { CraftedLensData, LensEffect } from '../lens-types';
import type { CraftedWeaveData, WeaveAffix, WeaveTierEffect } from '../weave-types';

// ─── Minimal fixture helpers ──────────────────────────────────────────────────

function makeLensEffect(overrides: Partial<LensEffect> = {}): LensEffect {
  return {
    tierId: 'ruby',
    effectTier: 1,
    key: 'ruby_t1',
    name: 'Burning',
    description: '',
    magnitude: 10,
    quality: 0.5,
    rarity: 'Common',
    isApplied: true,
    ...overrides,
  };
}

function makeLens(overrides: Partial<CraftedLensData> = {}): CraftedLensData {
  return {
    id: 'lens_1',
    type: 'lens',
    name: 'Test Lens',
    ingredients: [{ tierId: 'ruby', refinedCount: 5 }],
    totalWeightedMoteValue: 100,
    forgeCraftLevel: 1,
    effects: [makeLensEffect()],
    ...overrides,
  };
}

function makeAffix(overrides: Partial<WeaveAffix> = {}): WeaveAffix {
  return {
    affixId: 'ruby_loom_crit_chance',
    tierId: 'ruby',
    label: 'Loom Crit Chance',
    quality: 0.5,
    rarity: 'Common',
    value: 5,
    unit: '%',
    applied: true,
    ...overrides,
  };
}

function makeTierEffect(overrides: Partial<WeaveTierEffect> = {}): WeaveTierEffect {
  return {
    tierId: 'ruby',
    effectTier: 1,
    key: 'ruby_wt1',
    name: 'Molten Core',
    description: '',
    magnitude: 10,
    quality: 0.5,
    rarity: 'Common',
    isApplied: true,
    ...overrides,
  };
}

function makeWeave(overrides: Partial<CraftedWeaveData> = {}): CraftedWeaveData {
  return {
    id: 'weave_1',
    name: 'Test Weave',
    ingredients: [{ tierId: 'ruby', refinedCount: 5 }],
    totalWeightedMoteValue: 100,
    forgeCraftLevel: 1,
    affixes: [makeAffix()],
    tierEffects: [makeTierEffect()],
    ...overrides,
  };
}

// ─── Lens sort helpers ────────────────────────────────────────────────────────

describe('getLensPowerScore', () => {
  it('higher effect tier produces higher power score', () => {
    const t1 = makeLens({ effects: [makeLensEffect({ effectTier: 1 })] });
    const t3 = makeLens({ effects: [makeLensEffect({ effectTier: 3 })] });
    expect(getLensPowerScore(t3)).toBeGreaterThan(getLensPowerScore(t1));
  });

  it('higher rarity produces higher score among same-tier lenses', () => {
    const rare = makeLens({ effects: [makeLensEffect({ effectTier: 1, rarity: 'Rare' })] });
    const common = makeLens({ effects: [makeLensEffect({ effectTier: 1, rarity: 'Common' })] });
    expect(getLensPowerScore(rare)).toBeGreaterThan(getLensPowerScore(common));
  });

  it('more mote value produces marginally higher score (tie-break)', () => {
    const high = makeLens({ totalWeightedMoteValue: 1000 });
    const low = makeLens({ totalWeightedMoteValue: 1 });
    expect(getLensPowerScore(high)).toBeGreaterThan(getLensPowerScore(low));
  });

  it('empty effects → score is 0 + mote log', () => {
    const lens = makeLens({ effects: [], totalWeightedMoteValue: 0 });
    expect(getLensPowerScore(lens)).toBe(0);
  });
});

describe('getLensRarityScore', () => {
  it('Mythic > Legendary > Common', () => {
    const mythic = makeLens({ effects: [makeLensEffect({ rarity: 'Mythic' })] });
    const legendary = makeLens({ effects: [makeLensEffect({ rarity: 'Legendary' })] });
    const common = makeLens({ effects: [makeLensEffect({ rarity: 'Common' })] });
    expect(getLensRarityScore(mythic)).toBeGreaterThan(getLensRarityScore(legendary));
    expect(getLensRarityScore(legendary)).toBeGreaterThan(getLensRarityScore(common));
  });
});

describe('getLensZoneScore', () => {
  it('known zone scores higher than unknown zone', () => {
    const withZone = makeLens({ sourceZone: 'euhedral' });
    const noZone = makeLens({});
    expect(getLensZoneScore(withZone)).toBeGreaterThan(getLensZoneScore(noZone));
  });

  it('euhedral sorts before horizon in zone sort', () => {
    const euhedral = makeLens({ sourceZone: 'euhedral' });
    const horizon = makeLens({ sourceZone: 'horizon' });
    // euhedral zone order = 1, horizon = 5; euhedral should have higher score
    expect(getLensZoneScore(euhedral)).toBeGreaterThan(getLensZoneScore(horizon));
  });
});

describe('getLensNewestScore', () => {
  it('higher ID number → higher score', () => {
    const older = makeLens({ id: 'loot_lens_normal_1' });
    const newer = makeLens({ id: 'loot_lens_normal_10' });
    expect(getLensNewestScore(newer)).toBeGreaterThan(getLensNewestScore(older));
  });

  it('no numeric suffix → 0', () => {
    const noSuffix = makeLens({ id: 'custom_lens' });
    expect(getLensNewestScore(noSuffix)).toBe(0);
  });
});

// ─── compareLens ─────────────────────────────────────────────────────────────

describe('compareLens', () => {
  it('power mode: higher-tier lens sorts before lower-tier', () => {
    const strong = makeLens({ effects: [makeLensEffect({ effectTier: 3, rarity: 'Epic' })] });
    const weak = makeLens({ effects: [makeLensEffect({ effectTier: 1, rarity: 'Common' })] });
    expect(compareLens(strong, weak, 'power')).toBeLessThan(0); // strong first
  });

  it('rarity mode: Legendary sorts before Common', () => {
    const legendary = makeLens({ name: 'Aaa', effects: [makeLensEffect({ rarity: 'Legendary' })] });
    const common = makeLens({ name: 'Zzz', effects: [makeLensEffect({ rarity: 'Common' })] });
    expect(compareLens(legendary, common, 'rarity')).toBeLessThan(0);
  });

  it('zone mode: known zone sorts before unknown', () => {
    const withZone = makeLens({ name: 'Aaa', sourceZone: 'euhedral' });
    const noZone = makeLens({ name: 'Zzz' });
    expect(compareLens(withZone, noZone, 'zone')).toBeLessThan(0);
  });

  it('newest mode: higher ID sorts first', () => {
    const older = makeLens({ id: 'loot_lens_1', name: 'A' });
    const newer = makeLens({ id: 'loot_lens_5', name: 'B' });
    expect(compareLens(newer, older, 'newest')).toBeLessThan(0);
  });

  it('stable tie-break: equal scores sort alphabetically by name', () => {
    const a = makeLens({ id: 'loot_lens_1', name: 'Alpha Lens' });
    const b = makeLens({ id: 'loot_lens_2', name: 'Zeta Lens' });
    // Same effects and mote value → tie-break on name
    expect(compareLens(a, b, 'power')).toBeLessThan(0); // Alpha before Zeta
  });
});

// ─── Weave sort helpers ───────────────────────────────────────────────────────

describe('getWeavePowerScore', () => {
  it('higher effect tier → higher power score', () => {
    const t1 = makeWeave({ tierEffects: [makeTierEffect({ effectTier: 1 })] });
    const t3 = makeWeave({ tierEffects: [makeTierEffect({ effectTier: 3 })] });
    expect(getWeavePowerScore(t3)).toBeGreaterThan(getWeavePowerScore(t1));
  });
});

describe('getWeaveRarityScore', () => {
  it('affix rarity contributes to score', () => {
    const epic = makeWeave({ affixes: [makeAffix({ rarity: 'Epic' })] });
    const common = makeWeave({ affixes: [makeAffix({ rarity: 'Common' })] });
    expect(getWeaveRarityScore(epic)).toBeGreaterThan(getWeaveRarityScore(common));
  });

  it('tier effect rarity also contributes', () => {
    const highTier = makeWeave({
      affixes: [makeAffix({ rarity: 'Common' })],
      tierEffects: [makeTierEffect({ rarity: 'Legendary' })],
    });
    const low = makeWeave({
      affixes: [makeAffix({ rarity: 'Common' })],
      tierEffects: [makeTierEffect({ rarity: 'Common' })],
    });
    expect(getWeaveRarityScore(highTier)).toBeGreaterThan(getWeaveRarityScore(low));
  });
});

describe('getWeaveZoneScore', () => {
  it('weave with known zone sorts higher than one without', () => {
    const withZone = makeWeave({ sourceZone: 'verdure' });
    const noZone = makeWeave({});
    expect(getWeaveZoneScore(withZone)).toBeGreaterThan(getWeaveZoneScore(noZone));
  });
});

describe('getWeaveNewestScore', () => {
  it('higher numeric ID → higher score', () => {
    const older = makeWeave({ id: 'loot_weave_2' });
    const newer = makeWeave({ id: 'loot_weave_20' });
    expect(getWeaveNewestScore(newer)).toBeGreaterThan(getWeaveNewestScore(older));
  });
});

// ─── compareWeave ─────────────────────────────────────────────────────────────

describe('compareWeave', () => {
  it('equipped weave sorts before unequipped regardless of mode', () => {
    const equipped = makeWeave({ id: 'weave_e', name: 'Zzz' });
    const unequipped = makeWeave({ id: 'weave_u', name: 'Aaa' });
    const equippedSet = new Set(['weave_e']);
    // Even with 'newest' mode where unequipped would win, equipped comes first
    expect(compareWeave(equipped, unequipped, 'newest', equippedSet)).toBeLessThan(0);
  });

  it('power mode: stronger weave sorts first', () => {
    const strong = makeWeave({ tierEffects: [makeTierEffect({ effectTier: 3, rarity: 'Epic' })] });
    const weak = makeWeave({ tierEffects: [makeTierEffect({ effectTier: 1, rarity: 'Common' })] });
    expect(compareWeave(strong, weak, 'power')).toBeLessThan(0);
  });

  it('sort is stable with same-score items (name tie-break)', () => {
    const a = makeWeave({ id: 'w1', name: 'Alpha Weave' });
    const b = makeWeave({ id: 'w2', name: 'Beta Weave' });
    expect(compareWeave(a, b, 'rarity')).toBeLessThan(0); // Alpha before Beta
  });

  it('does not mutate item data', () => {
    const w1 = makeWeave({ id: 'w1', totalWeightedMoteValue: 100 });
    const w2 = makeWeave({ id: 'w2', totalWeightedMoteValue: 200 });
    const before1 = w1.totalWeightedMoteValue;
    const before2 = w2.totalWeightedMoteValue;
    compareWeave(w1, w2, 'power');
    expect(w1.totalWeightedMoteValue).toBe(before1);
    expect(w2.totalWeightedMoteValue).toBe(before2);
  });
});

// ─── All sort modes are stable ────────────────────────────────────────────────

describe('sort stability across all modes', () => {
  const modes: ItemSortMode[] = ['power', 'rarity', 'zone', 'newest'];

  it('lens compareLens returns 0 for identical items', () => {
    const lens = makeLens({ id: 'x', name: 'Same Lens' });
    for (const mode of modes) {
      expect(compareLens(lens, lens, mode)).toBe(0);
    }
  });

  it('weave compareWeave returns 0 for identical items', () => {
    const weave = makeWeave({ id: 'x', name: 'Same Weave' });
    for (const mode of modes) {
      expect(compareWeave(weave, weave, mode)).toBe(0);
    }
  });
});
