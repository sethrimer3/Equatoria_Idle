/**
 * rpg-weapon-laser-beam.ts — Ruby laser beam weapon system for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts. Owns the full lifecycle of the ruby
 * laser beam:
 *
 *   • `fireLaserBeam` — instantaneous ray cast from the player mote to the
 *     canvas edge, damaging every enemy that lies within the beam width and
 *     injecting a strong directional fluid impulse along its length.
 *   • `updateLaserBeamEffect` — ages and deactivates the lingering visual
 *     beam effect.
 *
 * The factory `createLaserBeamWeaponSystem(ctx)` receives a
 * `LaserBeamWeaponCtx` dependency-injection object and returns a
 * `LaserBeamWeaponHandle` exposing the current beam state (consumed by
 * rpg-weapon-draw.ts via a live getter) and the two update/spawn functions.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getScaledWeaponDamage } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import {
  LASER_BEAM_VISIBLE_MS, LASER_BEAM_COLOR, LASER_BEAM_GLOW,
} from './rpg-weapon-constants';
import {
  HIT_EFFECT_DURATION_MS,
  BOSS_SIZE_BASE,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_LASER_BEAM_STRENGTH,
  FLUID_BEAM_R, FLUID_BEAM_G, FLUID_BEAM_B,
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
import type { FluidImpulse } from './rpg-fluid';
import type { RpgPlayerStats, LaserBeamEffect, HitEffect, LaserEnemy, SapphireEnemy, SapphireMissile } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy,
  RubyEnemy, SunstoneEnemy, CitrineEnemy,
  IoliteEnemy, AmethystEnemy,
  DiamondEnemy, NullstoneEnemy,
  FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
} from './rpg-enemy-types';

// ── Dependency-injection context ──────────────────────────────────────────

/** Structural subset of RpgWeaponCtx containing only what the laser beam needs. */
export interface LaserBeamWeaponCtx {
  mote: { x: number; y: number };
  dim: { w: number; h: number };
  fluid: { addForce(impulse: FluidImpulse): void };
  readonly bossEnemy: BossEnemy | null;
  hitEffects: HitEffect[];
  playerStats: RpgPlayerStats;
  rpgSimState: RpgSimState;
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
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
}

// ── Handle returned to the caller ─────────────────────────────────────────

