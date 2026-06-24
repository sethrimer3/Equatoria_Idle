/**
 * rpg-factories-late.ts — Factory functions for late-game enemy types and bosses.
 *
 * Covers: Fracteryl, Eigenstein, DanmakuSafeZone, Elite, Boss.
 * See rpg-factories-early.ts for Laser–Ruby,
 * and rpg-factories-mid.ts for Sunstone–Nullstone.
 */
import { getWaveStatScale } from '../../sim/rpg/rpg-state';
import type {
  FracterylEnemy, FracterylShard, EigensteinEnemy, DanmakuSafeZone,
  BossEnemy, EliteEnemy, EliteTier,
} from './rpg-enemy-types';
import {
  DANMAKU_WARN_MS,
  BOSS_HP_INIT, BOSS_ATK_INIT, BOSS_DEF_INIT, BOSS_SHIELD_INIT,
} from './rpg-constants';
import {
  FRACTERYL_HP_INIT, FRACTERYL_ATK_INIT, FRACTERYL_DEF_INIT,
  FRACTERYL_BURST_CD_MS, FRACTERYL_BURST_JITTER, FRACTERYL_PATROL_TURN_MS,
  FRACTERYL_SHARD_HP_INIT, FRACTERYL_SHARD_ATK_INIT, FRACTERYL_SHARD_LIFE_MS,
  EIGENSTEIN_HP_INIT, EIGENSTEIN_ATK_INIT, EIGENSTEIN_DEF_INIT,
  EIGENSTEIN_BEAM_CD_MS, EIGENSTEIN_BEAM_JITTER, EIGENSTEIN_PATROL_TURN_MS,
  ELITE_QUARTZ_HP, ELITE_QUARTZ_ATK, ELITE_QUARTZ_DEF,
  ELITE_RUBY_HP, ELITE_RUBY_ATK, ELITE_RUBY_DEF,
  ELITE_SUNSTONE_HP, ELITE_SUNSTONE_ATK, ELITE_SUNSTONE_DEF,
  ELITE_CITRINE_HP, ELITE_CITRINE_ATK, ELITE_CITRINE_DEF,
  ELITE_IOLITE_HP, ELITE_IOLITE_ATK, ELITE_IOLITE_DEF,
  ELITE_AMETHYST_HP, ELITE_AMETHYST_ATK, ELITE_AMETHYST_DEF, ELITE_AMETHYST_SHIELD,
  ELITE_DIAMOND_HP, ELITE_DIAMOND_ATK, ELITE_DIAMOND_DEF,
  ELITE_NULLSTONE_HP, ELITE_NULLSTONE_ATK, ELITE_NULLSTONE_DEF,
  ELITE_QUARTZ_A1_CD_MS, ELITE_QUARTZ_A2_CD_MS,
  ELITE_RUBY_A1_CD_MS, ELITE_RUBY_A2_CD_MS,
  ELITE_SUNSTONE_A1_CD_MS, ELITE_SUNSTONE_A2_CD_MS,
  ELITE_CITRINE_A1_CD_MS, ELITE_CITRINE_A2_CD_MS,
  ELITE_IOLITE_A1_CD_MS, ELITE_IOLITE_A2_CD_MS,
  ELITE_AMETHYST_A1_CD_MS,
  ELITE_DIAMOND_A1_CD_MS, ELITE_DIAMOND_VULN_MS,
  ELITE_NULLSTONE_A1_CD_MS,
  ELITE_PATROL_TURN_MS,
} from './rpg-enemy-constants';

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

