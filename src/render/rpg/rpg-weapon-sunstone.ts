/**
 * rpg-weapon-sunstone.ts — Sunstone mine weapon system for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts to keep that module focused on
 * orchestration. This module owns the full lifecycle of sunstone mines:
 *
 *   • Laying a mine at the player's current position.
 *   • Per-frame update: fuse countdown, incoming contact damage from enemies
 *     that overlap the mine, and proximity / fuse / HP detonation triggers.
 *   • Detonation: AOE damage splash to all enemies within aoeRadius, plus a
 *     fluid explosion impulse.
 *
 * The factory `createSunstoneWeaponSystem(ctx)` receives a `SunstoneWeaponCtx`
 * dependency-injection object and returns a `SunstoneWeaponHandle` exposing
 * the mine array (consumed by rpg-weapon-draw.ts for rendering) and per-frame
 * update / lay functions (called from rpg-weapon-systems.ts).
 */

import {
  SUNSTONE_MINE_FUSE_MS, SUNSTONE_MINE_PROXIMITY_PX,
  SUNSTONE_MINE_AOE_BASE_PX, SUNSTONE_MINE_AOE_PER_TIER_PX,
  SUNSTONE_MINE_HP, SUNSTONE_MINE_SIZE,
} from './rpg-weapon-constants';
import {
  FLUID_EXPLOSION_STRENGTH,
} from './rpg-constants';
import type { LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy, BossEnemy, SunstoneMine,
  EliteEnemy,
} from './rpg-enemy-types';
import {
  pushPointOutsideTopographicTerrain,
  hasTopographicTerrainLineOfSight,
} from './terrain/topographic-terrain';

// ── Dependency-injection context ─────────────────────────────────────────────

/** Structural subset of RpgWeaponCtx containing only what the sunstone mine system needs. */
export interface SunstoneWeaponCtx {
  mote: { x: number; y: number };
  fluid: {
    addExplosion(x: number, y: number, strength: number, r: number, g: number, b: number): void;
  };
  readonly bossEnemy: BossEnemy | null;
  // Enemy body arrays (projectile arrays not needed)
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
  // Damage functions (body enemies)
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
  damageBossEnemy: (rawDamage: number, defPierceRatio: number, fromDiamondBlade?: boolean) => number;
  // Visual feedback
  spawnHitVisualsAt: (tx: number, ty: number, maxHp: number, dmg: number, color: string) => void;
  // Game-flow callbacks
  removeDeadEnemies: () => void;
  checkWaveCompletion: () => void;
  /** Returns current terrain state, or null if terrain is not active. */
  getTerrainState?: () => import('./terrain/topographic-terrain').TopographicTerrainState | null;
}

// ── Public handle ─────────────────────────────────────────────────────────────

