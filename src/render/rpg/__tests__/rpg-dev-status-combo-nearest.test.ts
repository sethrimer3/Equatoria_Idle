/**
 * rpg-dev-status-combo-nearest.test.ts — Phase Eight characterization tests.
 *
 * Locks in `devApplyStatusCombo()`'s pre-migration nearest-enemy search: the
 * exact 8-family subset (`enemies`, `rubyEnemies`, `emeraldEnemies`,
 * `sapphireEnemies`, `nullstoneEnemies`, `fracterylEnemies`,
 * `eigensteinEnemies`, `eliteEnemies`), squared-distance selection, `hp <= 0`
 * exclusion, and boss precedence — now extracted into
 * `findDevStatusComboNearestTarget()` so it is testable without instantiating
 * the full `createRpgRender()` render object (which needs a DOM `HTMLElement`
 * unavailable in this suite's `node` test environment).
 */
import { describe, expect, it } from 'vitest';
import {
  AOE_ELITE_FAMILY_KEY,
  AOE_FAMILY_ROSTER,
  createRpgEncounterCollections,
  findDevStatusComboNearestTarget,
  type RpgEncounterCollections,
} from '../rpg-encounter-collections';
import type { BossEnemy } from '../rpg-enemy-types';

// Exact pre-migration family search set/order, recorded from source before migration:
// enemies, rubyEnemies, emeraldEnemies, sapphireEnemies, nullstoneEnemies,
// fracterylEnemies, eigensteinEnemies, eliteEnemies.
const EXPECTED_SEARCHED_KEYS: readonly (keyof RpgEncounterCollections)[] = [
  'enemies', 'rubyEnemies', 'emeraldEnemies', 'sapphireEnemies',
  'nullstoneEnemies', 'fracterylEnemies', 'eigensteinEnemies', 'eliteEnemies',
];

function makeEntity(x: number, y: number, hp: number): { x: number; y: number; hp: number; maxHp: number } {
  return { x, y, hp, maxHp: 100 };
}

function makeBoss(x: number, y: number, hp: number): BossEnemy {
  return { x, y, hp } as unknown as BossEnemy;
}

describe('devApplyStatusCombo nearest-enemy search (Phase Eight)', () => {
  it('searches exactly the pre-migration 8-family subset, in order', () => {
    const rosterKeys = new Set<string>(AOE_FAMILY_ROSTER.map((entry) => entry.key));
    for (const key of EXPECTED_SEARCHED_KEYS) {
      if (key === AOE_ELITE_FAMILY_KEY) continue;
      expect(rosterKeys.has(key), `${key} should be part of AOE_FAMILY_ROSTER`).toBe(true);
    }
    expect(EXPECTED_SEARCHED_KEYS[EXPECTED_SEARCHED_KEYS.length - 1]).toBe(AOE_ELITE_FAMILY_KEY);
    expect(EXPECTED_SEARCHED_KEYS).toEqual([
      'enemies', 'rubyEnemies', 'emeraldEnemies', 'sapphireEnemies',
      'nullstoneEnemies', 'fracterylEnemies', 'eigensteinEnemies', 'eliteEnemies',
    ]);
  });

  it('selects the nearest live enemy across several searched families by squared distance', () => {
    const collections = createRpgEncounterCollections();
    const mote = { x: 0, y: 0 };
    const far = makeEntity(100, 100, 10);
    const near = makeEntity(5, 0, 10);
    const nearest2 = makeEntity(-3, 0, 10);
    collections.enemies.push(far as never);
    collections.rubyEnemies.push(near as never);
    collections.eigensteinEnemies.push(nearest2 as never);

    const result = findDevStatusComboNearestTarget(collections, mote, null);
    expect(result).toBe(nearest2);
  });

  it('excludes dead enemies (hp <= 0) from selection', () => {
    const collections = createRpgEncounterCollections();
    const mote = { x: 0, y: 0 };
    const dead = makeEntity(1, 0, 0);
    const alive = makeEntity(50, 0, 5);
    collections.enemies.push(dead as never);
    collections.emeraldEnemies.push(alive as never);

    const result = findDevStatusComboNearestTarget(collections, mote, null);
    expect(result).toBe(alive);
  });

  it('includes eliteEnemies in the search', () => {
    const collections = createRpgEncounterCollections();
    const mote = { x: 0, y: 0 };
    const elite = makeEntity(2, 0, 10);
    collections.eliteEnemies.push(elite as never);

    const result = findDevStatusComboNearestTarget(collections, mote, null);
    expect(result).toBe(elite);
  });

  it('excludes a closer enemy from a non-searched family (e.g. amberEnemies)', () => {
    const collections = createRpgEncounterCollections();
    const mote = { x: 0, y: 0 };
    const closerButExcluded = makeEntity(1, 0, 10);
    const fartherButSearched = makeEntity(20, 0, 10);
    collections.amberEnemies.push(closerButExcluded as never);
    collections.sapphireEnemies.push(fartherButSearched as never);

    const result = findDevStatusComboNearestTarget(collections, mote, null);
    expect(result).toBe(fartherButSearched);
  });

  it('gives the live boss precedence when strictly closer than any searched-family enemy', () => {
    const collections = createRpgEncounterCollections();
    const mote = { x: 0, y: 0 };
    const enemy = makeEntity(50, 0, 10);
    collections.enemies.push(enemy as never);
    const boss = makeBoss(5, 0, 100);

    const result = findDevStatusComboNearestTarget(collections, mote, boss);
    expect(result).toBe(boss);
  });

  it('ignores a dead boss even if it would otherwise be nearest', () => {
    const collections = createRpgEncounterCollections();
    const mote = { x: 0, y: 0 };
    const enemy = makeEntity(50, 0, 10);
    collections.enemies.push(enemy as never);
    const deadBoss = makeBoss(1, 0, 0);

    const result = findDevStatusComboNearestTarget(collections, mote, deadBoss);
    expect(result).toBe(enemy);
  });

  it('returns null when nothing searched is alive and there is no boss', () => {
    const collections = createRpgEncounterCollections();
    const mote = { x: 0, y: 0 };
    collections.enemies.push(makeEntity(1, 0, 0) as never);

    const result = findDevStatusComboNearestTarget(collections, mote, null);
    expect(result).toBeNull();
  });
});
