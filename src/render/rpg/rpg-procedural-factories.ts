/**
 * rpg-procedural-factories.ts — Factory functions for the 11 procedural creature types.
 *
 * All factories follow the same convention used by the existing enemy factories:
 *   make<TypeName>(x, y, waveNumber) — returns a fully initialised enemy struct.
 *   makePlantProjectile(x, y, vx, vy) — creates a single fired projectile.
 *
 * Stats are wave-scaled at spawn time using getWaveStatScale.
 */
import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
} from './rpg-procedural-types';
import {
  DUSTWISP_HP_INIT, DUSTWISP_ATK_INIT, DUSTWISP_DEF_INIT,
  RIBBONWORM_HP_INIT, RIBBONWORM_ATK_INIT, RIBBONWORM_DEF_INIT, RIBBONWORM_SEG_COUNT,
  LANTERNMOTH_HP_INIT, LANTERNMOTH_ATK_INIT, LANTERNMOTH_DEF_INIT,
  EYESTALK_HP_INIT, EYESTALK_ATK_INIT, EYESTALK_DEF_INIT,
  JELLYFISH_HP_INIT, JELLYFISH_ATK_INIT, JELLYFISH_DEF_INIT,
  CLOTHGHOST_HP_INIT, CLOTHGHOST_ATK_INIT, CLOTHGHOST_DEF_INIT,
  PLANTTURRET_HP_INIT, PLANTTURRET_ATK_INIT, PLANTTURRET_DEF_INIT,
  PLANTTURRET_FIRE_CD_MS, PLANTTURRET_FIRE_JITTER,
  GEARINSECT_HP_INIT, GEARINSECT_ATK_INIT, GEARINSECT_DEF_INIT,
  SPIDERCRAWLER_HP_INIT, SPIDERCRAWLER_ATK_INIT, SPIDERCRAWLER_DEF_INIT,
  MOTESWARM_HP_INIT, MOTESWARM_ATK_INIT, MOTESWARM_DEF_INIT, MOTESWARM_MOTE_COUNT,
  SHADOWHAND_HP_INIT, SHADOWHAND_ATK_INIT, SHADOWHAND_DEF_INIT,
  PLANT_PROJ_HP_INIT, PLANT_PROJ_ATK_INIT, PLANT_PROJ_LIFE_MS,
  PROC_PATROL_TURN_MS,
} from './rpg-procedural-constants';

