/**
 * lens-tier2-effects.test.ts — Tests for the Tier 2 lens effect handler.
 *
 * Covers:
 *   1. All 12 implemented T2 effects are recognised (isApplied: true, no STUB in name)
 *   2. Sand Spray triggers and applies Abraded
 *   3. Quartz Prism Split triggers and applies Refracted
 *   4. Ruby Beam Splinters triggers and applies Burning
 *   5. Citrine Solar Flare Burst triggers and applies Radiant
 *   6. Emerald Venom Spores triggers and applies Poisoned
 *   7. Sapphire Ice Shards triggers and applies Chilled
 *   8. Iolite Delayed Echo Strike fires after delay and applies Time-Warped
 *   9. Secondary hits do not recursively trigger Tier 2 effects
 *  10. All T3 effects remain STUB (not triggered)
 *  11. Weapons without lenses behave as before
 *  12. Amethyst Phantom Repeat applies Echo-Marked with a pending echo
 *  13. Diamond Shrapnel triggers and applies Cracked
 *  14. Nullstone Gravity Pulse triggers and applies Gravitized
 *  15. Fracteryl Recursive Splinter triggers and applies Fractal Wound
 *  16. Eigenstein Rift Slash triggers and applies Rift-Scarred
 */

import { describe, it, expect, vi, afterEach } from 'vitest';
import {
  handleLensTier2EffectsOnWeaponHit,
  tickLensTier2DelayedEffects,
  clearPendingTier2DelayedStrikes,
  type LensTier2HitParams,
} from '../lens-tier2-effects';
import {
  getActiveStatuses,
  clearEnemyStatuses,
} from '../../../sim/rpg/enemy-status-effects';
import { rollLensEffects } from '../../../data/rpg/lens-rolling';
import { LENS_T2_IMPLEMENTED_TIER_IDS } from '../../../data/rpg/lens-definitions';
import type { CraftedLensData } from '../../../data/rpg/lens-types';
import type { TierId } from '../../../data/tiers';

// ── Mock enemy and ctx factories ──────────────────────────────────────────────

function makeEnemy(overrides: Partial<{ hp: number; x: number; y: number }> = {}) {
  return { hp: 200, maxHp: 200, x: 100, y: 100, vx: 0, vy: 0, ...overrides };
}

type MockEnemy = ReturnType<typeof makeEnemy>;

