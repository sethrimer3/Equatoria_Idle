/**
 * weave-tier-effects-audit.test.ts — Integration tests for weave tier-effect
 * runtime coverage.
 *
 * Verifies:
 *   - Every named tier effect has a non-STUB description and a non-empty
 *     contribution string.
 *   - Rolled tier effects from rollWeaveTierEffects contain no STUB text.
 *   - Every EquipmentCombatModifiers field accumulates a non-zero value from at
 *     least one tier effect, proving each stat has a real contributor.
 *   - Sand projectile velocity scales with speedMult (projectileSpeedPct consumer).
 *   - statusPowerPct (the statusChancePct field) scales T1 lens status
 *     magnitude and durationMs by (1 + statusPowerPct/100).
 */

import { describe, it, expect } from 'vitest';
import {
  WEAVE_TIER_EFFECT_NAMES,
  WEAVE_T1_DESCRIPTIONS,
  WEAVE_T2_DESCRIPTIONS,
  WEAVE_T3_DESCRIPTIONS,
} from '../weave-tier-definitions';
import {
  applyWeaveTierEffectToMods,
  formatWeaveTierEffectContribution,
} from '../weave-tier-effect-modifiers';
import { rollWeaveTierEffects } from '../weave-rolling';
import { applyTier1LensStatusesToEnemy } from '../../../sim/rpg/enemy-status-application';
import { getActiveStatuses, clearEnemyStatuses } from '../../../sim/rpg/enemy-status-effects';
import { createSandWeaponSystem } from '../../../render/rpg/rpg-weapon-sand';
import type { SandWeaponCtx } from '../../../render/rpg/rpg-weapon-sand';
import type { TierId } from '../../tiers';
import type { WeaveTierEffectTier } from '../weave-types';
import type { CraftedLensData, LensEffect } from '../lens-types';

// ─── Helpers ───────────────────────────────────────────────────────────────────

function emptyMods() {
  return {
    weaponDamagePct: 0,
    cooldownPct: 0,
    projectileSpeedPct: 0,
    critChancePct: 0,
    critDamagePct: 0,
    statusChancePct: 0,
    playerDefensePct: 0,
  };
}

function makeLens(tierId: string, magnitude = 50): CraftedLensData {
  const effect: LensEffect = {
    tierId: tierId as TierId,
    effectTier: 1,
    key: `${tierId}_t1`,
    name: tierId,
    description: 'test',
    magnitude,
    quality: 0.8,
    rarity: 'Common',
    isApplied: true,
  };
  return {
    id: `audit_lens_${tierId}`,
    type: 'lens',
    name: tierId,
    ingredients: [],
    totalWeightedMoteValue: 100,
    forgeCraftLevel: 5,
    effects: [effect],
  };
}