/** Creates an elite enemy of the given tier at (x, y), scaling stats by waveNumber. */
export function makeEliteEnemy(tier: EliteTier, x: number, y: number, waveNumber: number): EliteEnemy {
  const scale = getWaveStatScale(waveNumber);
  const HP_MAP:  Record<EliteTier, number> = {
    quartz: ELITE_QUARTZ_HP,  ruby: ELITE_RUBY_HP,  sunstone: ELITE_SUNSTONE_HP,
    citrine: ELITE_CITRINE_HP, iolite: ELITE_IOLITE_HP, amethyst: ELITE_AMETHYST_HP,
    diamond: ELITE_DIAMOND_HP, nullstone: ELITE_NULLSTONE_HP,
  };
  const ATK_MAP: Record<EliteTier, number> = {
    quartz: ELITE_QUARTZ_ATK, ruby: ELITE_RUBY_ATK, sunstone: ELITE_SUNSTONE_ATK,
    citrine: ELITE_CITRINE_ATK, iolite: ELITE_IOLITE_ATK, amethyst: ELITE_AMETHYST_ATK,
    diamond: ELITE_DIAMOND_ATK, nullstone: ELITE_NULLSTONE_ATK,
  };
  const DEF_MAP: Record<EliteTier, number> = {
    quartz: ELITE_QUARTZ_DEF, ruby: ELITE_RUBY_DEF, sunstone: ELITE_SUNSTONE_DEF,
    citrine: ELITE_CITRINE_DEF, iolite: ELITE_IOLITE_DEF, amethyst: ELITE_AMETHYST_DEF,
    diamond: ELITE_DIAMOND_DEF, nullstone: ELITE_NULLSTONE_DEF,
  };
  const A1_MAP: Record<EliteTier, number> = {
    quartz: ELITE_QUARTZ_A1_CD_MS,  ruby: ELITE_RUBY_A1_CD_MS,
    sunstone: ELITE_SUNSTONE_A1_CD_MS, citrine: ELITE_CITRINE_A1_CD_MS,
    iolite: ELITE_IOLITE_A1_CD_MS,  amethyst: ELITE_AMETHYST_A1_CD_MS,
    diamond: ELITE_DIAMOND_A1_CD_MS, nullstone: ELITE_NULLSTONE_A1_CD_MS,
  };
  const A2_MAP: Record<EliteTier, number> = {
    quartz: ELITE_QUARTZ_A2_CD_MS,  ruby: ELITE_RUBY_A2_CD_MS,
    sunstone: ELITE_SUNSTONE_A2_CD_MS, citrine: ELITE_CITRINE_A2_CD_MS,
    iolite: ELITE_IOLITE_A2_CD_MS,
    amethyst: 0,       // amethyst uses reactive shield burst, timer unused
    diamond: ELITE_DIAMOND_VULN_MS, // diamond phase cycle initialized as vulnerable
    nullstone: 0,      // nullstone uses HP-threshold trigger, timer unused
  };
  const hp    = Math.ceil(HP_MAP[tier]  * scale);
  const atk   = Math.ceil(ATK_MAP[tier] * scale);
  const def   = Math.ceil(DEF_MAP[tier] * scale);
  const shield = tier === 'amethyst' ? Math.ceil(ELITE_AMETHYST_SHIELD * scale) : 0;
  return {
    kind: 'elite', tier,
    x, y, vx: 0, vy: 0,
    hp, maxHp: hp, atk, def,
    attack1TimerMs: A1_MAP[tier] * (0.5 + Math.random() * 0.5),
    attack2TimerMs: A2_MAP[tier],
    pulseMs: 0,
    orbitAngle: Math.random() * Math.PI * 2,
    isInvuln: false,
    invulnTimerMs: 0,
    gravityTimerMs: 0,
    patrolTimerMs: ELITE_PATROL_TURN_MS * Math.random(),
    shieldHp: shield,
    maxShieldHp: shield,
    hasTriggeredLowHp: false,
    pendingSalvoMs: -1,
    spawnTimeMs: performance.now(),
  };
}

/**
 * Creates a new BossEnemy for the given raw boss ID and wave number.
 *
 * @param rawBossId  Monotonically increasing boss counter (1-based); cycles
 *                   through 13 visual bosses with increasing extra scale every
 *                   13 bosses.
 * @param waveNumber Current wave number — used to scale boss stats.
 * @param w          Canvas width in pixels — used to centre the initial X position.
 * @param h          Canvas height in pixels — used to set the initial Y position.
 */
export function makeBossEnemy(rawBossId: number, waveNumber: number, w: number, h: number): BossEnemy {
  // Sand Warden (bossId 0) — tutorial boss with low stats
  if (rawBossId === 0) {
    return {
      kind: 'boss',
      bossId: 0,
      phaseIndex: 0,
      x: w / 2, y: h * 0.25,
      vx: 0, vy: 0,
      hp: 600, maxHp: 600,
      atk: 15, def: 5,
      attackTimerMs: 1000,
      secondaryTimerMs: 2000,
      orbitAngle: 0,
      pulseMs: 0,
      shieldHp: 0, maxShieldHp: 0,
      isInvuln: false, invulnTimerMs: 0,
      isAbsorbing: false, absorbTimerMs: 0,
      contactCdMs: 0,
      phaseTransitionMs: 0,
      danmakuLevel: 0,
      isFiringPaused: false,
    };
  }
  const bossScale = getWaveStatScale(waveNumber) * 4.0;
  const bossNum = ((rawBossId - 1) % 13) + 1;
  const extraScale = Math.floor((rawBossId - 1) / 13) + 1;
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
