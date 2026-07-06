import { describe, it, expect } from 'vitest';
import { createRpgTargeting } from '../rpg-targeting';
import type { RpgTargetingCtx } from '../rpg-targeting-types';
import { getChainTargetBody } from '../rpg-weapon-chain';
import { getLifeTargetBody } from '../life-weapon-helpers';
import {
  makeMazeColony, buildLifeGridBoundsForArena,
} from '../life-factories';
import { damageLifeCellEntity, damageLifeCoreEntity } from '../life-controller';
import { lifeGridToWorldCenter, makeLifeGridBounds, LIFE_CELL_SIZE } from '../life-grid';
import type { ClosestTarget } from '../rpg-types';
import type { LifeColonyController } from '../life-types';
import { RULE_CONWAY } from '../life-ca-rules';

/**
 * No shipped Life factory gives its field coreHp > 0 (there is no default
 * core). This builds a synthetic field standing in for a possible future
 * core-bearing variant, to exercise the still-supported life_core dispatch
 * mechanism in isolation from the normal cell-only Life enemies.
 */
function makeCoreBearingTestColony(): LifeColonyController {
  const bounds = makeLifeGridBounds(0, 0, 400, 400, LIFE_CELL_SIZE);
  return {
    kind: 'life_colony', rule: RULE_CONWAY, bounds, x: 200, y: 200,
    coreHp: 10, coreMaxHp: 10, cells: new Map(), tickAccumulatorMs: 0,
    generation: 0, maxPopulation: 260, status: 'seeding', xpMult: 1, coreContactCdMs: 0,
  };
}

/** Minimal mock RpgTargetingCtx — every array/no-op field a test doesn't care
 * about is empty/inert; only Life-zone fields are filled in by callers. */
