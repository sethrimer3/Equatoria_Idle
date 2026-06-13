/**
 * rpg-procedural-factories.ts — Factory functions for the procedural creature types.
 *
 * All factories follow the same convention used by the existing enemy factories:
 *   make<TypeName>(x, y, waveNumber) — returns a fully initialised enemy struct.
 *   makePlantProjectile(x, y, vx, vy) — creates a single fired projectile.
 *
 * Stats are wave-scaled at spawn time using getWaveStatScale.
 */
import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import { createRpgPathState } from './terrain/rpg-pathfinding';
import type {
  DustWispEnemy, RibbonWormEnemy, LanternMothEnemy, EyeStalkEnemy,
  JellyfishEnemy, ClothGhostEnemy, PlantTurretEnemy, GearInsectEnemy,
  SpiderCrawlerEnemy, MoteSwarmEnemy, ShadowHandEnemy, PlantProjectile,
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
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
  SANDFISH_HP_INIT, SANDFISH_ATK_INIT, SANDFISH_DEF_INIT, SANDFISH_LUNGE_CD_MS,
  QUARTZFISH_HP_INIT, QUARTZFISH_ATK_INIT, QUARTZFISH_DEF_INIT, QUARTZFISH_SHIELD_HP,
  RUBYFISH_HP_INIT, RUBYFISH_ATK_INIT, RUBYFISH_DEF_INIT,
  SUNSTONEFISH_HP_INIT, SUNSTONEFISH_ATK_INIT, SUNSTONEFISH_DEF_INIT, SUNSTONEFISH_MINE_CD_MS,
  EMERALDFISH_HP_INIT, EMERALDFISH_ATK_INIT, EMERALDFISH_DEF_INIT,
  EMERALDFISH_MINI_HP_INIT, EMERALDFISH_MINI_ATK_INIT,
  SAPPHIREFISH_HP_INIT, SAPPHIREFISH_ATK_INIT, SAPPHIREFISH_DEF_INIT, SAPPHIREFISH_BOLT_CD_MS,
  AMETHYSTFISH_HP_INIT, AMETHYSTFISH_ATK_INIT, AMETHYSTFISH_DEF_INIT, AMETHYSTFISH_TELEPORT_CD_MS,
  DIAMONDFISH_HP_INIT, DIAMONDFISH_ATK_INIT, DIAMONDFISH_DEF_INIT, DIAMONDFISH_ARMOR_OFF_MS,
  SUNSTONEFISH_MINE_ARM_MS, SUNSTONEFISH_MINE_LIFE_MS,
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
  const seed = Math.abs(Math.sin(x * 12.9898 + y * 78.233 + wave * 5.17));
  const tailCount = 3 + Math.floor(seed * 3), segmentsPerTail = 6 + Math.floor(seed * 3);
  const segX = new Float64Array(tailCount * segmentsPerTail).fill(x);
  const segY = new Float64Array(tailCount * segmentsPerTail).fill(y);
  return {
    kind: 'proc_jellyfish', x, y, vx: 0, vy: 0,
    hp: Math.ceil(JELLYFISH_HP_INIT * s), maxHp: Math.ceil(JELLYFISH_HP_INIT * s),
    atk: Math.ceil(JELLYFISH_ATK_INIT * s), def: Math.ceil(JELLYFISH_DEF_INIT * s),
    animPhase: Math.random() * Math.PI * 2, hitFlashMs: 0, contactCdMs: 0,
    bellPhase: Math.random() * Math.PI * 2,
    movementState: 'drift', stateTimerMs: 500 + seed * 700,
    facingRad: seed * Math.PI * 2, targetX: x, targetY: y, wanderPhase: seed * Math.PI * 2,
    bellSize: 7.2 + seed * 1.8, bellTint: seed > 0.66 ? '#a8e8ff' : seed > 0.33 ? '#96d8f0' : '#86cbea',
    pulseCadenceMs: 1650 + seed * 650, tailCount, segmentsPerTail, segLength: 3.5 + seed,
    segX, segY, segPrevX: segX.slice(), segPrevY: segY.slice(),
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
  for (let i = 0; i < MOTESWARM_MOTE_COUNT; i++) moteAngles[i] = (i / MOTESWARM_MOTE_COUNT) * Math.PI * 2;
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

function makeFishBase<T extends string>(kind: T, x: number, y: number, wave: number, hp0: number, atk0: number, def0: number) {
  const s = getWaveStatScale(wave);
  return {
    kind,
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(hp0 * s), maxHp: Math.ceil(hp0 * s),
    atk: Math.ceil(atk0 * s), def: Math.ceil(def0 * s),
    animPhase: Math.random() * Math.PI * 2,
    hitFlashMs: 0,
    contactCdMs: 0,
    swimAngle: Math.random() * Math.PI * 2,
    turnPhase: Math.random() * Math.PI * 2,
    pathState: createRpgPathState(),
    stuckMs: 0,
    stuckRecoveryMs: 0,
  };
}

export function makeSandFishEnemy(x: number, y: number, wave: number): SandFishEnemy {
  return {
    ...makeFishBase('proc_sandfish', x, y, wave, SANDFISH_HP_INIT, SANDFISH_ATK_INIT, SANDFISH_DEF_INIT),
    lungeTimerMs: SANDFISH_LUNGE_CD_MS + Math.random() * 1000,
  };
}

export function makeQuartzFishEnemy(x: number, y: number, wave: number): QuartzFishEnemy {
  return {
    ...makeFishBase('proc_quartzfish', x, y, wave, QUARTZFISH_HP_INIT, QUARTZFISH_ATK_INIT, QUARTZFISH_DEF_INIT),
    shieldHp: QUARTZFISH_SHIELD_HP,
    shieldBroken: false,
  };
}

export function makeRubyFishEnemy(x: number, y: number, wave: number): RubyFishEnemy {
  return {
    ...makeFishBase('proc_rubyfish', x, y, wave, RUBYFISH_HP_INIT, RUBYFISH_ATK_INIT, RUBYFISH_DEF_INIT),
    dashState: 'idle',
    dashTimerMs: 2500 + Math.random() * 2000,
    dashVx: 0,
    dashVy: 0,
  };
}

export function makeSunstoneFishEnemy(x: number, y: number, wave: number): SunstoneFishEnemy {
  return {
    ...makeFishBase('proc_sunstonefish', x, y, wave, SUNSTONEFISH_HP_INIT, SUNSTONEFISH_ATK_INIT, SUNSTONEFISH_DEF_INIT),
    mineTimerMs: SUNSTONEFISH_MINE_CD_MS + Math.random() * 1000,
  };
}

export function makeEmeraldFishEnemy(x: number, y: number, wave: number): EmeraldFishEnemy {
  return {
    ...makeFishBase('proc_emeraldfish', x, y, wave, EMERALDFISH_HP_INIT, EMERALDFISH_ATK_INIT, EMERALDFISH_DEF_INIT),
    isMini: false,
    splitDone: false,
  };
}

export function makeEmeraldFishMini(x: number, y: number, wave: number, swimAngle: number): EmeraldFishEnemy {
  return {
    ...makeFishBase('proc_emeraldfish', x, y, wave, EMERALDFISH_MINI_HP_INIT, EMERALDFISH_MINI_ATK_INIT, 0),
    swimAngle,
    isMini: true,
    splitDone: true,
  };
}

export function makeSapphireFishEnemy(x: number, y: number, wave: number): SapphireFishEnemy {
  return {
    ...makeFishBase('proc_sapphirefish', x, y, wave, SAPPHIREFISH_HP_INIT, SAPPHIREFISH_ATK_INIT, SAPPHIREFISH_DEF_INIT),
    boltTimerMs: SAPPHIREFISH_BOLT_CD_MS + Math.random() * 500,
  };
}

export function makeAmethystFishEnemy(x: number, y: number, wave: number): AmethystFishEnemy {
  return {
    ...makeFishBase('proc_amethystfish', x, y, wave, AMETHYSTFISH_HP_INIT, AMETHYSTFISH_ATK_INIT, AMETHYSTFISH_DEF_INIT),
    teleportCdMs: AMETHYSTFISH_TELEPORT_CD_MS + Math.random() * 1000,
  };
}

export function makeDiamondFishEnemy(x: number, y: number, wave: number): DiamondFishEnemy {
  return {
    ...makeFishBase('proc_diamondfish', x, y, wave, DIAMONDFISH_HP_INIT, DIAMONDFISH_ATK_INIT, DIAMONDFISH_DEF_INIT),
    armorActive: false,
    armorTimerMs: DIAMONDFISH_ARMOR_OFF_MS,
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

export function makeFishMine(x: number, y: number, vx: number, vy: number, atk: number): FishMine {
  return { x, y, vx, vy, armedMs: SUNSTONEFISH_MINE_ARM_MS, lifeMs: SUNSTONEFISH_MINE_LIFE_MS, atk };
}

export function makeFishSpike(x: number, y: number, vx: number, vy: number, atk: number): FishSpike {
  return { x, y, vx, vy, lifeMs: 900, atk, hasHit: false };
}

export function makeFishBolt(x: number, y: number, vx: number, vy: number, atk: number): FishBolt {
  return { x, y, vx, vy, lifeMs: 2400, atk, hasHit: false };
}

export function makeFishDecoy(x: number, y: number, swimAngle: number, animPhase: number): FishDecoy {
  return { x, y, lifeMs: 1500, swimAngle, animPhase };
}
