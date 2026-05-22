/**
 * rpg-weapon-emerald-subs.ts — Emerald sub-missile and swirl particle system.
 *
 * Extracted from rpg-weapon-emerald.ts to keep that file focused on the
 * primary heat-seeking player missile. This module owns the full lifecycle
 * of the secondary projectiles that burst from a player missile on proximity
 * or fizzle:
 *
 *   • Sub-missiles: scatter in a cone (proximity burst) or equidistant ring
 *     (fizzle burst), seek enemies, then slow and AOE-explode.
 *   • Swirl particles: cosmetic ring emitted from each AOE explosion.
 *
 * The factory `createEmeraldSubSystem(ctx)` accepts the same
 * `EmeraldWeaponCtx` object used by the parent emerald system (structural
 * typing covers the superset), and returns an `EmeraldSubsHandle` exposing
 * the two state arrays and per-frame update functions.
 */

import {
  EMERALD_MISSILE_COLOR,
  EMERALD_MISSILE_SUB_BASE, EMERALD_MISSILE_SUB_PER_TIER,
  EMERALD_SUB_MISSILE_SPEED, EMERALD_SUB_MISSILE_MAX_SPEED, EMERALD_SUB_MISSILE_SEEK_STR,
  EMERALD_SUB_MISSILE_TRAIL_CAP, EMERALD_SUB_MISSILE_HIT_RADIUS,
  EMERALD_SUB_MISSILE_SQUIGGLE, EMERALD_SUB_MISSILE_SQUIGGLE_HZ,
  EMERALD_SUB_MISSILE_DETECT_PX,
  EMERALD_SUB_MISSILE_FUEL_MS, EMERALD_SUB_MISSILE_DECEL_START_MS,
  EMERALD_SUB_MISSILE_FIZZLE_DRAG, EMERALD_SUB_MISSILE_STOP_SPEED,
  EMERALD_SUB_MISSILE_POST_STOP_DELAY_MS,
  EMERALD_SUB_MISSILE_AOE_PX, EMERALD_SUB_MISSILE_DAMAGE_MULT,
  EMERALD_SUB_MISSILE_CONE_SPREAD,
  EMERALD_SWIRL_COUNT, EMERALD_SWIRL_LIFE_MS, EMERALD_SWIRL_SPEED, EMERALD_SWIRL_DRAG,
} from './rpg-weapon-constants';
import {
  TARGET_FRAME_MS,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PROJECTILE_STRENGTH, FLUID_EXPLOSION_STRENGTH,
  FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B,
} from './rpg-constants';
import type { FluidImpulse } from './rpg-fluid';
import type { LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy,
  DiamondEnemy, NullstoneEnemy, FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
  EmeraldSubMissile, EmeraldSwirlParticle,
} from './rpg-enemy-types';
import { segmentIntersectsTopographicTerrain, type TopographicTerrainState } from './terrain/topographic-terrain';

// ── Dependency-injection context ──────────────────────────────────────────

/**
 * Structural subset of EmeraldWeaponCtx containing all fields used by the
 * sub-missile and swirl systems (i.e. EmeraldWeaponCtx minus `mote`).
 * EmeraldWeaponCtx satisfies this interface via TypeScript structural typing.
 */
export interface EmeraldSubsCtx {
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
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string) => void;
  removeDeadEnemies: () => void;
  checkWaveCompletion: () => void;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => TopographicTerrainState | null;
}

// ── Handle returned to the caller ─────────────────────────────────────────

