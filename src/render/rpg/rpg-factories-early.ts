/**
 * rpg-factories-early.ts — Factory functions for wave-1 to wave-5 enemy types.
 *
 * Covers: AttackTrail, Laser, Sapphire, Emerald, Amber, Void, Quartz, Ruby.
 * See rpg-factories-mid.ts for Sunstone–Nullstone,
 * and rpg-factories-late.ts for Fracteryl, Eigenstein, Elite, Boss.
 */
import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import type { AttackTrailState, LaserEnemy, SapphireEnemy, SapphireMissile } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard, VoidEnemy,
  QuartzEnemy, QuartzSpike, RubyEnemy, RubyBolt,
} from './rpg-enemy-types';
import {
  LASER_HP_INIT, LASER_ATK_INIT, LASER_DEF_INIT, LASER_PATROL_TURN_MS,
  SAPPHIRE_HP_INIT, SAPPHIRE_ATK_INIT, SAPPHIRE_DEF_INIT, SAPPHIRE_SHIELD_HP_INIT,
  SAPPHIRE_MISSILE_CD_MS, SAPPHIRE_MISSILE_JITTER, SAPPHIRE_PATROL_TURN_MS,
  MISSILE_HP_INIT, MISSILE_ATK_INIT, MISSILE_TRAIL_CAP,
} from './rpg-constants';
import {
  EMERALD_HP_INIT, EMERALD_ATK_INIT, EMERALD_DEF_INIT, EMERALD_PATROL_TURN_MS,
  AMBER_HP_INIT, AMBER_ATK_INIT, AMBER_DEF_INIT,
  AMBER_MISSILE_CD_MS, AMBER_MISSILE_JITTER, AMBER_PATROL_TURN_MS,
  AMBER_SHARD_HP_INIT, AMBER_SHARD_ATK_INIT, AMBER_SHARD_TRAIL_CAP,
  VOID_HP_INIT, VOID_ATK_INIT, VOID_DEF_INIT, VOID_AURA_PULSE_MS,
  QUARTZ_HP_INIT, QUARTZ_ATK_INIT, QUARTZ_DEF_INIT,
  QUARTZ_SPIKE_CD_MS, QUARTZ_SPIKE_JITTER,
  QUARTZ_SPIKE_HP_INIT, QUARTZ_SPIKE_ATK_INIT, QUARTZ_SPIKE_LIFE_MS,
  RUBY_HP_INIT, RUBY_ATK_INIT, RUBY_DEF_INIT,
  RUBY_BOLT_CD_MS, RUBY_BOLT_JITTER,
  RUBY_BOLT_HP_INIT, RUBY_BOLT_ATK_INIT, RUBY_BOLT_LIFE_MS,
} from './rpg-enemy-constants';

export function makeAttackTrail(): AttackTrailState {
  return { active: false, startX: 0, startY: 0, endX: 0, endY: 0,
           controlAngle: 0, trailStartMs: 0, trailEndMs: Infinity };
}

export function makeLaserEnemy(x: number, y: number, waveNumber: number): LaserEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(LASER_HP_INIT * scale), maxHp: Math.ceil(LASER_HP_INIT * scale),
    atk: Math.ceil(LASER_ATK_INIT * scale), def: Math.ceil(LASER_DEF_INIT * scale),
    phase: 'idle', phaseElapsedMs: 0,
    dashDirX: 0, dashDirY: 0, dashTraveled: 0,
    lockedTargetX: 0, lockedTargetY: 0,
    attackTrail: makeAttackTrail(),
    patrolTimerMs: Math.random() * LASER_PATROL_TURN_MS,
    hasHitPlayer: false,
  };
}

export function makeSapphireEnemy(x: number, y: number, waveNumber: number): SapphireEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(SAPPHIRE_HP_INIT * scale), maxHp: Math.ceil(SAPPHIRE_HP_INIT * scale),
    atk: Math.ceil(SAPPHIRE_ATK_INIT * scale), def: Math.ceil(SAPPHIRE_DEF_INIT * scale),
    shieldHp: Math.ceil(SAPPHIRE_SHIELD_HP_INIT * scale), maxShieldHp: Math.ceil(SAPPHIRE_SHIELD_HP_INIT * scale),
    missileTimerMs: SAPPHIRE_MISSILE_CD_MS + Math.random() * SAPPHIRE_MISSILE_JITTER,
    patrolTimerMs: Math.random() * SAPPHIRE_PATROL_TURN_MS,
  };
}

