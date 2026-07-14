/**
 * rpg-player-attack-aoe-roster.test.ts — Phase Seven characterization/regression
 * tests for the `aoeTargets` and `comboArrays` constructions inside
 * performAoeAttack(). Spies on the two consumer functions to record the exact
 * (enemy, enemyTypeId) pairs each construction currently produces, written
 * against pre-migration behavior and re-run unchanged after migrating both
 * constructions to iterate the canonical AOE_FAMILY_ROSTER.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';

const lensStatusCalls: Array<{ enemyTypeId: string; hp: number }> = [];
const comboEvalCalls: Array<{ enemyTypeId: string }> = [];

vi.mock('../../../sim/rpg/enemy-status-application', () => ({
  applyTier1LensStatusesToEnemy: vi.fn((args: { enemy: { hp: number }; enemyTypeId: string }) => {
    lensStatusCalls.push({ enemyTypeId: args.enemyTypeId, hp: args.enemy.hp });
    return {};
  }),
}));

vi.mock('../../../sim/rpg/enemy-status-combos', () => ({
  evaluateStatusCombosOnStatusApplied: vi.fn((args: { enemyTypeId: string }) => {
    comboEvalCalls.push({ enemyTypeId: args.enemyTypeId });
    return [];
  }),
}));

vi.mock('../../../data/rpg/weave-proc-effects', () => ({
  getEmberDurationMult: () => 1,
  getEmberPotencyMult: () => 1,
  getEmberOverloadChancePct: () => 0,
}));

vi.mock('../lens-tier2-effects', () => ({
  handleLensTier2EffectsOnWeaponHit: vi.fn(),
  extractT2TargetEntity: vi.fn(() => null),
}));

vi.mock('../lens-tier3-effects', () => ({
  handleLensTier3EffectsOnWeaponHit: vi.fn(),
}));

import { performAoeAttack } from '../rpg-player-attack-aoe';
import { createRpgEncounterCollections, AOE_FAMILY_ROSTER } from '../rpg-encounter-collections';
import type { RpgPlayerAttackCtx } from '../rpg-player-attack';
import type { CombinedEquipmentModifiers } from '../../../data/rpg/equipment-modifiers';

type MinEnemy = { x: number; y: number; hp: number; maxHp: number };

function makeEnemy(x: number, y: number, hp = 100, extra: object = {}): MinEnemy {
  return { x, y, hp, maxHp: 100, ...extra };
}

function makeCtx(): RpgPlayerAttackCtx {
  const collections = createRpgEncounterCollections();
  const noopDamage = () => 0;
  const ctx = {
    ...collections,
    collections,
    mote: { x: 0, y: 0 },
    get bossEnemy() { return null; },
    rpgSimState: {},
    playerStats: { hp: 100, maxHp: 100, atk: 1, def: 0, regen: 0 },
    damageEnemy: noopDamage, damageSapphireEnemy: noopDamage, damageMissile: noopDamage,
    damageEmeraldEnemy: noopDamage, damageAmberEnemy: noopDamage, damageAmberShard: noopDamage,
    damageVoidEnemy: noopDamage, damageQuartzEnemy: noopDamage, damageQuartzSpike: noopDamage,
    damageRubyEnemy: noopDamage, damageRubyBolt: noopDamage, damageSunstoneEnemy: noopDamage,
    damageCitrineEnemy: noopDamage, damageCitrineBolt: noopDamage, damageIoliteEnemy: noopDamage,
    damageAmethystEnemy: noopDamage, damageAmethystShard: noopDamage, damageDiamondEnemy: noopDamage,
    damageDiamondShard: noopDamage, damageNullstoneEnemy: noopDamage, damageVoidTendril: noopDamage,
    damageFracterylEnemy: noopDamage, damageFracterylShard: noopDamage, damageEigensteinEnemy: noopDamage,
    damagePolyominoEnemy: noopDamage, damageFissilePolyominoEnemy: noopDamage,
    damageRefractorPolyominoEnemy: noopDamage, damageEliteEnemy: noopDamage, damageBossEnemy: noopDamage,
    damageAlivenParticle: noopDamage, damageLifeCell: noopDamage, damageLifeCore: noopDamage,
    damageHorizonPentagonReal: noopDamage, damageHorizonMissile: noopDamage,
    spawnHitVisuals: () => {}, spawnHitVisualsAt: () => {}, spawnDamageNumber: () => {},
    spawnComboEffect: () => {},
    fluid: { addExplosion: () => {} },
    findClosestTarget: () => null,
  } as unknown as RpgPlayerAttackCtx;
  return ctx;
}

const equipment = { lens: {}, statusChancePct: 0 } as unknown as CombinedEquipmentModifiers;

describe('performAoeAttack — aoeTargets and comboArrays roster derivation', () => {
  beforeEach(() => {
    lensStatusCalls.length = 0;
    comboEvalCalls.length = 0;
  });

  it('applies Tier 1 lens statuses to one in-range enemy per roster family with the correct static type id', () => {
    const ctx = makeCtx();
    for (const { key } of AOE_FAMILY_ROSTER) {
      (ctx[key] as MinEnemy[]).push(makeEnemy(0, 0));
    }
    performAoeAttack(ctx, 10, 50, 0, undefined, undefined, equipment, 'weapon1');

    const nonEliteCalls = lensStatusCalls;
    expect(nonEliteCalls.length).toBe(AOE_FAMILY_ROSTER.length);
    const expectedTypeIds = AOE_FAMILY_ROSTER.map(e => e.typeId);
    expect(nonEliteCalls.map(c => c.enemyTypeId)).toEqual(expectedTypeIds);
  });

  it('applies Tier 1 lens statuses to eliteEnemies with the dynamic elite_${tier} type id', () => {
    const ctx = makeCtx();
    ctx.eliteEnemies.push(makeEnemy(0, 0, 100, { tier: 'gold' }) as never);
    performAoeAttack(ctx, 10, 50, 0, undefined, undefined, equipment, 'weapon1');
    expect(lensStatusCalls).toEqual([{ enemyTypeId: 'elite_gold', hp: 100 }]);
  });

  it('skips dead enemies and out-of-range enemies for lens status application', () => {
    const ctx = makeCtx();
    ctx.enemies.push(makeEnemy(0, 0, 0) as never, makeEnemy(1000, 1000) as never, makeEnemy(1, 1) as never);
    performAoeAttack(ctx, 10, 50, 0, undefined, undefined, equipment, 'weapon1');
    expect(lensStatusCalls.length).toBe(1);
  });

  it('evaluates AoE status combos for one in-range enemy per roster family with the correct static type id', () => {
    const ctx = makeCtx();
    for (const { key } of AOE_FAMILY_ROSTER) {
      (ctx[key] as MinEnemy[]).push(makeEnemy(0, 0));
    }
    performAoeAttack(ctx, 10, 50, 0, undefined, undefined, equipment, 'weapon1');

    const expectedTypeIds = AOE_FAMILY_ROSTER.map(e => e.typeId);
    expect(comboEvalCalls.map(c => c.enemyTypeId)).toEqual(expectedTypeIds);
  });

  it('evaluates eliteEnemies combo separately with dynamic type id and isInvuln filter', () => {
    const ctx = makeCtx();
    ctx.eliteEnemies.push(
      makeEnemy(0, 0, 100, { tier: 'gold', isInvuln: false }) as never,
      makeEnemy(0, 0, 100, { tier: 'gold', isInvuln: true }) as never,
    );
    performAoeAttack(ctx, 10, 50, 0, undefined, undefined, equipment, 'weapon1');
    expect(comboEvalCalls).toEqual([{ enemyTypeId: 'elite_gold' }]);
  });
});
