import { describe, it, expect } from 'vitest';
import type { RpgEnemyCtx } from '../rpg-enemy-updates';
import { makeRefractorPolyominoEnemy } from '../polyomino-enemy-factories';
import { updateRefractorPolyominoEnemies } from '../polyomino-enemy-update';
import { POLYOMINO_LASER_WARMUP_MS } from '../polyomino-enemy-factories';

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

describe('Refractor Polyomino laser warmup telegraph', () => {
  it('does not deal damage during the warning-line warmup window', () => {
    const enemy = makeRefractorPolyominoEnemy(0, 0, 30);
    let hits = 0;
    const ctx = makeTestCtx({ dealDamageToPlayer: () => { hits++; } });
    // Force-spawn a laser pointing straight at the player and verify no damage
    // lands until warmupMs has elapsed.
    enemy.lasers.push({ originX: 0, originY: 0, dirX: 1, dirY: 0, atk: 10, lifeMs: 400, hasHitPlayer: false, warmupMs: POLYOMINO_LASER_WARMUP_MS });
    ctx.mote.x = 50; ctx.mote.y = 0;

    updateRefractorPolyominoEnemies([enemy], ctx, 16, performance.now());
    expect(hits).toBe(0);
    expect(enemy.lasers[0]!.warmupMs).toBeLessThan(POLYOMINO_LASER_WARMUP_MS);

    updateRefractorPolyominoEnemies([enemy], ctx, POLYOMINO_LASER_WARMUP_MS + 10, performance.now());
    expect(hits).toBe(1);
  });

  it('eases displayX/displayY toward the true centroid without crashing', () => {
    const enemy = makeRefractorPolyominoEnemy(0, 0, 30);
    const ctx = makeTestCtx();
    for (let i = 0; i < 50; i++) {
      updateRefractorPolyominoEnemies([enemy], ctx, 16, performance.now() + i * 500);
    }
    expect(Number.isFinite(enemy.displayX)).toBe(true);
    expect(Number.isFinite(enemy.displayY)).toBe(true);
  });
});
