import { describe, expect, it } from 'vitest';
import { BOSS_ATTACK_VOID_RADIUS, isPointInBossAttackVoid } from '../rpg-boss-attack-void';

describe('boss attack void', () => {
  it('includes the boss center and excludes points beyond its radius', () => {
    expect(isPointInBossAttackVoid(100, 200, 100, 200)).toBe(true);
    expect(isPointInBossAttackVoid(100 + BOSS_ATTACK_VOID_RADIUS, 200, 100, 200)).toBe(true);
    expect(isPointInBossAttackVoid(101 + BOSS_ATTACK_VOID_RADIUS, 200, 100, 200)).toBe(false);
  });
});
