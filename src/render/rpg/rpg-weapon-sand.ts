/**
 * rpg-weapon-sand.ts — Sand gatling projectile weapon system for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts to keep that module focused on
 * orchestration. This module owns the full lifecycle of sand gatling
 * projectiles:
 *
 *   • Spawning sand projectiles fired toward a target.
 *   • Per-frame update: movement, fluid injection, bounds check, and
 *     collision detection against all enemy types.
 *
 * Collision hit-testing (the per-projectile enemy scan) is in
 * rpg-weapon-sand-collision.ts via checkSandProjectileHit().
 *
 * The factory `createSandWeaponSystem(ctx)` receives a `SandWeaponCtx`
 * dependency-injection object and returns a `SandWeaponHandle` exposing
 * the projectile array (consumed by rpg-weapon-draw.ts for rendering) and
 * per-frame update / spawn functions (called by the main update loop in
 * rpg-weapon-systems.ts via its RpgWeaponHandle delegation).
 */

import {
  SAND_PROJ_SPEED, SAND_PROJ_LIFE_MS,
} from './rpg-weapon-constants';
import {
  TARGET_FRAME_MS,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PROJECTILE_STRENGTH,
  FLUID_SAND_R, FLUID_SAND_G, FLUID_SAND_B,
} from './rpg-constants';
import type { FluidImpulse } from './rpg-fluid';
import type { SandProjectile, LaserEnemy, SapphireEnemy, SapphireMissile } from './rpg-types';
import type { ClosestTarget } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy, QuartzSpike,
  RubyEnemy, RubyBolt, SunstoneEnemy, CitrineEnemy, CitrineBolt,
  IoliteEnemy, AmethystEnemy, AmethystShard,
  DiamondEnemy, DiamondShard, NullstoneEnemy, VoidTendril,
  FracterylEnemy, FracterylShard, EigensteinEnemy,
  EliteEnemy,
  BossEnemy,
} from './rpg-enemy-types';
import { checkSandProjectileHit } from './rpg-weapon-sand-collision';
import { segmentIntersectsTopographicTerrain, type TopographicTerrainState } from './terrain/topographic-terrain';
import type { TargetCollectionOptions } from './rpg-targeting-types';

// ── Dependency-injection context ──────────────────────────────────────────

/** Structural subset of RpgWeaponCtx containing only what the sand system needs. */
export interface SandWeaponCtx {
  mote: { x: number; y: number };
  dim: { w: number; h: number };
  /** Full visible world-space bounds — updated on every resize. */
  viewport: { left: number; top: number; right: number; bottom: number };
  fluid: { addForce(impulse: FluidImpulse): void };
  readonly bossEnemy: BossEnemy | null;
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  sapphireMissiles: SapphireMissile[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  amberShards: AmberShard[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  quartzSpikes: QuartzSpike[];
  rubyEnemies: RubyEnemy[];
  rubyBolts: RubyBolt[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  citrineBolts: CitrineBolt[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  amethystShards: AmethystShard[];
  diamondEnemies: DiamondEnemy[];
  diamondShards: DiamondShard[];
  nullstoneEnemies: NullstoneEnemy[];
  voidTendrils: VoidTendril[];
  fracterylEnemies: FracterylEnemy[];
  fracterylShards: FracterylShard[];
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
  damageQuartzSpike: (spike: QuartzSpike, dmg: number) => number;
  damageRubyEnemy: (enemy: RubyEnemy, dmg: number, armorMult: number) => number;
  damageRubyBolt: (bolt: RubyBolt, dmg: number) => number;
  damageSunstoneEnemy: (enemy: SunstoneEnemy, dmg: number, armorMult: number) => number;
  damageCitrineEnemy: (enemy: CitrineEnemy, dmg: number, armorMult: number) => number;
  damageCitrineBolt: (bolt: CitrineBolt, dmg: number) => number;
  damageIoliteEnemy: (enemy: IoliteEnemy, dmg: number, armorMult: number) => number;
  damageAmethystEnemy: (enemy: AmethystEnemy, dmg: number, armorMult: number, isImpact: boolean) => number;
  damageAmethystShard: (shard: AmethystShard, dmg: number) => number;
  damageDiamondEnemy: (enemy: DiamondEnemy, dmg: number, armorMult: number) => number;
  damageDiamondShard: (shard: DiamondShard, dmg: number) => number;
  damageNullstoneEnemy: (enemy: NullstoneEnemy, dmg: number, armorMult: number) => number;
  damageVoidTendril: (tendril: VoidTendril, dmg: number) => number;
  damageFracterylEnemy: (enemy: FracterylEnemy, dmg: number, armorMult: number) => number;
  damageFracterylShard: (shard: FracterylShard, dmg: number) => number;
  damageEigensteinEnemy: (enemy: EigensteinEnemy, dmg: number, armorMult: number) => number;
  damageEliteEnemy: (enemy: EliteEnemy, dmg: number, armorMult: number) => number;
  damageBossEnemy: (rawDamage: number, defPierceRatio: number) => number;
  collectEnemyBodyTargets: (opts?: TargetCollectionOptions) => ClosestTarget[];
  damageBodyTarget: (target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean) => number;
  spawnHitVisualsAt: (x: number, y: number, maxHp: number, dmg: number, color: string) => void;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => TopographicTerrainState | null;
}

// ── Handle returned to the caller ─────────────────────────────────────────

export interface SandWeaponHandle {
  readonly sandProjectiles: SandProjectile[];
  spawnSandProjectile: (targetX: number, targetY: number, damage: number, speedMult?: number) => void;
  updateSandProjectiles: (deltaMs: number) => void;
  reset: () => void;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createSandWeaponSystem(ctx: SandWeaponCtx): SandWeaponHandle {
  const { mote, viewport, fluid } = ctx;

  // ── Sand gatling projectile system ─────────────────────────────

  const sandProjectiles: SandProjectile[] = [];

  function spawnSandProjectile(targetX: number, targetY: number, damage: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    sandProjectiles.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * SAND_PROJ_SPEED,
      vy: (dy / dist) * SAND_PROJ_SPEED,
      lifeMs: SAND_PROJ_LIFE_MS,
      scaledDamage: damage,
    });
  }

  function updateSandProjectiles(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;

    for (let i = sandProjectiles.length - 1; i >= 0; i--) {
      const p = sandProjectiles[i];
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { sandProjectiles.splice(i, 1); continue; }
      const prevX = p.x, prevY = p.y;
      p.x += p.vx * dt; p.y += p.vy * dt;

      // Terrain blocking: destroy projectile if it crossed a solid island.
      if (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, p.x, p.y)) {
        sandProjectiles.splice(i, 1); continue;
      }

      // Inject sand-projectile motion into fluid.
      fluid.addForce({
        x: p.x, y: p.y,
        vx: p.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: p.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_SAND_R, g: FLUID_SAND_G, b: FLUID_SAND_B,
        strength: FLUID_PROJECTILE_STRENGTH,
      });

      // Bounds check
      if (p.x < viewport.left || p.x > viewport.right || p.y < viewport.top || p.y > viewport.bottom) {
        sandProjectiles.splice(i, 1); continue;
      }

      // Collision against all enemy types (delegated to rpg-weapon-sand-collision.ts)
      if (checkSandProjectileHit(p, ctx)) {
        sandProjectiles.splice(i, 1);
      }
    }
  }

  return {
    get sandProjectiles() { return sandProjectiles; },
    spawnSandProjectile,
    updateSandProjectiles,
    reset(): void {
      sandProjectiles.length = 0;
    },
  };
}
