import { describe, expect, it, vi } from 'vitest';
import { createDamageFns } from '../rpg-damage';
import type { LaserEnemy, SapphireEnemy, SapphireMissile } from '../rpg-types';
import type { AmberShard, EliteEnemy } from '../rpg-enemy-types';
import type { SandFishEnemy } from '../rpg-procedural-types';
import type { AlivenParticle, AlivenParticleGroup } from '../rpg-aliven-types';
import type { HorizonPentagonGroup } from '../horizon-pentagon-types';
import { makeHorizonPentagonGroup } from '../horizon-pentagon-factories';

/**
 * Characterization tests for the pre-Phase-Six reflective Codex damage
 * policy in createDamageFns(). These pin the exact 37-participating /
 * 17-excluded partition and observable behavior so the Phase Six typed
 * replacement can be verified against them without changing any result.
 */

const PARTICIPATING_KEYS = [
  'damageEnemy', 'damageSapphireEnemy', 'damageEmeraldEnemy', 'damageAmberEnemy',
  'damageVoidEnemy', 'damageQuartzEnemy', 'damageRubyEnemy', 'damageSunstoneEnemy',
  'damageCitrineEnemy', 'damageIoliteEnemy', 'damageAmethystEnemy', 'damageDiamondEnemy',
  'damageNullstoneEnemy', 'damageFracterylEnemy', 'damageEigensteinEnemy',
  'damagePolyominoEnemy', 'damageFissilePolyominoEnemy', 'damageRefractorPolyominoEnemy',
  'damageDustWispEnemy', 'damageRibbonWormEnemy', 'damageLanternMothEnemy', 'damageEyeStalkEnemy',
  'damageJellyfishEnemy', 'damageClothGhostEnemy', 'damagePlantTurretEnemy', 'damageGearInsectEnemy',
  'damageSpiderCrawlerEnemy', 'damageMoteSwarmEnemy', 'damageShadowHandEnemy', 'damageSandFishEnemy',
  'damageQuartzFishEnemy', 'damageRubyFishEnemy', 'damageSunstoneFishEnemy', 'damageEmeraldFishEnemy',
  'damageSapphireFishEnemy', 'damageAmethystFishEnemy', 'damageDiamondFishEnemy',
] as const;

const EXCLUDED_KEYS = [
  'damageMissile', 'damageAmberShard', 'damageQuartzSpike', 'damageRubyBolt',
  'damageCitrineBolt', 'damageAmethystShard', 'damageDiamondShard', 'damageVoidTendril',
  'damageFracterylShard', 'damageBinaryRingEnemy', 'damageNadirCubePointEnemy',
  'damageEliteEnemy', 'damageAlivenParticle', 'damageEliteJellyfishEnemy',
  'damagePlantProjectile', 'damageHorizonPentagonReal', 'damageHorizonMissile',
] as const;

function makeLaserEnemy(def: number, hp: number): LaserEnemy {
  return {
    kind: 'laser', x: 0, y: 0, vx: 0, vy: 0, hp, maxHp: hp, atk: 0, def,
    phase: 'patrol' as LaserEnemy['phase'], phaseElapsedMs: 0,
    dashDirX: 0, dashDirY: 0, dashTraveled: 0,
    lockedTargetX: 0, lockedTargetY: 0,
    attackTrail: { active: false } as LaserEnemy['attackTrail'],
    patrolTimerMs: 0, hasHitPlayer: false,
  };
}

function makeSapphireEnemy(def: number, hp: number, shieldHp: number): SapphireEnemy {
  return {
    kind: 'sapphire', x: 0, y: 0, vx: 0, vy: 0, hp, maxHp: hp, atk: 0, def,
    shieldHp, maxShieldHp: shieldHp, missileTimerMs: 0, patrolTimerMs: 0,
  };
}

