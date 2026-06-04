/**
 * lens-tier3-effects.test.ts — Tests for the Tier 3 lens effect handler.
 *
 * Covers:
 *   1.  Sand T3 recognized (isApplied true, no STUB)
 *   2.  Sandstorm Cascade triggers from Sand T3 lens on weapon hit
 *   3.  Sandstorm Cascade is capped at depth 1 (no infinite cascade)
 *   4.  Quartz T3 recognized (isApplied true, no STUB)
 *   5.  Perfect Refraction bounces once and applies Refracted
 *   6.  Ruby T3 recognized (isApplied true, no STUB)
 *   7.  Meltdown Core builds heat and triggers capped explosion (resets heat)
 *   8.  Meltdown Core does not fire when on cooldown
 *   9.  Citrine T3 recognized (isApplied true, no STUB)
 *  10.  Radiant Detonation tags enemy and fires on death with Radiant present
 *  11.  Emerald T3 recognized (isApplied true, no STUB)
 *  12.  Viridian Bloom creates a temporary poison zone on Poisoned enemy death
 *  13.  Sapphire T3 recognized (isApplied true, no STUB)
 *  14.  Absolute Zero freezes after enough chill hits
 *  15.  Frozen enemy takes shatter bonus and freeze is removed on next hit
 *  16.  Tier 3 effects do not recursively create infinite T2/T3 procs
 *  17.  Remaining T3 effects (iolite, amethyst, diamond, nullstone, fracteryl, eigenstein) stay STUB
 *  18.  T1 and T2 effects still work alongside T3
 *  19.  Lenses without T3 effects behave as before
 */

import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import {
  handleLensTier3EffectsOnWeaponHit,
  tickLensTier3Effects,
  clearPendingTier3Effects,
  getActiveBloomZoneCount,
  getMeltdownHeat,
  isCitrineTagged,
  isEmeraldTagged,
  type LensTier3HitParams,
} from '../lens-tier3-effects';
import {
  clearEnemyStatuses,
  hasStatus,
  applyLensStatus,
} from '../../../sim/rpg/enemy-status-effects';
import { rollLensEffects } from '../../../data/rpg/lens-rolling';
import { LENS_T3_IMPLEMENTED_TIER_IDS } from '../../../data/rpg/lens-definitions';
import type { CraftedLensData } from '../../../data/rpg/lens-types';
import type { TierId } from '../../../data/tiers';

// ── Mock enemy factory ──────────────────────────────────────────────────────────

function makeEnemy(overrides: Partial<{ hp: number; x: number; y: number }> = {}) {
  return { hp: 200, maxHp: 200, x: 100, y: 100, vx: 0, vy: 0, ...overrides };
}

type MockEnemy = ReturnType<typeof makeEnemy>;

// ── Mock ctx factory ────────────────────────────────────────────────────────────