export interface SunstoneWeaponHandle {
  /** Live array of active mines — read by rpg-weapon-draw.ts. */
  readonly sunstoneMines: SunstoneMine[];
  layMine(scaledDamage: number, tier: number): void;
  updateSunstoneMines(deltaMs: number): void;
  reset(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createSunstoneWeaponSystem(ctx: SunstoneWeaponCtx): SunstoneWeaponHandle {
  const {
    mote, fluid, spawnHitVisualsAt,
    removeDeadEnemies, checkWaveCompletion,
    damageEnemy, damageSapphireEnemy, damageEmeraldEnemy, damageAmberEnemy,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy,
    damageCitrineEnemy, damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy,
    damageNullstoneEnemy, damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
  } = ctx;

  const sunstoneMines: SunstoneMine[] = [];

  function layMine(scaledDamage: number, tier: number): void {
    const aoeRadius = SUNSTONE_MINE_AOE_BASE_PX + (tier - 1) * SUNSTONE_MINE_AOE_PER_TIER_PX;
    // Prevent mine from being placed inside terrain — push spawn point out.
    let mx = mote.x, my = mote.y;
    const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;
    if (terrain) {
      const out = { x: mx, y: my };
      if (pushPointOutsideTopographicTerrain(terrain, mx, my, out, SUNSTONE_MINE_SIZE)) {
        mx = out.x; my = out.y;
      }
    }
    sunstoneMines.push({
      x: mx, y: my,
      fuseMs: SUNSTONE_MINE_FUSE_MS,
      maxFuseMs: SUNSTONE_MINE_FUSE_MS,
      hp: SUNSTONE_MINE_HP,
      maxHp: SUNSTONE_MINE_HP,
      scaledDamage,
      aoeRadius,
      proximityRadius: SUNSTONE_MINE_PROXIMITY_PX,
    });
  }

  /**
   * Detonates a mine at the given index (removes it and applies AOE damage
   * to all enemies in aoeRadius).  Terrain blocks blast pressure: enemies
   * behind an island from the mine's perspective receive no damage.
   */
  function detonateMine(index: number): void {
    const mine = sunstoneMines[index];
    sunstoneMines.splice(index, 1);

    fluid.addExplosion(mine.x, mine.y, FLUID_EXPLOSION_STRENGTH * 1.4, 255, 140, 40);

    const r2 = mine.aoeRadius * mine.aoeRadius;
    const col = '#ffaa22';
    const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;
    const applyAoe = <T extends { x: number; y: number; hp: number; maxHp: number }>(
      arr: T[],
      damageFn: (e: T, dmg: number, pierce: number) => number,
    ) => {
      for (const e of arr) {
        const dx = e.x - mine.x, dy = e.y - mine.y;
        if (dx * dx + dy * dy <= r2
            && hasTopographicTerrainLineOfSight(terrain, mine.x, mine.y, e.x, e.y)) {
          const dmg = damageFn(e, mine.scaledDamage, 0);
          if (dmg > 0) spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, col);
        }
      }
    };
    applyAoe(ctx.enemies,          damageEnemy);
    applyAoe(ctx.sapphireEnemies,  (e, d, p) => damageSapphireEnemy(e, d, p, false));
    applyAoe(ctx.emeraldEnemies,   damageEmeraldEnemy);
    applyAoe(ctx.amberEnemies,     damageAmberEnemy);
    applyAoe(ctx.voidEnemies,      damageVoidEnemy);
    applyAoe(ctx.quartzEnemies,    damageQuartzEnemy);
    applyAoe(ctx.rubyEnemies,      damageRubyEnemy);
    applyAoe(ctx.sunstoneEnemies,  damageSunstoneEnemy);
    applyAoe(ctx.citrineEnemies,   damageCitrineEnemy);
    applyAoe(ctx.ioliteEnemies,    damageIoliteEnemy);
    applyAoe(ctx.amethystEnemies,  (e, d, p) => damageAmethystEnemy(e, d, p, false));
    applyAoe(ctx.diamondEnemies,   damageDiamondEnemy);
    applyAoe(ctx.nullstoneEnemies, damageNullstoneEnemy);
    applyAoe(ctx.fracterylEnemies, (e, d, p) => damageFracterylEnemy(e, d, p));
    applyAoe(ctx.eigensteinEnemies,(e, d, p) => damageEigensteinEnemy(e, d, p));
    applyAoe(ctx.eliteEnemies.filter(e => !e.isInvuln), (e, d, p) => damageEliteEnemy(e, d, p));
    if (ctx.bossEnemy) {
      const dx = ctx.bossEnemy.x - mine.x, dy = ctx.bossEnemy.y - mine.y;
      if (dx * dx + dy * dy <= r2
          && hasTopographicTerrainLineOfSight(terrain, mine.x, mine.y, ctx.bossEnemy.x, ctx.bossEnemy.y)) {
        const dmg = damageBossEnemy(mine.scaledDamage, 0);
        if (dmg > 0) spawnHitVisualsAt(ctx.bossEnemy.x, ctx.bossEnemy.y, ctx.bossEnemy.maxHp, dmg, col);
      }
    }
    removeDeadEnemies(); checkWaveCompletion();
  }

  function updateSunstoneMines(deltaMs: number): void {
    for (let i = sunstoneMines.length - 1; i >= 0; i--) {
      const mine = sunstoneMines[i];

      // Fuse countdown.
      mine.fuseMs -= deltaMs;

      // Terrain blocks contact: enemies behind a terrain island from the mine's
      // perspective cannot deal contact damage nor trigger the mine.
      const terrain = ctx.getTerrainState ? ctx.getTerrainState() : null;

      // Apply incoming damage from enemies that overlap the mine.
      const mineHitR = SUNSTONE_MINE_SIZE + 2;
      const mineHitR2 = mineHitR * mineHitR;
      const checkEnemyContact = (ex: number, ey: number, atk: number) => {
        const dx = ex - mine.x, dy = ey - mine.y;
        if (dx * dx + dy * dy <= mineHitR2
            && hasTopographicTerrainLineOfSight(terrain, mine.x, mine.y, ex, ey)) {
          mine.hp -= atk;
        }
      };
      for (const e of ctx.enemies)           checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.sapphireEnemies)   checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.emeraldEnemies)    checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.amberEnemies)      checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.voidEnemies)       checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.quartzEnemies)     checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.rubyEnemies)       checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.sunstoneEnemies)   checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.citrineEnemies)    checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.ioliteEnemies)     checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.amethystEnemies)   checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.diamondEnemies)    checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.nullstoneEnemies)  checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.fracterylEnemies)  checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.eigensteinEnemies) checkEnemyContact(e.x, e.y, e.atk);
      for (const e of ctx.eliteEnemies) if (!e.isInvuln) checkEnemyContact(e.x, e.y, e.atk);

      // Proximity check — detonate if any enemy enters trigger radius.
      // Terrain blocks proximity: enemies with no LOS cannot trigger the mine.
      let triggered = false;
      const prox2 = mine.proximityRadius * mine.proximityRadius;
      const inProximity = (ex: number, ey: number) => {
        const dx = ex - mine.x, dy = ey - mine.y;
        return dx * dx + dy * dy <= prox2
          && hasTopographicTerrainLineOfSight(terrain, mine.x, mine.y, ex, ey);
      };
      if (!triggered) for (const e of ctx.enemies)           { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.sapphireEnemies)   { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.emeraldEnemies)    { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.amberEnemies)      { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.voidEnemies)       { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.quartzEnemies)     { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.rubyEnemies)       { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.sunstoneEnemies)   { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.citrineEnemies)    { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.ioliteEnemies)     { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.amethystEnemies)   { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.diamondEnemies)    { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.nullstoneEnemies)  { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.fracterylEnemies)  { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.eigensteinEnemies) { if (inProximity(e.x, e.y)) { triggered = true; break; } }
      if (!triggered) for (const e of ctx.eliteEnemies)      { if (!e.isInvuln && inProximity(e.x, e.y)) { triggered = true; break; } }

      // Detonate if fuse expired, proximity triggered, or HP depleted by incoming damage.
      if (mine.fuseMs <= 0 || triggered || mine.hp <= 0) {
        detonateMine(i);
      }
    }
  }

  return {
    get sunstoneMines() { return sunstoneMines; },
    layMine,
    updateSunstoneMines,
    reset() { sunstoneMines.length = 0; },
  };
}
