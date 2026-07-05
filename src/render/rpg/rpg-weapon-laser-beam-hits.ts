import {
  HIT_EFFECT_DURATION_MS,
  BOSS_SIZE_BASE,
  LASER_ENEMY_SIZE, SAPPHIRE_SHIELD_RADIUS, MISSILE_SIZE,
} from './rpg-constants';
import {
  EMERALD_ENEMY_SIZE, AMBER_ENEMY_SIZE, AMBER_SHARD_SIZE,
  VOID_ENEMY_SIZE, QUARTZ_ENEMY_SIZE,
  RUBY_ENEMY_SIZE, SUNSTONE_ENEMY_SIZE, CITRINE_ENEMY_SIZE,
  IOLITE_ENEMY_SIZE, AMETHYST_ENEMY_SIZE,
  DIAMOND_ENEMY_SIZE, NULLSTONE_ENEMY_SIZE,
  FRACTERYL_ENEMY_SIZE, EIGENSTEIN_ENEMY_SIZE,
  ELITE_NULLSTONE_RADIUS,
} from './rpg-enemy-constants';
import type { HitEffect, LaserEnemy, SapphireEnemy, SapphireMissile } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy,
  RubyEnemy, SunstoneEnemy, CitrineEnemy,
  IoliteEnemy, AmethystEnemy,
  DiamondEnemy, NullstoneEnemy,
  FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
} from './rpg-enemy-types';
import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import type { LifeColonyController } from './life-types';
import { lifeGridToWorldCenter } from './life-grid';

