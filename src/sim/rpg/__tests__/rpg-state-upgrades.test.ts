import { describe, expect, it } from 'vitest';
import {
  createRpgSimState,
  getEnabledSkillNodeRank,
  getRpgContactDamageMultiplier,
  isSkillNodeEffectEnabled,
} from '../rpg-state';

describe('RPG skill node toggles', () => {
  it('keeps purchased rank while disabling toggleable effects', () => {
    const state = createRpgSimState();
    state.rpgUpgradeLevels.set('acceleration', 3);

    expect(getEnabledSkillNodeRank(state, 'acceleration')).toBe(3);
    expect(isSkillNodeEffectEnabled(state, 'acceleration')).toBe(true);

    state.disabledSkillNodeIds.add('acceleration');

    expect(state.rpgUpgradeLevels.get('acceleration')).toBe(3);
    expect(getEnabledSkillNodeRank(state, 'acceleration')).toBe(0);
    expect(isSkillNodeEffectEnabled(state, 'acceleration')).toBe(false);
  });
});

describe('Speed Upgrade contact damage', () => {
  it('scales by 10% DPS per rank and caps at 100%', () => {
    const state = createRpgSimState();

    expect(getRpgContactDamageMultiplier(state)).toBe(0);

    state.rpgUpgradeLevels.set('speed', 4);
    expect(getRpgContactDamageMultiplier(state)).toBeCloseTo(0.4);

    state.rpgUpgradeLevels.set('speed', 12);
    expect(getRpgContactDamageMultiplier(state)).toBe(1);
  });
});