export interface EmeraldSubsHandle {
  readonly emeraldSubMissiles: EmeraldSubMissile[];
  readonly emeraldSwirlParticles: EmeraldSwirlParticle[];
  /** Spawn sub-missiles from (ox, oy); called by the parent missile system on burst/fizzle. */
  spawnEmeraldSubMissiles(ox: number, oy: number, scaledDamage: number, tier: number, coneAngle: number | null): void;
  updateEmeraldSubMissiles(deltaMs: number): void;
  updateEmeraldSwirlParticles(deltaMs: number): void;
  reset(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createEmeraldSubSystem(ctx: EmeraldSubsCtx): EmeraldSubsHandle {
  const {
    dim, fluid,
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

  const emeraldSubMissiles: EmeraldSubMissile[] = [];
  const emeraldSwirlParticles: EmeraldSwirlParticle[] = [];

  /** Spawn sub-missiles from (ox, oy), scattered in a cone or equidistantly. */
  function spawnEmeraldSubMissiles(
    ox: number, oy: number,
    scaledDamage: number,
    tier: number,
    coneAngle: number | null,   // null → equidistant 360° spread
  ): void {
    const count = EMERALD_MISSILE_SUB_BASE + (tier - 1) * EMERALD_MISSILE_SUB_PER_TIER;
    for (let k = 0; k < count; k++) {
      let angle: number;
      if (coneAngle === null) {
        // Equidistant full-circle spread.
        angle = (k / count) * Math.PI * 2;
      } else {
        // Random within the configured half-angle of the cone direction.
        angle = coneAngle + (Math.random() - 0.5) * 2 * EMERALD_SUB_MISSILE_CONE_SPREAD;
      }
      emeraldSubMissiles.push({
        x: ox, y: oy,
        vx: Math.cos(angle) * EMERALD_SUB_MISSILE_SPEED,
        vy: Math.sin(angle) * EMERALD_SUB_MISSILE_SPEED,
        scaledDamage: scaledDamage * EMERALD_SUB_MISSILE_DAMAGE_MULT,
        squigglePhase: Math.random() * Math.PI * 2,
        lifetimeMs: 0,
        stoppedMs: 0,
        trailX: new Float32Array(EMERALD_SUB_MISSILE_TRAIL_CAP),
        trailY: new Float32Array(EMERALD_SUB_MISSILE_TRAIL_CAP),
        trailHead: 0, trailCount: 0,
      });
    }
  }

  function spawnEmeraldSwirlExplosion(ox: number, oy: number): void {
    for (let k = 0; k < EMERALD_SWIRL_COUNT; k++) {
      // Equidistant angles with a random offset for visual variety.
      const baseAngle = (k / EMERALD_SWIRL_COUNT) * Math.PI * 2 + Math.random() * 0.3;
      // Tangential component creates the swirl; outward component spreads the ring.
      const outward    = EMERALD_SWIRL_SPEED * (0.6 + Math.random() * 0.4);
      const tangential = EMERALD_SWIRL_SPEED * (0.5 + Math.random() * 0.5);
      const outX = Math.cos(baseAngle), outY = Math.sin(baseAngle);
      const tanX = -outY, tanY =  outX;
      emeraldSwirlParticles.push({
        x: ox, y: oy,
        vx: outX * outward + tanX * tangential,
        vy: outY * outward + tanY * tangential,
        lifeMs: EMERALD_SWIRL_LIFE_MS,
      });
    }
  }

  function updateEmeraldSubMissiles(deltaMs: number): void {
    const dt          = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const hitR2       = EMERALD_SUB_MISSILE_HIT_RADIUS * EMERALD_SUB_MISSILE_HIT_RADIUS;
    const detectR2    = EMERALD_SUB_MISSILE_DETECT_PX * EMERALD_SUB_MISSILE_DETECT_PX;
    const decelDrag   = Math.pow(EMERALD_SUB_MISSILE_FIZZLE_DRAG, dt);
    const terrain     = ctx.getTerrainState ? ctx.getTerrainState() : null;

    for (let i = emeraldSubMissiles.length - 1; i >= 0; i--) {
      const s = emeraldSubMissiles[i];

      // Advance total lifetime.
      s.lifetimeMs += deltaMs;

      // Fuel phase: homing active while lifetime < DECEL_START_MS.
      // Hard cutoff: if lifetime exceeds FUEL_MS, force stopped to trigger explosion.
      const isDecelerating = s.lifetimeMs >= EMERALD_SUB_MISSILE_DECEL_START_MS;
      if (s.lifetimeMs >= EMERALD_SUB_MISSILE_FUEL_MS) {
        s.vx = 0; s.vy = 0;
      }

      if (!isDecelerating) {
        // Still has fuel — seek nearest enemy within detection range.
        let nearestX: number | null = null;
        let nearestY: number | null = null;
        let nearestDist2 = Infinity;
        const checkTarget = (ex: number, ey: number) => {
          const d = (ex - s.x) * (ex - s.x) + (ey - s.y) * (ey - s.y);
          if (d < nearestDist2) { nearestDist2 = d; nearestX = ex; nearestY = ey; }
        };
        for (const e of enemies)           checkTarget(e.x, e.y);
        for (const e of sapphireEnemies)   checkTarget(e.x, e.y);
        for (const e of emeraldEnemies)    checkTarget(e.x, e.y);
        for (const e of amberEnemies)      checkTarget(e.x, e.y);
        for (const e of voidEnemies)       checkTarget(e.x, e.y);
        for (const e of quartzEnemies)     checkTarget(e.x, e.y);
        for (const e of rubyEnemies)       checkTarget(e.x, e.y);
        for (const e of sunstoneEnemies)   checkTarget(e.x, e.y);
        for (const e of citrineEnemies)    checkTarget(e.x, e.y);
        for (const e of ioliteEnemies)     checkTarget(e.x, e.y);
        for (const e of amethystEnemies)   checkTarget(e.x, e.y);
        for (const e of diamondEnemies)    checkTarget(e.x, e.y);
        for (const e of nullstoneEnemies)  checkTarget(e.x, e.y);
        for (const e of fracterylEnemies)  checkTarget(e.x, e.y);
        for (const e of eigensteinEnemies) checkTarget(e.x, e.y);
        for (const e of eliteEnemies) { if (!e.isInvuln) checkTarget(e.x, e.y); }
        if (ctx.bossEnemy) checkTarget(ctx.bossEnemy.x, ctx.bossEnemy.y);

        if (nearestDist2 <= detectR2 && nearestX !== null && nearestY !== null) {
          const ex = nearestX - s.x, ey = nearestY - s.y;
          const eDist = Math.sqrt(ex * ex + ey * ey);
          if (eDist > 0.01) {
            s.vx += (ex / eDist) * EMERALD_SUB_MISSILE_SEEK_STR * dt;
            s.vy += (ey / eDist) * EMERALD_SUB_MISSILE_SEEK_STR * dt;
          }
        }

        // Speed clamp while powered.
        const spd = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        if (spd > EMERALD_SUB_MISSILE_MAX_SPEED) {
          const scale = EMERALD_SUB_MISSILE_MAX_SPEED / spd;
          s.vx *= scale; s.vy *= scale;
        }
      } else {
        // Fuel ran out — apply drag to gradually stop between seconds 2 and 4.
        s.vx *= decelDrag;
        s.vy *= decelDrag;
      }

      // Squiggle wobble while still powered.
      if (!isDecelerating) {
        s.squigglePhase += EMERALD_SUB_MISSILE_SQUIGGLE_HZ * dt;
        const spd0 = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
        if (spd0 > 0.01) {
          const perpX = -s.vy / spd0;
          const perpY =  s.vx / spd0;
          const wobble = Math.sin(s.squigglePhase) * EMERALD_SUB_MISSILE_SQUIGGLE * dt;
          s.vx += perpX * wobble;
          s.vy += perpY * wobble;
        }
      }

      const prevSx = s.x, prevSy = s.y;
      s.x += s.vx * dt; s.y += s.vy * dt;

      // Terrain blocking: destroy sub-missile if it crossed solid terrain.
      if (terrain && segmentIntersectsTopographicTerrain(terrain, prevSx, prevSy, s.x, s.y)) {
        emeraldSubMissiles.splice(i, 1); continue;
      }

      // Wall bounce.
      if (s.x < 0)            { s.x = 0;      s.vx =  Math.abs(s.vx); }
      else if (s.x > dim.w)   { s.x = dim.w;  s.vx = -Math.abs(s.vx); }
      if (s.y < 0)            { s.y = 0;      s.vy =  Math.abs(s.vy); }
      else if (s.y > dim.h)   { s.y = dim.h;  s.vy = -Math.abs(s.vy); }

      // Trail update.
      s.trailX[s.trailHead] = s.x; s.trailY[s.trailHead] = s.y;
      s.trailHead = (s.trailHead + 1) % EMERALD_SUB_MISSILE_TRAIL_CAP;
      if (s.trailCount < EMERALD_SUB_MISSILE_TRAIL_CAP) s.trailCount++;

      // Fluid injection.
      fluid.addForce({
        x: s.x, y: s.y,
        vx: s.vx * FLUID_VEL_FRAME_TO_PX_S * 0.3,
        vy: s.vy * FLUID_VEL_FRAME_TO_PX_S * 0.3,
        r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
        strength: FLUID_PROJECTILE_STRENGTH * 0.4,
      });

      // Post-stop delay: once decelerated and nearly stopped, count down then explode.
      if (isDecelerating && Math.sqrt(s.vx * s.vx + s.vy * s.vy) < EMERALD_SUB_MISSILE_STOP_SPEED) {
        s.stoppedMs += deltaMs;
        if (s.stoppedMs >= EMERALD_SUB_MISSILE_POST_STOP_DELAY_MS) {
          // AOE explosion with swirling green particles.
          // Terrain blocks AOE line-of-sight: enemies behind terrain are not damaged.
          const aoeR2 = EMERALD_SUB_MISSILE_AOE_PX * EMERALD_SUB_MISSILE_AOE_PX;
          fluid.addExplosion(s.x, s.y, FLUID_EXPLOSION_STRENGTH * 0.4,
            FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          spawnEmeraldSwirlExplosion(s.x, s.y);
          const applyAoe = <T extends { x: number; y: number; hp: number; maxHp: number }>(
            arr: T[], damageFn: (e: T, dmg: number, pierce: number) => number,
          ) => {
            for (const e of arr) {
              const ddx = e.x - s.x, ddy = e.y - s.y;
              if (ddx * ddx + ddy * ddy <= aoeR2) {
                // Skip enemies that terrain blocks line-of-sight to.
                if (terrain && segmentIntersectsTopographicTerrain(terrain, s.x, s.y, e.x, e.y)) continue;
                const dmg = damageFn(e, s.scaledDamage, 0);
                if (dmg > 0) spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, EMERALD_MISSILE_COLOR);
              }
            }
          };
          applyAoe(enemies,          damageEnemy);
          applyAoe(sapphireEnemies,  (e, d, p) => damageSapphireEnemy(e, d, p, false));
          applyAoe(emeraldEnemies,   damageEmeraldEnemy);
          applyAoe(amberEnemies,     damageAmberEnemy);
          applyAoe(voidEnemies,      damageVoidEnemy);
          applyAoe(quartzEnemies,    damageQuartzEnemy);
          applyAoe(rubyEnemies,      damageRubyEnemy);
          applyAoe(sunstoneEnemies,  damageSunstoneEnemy);
          applyAoe(citrineEnemies,   damageCitrineEnemy);
          applyAoe(ioliteEnemies,    damageIoliteEnemy);
          applyAoe(amethystEnemies,  (e, d, p) => damageAmethystEnemy(e, d, p, false));
          applyAoe(diamondEnemies,   damageDiamondEnemy);
          applyAoe(nullstoneEnemies, damageNullstoneEnemy);
          applyAoe(fracterylEnemies, (e, d, p) => damageFracterylEnemy(e, d, p));
          applyAoe(eigensteinEnemies,(e, d, p) => damageEigensteinEnemy(e, d, p));
          applyAoe(eliteEnemies.filter(e => !e.isInvuln), (e, d, p) => damageEliteEnemy(e, d, p));
          if (ctx.bossEnemy) {
            const bdx = ctx.bossEnemy.x - s.x, bdy = ctx.bossEnemy.y - s.y;
            if (bdx * bdx + bdy * bdy <= aoeR2) {
              // Terrain blocks boss AOE LOS.
              const bossBlocked = terrain && segmentIntersectsTopographicTerrain(terrain, s.x, s.y, ctx.bossEnemy.x, ctx.bossEnemy.y);
              if (!bossBlocked) {
                const dmg = damageBossEnemy(s.scaledDamage, 0);
                if (dmg > 0) spawnHitVisualsAt(ctx.bossEnemy.x, ctx.bossEnemy.y, ctx.bossEnemy.maxHp, dmg, EMERALD_MISSILE_COLOR);
              }
            }
          }
          emeraldSubMissiles.splice(i, 1);
          removeDeadEnemies(); checkWaveCompletion();
          continue;
        }
        // Still in post-stop delay — skip collision detection (missile is inert).
        continue;
      }

      // Collision detection — direct hit (only while in motion).
      let hit = false;
      const tryHitSub = <T extends { x: number; y: number; hp: number; maxHp: number }>(
        e: T,
        damageFn: (enemy: T, dmg: number, pierce: number) => number,
      ): boolean => {
        const dx = s.x - e.x, dy = s.y - e.y;
        if (dx * dx + dy * dy >= hitR2) return false;
        const dmg = damageFn(e, s.scaledDamage, 0);
        spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, EMERALD_MISSILE_COLOR);
        fluid.addExplosion(e.x, e.y, FLUID_EXPLOSION_STRENGTH * 0.2,
          FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
        return true;
      };
      for (const e of enemies)           { if (tryHitSub(e, damageEnemy))                                           { hit = true; break; } }
      if (!hit) for (const e of sapphireEnemies)  { if (tryHitSub(e, (en, d, p) => damageSapphireEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of emeraldEnemies)   { if (tryHitSub(e, damageEmeraldEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of amberEnemies)     { if (tryHitSub(e, damageAmberEnemy))                            { hit = true; break; } }
      if (!hit) for (const e of voidEnemies)      { if (tryHitSub(e, damageVoidEnemy))                             { hit = true; break; } }
      if (!hit) for (const e of quartzEnemies)    { if (tryHitSub(e, damageQuartzEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of rubyEnemies)      { if (tryHitSub(e, damageRubyEnemy))                             { hit = true; break; } }
      if (!hit) for (const e of sunstoneEnemies)  { if (tryHitSub(e, damageSunstoneEnemy))                         { hit = true; break; } }
      if (!hit) for (const e of citrineEnemies)   { if (tryHitSub(e, damageCitrineEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of ioliteEnemies)    { if (tryHitSub(e, damageIoliteEnemy))                           { hit = true; break; } }
      if (!hit) for (const e of amethystEnemies)  { if (tryHitSub(e, (en, d, p) => damageAmethystEnemy(en, d, p, false))) { hit = true; break; } }
      if (!hit) for (const e of diamondEnemies)   { if (tryHitSub(e, damageDiamondEnemy))                          { hit = true; break; } }
      if (!hit) for (const e of nullstoneEnemies) { if (tryHitSub(e, damageNullstoneEnemy))                        { hit = true; break; } }
      if (!hit) for (const e of fracterylEnemies) { if (tryHitSub(e, (en, d, p) => damageFracterylEnemy(en, d, p))) { hit = true; break; } }
      if (!hit) for (const e of eigensteinEnemies) { if (tryHitSub(e, (en, d, p) => damageEigensteinEnemy(en, d, p))) { hit = true; break; } }
      if (!hit) for (const e of eliteEnemies) { if (e.isInvuln) continue; if (tryHitSub(e, (en, d, p) => damageEliteEnemy(en, d, p))) { hit = true; break; } }
      if (!hit && ctx.bossEnemy) {
        const boss = ctx.bossEnemy;
        const dx = s.x - boss.x, dy = s.y - boss.y;
        if (dx * dx + dy * dy < hitR2) {
          const dmg = damageBossEnemy(s.scaledDamage, 0);
          if (dmg > 0) {
            spawnHitVisualsAt(boss.x, boss.y, boss.maxHp, dmg, EMERALD_MISSILE_COLOR);
            fluid.addExplosion(boss.x, boss.y, FLUID_EXPLOSION_STRENGTH * 0.2,
              FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B);
          }
          hit = true;
        }
      }
      if (hit) {
        emeraldSubMissiles.splice(i, 1);
        removeDeadEnemies(); checkWaveCompletion();
      }
    }
  }

  function updateEmeraldSwirlParticles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const drag = Math.pow(EMERALD_SWIRL_DRAG, dt);
    for (let i = emeraldSwirlParticles.length - 1; i >= 0; i--) {
      const p = emeraldSwirlParticles[i];
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { emeraldSwirlParticles.splice(i, 1); continue; }
      p.vx *= drag; p.vy *= drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
    }
  }

  return {
    get emeraldSubMissiles() { return emeraldSubMissiles; },
    get emeraldSwirlParticles() { return emeraldSwirlParticles; },
    spawnEmeraldSubMissiles,
    updateEmeraldSubMissiles,
    updateEmeraldSwirlParticles,
    reset(): void {
      emeraldSubMissiles.length = 0;
      emeraldSwirlParticles.length = 0;
    },
  };
}