function makeSandCtx(): SandWeaponCtx {
  const noopDmg = () => 0;
  return {
    mote: { x: 0, y: 0 },
    dim: { w: 800, h: 600 },
    viewport: { left: 0, top: 0, right: 800, bottom: 600 },
    fluid: { addForce: () => {} },
    bossEnemy: null,
    enemies: [], sapphireEnemies: [], sapphireMissiles: [],
    emeraldEnemies: [], amberEnemies: [], amberShards: [],
    voidEnemies: [], quartzEnemies: [], quartzSpikes: [],
    rubyEnemies: [], rubyBolts: [], sunstoneEnemies: [],
    citrineEnemies: [], citrineBolts: [], ioliteEnemies: [],
    amethystEnemies: [], amethystShards: [], diamondEnemies: [],
    diamondShards: [], nullstoneEnemies: [], voidTendrils: [],
    fracterylEnemies: [], fracterylShards: [], eigensteinEnemies: [],
    eliteEnemies: [],
    damageEnemy: noopDmg,
    damageSapphireEnemy: noopDmg,
    damageMissile: noopDmg,
    damageEmeraldEnemy: noopDmg,
    damageAmberEnemy: noopDmg,
    damageAmberShard: noopDmg,
    damageVoidEnemy: noopDmg,
    damageQuartzEnemy: noopDmg,
    damageQuartzSpike: noopDmg,
    damageRubyEnemy: noopDmg,
    damageRubyBolt: noopDmg,
    damageSunstoneEnemy: noopDmg,
    damageCitrineEnemy: noopDmg,
    damageCitrineBolt: noopDmg,
    damageIoliteEnemy: noopDmg,
    damageAmethystEnemy: noopDmg,
    damageAmethystShard: noopDmg,
    damageDiamondEnemy: noopDmg,
    damageDiamondShard: noopDmg,
    damageNullstoneEnemy: noopDmg,
    damageVoidTendril: noopDmg,
    damageFracterylEnemy: noopDmg,
    damageFracterylShard: noopDmg,
    damageEigensteinEnemy: noopDmg,
    damageEliteEnemy: noopDmg,
    damageBossEnemy: noopDmg,
    collectEnemyBodyTargets: () => [],
    damageBodyTarget: noopDmg,
    spawnHitVisualsAt: () => {},
    getTerrainState: () => null,
  } as unknown as SandWeaponCtx;
}

// ─── Parity: every named tier effect has description + contribution ─────────────

describe('weave tier effect parity — every named effect has description and contribution', () => {
  const descMaps: Record<WeaveTierEffectTier, Partial<Record<TierId, string>>> = {
    1: WEAVE_T1_DESCRIPTIONS,
    2: WEAVE_T2_DESCRIPTIONS,
    3: WEAVE_T3_DESCRIPTIONS,
  };

  for (const [tierId, tierMap] of Object.entries(WEAVE_TIER_EFFECT_NAMES)) {
    if (!tierMap) continue;
    for (const [effectTierStr, name] of Object.entries(tierMap)) {
      const effectTier = Number(effectTierStr) as WeaveTierEffectTier;
      const label = `${tierId} T${effectTier} "${name}"`;

      it(`${label}: display name contains no STUB`, () => {
        expect(name).not.toContain('STUB');
      });

      it(`${label}: has a non-empty description with no STUB`, () => {
        const desc = descMaps[effectTier][tierId as TierId];
        expect(desc).toBeTruthy();
        expect(desc).not.toContain('STUB');
      });

      it(`${label}: formatWeaveTierEffectContribution returns non-empty string`, () => {
        const contribution = formatWeaveTierEffectContribution(tierId as TierId, effectTier, 100);
        expect(contribution.length).toBeGreaterThan(0);
      });
    }
  }
});

// ─── STUB audit: rolled tier effects must have no STUB text ───────────────────

describe('rollWeaveTierEffects — no STUB in rolled effect names or descriptions', () => {
  const allIngredients = Object.keys(WEAVE_TIER_EFFECT_NAMES).map((tierId) => ({
    tierId: tierId as TierId,
    refinedCount: BigInt(10),
  }));

  // rng = () => 0 ensures T2 and T3 are always rolled (0 < any positive threshold)
  const effects = rollWeaveTierEffects(allIngredients, 10, () => 0);

  it('produces at least one effect per ingredient tier', () => {
    expect(effects.length).toBeGreaterThanOrEqual(allIngredients.length);
  });

  it('all T1–T3 effect names contain no STUB', () => {
    for (const e of effects) {
      expect(e.name, `${e.tierId} T${e.effectTier} name`).not.toContain('STUB');
    }
  });

  it('all T1–T3 effect descriptions contain no STUB', () => {
    for (const e of effects) {
      expect(e.description, `${e.tierId} T${e.effectTier} description`).not.toContain('STUB');
    }
  });

  it('all rolled effects have isApplied = true', () => {
    for (const e of effects) {
      expect(e.isApplied, `${e.tierId} T${e.effectTier} isApplied`).toBe(true);
    }
  });
});

