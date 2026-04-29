// rpg-factories.ts — extracted from rpg-render.ts
import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import {
  AttackTrailState, LaserEnemy, SapphireEnemy, SapphireMissile,
  EmeraldEnemy, AmberEnemy, AmberShard, VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard, DiamondEnemy, DiamondShard,
  NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard, EigensteinEnemy, DanmakuSafeZone,
  BossEnemy,
} from './rpg-types';
import {
  LASER_HP_INIT, LASER_ATK_INIT, LASER_DEF_INIT, LASER_PATROL_TURN_MS,
  SAPPHIRE_HP_INIT, SAPPHIRE_ATK_INIT, SAPPHIRE_DEF_INIT, SAPPHIRE_SHIELD_HP_INIT,
  SAPPHIRE_MISSILE_CD_MS, SAPPHIRE_MISSILE_JITTER, SAPPHIRE_PATROL_TURN_MS,
  MISSILE_HP_INIT, MISSILE_ATK_INIT, MISSILE_TRAIL_CAP,
  DANMAKU_WARN_MS,
  BOSS_HP_INIT, BOSS_ATK_INIT, BOSS_DEF_INIT, BOSS_SHIELD_INIT,
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
  FRACTERYL_HP_INIT, FRACTERYL_ATK_INIT, FRACTERYL_DEF_INIT,
  FRACTERYL_BURST_CD_MS, FRACTERYL_BURST_JITTER, FRACTERYL_PATROL_TURN_MS,
  FRACTERYL_SHARD_HP_INIT, FRACTERYL_SHARD_ATK_INIT, FRACTERYL_SHARD_LIFE_MS,
  EIGENSTEIN_HP_INIT, EIGENSTEIN_ATK_INIT, EIGENSTEIN_DEF_INIT,
  EIGENSTEIN_BEAM_CD_MS, EIGENSTEIN_BEAM_JITTER, EIGENSTEIN_PATROL_TURN_MS,
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

export function makeFracterylEnemy(x: number, y: number, waveNumber: number): FracterylEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'fracteryl',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(FRACTERYL_HP_INIT * scale), maxHp: Math.ceil(FRACTERYL_HP_INIT * scale),
    atk: Math.ceil(FRACTERYL_ATK_INIT * scale), def: Math.ceil(FRACTERYL_DEF_INIT * scale),
    burstTimerMs: FRACTERYL_BURST_CD_MS + Math.random() * FRACTERYL_BURST_JITTER,
    patrolTimerMs: Math.random() * FRACTERYL_PATROL_TURN_MS,
    orbitAngle: Math.random() * Math.PI * 2,
    pulseMs: Math.random() * 2000,
  };
}

export function makeFracterylShard(x: number, y: number, vx: number, vy: number, generation: number): FracterylShard {
  return {
    x, y, vx, vy,
    hp: FRACTERYL_SHARD_HP_INIT, maxHp: FRACTERYL_SHARD_HP_INIT,
    atk: FRACTERYL_SHARD_ATK_INIT,
    hasHitPlayer: false,
    lifeMs: FRACTERYL_SHARD_LIFE_MS * (generation === 0 ? 1 : 0.6),
    generation,
  };
}

export function makeEigensteinEnemy(x: number, y: number, waveNumber: number): EigensteinEnemy {
  const scale = getWaveStatScale(waveNumber);
  return {
    kind: 'eigenstein',
    x, y, vx: 0, vy: 0,
    hp: Math.ceil(EIGENSTEIN_HP_INIT * scale), maxHp: Math.ceil(EIGENSTEIN_HP_INIT * scale),
    atk: Math.ceil(EIGENSTEIN_ATK_INIT * scale), def: Math.ceil(EIGENSTEIN_DEF_INIT * scale),
    beamAngle: Math.random() * Math.PI * 2,
    beamTimerMs: EIGENSTEIN_BEAM_CD_MS + Math.random() * EIGENSTEIN_BEAM_JITTER,
    beamChargeMs: 0,
    isChargingBeam: false,
    patrolTimerMs: Math.random() * EIGENSTEIN_PATROL_TURN_MS,
    pulseMs: Math.random() * 2000,
  };
}

export function makeDanmakuSafeZone(x: number, y: number, angle: number, width: number): DanmakuSafeZone {
  return { x, y, angle, width, timerMs: DANMAKU_WARN_MS, maxTimerMs: DANMAKU_WARN_MS };
}

/**
 * Creates a new BossEnemy for the given raw boss ID and wave number.
 *
 * @param rawBossId  Monotonically increasing boss counter (1-based); cycles
 *                   through 12 visual bosses with increasing extra scale every
 *                   12 bosses.
 * @param waveNumber Current wave number — used to scale boss stats.
 * @param w          Canvas width in pixels — used to centre the initial X position.
 * @param h          Canvas height in pixels — used to set the initial Y position.
 */
export function makeBossEnemy(rawBossId: number, waveNumber: number, w: number, h: number): BossEnemy {
  const bossScale = getWaveStatScale(waveNumber) * 4.0;
  const bossNum = ((rawBossId - 1) % 12) + 1;
  const extraScale = Math.floor((rawBossId - 1) / 12) + 1;
  const hp = Math.ceil(BOSS_HP_INIT * bossScale * extraScale);
  const atk = Math.ceil(BOSS_ATK_INIT * getWaveStatScale(waveNumber) * extraScale);
  const def = Math.ceil(BOSS_DEF_INIT * getWaveStatScale(waveNumber) * extraScale);
  const shieldHp = bossNum === 6 ? Math.ceil(BOSS_SHIELD_INIT * bossScale * extraScale) : 0;
  return {
    kind: 'boss',
    bossId: bossNum,
    phaseIndex: 0,
    x: w / 2, y: h * 0.25,
    vx: 0, vy: 0,
    hp, maxHp: hp,
    atk, def,
    attackTimerMs: 1000,
    secondaryTimerMs: 2000,
    orbitAngle: 0,
    pulseMs: 0,
    shieldHp, maxShieldHp: shieldHp,
    isInvuln: false, invulnTimerMs: 0,
    isAbsorbing: false, absorbTimerMs: 0,
    contactCdMs: 0,
    phaseTransitionMs: 0,
    danmakuLevel: 0,
    isFiringPaused: false,
  };
}