/** Build a minimal RpgPlayerAttackCtx mock that routes findClosestTarget to a provided enemy. */
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
function makeCtx(enemy: MockEnemy | null = null): import('../../../render/rpg/rpg-player-attack').RpgPlayerAttackCtx & { _hitVisualsLog: Array<{x:number;y:number}>; _fluidLog: Array<{x:number;y:number}> } {
  const hitVisualsLog: Array<{ x: number; y: number }> = [];
  const fluidLog: Array<{ x: number; y: number }> = [];
  let t2EffectCallCount = 0;

  const laserEnemy = enemy as (MockEnemy & { kind?: string }) | null;

  const ctx = {
    mote: { x: 0, y: 0 },
    get bossEnemy() { return null; },
    rpgSimState: {} as any,
    playerStats: {} as any,
    enemies: laserEnemy ? [laserEnemy] : [],
    sapphireEnemies: [],
    sapphireMissiles: [],
    emeraldEnemies: [],
    amberEnemies: [],
    amberShards: [],
    voidEnemies: [],
    quartzEnemies: [],
    quartzSpikes: [],
    rubyEnemies: [],
    rubyBolts: [],
    sunstoneEnemies: [],
    citrineEnemies: [],
    citrineBolts: [],
    ioliteEnemies: [],
    amethystEnemies: [],
    amethystShards: [],
    diamondEnemies: [],
    diamondShards: [],
    nullstoneEnemies: [],
    voidTendrils: [],
    fracterylEnemies: [],
    fracterylShards: [],
    eigensteinEnemies: [],
    polyominoEnemies: [],
    fissilePolyominoEnemies: [],
    refractorPolyominoEnemies: [],
    eliteEnemies: [],
    binaryRingEnemies: [],
    stardustEnemies: [],
    alivenGroups: [],
    dustWispEnemies: [],
    ribbonWormEnemies: [],
    lanternMothEnemies: [],
    eyeStalkEnemies: [],
    jellyfishEnemies: [],
    clothGhostEnemies: [],
    plantTurretEnemies: [],
    gearInsectEnemies: [],
    spiderCrawlerEnemies: [],
    moteSwarmEnemies: [],
    shadowHandEnemies: [],
    sandFishEnemies: [],
    quartzFishEnemies: [],
    rubyFishEnemies: [],
    sunstoneFishEnemies: [],
    emeraldFishEnemies: [],
    sapphireFishEnemies: [],
    amethystFishEnemies: [],
    diamondFishEnemies: [],
    plantProjectiles: [],

    // Damage functions — only damageEnemy used in tests (targets are LaserEnemy)
    damageEnemy: (e: MockEnemy, dmg: number, _pierce: number) => {
      const actual = Math.min(e.hp, dmg);
      e.hp -= actual;
      return actual;
    },
    damageSapphireEnemy: () => 0,
    damageMissile: () => 0,
    damageEmeraldEnemy: () => 0,
    damageAmberEnemy: () => 0,
    damageAmberShard: () => 0,
    damageVoidEnemy: () => 0,
    damageQuartzEnemy: () => 0,
    damageQuartzSpike: () => 0,
    damageRubyEnemy: () => 0,
    damageRubyBolt: () => 0,
    damageSunstoneEnemy: () => 0,
    damageCitrineEnemy: () => 0,
    damageCitrineBolt: () => 0,
    damageIoliteEnemy: () => 0,
    damageAmethystEnemy: () => 0,
    damageAmethystShard: () => 0,
    damageDiamondEnemy: () => 0,
    damageDiamondShard: () => 0,
    damageNullstoneEnemy: () => 0,
    damageVoidTendril: () => 0,
    damageFracterylEnemy: () => 0,
    damageFracterylShard: () => 0,
    damageEigensteinEnemy: () => 0,
    damagePolyominoEnemy: () => 0,
    damageFissilePolyominoEnemy: () => 0,
    damageRefractorPolyominoEnemy: () => 0,
    damageEliteEnemy: () => 0,
    damageBossEnemy: () => 0,
    damageAlivenParticle: () => 0,
    damageDustWispEnemy: () => 0,
    damageRibbonWormEnemy: () => 0,
    damageLanternMothEnemy: () => 0,
    damageEyeStalkEnemy: () => 0,
    damageJellyfishEnemy: () => 0,
    damageClothGhostEnemy: () => 0,
    damagePlantTurretEnemy: () => 0,
    damageGearInsectEnemy: () => 0,
    damageSpiderCrawlerEnemy: () => 0,
    damageMoteSwarmEnemy: () => 0,
    damageShadowHandEnemy: () => 0,
    damageSandFishEnemy: () => 0,
    damageQuartzFishEnemy: () => 0,
    damageRubyFishEnemy: () => 0,
    damageSunstoneFishEnemy: () => 0,
    damageEmeraldFishEnemy: () => 0,
    damageSapphireFishEnemy: () => 0,
    damageAmethystFishEnemy: () => 0,
    damageDiamondFishEnemy: () => 0,
    damagePlantProjectile: () => 0,

    spawnHitVisuals: () => {},
    spawnHitVisualsAt: (x: number, y: number) => { hitVisualsLog.push({ x, y }); },

    fluid: {
      addExplosion: (x: number, y: number) => { fluidLog.push({ x, y }); },
    },

    findClosestTarget: (rangeSq: number) => {
      if (!laserEnemy || laserEnemy.hp <= 0) return null;
      const dx = laserEnemy.x - 0;
      const dy = laserEnemy.y - 0;
      if (dx * dx + dy * dy > rangeSq) return null;
      return {
        kind: 'laser' as any,
        x: laserEnemy.x,
        y: laserEnemy.y,
        distSq: dx * dx + dy * dy,
        laser: laserEnemy,
      };
    },

    spawnSandProjectile: () => {},
    spawnPoisonBolt: () => {},
    spawnEmeraldMissile: () => {},
    fireLaserBeam: () => {},
    layMine: () => {},
    spawnFracterylSpearVolley: () => {},
    applyNullstonePull: () => {},
    getWeaponAtkMultiplier: () => 1,
    getWeaponRngMultiplier: () => 1,
    getWeaponPrcMultiplier: () => 1,

    _hitVisualsLog: hitVisualsLog,
    _fluidLog: fluidLog,
    _t2EffectCallCount: () => t2EffectCallCount,
  } as unknown as ReturnType<typeof makeCtx>;

  return ctx;
}