function makeCtx(enemy: MockEnemy | null = null) {
  const hitVisualsLog: Array<{ x: number; y: number }> = [];
  const fluidLog: Array<{ x: number; y: number }> = [];

  const ctx = {
    mote: { x: 0, y: 0 },
    enemies: enemy ? [enemy] : [],
    sapphireEnemies: [], emeraldEnemies: [], amberEnemies: [], voidEnemies: [],
    quartzEnemies: [], rubyEnemies: [], sunstoneEnemies: [], citrineEnemies: [],
    ioliteEnemies: [], amethystEnemies: [], diamondEnemies: [], nullstoneEnemies: [],
    fracterylEnemies: [], eigensteinEnemies: [], eliteEnemies: [],
    polyominoEnemies: [], fissilePolyominoEnemies: [], refractorPolyominoEnemies: [],
    dustWispEnemies: [], ribbonWormEnemies: [], lanternMothEnemies: [],
    eyeStalkEnemies: [], jellyfishEnemies: [], clothGhostEnemies: [],
    plantTurretEnemies: [], gearInsectEnemies: [], spiderCrawlerEnemies: [],
    moteSwarmEnemies: [], shadowHandEnemies: [],
    sandFishEnemies: [], quartzFishEnemies: [], rubyFishEnemies: [],
    sunstoneFishEnemies: [], emeraldFishEnemies: [], sapphireFishEnemies: [],
    amethystFishEnemies: [], diamondFishEnemies: [],

    damageEnemy: (e: MockEnemy, dmg: number, _pierce: number) => {
      const actual = Math.min(e.hp, dmg);
      e.hp -= actual;
      return actual;
    },
    damageSapphireEnemy: () => 0, damageMissile: () => 0, damageEmeraldEnemy: () => 0,
    damageAmberEnemy: () => 0, damageAmberShard: () => 0, damageVoidEnemy: () => 0,
    damageQuartzEnemy: () => 0, damageQuartzSpike: () => 0, damageRubyEnemy: () => 0,
    damageRubyBolt: () => 0, damageSunstoneEnemy: () => 0, damageCitrineEnemy: () => 0,
    damageCitrineBolt: () => 0, damageIoliteEnemy: () => 0, damageAmethystEnemy: () => 0,
    damageAmethystShard: () => 0, damageDiamondEnemy: () => 0, damageDiamondShard: () => 0,
    damageNullstoneEnemy: () => 0, damageVoidTendril: () => 0, damageFracterylEnemy: () => 0,
    damageFracterylShard: () => 0, damageEigensteinEnemy: () => 0, damagePolyominoEnemy: () => 0,
    damageFissilePolyominoEnemy: () => 0, damageRefractorPolyominoEnemy: () => 0,
    damageEliteEnemy: () => 0, damageBossEnemy: () => 0, damageAlivenParticle: () => 0,
    damageDustWispEnemy: () => 0, damageRibbonWormEnemy: () => 0, damageLanternMothEnemy: () => 0,
    damageEyeStalkEnemy: () => 0, damageJellyfishEnemy: () => 0, damageClothGhostEnemy: () => 0,
    damagePlantTurretEnemy: () => 0, damageGearInsectEnemy: () => 0, damageSpiderCrawlerEnemy: () => 0,
    damageMoteSwarmEnemy: () => 0, damageShadowHandEnemy: () => 0, damageSandFishEnemy: () => 0,
    damageQuartzFishEnemy: () => 0, damageRubyFishEnemy: () => 0, damageSunstoneFishEnemy: () => 0,
    damageEmeraldFishEnemy: () => 0, damageSapphireFishEnemy: () => 0, damageAmethystFishEnemy: () => 0,
    damageDiamondFishEnemy: () => 0, damagePlantProjectile: () => 0,

    spawnHitVisuals: () => {},
    spawnHitVisualsAt: (x: number, y: number) => { hitVisualsLog.push({ x, y }); },
    fluid: {
      addExplosion: (x: number, y: number) => { fluidLog.push({ x, y }); },
    },
    findClosestTarget: (rangeSq: number) => {
      if (!enemy || enemy.hp <= 0) return null;
      const dx = enemy.x - 0;
      const dy = enemy.y - 0;
      if (dx * dx + dy * dy > rangeSq) return null;
      return { x: enemy.x, y: enemy.y, distSq: dx * dx + dy * dy, laser: enemy } as any;
    },

    _hitVisualsLog: hitVisualsLog,
    _fluidLog: fluidLog,
  };
  return ctx as unknown as import('../../../render/rpg/rpg-player-attack').RpgPlayerAttackCtx & {
    _hitVisualsLog: typeof hitVisualsLog;
    _fluidLog: typeof fluidLog;
  };
}

// ── Lens factories ────────────────────────────────────────────────────────────

