/**
 * lens-rolling.test.ts — Unit tests for the Lens crafting system.
 *
 * Covers:
 *   - Lens mote-type cap by forge level
 *   - One effect per distinct ingredient tier
 *   - Rarity classification
 *   - Save/load migration safety (old saves load without lenses)
 *   - Attaching a lens removes it from inventory and stores it on the weapon
 *   - Replacing a lens destroys the old one
 *   - Weapon and weave crafting still work
 */

import { describe, it, expect } from 'vitest';
import { getLensRarity, createCraftedLens, computeLensPowerScale } from '../lens-rolling';
import { getLensMaxMoteTypes } from '../lens-definitions';
import { createRpgSimState } from '../../../sim/rpg/rpg-state';
import { createGameState } from '../../../sim/game-state';
import { craftLens, attachLensToWeapon, craftWeapon, craftWeave } from '../../../sim/game-state';
import { deserializeGameState } from '../../../settings/save-deserialize';
import { serializeGameState } from '../../../settings/save-serialize';

// ─── Lens mote-type cap by forge level ───────────────────────────

describe('getLensMaxMoteTypes', () => {
  it('forge level 1 → max 1 mote type', () => expect(getLensMaxMoteTypes(1)).toBe(1));
  it('forge level 2 → max 1 mote type', () => expect(getLensMaxMoteTypes(2)).toBe(1));
  it('forge level 3 → max 2 mote types', () => expect(getLensMaxMoteTypes(3)).toBe(2));
  it('forge level 4 → max 2 mote types', () => expect(getLensMaxMoteTypes(4)).toBe(2));
  it('forge level 5 → max 3 mote types', () => expect(getLensMaxMoteTypes(5)).toBe(3));
});

// ─── getLensRarity ────────────────────────────────────────────────

describe('getLensRarity', () => {
  it('q=0.00 → Common',    () => expect(getLensRarity(0.00)).toBe('Common'));
  it('q=0.39 → Common',    () => expect(getLensRarity(0.39)).toBe('Common'));
  it('q=0.40 → Uncommon',  () => expect(getLensRarity(0.40)).toBe('Uncommon'));
  it('q=0.65 → Rare',      () => expect(getLensRarity(0.65)).toBe('Rare'));
  it('q=0.82 → Epic',      () => expect(getLensRarity(0.82)).toBe('Epic'));
  it('q=0.94 → Legendary', () => expect(getLensRarity(0.94)).toBe('Legendary'));
  it('q=0.99 → Mythic',    () => expect(getLensRarity(0.99)).toBe('Mythic'));
  it('q=1.00 → Mythic',    () => expect(getLensRarity(1.00)).toBe('Mythic'));
});

// ─── One effect per distinct tier ────────────────────────────────

describe('createCraftedLens — one effect per distinct ingredient tier', () => {
  it('single tier → one effect', () => {
    const lens = createCraftedLens('lens_test_1', [{ tierId: 'ruby', refinedCount: 5 }], 1);
    expect(lens.effects).toHaveLength(1);
    expect(lens.effects[0]!.tierId).toBe('ruby');
  });

  it('two tiers → two effects', () => {
    const lens = createCraftedLens('lens_test_2', [
      { tierId: 'sand', refinedCount: 3 },
      { tierId: 'quartz', refinedCount: 2 },
    ], 3);
    expect(lens.effects).toHaveLength(2);
    const tiers = lens.effects.map(e => e.tierId);
    expect(tiers).toContain('sand');
    expect(tiers).toContain('quartz');
  });

  it('three tiers → three effects', () => {
    const lens = createCraftedLens('lens_test_3', [
      { tierId: 'sapphire', refinedCount: 2 },
      { tierId: 'diamond', refinedCount: 2 },
      { tierId: 'nullstone', refinedCount: 2 },
    ], 5);
    expect(lens.effects).toHaveLength(3);
  });

  it('sunstone (no family) contributes to power but not effects', () => {
    const lens = createCraftedLens('lens_test_sunstone', [
      { tierId: 'sunstone', refinedCount: 5 },
      { tierId: 'citrine', refinedCount: 2 },
    ], 1);
    expect(lens.effects).toHaveLength(1);
    expect(lens.effects[0]!.tierId).toBe('citrine');
    expect(lens.totalWeightedMoteValue).toBeGreaterThan(0);
  });

  it('duplicate tier entries are merged before rolling', () => {
    const lens = createCraftedLens('lens_test_dup', [
      { tierId: 'ruby', refinedCount: 3 },
      { tierId: 'ruby', refinedCount: 2 },
    ], 1);
    expect(lens.effects).toHaveLength(1);
  });

  it('type field is "lens"', () => {
    const lens = createCraftedLens('lens_test_type', [{ tierId: 'emerald', refinedCount: 1 }], 1);
    expect(lens.type).toBe('lens');
  });
});

