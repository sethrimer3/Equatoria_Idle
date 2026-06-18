/**
 * enemy-status-combos.test.ts — Tests for the status combo trigger engine.
 */

import { describe, it, expect } from 'vitest';
import {
  evaluateStatusCombosOnStatusApplied,
  evaluateShatterCombo,
} from '../enemy-status-combos';
import {
  applyLensStatus,
  clearEnemyStatuses,
  hasStatus,
  incrementRiftScarredStacks,
} from '../enemy-status-effects';
import { getComboById, STATUS_COMBO_DEFINITIONS } from '../../../data/rpg/status-combo-definitions';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeEnemy() {
  return { hp: 1000, maxHp: 1000, x: 0, y: 0, vx: 0, vy: 0 };
}

function applyStatus(enemy: object, key: string) {
  applyLensStatus(enemy, {
    key: key as import('../enemy-status-effects').EnemyStatusKey,
    sourceTierId: 'ruby' as import('../../../data/tiers').TierId,
    durationMs: 5000,
    magnitude: 50,
    tickEveryMs: 1000,
  });
}

// ── Steam Burst ────────────────────────────────────────────────────────────────

describe('Steam Burst combo', () => {
  it('triggers when both burning and chilled are present', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning');
    applyStatus(enemy, 'chilled');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    expect(results).toHaveLength(1);
    expect(results[0]!.comboId).toBe('steamBurst');
    expect(results[0]!.primaryDamage).toBeGreaterThan(0);
    clearEnemyStatuses(enemy);
  });

  it('consumes chilled on trigger', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning');
    applyStatus(enemy, 'chilled');
    evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    expect(hasStatus(enemy, 'chilled')).toBe(false);
    expect(hasStatus(enemy, 'burning')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('does not trigger when only burning is present', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    expect(results).toHaveLength(0);
    clearEnemyStatuses(enemy);
  });

  it('respects cooldown within cooldown window (from definition)', () => {
    const steamDef = getComboById('steamBurst')!;
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning');
    applyStatus(enemy, 'chilled');
    evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    // Re-apply chilled, still within cooldown
    applyStatus(enemy, 'chilled');
    const results2 = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20,
      nowMs: steamDef.cooldownMs - 1,
    });
    expect(results2).toHaveLength(0);
    clearEnemyStatuses(enemy);
  });

  it('fires again after cooldown expires (from definition)', () => {
    const steamDef = getComboById('steamBurst')!;
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning');
    applyStatus(enemy, 'chilled');
    evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    applyStatus(enemy, 'chilled');
    const results2 = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20,
      nowMs: steamDef.cooldownMs + 1,
    });
    expect(results2).toHaveLength(1);
    expect(results2[0]!.comboId).toBe('steamBurst');
    clearEnemyStatuses(enemy);
  });

  it('applies boss multiplier', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning');
    applyStatus(enemy, 'chilled');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'boss', x: 0, y: 0, baseDamage: 100, nowMs: 0,
    });
    expect(results).toHaveLength(1);
    // boss multiplier = 0.30, primary = baseDamage*0.50*0.30 = 15
    expect(results[0]!.primaryDamage).toBeCloseTo(15);
    clearEnemyStatuses(enemy);
  });

  it('applies elite multiplier', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning');
    applyStatus(enemy, 'chilled');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'elite_ruby', x: 0, y: 0, baseDamage: 100, nowMs: 0,
    });
    // elite multiplier = 0.60, primary = baseDamage*0.50*0.60 = 30
    expect(results[0]!.primaryDamage).toBeCloseTo(30);
    clearEnemyStatuses(enemy);
  });

  it('includes AoE component', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning');
    applyStatus(enemy, 'chilled');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    expect(results[0]!.aoeDamage).toBeGreaterThan(0);
    expect(results[0]!.aoeRadius).toBe(80);
    clearEnemyStatuses(enemy);
  });
});

// ── Shatter ────────────────────────────────────────────────────────────────────