export interface LaserBeamHitSweepCtx {
  originX: number;
  originY: number;
  dirX: number;
  dirY: number;
  tMax: number;
  baseDamage: number;
  beamColor: string;
  beamGlow: string;
  hitEffects: HitEffect[];
  bossEnemy: BossEnemy | null;
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  sapphireMissiles: SapphireMissile[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  amberShards: AmberShard[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  rubyEnemies: RubyEnemy[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  diamondEnemies: DiamondEnemy[];
  nullstoneEnemies: NullstoneEnemy[];
  fracterylEnemies: FracterylEnemy[];
  eigensteinEnemies: EigensteinEnemy[];
  eliteEnemies: EliteEnemy[];
  damageEnemy: (enemy: LaserEnemy, dmg: number, armorMult: number) => number;
  damageSapphireEnemy: (enemy: SapphireEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageMissile: (missile: SapphireMissile, dmg: number) => number;
  damageEmeraldEnemy: (enemy: EmeraldEnemy, dmg: number, armorMult: number) => number;
  damageAmberEnemy: (enemy: AmberEnemy, dmg: number, armorMult: number) => number;
  damageAmberShard: (shard: AmberShard, dmg: number) => number;
  damageVoidEnemy: (enemy: VoidEnemy, dmg: number, armorMult: number) => number;
  damageQuartzEnemy: (enemy: QuartzEnemy, dmg: number, armorMult: number) => number;
  damageRubyEnemy: (enemy: RubyEnemy, dmg: number, armorMult: number) => number;
  damageSunstoneEnemy: (enemy: SunstoneEnemy, dmg: number, armorMult: number) => number;
  damageCitrineEnemy: (enemy: CitrineEnemy, dmg: number, armorMult: number) => number;
  damageIoliteEnemy: (enemy: IoliteEnemy, dmg: number, armorMult: number) => number;
  damageAmethystEnemy: (enemy: AmethystEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageDiamondEnemy: (enemy: DiamondEnemy, dmg: number, armorMult: number) => number;
  damageNullstoneEnemy: (enemy: NullstoneEnemy, dmg: number, armorMult: number) => number;
  damageFracterylEnemy: (enemy: FracterylEnemy, dmg: number, armorMult: number) => number;
  damageEigensteinEnemy: (enemy: EigensteinEnemy, dmg: number, armorMult: number) => number;
  damageEliteEnemy: (enemy: EliteEnemy, dmg: number, armorMult: number) => number;
  damageBossEnemy: (rawDamage: number, defPierceRatio: number) => number;
  alivenGroups: AlivenParticleGroup[];
  damageAlivenParticle: (particle: AlivenParticle, group: AlivenParticleGroup, rawDamage: number) => number;
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  lifeColonies: LifeColonyController[];
  damageLifeCell: (cell: import('./life-types').LifeCellEntity, rawDamage: number) => number;
  damageLifeCore: (colony: LifeColonyController, rawDamage: number) => number;
}

function isWithinBeam(
  originX: number,
  originY: number,
  dirX: number,
  dirY: number,
  tMax: number,
  x: number,
  y: number,
  radius: number,
): boolean {
  const ex = x - originX;
  const ey = y - originY;
  const tProj = ex * dirX + ey * dirY;
  if (tProj < 0 || tProj > tMax) return false;
  const perpDist = Math.abs(ex * dirY - ey * dirX);
  return perpDist <= radius;
}

export function applyLaserBeamHitSweep(ctx: LaserBeamHitSweepCtx): void {
  const {
    originX, originY, dirX, dirY, tMax, baseDamage, beamColor, beamGlow,
    hitEffects, bossEnemy,
    enemies, sapphireEnemies, sapphireMissiles, emeraldEnemies,
    amberEnemies, amberShards, voidEnemies, quartzEnemies, rubyEnemies,
    sunstoneEnemies, citrineEnemies, ioliteEnemies, amethystEnemies,
    diamondEnemies, nullstoneEnemies, fracterylEnemies, eigensteinEnemies,
    eliteEnemies, alivenGroups, lifeColonies,
    damageEnemy, damageSapphireEnemy, damageMissile, damageEmeraldEnemy,
    damageAmberEnemy, damageAmberShard, damageVoidEnemy, damageQuartzEnemy,
    damageRubyEnemy, damageSunstoneEnemy, damageCitrineEnemy, damageIoliteEnemy,
    damageAmethystEnemy, damageDiamondEnemy, damageNullstoneEnemy,
    damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
    damageAlivenParticle, damageLifeCell, damageLifeCore,
    spawnDamageNumber,
  } = ctx;

  for (const e of enemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, LASER_ENEMY_SIZE * 2)) continue;
    const dmg = damageEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of sapphireEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, SAPPHIRE_SHIELD_RADIUS + 2)) continue;
    const dmg = damageSapphireEnemy(e, baseDamage, 1.0, true);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const m of sapphireMissiles) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, m.x, m.y, MISSILE_SIZE * 2)) continue;
    damageMissile(m, baseDamage);
  }
  for (const e of emeraldEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, EMERALD_ENEMY_SIZE * 2)) continue;
    const dmg = damageEmeraldEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of amberEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, AMBER_ENEMY_SIZE * 2)) continue;
    const dmg = damageAmberEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const s of amberShards) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, s.x, s.y, AMBER_SHARD_SIZE * 2)) continue;
    damageAmberShard(s, baseDamage);
  }
  for (const e of voidEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, VOID_ENEMY_SIZE * 2)) continue;
    const dmg = damageVoidEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of quartzEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, QUARTZ_ENEMY_SIZE * 2)) continue;
    const dmg = damageQuartzEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of rubyEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, RUBY_ENEMY_SIZE * 2)) continue;
    const dmg = damageRubyEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of sunstoneEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, SUNSTONE_ENEMY_SIZE * 2)) continue;
    const dmg = damageSunstoneEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of citrineEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, CITRINE_ENEMY_SIZE * 2)) continue;
    const dmg = damageCitrineEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of ioliteEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, IOLITE_ENEMY_SIZE * 2)) continue;
    const dmg = damageIoliteEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of amethystEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, AMETHYST_ENEMY_SIZE * 2)) continue;
    const dmg = damageAmethystEnemy(e, baseDamage, 1.0, true);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of diamondEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, DIAMOND_ENEMY_SIZE * 2)) continue;
    const dmg = damageDiamondEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of nullstoneEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, NULLSTONE_ENEMY_SIZE * 2)) continue;
    const dmg = damageNullstoneEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of fracterylEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, FRACTERYL_ENEMY_SIZE * 2)) continue;
    const dmg = damageFracterylEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of eigensteinEnemies) {
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, EIGENSTEIN_ENEMY_SIZE * 2)) continue;
    const dmg = damageEigensteinEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }
  for (const e of eliteEnemies) {
    if (e.isInvuln) continue;
    if (!isWithinBeam(originX, originY, dirX, dirY, tMax, e.x, e.y, ELITE_NULLSTONE_RADIUS * 2)) continue;
    const dmg = damageEliteEnemy(e, baseDamage, 1.0);
    hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
    spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, beamColor);
  }

  for (const group of alivenGroups) {
    for (const p of group.particles) {
      if (!p.isAlive) continue;
      const r = Math.max(3, p.radiusPx);
      if (!isWithinBeam(originX, originY, dirX, dirY, tMax, p.x, p.y, r * 2)) continue;
      const dmg = damageAlivenParticle(p, group, baseDamage);
      if (dmg > 0) {
        hitEffects.push({ x: p.x, y: p.y, timerMs: HIT_EFFECT_DURATION_MS, color: p.glowColor });
        spawnDamageNumber(p.x, p.y, 0, -1, String(Math.round(dmg)), dmg / p.maxHp, p.glowColor);
      }
    }
  }

  // Life-zone cells/core: the beam pierces every enemy in its path already
  // (no per-target cooldown), so it's naturally strong against a colony's
  // clustered cells — a full sweep can wipe an entire exposed row per shot.
  for (const colony of lifeColonies) {
    for (const cell of colony.cells.values()) {
      if (cell.isDying) continue;
      const center = lifeGridToWorldCenter({ col: cell.col, row: cell.row }, colony.bounds);
      if (!isWithinBeam(originX, originY, dirX, dirY, tMax, center.x, center.y, 8)) continue;
      const dmg = damageLifeCell(cell, baseDamage);
      if (dmg > 0) {
        hitEffects.push({ x: center.x, y: center.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
        spawnDamageNumber(center.x, center.y, 0, -1, String(Math.round(dmg)), dmg / cell.maxHp, beamColor);
      }
    }
    if (colony.coreHp > 0 && isWithinBeam(originX, originY, dirX, dirY, tMax, colony.x, colony.y, 12)) {
      const dmg = damageLifeCore(colony, baseDamage);
      if (dmg > 0) {
        hitEffects.push({ x: colony.x, y: colony.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
        spawnDamageNumber(colony.x, colony.y, 0, -1, String(Math.round(dmg)), dmg / colony.coreMaxHp, beamColor);
      }
    }
  }

  if (!bossEnemy) return;
  const bossSize = BOSS_SIZE_BASE + bossEnemy.bossId * 1.5;
  if (!isWithinBeam(originX, originY, dirX, dirY, tMax, bossEnemy.x, bossEnemy.y, bossSize)) return;
  const dmg = damageBossEnemy(baseDamage, 1.0);
  if (dmg <= 0) return;
  hitEffects.push({ x: bossEnemy.x, y: bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: beamGlow });
  spawnDamageNumber(bossEnemy.x, bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / bossEnemy.maxHp, beamColor);
}