// ─── EquipmentCombatModifiers field coverage ───────────────────────────────────

describe('applyWeaveTierEffectToMods — every EquipmentCombatModifiers field has a contributor', () => {
  const FIELD_SOURCES: Array<{
    field: keyof ReturnType<typeof emptyMods>;
    tierId: TierId;
    effectTier: WeaveTierEffectTier;
  }> = [
    { field: 'weaponDamagePct',    tierId: 'citrine',  effectTier: 1 },
    { field: 'cooldownPct',        tierId: 'sand',     effectTier: 1 },
    { field: 'projectileSpeedPct', tierId: 'quartz',   effectTier: 1 },
    { field: 'critChancePct',      tierId: 'ruby',     effectTier: 1 },
    { field: 'critDamagePct',      tierId: 'amethyst', effectTier: 1 },
    { field: 'statusChancePct',    tierId: 'emerald',  effectTier: 1 },
    { field: 'playerDefensePct',   tierId: 'sapphire', effectTier: 1 },
  ];

  for (const { field, tierId, effectTier } of FIELD_SOURCES) {
    it(`${field} accumulates a non-zero value from ${tierId} T${effectTier}`, () => {
      const target = emptyMods();
      applyWeaveTierEffectToMods(target, tierId, effectTier, 100, true);
      expect(target[field]).toBeGreaterThan(0);
    });
  }

  it('isApplied=false produces no change', () => {
    const target = emptyMods();
    applyWeaveTierEffectToMods(target, 'quartz', 1, 100, false);
    expect(target.projectileSpeedPct).toBe(0);
  });
});

// ─── projectileSpeedPct → sand projectile velocity ────────────────────────────

describe('projectileSpeedPct → sand projectile velocity scales with speedMult', () => {
  it('speedMult=1.5 produces 1.5× vx compared to speedMult=1.0', () => {
    const system = createSandWeaponSystem(makeSandCtx());

    system.spawnSandProjectile(100, 0, 10, 1.0);
    const baseVx = system.sandProjectiles[0]!.vx;
    system.sandProjectiles.length = 0;

    system.spawnSandProjectile(100, 0, 10, 1.5);
    const boostedVx = system.sandProjectiles[0]!.vx;

    expect(boostedVx).toBeCloseTo(baseVx * 1.5, 5);
  });

  it('speedMult omitted defaults to 1.0 (same velocity as explicit 1.0)', () => {
    const system = createSandWeaponSystem(makeSandCtx());

    system.spawnSandProjectile(0, -100, 10);
    const defaultVy = system.sandProjectiles[0]!.vy;
    system.sandProjectiles.length = 0;

    system.spawnSandProjectile(0, -100, 10, 1.0);
    const explicitVy = system.sandProjectiles[0]!.vy;

    expect(defaultVy).toBeCloseTo(explicitVy, 5);
  });

  it('speedMult=2.0 doubles the resultant speed', () => {
    const system = createSandWeaponSystem(makeSandCtx());

    // Target at (60, 80): dist=100, normalized (0.6, 0.8)
    system.spawnSandProjectile(60, 80, 10, 1.0);
    const p1 = system.sandProjectiles[0]!;
    const speed1 = Math.sqrt(p1.vx * p1.vx + p1.vy * p1.vy);
    system.sandProjectiles.length = 0;

    system.spawnSandProjectile(60, 80, 10, 2.0);
    const p2 = system.sandProjectiles[0]!;
    const speed2 = Math.sqrt(p2.vx * p2.vx + p2.vy * p2.vy);

    expect(speed2).toBeCloseTo(speed1 * 2.0, 5);
  });
});

// ─── statusChancePct field → status magnitude and duration scaling ─────────────

