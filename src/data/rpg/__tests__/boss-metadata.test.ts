import { describe, expect, it } from 'vitest';
import { BOSS_NAMES, getBossBpm, getBossVisibility, isSecretBoss, isSuperSecretBoss } from '../boss-metadata';
import { BOSS_COLORS, BOSS_GLOW_COLORS } from '../../../render/rpg/rpg-constants';
import { BOSS_ATTACK_PROFILES } from '../../../render/rpg/rpg-boss-attack-config';

describe('boss metadata', () => {
  it('keeps the roster, palettes, BPMs, and attack profiles aligned', () => {
    expect(BOSS_NAMES).toHaveLength(14);
    expect(BOSS_COLORS).toHaveLength(14);
    expect(BOSS_GLOW_COLORS).toHaveLength(14);
    expect(BOSS_NAMES.slice(9)).toEqual(['Fracteryl Manifestation', 'Eigenstein Entity', 'Void Nexus', 'The Problem', 'The Solution']);
    expect([9, 10, 11, 12, 13].map(getBossBpm)).toEqual([140, 150, 160, 170, 180]);
    expect(BOSS_ATTACK_PROFILES.map(p => p.bossId).sort((a, b) => a - b)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13]);
  });

  it('marks secret and super-secret bosses centrally', () => {
    expect([8, 9, 10].every(isSecretBoss)).toBe(true);
    expect([12, 13].every(isSuperSecretBoss)).toBe(true);
    expect(getBossVisibility(11)).toBe('normal');
  });
});