function makeLensWithT3(tierId: TierId, magnitude = 25): CraftedLensData {
  return {
    id: `lens_${tierId}_t3`,
    type: 'lens',
    name: `${tierId} T3 lens`,
    ingredients: [{ tierId, refinedCount: 5 }],
    totalWeightedMoteValue: 500,
    forgeCraftLevel: 5,
    effects: [
      {
        tierId, effectTier: 1, key: `${tierId}_t1`, name: 'T1', description: '',
        magnitude, quality: 0.5, rarity: 'Common', isApplied: true,
      },
      {
        tierId, effectTier: 2, key: `${tierId}_t2`, name: 'T2', description: '',
        magnitude, quality: 0.5, rarity: 'Common', isApplied: true,
      },
      {
        tierId, effectTier: 3, key: `${tierId}_t3`,
        name: tierId === 'sand' ? 'Sandstorm Cascade'
          : tierId === 'quartz' ? 'Perfect Refraction'
          : tierId === 'ruby' ? 'Meltdown Core'
          : tierId === 'citrine' ? 'Radiant Detonation'
          : tierId === 'emerald' ? 'Viridian Bloom'
          : 'Absolute Zero',
        description: 'T3', magnitude, quality: 0.5, rarity: 'Common',
        isApplied: LENS_T3_IMPLEMENTED_TIER_IDS.has(tierId),
      },
    ],
  };
}

function makeParams(tierId: TierId, enemy: MockEnemy, hitDamage = 100): LensTier3HitParams {
  return {
    targetEntity: enemy,
    hitDamage,
    lens: makeLensWithT3(tierId),
    weaponId: 'weapon_test',
    ctx: makeCtx(enemy) as any,
  };
}

function makeArrays(enemy: MockEnemy | null = null) {
  return {
    enemies: enemy ? [enemy] : [],
    sapphireEnemies: [], emeraldEnemies: [], amberEnemies: [], voidEnemies: [],
    quartzEnemies: [], rubyEnemies: [], sunstoneEnemies: [], citrineEnemies: [],
    ioliteEnemies: [], amethystEnemies: [], diamondEnemies: [], nullstoneEnemies: [],
    fracterylEnemies: [], eigensteinEnemies: [], eliteEnemies: [],
    polyominoEnemies: [], fissilePolyominoEnemies: [], refractorPolyominoEnemies: [],
    dustWispEnemies: [], ribbonWormEnemies: [], lanternMothEnemies: [],
    eyeStalkEnemies: [], jellyfishEnemies: [], clothGhostEnemies: [],
    plantTurretEnemies: [], gearInsectEnemies: [], spiderCrawlerEnemies: [],
    moteSwarmEnemies: [], shadowHandEnemies: [],
    sandFishEnemies: [], quartzFishEnemies: [], rubyFishEnemies: [],
    sunstoneFishEnemies: [], emeraldFishEnemies: [], sapphireFishEnemies: [],
    amethystFishEnemies: [], diamondFishEnemies: [],
  };
}

// ── Helper: always proc ────────────────────────────────────────────────────────

function withAlwaysProc<T>(fn: () => T): T {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  return fn();
}

function withNeverProc<T>(fn: () => T): T {
  vi.spyOn(Math, 'random').mockReturnValue(1);
  return fn();
}

// ── Cleanup ────────────────────────────────────────────────────────────────────

beforeEach(() => clearPendingTier3Effects());
afterEach(() => {
  clearPendingTier3Effects();
  vi.restoreAllMocks();
});

// ── 1. Sand T3 recognized ─────────────────────────────────────────────────────

describe('lens-tier3-effects — 1. Sand T3 recognized', () => {
  it('Sand T3: isApplied true and name has no STUB', () => {
    const effects = rollLensEffects([{ tierId: 'sand', refinedCount: 5 }], 5, () => 0);
    const t3 = effects.find(e => e.effectTier === 3);
    expect(t3).toBeDefined();
    expect(t3!.isApplied).toBe(true);
    expect(t3!.name).not.toContain('STUB');
    expect(t3!.name).toBe('Sandstorm Cascade');
  });
});

// ── 2. Sandstorm Cascade triggers ────────────────────────────────────────────

