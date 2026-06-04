/**
 * lens-rolling.test.ts — Tests for the Lens STUB effect system.
 *
 * Covers:
 *   - Forge-level mote-type cap
 *   - Forge-level unlock chances
 *   - T1 always rolls; T2/T3 probabilistic with deterministic rng
 *   - T3 never rolls at forge level 1 (tier3Chance = 0)
 *   - All effects have isApplied: false and name includes "STUB"
 *   - Rarity classification at thresholds
 *   - Save/load round-trip (lenses in inventory and attached to weapons)
 *   - Old saves without lenses load safely
 *   - Weapon and weave crafting still work
 */

import { describe, it, expect } from 'vitest';
import {
  getLensRarity,
  getLensEffectUnlockChances,
  getLensMaxMoteTypes,
  rollLensEffects,
  createCraftedLens,
  computeLensMagnitude,
} from '../lens-rolling';
import { createGameState } from '../../../sim/game-state';
import { craftLens, attachLensToWeapon, craftWeapon, craftWeave } from '../../../sim/game-state';
import { createRpgSimState } from '../../../sim/rpg/rpg-state';
import { deserializeGameState } from '../../../settings/save-deserialize';
import { serializeGameState } from '../../../settings/save-serialize';

// ─── Forge-level mote-type cap ────────────────────────────────────

describe('getLensMaxMoteTypes', () => {
  it('forge level 1 → max 1 mote type', () => expect(getLensMaxMoteTypes(1)).toBe(1));
  it('forge level 2 → max 1 mote type', () => expect(getLensMaxMoteTypes(2)).toBe(1));
  it('forge level 3 → max 2 mote types', () => expect(getLensMaxMoteTypes(3)).toBe(2));
  it('forge level 4 → max 2 mote types', () => expect(getLensMaxMoteTypes(4)).toBe(2));
  it('forge level 5 → max 3 mote types', () => expect(getLensMaxMoteTypes(5)).toBe(3));
});

// ─── Forge-level unlock chances ───────────────────────────────────

describe('getLensEffectUnlockChances', () => {
  it('forge level 1: tier2=0.08, tier3=0.00', () => {
    expect(getLensEffectUnlockChances(1)).toEqual({ tier2Chance: 0.08, tier3Chance: 0.00 });
  });
  it('forge level 2: tier2=0.14, tier3=0.01', () => {
    expect(getLensEffectUnlockChances(2)).toEqual({ tier2Chance: 0.14, tier3Chance: 0.01 });
  });
  it('forge level 3: tier2=0.24, tier3=0.03', () => {
    expect(getLensEffectUnlockChances(3)).toEqual({ tier2Chance: 0.24, tier3Chance: 0.03 });
  });
  it('forge level 4: tier2=0.34, tier3=0.06', () => {
    expect(getLensEffectUnlockChances(4)).toEqual({ tier2Chance: 0.34, tier3Chance: 0.06 });
  });
  it('forge level 5: tier2=0.48, tier3=0.12', () => {
    expect(getLensEffectUnlockChances(5)).toEqual({ tier2Chance: 0.48, tier3Chance: 0.12 });
  });
});

// ─── T1 always rolls ─────────────────────────────────────────────

describe('rollLensEffects — T1 always generated', () => {
  // rng for quality uses triangularFromU(0,1,0.6,u) where u=1 → quality=1
  // 1 ≥ any chance → no T2/T3
  const neverT2Rng = () => 1;

  it('single ingredient tier → exactly 1 T1 effect with never-trigger rng', () => {
    const effects = rollLensEffects([{ tierId: 'ruby', refinedCount: 5 }], 1, neverT2Rng);
    const t1s = effects.filter(e => e.effectTier === 1);
    expect(t1s).toHaveLength(1);
    expect(t1s[0]!.tierId).toBe('ruby');
  });

  it('T1 effect tier is 1', () => {
    const effects = rollLensEffects([{ tierId: 'sand', refinedCount: 3 }], 1, neverT2Rng);
    expect(effects[0]!.effectTier).toBe(1);
  });

  it('two ingredient tiers → two T1 effects', () => {
    const effects = rollLensEffects(
      [{ tierId: 'sand', refinedCount: 3 }, { tierId: 'quartz', refinedCount: 2 }],
      3,
      neverT2Rng,
    );
    const t1s = effects.filter(e => e.effectTier === 1);
    expect(t1s).toHaveLength(2);
  });

  it('sunstone produces no effects (no naming entry)', () => {
    const effects = rollLensEffects([{ tierId: 'sunstone', refinedCount: 5 }], 1, neverT2Rng);
    expect(effects).toHaveLength(0);
  });
});