// ── Lens factories ────────────────────────────────────────────────────────────

/** Build a lens with a guaranteed T2 effect for the given tierId (rng = always 0). */
function makeLensWithT2(tierId: TierId, magnitude = 20): CraftedLensData {
  return {
    id: `lens_${tierId}`,
    type: 'lens',
    name: `${tierId} lens`,
    ingredients: [{ tierId, refinedCount: 5 }],
    totalWeightedMoteValue: 500,
    forgeCraftLevel: 5,
    effects: [
      {
        tierId,
        effectTier: 1,
        key: `${tierId}_t1`,
        name: 'T1',
        description: '',
        magnitude,
        quality: 0.5,
        rarity: 'Common',
        isApplied: true,
      },
      {
        tierId,
        effectTier: 2,
        key: `${tierId}_t2`,
        name: 'T2',
        description: '',
        magnitude,
        quality: 0.5,
        rarity: 'Common',
        isApplied: LENS_T2_IMPLEMENTED_TIER_IDS.has(tierId),
      },
    ],
  };
}

function makeParams(
  tierId: TierId,
  enemy: MockEnemy,
  hitDamage = 100,
): LensTier2HitParams {
  return {
    targetEntity: enemy,
    hitDamage,
    lens: makeLensWithT2(tierId),
    weaponId: 'weapon_test',
    ctx: makeCtx(enemy) as any,
  };
}

// ── Cleanup ───────────────────────────────────────────────────────────────────

afterEach(() => {
  clearPendingTier2DelayedStrikes();
  vi.restoreAllMocks();
});

// ── 1. All implemented T2 effects recognized ──────────────────────────────────

describe('lens-tier2-effects — 1. All 12 T2 tiers recognized', () => {
  const implementedTiers: TierId[] = [
    'sand', 'quartz', 'ruby', 'citrine', 'emerald', 'sapphire', 'iolite',
    'amethyst', 'diamond', 'nullstone', 'fracteryl', 'eigenstein',
  ];

  it.each(implementedTiers)('%s T2: isApplied true and name has no STUB', (tierId) => {
    const effects = rollLensEffects([{ tierId, refinedCount: 5 }], 5, () => 0);
    const t2 = effects.find(e => e.effectTier === 2);
    expect(t2).toBeDefined();
    expect(t2!.isApplied).toBe(true);
    expect(t2!.name).not.toContain('STUB');
  });
});

// ── 2–8. Each effect triggers and applies matching T1 status ─────────────────

// Helper: always proc (Math.random returns 0)
function withAlwaysProc<T>(fn: () => T): T {
  vi.spyOn(Math, 'random').mockReturnValue(0);
  return fn();
}

