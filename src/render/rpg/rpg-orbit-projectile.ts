/**
 * rpg-orbit-projectile.ts — Orbit projectile update logic for the RPG tab.
 *
 * Contains `updateOrbitProjectile`, which advances the orbiting projectile's
 * angle/position/trail each frame and handles collision detection against all
 * enemy types.  Extracted from rpg-render.ts to reduce file size.
 *
 * The function is pure given its context object; all mutable state arrives via
 * `OrbitProjectileCtx`.
 */

import type { OrbitProjectile, HitEffect, LaserEnemy, SapphireEnemy, SapphireMissile } from './rpg-types';
import type {
  EmeraldEnemy,
  AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy,
  RubyEnemy, SunstoneEnemy, CitrineEnemy,
  IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy,
  BossEnemy, EliteEnemy,
} from './rpg-enemy-types';
import {
  ORBIT_PROJ_SPEED_RAD, ORBIT_PROJ_RADIUS, ORBIT_PROJ_TRAIL_CAP,
  ORBIT_PROJ_HIT_RADIUS, ORBIT_PROJ_HIT_CD_MS, ORBIT_PROJ_DAMAGE,
  HIT_EFFECT_DURATION_MS, MIN_TRAIL_DISTANCE,
} from './rpg-constants';

// ── Dependency-injection context ──────────────────────────────────────────────

export interface OrbitProjectileCtx {
  /** Player mote position (live reference). */
  mote: { x: number; y: number };

  /** Live getter — bossEnemy changes during gameplay. */
  readonly bossEnemy: BossEnemy | null;

  // All enemy arrays (live references, read for collision detection)
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

  /** Hit-flash effect list (pushed to on each hit). */
  hitEffects: HitEffect[];

  // Per-enemy damage functions
  damageEnemy(enemy: LaserEnemy, dmg: number, armorMult: number): number;
  damageSapphireEnemy(enemy: SapphireEnemy, dmg: number, armorMult: number, isImpact: boolean): number;
  damageMissile(missile: SapphireMissile, dmg: number): number;
  damageEmeraldEnemy(enemy: EmeraldEnemy, dmg: number, armorMult: number): number;
  damageAmberEnemy(enemy: AmberEnemy, dmg: number, armorMult: number): number;
  damageAmberShard(shard: AmberShard, dmg: number): number;
  damageVoidEnemy(enemy: VoidEnemy, dmg: number, armorMult: number): number;
  damageQuartzEnemy(enemy: QuartzEnemy, dmg: number, armorMult: number): number;
  damageRubyEnemy(enemy: RubyEnemy, dmg: number, armorMult: number): number;
  damageSunstoneEnemy(enemy: SunstoneEnemy, dmg: number, armorMult: number): number;
  damageCitrineEnemy(enemy: CitrineEnemy, dmg: number, armorMult: number): number;
  damageIoliteEnemy(enemy: IoliteEnemy, dmg: number, armorMult: number): number;
  damageAmethystEnemy(enemy: AmethystEnemy, dmg: number, armorMult: number, bypassShield: boolean): number;
  damageDiamondEnemy(enemy: DiamondEnemy, dmg: number, armorMult: number): number;
  damageNullstoneEnemy(enemy: NullstoneEnemy, dmg: number, armorMult: number): number;
  damageFracterylEnemy(enemy: FracterylEnemy, dmg: number, armorMult: number): number;
  damageEigensteinEnemy(enemy: EigensteinEnemy, dmg: number, armorMult: number): number;
  damageEliteEnemy(enemy: EliteEnemy, dmg: number, armorMult: number): number;
  damageBossEnemy(rawDamage: number, defPierceRatio: number): number;

  /** Spawns a floating damage number at (x, y) travelling in (vx, vy). */
  spawnDamageNumber(
    x: number, y: number,
    vx: number, vy: number,
    text: string, ratio: number, color: string,
  ): void;
}

// ── Core update function ──────────────────────────────────────────────────────

const HIT_COLOR = '#ffaa44';
const MIN_TRAIL_DISTANCE_SQ = MIN_TRAIL_DISTANCE * MIN_TRAIL_DISTANCE;