// ─── T2 probabilistic with deterministic rng ─────────────────────

describe('rollLensEffects — T2 probabilistic', () => {
  it('T2 rolls when rng returns value below tier2Chance', () => {
    // forge level 1, tier2Chance=0.08 — use rng that returns 0.07 for chance rolls, 0.5 for quality
    let callCount = 0;
    const rng = () => {
      callCount++;
      // Odd calls = quality roll (triangularFromU); even calls = chance roll
      // We need the T2 chance roll to be < 0.08, so return 0.07 on even calls
      return callCount % 2 === 0 ? 0.07 : 0.5;
    };
    const effects = rollLensEffects([{ tierId: 'ruby', refinedCount: 5 }], 1, rng);
    const t2s = effects.filter(e => e.effectTier === 2);
    expect(t2s).toHaveLength(1);
    expect(t2s[0]!.tierId).toBe('ruby');
    expect(t2s[0]!.effectTier).toBe(2);
  });

  it('T2 does not roll when rng returns value at or above tier2Chance', () => {
    // tier2Chance at forge level 1 = 0.08; return 0.08 → not < 0.08 → no T2
    let callCount = 0;
    const rng = () => {
      callCount++;
      return callCount % 2 === 0 ? 0.5 : 0.5; // 0.5 ≥ 0.08, no T2; quality = 0.5 → some value
    };
    const effects = rollLensEffects([{ tierId: 'ruby', refinedCount: 5 }], 1, rng);
    const t2s = effects.filter(e => e.effectTier === 2);
    expect(t2s).toHaveLength(0);
  });
});

// ─── T3 never at forge level 1 ───────────────────────────────────

describe('rollLensEffects — T3 never at forge level 1', () => {
  it('no T3 effects at forge level 1 even with rng=0 (tier3Chance=0)', () => {
    // rng=0 means every chance roll passes — but tier3Chance=0 means 0 < 0 is false
    const effects = rollLensEffects([{ tierId: 'ruby', refinedCount: 5 }], 1, () => 0);
    const t3s = effects.filter(e => e.effectTier === 3);
    expect(t3s).toHaveLength(0);
  });
});

// ─── T3 probabilistic at higher forge levels ─────────────────────

describe('rollLensEffects — T3 at forge level 5', () => {
  it('T3 rolls at forge level 5 when rng returns value below tier3Chance (0.12)', () => {
    let callCount = 0;
    // Call order per tier: quality(T1), chanceT2, quality(T2), chanceT3, quality(T3)
    // We want T2 to also roll so rng[1] < 0.48; T3 to roll so rng[3] < 0.12
    const values = [0.5, 0.1, 0.5, 0.05, 0.5]; // indices 1 and 3 trigger T2 and T3
    const rng = () => values[callCount++] ?? 0.5;
    const effects = rollLensEffects([{ tierId: 'sapphire', refinedCount: 5 }], 5, rng);
    const t3s = effects.filter(e => e.effectTier === 3);
    expect(t3s).toHaveLength(1);
    expect(t3s[0]!.effectTier).toBe(3);
  });
});

// ─── isApplied always false ───────────────────────────────────────

describe('rollLensEffects — isApplied always false', () => {
  it('all effects have isApplied: false', () => {
    const effects = rollLensEffects(
      [{ tierId: 'ruby', refinedCount: 5 }, { tierId: 'sand', refinedCount: 3 }],
      5,
      () => 0, // triggers T2 and T3
    );
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) {
      expect(e.isApplied).toBe(false);
    }
  });
});

// ─── Effect names include "STUB" ──────────────────────────────────

describe('rollLensEffects — names include STUB', () => {
  it('every effect name contains "STUB"', () => {
    const effects = rollLensEffects(
      [{ tierId: 'ruby', refinedCount: 5 }, { tierId: 'sapphire', refinedCount: 3 }],
      5,
      () => 0,
    );
    expect(effects.length).toBeGreaterThan(0);
    for (const e of effects) {
      expect(e.name).toContain('STUB');
    }
  });

  it('description says STUB', () => {
    const effects = rollLensEffects([{ tierId: 'sand', refinedCount: 5 }], 1, () => 1);
    expect(effects[0]!.description).toContain('STUB');
  });
});

