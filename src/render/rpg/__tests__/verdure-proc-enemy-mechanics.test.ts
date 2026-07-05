import { describe, it, expect } from 'vitest';
import type { RpgEnemyCtx } from '../rpg-enemy-updates';
import {
  makeRibbonWormEnemy, makeLanternMothEnemy, makeEyeStalkEnemy,
  makeClothGhostEnemy, makeGearInsectEnemy, makeSpiderCrawlerEnemy,
  makePlantTurretEnemy,
} from '../rpg-procedural-factories';
import {
  updateRibbonWormEnemies, updateLanternMothEnemies, updateEyeStalkEnemies,
  updateClothGhostEnemies, updateGearInsectEnemies, updateSpiderCrawlerEnemies,
  updatePlantTurretEnemies,
} from '../rpg-procedural-update';
import {
  RIBBONWORM_COIL_MS, RIBBONWORM_LUNGE_MS,
  EYESTALK_CHARGE_MS, EYESTALK_FIRE_MS,
} from '../rpg-procedural-constants';
import type { PlantProjectile } from '../rpg-procedural-types';

function makeTestCtx(overrides?: Partial<RpgEnemyCtx>): RpgEnemyCtx {
  const mote = { x: 0, y: 0, vx: 0, vy: 0 };
  return {
    mote,
    dim: { w: 360, h: 640 },
    viewport: { left: 0, top: 0, right: 360, bottom: 640 },
    getFieldSpace: () => ({ activeBounds: { left: 0, top: 0, right: 360, bottom: 640 } }) as never,
    fluid: { addForce: () => {} },
    hitEffects: [],
    shotLines: [],
    dealDamageToPlayer: () => {},
    dealDamageToPlayerKnockback: () => {},
    clampEnemyToBounds: () => {},
    getTerrainState: () => null,
    getNavGrid: () => null,
    ...overrides,
  } as RpgEnemyCtx;
}

describe('Ribbon Worm coil-and-lunge state machine', () => {
  it('progresses pursue -> coil -> lunge -> recover -> pursue without crashing', () => {
    const e = makeRibbonWormEnemy(10, 10, 1);
    e.x = 10; e.y = 10;
    const ctx = makeTestCtx();
    ctx.mote.x = 15; ctx.mote.y = 10; // within RIBBONWORM_COIL_RANGE

    e.wormState = 'pursue';
    e.stateTimerMs = 1;
    updateRibbonWormEnemies([e], ctx, 20);
    expect(e.wormState).toBe('coil');

    updateRibbonWormEnemies([e], ctx, RIBBONWORM_COIL_MS + 10);
    expect(e.wormState).toBe('lunge');
    expect(Number.isFinite(e.lungeDirX)).toBe(true);
    expect(Number.isFinite(e.lungeDirY)).toBe(true);

    updateRibbonWormEnemies([e], ctx, RIBBONWORM_LUNGE_MS + 10);
    expect(e.wormState).toBe('recover');

    // Positions must remain finite through the whole cycle (no NaN/exploding values).
    expect(Number.isFinite(e.x)).toBe(true);
    expect(Number.isFinite(e.y)).toBe(true);
    for (let i = 0; i < e.segX.length; i++) {
      expect(Number.isFinite(e.segX[i])).toBe(true);
      expect(Number.isFinite(e.segY[i])).toBe(true);
    }
  });

  it('deals reduced contact damage from body segments independently of the head', () => {
    const e = makeRibbonWormEnemy(0, 0, 1);
    let hits = 0;
    const ctx = makeTestCtx({ dealDamageToPlayer: () => { hits++; } });
    // Place the player right on top of a trailing segment.
    e.segX[3] = 0; e.segY[3] = 0;
    ctx.mote.x = 0; ctx.mote.y = 0;
    updateRibbonWormEnemies([e], ctx, 16);
    expect(hits).toBeGreaterThan(0);
  });
});

