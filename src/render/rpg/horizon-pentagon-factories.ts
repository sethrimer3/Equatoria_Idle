/**
 * horizon-pentagon-factories.ts — Factory for HorizonPentagonGroup.
 */

import type { HorizonPentagonGroup, HorizonShadowBody } from './horizon-pentagon-types';
import {
  PENTAGON_HP_INIT, PENTAGON_ATK_INIT, PENTAGON_DEF_INIT,
  MISSILE_CD_BASE_MS, MISSILE_CD_JITTER_MS,
  LASER_CD_BASE_MS, LASER_CD_JITTER_MS,
  GATLING_CD_BASE_MS, GATLING_CD_JITTER_MS,
  MIRROR_LINE_FRACTIONS,
} from './horizon-pentagon-constants';
import { fractionToLineY, computeShadowPositions } from './horizon-mirror-system';

function _makeShadowBody(x: number, y: number): HorizonShadowBody {
  return {
    x, y,
    missileTimerMs: MISSILE_CD_BASE_MS * 0.6 + Math.random() * MISSILE_CD_JITTER_MS,
    laserTimerMs:   LASER_CD_BASE_MS  * 0.5 + Math.random() * LASER_CD_JITTER_MS,
    gatlingTimerMs: GATLING_CD_BASE_MS * 0.4 + Math.random() * GATLING_CD_JITTER_MS,
    activeLaser: null,
  };
}

/**
 * Creates a HorizonPentagonGroup at the given spawn position.
 * `arenaTop` / `arenaBottom` are used to convert mirror-line fractions to
 * world-space Y coordinates.
 */
export function makeHorizonPentagonGroup(
  spawnX: number,
  spawnY: number,
  waveNumber: number,
  arenaTop: number,
  arenaBottom: number,
): HorizonPentagonGroup {
  const waveScale = 1 + (waveNumber - 1) * 0.04;
  const hp = Math.round(PENTAGON_HP_INIT * waveScale);
  const atk = Math.round(PENTAGON_ATK_INIT * waveScale);
  const def = Math.round(PENTAGON_DEF_INIT * (1 + (waveNumber - 1) * 0.02));

  const mirrorLineYs = MIRROR_LINE_FRACTIONS.map(f =>
    fractionToLineY(f, arenaTop, arenaBottom),
  );

  const shadowPositions = computeShadowPositions(spawnX, spawnY, mirrorLineYs);
  const shadows: HorizonShadowBody[] = shadowPositions.map(({ rx, ry }) =>
    _makeShadowBody(rx, ry),
  );

  return {
    kind: 'horizon_pentagon',
    x: spawnX, y: spawnY,
    vx: 0, vy: 0,
    hp, maxHp: hp,
    atk, def,
    pulseMs: 0,
    missileTimerMs: MISSILE_CD_BASE_MS + Math.random() * MISSILE_CD_JITTER_MS,
    laserTimerMs:   LASER_CD_BASE_MS   + Math.random() * LASER_CD_JITTER_MS,
    gatlingTimerMs: GATLING_CD_BASE_MS + Math.random() * GATLING_CD_JITTER_MS,
    activeLaser: null,
    swapCdMs: 0,
    mirrorLineYs,
    shadows,
    missiles: [],
    bullets:  [],
    puffs:    [],
  };
}
