import { describe, expect, it } from 'vitest';
import {
  BOSS_DEATH_RESTART_CLEAR_KEYS,
  BOSS_ENTRY_CLEAR_KEYS,
  NORMAL_DEATH_RESTART_CLEAR_KEYS,
  RPG_ENCOUNTER_COLLECTION_KEYS,
  RPG_OVERLAY_FADE_BODY_KEYS,
  RPG_VERDURE_RESIZE_BODY_KEYS,
  ZONE_SWITCH_CLEAR_KEYS,
  applyVerdureResizeBodyProfile,
  clearForBossEntry,
  clearForDeathRestart,
  clearForZoneSwitch,
  createRpgEncounterCollections,
  hasOverlayFadeOverlap,
  stepOverlayFadeAlpha,
  type RpgEncounterCollections,
} from '../rpg-encounter-collections';
import type { RpgUpdateCtx } from '../rpg-render-update';
import type { RpgDrawCtx } from '../rpg-render-draw';
import type { RpgTargetingCtx } from '../rpg-targeting-types';
import type { WaveManagerCtx } from '../rpg-wave-manager';
import type { RpgDeathRestartCtx } from '../rpg-death-restart';
import type { RpgFieldSpace } from '../rpgFieldSpace';
import { doRestart } from '../rpg-death-restart';
import { createBossAttackState } from '../rpg-boss-attack-types';

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

function createRestartContext(
  collections: RpgEncounterCollections,
  bossId: number | null,
): { ctx: RpgDeathRestartCtx; getExitCount(): number; getStartedBossId(): number | null } {
  let exitCount = 0;
  let startedBossId: number | null = null;
  let phase: RpgDeathRestartCtx['getRpgPhase'] extends () => infer T ? T : never = 'alive';
  const ctx: RpgDeathRestartCtx = {
    collections,
    getRpgPhase: () => phase,
    setRpgPhase: (next) => { phase = next; },
    getPhaseTimerMs: () => 0,
    setPhaseTimerMs: () => {},
    getDeathAlpha: () => 1,
    setDeathAlpha: () => {},
    getScreenDarken: () => 0,
    setScreenDarken: () => {},
    getRestartFadeAlpha: () => 0,
    setRestartFadeAlpha: () => {},
    setPlayerIFramesMs: () => {},
    mote: {
      x: 5, y: 6, vx: 1, vy: 1,
      trailX: new Float64Array(1), trailY: new Float64Array(1),
      trailHead: 1, trailCount: 1,
    },
    playerStats: { hp: 0, maxHp: 10, atk: 1, def: 1, regen: 0 },
    playerMovementState: { glowMovementIntensity: 1, playerAimAngle: 0 },
    bossAttackState: createBossAttackState(),
    weaponSystems: { reset: () => {} } as never,
    weaponAttackTimers: new Map([['test', 1]]),
    fluid: { reset: () => {} },
    bossWave: {
      exitBossWave: () => { exitCount++; },
      startBossFight: (id) => { startedBossId = id; },
    },
    getBossEnemy: () => bossId === null ? null : { bossId } as never,
    setBossEnemy: () => {},
    setBinaryLaserSweep: () => {},
    setDanmakuSafeZone: () => {},
    setIsBossFightFromMenu: () => {},
    setBossHitsInRound: () => {},
    setCurrentWave: () => {},
    setIsInterWave: () => {},
    setInterWaveTimerMs: () => {},
    getWidthPx: () => 360,
    getHeightPx: () => 640,
    rpgSimState: {
      respawnWave: 5,
      consecutiveWaveStreak: 2,
      damageFreeWaveStreak: 2,
      tookDamageThisWave: true,
    },
    applyEquipmentStats: () => {},
  };
  return {
    ctx,
    getExitCount: () => exitCount,
    getStartedBossId: () => startedBossId,
  };
}

