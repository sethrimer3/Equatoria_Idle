/**
 * rpg-weapon-poison.ts — Iolite poison bolt weapon system for the RPG tab.
 *
 * Extracted from rpg-weapon-systems.ts to keep that module focused on
 * orchestration. This module owns the full lifecycle of poison bolts:
 *
 *   • Spawning a bolt aimed toward a target.
 *   • Per-frame update: movement, trail ring buffer, fluid injection, bounds
 *     check, and collision detection that applies an initial hit and attaches
 *     a poison debuff to the struck enemy.
 *   • Per-frame debuff tick: periodic poison damage to all poisoned targets,
 *     with automatic cleanup when targets die or poison expires.
 *
 * The factory `createPoisonWeaponSystem(ctx)` receives a `PoisonWeaponCtx`
 * dependency-injection object and returns a `PoisonWeaponHandle` exposing
 * the bolt array (consumed by rpg-weapon-draw.ts for rendering) and per-frame
 * update / spawn functions (called from rpg-weapon-systems.ts).
 */

import {
  POISON_ARMOR_IGNORE_PER_TIER, POISON_DURATION_BASE_TIER, POISON_DURATION_MS_PER_TIER,
  POISON_TOTAL_MULTIPLIER, POISON_BOLT_SPEED, POISON_BOLT_SIZE, POISON_BOLT_COLOR,
  POISON_BOLT_LIFE_MS, POISON_BOLT_TRAIL_CAP, POISON_TICK_INTERVAL_MS,
} from './rpg-weapon-constants';
import {
  TARGET_FRAME_MS, FLUID_VEL_FRAME_TO_PX_S,
} from './rpg-constants';
import type { FluidImpulse } from './rpg-fluid';
import type { IolitePoisonBolt, PoisonDebuff, LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
} from './rpg-enemy-types';

// ── Dependency-injection context ─────────────────────────────────────────────

/** Structural subset of RpgWeaponCtx containing only what the poison bolt system needs. */
export interface PoisonWeaponCtx {
  mote: { x: number; y: number };
  dim: { w: number; h: number };
  fluid: { addForce(impulse: FluidImpulse): void };
  readonly bossEnemy: BossEnemy | null;
  // Enemy body arrays
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
  spawnDamageNumber: (x: number, y: number, vx: number, vy: number, text: string, healthFraction: number, color: string) => void;
  spawnHitVisualsAt: (tx: number, ty: number, maxHp: number, dmg: number, color: string) => void;
  // Game-flow callbacks
  removeDeadEnemies: () => void;
  checkWaveCompletion: () => void;
}

// ── Public handle ─────────────────────────────────────────────────────────────