export function makeSapphireMissile(x: number, y: number, vx: number, vy: number): SapphireMissile {
  return {
    x, y, vx, vy,
    hp: MISSILE_HP_INIT, maxHp: MISSILE_HP_INIT,
    atk: MISSILE_ATK_INIT,
    trailX: new Float64Array(MISSILE_TRAIL_CAP),
    trailY: new Float64Array(MISSILE_TRAIL_CAP),
    trailHead: 0, trailCount: 0,
    hasHitPlayer: false,
    lifetimeMs: 0,
  };
}

export function makeEmeraldEnemy(x: number, y: number, waveNumber: number): EmeraldEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'emerald',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(EMERALD_HP_INIT * scale), maxHp: Math.ceil(EMERALD_HP_INIT * scale),
    atk: Math.ceil(EMERALD_ATK_INIT * scale), def: Math.ceil(EMERALD_DEF_INIT * scale),
    phase: 'patrol', phaseMs: 0,
    patrolTimerMs: Math.random() * EMERALD_PATROL_TURN_MS,
    ghostX: x, ghostY: y, ghostAlpha: 0,
    hasHitPlayer: false,
  };
}

export function makeAmberEnemy(x: number, y: number, waveNumber: number): AmberEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'amber',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(AMBER_HP_INIT * scale), maxHp: Math.ceil(AMBER_HP_INIT * scale),
    atk: Math.ceil(AMBER_ATK_INIT * scale), def: Math.ceil(AMBER_DEF_INIT * scale),
    missileTimerMs: AMBER_MISSILE_CD_MS + Math.random() * AMBER_MISSILE_JITTER,
    patrolTimerMs: Math.random() * AMBER_PATROL_TURN_MS,
  };
}

export function makeAmberShard(x: number, y: number, vx: number, vy: number): AmberShard {
  return {
    x, y, vx, vy,
    hp: AMBER_SHARD_HP_INIT, maxHp: AMBER_SHARD_HP_INIT,
    atk: AMBER_SHARD_ATK_INIT,
    trailX: new Float64Array(AMBER_SHARD_TRAIL_CAP),
    trailY: new Float64Array(AMBER_SHARD_TRAIL_CAP),
    trailHead: 0, trailCount: 0,
    hasHitPlayer: false,
  };
}

export function makeVoidEnemy(x: number, y: number, waveNumber: number): VoidEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'void',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(VOID_HP_INIT * scale), maxHp: Math.ceil(VOID_HP_INIT * scale),
    atk: Math.ceil(VOID_ATK_INIT * scale), def: Math.ceil(VOID_DEF_INIT * scale),
    contactCdMs: 0,
    pulseMs: Math.random() * VOID_AURA_PULSE_MS,
  };
}

export function makeQuartzEnemy(x: number, y: number, waveNumber: number): QuartzEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'quartz',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(QUARTZ_HP_INIT * scale), maxHp: Math.ceil(QUARTZ_HP_INIT * scale),
    atk: Math.ceil(QUARTZ_ATK_INIT * scale), def: Math.ceil(QUARTZ_DEF_INIT * scale),
    spikeTimerMs: QUARTZ_SPIKE_CD_MS + Math.random() * QUARTZ_SPIKE_JITTER,
    strafeDirFlipMs: 2000 + Math.random() * 2000,
    strafeDir: (Math.random() < 0.5 ? 1 : -1) as 1 | -1,
  };
}

export function makeQuartzSpike(x: number, y: number, vx: number, vy: number): QuartzSpike {
  return {
    x, y, vx, vy,
    hp: QUARTZ_SPIKE_HP_INIT, maxHp: QUARTZ_SPIKE_HP_INIT,
    atk: QUARTZ_SPIKE_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: QUARTZ_SPIKE_LIFE_MS,
  };
}

export function makeRubyEnemy(x: number, y: number, waveNumber: number): RubyEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'ruby',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(RUBY_HP_INIT * scale), maxHp: Math.ceil(RUBY_HP_INIT * scale),
    atk: Math.ceil(RUBY_ATK_INIT * scale), def: Math.ceil(RUBY_DEF_INIT * scale),
    boltTimerMs: RUBY_BOLT_CD_MS + Math.random() * RUBY_BOLT_JITTER,
    patrolTimerMs: Math.random() * 2000,
    consecutiveShots: 0,
  };
}

export function makeRubyBolt(x: number, y: number, vx: number, vy: number): RubyBolt {
  return {
    x, y, vx, vy,
    hp: RUBY_BOLT_HP_INIT, maxHp: RUBY_BOLT_HP_INIT,
    atk: RUBY_BOLT_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: RUBY_BOLT_LIFE_MS,
  };
}
