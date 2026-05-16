/**
 * rpg-factories-mid.ts — Factory functions for wave-6 to wave-10 enemy types.
 *
 * Covers: Sunstone, Citrine, Iolite, Amethyst, Diamond, Nullstone.
 * See rpg-factories-early.ts for Laser–Ruby,
 * and rpg-factories-late.ts for Fracteryl, Eigenstein, Elite, Boss.
 */
import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import type {
  SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard, NullstoneEnemy, VoidTendril,
} from './rpg-enemy-types';
import {
  SUNSTONE_HP_INIT, SUNSTONE_ATK_INIT, SUNSTONE_DEF_INIT,
  SUNSTONE_PULSE_CD_MS, SUNSTONE_PULSE_JITTER,
  CITRINE_HP_INIT, CITRINE_ATK_INIT, CITRINE_DEF_INIT,
  CITRINE_BOLT_CD_MS, CITRINE_BOLT_JITTER, CITRINE_PATROL_TURN_MS,
  CITRINE_BOLT_HP_INIT, CITRINE_BOLT_ATK_INIT, CITRINE_BOLT_TRAIL_CAP,
  IOLITE_HP_INIT, IOLITE_ATK_INIT, IOLITE_DEF_INIT,
  IOLITE_BEAM_CD_MS, IOLITE_BEAM_JITTER, IOLITE_PATROL_TURN_MS,
  AMETHYST_HP_INIT, AMETHYST_ATK_INIT, AMETHYST_DEF_INIT, AMETHYST_SHIELD_HP_INIT,
  AMETHYST_BURST_CD_MS, AMETHYST_BURST_JITTER, AMETHYST_PATROL_TURN_MS,
  AMETHYST_SHARD_HP_INIT, AMETHYST_SHARD_ATK_INIT, AMETHYST_SHARD_LIFE_MS,
  DIAMOND_HP_INIT, DIAMOND_ATK_INIT, DIAMOND_DEF_INIT,
  DIAMOND_PHASE_VULN_MS, DIAMOND_SHARD_CD_MS,
  DIAMOND_SHARD_HP_INIT, DIAMOND_SHARD_ATK_INIT, DIAMOND_SHARD_LIFE_MS,
  NULLSTONE_HP_INIT, NULLSTONE_ATK_INIT, NULLSTONE_DEF_INIT,
  NULLSTONE_ABSORB_MS, NULLSTONE_ABSORB_CD_MS, NULLSTONE_TENDRIL_CD_MS, NULLSTONE_PATROL_TURN_MS,
  VOID_TENDRIL_HP_INIT, VOID_TENDRIL_ATK_INIT, VOID_TENDRIL_LIFE_MS,
} from './rpg-enemy-constants';

export function makeSunstoneEnemy(x: number, y: number, waveNumber: number): SunstoneEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'sunstone',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(SUNSTONE_HP_INIT * scale), maxHp: Math.ceil(SUNSTONE_HP_INIT * scale),
    atk: Math.ceil(SUNSTONE_ATK_INIT * scale), def: Math.ceil(SUNSTONE_DEF_INIT * scale),
    pulseTimerMs: SUNSTONE_PULSE_CD_MS + Math.random() * SUNSTONE_PULSE_JITTER,
    orbitAngle: Math.random() * Math.PI * 2,
  };
}

export function makeCitrineEnemy(x: number, y: number, waveNumber: number): CitrineEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'citrine',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(CITRINE_HP_INIT * scale), maxHp: Math.ceil(CITRINE_HP_INIT * scale),
    atk: Math.ceil(CITRINE_ATK_INIT * scale), def: Math.ceil(CITRINE_DEF_INIT * scale),
    boltTimerMs: CITRINE_BOLT_CD_MS + Math.random() * CITRINE_BOLT_JITTER,
    patrolTimerMs: Math.random() * CITRINE_PATROL_TURN_MS,
  };
}

export function makeCitrineBolt(x: number, y: number, vx: number, vy: number): CitrineBolt {
  return {
    x, y, vx, vy,
    hp: CITRINE_BOLT_HP_INIT, maxHp: CITRINE_BOLT_HP_INIT,
    atk: CITRINE_BOLT_ATK_INIT,
    hasHitPlayer: false,
    trailX: new Float64Array(CITRINE_BOLT_TRAIL_CAP),
    trailY: new Float64Array(CITRINE_BOLT_TRAIL_CAP),
    trailHead: 0, trailCount: 0,
  };
}

