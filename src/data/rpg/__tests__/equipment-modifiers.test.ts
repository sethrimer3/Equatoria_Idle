import { describe, expect, it } from 'vitest';
import {
  getEquippedLensModifiers,
  getEquippedWeaveModifiers,
  getCombinedEquipmentModifiers,
} from '../equipment-modifiers';
import { createCraftedLens } from '../lens-rolling';
import { createCraftedWeave } from '../weave-rolling';
import { createRpgSimState } from '../../../sim/rpg/rpg-state';

describe('equipment-modifiers', () => {
  it('returns safe defaults for empty equipment', () => {
    const weave = getEquippedWeaveModifiers([null, null], []);
    expect(weave.weaponDamagePct).toBe(0);
    expect(weave.cooldownPct).toBe(0);
    expect(weave.equippedWeaves).toEqual([]);

    const lens = getEquippedLensModifiers(null, 'weapon', 10);
    expect(lens.lens).toBeNull();
    expect(lens.tier1StatusParams).toEqual([]);
  });

  it('aggregates equipped lens status params and weave combat bonuses', () => {
    const lens = createCraftedLens('lens_test', [{ tierId: 'ruby', refinedCount: 2n }], 3, () => 0.2);
    const weave = createCraftedWeave('weave_test', [{ tierId: 'citrine', refinedCount: 2n }], 3, () => 0.2);

    const state = createRpgSimState();
    state.craftedWeapons.push({
      id: 'crafted_weapon_test',
      name: 'Test Weapon',
      description: '',
      dominantTierId: 'ruby',
      secondaryTierId: 'ruby',
      forgeCraftLevel: 3,
      ingredients: [],
      composition: [],
      definition: {
        id: 'crafted_weapon_test',
        name: 'Test Weapon',
        description: '',
        costTierId: 'ruby',
        cost: 0,
        stats: { damage: 10, cooldownMs: 1000, range: 100, defBonus: 0 },
      },
      totalWeightedMoteValue: 1,
      baseLevel: 1,
      baseStatMultiplier: 1,
      modifiers: {
        critChancePct: 0,
        critDamageMultiplier: 2,
        armorIgnorePct: 0,
        poisonBonusDmg: 0,
        nullstonePullRadius: 0,
        fracterylStrikes: 0,
        emeraldAcquisitionRangePx: 0,
        amethystShipCount: 0,
      },
      attachedLens: lens,
    });
    state.craftedWeaves.push(weave);
    state.equippedWeaveSlots[0] = weave.id;

    const combined = getCombinedEquipmentModifiers({
      rpgState: state,
      weaponId: 'crafted_weapon_test',
      hitDamage: 25,
    });

    expect(combined.lens?.id).toBe(lens.id);
    expect(combined.tier1StatusParams.some(p => p.key === 'burning')).toBe(true);
    expect(combined.weaponDamagePct).toBeGreaterThan(0);
    expect(combined.equippedWeaves).toHaveLength(1);
  });
});