function makeTargetingCtx(overrides: Partial<RpgTargetingCtx> = {}): RpgTargetingCtx {
  const noopDmg = () => 0;
  return {
    mote: { x: 0, y: 0 },
    bossEnemy: null,
    enemies: [], sapphireEnemies: [], sapphireMissiles: [],
    emeraldEnemies: [], amberEnemies: [], amberShards: [],
    voidEnemies: [], quartzEnemies: [], quartzSpikes: [],
    rubyEnemies: [], rubyBolts: [], sunstoneEnemies: [],
    citrineEnemies: [], citrineBolts: [], ioliteEnemies: [],
    amethystEnemies: [], amethystShards: [], diamondEnemies: [],
    diamondShards: [], nullstoneEnemies: [], voidTendrils: [],
    fracterylEnemies: [], fracterylShards: [], eigensteinEnemies: [],
    eliteEnemies: [], polyominoEnemies: [], fissilePolyominoEnemies: [],
    refractorPolyominoEnemies: [], binaryRingEnemies: [], stardustEnemies: [],
    alivenGroups: [], lifeColonies: [],
    dustWispEnemies: [], ribbonWormEnemies: [], lanternMothEnemies: [], eyeStalkEnemies: [],
    jellyfishEnemies: [], eliteJellyfishEnemies: [], clothGhostEnemies: [], plantTurretEnemies: [],
    gearInsectEnemies: [], spiderCrawlerEnemies: [], moteSwarmEnemies: [], shadowHandEnemies: [],
    sandFishEnemies: [], quartzFishEnemies: [], rubyFishEnemies: [], sunstoneFishEnemies: [],
    emeraldFishEnemies: [], sapphireFishEnemies: [], amethystFishEnemies: [], diamondFishEnemies: [],
    plantProjectiles: [],
    damageEnemy: noopDmg, damageSapphireEnemy: noopDmg, damageMissile: noopDmg,
    damageEmeraldEnemy: noopDmg, damageAmberEnemy: noopDmg, damageAmberShard: noopDmg,
    damageVoidEnemy: noopDmg, damageQuartzEnemy: noopDmg, damageQuartzSpike: noopDmg,
    damageRubyEnemy: noopDmg, damageRubyBolt: noopDmg, damageSunstoneEnemy: noopDmg,
    damageCitrineEnemy: noopDmg, damageCitrineBolt: noopDmg, damageIoliteEnemy: noopDmg,
    damageAmethystEnemy: noopDmg, damageAmethystShard: noopDmg, damageDiamondEnemy: noopDmg,
    damageDiamondShard: noopDmg, damageNullstoneEnemy: noopDmg, damageVoidTendril: noopDmg,
    damageFracterylEnemy: noopDmg, damageFracterylShard: noopDmg, damageEigensteinEnemy: noopDmg,
    damagePolyominoEnemy: noopDmg, damageFissilePolyominoEnemy: noopDmg, damageRefractorPolyominoEnemy: noopDmg,
    damageBinaryRingEnemy: noopDmg, damageEliteEnemy: noopDmg, damageAlivenParticle: noopDmg,
    damageLifeCell: (cell: Parameters<typeof damageLifeCellEntity>[0], raw: number) => damageLifeCellEntity(cell, raw),
    damageLifeCore: (colony: LifeColonyController, raw: number) => damageLifeCoreEntity(colony, raw),
    damageBossEnemy: noopDmg,
    damageDustWispEnemy: noopDmg, damageRibbonWormEnemy: noopDmg, damageLanternMothEnemy: noopDmg,
    damageEyeStalkEnemy: noopDmg, damageJellyfishEnemy: noopDmg, damageEliteJellyfishEnemy: noopDmg,
    damageClothGhostEnemy: noopDmg, damagePlantTurretEnemy: noopDmg, damageGearInsectEnemy: noopDmg,
    damageSpiderCrawlerEnemy: noopDmg, damageMoteSwarmEnemy: noopDmg, damageShadowHandEnemy: noopDmg,
    damageSandFishEnemy: noopDmg, damageQuartzFishEnemy: noopDmg, damageRubyFishEnemy: noopDmg,
    damageSunstoneFishEnemy: noopDmg, damageEmeraldFishEnemy: noopDmg, damageSapphireFishEnemy: noopDmg,
    damageAmethystFishEnemy: noopDmg, damageDiamondFishEnemy: noopDmg, damagePlantProjectile: noopDmg,
    verdurePlants: [], damageVerdurePlant: noopDmg,
    nadirCubePointEnemies: [], damageNadirCubePointEnemy: noopDmg,
    horizonPentagonGroups: [], damageHorizonPentagonReal: noopDmg, damageHorizonMissile: noopDmg,
    getTerrainState: () => null,
    ...overrides,
  } as unknown as RpgTargetingCtx;
}

function makeLifeColonyCtx(): { ctx: RpgTargetingCtx; colony: LifeColonyController } {
  const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
  const colony = makeMazeColony(200, 200, 1, bounds);
  const ctx = makeTargetingCtx({ lifeColonies: [colony] });
  return { ctx, colony };
}

describe('damageBodyTarget — Life zone targets', () => {
  it('damages a life_cell target via damageLifeCell', () => {
    const { ctx, colony } = makeLifeColonyCtx();
    const targeting = createRpgTargeting(ctx);
    const cellTarget = targeting.collectEnemyBodyTargets().find(t => t.kind === 'life_cell');
    expect(cellTarget).toBeDefined();
    const cell = cellTarget!.lifeCell!;
    const hpBefore = cell.hp;

    const dmg = targeting.damageBodyTarget(cellTarget!, 3, 0, false);
    expect(dmg).toBe(3);
    expect(cell.hp).toBe(hpBefore - 3);
    expect(colony.coreHp).toBe(colony.coreMaxHp); // core untouched (and always 0 for shipped fields)
  });

  it('reserved future core mechanism: damages a life_core target via damageLifeCore when a field is manually given coreHp > 0', () => {
    const colony = makeCoreBearingTestColony();
    const ctx = makeTargetingCtx({ lifeColonies: [colony] });
    const targeting = createRpgTargeting(ctx);
    const coreTarget = targeting.collectEnemyBodyTargets().find(t => t.kind === 'life_core');
    expect(coreTarget).toBeDefined();
    const coreHpBefore = colony.coreHp;

    const dmg = targeting.damageBodyTarget(coreTarget!, 4, 0, false);
    expect(dmg).toBe(4);
    expect(colony.coreHp).toBe(coreHpBefore - 4);
  });
});