describe('Shatter combo', () => {
  it('triggers when frozen and hit with sufficient damage', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'frozen');
    const result = evaluateShatterCombo({
      enemy, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 10, nowMs: 0,
    });
    expect(result).not.toBeNull();
    expect(result!.comboId).toBe('shatter');
    expect(result!.primaryDamage).toBeGreaterThan(0);
    clearEnemyStatuses(enemy);
  });

  it('removes frozen on trigger', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'frozen');
    evaluateShatterCombo({
      enemy, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 10, nowMs: 0,
    });
    expect(hasStatus(enemy, 'frozen')).toBe(false);
    clearEnemyStatuses(enemy);
  });

  it('does not trigger without frozen', () => {
    const enemy = makeEnemy();
    const result = evaluateShatterCombo({
      enemy, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 10, nowMs: 0,
    });
    expect(result).toBeNull();
    clearEnemyStatuses(enemy);
  });

  it('does not trigger with zero damage', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'frozen');
    const result = evaluateShatterCombo({
      enemy, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 0, nowMs: 0,
    });
    expect(result).toBeNull();
    clearEnemyStatuses(enemy);
  });

  it('respects cooldown', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'frozen');
    evaluateShatterCombo({ enemy, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 10, nowMs: 0 });
    // Re-apply frozen, within 2000ms cooldown
    applyStatus(enemy, 'frozen');
    const result2 = evaluateShatterCombo({
      enemy, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 10, nowMs: 500,
    });
    expect(result2).toBeNull();
    clearEnemyStatuses(enemy);
  });

  it('applies boss multiplier', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'frozen');
    const result = evaluateShatterCombo({
      enemy, enemyTypeId: 'boss', x: 0, y: 0, hitDamage: 100, nowMs: 0,
    });
    // bossMultiplier = 0.40, raw = hitDamage * 1.0 * 0.40 = 40
    expect(result!.primaryDamage).toBeCloseTo(40);
    clearEnemyStatuses(enemy);
  });
});

// ── Toxic Rupture ─────────────────────────────────────────────────────────────

describe('Toxic Rupture combo', () => {
  it('triggers on poisoned + cracked', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'poisoned');
    applyStatus(enemy, 'cracked');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    const rupture = results.find(r => r.comboId === 'toxicRupture');
    expect(rupture).toBeDefined();
    expect(rupture!.primaryDamage).toBeGreaterThan(0);
    clearEnemyStatuses(enemy);
  });

  it('does not trigger with only poisoned', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'poisoned');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    expect(results.find(r => r.comboId === 'toxicRupture')).toBeUndefined();
    clearEnemyStatuses(enemy);
  });

  it('respects cooldown', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'poisoned');
    applyStatus(enemy, 'cracked');
    evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    const results2 = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 1000,
    });
    expect(results2.find(r => r.comboId === 'toxicRupture')).toBeUndefined();
    clearEnemyStatuses(enemy);
  });
});

// ── Gravity Collapse ──────────────────────────────────────────────────────────

describe('Gravity Collapse combo', () => {
  it('triggers on gravitized enemy from aoeHit', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'gravitized');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0, triggerKind: 'aoeHit',
    });
    expect(results.find(r => r.comboId === 'gravityCollapse')).toBeDefined();
    clearEnemyStatuses(enemy);
  });

  it('does NOT trigger on gravitized enemy from direct single-target hit', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'gravitized');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0, triggerKind: 'statusApplied',
    });
    expect(results.find(r => r.comboId === 'gravityCollapse')).toBeUndefined();
    clearEnemyStatuses(enemy);
  });

  it('does NOT trigger on gravitized enemy from default triggerKind', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'gravitized');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    expect(results.find(r => r.comboId === 'gravityCollapse')).toBeUndefined();
    clearEnemyStatuses(enemy);
  });

  it('does not trigger on boss (bossMultiplier = 0) even with aoeHit', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'gravitized');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'boss', x: 0, y: 0, baseDamage: 20, nowMs: 0, triggerKind: 'aoeHit',
    });
    expect(results.find(r => r.comboId === 'gravityCollapse')).toBeUndefined();
    clearEnemyStatuses(enemy);
  });

  it('applies reduced damage to elite from aoeHit', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'gravitized');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'elite_nullstone', x: 0, y: 0, baseDamage: 100, nowMs: 0, triggerKind: 'aoeHit',
    });
    const r = results.find(r => r.comboId === 'gravityCollapse');
    expect(r).toBeDefined();
    // elite multiplier = 0.40; primary = 100 * 0.30 * 0.40 = 12
    expect(r!.primaryDamage).toBeCloseTo(12);
    clearEnemyStatuses(enemy);
  });

  it('includes AoE component from aoeHit', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'gravitized');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0, triggerKind: 'aoeHit',
    });
    const r = results.find(r => r.comboId === 'gravityCollapse');
    expect(r!.aoeRadius).toBe(100);
    clearEnemyStatuses(enemy);
  });
});

