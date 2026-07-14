/**
 * rpg-combo-apply-aoe.test.ts — Phase Seven characterization/regression tests
 * for _applyAoeDmg() inside applyComboResults(). Written against pre-migration
 * behavior and re-run unchanged after migrating _applyAoeDmg to iterate the
 * canonical AOE_FAMILY_ROSTER.
 */
import { describe, expect, it } from 'vitest';
import { applyComboResults } from '../rpg-combo-apply';
import type { RpgPlayerAttackCtx } from '../rpg-player-attack';
import { AOE_FAMILY_ROSTER, AOE_ELITE_FAMILY_KEY, createRpgEncounterCollections } from '../rpg-encounter-collections';
import type { ComboResult } from '../../../sim/rpg/enemy-status-combos';

type MinEnemy = { x: number; y: number; hp: number; maxHp: number };

function makeEnemy(x: number, y: number, hp = 100): MinEnemy {
  return { x, y, hp, maxHp: 100 };
}

function makeCtx(): { ctx: RpgPlayerAttackCtx; hitLog: Array<{ x: number; y: number; maxHp: number; dmg: number; color: string }> } {
  const collections = createRpgEncounterCollections();
  const hitLog: Array<{ x: number; y: number; maxHp: number; dmg: number; color: string }> = [];
  const ctx = {
    ...collections,
    collections,
    mote: { x: 0, y: 0 },
    get bossEnemy() { return null; },
    rpgSimState: { statusCombosTriggered: 0, statusComboDamageDealt: 0 },
    spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string) => {
      hitLog.push({ x, y, maxHp, dmg, color });
    },
    spawnDamageNumber: () => {},
    spawnComboEffect: () => {},
  } as unknown as RpgPlayerAttackCtx;
  return { ctx, hitLog };
}

function makeComboResult(overrides: Partial<ComboResult> = {}): ComboResult {
  return {
    comboId: 'test',
    label: 'Test',
    color: '#ffffff',
    primaryEnemy: {},
    enemyTypeId: 'other',
    x: 0,
    y: 0,
    primaryDamage: 0,
    aoeDamage: 50,
    aoeRadius: 10,
    triggerKind: 'aoeHit',
    ...overrides,
  } as ComboResult;
}

describe('_applyAoeDmg via applyComboResults', () => {
  it('damages one live in-range enemy in every roster family plus eliteEnemies, in roster order', () => {
    const { ctx, hitLog } = makeCtx();
    const allKeys = [...AOE_FAMILY_ROSTER.map(e => e.key), AOE_ELITE_FAMILY_KEY];
    for (const key of allKeys) {
      (ctx[key] as MinEnemy[]).push(makeEnemy(0, 0));
    }
    // Control families NOT in the AoE roster must remain untouched.
    ctx.polyominoEnemies.push({ ...makeEnemy(0, 0) } as never);
    ctx.dustWispEnemies.push({ ...makeEnemy(0, 0) } as never);

    applyComboResults(ctx, [makeComboResult()]);

    for (const key of allKeys) {
      expect((ctx[key] as MinEnemy[])[0].hp, `${key} hp after AoE`).toBe(50);
    }
    expect(ctx.polyominoEnemies[0]!.hp).toBe(100);
    expect(ctx.dustWispEnemies[0]!.hp).toBe(100);

    expect(hitLog.length).toBe(allKeys.length);
    expect(hitLog.every(h => h.dmg === 50 && h.color === '#ffffff')).toBe(true);
  });

  it('skips the primary/skip enemy and dead enemies, and respects radius', () => {
    const { ctx, hitLog } = makeCtx();
    const skip = makeEnemy(0, 0);
    const dead = makeEnemy(0, 0, 0);
    const outOfRange = makeEnemy(1000, 1000);
    const inRange = makeEnemy(1, 1);
    ctx.enemies.push(skip as never, dead as never, outOfRange as never, inRange as never);

    applyComboResults(ctx, [makeComboResult({ primaryEnemy: skip, aoeRadius: 10, aoeDamage: 30 })]);

    expect(skip.hp).toBe(100);
    expect(dead.hp).toBe(0);
    expect(outOfRange.hp).toBe(100);
    expect(inRange.hp).toBe(70);
    expect(hitLog.length).toBe(1);
    expect(hitLog[0]).toMatchObject({ x: 1, y: 1, dmg: 30 });
  });

  it('is a no-op when aoeDamage is 0', () => {
    const { ctx, hitLog } = makeCtx();
    ctx.enemies.push(makeEnemy(0, 0) as never);
    applyComboResults(ctx, [makeComboResult({ aoeDamage: 0 })]);
    expect(ctx.enemies[0]!.hp).toBe(100);
    expect(hitLog.length).toBe(0);
  });
});