// ─── Effect key format ────────────────────────────────────────────

describe('rollLensEffects — key format', () => {
  it('T1 key is "<tierId>_t1"', () => {
    const effects = rollLensEffects([{ tierId: 'ruby', refinedCount: 5 }], 1, () => 1);
    expect(effects[0]!.key).toBe('ruby_t1');
  });
});

// ─── Rarity classification ────────────────────────────────────────

describe('getLensRarity', () => {
  it('q=0.00 → Common',    () => expect(getLensRarity(0.00)).toBe('Common'));
  it('q=0.39 → Common',    () => expect(getLensRarity(0.39)).toBe('Common'));
  it('q=0.40 → Uncommon',  () => expect(getLensRarity(0.40)).toBe('Uncommon'));
  it('q=0.64 → Uncommon',  () => expect(getLensRarity(0.64)).toBe('Uncommon'));
  it('q=0.65 → Rare',      () => expect(getLensRarity(0.65)).toBe('Rare'));
  it('q=0.81 → Rare',      () => expect(getLensRarity(0.81)).toBe('Rare'));
  it('q=0.82 → Epic',      () => expect(getLensRarity(0.82)).toBe('Epic'));
  it('q=0.93 → Epic',      () => expect(getLensRarity(0.93)).toBe('Epic'));
  it('q=0.94 → Legendary', () => expect(getLensRarity(0.94)).toBe('Legendary'));
  it('q=0.98 → Legendary', () => expect(getLensRarity(0.98)).toBe('Legendary'));
  it('q=0.99 → Mythic',    () => expect(getLensRarity(0.99)).toBe('Mythic'));
  it('q=1.00 → Mythic',    () => expect(getLensRarity(1.00)).toBe('Mythic'));
});

// ─── Magnitude scaling ────────────────────────────────────────────

describe('computeLensMagnitude', () => {
  it('increases with mote investment', () => {
    const m1 = computeLensMagnitude(100, 1);
    const m2 = computeLensMagnitude(10000, 1);
    expect(m2).toBeGreaterThan(m1);
  });
  it('T2 base > T1 base at same investment', () => {
    expect(computeLensMagnitude(1000, 2)).toBeGreaterThan(computeLensMagnitude(1000, 1));
  });
  it('T3 base > T2 base at same investment', () => {
    expect(computeLensMagnitude(1000, 3)).toBeGreaterThan(computeLensMagnitude(1000, 2));
  });
});

// ─── createCraftedLens ────────────────────────────────────────────

describe('createCraftedLens', () => {
  it('type field is "lens"', () => {
    const lens = createCraftedLens('l1', [{ tierId: 'ruby', refinedCount: 5 }], 1, () => 1);
    expect(lens.type).toBe('lens');
  });

  it('always has at least one T1 effect per ingredient tier', () => {
    const lens = createCraftedLens('l2', [{ tierId: 'ruby', refinedCount: 5 }], 1, () => 1);
    const t1s = lens.effects.filter(e => e.effectTier === 1);
    expect(t1s).toHaveLength(1);
  });

  it('duplicated tier entries are merged before rolling', () => {
    const lens = createCraftedLens('l3', [
      { tierId: 'sand', refinedCount: 3 },
      { tierId: 'sand', refinedCount: 2 },
    ], 1, () => 1);
    expect(lens.effects.filter(e => e.tierId === 'sand' && e.effectTier === 1)).toHaveLength(1);
  });
});

// ─── craftLens game action ────────────────────────────────────────