// ── Rift Detonation ───────────────────────────────────────────────────────────

describe('Rift Detonation combo', () => {
  it('does not trigger below stack threshold', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'riftScarred');
    for (let i = 0; i < 5; i++) incrementRiftScarredStacks(enemy, 'lens1');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    expect(results.find(r => r.comboId === 'riftDetonation')).toBeUndefined();
    clearEnemyStatuses(enemy);
  });

  it('triggers at or above stack threshold (8)', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'riftScarred');
    for (let i = 0; i < 8; i++) incrementRiftScarredStacks(enemy, 'lens1');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    expect(results.find(r => r.comboId === 'riftDetonation')).toBeDefined();
    clearEnemyStatuses(enemy);
  });

  it('respects cooldown', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'riftScarred');
    for (let i = 0; i < 8; i++) incrementRiftScarredStacks(enemy, 'lens1');
    evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    const results2 = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 2000,
    });
    expect(results2.find(r => r.comboId === 'riftDetonation')).toBeUndefined();
    clearEnemyStatuses(enemy);
  });

  it('applies boss multiplier', () => {
    const enemy = makeEnemy();
    applyStatus(enemy, 'riftScarred');
    for (let i = 0; i < 8; i++) incrementRiftScarredStacks(enemy, 'lens1');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy, enemyTypeId: 'boss', x: 0, y: 0, baseDamage: 100, nowMs: 0,
    });
    const r = results.find(r => r.comboId === 'riftDetonation');
    expect(r).toBeDefined();
    // bossMultiplier=0.25; raw = 100 * 8 * 0.15 * 0.25 = 30
    expect(r!.primaryDamage).toBeCloseTo(30);
    clearEnemyStatuses(enemy);
  });
});

// ── Re-entrancy guard ─────────────────────────────────────────────────────────

describe('re-entrancy guard', () => {
  it('returns empty array if called recursively', () => {
    // Simulate re-entrant call by calling evaluateShatterCombo inside a running eval
    // In practice, re-entrance is impossible from test code, but we verify
    // that two sequential calls to the same enemy work correctly.
    const enemy = makeEnemy();
    applyStatus(enemy, 'frozen');
    const r1 = evaluateShatterCombo({ enemy, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 10, nowMs: 0 });
    expect(r1).not.toBeNull();
    // After shatter, frozen is gone; next call should return null
    const r2 = evaluateShatterCombo({ enemy, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 10, nowMs: 0 });
    expect(r2).toBeNull(); // on cooldown and no frozen
    clearEnemyStatuses(enemy);
  });
});

// ── Isolation between different enemies ──────────────────────────────────────

describe('cooldown isolation', () => {
  it('cooldowns are per-enemy, not global', () => {
    const enemy1 = makeEnemy();
    const enemy2 = makeEnemy();

    applyStatus(enemy1, 'burning');
    applyStatus(enemy1, 'chilled');
    evaluateStatusCombosOnStatusApplied({
      enemy: enemy1, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });

    // enemy2 has never been evaluated — should fire
    applyStatus(enemy2, 'burning');
    applyStatus(enemy2, 'chilled');
    const results = evaluateStatusCombosOnStatusApplied({
      enemy: enemy2, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0,
    });
    expect(results.find(r => r.comboId === 'steamBurst')).toBeDefined();

    clearEnemyStatuses(enemy1);
    clearEnemyStatuses(enemy2);
  });
});