/**
 * Advances the orbit projectile one frame: updates angle, position, trail,
 * hit cooldowns, and runs collision detection against all enemy types.
 *
 * Does nothing if `op` is null.
 */
export function updateOrbitProjectile(
  ctx: OrbitProjectileCtx,
  op: OrbitProjectile | null,
  deltaMs: number,
): void {
  if (!op) return;

  const { mote } = ctx;

  // ── Angle and position ──────────────────────────────────────────
  const dt = deltaMs / 1000;
  op.angle -= ORBIT_PROJ_SPEED_RAD * dt;  // counter-clockwise
  op.x = mote.x + Math.cos(op.angle) * ORBIT_PROJ_RADIUS;
  op.y = mote.y + Math.sin(op.angle) * ORBIT_PROJ_RADIUS;

  // ── Distance-based trail update ─────────────────────────────────
  const lastTrailIdx = (op.trailHead - 1 + ORBIT_PROJ_TRAIL_CAP) % ORBIT_PROJ_TRAIL_CAP;
  const trailDx = op.x - op.trailX[lastTrailIdx];
  const trailDy = op.y - op.trailY[lastTrailIdx];
  const trailDistSq = trailDx * trailDx + trailDy * trailDy;
  if (op.trailCount === 0 || trailDistSq >= MIN_TRAIL_DISTANCE_SQ) {
    op.trailX[op.trailHead] = op.x;
    op.trailY[op.trailHead] = op.y;
    op.trailHead = (op.trailHead + 1) % ORBIT_PROJ_TRAIL_CAP;
    if (op.trailCount < ORBIT_PROJ_TRAIL_CAP) op.trailCount++;
  }

  // ── Advance per-enemy hit cooldowns ────────────────────────────
  for (const [enemy, cdMs] of op.hitCooldowns) {
    const newCd = cdMs - deltaMs;
    if (newCd <= 0) op.hitCooldowns.delete(enemy);
    else            op.hitCooldowns.set(enemy, newCd);
  }

  const hitRadSq = ORBIT_PROJ_HIT_RADIUS * ORBIT_PROJ_HIT_RADIUS;

  // ── Collision detection helpers ─────────────────────────────────
  /** Minimal shape required by tryHit — used as the Map key only. */
  interface HittableEntity { x: number; y: number }
  function tryHit(
    op: OrbitProjectile,
    enemy: HittableEntity,
    ex: number, ey: number,
    dealDmg: () => number,
    maxHp: number | null,
  ): void {
    if (op.hitCooldowns.has(enemy)) return;
    const dx = op.x - ex, dy = op.y - ey;
    if (dx * dx + dy * dy >= hitRadSq) return;
    const dmg = dealDmg();
    op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
    ctx.hitEffects.push({ x: ex, y: ey, timerMs: HIT_EFFECT_DURATION_MS, color: HIT_COLOR });
    if (dmg > 0 && maxHp !== null) {
      ctx.spawnDamageNumber(ex, ey, 0, -1, String(Math.round(dmg)), dmg / maxHp, HIT_COLOR);
    }
  }

  // ── Laser enemies ───────────────────────────────────────────────
  for (const enemy of ctx.enemies) {
    if (op.hitCooldowns.has(enemy)) continue;
    const dx = op.x - enemy.x, dy = op.y - enemy.y;
    if (dx * dx + dy * dy < hitRadSq) {
      const dmg = Math.max(0, ORBIT_PROJ_DAMAGE - enemy.def);
      if (dmg > 0) enemy.hp -= dmg;
      op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
      ctx.hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: HIT_COLOR });
      const ratio = dmg / enemy.maxHp;
      ctx.spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), ratio, HIT_COLOR);
    }
  }

  // ── Sapphire enemies ────────────────────────────────────────────
  for (const enemy of ctx.sapphireEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageSapphireEnemy(enemy, ORBIT_PROJ_DAMAGE, 0, false),
      enemy.maxHp);
  }

  // ── Sapphire missiles ───────────────────────────────────────────
  for (const m of ctx.sapphireMissiles) {
    if (op.hitCooldowns.has(m)) continue;
    const dx = op.x - m.x, dy = op.y - m.y;
    if (dx * dx + dy * dy < hitRadSq) {
      ctx.damageMissile(m, ORBIT_PROJ_DAMAGE);
      op.hitCooldowns.set(m, ORBIT_PROJ_HIT_CD_MS);
      ctx.hitEffects.push({ x: m.x, y: m.y, timerMs: HIT_EFFECT_DURATION_MS, color: HIT_COLOR });
    }
  }

  // ── Emerald enemies ─────────────────────────────────────────────
  for (const enemy of ctx.emeraldEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageEmeraldEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Amber enemies ───────────────────────────────────────────────
  for (const enemy of ctx.amberEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageAmberEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Amber shards ────────────────────────────────────────────────
  for (const s of ctx.amberShards) {
    if (op.hitCooldowns.has(s)) continue;
    const dx = op.x - s.x, dy = op.y - s.y;
    if (dx * dx + dy * dy < hitRadSq) {
      ctx.damageAmberShard(s, ORBIT_PROJ_DAMAGE);
      op.hitCooldowns.set(s, ORBIT_PROJ_HIT_CD_MS);
      ctx.hitEffects.push({ x: s.x, y: s.y, timerMs: HIT_EFFECT_DURATION_MS, color: HIT_COLOR });
    }
  }

  // ── Void enemies ────────────────────────────────────────────────
  for (const enemy of ctx.voidEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageVoidEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Quartz enemies ──────────────────────────────────────────────
  for (const enemy of ctx.quartzEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageQuartzEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Ruby enemies ────────────────────────────────────────────────
  for (const enemy of ctx.rubyEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageRubyEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Sunstone enemies ────────────────────────────────────────────
  for (const enemy of ctx.sunstoneEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageSunstoneEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Citrine enemies ─────────────────────────────────────────────
  for (const enemy of ctx.citrineEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageCitrineEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Iolite enemies ──────────────────────────────────────────────
  for (const enemy of ctx.ioliteEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageIoliteEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Amethyst enemies ────────────────────────────────────────────
  for (const enemy of ctx.amethystEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageAmethystEnemy(enemy, ORBIT_PROJ_DAMAGE, 0, false),
      enemy.maxHp);
  }

  // ── Diamond enemies ─────────────────────────────────────────────
  for (const enemy of ctx.diamondEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageDiamondEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Nullstone enemies ───────────────────────────────────────────
  for (const enemy of ctx.nullstoneEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageNullstoneEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Fracteryl enemies ───────────────────────────────────────────
  for (const enemy of ctx.fracterylEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageFracterylEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Eigenstein enemies ──────────────────────────────────────────
  for (const enemy of ctx.eigensteinEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageEigensteinEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Elite enemies ───────────────────────────────────────────────
  for (const enemy of ctx.eliteEnemies) {
    if (enemy.isInvuln) continue;
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageEliteEnemy(enemy, ORBIT_PROJ_DAMAGE, 0),
      enemy.maxHp);
  }

  // ── Boss ────────────────────────────────────────────────────────
  const boss = ctx.bossEnemy;
  if (boss && !op.hitCooldowns.has(boss)) {
    const dx = op.x - boss.x, dy = op.y - boss.y;
    if (dx * dx + dy * dy < hitRadSq) {
      const dmg = ctx.damageBossEnemy(ORBIT_PROJ_DAMAGE, 0);
      op.hitCooldowns.set(boss, ORBIT_PROJ_HIT_CD_MS);
      ctx.hitEffects.push({ x: boss.x, y: boss.y, timerMs: HIT_EFFECT_DURATION_MS, color: HIT_COLOR });
      if (dmg > 0) ctx.spawnDamageNumber(boss.x, boss.y, 0, -1, String(Math.round(dmg)), dmg / boss.maxHp, HIT_COLOR);
    }
  }
}