describe('createDamageFns Codex policy (pre-Phase-Six characterization)', () => {
  it('the exact 37 participating keys are exactly the returned typeByDamageFn set (exhaustive vs. 54)', () => {
    const recordDps = vi.fn();
    const fns = createDamageFns({ recordDps });
    const allKeys = Object.keys(fns);
    expect(allKeys.length).toBe(54);
    expect(new Set([...PARTICIPATING_KEYS, ...EXCLUDED_KEYS]).size).toBe(54);
    for (const key of allKeys) {
      const inParticipating = (PARTICIPATING_KEYS as readonly string[]).includes(key);
      const inExcluded = (EXCLUDED_KEYS as readonly string[]).includes(key);
      expect(inParticipating || inExcluded).toBe(true);
      expect(inParticipating && inExcluded).toBe(false);
    }
  });

  it('scales raw damage before DEF for an ordinary main-body callback with multiplier > 1', () => {
    const recordDps = vi.fn();
    const getCodexDamageMultiplier = vi.fn(() => 2);
    const { damageEnemy } = createDamageFns({ recordDps, getCodexDamageMultiplier });
    const enemy = makeLaserEnemy(5, 100);
    const dmg = damageEnemy(enemy, 10, 0);
    // rawDamage 10 * multiplier 2 = 20, minus def 5 = 15
    expect(dmg).toBe(15);
    expect(enemy.hp).toBe(85);
    expect(recordDps).toHaveBeenCalledWith(15, '#d3f3ff');
    expect(getCodexDamageMultiplier).toHaveBeenCalledWith('laser');
  });

  it('multiplier of 1 leaves an ordinary main-body callback unchanged', () => {
    const recordDps = vi.fn();
    const getCodexDamageMultiplier = vi.fn(() => 1);
    const { damageEnemy } = createDamageFns({ recordDps, getCodexDamageMultiplier });
    const enemy = makeLaserEnemy(5, 100);
    const dmg = damageEnemy(enemy, 10, 0);
    expect(dmg).toBe(5);
    expect(enemy.hp).toBe(95);
  });

  it('shielded sapphire body path scales raw damage, and the shield/bypass semantics are unchanged', () => {
    const recordDps = vi.fn();
    const getCodexDamageMultiplier = vi.fn(() => 3);
    const { damageSapphireEnemy } = createDamageFns({ recordDps, getCodexDamageMultiplier });

    // Shield path: shield absorbs at least MINIMUM_SHIELD_DAMAGE of the SCALED raw damage.
    const shielded = makeSapphireEnemy(0, 100, 50);
    const shieldDmg = damageSapphireEnemy(shielded, 4, 0, false);
    expect(shieldDmg).toBe(12); // 4 * 3 = 12, above MINIMUM_SHIELD_DAMAGE
    expect(shielded.shieldHp).toBe(38);
    expect(shielded.hp).toBe(100); // body untouched

    // Bypass path: shield ignored, body takes scaled damage minus DEF.
    const bypassed = makeSapphireEnemy(2, 100, 50);
    const bodyDmg = damageSapphireEnemy(bypassed, 4, 0, true);
    expect(bodyDmg).toBe(10); // 4 * 3 = 12, minus def 2 = 10
    expect(bypassed.hp).toBe(90);
    expect(bypassed.shieldHp).toBe(50); // shield untouched by bypass
  });

  it('a representative polyomino callback (fissile) applies the Codex multiplier and preserves split/flash side effects', () => {
    const recordDps = vi.fn();
    const getCodexDamageMultiplier = vi.fn(() => 2);
    const { damageFissilePolyominoEnemy } = createDamageFns({ recordDps, getCodexDamageMultiplier });
    const enemy = {
      kind: 'verdure_polyomino_fissile', x: 0, y: 0, displayX: 0, displayY: 0,
      hp: 100, maxHp: 100, atk: 0, def: 0, cells: [], driftAngle: 0,
      hitFlashMs: 0, pendingSplit: false,
    } as unknown as Parameters<typeof damageFissilePolyominoEnemy>[0];
    const dmg = damageFissilePolyominoEnemy(enemy, 5, 0);
    expect(dmg).toBe(10); // 5 * 2
    expect(enemy.hp).toBe(90);
    expect(enemy.hitFlashMs).toBe(120);
    expect(enemy.pendingSplit).toBe(true);
    expect(getCodexDamageMultiplier).toHaveBeenCalledWith('fissile_polyomino');
  });

  it('a representative fish callback (sand fish) applies the Codex multiplier', () => {
    const recordDps = vi.fn();
    const getCodexDamageMultiplier = vi.fn(() => 2);
    const { damageSandFishEnemy } = createDamageFns({ recordDps, getCodexDamageMultiplier });
    const fish = {
      x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, atk: 0, def: 0,
      animPhase: 0, hitFlashMs: 0, contactCdMs: 0, swimAngle: 0, turnPhase: 0,
      pathState: {}, immobileMs: 0, kind: 'proc_sandfish', lungeTimerMs: 0,
    } as unknown as SandFishEnemy;
    const dmg = damageSandFishEnemy(fish, 5, 0);
    expect(dmg).toBe(10);
    expect(fish.hp).toBe(90);
    expect(getCodexDamageMultiplier).toHaveBeenCalledWith('sand_fish');
  });

  it('performs a live lookup per hit: a changed getter result affects the very next call, not a cached factory-time value', () => {
    const recordDps = vi.fn();
    let multiplier = 1;
    const getCodexDamageMultiplier = vi.fn(() => multiplier);
    const { damageEnemy } = createDamageFns({ recordDps, getCodexDamageMultiplier });
    const enemy = makeLaserEnemy(0, 1000);

    const first = damageEnemy(enemy, 10, 0);
    expect(first).toBe(10);

    multiplier = 5;
    const second = damageEnemy(enemy, 10, 0);
    expect(second).toBe(50);
  });

  it('omitting getCodexDamageMultiplier leaves participating callbacks at multiplier 1', () => {
    const recordDps = vi.fn();
    const { damageEnemy } = createDamageFns({ recordDps });
    const enemy = makeLaserEnemy(3, 100);
    const dmg = damageEnemy(enemy, 10, 0);
    expect(dmg).toBe(7);
  });

  it('onEnemyHit reports positive damage, DEF-absorbed, and shield-blocked hits with existing values/order', () => {
    const recordDps = vi.fn();
    const onEnemyHit = vi.fn();
    const getCodexDamageMultiplier = vi.fn(() => 1);
    const { damageEnemy, damageSapphireEnemy } = createDamageFns({ recordDps, getCodexDamageMultiplier, onEnemyHit });

    const enemy = makeLaserEnemy(2, 100);
    damageEnemy(enemy, 10, 0);
    expect(onEnemyHit).toHaveBeenLastCalledWith(enemy, 8, false);

    const absorbed = makeLaserEnemy(1000, 100);
    damageEnemy(absorbed, 10, 0);
    expect(onEnemyHit).toHaveBeenLastCalledWith(absorbed, 0, true);

    const shielded = makeSapphireEnemy(0, 100, 50);
    damageSapphireEnemy(shielded, 4, 0, false);
    expect(onEnemyHit).toHaveBeenLastCalledWith(shielded, 0, true);
  });

  it('explicit exclusions: damageMissile, damageAmberShard, damageEliteEnemy, damageAlivenParticle, and damageHorizonPentagonReal never consult the Codex getter', () => {
    const recordDps = vi.fn();
    const getCodexDamageMultiplier = vi.fn(() => 99);
    const { damageMissile, damageAmberShard, damageEliteEnemy, damageAlivenParticle, damageHorizonPentagonReal } =
      createDamageFns({ recordDps, getCodexDamageMultiplier });

    const missile = { x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, atk: 0 } as unknown as SapphireMissile;
    expect(damageMissile(missile, 10)).toBe(10);

    const shard = { x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100 } as unknown as AmberShard;
    expect(damageAmberShard(shard, 10)).toBe(10);

    const elite = {
      kind: 'elite', tier: 'ruby', x: 0, y: 0, vx: 0, vy: 0, hp: 100, maxHp: 100, atk: 0, def: 0,
      attack1TimerMs: 0, attack2TimerMs: 0, pulseMs: 0, isInvuln: false,
    } as unknown as EliteEnemy;
    expect(damageEliteEnemy(elite, 10, 0)).toBe(10);

    const group = { particles: [] } as unknown as AlivenParticleGroup;
    const particle = {
      x: 0, y: 0, vx: 0, vy: 0, isAlive: true, hp: 100, maxHp: 100, radiusPx: 1,
      color: '#fff', glowColor: '#fff', pulseMs: 0, hitFlashMs: 0, contactCdMs: 0, trail: [],
    } as unknown as AlivenParticle;
    expect(damageAlivenParticle(particle, group, 10, recordDps)).toBe(10);

    const pentagon = makeHorizonPentagonGroup(0, 0, 1, 0, 640) as HorizonPentagonGroup;
    pentagon.swapCdMs = 500;
    const before = pentagon.hp;
    damageHorizonPentagonReal(pentagon, pentagon.def + 10, 0);
    expect(pentagon.hp).toBe(before - 10);

    expect(getCodexDamageMultiplier).not.toHaveBeenCalled();
  });
});