export function makeIoliteEnemy(x: number, y: number, waveNumber: number): IoliteEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'iolite',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(IOLITE_HP_INIT * scale), maxHp: Math.ceil(IOLITE_HP_INIT * scale),
    atk: Math.ceil(IOLITE_ATK_INIT * scale), def: Math.ceil(IOLITE_DEF_INIT * scale),
    beamTimerMs: IOLITE_BEAM_CD_MS + Math.random() * IOLITE_BEAM_JITTER,
    patrolTimerMs: Math.random() * IOLITE_PATROL_TURN_MS,
  };
}

export function makeAmethystEnemy(x: number, y: number, waveNumber: number): AmethystEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'amethyst',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(AMETHYST_HP_INIT * scale), maxHp: Math.ceil(AMETHYST_HP_INIT * scale),
    atk: Math.ceil(AMETHYST_ATK_INIT * scale), def: Math.ceil(AMETHYST_DEF_INIT * scale),
    shieldHp: Math.ceil(AMETHYST_SHIELD_HP_INIT * scale),
    maxShieldHp: Math.ceil(AMETHYST_SHIELD_HP_INIT * scale),
    burstTimerMs: AMETHYST_BURST_CD_MS + Math.random() * AMETHYST_BURST_JITTER,
    patrolTimerMs: Math.random() * AMETHYST_PATROL_TURN_MS,
  };
}

export function makeAmethystShard(x: number, y: number, vx: number, vy: number): AmethystShard {
  return {
    x, y, vx, vy,
    hp: AMETHYST_SHARD_HP_INIT, maxHp: AMETHYST_SHARD_HP_INIT,
    atk: AMETHYST_SHARD_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: AMETHYST_SHARD_LIFE_MS,
  };
}

export function makeDiamondEnemy(x: number, y: number, waveNumber: number): DiamondEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'diamond',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(DIAMOND_HP_INIT * scale), maxHp: Math.ceil(DIAMOND_HP_INIT * scale),
    atk: Math.ceil(DIAMOND_ATK_INIT * scale), def: Math.ceil(DIAMOND_DEF_INIT * scale),
    phaseInvuln: false,
    phaseTimerMs: DIAMOND_PHASE_VULN_MS,
    shardTimerMs: DIAMOND_SHARD_CD_MS + Math.random() * 500,
    orbitAngle: Math.random() * Math.PI * 2,
  };
}

export function makeDiamondShard(x: number, y: number, vx: number, vy: number): DiamondShard {
  return {
    x, y, vx, vy,
    hp: DIAMOND_SHARD_HP_INIT, maxHp: DIAMOND_SHARD_HP_INIT,
    atk: DIAMOND_SHARD_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: DIAMOND_SHARD_LIFE_MS,
  };
}

export function makeNullstoneEnemy(x: number, y: number, waveNumber: number): NullstoneEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'nullstone',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(NULLSTONE_HP_INIT * scale), maxHp: Math.ceil(NULLSTONE_HP_INIT * scale),
    atk: Math.ceil(NULLSTONE_ATK_INIT * scale), def: Math.ceil(NULLSTONE_DEF_INIT * scale),
    isAbsorbing: false,
    absorbTimerMs: NULLSTONE_ABSORB_MS,
    absorbCdMs: NULLSTONE_ABSORB_CD_MS,
    tendrilTimerMs: NULLSTONE_TENDRIL_CD_MS + Math.random() * 1000,
    patrolTimerMs: Math.random() * NULLSTONE_PATROL_TURN_MS,
    pulseMs: Math.random() * 2000,
  };
}

export function makeVoidTendril(x: number, y: number, vx: number, vy: number): VoidTendril {
  return {
    x, y, vx, vy,
    hp: VOID_TENDRIL_HP_INIT, maxHp: VOID_TENDRIL_HP_INIT,
    atk: VOID_TENDRIL_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: VOID_TENDRIL_LIFE_MS,
  };
}