export interface PoisonWeaponHandle {
  /** Live array of in-flight poison bolts — read by rpg-weapon-draw.ts. */
  readonly poisonBolts: IolitePoisonBolt[];
  spawnPoisonBolt(targetX: number, targetY: number, weaponId: string, tier: number, rawDamage: number): void;
  updatePoisonBolts(deltaMs: number): void;
  updatePoisonDebuffs(deltaMs: number): void;
  reset(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createPoisonWeaponSystem(ctx: PoisonWeaponCtx): PoisonWeaponHandle {
  const {
    mote, dim, fluid, spawnDamageNumber, spawnHitVisualsAt,
    removeDeadEnemies, checkWaveCompletion,
    damageEnemy, damageSapphireEnemy, damageEmeraldEnemy, damageAmberEnemy,
    damageVoidEnemy, damageQuartzEnemy, damageRubyEnemy, damageSunstoneEnemy,
    damageCitrineEnemy, damageIoliteEnemy, damageAmethystEnemy, damageDiamondEnemy,
    damageNullstoneEnemy, damageFracterylEnemy, damageEigensteinEnemy, damageEliteEnemy, damageBossEnemy,
  } = ctx;

  const poisonBolts: IolitePoisonBolt[] = [];
  const poisonDebuffs: Map<object, PoisonDebuff> = new Map();

  function spawnPoisonBolt(targetX: number, targetY: number, weaponId: string, tier: number, rawDamage: number): void {
    const dx = targetX - mote.x, dy = targetY - mote.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist < 0.01) return;
    poisonBolts.push({
      x: mote.x, y: mote.y,
      vx: (dx / dist) * POISON_BOLT_SPEED,
      vy: (dy / dist) * POISON_BOLT_SPEED,
      lifeMs: POISON_BOLT_LIFE_MS,
      scaledDamage: rawDamage,
      tier, weaponId,
      trailX: new Float64Array(POISON_BOLT_TRAIL_CAP),
      trailY: new Float64Array(POISON_BOLT_TRAIL_CAP),
      trailHead: 0, trailCount: 0,
    });
  }

  /** Attaches or refreshes a poison debuff on a target, using a closure for typed damage dispatch. */
  function attachPoisonDebuff<T extends { x: number; y: number; hp: number; maxHp: number }>(
    target: T,
    rawDamage: number,
    tier: number,
    damageFn: (enemy: T, dmg: number, pierce: number) => number,
  ): void {
    const armorIgnore   = Math.min(1, tier * POISON_ARMOR_IGNORE_PER_TIER);
    const clampedTier   = Math.min(tier, POISON_DURATION_BASE_TIER - 1);
    const durationMs    = (POISON_DURATION_BASE_TIER - clampedTier) * POISON_DURATION_MS_PER_TIER;
    const poisonTotal   = rawDamage * tier * POISON_TOTAL_MULTIPLIER;
    const damagePerTick = poisonTotal / (durationMs / POISON_TICK_INTERVAL_MS);
    poisonDebuffs.set(target, {
      remainingDamage: poisonTotal,
      damagePerTick,
      tickTimerMs: POISON_TICK_INTERVAL_MS,
      maxHp: target.maxHp,
      isAlive: () => target.hp > 0,
      applyTick:  (tick: number) => target.hp > 0 ? damageFn(target, tick, armorIgnore) : 0,
      getPos: () => ({ x: target.x, y: target.y }),
    });
  }

  function updatePoisonBolts(deltaMs: number): void {
    const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
    const hitR = POISON_BOLT_SIZE * 3;

    for (let i = poisonBolts.length - 1; i >= 0; i--) {
      const p = poisonBolts[i];
      p.lifeMs -= deltaMs;
      if (p.lifeMs <= 0) { poisonBolts.splice(i, 1); continue; }

      p.x += p.vx * dt; p.y += p.vy * dt;

      // Trail ring buffer
      p.trailX[p.trailHead] = p.x; p.trailY[p.trailHead] = p.y;
      p.trailHead = (p.trailHead + 1) % POISON_BOLT_TRAIL_CAP;
      if (p.trailCount < POISON_BOLT_TRAIL_CAP) p.trailCount++;

      // Fluid injection
      fluid.addForce({
        x: p.x, y: p.y,
        vx: p.vx * FLUID_VEL_FRAME_TO_PX_S * 0.4,
        vy: p.vy * FLUID_VEL_FRAME_TO_PX_S * 0.4,
        r: 136, g: 68, b: 255,
        strength: 0.1,
      });

      if (p.x < 0 || p.x > dim.w || p.y < 0 || p.y > dim.h) {
        poisonBolts.splice(i, 1); continue;
      }

      // Collision — first hit ends the bolt.
      let hit = false;
      const tryHit = <T extends { x: number; y: number; hp: number; maxHp: number }>(
        e: T,
        damageFn: (enemy: T, dmg: number, pierce: number) => number,
      ): boolean => {
        const dx = p.x - e.x, dy = p.y - e.y;
        if (dx * dx + dy * dy >= hitR * hitR) return false;
        const dmg = damageFn(e, p.scaledDamage, 0);
        spawnHitVisualsAt(e.x, e.y, e.maxHp, dmg, POISON_BOLT_COLOR);
        attachPoisonDebuff(e, p.scaledDamage, p.tier, damageFn);
        return true;
      };

      for (const e of ctx.enemies)           { if (tryHit(e, damageEnemy))                                              { hit = true; break; } }
      if (!hit) for (const e of ctx.sapphireEnemies)   { if (tryHit(e, (en, d, r) => damageSapphireEnemy(en, d, r, false)))  { hit = true; break; } }
      if (!hit) for (const e of ctx.emeraldEnemies)    { if (tryHit(e, damageEmeraldEnemy))                               { hit = true; break; } }
      if (!hit) for (const e of ctx.amberEnemies)      { if (tryHit(e, damageAmberEnemy))                                 { hit = true; break; } }
      if (!hit) for (const e of ctx.voidEnemies)       { if (tryHit(e, damageVoidEnemy))                                  { hit = true; break; } }
      if (!hit) for (const e of ctx.quartzEnemies)     { if (tryHit(e, damageQuartzEnemy))                                { hit = true; break; } }
      if (!hit) for (const e of ctx.rubyEnemies)       { if (tryHit(e, damageRubyEnemy))                                  { hit = true; break; } }
      if (!hit) for (const e of ctx.sunstoneEnemies)   { if (tryHit(e, damageSunstoneEnemy))                              { hit = true; break; } }
      if (!hit) for (const e of ctx.citrineEnemies)    { if (tryHit(e, damageCitrineEnemy))                               { hit = true; break; } }
      if (!hit) for (const e of ctx.ioliteEnemies)     { if (tryHit(e, damageIoliteEnemy))                                { hit = true; break; } }
      if (!hit) for (const e of ctx.amethystEnemies)   { if (tryHit(e, (en, d, r) => damageAmethystEnemy(en, d, r, false))) { hit = true; break; } }
      if (!hit) for (const e of ctx.diamondEnemies)    { if (tryHit(e, damageDiamondEnemy))                               { hit = true; break; } }
      if (!hit) for (const e of ctx.nullstoneEnemies)  { if (tryHit(e, damageNullstoneEnemy))                             { hit = true; break; } }
      if (!hit) for (const e of ctx.fracterylEnemies)  { if (tryHit(e, (en, d, r) => damageFracterylEnemy(en, d, r)))    { hit = true; break; } }
      if (!hit) for (const e of ctx.eigensteinEnemies) { if (tryHit(e, (en, d, r) => damageEigensteinEnemy(en, d, r)))   { hit = true; break; } }
      if (!hit) for (const e of ctx.eliteEnemies) { if (e.isInvuln) continue; if (tryHit(e, (en, d, r) => damageEliteEnemy(en, d, r))) { hit = true; break; } }
      if (!hit && ctx.bossEnemy) {
        const boss = ctx.bossEnemy;
        const dx = p.x - boss.x, dy = p.y - boss.y;
        if (dx * dx + dy * dy < hitR * hitR) {
          const dmg = damageBossEnemy(p.scaledDamage, 0);
          if (dmg > 0) spawnHitVisualsAt(boss.x, boss.y, boss.maxHp, dmg, POISON_BOLT_COLOR);
          attachPoisonDebuff(boss, p.scaledDamage, p.tier, (_b, d, r) => damageBossEnemy(d, r));
          hit = true;
        }
      }

      if (hit) {
        poisonBolts.splice(i, 1);
        removeDeadEnemies(); checkWaveCompletion();
      }
    }
  }

  function updatePoisonDebuffs(deltaMs: number): void {
    for (const [target, debuff] of poisonDebuffs) {
      if (debuff.remainingDamage <= 0) { poisonDebuffs.delete(target); continue; }
      // Remove the debuff if the target has already been killed.
      if (!debuff.isAlive()) { poisonDebuffs.delete(target); continue; }

      debuff.tickTimerMs -= deltaMs;
      if (debuff.tickTimerMs <= 0) {
        debuff.tickTimerMs += POISON_TICK_INTERVAL_MS;
        const tick = Math.min(debuff.damagePerTick, debuff.remainingDamage);
        debuff.remainingDamage -= tick;
        const dmg = debuff.applyTick(tick);
        if (dmg > 0) {
          const pos = debuff.getPos();
          spawnDamageNumber(pos.x, pos.y, 0, -1, String(Math.round(dmg)), dmg / debuff.maxHp, POISON_BOLT_COLOR);
        }
        if (debuff.remainingDamage <= 0) poisonDebuffs.delete(target);
      }
    }
    removeDeadEnemies();
    checkWaveCompletion();
  }

  return {
    get poisonBolts() { return poisonBolts; },
    spawnPoisonBolt,
    updatePoisonBolts,
    updatePoisonDebuffs,
    reset() {
      poisonBolts.length = 0;
      poisonDebuffs.clear();
    },
  };
}
