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

import type { ClosestTarget, OrbitProjectile, HitEffect, LaserEnemy, SapphireEnemy, SapphireMissile } from './rpg-types';
import type {
  EmeraldEnemy,
  AmberEnemy, AmberShard,
  VoidEnemy, QuartzEnemy,
  RubyEnemy, SunstoneEnemy, CitrineEnemy,
  IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy,
  BossEnemy, EliteEnemy,
} from './rpg-enemy-types';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getSkillNodeRank } from '../../sim/rpg/rpg-state';
import {
  ORBIT_PROJ_SPEED_RAD, ORBIT_PROJ_RADIUS, ORBIT_PROJ_TRAIL_CAP,
  ORBIT_PROJ_HIT_RADIUS, ORBIT_PROJ_HIT_CD_MS, ORBIT_PROJ_DAMAGE,
  HIT_EFFECT_DURATION_MS, MIN_TRAIL_DISTANCE,
} from './rpg-constants';
import { isLifeBodyTarget, getLifeTargetBody } from './life-weapon-helpers';

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
  /** RPG sim state — used to scale damage via orbit_detonation skill. */
  rpgSimState?: RpgSimState;

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
  collectEnemyBodyTargets(): ClosestTarget[];
  damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number;

  /** Spawns a floating damage number at (x, y) travelling in (vx, vy). */
  spawnDamageNumber(
    x: number, y: number,
    vx: number, vy: number,
    text: string, ratio: number, color: string,
  ): void;
}