describe('craftLens', () => {
  it('lens crafting creates a lens, not a weapon', () => {
    const state = createGameState();
    state.rpg.refinedCrystalsByTierId.set('sand', 10);
    craftLens(state, [{ tierId: 'sand', refinedCount: 5 }]);
    expect(state.rpg.craftedWeapons).toHaveLength(0);
    expect(state.rpg.craftedLenses).toHaveLength(1);
    expect(state.rpg.craftedLenses[0]!.type).toBe('lens');
  });

  it('crafted lens has at least one T1 STUB effect', () => {
    const state = createGameState();
    state.rpg.refinedCrystalsByTierId.set('ruby', 10);
    craftLens(state, [{ tierId: 'ruby', refinedCount: 5 }]);
    const t1s = state.rpg.craftedLenses[0]!.effects.filter(e => e.effectTier === 1);
    expect(t1s).toHaveLength(1);
    expect(t1s[0]!.name).toContain('STUB');
    expect(t1s[0]!.isApplied).toBe(false);
  });
});

// ─── Weapon crafting still works ─────────────────────────────────

describe('weapon crafting still works', () => {
  it('craftWeapon creates a weapon without disrupting lens state', () => {
    const state = createGameState();
    craftWeapon(state, [{ tierId: 'sand', refinedCount: 5 }, { tierId: 'quartz', refinedCount: 5 }], true);
    expect(state.rpg.craftedWeapons).toHaveLength(1);
    expect(state.rpg.craftedWeapons[0]!.attachedLens).toBeUndefined();
  });
});

// ─── Weave crafting still works ───────────────────────────────────

describe('weave crafting still works', () => {
  it('craftWeave creates a weave', () => {
    const state = createGameState();
    craftWeave(state, [{ tierId: 'citrine', refinedCount: 5 }], true);
    expect(state.rpg.craftedWeaves).toHaveLength(1);
  });
});

// ─── Save/load round-trip ─────────────────────────────────────────

describe('save/load round-trip', () => {
  it('lens inventory persists through save/load', () => {
    const state = createGameState();
    craftLens(state, [{ tierId: 'ruby', refinedCount: 5 }], true);
    const originalEffects = state.rpg.craftedLenses[0]!.effects;

    const save = serializeGameState(state);
    const restored = deserializeGameState(save);

    expect(restored.rpg.craftedLenses).toHaveLength(1);
    const restoredLens = restored.rpg.craftedLenses[0]!;
    expect(restoredLens.type).toBe('lens');
    expect(restoredLens.effects).toHaveLength(originalEffects.length);
    expect(restoredLens.effects[0]!.effectTier).toBe(originalEffects[0]!.effectTier);
    expect(restoredLens.effects[0]!.name).toBe(originalEffects[0]!.name);
    expect(restoredLens.effects[0]!.isApplied).toBe(false);
  });

  it('attached lens on weapon persists through save/load', () => {
    const state = createGameState();
    craftWeapon(state, [{ tierId: 'sand', refinedCount: 5 }, { tierId: 'quartz', refinedCount: 5 }], true);
    craftLens(state, [{ tierId: 'ruby', refinedCount: 5 }], true);
    attachLensToWeapon(state, state.rpg.craftedLenses[0]!.id, state.rpg.craftedWeapons[0]!.id);

    const save = serializeGameState(state);
    const restored = deserializeGameState(save);

    const weapon = restored.rpg.craftedWeapons[0]!;
    expect(weapon.attachedLens).toBeDefined();
    expect(weapon.attachedLens!.effects[0]!.isApplied).toBe(false);
    expect(weapon.attachedLens!.effects[0]!.name).toContain('STUB');
    // Inventory empty after attach
    expect(restored.rpg.craftedLenses).toHaveLength(0);
  });

  it('old save without lens fields loads safely', () => {
    const base = createGameState();
    const save = serializeGameState(base);
    delete (save.rpg as Record<string, unknown>)['craftedLenses'];
    const restored = deserializeGameState(save);
    expect(restored.rpg.craftedLenses).toEqual([]);
  });

  it('rpgState defaults produce empty lens inventory', () => {
    expect(createRpgSimState().craftedLenses).toEqual([]);
  });

  it('old weapon without attachedLens field loads safely', () => {
    const state = createGameState();
    craftWeapon(state, [{ tierId: 'sand', refinedCount: 5 }, { tierId: 'quartz', refinedCount: 5 }], true);
    const save = serializeGameState(state);
    if (save.rpg?.craftedWeapons?.[0]) {
      delete (save.rpg.craftedWeapons[0] as Record<string, unknown>)['attachedLens'];
    }
    const restored = deserializeGameState(save);
    expect(restored.rpg.craftedWeapons[0]!.attachedLens).toBeUndefined();
  });
});