export interface LaserBeamWeaponHandle {
  readonly laserBeamEffect: LaserBeamEffect | null;
  fireLaserBeam: (targetX: number, targetY: number, weaponId: string) => void;
  updateLaserBeamEffect: (deltaMs: number) => void;
  reset: () => void;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createLaserBeamWeaponSystem(ctx: LaserBeamWeaponCtx): LaserBeamWeaponHandle {
  const {
    mote, dim, fluid, hitEffects,
    playerStats, rpgSimState,
    enemies, sapphireEnemies, sapphireMissiles,
    emeraldEnemies, amberEnemies, amberShards,
    voidEnemies, quartzEnemies, rubyEnemies, sunstoneEnemies,
    citrineEnemies, ioliteEnemies, amethystEnemies, diamondEnemies,
    nullstoneEnemies, fracterylEnemies, eigensteinEnemies, eliteEnemies,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy,
    damageCitrineEnemy, damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy,
    damageNullstoneEnemy, damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
    spawnDamageNumber,
  } = ctx;

  // ── Ruby laser beam system ────────────────────────────────────────

  let laserBeamEffect: LaserBeamEffect | null = null;

  function fireLaserBeam(targetX: number, targetY: number, weaponId: string): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    const dirX = dx / dist, dirY = dy / dist;
    laserBeamEffect = { active: true, startX: mote.x, startY: mote.y, dirX, dirY, timerMs: LASER_BEAM_VISIBLE_MS, endX: 0, endY: 0 };

    // Compute the endpoint (extend to canvas edge)
    let tMax = Infinity;
    if (dirX > 0)  tMax = Math.min(tMax, (dim.w  - mote.x) / dirX);
    if (dirX < 0)  tMax = Math.min(tMax, -mote.x / dirX);
    if (dirY > 0)  tMax = Math.min(tMax, (dim.h - mote.y) / dirY);
    if (dirY < 0)  tMax = Math.min(tMax, -mote.y / dirY);
    const endX = mote.x + dirX * tMax;
    const endY = mote.y + dirY * tMax;

    const weaponDef = WEAPON_BY_ID.get(weaponId);
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const baseDamage = getScaledWeaponDamage(weaponDef?.stats.damage ?? 80, tier, playerStats.atk);

    // Hit every laser enemy on the beam path
    for (const e of enemies) {
      // Point-to-line distance
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= LASER_ENEMY_SIZE * 2) {
        const dmg = damageEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit every sapphire enemy on the beam path (bypasses shield)
    for (const e of sapphireEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= SAPPHIRE_SHIELD_RADIUS + 2) {
        const dmg = damageSapphireEnemy(e, baseDamage, 1.0, true);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit missiles on the beam path
    for (const m of sapphireMissiles) {
      const ex = m.x - mote.x, ey = m.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= MISSILE_SIZE * 2) {
        damageMissile(m, baseDamage);
      }
    }

    // Hit emerald enemies on the beam path
    for (const e of emeraldEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= EMERALD_ENEMY_SIZE * 2) {
        const dmg = damageEmeraldEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amber enemies on the beam path
    for (const e of amberEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMBER_ENEMY_SIZE * 2) {
        const dmg = damageAmberEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amber shards on the beam path
    for (const s of amberShards) {
      const ex = s.x - mote.x, ey = s.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMBER_SHARD_SIZE * 2) {
        damageAmberShard(s, baseDamage);
      }
    }

    // Hit void enemies on the beam path
    for (const e of voidEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= VOID_ENEMY_SIZE * 2) {
        const dmg = damageVoidEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit quartz enemies on the beam path
    for (const e of quartzEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= QUARTZ_ENEMY_SIZE * 2) {
        const dmg = damageQuartzEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit ruby enemies on the beam path
    for (const e of rubyEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= RUBY_ENEMY_SIZE * 2) {
        const dmg = damageRubyEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit sunstone enemies on the beam path
    for (const e of sunstoneEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= SUNSTONE_ENEMY_SIZE * 2) {
        const dmg = damageSunstoneEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit citrine enemies on the beam path
    for (const e of citrineEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= CITRINE_ENEMY_SIZE * 2) {
        const dmg = damageCitrineEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit iolite enemies on the beam path
    for (const e of ioliteEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= IOLITE_ENEMY_SIZE * 2) {
        const dmg = damageIoliteEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit amethyst enemies on the beam path (bypasses shield)
    for (const e of amethystEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= AMETHYST_ENEMY_SIZE * 2) {
        const dmg = damageAmethystEnemy(e, baseDamage, 1.0, true);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit diamond enemies on the beam path
    for (const e of diamondEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= DIAMOND_ENEMY_SIZE * 2) {
        const dmg = damageDiamondEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit nullstone enemies on the beam path
    for (const e of nullstoneEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= NULLSTONE_ENEMY_SIZE * 2) {
        const dmg = damageNullstoneEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit fracteryl enemies on the beam path
    for (const e of fracterylEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= FRACTERYL_ENEMY_SIZE * 2) {
        const dmg = damageFracterylEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit eigenstein enemies on the beam path
    for (const e of eigensteinEnemies) {
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= EIGENSTEIN_ENEMY_SIZE * 2) {
        const dmg = damageEigensteinEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit elite enemies on the beam path
    for (const e of eliteEnemies) {
      if (e.isInvuln) continue;
      const ex = e.x - mote.x, ey = e.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj < 0 || tProj > tMax) continue;
      const perpDist = Math.abs(ex * dirY - ey * dirX);
      if (perpDist <= ELITE_NULLSTONE_RADIUS * 2) {
        const dmg = damageEliteEnemy(e, baseDamage, 1.0);
        hitEffects.push({ x: e.x, y: e.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
        spawnDamageNumber(e.x, e.y, 0, -1, String(Math.round(dmg)), dmg / e.maxHp, LASER_BEAM_COLOR);
      }
    }

    // Hit boss on the beam path
    if (ctx.bossEnemy) {
      const bossSize = BOSS_SIZE_BASE + ctx.bossEnemy.bossId * 1.5;
      const ex = ctx.bossEnemy.x - mote.x, ey = ctx.bossEnemy.y - mote.y;
      const tProj = ex * dirX + ey * dirY;
      if (tProj >= 0 && tProj <= tMax) {
        const perpDist = Math.abs(ex * dirY - ey * dirX);
        if (perpDist <= bossSize) {
          const dmg = damageBossEnemy(baseDamage, 1.0);
          if (dmg > 0) {
            hitEffects.push({ x: ctx.bossEnemy.x, y: ctx.bossEnemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: LASER_BEAM_GLOW });
            spawnDamageNumber(ctx.bossEnemy.x, ctx.bossEnemy.y, 0, -1, String(Math.round(dmg)), dmg / ctx.bossEnemy.maxHp, LASER_BEAM_COLOR);
          }
        }
      }
    }

    // Store end coords for drawing
    laserBeamEffect.startX = mote.x; laserBeamEffect.startY = mote.y;
    laserBeamEffect.endX = endX;
    laserBeamEffect.endY = endY;

    // Inject beam force along its length: sample multiple points from muzzle
    // to edge, creating a strong directional fluid channel in the beam color.
    const beamLen = tMax;
    const beamSteps = Math.max(4, Math.floor(beamLen / 20));
    for (let k = 0; k <= beamSteps; k++) {
      const t = k / beamSteps;
      fluid.addForce({
        x: mote.x + dirX * beamLen * t,
        y: mote.y + dirY * beamLen * t,
        vx: dirX * FLUID_VEL_FRAME_TO_PX_S * 3.0,
        vy: dirY * FLUID_VEL_FRAME_TO_PX_S * 3.0,
        r: FLUID_BEAM_R, g: FLUID_BEAM_G, b: FLUID_BEAM_B,
        strength: FLUID_LASER_BEAM_STRENGTH,
      });
    }
  }

  function updateLaserBeamEffect(deltaMs: number): void {
    if (!laserBeamEffect || !laserBeamEffect.active) return;
    laserBeamEffect.timerMs -= deltaMs;
    if (laserBeamEffect.timerMs <= 0) laserBeamEffect.active = false;
  }

  return {
    get laserBeamEffect() { return laserBeamEffect; },
    fireLaserBeam,
    updateLaserBeamEffect,
    reset(): void {
      laserBeamEffect = null;
    },
  };
}
