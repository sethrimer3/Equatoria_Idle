import { describe, expect, it } from 'vitest';
import {
  RPG_ATTACK_READINESS_EXCLUDED_KEYS,
  RPG_ATTACK_READINESS_PARTICIPATING_KEYS,
  hasAttackDispatchTarget,
} from '../rpg-player-attack-readiness';
import {
  RPG_ENCOUNTER_COLLECTION_KEYS,
  createRpgEncounterCollections,
  type RpgEncounterCollections,
} from '../rpg-encounter-collections';

type EncounterCollectionKey = keyof RpgEncounterCollections;

const expectedParticipatingKeys = [
  'enemies', 'sapphireEnemies', 'sapphireMissiles', 'emeraldEnemies',
  'amberEnemies', 'amberShards', 'voidEnemies', 'quartzEnemies', 'quartzSpikes',
  'rubyEnemies', 'rubyBolts', 'sunstoneEnemies', 'citrineEnemies', 'citrineBolts',
  'ioliteEnemies', 'amethystEnemies', 'amethystShards', 'diamondEnemies', 'diamondShards',
  'nullstoneEnemies', 'voidTendrils', 'fracterylEnemies', 'fracterylShards',
  'eigensteinEnemies', 'polyominoEnemies', 'fissilePolyominoEnemies',
  'refractorPolyominoEnemies', 'eliteEnemies', 'binaryRingEnemies', 'alivenGroups',
  'dustWispEnemies', 'ribbonWormEnemies', 'lanternMothEnemies', 'eyeStalkEnemies',
  'jellyfishEnemies', 'eliteJellyfishEnemies', 'clothGhostEnemies', 'plantTurretEnemies',
  'gearInsectEnemies', 'spiderCrawlerEnemies', 'moteSwarmEnemies', 'shadowHandEnemies',
  'sandFishEnemies', 'quartzFishEnemies', 'rubyFishEnemies', 'sunstoneFishEnemies',
  'emeraldFishEnemies', 'sapphireFishEnemies', 'amethystFishEnemies', 'diamondFishEnemies',
  'plantProjectiles', 'horizonPentagonGroups',
] as const satisfies readonly EncounterCollectionKey[];

const expectedExcludedKeys = [
  'spawnQueue', 'eigensteinBeams', 'binaryRingMissiles',
  'nadirCubePointEnemies', 'nadirCubeMines', 'nadirCubeTrailSegments',
  'nadirCubeTurretBolts', 'nadirCubeLinkLasers', 'stardustEnemies', 'lifeColonies',
  'fishMines', 'fishSpikes', 'fishBolts', 'fishDecoys', 'bossProjectiles',
  'teleportParticles', 'luckyMotes', 'luckyMotePopups', 'hitEffects', 'shotLines',
  'damageNumbers', 'deathParticles',
] as const satisfies readonly EncounterCollectionKey[];

describe('RPG player attack readiness profile', () => {
  it('preserves the exact 52 participating and 22 excluded canonical keys', () => {
    expect(RPG_ATTACK_READINESS_PARTICIPATING_KEYS).toEqual(expectedParticipatingKeys);
    expect(RPG_ATTACK_READINESS_EXCLUDED_KEYS).toEqual(expectedExcludedKeys);
    expect(new Set(RPG_ATTACK_READINESS_PARTICIPATING_KEYS).size).toBe(52);
    expect(new Set(RPG_ATTACK_READINESS_EXCLUDED_KEYS).size).toBe(22);

    const classified = [
      ...RPG_ATTACK_READINESS_PARTICIPATING_KEYS,
      ...RPG_ATTACK_READINESS_EXCLUDED_KEYS,
    ];
    expect(new Set(classified).size).toBe(RPG_ENCOUNTER_COLLECTION_KEYS.length);
    expect([...classified].sort()).toEqual([...RPG_ENCOUNTER_COLLECTION_KEYS].sort());
  });

  it('treats every direct-length participating family as ready independently', () => {
    for (const key of expectedParticipatingKeys) {
      if (key === 'alivenGroups') continue;
      const collections = createRpgEncounterCollections();
      collections[key].push({ sentinel: key } as never);
      expect(hasAttackDispatchTarget(collections, null), key).toBe(true);
    }
  });

  it('returns false for an empty encounter without a boss', () => {
    expect(hasAttackDispatchTarget(createRpgEncounterCollections(), null)).toBe(false);
  });

  it('requires a strictly living nested ALIVEN particle', () => {
    const collections = createRpgEncounterCollections();
    collections.alivenGroups.push({ particles: [] } as never);
    expect(hasAttackDispatchTarget(collections, null)).toBe(false);

    collections.alivenGroups[0] = {
      particles: [{ isAlive: false }, { isAlive: false }],
    } as never;
    expect(hasAttackDispatchTarget(collections, null)).toBe(false);

    collections.alivenGroups[0] = {
      particles: [{ isAlive: false }, { isAlive: true }],
    } as never;
    expect(hasAttackDispatchTarget(collections, null)).toBe(true);
  });

  it('preserves nullable boss presence without an HP check', () => {
    const collections = createRpgEncounterCollections();
    expect(hasAttackDispatchTarget(collections, null)).toBe(false);
    expect(hasAttackDispatchTarget(collections, { hp: 0 })).toBe(true);
    expect(hasAttackDispatchTarget(collections, { hp: -1 })).toBe(true);
  });

  it('keeps every excluded family non-participating independently', () => {
    for (const key of expectedExcludedKeys) {
      const collections = createRpgEncounterCollections();
      collections[key].push({ sentinel: key } as never);
      expect(hasAttackDispatchTarget(collections, null), key).toBe(false);
    }
  });
});
