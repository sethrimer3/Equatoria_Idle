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
  FLUID_VEL_FRAME_TO_PX_S, FLUID_LASER_BEAM_STRENGTH,
  FLUID_BEAM_R, FLUID_BEAM_G, FLUID_BEAM_B,
} from './rpg-constants';
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
import type { AlivenParticle, AlivenParticleGroup } from './rpg-aliven-types';
import { applyLaserBeamHitSweep } from './rpg-weapon-laser-beam-hits';
import { terrainFirstIntersectionT, type TopographicTerrainState } from './terrain/topographic-terrain';

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
  alivenGroups: AlivenParticleGroup[];
  damageAlivenParticle: (particle: AlivenParticle, group: AlivenParticleGroup, rawDamage: number) => number;
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => TopographicTerrainState | null;
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
    alivenGroups,
    damageEnemy, damageSapphireEnemy, damageMissile,
    damageEmeraldEnemy, damageAmberEnemy, damageAmberShard,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy,
    damageCitrineEnemy, damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy,
    damageNullstoneEnemy, damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
    damageAlivenParticle,
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

    // Compute the endpoint (extend to canvas edge, then truncate at terrain)
    let tMax = Infinity;
    if (dirX > 0)  tMax = Math.min(tMax, (dim.w  - mote.x) / dirX);
    if (dirX < 0)  tMax = Math.min(tMax, -mote.x / dirX);
    if (dirY > 0)  tMax = Math.min(tMax, (dim.h - mote.y) / dirY);
    if (dirY < 0)  tMax = Math.min(tMax, -mote.y / dirY);

    // Terrain truncation: shorten beam to first terrain intersection.
    const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;
    if (terrain) {
      const fraction = terrainFirstIntersectionT(terrain, mote.x, mote.y, dirX, dirY, tMax);
      tMax = tMax * fraction;
    }

    const endX = mote.x + dirX * tMax;
    const endY = mote.y + dirY * tMax;

    const weaponDef = WEAPON_BY_ID.get(weaponId);
    const tier = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const baseDamage = getScaledWeaponDamage(weaponDef?.stats.damage ?? 80, tier, playerStats.atk);

    applyLaserBeamHitSweep({
      originX: mote.x,
      originY: mote.y,
      dirX,
      dirY,
      tMax,
      baseDamage,
      beamColor: LASER_BEAM_COLOR,
      beamGlow: LASER_BEAM_GLOW,
      hitEffects,
      bossEnemy: ctx.bossEnemy,
      enemies,
      sapphireEnemies,
      sapphireMissiles,
      emeraldEnemies,
      amberEnemies,
      amberShards,
      voidEnemies,
      quartzEnemies,
      rubyEnemies,
      sunstoneEnemies,
      citrineEnemies,
      ioliteEnemies,
      amethystEnemies,
      diamondEnemies,
      nullstoneEnemies,
      fracterylEnemies,
      eigensteinEnemies,
      eliteEnemies,
      damageEnemy,
      damageSapphireEnemy,
      damageMissile,
      damageEmeraldEnemy,
      damageAmberEnemy,
      damageAmberShard,
      damageVoidEnemy,
      damageQuartzEnemy,
      damageRubyEnemy,
      damageSunstoneEnemy,
      damageCitrineEnemy,
      damageIoliteEnemy,
      damageAmethystEnemy,
      damageDiamondEnemy,
      damageNullstoneEnemy,
      damageFracterylEnemy,
      damageEigensteinEnemy,
      damageEliteEnemy,
      damageBossEnemy,
      alivenGroups,
      damageAlivenParticle,
      spawnDamageNumber,
    });

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
