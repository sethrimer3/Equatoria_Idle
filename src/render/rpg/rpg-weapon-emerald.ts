/**
 * rpg-weapon-emerald.ts — Emerald heat-seeking player missile system for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts. Owns the lifecycle of primary emerald
 * player missiles: spawned toward a target, they seek enemies, then burst into
 * sub-missiles on proximity or equidistant on fizzle.
 *
 * Sub-missiles and swirl particles are owned by the companion module
 * `rpg-weapon-emerald-subs.ts` via `createEmeraldSubSystem(ctx)`.
 *
 * The factory `createEmeraldWeaponSystem(ctx)` receives an `EmeraldWeaponCtx`
 * dependency-injection object and returns an `EmeraldWeaponHandle` exposing the
 * three state arrays (consumed by rpg-weapon-draw.ts) and per-frame update /
 * spawn functions.
 */

import {
  EMERALD_MISSILE_SPEED, EMERALD_MISSILE_MAX_SPEED, EMERALD_MISSILE_SEEK_STR,
  EMERALD_MISSILE_TRAIL_CAP, EMERALD_MISSILE_COLOR, EMERALD_MISSILE_HIT_RADIUS,
  EMERALD_MISSILE_PROXIMITY_PX, EMERALD_MISSILE_DETECT_PX, EMERALD_MISSILE_NO_TARGET_MS,
  EMERALD_MISSILE_OPACITY_FADE_START_PX, EMERALD_MISSILE_MIN_ALPHA,
  EMERALD_MISSILE_FIZZLE_DRAG, EMERALD_MISSILE_STOP_SPEED,
} from './rpg-weapon-constants';
import { createEmeraldSubSystem } from './rpg-weapon-emerald-subs';
import {
  TARGET_FRAME_MS,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PROJECTILE_STRENGTH, FLUID_EXPLOSION_STRENGTH,
  FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B,
} from './rpg-constants';
import type { FluidImpulse } from './rpg-fluid';
import type { ClosestTarget, LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy,
  DiamondEnemy, NullstoneEnemy, FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
  EmeraldPlayerMissile, EmeraldSubMissile, EmeraldSwirlParticle,
} from './rpg-enemy-types';
export type { EmeraldSubsCtx, EmeraldSubsHandle } from './rpg-weapon-emerald-subs';
import { segmentIntersectsTopographicTerrain, type TopographicTerrainState } from './terrain/topographic-terrain';

// ── Dependency-injection context ──────────────────────────────────────────

/** Structural subset of RpgWeaponCtx containing only what the emerald system needs. */
export interface EmeraldWeaponCtx {
  mote: { x: number; y: number };
  dim: { w: number; h: number };
  fluid: {
    addForce(impulse: FluidImpulse): void;
    addExplosion(x: number, y: number, strength: number, r: number, g: number, b: number): void;
  };
  readonly bossEnemy: BossEnemy | null;
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
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
  damageEmeraldEnemy: (enemy: EmeraldEnemy, dmg: number, armorMult: number) => number;
  damageAmberEnemy: (enemy: AmberEnemy, dmg: number, armorMult: number) => number;
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
  collectEnemyBodyTargets: () => ClosestTarget[];
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string) => void;
  removeDeadEnemies: () => void;
  checkWaveCompletion: () => void;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => TopographicTerrainState | null;
}

// ── Handle returned to the caller ─────────────────────────────────────────

export interface EmeraldWeaponHandle {
  readonly emeraldPlayerMissiles: EmeraldPlayerMissile[];
  readonly emeraldSubMissiles: EmeraldSubMissile[];
  readonly emeraldSwirlParticles: EmeraldSwirlParticle[];
  spawnEmeraldMissile: (targetX: number, targetY: number, scaledDamage: number, tier: number) => void;
  updateEmeraldPlayerMissiles: (deltaMs: number) => void;
  updateEmeraldSubMissiles: (deltaMs: number) => void;
  updateEmeraldSwirlParticles: (deltaMs: number) => void;
  reset: () => void;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createEmeraldWeaponSystem(ctx: EmeraldWeaponCtx): EmeraldWeaponHandle {
  const {
    mote, dim, fluid,
    enemies, sapphireEnemies, emeraldEnemies, amberEnemies,
    voidEnemies, quartzEnemies, rubyEnemies, sunstoneEnemies,
    citrineEnemies, ioliteEnemies, amethystEnemies, diamondEnemies,
    nullstoneEnemies, fracterylEnemies, eigensteinEnemies, eliteEnemies,
    damageEnemy, damageSapphireEnemy, damageEmeraldEnemy, damageAmberEnemy,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy,
    damageCitrineEnemy, damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy,
    damageNullstoneEnemy, damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
    spawnHitVisualsAt,
    removeDeadEnemies, checkWaveCompletion,
  } = ctx;

  // Sub-missile and swirl system (owned by the companion module).
  const subSystem = createEmeraldSubSystem(ctx);

  // ── Emerald heat-seeking missile system ─────────────────────────

  const emeraldPlayerMissiles: EmeraldPlayerMissile[] = [];

  function spawnEmeraldMissile(targetX: number, targetY: number, scaledDamage: number, tier: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    emeraldPlayerMissiles.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * EMERALD_MISSILE_SPEED,
      vy: (dy / dist) * EMERALD_MISSILE_SPEED,
      scaledDamage,
      tier,
      noTargetMs: 0,
      isFizzling: false,
      proximityAlpha: EMERALD_MISSILE_MIN_ALPHA,
      trailX: new Float64Array(EMERALD_MISSILE_TRAIL_CAP),
      trailY: new Float64Array(EMERALD_MISSILE_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
    });
  }


  function updateEmeraldPlayerMissiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const hitR        = EMERALD_MISSILE_HIT_RADIUS;
    const proxR2      = EMERALD_MISSILE_PROXIMITY_PX * EMERALD_MISSILE_PROXIMITY_PX;
    const detectR2    = EMERALD_MISSILE_DETECT_PX * EMERALD_MISSILE_DETECT_PX;
    const fizzleDrag  = Math.pow(EMERALD_MISSILE_FIZZLE_DRAG, dt);
    const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;

    for (let i = emeraldPlayerMissiles.length - 1; i >= 0; i--) {
      const m = emeraldPlayerMissiles[i];

      // Find nearest enemy that has line-of-sight from the missile.
      let nearestEnemyX: number | null = null;
      let nearestEnemyY: number | null = null;
      let nearestDistSq = Infinity;
      const checkTarget = (ex: number, ey: number) => {
        const d = (ex - m.x) * (ex - m.x) + (ey - m.y) * (ey - m.y);
        if (d >= nearestDistSq) return;
        // Skip targets with terrain between the missile and the target.
        if (terrain && segmentIntersectsTopographicTerrain(terrain, m.x, m.y, ex, ey)) return;
        nearestDistSq = d; nearestEnemyX = ex; nearestEnemyY = ey;
      };
      for (const e of enemies)          checkTarget(e.x, e.y);
      for (const e of sapphireEnemies)  checkTarget(e.x, e.y);
      for (const e of emeraldEnemies)   checkTarget(e.x, e.y);
      for (const e of amberEnemies)     checkTarget(e.x, e.y);
      for (const e of voidEnemies)      checkTarget(e.x, e.y);
      for (const e of quartzEnemies)    checkTarget(e.x, e.y);
      for (const e of rubyEnemies)      checkTarget(e.x, e.y);
      for (const e of sunstoneEnemies)  checkTarget(e.x, e.y);
      for (const e of citrineEnemies)   checkTarget(e.x, e.y);
      for (const e of ioliteEnemies)    checkTarget(e.x, e.y);
      for (const e of amethystEnemies)  checkTarget(e.x, e.y);
      for (const e of diamondEnemies)   checkTarget(e.x, e.y);
      for (const e of nullstoneEnemies) checkTarget(e.x, e.y);
      for (const e of fracterylEnemies) checkTarget(e.x, e.y);
      for (const e of eigensteinEnemies) checkTarget(e.x, e.y);
      for (const e of eliteEnemies) { if (!e.isInvuln) checkTarget(e.x, e.y); }
      if (ctx.bossEnemy) checkTarget(ctx.bossEnemy.x, ctx.bossEnemy.y);
      const bodyTargets = ctx.collectEnemyBodyTargets();
      for (const target of bodyTargets) {
        if (target.kind.startsWith('proc_') || target.kind === 'verdure_plant') checkTarget(target.x, target.y);
      }

      m.proximityAlpha = getProximityAlpha(
        nearestDistSq,
        EMERALD_MISSILE_HIT_RADIUS,
        EMERALD_MISSILE_OPACITY_FADE_START_PX,
        EMERALD_MISSILE_MIN_ALPHA,
      );

      // If an enemy is close enough to detect, reset fizzle timer and home toward it.
      if (nearestDistSq <= detectR2 && nearestEnemyX !== null && nearestEnemyY !== null) {
        m.noTargetMs = 0;
        m.isFizzling = false;

        const ex = nearestEnemyX - m.x, ey = nearestEnemyY - m.y;
        const eDist = Math.sqrt(ex * ex + ey * ey);
        if (eDist > 0.01) {
          m.vx += (ex / eDist) * EMERALD_MISSILE_SEEK_STR * dt;
          m.vy += (ey / eDist) * EMERALD_MISSILE_SEEK_STR * dt;
        }

        // Proximity explosion — burst into sub-missiles in a cone toward enemy.
        if (nearestDistSq <= proxR2) {
          const coneAngle = Math.atan2(nearestEnemyY - m.y, nearestEnemyX - m.x);
          subSystem.spawnEmeraldSubMissiles(m.x, m.y, m.scaledDamage, m.tier, coneAngle);
          fluid.addExplosion(m.x, m.y, FLUID_EXPLOSION_STRENGTH * 0.5,
            FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          emeraldPlayerMissiles.splice(i, 1);
          continue;
        }
      } else {
        // No enemy in detection range — accumulate no-target time.
        m.noTargetMs += deltaMs;
        if (m.noTargetMs >= EMERALD_MISSILE_NO_TARGET_MS) {
          m.isFizzling = true;
        }
      }

      // Fizzle drag decelerates the missile.
      if (m.isFizzling) {
        m.vx *= fizzleDrag;
        m.vy *= fizzleDrag;
      } else {
        // Normal speed clamp.
        const spd = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
        if (spd > EMERALD_MISSILE_MAX_SPEED) {
          const s = EMERALD_MISSILE_MAX_SPEED / spd;
          m.vx *= s; m.vy *= s;
        }
      }

      const prevX = m.x, prevY = m.y;
      m.x += m.vx * dt; m.y += m.vy * dt;

      // Terrain blocking: fizzle immediately if the movement segment crossed terrain.
      if (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, m.x, m.y)) {
        subSystem.spawnEmeraldSubMissiles(prevX, prevY, m.scaledDamage, m.tier, null);
        fluid.addExplosion(prevX, prevY, FLUID_EXPLOSION_STRENGTH * 0.5,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        emeraldPlayerMissiles.splice(i, 1);
        continue;
      }

      // Wall bounce — reflect off all four edges.
      if (m.x < 0)         { m.x = 0;         m.vx =  Math.abs(m.vx); }
      else if (m.x > dim.w)  { m.x = dim.w;  m.vx = -Math.abs(m.vx); }
      if (m.y < 0)         { m.y = 0;         m.vy =  Math.abs(m.vy); }
      else if (m.y > dim.h) { m.y = dim.h; m.vy = -Math.abs(m.vy); }

      // Trail update.
      m.trailX[m.trailHead] = m.x; m.trailY[m.trailHead] = m.y;
      m.trailHead = (m.trailHead + 1) % EMERALD_MISSILE_TRAIL_CAP;
      if (m.trailCount < EMERALD_MISSILE_TRAIL_CAP) m.trailCount++;

      // Fluid injection — emerald comet sweep.
      fluid.addForce({
        x: m.x, y: m.y,
        vx: m.vx * FLUID_VEL_FRAME_TO_PX_S * 0.5,
        vy: m.vy * FLUID_VEL_FRAME_TO_PX_S * 0.5,
        r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
        strength: FLUID_PROJECTILE_STRENGTH * 0.8,
      });

      // Fully stopped while fizzling — explode into equidistant sub-missiles.
      if (m.isFizzling && Math.sqrt(m.vx * m.vx + m.vy * m.vy) < EMERALD_MISSILE_STOP_SPEED) {
        subSystem.spawnEmeraldSubMissiles(m.x, m.y, m.scaledDamage, m.tier, null);
        fluid.addExplosion(m.x, m.y, FLUID_EXPLOSION_STRENGTH * 0.5,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        emeraldPlayerMissiles.splice(i, 1);
        continue;
      }

      // Collision detection — hit first matching enemy.
      let hit = false;
      const tryHit = <T extends { x: number; y: number; hp: number; maxHp: number }>(
        e: T,
        damageFn: (enemy: T, dmg: number, pierce: number) => number,
      ): boolean => {
        const dx = m.x - e.x, dy = m.y - e.y;
        if (dx * dx + dy * dy >= hitR * hitR) return false;
        const dmg = damageFn(e, m.scaledDamage, 0);
        spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, EMERALD_MISSILE_COLOR);
        fluid.addExplosion(e.x, e.y, FLUID_EXPLOSION_STRENGTH * 0.35,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        return true;
      };

      for (const e of enemies)          { if (tryHit(e, damageEnemy))                                          { hit = true; break; } }
      if (!hit) for (const e of sapphireEnemies)  { if (tryHit(e, (en, d, p) => damageSapphireEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of emeraldEnemies)   { if (tryHit(e, damageEmeraldEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of amberEnemies)     { if (tryHit(e, damageAmberEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of voidEnemies)      { if (tryHit(e, damageVoidEnemy))                            { hit = true; break; } }
      if (!hit) for (const e of quartzEnemies)    { if (tryHit(e, damageQuartzEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of rubyEnemies)      { if (tryHit(e, damageRubyEnemy))                            { hit = true; break; } }
      if (!hit) for (const e of sunstoneEnemies)  { if (tryHit(e, damageSunstoneEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of citrineEnemies)   { if (tryHit(e, damageCitrineEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of ioliteEnemies)    { if (tryHit(e, damageIoliteEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of amethystEnemies)  { if (tryHit(e, (en, d, p) => damageAmethystEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of diamondEnemies)   { if (tryHit(e, damageDiamondEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of nullstoneEnemies) { if (tryHit(e, damageNullstoneEnemy))                       { hit = true; break; } }
      if (!hit) for (const e of fracterylEnemies) { if (tryHit(e, (en, d, p) => damageFracterylEnemy(en, d, p))) { hit = true; break; } }
      if (!hit) for (const e of eigensteinEnemies) { if (tryHit(e, (en, d, p) => damageEigensteinEnemy(en, d, p))) { hit = true; break; } }
      if (!hit) for (const e of eliteEnemies) { if (e.isInvuln) continue; if (tryHit(e, (en, d, p) => damageEliteEnemy(en, d, p))) { hit = true; break; } }
      if (!hit) {
        for (const target of bodyTargets) {
          if (!target.kind.startsWith('proc_') && target.kind !== 'verdure_plant') continue;
          const body = getEmeraldTargetBody(target);
          if (!body) continue;
          const dx = m.x - target.x, dy = m.y - target.y;
          if (dx * dx + dy * dy >= hitR * hitR) continue;
          const dmg = ctx.damageBodyTarget(target, m.scaledDamage, 0, false);
          spawnHitVisualsAt(target.x, target.y, body.maxHp, dmg, EMERALD_MISSILE_COLOR);
          fluid.addExplosion(target.x, target.y, FLUID_EXPLOSION_STRENGTH * 0.35,
            FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          hit = true;
          break;
        }
      }
      if (!hit && ctx.bossEnemy) {
        const boss = ctx.bossEnemy;
        const dx = m.x - boss.x, dy = m.y - boss.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageBossEnemy(m.scaledDamage, 0);
          if (dmg > 0) {
            spawnHitVisualsAt(boss.x, boss.y, boss.maxHp, dmg, EMERALD_MISSILE_COLOR);
            fluid.addExplosion(boss.x, boss.y, FLUID_EXPLOSION_STRENGTH * 0.35,
              FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          }
          hit = true;
        }
      }

      if (hit) {
        emeraldPlayerMissiles.splice(i, 1);
        removeDeadEnemies(); checkWaveCompletion();
      }
    }
  }

  function getProximityAlpha(distSq: number, fullAlphaRadiusPx: number, fadeStartPx: number, minAlpha: number): number {
    if (!Number.isFinite(distSq)) return minAlpha;
    const dist = Math.sqrt(distSq);
    if (dist <= fullAlphaRadiusPx) return 1;
    if (dist >= fadeStartPx) return minAlpha;
    const t = 1 - (dist - fullAlphaRadiusPx) / (fadeStartPx - fullAlphaRadiusPx);
    return minAlpha + (1 - minAlpha) * t;
  }

  return {
    get emeraldPlayerMissiles() { return emeraldPlayerMissiles; },
    get emeraldSubMissiles() { return subSystem.emeraldSubMissiles; },
    get emeraldSwirlParticles() { return subSystem.emeraldSwirlParticles; },
    spawnEmeraldMissile,
    updateEmeraldPlayerMissiles,
    updateEmeraldSubMissiles: (deltaMs: number) => subSystem.updateEmeraldSubMissiles(deltaMs),
    updateEmeraldSwirlParticles: (deltaMs: number) => subSystem.updateEmeraldSwirlParticles(deltaMs),
    reset(): void {
      emeraldPlayerMissiles.length = 0;
      subSystem.reset();
    },
  };
}

function getEmeraldTargetBody(target: ClosestTarget): { maxHp: number } | null {
  const body =
    target.dustWisp ?? target.ribbonWorm ?? target.lanternMoth ?? target.eyeStalk ??
    target.jellyfish ?? target.clothGhost ?? target.plantTurret ?? target.gearInsect ??
    target.spiderCrawler ?? target.moteSwarm ?? target.shadowHand ?? target.sandFish ??
    target.quartzFish ?? target.rubyFish ?? target.sunstoneFish ?? target.emeraldFish ??
    target.sapphireFish ?? target.amethystFish ?? target.diamondFish ?? target.plantProj ??
    target.verdurePlant;
  return typeof body === 'object' && body !== null && 'maxHp' in body && typeof body.maxHp === 'number'
    ? { maxHp: body.maxHp }
    : null;
}
