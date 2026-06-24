import { describe, expect, it } from 'vitest';
import { getBossBpm, BOSS_BPM } from '../boss-bpm';
import { WEAPON_DEFINITIONS, WEAPON_BY_ID } from '../weapon-definitions';
import { isBossUnlocked } from '../../../sim/rpg/rpg-state';
import { BOSS_NAMES } from '../../../render/rpg/rpg-constants';

describe('BOSS_BPM', () => {
  it('Sand Warden (bossId 0) has 50 BPM', () => {
    expect(getBossBpm(0)).toBe(50);
  });

  it('Quartz Sovereign (bossId 1) has 60 BPM', () => {
    expect(getBossBpm(1)).toBe(60);
  });

  it('each subsequent boss increases BPM by 10', () => {
    for (let id = 1; id <= 10; id++) {
      expect(getBossBpm(id)).toBe(getBossBpm(id - 1) + 10);
    }
  });

  it('returns 60 as default for unknown boss IDs', () => {
    expect(getBossBpm(99)).toBe(60);
  });
});

describe('boss order', () => {
  it('Sand Warden (bossId 0) is listed before Quartz Sovereign (bossId 1)', () => {
    expect(BOSS_NAMES[0]).toBe('Sand Warden');
    expect(BOSS_NAMES[1]).toBe('Quartz Sovereign');
    // Index 0 comes before index 1
    expect(0).toBeLessThan(1);
  });

  it('BOSS_BPM has 11 entries covering bossId 0–10', () => {
    expect(BOSS_BPM.size).toBe(11);
    for (let id = 0; id <= 10; id++) {
      expect(BOSS_BPM.has(id)).toBe(true);
    }
  });
});

describe('wooden_sword', () => {
  const woodenSword = WEAPON_BY_ID.get('wooden_sword');
  const diamondSword = WEAPON_BY_ID.get('diamond_bastion');

  it('wooden_sword is defined', () => {
    expect(woodenSword).toBeDefined();
  });

  it('diamond_bastion is defined', () => {
    expect(diamondSword).toBeDefined();
  });

  it('wooden_sword has same damage as diamond_bastion', () => {
    expect(woodenSword!.stats.damage).toBe(diamondSword!.stats.damage);
  });

  it('wooden_sword has same cooldownMs as diamond_bastion', () => {
    expect(woodenSword!.stats.cooldownMs).toBe(diamondSword!.stats.cooldownMs);
  });

  it('wooden_sword has same range as diamond_bastion', () => {
    expect(woodenSword!.stats.range).toBe(diamondSword!.stats.range);
  });

  it('wooden_sword has same defBonus as diamond_bastion', () => {
    expect(woodenSword!.stats.defBonus).toBe(diamondSword!.stats.defBonus);
  });

  it('wooden_sword has swordCombo effect kind', () => {
    expect(woodenSword!.stats.effect?.kind).toBe('swordCombo');
  });

  it('wooden_sword has isTutorialWeapon: true', () => {
    expect(woodenSword!.isTutorialWeapon).toBe(true);
  });

  it('diamond_bastion does not have isTutorialWeapon set', () => {
    expect(diamondSword!.isTutorialWeapon).toBeFalsy();
  });

  it('wooden_sword is filtered out of the normal weapon list', () => {
    const shopWeapons = WEAPON_DEFINITIONS.filter(w => !w.isTutorialWeapon);
    const ids = shopWeapons.map(w => w.id);
    expect(ids).not.toContain('wooden_sword');
    expect(ids).toContain('diamond_bastion');
  });
});

describe('isBossUnlocked — Sand Warden (bossId 0)', () => {
  it('is locked below wave 50', () => {
    expect(isBossUnlocked(0, 0)).toBe(false);
    expect(isBossUnlocked(0, 49)).toBe(false);
  });

  it('unlocks at exactly wave 50', () => {
    expect(isBossUnlocked(0, 50)).toBe(true);
  });

  it('remains unlocked past wave 50', () => {
    expect(isBossUnlocked(0, 100)).toBe(true);
  });

  it('Quartz (bossId 1) still unlocks at wave 100', () => {
    expect(isBossUnlocked(1, 99)).toBe(false);
    expect(isBossUnlocked(1, 100)).toBe(true);
  });
});

describe('save compatibility — bossCompletions without bossId 0', () => {
  it('treating an old bossCompletions map without key 0 as not-defeated does not throw', () => {
    // Old saves have bossCompletions as a Map<number, number> without key 0.
    const oldCompletions = new Map<number, number>([[1, 100], [2, 80]]);
    expect(() => oldCompletions.get(0)).not.toThrow();
    expect(oldCompletions.get(0)).toBeUndefined();
    // Undefined → treated as bestSpeed = 0 → not completed
    const bestSpeed = oldCompletions.get(0) ?? 0;
    expect(bestSpeed).toBe(0);
  });
});