describe('RPG encounter collection factory', () => {
  it('creates separate empty objects and arrays for every renderer instance', () => {
    const first = createRpgEncounterCollections();
    const second = createRpgEncounterCollections();

    expect(first).not.toBe(second);
    expect(new Set(RPG_ENCOUNTER_COLLECTION_KEYS).size).toBe(RPG_ENCOUNTER_COLLECTION_KEYS.length);
    expect(Object.keys(first).sort()).toEqual([...RPG_ENCOUNTER_COLLECTION_KEYS].sort());
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

describe('RPG encounter semantic body profiles', () => {
  const expectedVerdureResizeKeys = [
    'enemies', 'sapphireEnemies', 'emeraldEnemies', 'amberEnemies', 'voidEnemies',
    'quartzEnemies', 'rubyEnemies', 'sunstoneEnemies', 'citrineEnemies', 'ioliteEnemies',
    'amethystEnemies', 'diamondEnemies', 'nullstoneEnemies', 'fracterylEnemies',
    'eigensteinEnemies', 'eliteEnemies', 'polyominoEnemies', 'fissilePolyominoEnemies',
    'refractorPolyominoEnemies', 'dustWispEnemies', 'ribbonWormEnemies',
    'lanternMothEnemies', 'eyeStalkEnemies', 'jellyfishEnemies', 'eliteJellyfishEnemies',
    'clothGhostEnemies', 'plantTurretEnemies', 'gearInsectEnemies', 'spiderCrawlerEnemies',
    'moteSwarmEnemies', 'shadowHandEnemies', 'sandFishEnemies', 'quartzFishEnemies',
    'rubyFishEnemies', 'sunstoneFishEnemies', 'emeraldFishEnemies', 'sapphireFishEnemies',
    'amethystFishEnemies', 'diamondFishEnemies',
  ] as const satisfies readonly EncounterCollectionKey[];

  const expectedOverlayFadeKeys = [
    'enemies', 'sapphireEnemies', 'emeraldEnemies', 'amberEnemies', 'voidEnemies',
    'quartzEnemies', 'rubyEnemies', 'sunstoneEnemies', 'citrineEnemies', 'ioliteEnemies',
    'amethystEnemies', 'diamondEnemies', 'nullstoneEnemies', 'fracterylEnemies',
    'eigensteinEnemies', 'eliteEnemies', 'polyominoEnemies', 'fissilePolyominoEnemies',
    'refractorPolyominoEnemies', 'binaryRingEnemies', 'nadirCubePointEnemies',
    'stardustEnemies', 'dustWispEnemies', 'ribbonWormEnemies', 'lanternMothEnemies',
    'eyeStalkEnemies', 'jellyfishEnemies', 'eliteJellyfishEnemies', 'clothGhostEnemies',
    'plantTurretEnemies', 'gearInsectEnemies', 'spiderCrawlerEnemies', 'moteSwarmEnemies',
    'shadowHandEnemies', 'sandFishEnemies', 'quartzFishEnemies', 'rubyFishEnemies',
    'sunstoneFishEnemies', 'emeraldFishEnemies', 'sapphireFishEnemies', 'amethystFishEnemies',
    'diamondFishEnemies',
  ] as const satisfies readonly EncounterCollectionKey[];

  it('preserves the exact distinct Verdure-resize and overlay-fade memberships', () => {
    expect(RPG_VERDURE_RESIZE_BODY_KEYS).toEqual(expectedVerdureResizeKeys);
    expect(RPG_OVERLAY_FADE_BODY_KEYS).toEqual(expectedOverlayFadeKeys);
    expect(RPG_VERDURE_RESIZE_BODY_KEYS).toHaveLength(39);
    expect(RPG_OVERLAY_FADE_BODY_KEYS).toHaveLength(42);

    expect(RPG_VERDURE_RESIZE_BODY_KEYS).not.toContain('binaryRingEnemies');
    expect(RPG_VERDURE_RESIZE_BODY_KEYS).not.toContain('nadirCubePointEnemies');
    expect(RPG_VERDURE_RESIZE_BODY_KEYS).not.toContain('stardustEnemies');
    expect(RPG_OVERLAY_FADE_BODY_KEYS).toContain('binaryRingEnemies');
    expect(RPG_OVERLAY_FADE_BODY_KEYS).toContain('nadirCubePointEnemies');
    expect(RPG_OVERLAY_FADE_BODY_KEYS).toContain('stardustEnemies');
  });

  it('uses unique canonical keys and excludes non-body collection families', () => {
    const canonicalKeys = new Set<EncounterCollectionKey>(RPG_ENCOUNTER_COLLECTION_KEYS);
    const excludedKeys: EncounterCollectionKey[] = [
      'spawnQueue', 'sapphireMissiles', 'amberShards', 'quartzSpikes', 'rubyBolts',
      'citrineBolts', 'amethystShards', 'diamondShards', 'voidTendrils', 'fracterylShards',
      'eigensteinBeams', 'binaryRingMissiles', 'nadirCubeMines', 'nadirCubeTrailSegments',
      'nadirCubeTurretBolts', 'nadirCubeLinkLasers', 'horizonPentagonGroups', 'alivenGroups',
      'lifeColonies', 'plantProjectiles', 'fishMines', 'fishSpikes', 'fishBolts', 'fishDecoys',
      'bossProjectiles', 'teleportParticles', 'luckyMotes', 'luckyMotePopups', 'hitEffects',
      'shotLines', 'damageNumbers', 'deathParticles',
    ];

    for (const profile of [RPG_VERDURE_RESIZE_BODY_KEYS, RPG_OVERLAY_FADE_BODY_KEYS]) {
      expect(new Set(profile).size).toBe(profile.length);
      for (const key of profile) expect(canonicalKeys.has(key)).toBe(true);
      for (const key of excludedKeys) expect(profile).not.toContain(key);
    }
  });

  it('offers every Verdure-profile body once with margin 8 and preserves direct mutation', () => {
    const collections = createRpgEncounterCollections();
    const seededBodies = new Map<EncounterCollectionKey, { x: number; y: number; vx: number; vy: number }>();
    for (let i = 0; i < RPG_VERDURE_RESIZE_BODY_KEYS.length; i++) {
      const key = RPG_VERDURE_RESIZE_BODY_KEYS[i];
      const body = { x: i, y: i + 1, vx: 2, vy: 3 };
      seededBodies.set(key, body);
      collections[key].push(body as never);
    }
    collections.binaryRingEnemies.push({ x: 5, y: 5, vx: 4, vy: 4 } as never);
    const visited: Array<{ body: { x: number; y: number }; margin: number }> = [];

    applyVerdureResizeBodyProfile(collections, (body, margin) => {
      visited.push({ body, margin });
      if (body.x === 0) {
        body.x = 50;
        body.y = 60;
        body.vx = 0;
        body.vy = 0;
      }
    });

    expect(visited).toHaveLength(39);
    expect(visited.every(({ margin }) => margin === 8)).toBe(true);
    expect(visited.map(({ body }) => body)).toEqual([...seededBodies.values()]);
    expect(collections.enemies[0]).toMatchObject({ x: 50, y: 60, vx: 0, vy: 0 });
    expect(collections.sapphireEnemies[0]).toMatchObject({ x: 1, y: 2, vx: 2, vy: 3 });
    expect(collections.binaryRingEnemies[0]).toMatchObject({ x: 5, y: 5, vx: 4, vy: 4 });
  });
});

describe('RPG overlay-fade characterization', () => {
  const rects = [{ left: 0, top: 0, right: 10, bottom: 10 }];
  const identityFieldSpace = {
    worldToScreen: ({ x, y }: { x: number; y: number }) => ({ x, y }),
  } as RpgFieldSpace;

  it('ignores dead bodies and treats a missing hp field as living', () => {
    const collections = createRpgEncounterCollections();
    collections.enemies.push({ x: 5, y: 5, hp: 0 } as never);
    expect(hasOverlayFadeOverlap(
      collections,
      { x: 100, y: 100 },
      null,
      identityFieldSpace,
      rects,
    )).toBe(false);

    collections.sapphireEnemies.push({ x: 5, y: 5 } as never);
    expect(hasOverlayFadeOverlap(
      collections,
      { x: 100, y: 100 },
      null,
      identityFieldSpace,
      rects,
    )).toBe(true);
  });

  it('preserves separate player and living-boss overlap with boss padding 18', () => {
    const collections = createRpgEncounterCollections();
    expect(hasOverlayFadeOverlap(
      collections,
      { x: 5, y: 5 },
      null,
      identityFieldSpace,
      rects,
    )).toBe(true);

    expect(hasOverlayFadeOverlap(
      collections,
      { x: 100, y: 100 },
      { x: 28, y: 28, hp: 1 },
      identityFieldSpace,
      rects,
    )).toBe(true);
    expect(hasOverlayFadeOverlap(
      collections,
      { x: 100, y: 100 },
      { x: 28, y: 28, hp: 0 },
      identityFieldSpace,
      rects,
    )).toBe(false);
  });

  it('short-circuits after the first living body overlap in profile order', () => {
    const collections = createRpgEncounterCollections();
    collections.enemies.push({ x: 5, y: 5, hp: 1 } as never);
    collections.sapphireEnemies.push({ x: 5, y: 5, hp: 1 } as never);
    let projectionCount = 0;
    const countingFieldSpace = {
      worldToScreen: ({ x, y }: { x: number; y: number }) => {
        projectionCount++;
        return { x, y };
      },
    } as RpgFieldSpace;

    expect(hasOverlayFadeOverlap(
      collections,
      { x: 100, y: 100 },
      null,
      countingFieldSpace,
      rects,
    )).toBe(true);
    expect(projectionCount).toBe(2);
  });

  it('preserves the 0.16 interpolation factor and 0.30 overlap floor', () => {
    expect(stepOverlayFadeAlpha(1, true)).toBeCloseTo(0.888);
    expect(stepOverlayFadeAlpha(0.3, true)).toBeCloseTo(0.3);
    expect(stepOverlayFadeAlpha(0, false)).toBeCloseTo(0.16);
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

  it('routes doRestart through the normal profile without replacing references', () => {
    const collections = createRpgEncounterCollections();
    const stardustReference = collections.stardustEnemies;
    const teleportReference = collections.teleportParticles;
    collections.stardustEnemies.push({ hp: 1 } as never);
    collections.teleportParticles.push({ alpha: 1 } as never);
    const restart = createRestartContext(collections, null);

    doRestart(restart.ctx);

    expect(collections.stardustEnemies).toBe(stardustReference);
    expect(collections.stardustEnemies).toEqual([]);
    expect(collections.teleportParticles).toBe(teleportReference);
    expect(collections.teleportParticles).toHaveLength(1);
    expect(restart.getExitCount()).toBe(1);
    expect(restart.getStartedBossId()).toBeNull();
  });

  it('routes boss doRestart through the effective boss profile', () => {
    const collections = createRpgEncounterCollections();
    seedEveryCollection(collections);
    const restart = createRestartContext(collections, 3);

    doRestart(restart.ctx);

    for (const key of RPG_ENCOUNTER_COLLECTION_KEYS) {
      expect(collections[key], `${key} boss restart`).toEqual([]);
    }
    expect(restart.getExitCount()).toBe(1);
    expect(restart.getStartedBossId()).toBe(3);
  });
});
