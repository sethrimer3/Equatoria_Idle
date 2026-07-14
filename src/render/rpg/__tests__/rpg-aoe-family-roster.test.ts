/**
 * rpg-aoe-family-roster.test.ts — Phase Seven characterization tests.
 *
 * Locks in the canonical AOE_FAMILY_ROSTER's membership/order/type-id
 * assignment against the pre-migration behavior of the three independent
 * rosters it replaces:
 *   1. rpg-combo-apply.ts::_applyAoeDmg() — 16-family literal (15 roster + eliteEnemies).
 *   2. rpg-player-attack-aoe.ts::aoeTargets — 15-family + eliteEnemies (dynamic tier id).
 *   3. rpg-player-attack-aoe.ts::comboArrays — 15-family (eliteEnemies handled separately).
 */
import { describe, expect, it } from 'vitest';
import {
  AOE_ELITE_FAMILY_KEY,
  AOE_FAMILY_ROSTER,
  RPG_ENCOUNTER_COLLECTION_KEYS,
  type RpgEncounterCollections,
} from '../rpg-encounter-collections';

// Exact membership/order/type-id recorded from source at the Phase Seven baseline
// (rpg-combo-apply.ts _applyAoeDmg's arrays literal minus eliteEnemies, which is
// identical in family/order to rpg-player-attack-aoe.ts's aoeTargets/comboArrays
// families before eliteEnemies).
const EXPECTED_ROSTER: readonly { key: keyof RpgEncounterCollections; typeId: string }[] = [
  { key: 'enemies', typeId: 'other' },
  { key: 'sapphireEnemies', typeId: 'sapphire' },
  { key: 'emeraldEnemies', typeId: 'emerald' },
  { key: 'amberEnemies', typeId: 'other' },
  { key: 'voidEnemies', typeId: 'other' },
  { key: 'quartzEnemies', typeId: 'other' },
  { key: 'rubyEnemies', typeId: 'ruby' },
  { key: 'sunstoneEnemies', typeId: 'other' },
  { key: 'citrineEnemies', typeId: 'other' },
  { key: 'ioliteEnemies', typeId: 'other' },
  { key: 'amethystEnemies', typeId: 'other' },
  { key: 'diamondEnemies', typeId: 'other' },
  { key: 'nullstoneEnemies', typeId: 'nullstone' },
  { key: 'fracterylEnemies', typeId: 'fracteryl' },
  { key: 'eigensteinEnemies', typeId: 'eigenstein' },
];

describe('AOE_FAMILY_ROSTER', () => {
  it('matches the exact pre-migration 15-family membership, order, and type-id assignment', () => {
    expect(AOE_FAMILY_ROSTER.map(e => ({ key: e.key, typeId: e.typeId }))).toEqual(EXPECTED_ROSTER);
  });

  it('excludes eliteEnemies (dynamic per-entity type id, not a static roster entry)', () => {
    const rosterKeys: readonly string[] = AOE_FAMILY_ROSTER.map(e => e.key);
    expect(rosterKeys.includes('eliteEnemies')).toBe(false);
    expect(AOE_ELITE_FAMILY_KEY).toBe('eliteEnemies');
  });

  it('every roster key exists in the canonical RPG_ENCOUNTER_COLLECTION_KEYS tuple', () => {
    const canonical = new Set<string>(RPG_ENCOUNTER_COLLECTION_KEYS);
    for (const { key } of AOE_FAMILY_ROSTER) expect(canonical.has(key)).toBe(true);
    expect(canonical.has(AOE_ELITE_FAMILY_KEY)).toBe(true);
  });

  it('_applyAoeDmg()\'s pre-migration 16-family union equals roster + eliteEnemies', () => {
    const applyAoeDmgFamilies = [
      'enemies', 'sapphireEnemies', 'emeraldEnemies', 'amberEnemies', 'voidEnemies',
      'quartzEnemies', 'rubyEnemies', 'sunstoneEnemies', 'citrineEnemies', 'ioliteEnemies',
      'amethystEnemies', 'diamondEnemies', 'nullstoneEnemies', 'fracterylEnemies',
      'eigensteinEnemies', 'eliteEnemies',
    ];
    const rosterPlusElite = [...AOE_FAMILY_ROSTER.map(e => e.key), AOE_ELITE_FAMILY_KEY];
    expect(rosterPlusElite).toEqual(applyAoeDmgFamilies);
  });

  it('aoeTargets\'s pre-migration family/type-id assignment equals roster + dynamic elite id', () => {
    const aoeTargetsAssignment = [
      { key: 'enemies', typeId: 'other' },
      { key: 'sapphireEnemies', typeId: 'sapphire' },
      { key: 'emeraldEnemies', typeId: 'emerald' },
      { key: 'amberEnemies', typeId: 'other' },
      { key: 'voidEnemies', typeId: 'other' },
      { key: 'quartzEnemies', typeId: 'other' },
      { key: 'rubyEnemies', typeId: 'ruby' },
      { key: 'sunstoneEnemies', typeId: 'other' },
      { key: 'citrineEnemies', typeId: 'other' },
      { key: 'ioliteEnemies', typeId: 'other' },
      { key: 'amethystEnemies', typeId: 'other' },
      { key: 'diamondEnemies', typeId: 'other' },
      { key: 'nullstoneEnemies', typeId: 'nullstone' },
      { key: 'fracterylEnemies', typeId: 'fracteryl' },
      { key: 'eigensteinEnemies', typeId: 'eigenstein' },
      // eliteEnemies: enemyTypeId = `elite_${tier}`, verified separately (dynamic).
    ];
    expect(AOE_FAMILY_ROSTER.map(e => ({ key: e.key, typeId: e.typeId }))).toEqual(aoeTargetsAssignment);
  });

  it('comboArrays\'s pre-migration family/type-id assignment equals roster (eliteEnemies excluded, handled by its own isInvuln-filtered loop)', () => {
    // Identical to aoeTargets minus eliteEnemies — already covered by EXPECTED_ROSTER above.
    expect(AOE_FAMILY_ROSTER.length).toBe(15);
  });
});