describe('applyTier1LensStatusesToEnemy — statusPowerPct (statusChancePct) scales magnitude and durationMs', () => {
  it('statusPowerPct=50 scales magnitude by 1.5× for a neutral enemy', () => {
    const enemyBase = {};
    const enemyPwr  = {};
    const lens = makeLens('sand', 50); // sand → abraded, affinity 'neutral' for 'other'

    applyTier1LensStatusesToEnemy({ enemy: enemyBase, lens, weaponId: 'w', hitDamage: 10, enemyTypeId: 'other' });
    applyTier1LensStatusesToEnemy({ enemy: enemyPwr,  lens, weaponId: 'w', hitDamage: 10, enemyTypeId: 'other', statusPowerPct: 50 });

    const magBase = getActiveStatuses(enemyBase).find(s => s.key === 'abraded')?.magnitude ?? 0;
    const magPwr  = getActiveStatuses(enemyPwr ).find(s => s.key === 'abraded')?.magnitude ?? 0;

    expect(magBase).toBeGreaterThan(0);
    expect(magPwr).toBeCloseTo(magBase * 1.5, 5);

    clearEnemyStatuses(enemyBase);
    clearEnemyStatuses(enemyPwr);
  });

  it('statusPowerPct=50 scales durationMs by 1.5×', () => {
    const enemyBase = {};
    const enemyPwr  = {};
    const lens = makeLens('sand', 50);

    applyTier1LensStatusesToEnemy({ enemy: enemyBase, lens, weaponId: 'w', hitDamage: 10, enemyTypeId: 'other' });
    applyTier1LensStatusesToEnemy({ enemy: enemyPwr,  lens, weaponId: 'w', hitDamage: 10, enemyTypeId: 'other', statusPowerPct: 50 });

    const durBase = getActiveStatuses(enemyBase).find(s => s.key === 'abraded')?.durationMs ?? 0;
    const durPwr  = getActiveStatuses(enemyPwr ).find(s => s.key === 'abraded')?.durationMs ?? 0;

    expect(durBase).toBeGreaterThan(0);
    expect(durPwr).toBeCloseTo(durBase * 1.5, 5);

    clearEnemyStatuses(enemyBase);
    clearEnemyStatuses(enemyPwr);
  });

  it('statusPowerPct=0 does not scale (identical to no statusPowerPct)', () => {
    const enemyBase = {};
    const enemyZero = {};
    const lens = makeLens('sand', 50);

    applyTier1LensStatusesToEnemy({ enemy: enemyBase, lens, weaponId: 'w', hitDamage: 10, enemyTypeId: 'other' });
    applyTier1LensStatusesToEnemy({ enemy: enemyZero, lens, weaponId: 'w', hitDamage: 10, enemyTypeId: 'other', statusPowerPct: 0 });

    const magBase = getActiveStatuses(enemyBase).find(s => s.key === 'abraded')?.magnitude ?? -1;
    const magZero = getActiveStatuses(enemyZero).find(s => s.key === 'abraded')?.magnitude ?? -2;

    expect(magZero).toBeCloseTo(magBase, 5);

    clearEnemyStatuses(enemyBase);
    clearEnemyStatuses(enemyZero);
  });

  it('statusPowerPct=100 doubles magnitude', () => {
    const enemyBase = {};
    const enemyDbl  = {};
    const lens = makeLens('ruby', 40); // ruby → burning, neutral for 'other'

    applyTier1LensStatusesToEnemy({ enemy: enemyBase, lens, weaponId: 'w', hitDamage: 10, enemyTypeId: 'other' });
    applyTier1LensStatusesToEnemy({ enemy: enemyDbl,  lens, weaponId: 'w', hitDamage: 10, enemyTypeId: 'other', statusPowerPct: 100 });

    const magBase = getActiveStatuses(enemyBase).find(s => s.key === 'burning')?.magnitude ?? 0;
    const magDbl  = getActiveStatuses(enemyDbl ).find(s => s.key === 'burning')?.magnitude ?? 0;

    expect(magDbl).toBeCloseTo(magBase * 2.0, 5);

    clearEnemyStatuses(enemyBase);
    clearEnemyStatuses(enemyDbl);
  });
});
