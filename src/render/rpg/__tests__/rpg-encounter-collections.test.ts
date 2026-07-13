import { describe, expect, it } from 'vitest';
import {
  BOSS_DEATH_RESTART_CLEAR_KEYS,
  BOSS_ENTRY_CLEAR_KEYS,
  NORMAL_DEATH_RESTART_CLEAR_KEYS,
  RPG_ENCOUNTER_COLLECTION_KEYS,
  ZONE_SWITCH_CLEAR_KEYS,
  clearForBossEntry,
  clearForDeathRestart,
  clearForZoneSwitch,
  createRpgEncounterCollections,
  type RpgEncounterCollections,
} from '../rpg-encounter-collections';
import type { RpgUpdateCtx } from '../rpg-render-update';
import type { RpgDrawCtx } from '../rpg-render-draw';
import type { RpgTargetingCtx } from '../rpg-targeting-types';
import type { WaveManagerCtx } from '../rpg-wave-manager';
import type { RpgDeathRestartCtx } from '../rpg-death-restart';

type EncounterCollectionKey = keyof RpgEncounterCollections;

function seedEveryCollection(collections: RpgEncounterCollections): void {
  for (const key of RPG_ENCOUNTER_COLLECTION_KEYS) {
    collections[key].push({ key } as never);
  }
}

function verifyExactProfile(
  clear: (collections: RpgEncounterCollections) => void,
  clearedKeys: readonly EncounterCollectionKey[],
): void {
  const collections = createRpgEncounterCollections();
  const originalReferences = new Map<EncounterCollectionKey, unknown[]>();
  for (const key of RPG_ENCOUNTER_COLLECTION_KEYS) {
    originalReferences.set(key, collections[key]);
  }
  seedEveryCollection(collections);
  const cleared = new Set<EncounterCollectionKey>(clearedKeys);

  clear(collections);

  for (const key of RPG_ENCOUNTER_COLLECTION_KEYS) {
    expect(collections[key], `${key} reference`).toBe(originalReferences.get(key));
    expect(collections[key].length, `${key} membership`).toBe(cleared.has(key) ? 0 : 1);
  }

  clear(collections);
  for (const key of RPG_ENCOUNTER_COLLECTION_KEYS) {
    expect(collections[key], `${key} idempotent reference`).toBe(originalReferences.get(key));
    expect(collections[key].length, `${key} idempotent membership`).toBe(cleared.has(key) ? 0 : 1);
  }
}

describe('RPG encounter collection factory', () => {
  it('creates separate empty objects and arrays for every renderer instance', () => {
    const first = createRpgEncounterCollections();
    const second = createRpgEncounterCollections();

    expect(first).not.toBe(second);
    expect(new Set(RPG_ENCOUNTER_COLLECTION_KEYS).size).toBe(RPG_ENCOUNTER_COLLECTION_KEYS.length);
    for (const key of RPG_ENCOUNTER_COLLECTION_KEYS) {
      expect(first[key], `${key} first empty`).toEqual([]);
      expect(second[key], `${key} second empty`).toEqual([]);
      expect(first[key], `${key} separate identity`).not.toBe(second[key]);
    }
  });

  it('does not leak mutations between factory instances', () => {
    const first = createRpgEncounterCollections();
    const second = createRpgEncounterCollections();

    first.enemies.push({ sentinel: 'ordinary' } as never);
    first.bossProjectiles.push({ sentinel: 'boss' } as never);
    first.hitEffects.push({ sentinel: 'visual' } as never);

    expect(second.enemies).toEqual([]);
    expect(second.bossProjectiles).toEqual([]);
    expect(second.hitEffects).toEqual([]);
  });
});

describe('RPG encounter reset profiles', () => {
  it('preserves exact boss-entry membership and every array reference', () => {
    verifyExactProfile(clearForBossEntry, BOSS_ENTRY_CLEAR_KEYS);
  });

  it('preserves exact zone-switch membership and every array reference', () => {
    verifyExactProfile(clearForZoneSwitch, ZONE_SWITCH_CLEAR_KEYS);
  });

  it('uses the corrected exact normal-restart membership', () => {
    verifyExactProfile(
      (collections) => clearForDeathRestart(collections, 'normal'),
      NORMAL_DEATH_RESTART_CLEAR_KEYS,
    );
  });

  it('clears stale Stardust enemies on a normal death/restart', () => {
    const collections = createRpgEncounterCollections();
    collections.stardustEnemies.push({ hp: 1 } as never);

    clearForDeathRestart(collections, 'normal');

    expect(collections.stardustEnemies).toEqual([]);
  });

  it('characterizes the effective boss-restart membership', () => {
    verifyExactProfile(
      (collections) => clearForDeathRestart(collections, 'boss'),
      BOSS_DEATH_RESTART_CLEAR_KEYS,
    );
  });

  it('keeps representative ordinary, projectile, procedural, special, boss, reward, and visual references stable', () => {
    const collections = createRpgEncounterCollections();
    const references = {
      enemies: collections.enemies,
      sapphireMissiles: collections.sapphireMissiles,
      dustWispEnemies: collections.dustWispEnemies,
      horizonPentagonGroups: collections.horizonPentagonGroups,
      bossProjectiles: collections.bossProjectiles,
      luckyMotes: collections.luckyMotes,
      hitEffects: collections.hitEffects,
    };
    seedEveryCollection(collections);

    clearForZoneSwitch(collections);

    expect(collections.enemies).toBe(references.enemies);
    expect(collections.sapphireMissiles).toBe(references.sapphireMissiles);
    expect(collections.dustWispEnemies).toBe(references.dustWispEnemies);
    expect(collections.horizonPentagonGroups).toBe(references.horizonPentagonGroups);
    expect(collections.bossProjectiles).toBe(references.bossProjectiles);
    expect(collections.luckyMotes).toBe(references.luckyMotes);
    expect(collections.hitEffects).toBe(references.hitEffects);
  });
});

describe('RPG encounter context wiring', () => {
  it('keeps update, draw, targeting, wave, and restart consumers on the same references', () => {
    const collections = createRpgEncounterCollections();
    const update: Pick<RpgUpdateCtx, 'collections'> = { collections };
    const draw: Pick<RpgDrawCtx, 'collections' | 'enemies'> = {
      collections,
      enemies: collections.enemies,
    };
    const targeting: Pick<RpgTargetingCtx, 'collections' | 'enemies'> = {
      collections,
      enemies: collections.enemies,
    };
    const wave: Pick<WaveManagerCtx, 'collections' | 'enemies'> = {
      collections,
      enemies: collections.enemies,
    };
    const restart: Pick<RpgDeathRestartCtx, 'collections'> = { collections };

    expect(update.collections).toBe(collections);
    expect(draw.collections).toBe(collections);
    expect(targeting.collections).toBe(collections);
    expect(wave.collections).toBe(collections);
    expect(restart.collections).toBe(collections);
    expect(draw.enemies).toBe(collections.enemies);
    expect(targeting.enemies).toBe(collections.enemies);
    expect(wave.enemies).toBe(collections.enemies);

    collections.enemies.push({ hp: 1 } as never);
    clearForZoneSwitch(collections);

    expect(draw.enemies).toEqual([]);
    expect(targeting.enemies).toEqual([]);
    expect(wave.enemies).toEqual([]);
  });
});