describe('lens-tier2-effects — 2. Sand Spray applies Abraded', () => {
  it('Sand Spray applies Abraded to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('sand', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'abraded')).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

describe('lens-tier2-effects — 3. Quartz Prism Split applies Refracted', () => {
  it('Quartz Prism Split applies Refracted to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('quartz', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'refracted')).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

describe('lens-tier2-effects — 4. Ruby Beam Splinters applies Burning', () => {
  it('Ruby Beam Splinters applies Burning to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('ruby', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'burning')).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

describe('lens-tier2-effects — 5. Citrine Solar Flare Burst applies Radiant', () => {
  it('Citrine Solar Flare Burst applies Radiant to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('citrine', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'radiant')).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

describe('lens-tier2-effects — 6. Emerald Venom Spores applies Poisoned', () => {
  it('Emerald Venom Spores applies Poisoned to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('emerald', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'poisoned')).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

describe('lens-tier2-effects — 7. Sapphire Ice Shards applies Chilled', () => {
  it('Sapphire Ice Shards applies Chilled to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('sapphire', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'chilled')).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

describe('lens-tier2-effects — 8. Iolite Delayed Echo Strike', () => {
  it('does not deal damage before delay expires', () => {
    const enemy = makeEnemy({ hp: 200 });
    const params = makeParams('iolite', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    tickLensTier2DelayedEffects(100); // well before 500ms
    expect(enemy.hp).toBe(200);
  });

  it('deals damage after delay fires (700ms tick)', () => {
    const enemy = makeEnemy({ hp: 200 });
    const params = makeParams('iolite', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    tickLensTier2DelayedEffects(900); // past max 800ms delay
    expect(enemy.hp).toBeLessThan(200);
  });

  it('applies Time-Warped to target when delayed strike fires', () => {
    const enemy = makeEnemy({ hp: 200 });
    const params = makeParams('iolite', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    tickLensTier2DelayedEffects(900);
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'timeWarped')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('does not fire if target is already dead', () => {
    const enemy = makeEnemy({ hp: 0 });
    const params = makeParams('iolite', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    tickLensTier2DelayedEffects(900);
    // hp stays at 0, no underflow
    expect(enemy.hp).toBe(0);
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'timeWarped')).toBe(false);
  });
});

// ── 9. No recursive T2 triggering ────────────────────────────────────────────

describe('lens-tier2-effects — 9. No recursive T2 triggering', () => {
  it('secondary hits do not re-trigger T2 effects (no infinite loop)', () => {
    const enemy = makeEnemy({ hp: 1000 });
    const params = makeParams('sand', enemy);
    // If recursion occurred the call would blow the stack or cause infinite damage
    expect(() => {
      withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    }).not.toThrow();
    // HP must be finite and non-negative
    expect(enemy.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(enemy.hp)).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

// ── 10. T3 effects remain STUB ───────────────────────────────────────────────

describe('lens-tier2-effects — 10. All T3 effects remain STUB', () => {
  const tierIds: TierId[] = ['sand', 'ruby', 'citrine', 'amethyst', 'diamond', 'fracteryl', 'eigenstein'];

  it.each(tierIds)('%s T3: isApplied false and name contains STUB', (tierId) => {
    const effects = rollLensEffects([{ tierId, refinedCount: 5 }], 5, () => 0);
    const t3 = effects.find(e => e.effectTier === 3);
    expect(t3).toBeDefined();
    expect(t3!.isApplied).toBe(false);
    expect(t3!.name).toContain('STUB');
  });

  it('T3 effects in lens do not trigger any secondary hits', () => {
    const enemy = makeEnemy({ hp: 200 });
    const initialHp = enemy.hp;
    const lensWithT3: CraftedLensData = {
      id: 'lens_t3',
      type: 'lens',
      name: 'T3 lens',
      ingredients: [{ tierId: 'sand', refinedCount: 5 }],
      totalWeightedMoteValue: 500,
      forgeCraftLevel: 5,
      effects: [{
        tierId: 'sand',
        effectTier: 3,
        key: 'sand_t3',
        name: 'Sandstorm Cascade STUB',
        description: 'STUB',
        magnitude: 20,
        quality: 0.5,
        rarity: 'Common',
        isApplied: false,
      }],
    };
    const params: LensTier2HitParams = {
      targetEntity: enemy,
      hitDamage: 100,
      lens: lensWithT3,
      weaponId: 'w1',
      ctx: makeCtx(enemy) as any,
    };
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    expect(enemy.hp).toBe(initialHp);
  });
});

// ── 11. No lens = no T2 effects ──────────────────────────────────────────────

describe('lens-tier2-effects — 11. Weapons without lenses unaffected', () => {
  it('handleLensTier2EffectsOnWeaponHit does nothing with empty effects array', () => {
    const enemy = makeEnemy({ hp: 200 });
    const emptyLens: CraftedLensData = {
      id: 'lens_empty',
      type: 'lens',
      name: 'empty',
      ingredients: [],
      totalWeightedMoteValue: 0,
      forgeCraftLevel: 1,
      effects: [],
    };
    const params: LensTier2HitParams = {
      targetEntity: enemy,
      hitDamage: 100,
      lens: emptyLens,
      weaponId: 'w1',
      ctx: makeCtx(enemy) as any,
    };
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    expect(enemy.hp).toBe(200);
    expect(getActiveStatuses(enemy)).toHaveLength(0);
  });
});

// ── 12. Amethyst Phantom Repeat ───────────────────────────────────────────────

describe('lens-tier2-effects — 12. Amethyst Phantom Repeat', () => {
  it('applies Echo-Marked with a pending echo on proc', () => {
    const enemy = makeEnemy();
    const params = makeParams('amethyst', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    const echoStatus = statuses.find(s => s.key === 'echoMarked');
    expect(echoStatus).toBeDefined();
    expect(echoStatus?.pendingEchoes?.length).toBeGreaterThan(0);
    expect(echoStatus?.pendingEchoes?.[0]?.damage).toBeGreaterThan(0);
    clearEnemyStatuses(enemy);
  });

  it('Phantom Repeat is implemented (isApplied true, no STUB)', () => {
    const effects = rollLensEffects([{ tierId: 'amethyst', refinedCount: 5 }], 5, () => 0);
    const t2 = effects.find(e => e.effectTier === 2);
    expect(t2?.isApplied).toBe(true);
    expect(t2?.name).not.toContain('STUB');
  });

  it('does not reduce HP on the same call (echo fires async via status tick)', () => {
    const enemy = makeEnemy({ hp: 200 });
    const params = makeParams('amethyst', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    expect(enemy.hp).toBe(200);
    clearEnemyStatuses(enemy);
  });
});

// ── 13. Diamond Shrapnel ──────────────────────────────────────────────────────

describe('lens-tier2-effects — 13. Diamond Shrapnel applies Cracked', () => {
  it('Diamond Shrapnel applies Cracked to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('diamond', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'cracked')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('Diamond Shrapnel is implemented (isApplied true, no STUB)', () => {
    const effects = rollLensEffects([{ tierId: 'diamond', refinedCount: 5 }], 5, () => 0);
    const t2 = effects.find(e => e.effectTier === 2);
    expect(t2?.isApplied).toBe(true);
    expect(t2?.name).not.toContain('STUB');
  });
});

// ── 14. Nullstone Gravity Pulse ───────────────────────────────────────────────

describe('lens-tier2-effects — 14. Nullstone Gravity Pulse applies Gravitized', () => {
  it('Gravity Pulse applies Gravitized to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('nullstone', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'gravitized')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('Gravity Pulse is implemented (isApplied true, no STUB)', () => {
    const effects = rollLensEffects([{ tierId: 'nullstone', refinedCount: 5 }], 5, () => 0);
    const t2 = effects.find(e => e.effectTier === 2);
    expect(t2?.isApplied).toBe(true);
    expect(t2?.name).not.toContain('STUB');
  });

  it('Gravity Pulse pull is safe — HP stays finite and non-negative', () => {
    const enemy = makeEnemy({ hp: 1000 });
    const params = makeParams('nullstone', enemy);
    expect(() => withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params))).not.toThrow();
    expect(enemy.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(enemy.hp)).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

// ── 15. Fracteryl Recursive Splinter ─────────────────────────────────────────

describe('lens-tier2-effects — 15. Fracteryl Recursive Splinter applies Fractal Wound', () => {
  it('Recursive Splinter applies Fractal Wound to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('fracteryl', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'fractalWound')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('Recursive Splinter is implemented (isApplied true, no STUB)', () => {
    const effects = rollLensEffects([{ tierId: 'fracteryl', refinedCount: 5 }], 5, () => 0);
    const t2 = effects.find(e => e.effectTier === 2);
    expect(t2?.isApplied).toBe(true);
    expect(t2?.name).not.toContain('STUB');
  });

  it('Recursive Splinter depth capped — no infinite loop or stack overflow', () => {
    const enemy = makeEnemy({ hp: 1000 });
    const params = makeParams('fracteryl', enemy);
    expect(() => withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params))).not.toThrow();
    expect(enemy.hp).toBeGreaterThanOrEqual(0);
    expect(Number.isFinite(enemy.hp)).toBe(true);
    clearEnemyStatuses(enemy);
  });
});

// ── 16. Eigenstein Rift Slash ─────────────────────────────────────────────────

describe('lens-tier2-effects — 16. Eigenstein Rift Slash applies Rift-Scarred', () => {
  it('Rift Slash applies Rift-Scarred to target', () => {
    const enemy = makeEnemy();
    const params = makeParams('eigenstein', enemy);
    withAlwaysProc(() => handleLensTier2EffectsOnWeaponHit(params));
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'riftScarred')).toBe(true);
    clearEnemyStatuses(enemy);
  });

  it('Rift Slash is implemented (isApplied true, no STUB)', () => {
    const effects = rollLensEffects([{ tierId: 'eigenstein', refinedCount: 5 }], 5, () => 0);
    const t2 = effects.find(e => e.effectTier === 2);
    expect(t2?.isApplied).toBe(true);
    expect(t2?.name).not.toContain('STUB');
  });
});