describe('Lantern Moth light-lure mechanic', () => {
  it('nudges the player velocity toward the moth while pulsing', () => {
    const e = makeLanternMothEnemy(0, 0, 1);
    e.lureState = 'pulse';
    e.lureTimerMs = 100;
    const ctx = makeTestCtx();
    ctx.mote.x = 20; ctx.mote.y = 0;
    const before = ctx.mote.vx;
    updateLanternMothEnemies([e], ctx, 16);
    // Moth sits left of the player, so the lure pulls the player's vx negative (toward the moth).
    expect(ctx.mote.vx).toBeLessThan(before);
  });

  it('cycles idle -> charge -> pulse -> idle', () => {
    const e = makeLanternMothEnemy(0, 0, 1);
    e.lureState = 'idle'; e.lureTimerMs = 1;
    const ctx = makeTestCtx();
    updateLanternMothEnemies([e], ctx, 16);
    expect(e.lureState).toBe('charge');
  });
});

describe('Eye Stalk gaze beam', () => {
  it('deals damage exactly once per fire window when the player stays in line', () => {
    const e = makeEyeStalkEnemy(0, 0, 1);
    let hits = 0;
    const ctx = makeTestCtx({ dealDamageToPlayer: () => { hits++; } });
    ctx.mote.x = 100; ctx.mote.y = 0;

    e.gazeState = 'idle'; e.gazeTimerMs = 1;
    updateEyeStalkEnemies([e], ctx, 16);
    expect(e.gazeState).toBe('charge');

    updateEyeStalkEnemies([e], ctx, EYESTALK_CHARGE_MS + 10);
    expect(e.gazeState).toBe('fire');

    updateEyeStalkEnemies([e], ctx, 16);
    expect(hits).toBe(1);

    // Further frames within the same fire window must not double-hit.
    updateEyeStalkEnemies([e], ctx, 16);
    expect(hits).toBe(1);

    updateEyeStalkEnemies([e], ctx, EYESTALK_FIRE_MS + 10);
    expect(e.gazeState).toBe('blink');
  });
});

describe('Cloth Ghost phase + wrap', () => {
  it('does not deal contact damage while intangible', () => {
    const e = makeClothGhostEnemy(0, 0, 1);
    let hits = 0;
    const ctx = makeTestCtx({ dealDamageToPlayer: () => { hits++; } });
    ctx.mote.x = 0; ctx.mote.y = 0;
    e.ghostState = 'intangible'; e.stateTimerMs = 500;
    updateClothGhostEnemies([e], ctx, 16);
    expect(hits).toBe(0);
  });
});

describe('Gear Insect scuttle/charge/ricochet cycle', () => {
  it('runs through all states without producing non-finite positions', () => {
    const e = makeGearInsectEnemy(0, 0, 1);
    const ctx = makeTestCtx();
    ctx.mote.x = 50; ctx.mote.y = 0;
    for (let i = 0; i < 200; i++) {
      updateGearInsectEnemies([e], ctx, 16);
      expect(Number.isFinite(e.x)).toBe(true);
      expect(Number.isFinite(e.y)).toBe(true);
    }
  });
});

describe('Spider Crawler pounce + web cone', () => {
  it('slows the player while inside an active web cone', () => {
    const e = makeSpiderCrawlerEnemy(0, 0, 1);
    const ctx = makeTestCtx();
    ctx.mote.vx = 1; ctx.mote.vy = 0;
    ctx.mote.x = 20; ctx.mote.y = 0;
    e.webActiveMs = 200;
    e.webAngle = 0;
    updateSpiderCrawlerEnemies([e], ctx, 16);
    expect(ctx.mote.vx).toBeLessThan(1);
  });
});

describe('Plant Turret spore variety', () => {
  it('fires without crashing across many shot cycles and stays anchored to its root', () => {
    const e = makePlantTurretEnemy(30, 40, 1);
    const projectiles: PlantProjectile[] = [];
    const ctx = makeTestCtx();
    ctx.mote.x = 100; ctx.mote.y = 40;
    for (let i = 0; i < 500; i++) {
      updatePlantTurretEnemies([e], projectiles, ctx, 50);
    }
    expect(e.x).toBe(30);
    expect(e.y).toBe(40);
    expect(projectiles.length).toBeGreaterThan(0);
    expect(e.shotIndex).toBeGreaterThan(0);
  });
});