function getOrbitTargetBody(target: ClosestTarget): { x: number; y: number; maxHp: number } | null {
  const body =
    target.dustWisp ?? target.ribbonWorm ?? target.lanternMoth ?? target.eyeStalk ??
    target.jellyfish ?? target.clothGhost ?? target.plantTurret ?? target.gearInsect ??
    target.spiderCrawler ?? target.moteSwarm ?? target.shadowHand ?? target.sandFish ??
    target.quartzFish ?? target.rubyFish ?? target.sunstoneFish ?? target.emeraldFish ??
    target.sapphireFish ?? target.amethystFish ?? target.diamondFish ?? target.plantProj ??
    target.polyomino ?? target.fissilePolyomino ?? target.refractorPolyomino ??
    target.verdurePlant;
  return typeof body === 'object' && body !== null && 'maxHp' in body && typeof body.maxHp === 'number'
    ? { x: target.x, y: target.y, maxHp: body.maxHp }
    : null;
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

  // Orbital Detonation: scale base damage by 1 + rank * 0.3
  const detonationRank = ctx.rpgSimState ? getSkillNodeRank(ctx.rpgSimState, 'orbit_detonation') : 0;
  const orbitDamage = ORBIT_PROJ_DAMAGE * (1 + detonationRank * 0.3);

  // ── Reform cooldown (comet_return skill) ───────────────────────
  if (op.reformMs > 0) {
    op.reformMs = Math.max(0, op.reformMs - deltaMs);
    if (op.reformMs > 0) return;
  }

  // ── Angle and position ──────────────────────────────────────────
  const orbitRadiusRank = ctx.rpgSimState ? getSkillNodeRank(ctx.rpgSimState, 'orbital_radius') : 0;
  const effectiveRadius = ORBIT_PROJ_RADIUS * (1 + orbitRadiusRank * 0.12);
  const dt = deltaMs / 1000;
  op.angle -= ORBIT_PROJ_SPEED_RAD * dt;  // counter-clockwise
  op.x = mote.x + Math.cos(op.angle) * effectiveRadius;
  op.y = mote.y + Math.sin(op.angle) * effectiveRadius;

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
  const cometReturnRank = ctx.rpgSimState ? getSkillNodeRank(ctx.rpgSimState, 'comet_return') : 0;
  // Base reform delay when orbit_detonation fires; comet_return reduces it by 40%.
  const BASE_REFORM_MS = 800;
  const reformDelay = detonationRank > 0
    ? BASE_REFORM_MS * (cometReturnRank > 0 ? 0.6 : 1)
    : 0;

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
    if (reformDelay > 0) op.reformMs = reformDelay;
  }

  // ── Laser enemies ───────────────────────────────────────────────
  for (const enemy of ctx.enemies) {
    if (op.hitCooldowns.has(enemy)) continue;
    const dx = op.x - enemy.x, dy = op.y - enemy.y;
    if (dx * dx + dy * dy < hitRadSq) {
      const dmg = Math.max(0, orbitDamage - enemy.def);
      if (dmg > 0) enemy.hp -= dmg;
      op.hitCooldowns.set(enemy, ORBIT_PROJ_HIT_CD_MS);
      ctx.hitEffects.push({ x: enemy.x, y: enemy.y, timerMs: HIT_EFFECT_DURATION_MS, color: HIT_COLOR });
      const ratio = dmg / enemy.maxHp;
      ctx.spawnDamageNumber(enemy.x, enemy.y, 0, -1, String(Math.round(dmg)), ratio, HIT_COLOR);
      if (reformDelay > 0) op.reformMs = reformDelay;
    }
  }

  // ── Sapphire enemies ────────────────────────────────────────────
  for (const enemy of ctx.sapphireEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageSapphireEnemy(enemy, orbitDamage, 0, false),
      enemy.maxHp);
  }

  // ── Sapphire missiles ───────────────────────────────────────────
  for (const m of ctx.sapphireMissiles) {
    if (op.hitCooldowns.has(m)) continue;
    const dx = op.x - m.x, dy = op.y - m.y;
    if (dx * dx + dy * dy < hitRadSq) {
      ctx.damageMissile(m, orbitDamage);
      op.hitCooldowns.set(m, ORBIT_PROJ_HIT_CD_MS);
      ctx.hitEffects.push({ x: m.x, y: m.y, timerMs: HIT_EFFECT_DURATION_MS, color: HIT_COLOR });
    }
  }

  // ── Emerald enemies ─────────────────────────────────────────────
  for (const enemy of ctx.emeraldEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageEmeraldEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Amber enemies ───────────────────────────────────────────────
  for (const enemy of ctx.amberEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageAmberEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Amber shards ────────────────────────────────────────────────
  for (const s of ctx.amberShards) {
    if (op.hitCooldowns.has(s)) continue;
    const dx = op.x - s.x, dy = op.y - s.y;
    if (dx * dx + dy * dy < hitRadSq) {
      ctx.damageAmberShard(s, orbitDamage);
      op.hitCooldowns.set(s, ORBIT_PROJ_HIT_CD_MS);
      ctx.hitEffects.push({ x: s.x, y: s.y, timerMs: HIT_EFFECT_DURATION_MS, color: HIT_COLOR });
    }
  }

  // ── Void enemies ────────────────────────────────────────────────
  for (const enemy of ctx.voidEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageVoidEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Quartz enemies ──────────────────────────────────────────────
  for (const enemy of ctx.quartzEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageQuartzEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Ruby enemies ────────────────────────────────────────────────
  for (const enemy of ctx.rubyEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageRubyEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Sunstone enemies ────────────────────────────────────────────
  for (const enemy of ctx.sunstoneEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageSunstoneEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Citrine enemies ─────────────────────────────────────────────
  for (const enemy of ctx.citrineEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageCitrineEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Iolite enemies ──────────────────────────────────────────────
  for (const enemy of ctx.ioliteEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageIoliteEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Amethyst enemies ────────────────────────────────────────────
  for (const enemy of ctx.amethystEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageAmethystEnemy(enemy, orbitDamage, 0, false),
      enemy.maxHp);
  }

  // ── Diamond enemies ─────────────────────────────────────────────
  for (const enemy of ctx.diamondEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageDiamondEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Nullstone enemies ───────────────────────────────────────────
  for (const enemy of ctx.nullstoneEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageNullstoneEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Fracteryl enemies ───────────────────────────────────────────
  for (const enemy of ctx.fracterylEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageFracterylEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Eigenstein enemies ──────────────────────────────────────────
  for (const enemy of ctx.eigensteinEnemies) {
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageEigensteinEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Elite enemies ───────────────────────────────────────────────
  for (const enemy of ctx.eliteEnemies) {
    if (enemy.isInvuln) continue;
    tryHit(op, enemy, enemy.x, enemy.y,
      () => ctx.damageEliteEnemy(enemy, orbitDamage, 0),
      enemy.maxHp);
  }

  // ── Life zone cells/core ─────────────────────────────────────────
  // Life targets use a dedicated branch (rather than getOrbitTargetBody's
  // per-call object) so the hit-cooldown map keys off the actual cell/colony
  // reference — needed for the cooldown to persist across frames.
  for (const target of ctx.collectEnemyBodyTargets()) {
    if (!isLifeBodyTarget(target)) continue;
    const lifeBody = getLifeTargetBody(target);
    if (!lifeBody) continue;
    tryHit(op, lifeBody.ref, target.x, target.y,
      () => ctx.damageBodyTarget(target, orbitDamage, 0, false),
      lifeBody.maxHp);
  }

  // ── Boss ────────────────────────────────────────────────────────
  for (const target of ctx.collectEnemyBodyTargets()) {
    if (!target.kind.startsWith('proc_') &&
        target.kind !== 'verdure_plant' &&
        target.kind !== 'verdure_polyomino' &&
        target.kind !== 'verdure_polyomino_fissile' &&
        target.kind !== 'verdure_polyomino_refractor') continue;
    const body = getOrbitTargetBody(target);
    if (!body) continue;
    tryHit(op, body, target.x, target.y,
      () => ctx.damageBodyTarget(target, orbitDamage, 0, false),
      body.maxHp);
  }

  const boss = ctx.bossEnemy;
  if (boss && !op.hitCooldowns.has(boss)) {
    const dx = op.x - boss.x, dy = op.y - boss.y;
    if (dx * dx + dy * dy < hitRadSq) {
      const dmg = ctx.damageBossEnemy(orbitDamage, 0);
      op.hitCooldowns.set(boss, ORBIT_PROJ_HIT_CD_MS);
      ctx.hitEffects.push({ x: boss.x, y: boss.y, timerMs: HIT_EFFECT_DURATION_MS, color: HIT_COLOR });
      if (dmg > 0) ctx.spawnDamageNumber(boss.x, boss.y, 0, -1, String(Math.round(dmg)), dmg / boss.maxHp, HIT_COLOR);
    }
  }
}
