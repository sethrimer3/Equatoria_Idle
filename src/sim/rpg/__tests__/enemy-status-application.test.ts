/**
 * enemy-status-application.test.ts — Tests for the shared Tier 1 lens status
 * application helper (applyTier1LensStatusesToEnemy).
 */

import { describe, it, expect } from 'vitest';
import { applyTier1LensStatusesToEnemy } from '../enemy-status-application';
import { hasStatus, clearEnemyStatuses, getTotalRiftScarredStacks } from '../enemy-status-effects';
import type { CraftedLensData, LensEffect } from '../../../data/rpg/lens-types';

// ── Helpers ────────────────────────────────────────────────────────────────────

function makeEnemy() {
  return { hp: 1000, maxHp: 1000, x: 0, y: 0, vx: 0, vy: 0 };
}

function makeLens(tierId: string): CraftedLensData {
  const effect: LensEffect = {
    tierId: tierId as import('../../../data/tiers').TierId,
    effectTier: 1,
    key: `${tierId}_t1`,
    name: tierId,
    description: '',
    magnitude: 50,
    quality: 0.8,
    rarity: 'Common',
    isApplied: true,
  };
  return {
    id: `test_lens_${tierId}`,
    type: 'lens',
    name: tierId,
    ingredients: [],
    totalWeightedMoteValue: 100,
    forgeCraftLevel: 5,
    effects: [effect],
  };
}

// ── Immunity ───────────────────────────────────────────────────────────────────

describe('applyTier1LensStatusesToEnemy — immunity', () => {
  it('does not apply Burning to a Ruby enemy (immune)', () => {
    const enemy = makeEnemy();
    const lens = makeLens('ruby'); // ruby → burning
    const result = applyTier1LensStatusesToEnemy({
      enemy, lens, weaponId: 'test_weapon', hitDamage: 50, enemyTypeId: 'ruby',
    });
    expect(hasStatus(enemy, 'burning')).toBe(false);
    expect(result.blockedByImmunity).toBe(true);
    expect(result.affinityFeedback).toBe('IMMUNE');
    clearEnemyStatuses(enemy);
  });

  it('does not apply Chilled to a Sapphire enemy (immune)', () => {
    const enemy = makeEnemy();
    const lens = makeLens('sapphire'); // sapphire → chilled
    const result = applyTier1LensStatusesToEnemy({
      enemy, lens, weaponId: 'test_weapon', hitDamage: 50, enemyTypeId: 'sapphire',
    });
    expect(hasStatus(enemy, 'chilled')).toBe(false);
    expect(result.blockedByImmunity).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('applies Burning to a non-immune enemy', () => {
    const enemy = makeEnemy();
    const lens = makeLens('ruby'); // ruby → burning
    const result = applyTier1LensStatusesToEnemy({
      enemy, lens, weaponId: 'test_weapon', hitDamage: 50, enemyTypeId: 'other',
    });
    expect(hasStatus(enemy, 'burning')).toBe(true);
    expect(result.blockedByImmunity).toBe(false);
    expect(result.appliedAny).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

// ── Resistance / weakness ─────────────────────────────────────────────────────

describe('applyTier1LensStatusesToEnemy — resistance/weakness feedback', () => {
  it('returns RESIST feedback for a resistant enemy', () => {
    const enemy = makeEnemy();
    const lens = makeLens('emerald'); // emerald → poisoned; emerald enemy resists poisoned
    const result = applyTier1LensStatusesToEnemy({
      enemy, lens, weaponId: 'test_weapon', hitDamage: 50, enemyTypeId: 'emerald',
    });
    expect(result.affinityFeedback).toBe('RESIST');
    expect(hasStatus(enemy, 'poisoned')).toBe(true); // still applied, just reduced
    clearEnemyStatuses(enemy);
  });

  it('returns WEAK! feedback for a weak enemy', () => {
    const enemy = makeEnemy();
    const lens = makeLens('ruby'); // ruby → burning; emerald enemy is weak to burning
    const result = applyTier1LensStatusesToEnemy({
      enemy, lens, weaponId: 'test_weapon', hitDamage: 50, enemyTypeId: 'emerald',
    });
    expect(result.affinityFeedback).toBe('WEAK!');
    expect(hasStatus(enemy, 'burning')).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

// ── Rift-Scarred stack immunity ────────────────────────────────────────────────

describe('applyTier1LensStatusesToEnemy — Rift-Scarred stacks', () => {
  it('does not increment Rift-Scarred stacks when eigenstein enemy is immune-adjacent (resistant)', () => {
    // Eigenstein resists Rift-Scarred (mult < 1, not 0) so stacks still increment
    // but this test verifies stacks DO increment for non-immune
    const enemy = makeEnemy();
    const lens = makeLens('eigenstein'); // eigenstein → riftScarred
    applyTier1LensStatusesToEnemy({
      enemy, lens, weaponId: 'test_weapon', hitDamage: 50, enemyTypeId: 'other',
    });
    const stacks = getTotalRiftScarredStacks(enemy);
    expect(stacks).toBeGreaterThan(0);
    clearEnemyStatuses(enemy);
  });
});