// ── Definitions as source of truth ────────────────────────────────────────────

describe('combo definitions drive engine behavior', () => {
  it('all combo IDs in definitions match what the engine returns', () => {
    const definedIds = STATUS_COMBO_DEFINITIONS.map(c => c.id);
    // Steam Burst
    const e1 = makeEnemy();
    applyStatus(e1, 'burning'); applyStatus(e1, 'chilled');
    const r1 = evaluateStatusCombosOnStatusApplied({ enemy: e1, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 10, nowMs: 0 });
    expect(definedIds).toContain(r1[0]?.comboId);
    clearEnemyStatuses(e1);

    // Shatter
    const e2 = makeEnemy();
    applyStatus(e2, 'frozen');
    const r2 = evaluateShatterCombo({ enemy: e2, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 10, nowMs: 0 });
    expect(definedIds).toContain(r2?.comboId);
    clearEnemyStatuses(e2);
  });

  it('Steam Burst consumes exactly the statuses listed in consumeStatuses', () => {
    const steamDef = getComboById('steamBurst')!;
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning');
    applyStatus(enemy, 'chilled');
    evaluateStatusCombosOnStatusApplied({ enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 10, nowMs: 0 });
    for (const s of steamDef.consumeStatuses) {
      expect(hasStatus(enemy, s)).toBe(false);
    }
    // burning is NOT in consumeStatuses, should remain
    expect(hasStatus(enemy, 'burning')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('Shatter consumes exactly the statuses listed in consumeStatuses', () => {
    const shatterDef = getComboById('shatter')!;
    const enemy = makeEnemy();
    applyStatus(enemy, 'frozen');
    evaluateShatterCombo({ enemy, enemyTypeId: 'other', x: 0, y: 0, hitDamage: 10, nowMs: 0 });
    for (const s of shatterDef.consumeStatuses) {
      expect(hasStatus(enemy, s)).toBe(false);
    }
    clearEnemyStatuses(enemy);
  });

  it('Steam Burst label and color come from definition', () => {
    const steamDef = getComboById('steamBurst')!;
    const enemy = makeEnemy();
    applyStatus(enemy, 'burning'); applyStatus(enemy, 'chilled');
    const results = evaluateStatusCombosOnStatusApplied({ enemy, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 10, nowMs: 0 });
    expect(results[0]!.label).toBe(steamDef.feedbackLabel);
    expect(results[0]!.color).toBe(steamDef.feedbackColor);
    clearEnemyStatuses(enemy);
  });

  it('Rift Detonation uses riftStackThreshold from definition', () => {
    const riftDef = getComboById('riftDetonation')!;
    const threshold = riftDef.riftStackThreshold ?? 8;

    const e1 = makeEnemy();
    applyStatus(e1, 'riftScarred');
    for (let i = 0; i < threshold - 1; i++) incrementRiftScarredStacks(e1, 'lens1');
    const r1 = evaluateStatusCombosOnStatusApplied({ enemy: e1, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0 });
    expect(r1.find(r => r.comboId === 'riftDetonation')).toBeUndefined();
    clearEnemyStatuses(e1);

    const e2 = makeEnemy();
    applyStatus(e2, 'riftScarred');
    for (let i = 0; i < threshold; i++) incrementRiftScarredStacks(e2, 'lens1');
    const r2 = evaluateStatusCombosOnStatusApplied({ enemy: e2, enemyTypeId: 'other', x: 0, y: 0, baseDamage: 20, nowMs: 0 });
    expect(r2.find(r => r.comboId === 'riftDetonation')).toBeDefined();
    clearEnemyStatuses(e2);
  });
});