// ─── Power scale ─────────────────────────────────────────────────

describe('computeLensPowerScale', () => {
  it('total=0 → scale=1.0', () => expect(computeLensPowerScale(0)).toBeCloseTo(1.0, 5));
  it('scale increases with investment', () => {
    expect(computeLensPowerScale(10000)).toBeGreaterThan(computeLensPowerScale(100));
  });
});

// ─── craftLens game action ────────────────────────────────────────

describe('craftLens', () => {
  it('creates a lens in craftedLenses inventory', () => {
    const state = createGameState();
    state.rpg.refinedCrystalsByTierId.set('sand', 10);
    const ok = craftLens(state, [{ tierId: 'sand', refinedCount: 5 }]);
    expect(ok).toBe(true);
    expect(state.rpg.craftedLenses).toHaveLength(1);
    expect(state.rpg.craftedLenses[0]!.type).toBe('lens');
  });

  it('deducts refined crystals on crafting', () => {
    const state = createGameState();
    state.rpg.refinedCrystalsByTierId.set('ruby', 10);
    craftLens(state, [{ tierId: 'ruby', refinedCount: 4 }]);
    expect(state.rpg.refinedCrystalsByTierId.get('ruby')).toBe(6);
  });

  it('fails when insufficient crystals', () => {
    const state = createGameState();
    state.rpg.refinedCrystalsByTierId.set('sand', 2);
    const ok = craftLens(state, [{ tierId: 'sand', refinedCount: 5 }]);
    expect(ok).toBe(false);
    expect(state.rpg.craftedLenses).toHaveLength(0);
  });

  it('bypasses cost in dev mode', () => {
    const state = createGameState();
    // No crystals at all
    const ok = craftLens(state, [{ tierId: 'sand', refinedCount: 5 }], true);
    expect(ok).toBe(true);
  });

  it('dispatching LENS mode produces a lens, not a weapon', () => {
    const state = createGameState();
    state.rpg.refinedCrystalsByTierId.set('sand', 20);
    craftLens(state, [{ tierId: 'sand', refinedCount: 5 }]);
    // craftedWeapons untouched
    expect(state.rpg.craftedWeapons).toHaveLength(0);
    expect(state.rpg.craftedLenses).toHaveLength(1);
  });
});

// ─── attachLensToWeapon ───────────────────────────────────────────

describe('attachLensToWeapon', () => {
  function makeStateWithWeaponAndLens() {
    const state = createGameState();
    // Give dev-mode bypassed weapon and lens
    craftWeapon(state, [{ tierId: 'sand', refinedCount: 5 }, { tierId: 'quartz', refinedCount: 5 }], true);
    craftLens(state, [{ tierId: 'ruby', refinedCount: 5 }], true);
    return state;
  }

  it('removes lens from inventory when attached', () => {
    const state = makeStateWithWeaponAndLens();
    const lensId = state.rpg.craftedLenses[0]!.id;
    const weaponId = state.rpg.craftedWeapons[0]!.id;
    const ok = attachLensToWeapon(state, lensId, weaponId);
    expect(ok).toBe(true);
    expect(state.rpg.craftedLenses).toHaveLength(0);
  });

  it('stores lens on weapon after attach', () => {
    const state = makeStateWithWeaponAndLens();
    const lens = state.rpg.craftedLenses[0]!;
    const weapon = state.rpg.craftedWeapons[0]!;
    attachLensToWeapon(state, lens.id, weapon.id);
    expect(weapon.attachedLens).toBeDefined();
    expect(weapon.attachedLens!.id).toBe(lens.id);
  });

  it('replacing a lens destroys the old one permanently', () => {
    const state = makeStateWithWeaponAndLens();
    const firstLens = state.rpg.craftedLenses[0]!;
    const weapon = state.rpg.craftedWeapons[0]!;
    attachLensToWeapon(state, firstLens.id, weapon.id);

    // Craft second lens
    craftLens(state, [{ tierId: 'sapphire', refinedCount: 3 }], true);
    const secondLens = state.rpg.craftedLenses[0]!;

    attachLensToWeapon(state, secondLens.id, weapon.id);
    expect(weapon.attachedLens!.id).toBe(secondLens.id);
    // Old lens is gone from inventory
    expect(state.rpg.craftedLenses.find(l => l.id === firstLens.id)).toBeUndefined();
    expect(state.rpg.craftedLenses).toHaveLength(0);
  });

  it('returns false for unknown lens', () => {
    const state = makeStateWithWeaponAndLens();
    const weapon = state.rpg.craftedWeapons[0]!;
    const ok = attachLensToWeapon(state, 'nonexistent_lens', weapon.id);
    expect(ok).toBe(false);
  });

  it('returns false for unknown weapon', () => {
    const state = makeStateWithWeaponAndLens();
    const lens = state.rpg.craftedLenses[0]!;
    const ok = attachLensToWeapon(state, lens.id, 'nonexistent_weapon');
    expect(ok).toBe(false);
  });
});

