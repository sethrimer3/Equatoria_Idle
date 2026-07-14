/**
 * rpg-elite-buff.test.ts — Characterization coverage for the elite-enemy empowerment buff.
 */

import { describe, it, expect } from 'vitest';
import {
  ELITE_BUFF_PER_ELITE,
  registerNonEliteEnemy,
  applyBuffToEnemy,
  recalcAllNonEliteBuffs,
  clearEliteBuffRegistry,
  type BuffableEnemy,
} from './rpg-elite-buff';

function nonShieldEnemy(): BuffableEnemy {
  return { x: 0, y: 0, hp: 100, maxHp: 100, atk: 10, def: 5 };
}

function shieldEnemy(): BuffableEnemy & { shieldHp: number; maxShieldHp: number } {
  return { x: 0, y: 0, hp: 100, maxHp: 100, atk: 10, def: 5, shieldHp: 50, maxShieldHp: 50 };
}

describe('rpg-elite-buff', () => {
  it('scales stats for a non-shield enemy and adds no shieldHp field', () => {
    clearEliteBuffRegistry();
    const enemy = nonShieldEnemy();
    registerNonEliteEnemy(enemy);
    applyBuffToEnemy(enemy, 2);

    const mult = 1 + 2 * ELITE_BUFF_PER_ELITE;
    expect(enemy.maxHp).toBe(Math.max(1, Math.ceil(100 * mult)));
    expect(enemy.atk).toBe(Math.max(1, Math.ceil(10 * mult)));
    expect(enemy.def).toBe(Math.ceil(5 * mult));
    expect('shieldHp' in enemy).toBe(false);
  });

  it('preserves HP percentage across recalcs for a non-shield enemy', () => {
    clearEliteBuffRegistry();
    const enemy = nonShieldEnemy();
    enemy.hp = 50; // 50% of maxHp
    registerNonEliteEnemy(enemy);
    applyBuffToEnemy(enemy, 3);

    const hpPct = enemy.hp / enemy.maxHp;
    expect(hpPct).toBeCloseTo(0.5, 1);
  });

  it('scales shieldHp/maxShieldHp for a shield-bearing enemy and preserves shield percentage', () => {
    clearEliteBuffRegistry();
    const enemy = shieldEnemy();
    enemy.shieldHp = 25; // 50% of maxShieldHp
    registerNonEliteEnemy(enemy);
    applyBuffToEnemy(enemy, 1);

    const mult = 1 + 1 * ELITE_BUFF_PER_ELITE;
    expect(enemy.maxShieldHp).toBe(Math.max(1, Math.ceil(50 * mult)));
    const shieldPct = enemy.shieldHp / enemy.maxShieldHp;
    expect(shieldPct).toBeCloseTo(0.5, 1);
  });

  it('is idempotent: repeated calls with the same eliteCount do not compound', () => {
    clearEliteBuffRegistry();
    const enemy = shieldEnemy();
    registerNonEliteEnemy(enemy);
    applyBuffToEnemy(enemy, 2);
    const first = { maxHp: enemy.maxHp, atk: enemy.atk, def: enemy.def, maxShieldHp: enemy.maxShieldHp };
    applyBuffToEnemy(enemy, 2);
    expect(enemy.maxHp).toBe(first.maxHp);
    expect(enemy.atk).toBe(first.atk);
    expect(enemy.def).toBe(first.def);
    expect(enemy.maxShieldHp).toBe(first.maxShieldHp);
  });

  it('recalcAllNonEliteBuffs applies the buff across mixed shield/non-shield arrays', () => {
    clearEliteBuffRegistry();
    const plain = nonShieldEnemy();
    const shielded = shieldEnemy();
    registerNonEliteEnemy(plain);
    registerNonEliteEnemy(shielded);

    recalcAllNonEliteBuffs([[plain], [shielded]], 4);

    const mult = 1 + 4 * ELITE_BUFF_PER_ELITE;
    expect(plain.maxHp).toBe(Math.max(1, Math.ceil(100 * mult)));
    expect(shielded.maxShieldHp).toBe(Math.max(1, Math.ceil(50 * mult)));
  });

  it('is a no-op for enemies that were never registered', () => {
    clearEliteBuffRegistry();
    const enemy = nonShieldEnemy();
    applyBuffToEnemy(enemy, 5);
    expect(enemy.maxHp).toBe(100);
    expect(enemy.atk).toBe(10);
    expect(enemy.def).toBe(5);
  });
});