describe('collectEnemyBodyTargets — Life zone coverage', () => {
  it('includes life_cell targets but no life_core target for a normal (coreHp 0) active colony', () => {
    const { ctx } = makeLifeColonyCtx();
    const targeting = createRpgTargeting(ctx);
    const targets = targeting.collectEnemyBodyTargets();
    expect(targets.some(t => t.kind === 'life_cell')).toBe(true);
    expect(targets.some(t => t.kind === 'life_core')).toBe(false);
  });
});

describe('chain whip target-body identity — Life cells/cores', () => {
  it('getChainTargetBody resolves the same stable ref across two calls for a life_cell target', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cell = [...colony.cells.values()][0]!;
    const center = lifeGridToWorldCenter({ col: cell.col, row: cell.row }, bounds);
    const target: ClosestTarget = { kind: 'life_cell', x: center.x, y: center.y, distSq: 0, lifeCell: cell, lifeColony: colony };

    const bodyA = getChainTargetBody(target);
    const bodyB = getChainTargetBody(target);
    expect(bodyA).not.toBeNull();
    expect(bodyA!.ref).toBe(bodyB!.ref);
    expect(bodyA!.ref).toBe(cell);
    expect(bodyA!.maxHp).toBe(cell.maxHp);
  });

  it('getChainTargetBody resolves the same stable ref across two calls for a life_core target', () => {
    const colony = makeCoreBearingTestColony();
    const target: ClosestTarget = { kind: 'life_core', x: colony.x, y: colony.y, distSq: 0, lifeCoreColony: colony };

    const bodyA = getChainTargetBody(target);
    const bodyB = getChainTargetBody(target);
    expect(bodyA).not.toBeNull();
    expect(bodyA!.ref).toBe(bodyB!.ref);
    expect(bodyA!.ref).toBe(colony);
    expect(bodyA!.maxHp).toBe(colony.coreMaxHp);
  });

  it('hitCooldowns keyed on the resolved ref correctly suppresses repeat hits within the cooldown window', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cell = [...colony.cells.values()][0]!;
    const center = lifeGridToWorldCenter({ col: cell.col, row: cell.row }, bounds);
    const target: ClosestTarget = { kind: 'life_cell', x: center.x, y: center.y, distSq: 0, lifeCell: cell, lifeColony: colony };

    const hitCooldowns = new Map<object, number>();
    const first = getChainTargetBody(target)!;
    expect(hitCooldowns.has(first.ref)).toBe(false);
    hitCooldowns.set(first.ref, 500);

    // Re-resolving the same logical target must hit the same cooldown entry.
    const second = getChainTargetBody(target)!;
    expect(hitCooldowns.has(second.ref)).toBe(true);
  });

  it('agrees with getLifeTargetBody on the resolved ref for the same target', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cell = [...colony.cells.values()][0]!;
    const center = lifeGridToWorldCenter({ col: cell.col, row: cell.row }, bounds);
    const target: ClosestTarget = { kind: 'life_cell', x: center.x, y: center.y, distSq: 0, lifeCell: cell, lifeColony: colony };

    expect(getChainTargetBody(target)!.ref).toBe(getLifeTargetBody(target)!.ref);
  });
});

describe('AoE-style multi-target damage via damageBodyTarget', () => {
  it('a single pass can damage multiple life_cell targets collected from collectEnemyBodyTargets', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const ctx = makeTargetingCtx({ lifeColonies: [colony] });
    const targeting = createRpgTargeting(ctx);

    const cellTargets = targeting.collectEnemyBodyTargets().filter(t => t.kind === 'life_cell');
    expect(cellTargets.length).toBeGreaterThan(1);

    let hitCount = 0;
    for (const t of cellTargets) {
      const dmg = targeting.damageBodyTarget(t, 100, 0, false);
      if (dmg > 0) hitCount++;
    }
    expect(hitCount).toBe(cellTargets.length);
    expect([...colony.cells.values()].every(c => c.isDying)).toBe(true);
  });
});