// ─── Weapon crafting still works ─────────────────────────────────

describe('weapon crafting still works after lens system added', () => {
  it('craftWeapon creates a weapon', () => {
    const state = createGameState();
    craftWeapon(state, [{ tierId: 'sand', refinedCount: 5 }, { tierId: 'quartz', refinedCount: 3 }], true);
    expect(state.rpg.craftedWeapons).toHaveLength(1);
    expect(state.rpg.craftedWeapons[0]!.attachedLens).toBeUndefined();
  });
});

// ─── Weave crafting still works ───────────────────────────────────

describe('weave crafting still works after lens system added', () => {
  it('craftWeave creates a weave', () => {
    const state = createGameState();
    craftWeave(state, [{ tierId: 'citrine', refinedCount: 5 }], true);
    expect(state.rpg.craftedWeaves).toHaveLength(1);
  });
});

// ─── Save/load migration safety ───────────────────────────────────

describe('save/load migration safety for lenses', () => {
  it('rpgState defaults produce empty lens inventory', () => {
    const state = createRpgSimState();
    expect(state.craftedLenses).toEqual([]);
  });

  it('deserializing old save (no lens fields) does not crash', () => {
    const base = createGameState();
    const save = serializeGameState(base);
    // Strip lens fields to mimic old save
    delete (save.rpg as Record<string, unknown>)['craftedLenses'];
    const restored = deserializeGameState(save);
    expect(restored.rpg.craftedLenses).toEqual([]);
  });

  it('attached lens persists through save/load', () => {
    const state = createGameState();
    craftWeapon(state, [{ tierId: 'sand', refinedCount: 5 }, { tierId: 'quartz', refinedCount: 5 }], true);
    craftLens(state, [{ tierId: 'ruby', refinedCount: 5 }], true);
    const lens = state.rpg.craftedLenses[0]!;
    const weapon = state.rpg.craftedWeapons[0]!;
    attachLensToWeapon(state, lens.id, weapon.id);

    const save = serializeGameState(state);
    const restored = deserializeGameState(save);

    const restoredWeapon = restored.rpg.craftedWeapons[0]!;
    expect(restoredWeapon.attachedLens).toBeDefined();
    expect(restoredWeapon.attachedLens!.name).toBe(lens.name);
    expect(restoredWeapon.attachedLens!.effects).toHaveLength(lens.effects.length);
    // Lens no longer in inventory after attach
    expect(restored.rpg.craftedLenses).toHaveLength(0);
  });

  it('inventory lenses persist through save/load', () => {
    const state = createGameState();
    craftLens(state, [{ tierId: 'emerald', refinedCount: 3 }], true);
    const lensName = state.rpg.craftedLenses[0]!.name;

    const save = serializeGameState(state);
    const restored = deserializeGameState(save);

    expect(restored.rpg.craftedLenses).toHaveLength(1);
    expect(restored.rpg.craftedLenses[0]!.name).toBe(lensName);
    expect(restored.rpg.craftedLenses[0]!.type).toBe('lens');
  });

  it('old weapons without attachedLens get undefined lens slot safely', () => {
    const base = createGameState();
    craftWeapon(base, [{ tierId: 'sand', refinedCount: 5 }, { tierId: 'quartz', refinedCount: 5 }], true);
    const save = serializeGameState(base);
    // Strip attachedLens from the saved weapon to mimic old save
    if (save.rpg?.craftedWeapons?.[0]) {
      delete (save.rpg.craftedWeapons[0] as Record<string, unknown>)['attachedLens'];
    }
    const restored = deserializeGameState(save);
    expect(restored.rpg.craftedWeapons[0]!.attachedLens).toBeUndefined();
  });
});