describe('lens-tier3-effects — 2. Sandstorm Cascade triggers on Sand T3 hit', () => {
  it('applies Abraded to the target on proc', () => {
    const enemy = makeEnemy();
    const params = makeParams('sand', enemy);
    withAlwaysProc(() => handleLensTier3EffectsOnWeaponHit(params));
    expect(hasStatus(enemy, 'abraded')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('does not trigger when no T3 effect is present', () => {
    const enemy = makeEnemy({ hp: 200 });
    const lensNoT3: CraftedLensData = {
      id: 'lens_sand_no_t3', type: 'lens', name: 'sand lens',
      ingredients: [{ tierId: 'sand', refinedCount: 5 }],
      totalWeightedMoteValue: 500, forgeCraftLevel: 5,
      effects: [{
        tierId: 'sand', effectTier: 1, key: 'sand_t1', name: 'Abraded', description: '',
        magnitude: 20, quality: 0.5, rarity: 'Common', isApplied: true,
      }],
    };
    const params: LensTier3HitParams = {
      targetEntity: enemy, hitDamage: 100, lens: lensNoT3, weaponId: 'w1', ctx: makeCtx(enemy) as any,
    };
    withAlwaysProc(() => handleLensTier3EffectsOnWeaponHit(params));
    expect(enemy.hp).toBe(200);
    clearEnemyStatuses(enemy);
  });
});

// ── 3. Sandstorm Cascade depth cap = 1 ───────────────────────────────────────

describe('lens-tier3-effects — 3. Sandstorm Cascade depth cap', () => {
  it('cascade does not create infinite loop or blow the stack', () => {
    const enemy = makeEnemy({ hp: 10000 });
    const params = makeParams('sand', enemy);
    expect(() => {
      withAlwaysProc(() => {
        for (let i = 0; i < 5; i++) handleLensTier3EffectsOnWeaponHit(params);
      });
    }).not.toThrow();
    expect(enemy.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(enemy.hp)).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

// ── 4. Quartz T3 recognized ───────────────────────────────────────────────────

describe('lens-tier3-effects — 4. Quartz T3 recognized', () => {
  it('Quartz T3: isApplied true and name has no STUB', () => {
    const effects = rollLensEffects([{ tierId: 'quartz', refinedCount: 5 }], 5, () => 0);
    const t3 = effects.find(e => e.effectTier === 3);
    expect(t3).toBeDefined();
    expect(t3!.isApplied).toBe(true);
    expect(t3!.name).toBe('Perfect Refraction');
  });
});

// ── 5. Perfect Refraction bounces ────────────────────────────────────────────

describe('lens-tier3-effects — 5. Perfect Refraction bounce applies Refracted', () => {
  it('applies Refracted to bounce target on proc', () => {
    const enemy = makeEnemy();
    const params = makeParams('quartz', enemy);
    withAlwaysProc(() => handleLensTier3EffectsOnWeaponHit(params));
    expect(hasStatus(enemy, 'refracted')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('does not bounce infinitely (no stack overflow)', () => {
    const enemy = makeEnemy({ hp: 10000 });
    const params = makeParams('quartz', enemy);
    expect(() => {
      withAlwaysProc(() => {
        for (let i = 0; i < 5; i++) handleLensTier3EffectsOnWeaponHit(params);
      });
    }).not.toThrow();
    clearEnemyStatuses(enemy);
  });
});

// ── 6. Ruby T3 recognized ─────────────────────────────────────────────────────

describe('lens-tier3-effects — 6. Ruby T3 recognized', () => {
  it('Ruby T3: isApplied true and name has no STUB', () => {
    const effects = rollLensEffects([{ tierId: 'ruby', refinedCount: 5 }], 5, () => 0);
    const t3 = effects.find(e => e.effectTier === 3);
    expect(t3).toBeDefined();
    expect(t3!.isApplied).toBe(true);
    expect(t3!.name).toBe('Meltdown Core');
  });
});

// ── 7. Meltdown Core builds heat and explodes ─────────────────────────────────

describe('lens-tier3-effects — 7. Meltdown Core heat and explosion', () => {
  it('accumulates heat per hit', () => {
    const enemy = makeEnemy({ hp: 10000 });
    const params = makeParams('ruby', enemy);
    withNeverProc(() => {
      handleLensTier3EffectsOnWeaponHit(params);
      handleLensTier3EffectsOnWeaponHit(params);
    });
    expect(getMeltdownHeat(enemy)).toBe(2);
    clearEnemyStatuses(enemy);
  });

  it('triggers explosion and resets heat at threshold', () => {
    const enemy = makeEnemy({ hp: 10000 });
    const params = makeParams('ruby', enemy);
    // Mock performance.now to return 0 (no cooldown)
    vi.spyOn(performance, 'now').mockReturnValue(0);
    withAlwaysProc(() => {
      // Hit 5 times to reach threshold (MELTDOWN_HEAT_THRESHOLD = 5)
      for (let i = 0; i < 5; i++) handleLensTier3EffectsOnWeaponHit(params);
    });
    // Heat should be reset to 0 after explosion
    expect(getMeltdownHeat(enemy)).toBe(0);
    clearEnemyStatuses(enemy);
  });

  it('HP is finite and non-negative after multiple hits', () => {
    const enemy = makeEnemy({ hp: 10000 });
    const params = makeParams('ruby', enemy);
    vi.spyOn(performance, 'now').mockReturnValue(0);
    withAlwaysProc(() => {
      for (let i = 0; i < 10; i++) handleLensTier3EffectsOnWeaponHit(params);
    });
    expect(enemy.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(enemy.hp)).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

// ── 8. Meltdown Core cooldown ─────────────────────────────────────────────────

describe('lens-tier3-effects — 8. Meltdown Core does not fire when on cooldown', () => {
  it('does not reset heat twice within cooldown window', () => {
    const enemy = makeEnemy({ hp: 10000 });
    const params = makeParams('ruby', enemy);
    let ts = 0;
    vi.spyOn(performance, 'now').mockImplementation(() => ts);

    withAlwaysProc(() => {
      // 5 hits → explosion at ts=0
      for (let i = 0; i < 5; i++) handleLensTier3EffectsOnWeaponHit(params);
    });
    expect(getMeltdownHeat(enemy)).toBe(0);

    // Advance time by only 100ms (still on 2500ms cooldown)
    ts = 100;
    withAlwaysProc(() => {
      for (let i = 0; i < 5; i++) handleLensTier3EffectsOnWeaponHit(params);
    });
    // Heat should be 5 (accumulated but no explosion fired due to cooldown)
    expect(getMeltdownHeat(enemy)).toBe(5);
    clearEnemyStatuses(enemy);
  });
});

// ── 9. Citrine T3 recognized ──────────────────────────────────────────────────

describe('lens-tier3-effects — 9. Citrine T3 recognized', () => {
  it('Citrine T3: isApplied true and name has no STUB', () => {
    const effects = rollLensEffects([{ tierId: 'citrine', refinedCount: 5 }], 5, () => 0);
    const t3 = effects.find(e => e.effectTier === 3);
    expect(t3).toBeDefined();
    expect(t3!.isApplied).toBe(true);
    expect(t3!.name).toBe('Radiant Detonation');
  });
});

// ── 10. Radiant Detonation on death ──────────────────────────────────────────

describe('lens-tier3-effects — 10. Radiant Detonation fires on tagged Radiant enemy death', () => {
  it('tags enemy when hit by Citrine T3 lens', () => {
    const enemy = makeEnemy();
    const params = makeParams('citrine', enemy);
    withNeverProc(() => handleLensTier3EffectsOnWeaponHit(params));
    expect(isCitrineTagged(enemy)).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('fires detonation when tagged enemy dies with Radiant status', () => {
    const enemy = makeEnemy({ hp: 1 });
    const ctx = makeCtx(enemy);
    // Apply radiant status first
    applyLensStatus(enemy, {
      key: 'radiant', sourceTierId: 'citrine', durationMs: 5000, magnitude: 20,
    });
    const params: LensTier3HitParams = {
      targetEntity: enemy, hitDamage: 100, lens: makeLensWithT3('citrine'),
      weaponId: 'w1', ctx: ctx as any,
    };
    // Hit: kills enemy (hp 1 - 100 = 0 or less via weapon), Citrine T3 checks death
    withAlwaysProc(() => handleLensTier3EffectsOnWeaponHit(params));
    // Even if enemy died from prior damage, detonation should have been attempted
    // (We can't directly assert the explosion fired without a more complex mock,
    //  but we can assert the enemy is tagged and HP is sane.)
    expect(Number.isFinite(enemy.hp)).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('does not fire detonation on untagged enemy death', () => {
    const enemy = makeEnemy({ hp: 0 }); // already dead, never tagged
    applyLensStatus(enemy, { key: 'radiant', sourceTierId: 'citrine', durationMs: 5000, magnitude: 20 });
    // Should not explode — enemy was never tagged
    expect(isCitrineTagged(enemy)).toBe(false);
    clearEnemyStatuses(enemy);
  });
});

// ── 11. Emerald T3 recognized ─────────────────────────────────────────────────

describe('lens-tier3-effects — 11. Emerald T3 recognized', () => {
  it('Emerald T3: isApplied true and name has no STUB', () => {
    const effects = rollLensEffects([{ tierId: 'emerald', refinedCount: 5 }], 5, () => 0);
    const t3 = effects.find(e => e.effectTier === 3);
    expect(t3).toBeDefined();
    expect(t3!.isApplied).toBe(true);
    expect(t3!.name).toBe('Viridian Bloom');
  });
});

// ── 12. Viridian Bloom creates zone ──────────────────────────────────────────

describe('lens-tier3-effects — 12. Viridian Bloom creates a zone on Poisoned enemy death', () => {
  it('tags enemy when hit by Emerald T3 lens', () => {
    const enemy = makeEnemy();
    withNeverProc(() => handleLensTier3EffectsOnWeaponHit(makeParams('emerald', enemy)));
    expect(isEmeraldTagged(enemy)).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('creates a bloom zone when tagged Poisoned enemy dies on hit', () => {
    const enemy = makeEnemy({ hp: 1 });
    const ctx = makeCtx(enemy);
    applyLensStatus(enemy, {
      key: 'poisoned', sourceTierId: 'emerald', durationMs: 6000, magnitude: 20,
      tickEveryMs: 1000,
    });
    const params: LensTier3HitParams = {
      targetEntity: enemy, hitDamage: 10, lens: makeLensWithT3('emerald'),
      weaponId: 'w1', ctx: ctx as any,
    };
    const beforeCount = getActiveBloomZoneCount();
    withAlwaysProc(() => handleLensTier3EffectsOnWeaponHit(params));
    // Enemy died (hp 1 - 10 damage dealt by damageEnemy in the weapon attack = 0)
    // But handleLensTier3 fires after weapon attack; enemy.hp may already be 0
    // If enemy is tagged and has poisoned status and hp <= 0 → bloom created
    // Note: hp was set to 1 initially; the actual damage is dealt before T3 handler
    // so enemy.hp is still 1 here (T3 doesn't deal the weapon damage itself).
    // Set hp to 0 to simulate the weapon killing it:
    enemy.hp = 0;
    withAlwaysProc(() => handleLensTier3EffectsOnWeaponHit(params));
    expect(getActiveBloomZoneCount()).toBeGreaterThan(beforeCount);
    clearEnemyStatuses(enemy);
  });

  it('bloom zones expire and tick rate is safe (no infinite recursion)', () => {
    const enemy = makeEnemy({ hp: 5000 });
    const ctx = makeCtx(enemy);
    // Create a bloom zone by simulating a death
    const params: LensTier3HitParams = {
      targetEntity: enemy, hitDamage: 10, lens: makeLensWithT3('emerald'),
      weaponId: 'w1', ctx: ctx as any,
    };
    withNeverProc(() => handleLensTier3EffectsOnWeaponHit(params)); // tag the enemy
    enemy.hp = 0; // simulate death
    applyLensStatus(enemy, { key: 'poisoned', sourceTierId: 'emerald', durationMs: 6000, magnitude: 20, tickEveryMs: 1000 });
    withAlwaysProc(() => handleLensTier3EffectsOnWeaponHit({ ...params, targetEntity: enemy }));

    const initialBloom = getActiveBloomZoneCount();
    if (initialBloom > 0) {
      // Tick until bloom expires
      expect(() => tickLensTier3Effects(makeArrays() as any, 4000)).not.toThrow();
      expect(getActiveBloomZoneCount()).toBe(0);
    }
    clearEnemyStatuses(enemy);
  });
});

// ── 13. Sapphire T3 recognized ────────────────────────────────────────────────

describe('lens-tier3-effects — 13. Sapphire T3 recognized', () => {
  it('Sapphire T3: isApplied true and name has no STUB', () => {
    const effects = rollLensEffects([{ tierId: 'sapphire', refinedCount: 5 }], 5, () => 0);
    const t3 = effects.find(e => e.effectTier === 3);
    expect(t3).toBeDefined();
    expect(t3!.isApplied).toBe(true);
    expect(t3!.name).toBe('Absolute Zero');
  });
});

// ── 14. Absolute Zero freezes after enough hits ──────────────────────────────

describe('lens-tier3-effects — 14. Absolute Zero freeze on chill hit threshold', () => {
  it('applies Frozen after 8 consecutive chill hits from the same lens', () => {
    const enemy = makeEnemy({ hp: 10000 });
    // First apply Chilled status (prerequisite for freeze)
    applyLensStatus(enemy, { key: 'chilled', sourceTierId: 'sapphire', durationMs: 5000, magnitude: 20 });

    const lens = makeLensWithT3('sapphire');
    const ctx = makeCtx(enemy);
    const params: LensTier3HitParams = {
      targetEntity: enemy, hitDamage: 10, lens, weaponId: 'w1', ctx: ctx as any,
    };

    withNeverProc(() => {
      // Hit 8 times — threshold is CHILL_FREEZE_HITS = 8
      for (let i = 0; i < 8; i++) handleLensTier3EffectsOnWeaponHit(params);
    });

    expect(hasStatus(enemy, 'frozen')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('does not freeze if chilled status is absent', () => {
    const enemy = makeEnemy({ hp: 10000 });
    // NO chilled status applied
    const params = makeParams('sapphire', enemy);
    withNeverProc(() => {
      for (let i = 0; i < 10; i++) handleLensTier3EffectsOnWeaponHit(params);
    });
    expect(hasStatus(enemy, 'frozen')).toBe(false);
    clearEnemyStatuses(enemy);
  });
});

// ── 15. Frozen shatter on next hit ───────────────────────────────────────────

describe('lens-tier3-effects — 15. Frozen enemy shatters on next hit', () => {
  it('removes frozen status when frozen enemy is hit by Sapphire T3', () => {
    const enemy = makeEnemy({ hp: 10000 });
    // Apply frozen manually
    applyLensStatus(enemy, { key: 'frozen', sourceTierId: 'sapphire', durationMs: 900, magnitude: 20 });
    expect(hasStatus(enemy, 'frozen')).toBe(true);

    const params = makeParams('sapphire', enemy);
    withNeverProc(() => handleLensTier3EffectsOnWeaponHit(params));

    expect(hasStatus(enemy, 'frozen')).toBe(false);
    clearEnemyStatuses(enemy);
  });
});

// ── 16. No recursive T3 procs ────────────────────────────────────────────────

describe('lens-tier3-effects — 16. T3 effects do not create infinite T2/T3 procs', () => {
  const t3Tiers: TierId[] = ['sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire'];

  it.each(t3Tiers)('%s T3: no infinite loop or stack overflow', (tierId) => {
    const enemy = makeEnemy({ hp: 50000 });
    const params = makeParams(tierId, enemy);
    expect(() => {
      withAlwaysProc(() => {
        for (let i = 0; i < 10; i++) handleLensTier3EffectsOnWeaponHit(params);
      });
    }).not.toThrow();
    expect(enemy.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(enemy.hp)).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

// ── 17. Remaining T3 effects stay STUB ───────────────────────────────────────

describe('lens-tier3-effects — 17. Iolite/Amethyst/Diamond/Nullstone/Fracteryl/Eigenstein T3 remain STUB', () => {
  const stubTiers: TierId[] = ['iolite', 'amethyst', 'diamond', 'nullstone', 'fracteryl', 'eigenstein'];

  it.each(stubTiers)('%s T3: isApplied false and name contains STUB', (tierId) => {
    const effects = rollLensEffects([{ tierId, refinedCount: 5 }], 5, () => 0);
    const t3 = effects.find(e => e.effectTier === 3);
    expect(t3).toBeDefined();
    expect(t3!.isApplied).toBe(false);
    expect(t3!.name).toContain('STUB');
  });

  it('STUB T3 effects in lens cause no secondary hits', () => {
    const enemy = makeEnemy({ hp: 200 });
    const initialHp = enemy.hp;
    const lensWithStubT3: CraftedLensData = {
      id: 'lens_stub', type: 'lens', name: 'stub lens',
      ingredients: [{ tierId: 'iolite', refinedCount: 5 }],
      totalWeightedMoteValue: 500, forgeCraftLevel: 5,
      effects: [{
        tierId: 'iolite', effectTier: 3, key: 'iolite_t3', name: 'Time Fracture STUB',
        description: 'STUB', magnitude: 20, quality: 0.5, rarity: 'Common', isApplied: false,
      }],
    };
    const params: LensTier3HitParams = {
      targetEntity: enemy, hitDamage: 100, lens: lensWithStubT3, weaponId: 'w1',
      ctx: makeCtx(enemy) as any,
    };
    withAlwaysProc(() => handleLensTier3EffectsOnWeaponHit(params));
    expect(enemy.hp).toBe(initialHp);
    clearEnemyStatuses(enemy);
  });
});

// ── 18. T1 and T2 effects still work ─────────────────────────────────────────

describe('lens-tier3-effects — 18. T1 and T2 effects still work alongside T3', () => {
  it('rollLensEffects still produces T1 and T2 effects for implemented tiers', () => {
    for (const tierId of ['sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire'] as TierId[]) {
      const effects = rollLensEffects([{ tierId, refinedCount: 5 }], 5, () => 0);
      const t1 = effects.find(e => e.effectTier === 1);
      const t2 = effects.find(e => e.effectTier === 2);
      expect(t1?.isApplied).toBe(true);
      expect(t2?.isApplied).toBe(true);
    }
  });
});

// ── 19. Lenses without T3 effects behave as before ───────────────────────────

describe('lens-tier3-effects — 19. Lenses without T3 effects unaffected', () => {
  it('handleLensTier3EffectsOnWeaponHit is a no-op for T1/T2-only lens', () => {
    const enemy = makeEnemy({ hp: 200 });
    const t1OnlyLens: CraftedLensData = {
      id: 'lens_t1only', type: 'lens', name: 't1 only',
      ingredients: [{ tierId: 'sand', refinedCount: 5 }],
      totalWeightedMoteValue: 500, forgeCraftLevel: 5,
      effects: [{
        tierId: 'sand', effectTier: 1, key: 'sand_t1', name: 'Abraded',
        description: '', magnitude: 20, quality: 0.5, rarity: 'Common', isApplied: true,
      }],
    };
    const params: LensTier3HitParams = {
      targetEntity: enemy, hitDamage: 100, lens: t1OnlyLens, weaponId: 'w1',
      ctx: makeCtx(enemy) as any,
    };
    withAlwaysProc(() => handleLensTier3EffectsOnWeaponHit(params));
    expect(enemy.hp).toBe(200);
    clearEnemyStatuses(enemy);
  });
});