export function makeDustWispEnemy(x: number, y: number, wave: number): DustWispEnemy {
  const s = getWaveStatScale(wave);
  return {
    kind: 'proc_dustwisp', x, y, vx: 0, vy: 0,
    hp: Math.ceil(DUSTWISP_HP_INIT * s), maxHp: Math.ceil(DUSTWISP_HP_INIT * s),
    atk: Math.ceil(DUSTWISP_ATK_INIT * s), def: Math.ceil(DUSTWISP_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    patrolTimerMs: Math.random() * PROC_PATROL_TURN_MS,
  };
}

export function makeRibbonWormEnemy(x: number, y: number, wave: number): RibbonWormEnemy {
  const s = getWaveStatScale(wave);
  const segX = new Float64Array(RIBBONWORM_SEG_COUNT).fill(x);
  const segY = new Float64Array(RIBBONWORM_SEG_COUNT).fill(y);
  return {
    kind: 'proc_ribbonworm', x, y, vx: 0, vy: 0,
    hp: Math.ceil(RIBBONWORM_HP_INIT * s), maxHp: Math.ceil(RIBBONWORM_HP_INIT * s),
    atk: Math.ceil(RIBBONWORM_ATK_INIT * s), def: Math.ceil(RIBBONWORM_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    segX, segY,
  };
}

export function makeLanternMothEnemy(x: number, y: number, wave: number): LanternMothEnemy {
  const s = getWaveStatScale(wave);
  return {
    kind: 'proc_lanternmoth', x, y, vx: 0, vy: 0,
    hp: Math.ceil(LANTERNMOTH_HP_INIT * s), maxHp: Math.ceil(LANTERNMOTH_HP_INIT * s),
    atk: Math.ceil(LANTERNMOTH_ATK_INIT * s), def: Math.ceil(LANTERNMOTH_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    flapPhase: Math.random() * Math.PI * 2,
  };
}

export function makeEyeStalkEnemy(x: number, y: number, wave: number): EyeStalkEnemy {
  const s = getWaveStatScale(wave);
  return {
    kind: 'proc_eyestalk', x, y, vx: 0, vy: 0,
    hp: Math.ceil(EYESTALK_HP_INIT * s), maxHp: Math.ceil(EYESTALK_HP_INIT * s),
    atk: Math.ceil(EYESTALK_ATK_INIT * s), def: Math.ceil(EYESTALK_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    stalkPhase: Math.random() * Math.PI * 2, eyeAngle: Math.random() * Math.PI * 2,
  };
}

export function makeJellyfishEnemy(x: number, y: number, wave: number): JellyfishEnemy {
  const s = getWaveStatScale(wave);
  return {
    kind: 'proc_jellyfish', x, y, vx: 0, vy: 0,
    hp: Math.ceil(JELLYFISH_HP_INIT * s), maxHp: Math.ceil(JELLYFISH_HP_INIT * s),
    atk: Math.ceil(JELLYFISH_ATK_INIT * s), def: Math.ceil(JELLYFISH_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    bellPhase: Math.random() * Math.PI * 2,
  };
}

export function makeClothGhostEnemy(x: number, y: number, wave: number): ClothGhostEnemy {
  const s = getWaveStatScale(wave);
  return {
    kind: 'proc_clothghost', x, y, vx: 0, vy: 0,
    hp: Math.ceil(CLOTHGHOST_HP_INIT * s), maxHp: Math.ceil(CLOTHGHOST_HP_INIT * s),
    atk: Math.ceil(CLOTHGHOST_ATK_INIT * s), def: Math.ceil(CLOTHGHOST_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    flutterPhase: Math.random() * Math.PI * 2,
  };
}

export function makePlantTurretEnemy(x: number, y: number, wave: number): PlantTurretEnemy {
  const s = getWaveStatScale(wave);
  return {
    kind: 'proc_plantturret', x, y, vx: 0, vy: 0,
    hp: Math.ceil(PLANTTURRET_HP_INIT * s), maxHp: Math.ceil(PLANTTURRET_HP_INIT * s),
    atk: Math.ceil(PLANTTURRET_ATK_INIT * s), def: Math.ceil(PLANTTURRET_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    stemPhase: 0,
    fireTimerMs: PLANTTURRET_FIRE_CD_MS + Math.random() * PLANTTURRET_FIRE_JITTER,
    rootX: x, rootY: y,
  };
}

export function makeGearInsectEnemy(x: number, y: number, wave: number): GearInsectEnemy {
  const s = getWaveStatScale(wave);
  return {
    kind: 'proc_gearinsect', x, y, vx: 0, vy: 0,
    hp: Math.ceil(GEARINSECT_HP_INIT * s), maxHp: Math.ceil(GEARINSECT_HP_INIT * s),
    atk: Math.ceil(GEARINSECT_ATK_INIT * s), def: Math.ceil(GEARINSECT_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    gearAngle: Math.random() * Math.PI * 2, legPhase: Math.random() * Math.PI * 2,
  };
}

export function makeSpiderCrawlerEnemy(x: number, y: number, wave: number): SpiderCrawlerEnemy {
  const s = getWaveStatScale(wave);
  return {
    kind: 'proc_spidercrawler', x, y, vx: 0, vy: 0,
    hp: Math.ceil(SPIDERCRAWLER_HP_INIT * s), maxHp: Math.ceil(SPIDERCRAWLER_HP_INIT * s),
    atk: Math.ceil(SPIDERCRAWLER_ATK_INIT * s), def: Math.ceil(SPIDERCRAWLER_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    legPhase: Math.random() * Math.PI * 2,
  };
}

export function makeMoteSwarmEnemy(x: number, y: number, wave: number): MoteSwarmEnemy {
  const s = getWaveStatScale(wave);
  const moteAngles = new Float64Array(MOTESWARM_MOTE_COUNT);
  for (let i = 0; i < MOTESWARM_MOTE_COUNT; i++) {
    moteAngles[i] = (i / MOTESWARM_MOTE_COUNT) * Math.PI * 2;
  }
  return {
    kind: 'proc_moteswarm', x, y, vx: 0, vy: 0,
    hp: Math.ceil(MOTESWARM_HP_INIT * s), maxHp: Math.ceil(MOTESWARM_HP_INIT * s),
    atk: Math.ceil(MOTESWARM_ATK_INIT * s), def: Math.ceil(MOTESWARM_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    swarmAngle: Math.random() * Math.PI * 2, moteAngles,
  };
}

export function makeShadowHandEnemy(x: number, y: number, wave: number): ShadowHandEnemy {
  const s = getWaveStatScale(wave);
  return {
    kind: 'proc_shadowhand', x, y, vx: 0, vy: 0,
    hp: Math.ceil(SHADOWHAND_HP_INIT * s), maxHp: Math.ceil(SHADOWHAND_HP_INIT * s),
    atk: Math.ceil(SHADOWHAND_ATK_INIT * s), def: Math.ceil(SHADOWHAND_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    graspPhase: 0, reachFraction: 0,
  };
}

export function makePlantProjectile(x: number, y: number, vx: number, vy: number): PlantProjectile {
  return {
    x, y, vx, vy,
    hp: PLANT_PROJ_HP_INIT, maxHp: PLANT_PROJ_HP_INIT,
    atk: PLANT_PROJ_ATK_INIT,
    lifeMs: PLANT_PROJ_LIFE_MS,
    hasHitPlayer: false,
  };
}
