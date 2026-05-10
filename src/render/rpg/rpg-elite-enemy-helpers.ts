/**
 * rpg-elite-enemy-helpers.ts — Shared context type and projectile-spawning helpers
 * for elite polygon enemies.
 *
 * Extracted from rpg-elite-enemy-updates.ts so that per-tier update logic can
 * live in that file without the helper boilerplate making it hard to navigate.
 *
 * Exports:
 *   EliteEnemyCtx   — extends RpgEnemyCtx with the projectile arrays elites fire into.
 *   TIER_FLUID      — per-tier (r, g, b) fluid-color lookup table.
 *   clamp           — simple number clamp utility.
 *   patrolStep      — shared patrol-movement step used by most elite types.
 *   eliteFluidExplosion
 *   fireSpikeFan    — fire QuartzSpikes in a fanned arc
 *   fireSpikeRing   — fire QuartzSpikes in a full ring
 *   fireBoltFan     — fire RubyBolts in a fanned arc
 *   fireHomingBolts — fire CitrineBolts in a ring / offset fan
 *   fireShardsRing  — fire AmethystShards in a ring
 *   fireDiamondRing — fire DiamondShards in a ring
 *   fireTendrilRing — fire VoidTendrils in a ring
 */

import type { RpgEnemyCtx } from './rpg-enemy-updates';
import type {
  EliteEnemy, QuartzSpike, RubyBolt, CitrineBolt,
  AmethystShard, DiamondShard, VoidTendril,
} from './rpg-enemy-types';
import {
  makeQuartzSpike, makeRubyBolt, makeCitrineBolt,
  makeAmethystShard, makeDiamondShard, makeVoidTendril,
} from './rpg-factories';
import {
  QUARTZ_SPIKE_HP_INIT, QUARTZ_SPIKE_ATK_INIT, QUARTZ_SPIKE_LIFE_MS, QUARTZ_SPIKE_SPEED,
  RUBY_BOLT_HP_INIT, RUBY_BOLT_ATK_INIT, RUBY_BOLT_LIFE_MS, RUBY_BOLT_SPEED,
  CITRINE_BOLT_HP_INIT, CITRINE_BOLT_ATK_INIT,
  AMETHYST_SHARD_HP_INIT, AMETHYST_SHARD_ATK_INIT, AMETHYST_SHARD_LIFE_MS, AMETHYST_SHARD_SPEED,
  DIAMOND_SHARD_HP_INIT, DIAMOND_SHARD_ATK_INIT, DIAMOND_SHARD_LIFE_MS, DIAMOND_SHARD_SPEED,
  VOID_TENDRIL_HP_INIT, VOID_TENDRIL_ATK_INIT, VOID_TENDRIL_LIFE_MS, VOID_TENDRIL_SPEED,
  ELITE_PATROL_SPEED, ELITE_PATROL_TURN_MS, ELITE_PATROL_DAMPING,
} from './rpg-enemy-constants';
import {
  TARGET_FRAME_MS, FLUID_EXPLOSION_STRENGTH,
  FLUID_QUARTZ_R, FLUID_QUARTZ_G, FLUID_QUARTZ_B,
  FLUID_RUBY_R, FLUID_RUBY_G, FLUID_RUBY_B,
  FLUID_SUNSTONE_R, FLUID_SUNSTONE_G, FLUID_SUNSTONE_B,
  FLUID_CITRINE_R, FLUID_CITRINE_G, FLUID_CITRINE_B,
  FLUID_IOLITE_R, FLUID_IOLITE_G, FLUID_IOLITE_B,
  FLUID_AMETHYST_R, FLUID_AMETHYST_G, FLUID_AMETHYST_B,
  FLUID_DIAMOND_R, FLUID_DIAMOND_G, FLUID_DIAMOND_B,
  FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B,
} from './rpg-constants';

// ── Context ───────────────────────────────────────────────────────────────────

export interface EliteEnemyCtx extends RpgEnemyCtx {
  quartzSpikes:   QuartzSpike[];
  rubyBolts:      RubyBolt[];
  citrineBolts:   CitrineBolt[];
  amethystShards: AmethystShard[];
  diamondShards:  DiamondShard[];
  voidTendrils:   VoidTendril[];
}

// ── Per-tier fluid colors ─────────────────────────────────────────────────────

export const TIER_FLUID: Record<string, [number, number, number]> = {
  quartz:    [FLUID_QUARTZ_R,    FLUID_QUARTZ_G,    FLUID_QUARTZ_B],
  ruby:      [FLUID_RUBY_R,      FLUID_RUBY_G,      FLUID_RUBY_B],
  sunstone:  [FLUID_SUNSTONE_R,  FLUID_SUNSTONE_G,  FLUID_SUNSTONE_B],
  citrine:   [FLUID_CITRINE_R,   FLUID_CITRINE_G,   FLUID_CITRINE_B],
  iolite:    [FLUID_IOLITE_R,    FLUID_IOLITE_G,    FLUID_IOLITE_B],
  amethyst:  [FLUID_AMETHYST_R,  FLUID_AMETHYST_G,  FLUID_AMETHYST_B],
  diamond:   [FLUID_DIAMOND_R,   FLUID_DIAMOND_G,   FLUID_DIAMOND_B],
  nullstone: [FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B],
};

// ── Shared movement / combat helpers ─────────────────────────────────────────

/** Clamp x to [lo, hi]. */
export function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Patrol movement shared by most elite types.
 * Picks a random direction every ELITE_PATROL_TURN_MS ms, then damps velocity.
 * `dt` is the normalised frame delta: `Math.min(deltaMs / TARGET_FRAME_MS, 3)`.
 */
export function patrolStep(enemy: EliteEnemy, dt: number): void {
  enemy.patrolTimerMs -= dt * TARGET_FRAME_MS;
  if (enemy.patrolTimerMs <= 0) {
    enemy.patrolTimerMs = ELITE_PATROL_TURN_MS * (0.7 + 0.6 * Math.random());
    const angle = Math.random() * Math.PI * 2;
    enemy.vx = Math.cos(angle) * ELITE_PATROL_SPEED;
    enemy.vy = Math.sin(angle) * ELITE_PATROL_SPEED;
  }
  enemy.vx *= ELITE_PATROL_DAMPING;
  enemy.vy *= ELITE_PATROL_DAMPING;
  enemy.x  += enemy.vx * dt;
  enemy.y  += enemy.vy * dt;
}

/** Emit a fluid force/explosion centered on the enemy. */
export function eliteFluidExplosion(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  strength: number,
  r: number, g: number, b: number,
): void {
  ctx.fluid.addForce({
    x: enemy.x, y: enemy.y,
    vx: 0, vy: 0,
    r, g, b,
    strength,
  });
}

// ── Projectile spawning helpers ───────────────────────────────────────────────

/** Fire `count` QuartzSpikes evenly fanned around a central angle (radians). */
export function fireSpikeFan(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  centerAngle: number,
  count: number,
  spreadRad: number,
): void {
  const atkMult = enemy.atk / (QUARTZ_SPIKE_ATK_INIT || 1);
  for (let i = 0; i < count; i++) {
    const angle = centerAngle + (count === 1 ? 0 : (i / (count - 1) - 0.5) * spreadRad * 2);
    const vx = Math.cos(angle) * QUARTZ_SPIKE_SPEED;
    const vy = Math.sin(angle) * QUARTZ_SPIKE_SPEED;
    const spike = makeQuartzSpike(enemy.x, enemy.y, vx, vy);
    spike.atk  = Math.max(1, Math.ceil(QUARTZ_SPIKE_ATK_INIT * atkMult));
    spike.hp   = Math.max(1, Math.ceil(QUARTZ_SPIKE_HP_INIT  * atkMult));
    spike.maxHp = spike.hp;
    spike.lifeMs = QUARTZ_SPIKE_LIFE_MS * 1.4;
    ctx.quartzSpikes.push(spike);
  }
}

/**
 * Fire `count` QuartzSpikes evenly around a full 360° ring.
 * `speedMult` and `lifeMult` allow per-attack tuning without extra helpers.
 */
export function fireSpikeRing(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  count: number,
  angleOffset: number,
  speedMult: number,
  lifeMult: number,
): void {
  const atkMult = enemy.atk / (QUARTZ_SPIKE_ATK_INIT || 1);
  for (let i = 0; i < count; i++) {
    const angle = angleOffset + (i / count) * Math.PI * 2;
    const vx = Math.cos(angle) * QUARTZ_SPIKE_SPEED * speedMult;
    const vy = Math.sin(angle) * QUARTZ_SPIKE_SPEED * speedMult;
    const spike = makeQuartzSpike(enemy.x, enemy.y, vx, vy);
    spike.atk   = Math.max(1, Math.ceil(QUARTZ_SPIKE_ATK_INIT * atkMult));
    spike.hp    = Math.max(1, Math.ceil(QUARTZ_SPIKE_HP_INIT  * atkMult));
    spike.maxHp = spike.hp;
    spike.lifeMs = QUARTZ_SPIKE_LIFE_MS * lifeMult;
    ctx.quartzSpikes.push(spike);
  }
}

/** Fire `count` RubyBolts evenly fanned around a central angle. */
export function fireBoltFan(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  centerAngle: number,
  count: number,
  spreadRad: number,
): void {
  const atkMult = enemy.atk / (RUBY_BOLT_ATK_INIT || 1);
  for (let i = 0; i < count; i++) {
    const angle = centerAngle + (count === 1 ? 0 : (i / (count - 1) - 0.5) * spreadRad * 2);
    const vx = Math.cos(angle) * RUBY_BOLT_SPEED * 1.2;
    const vy = Math.sin(angle) * RUBY_BOLT_SPEED * 1.2;
    const bolt = makeRubyBolt(enemy.x, enemy.y, vx, vy);
    bolt.atk   = Math.max(1, Math.ceil(RUBY_BOLT_ATK_INIT * atkMult));
    bolt.hp    = Math.max(1, Math.ceil(RUBY_BOLT_HP_INIT  * atkMult));
    bolt.maxHp = bolt.hp;
    bolt.lifeMs = RUBY_BOLT_LIFE_MS;
    ctx.rubyBolts.push(bolt);
  }
}

/** Fire `count` CitrineBolts evenly distributed around a starting angle (homing). */
export function fireHomingBolts(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  count: number,
  initialAngleOffset: number,
): void {
  const atkMult = enemy.atk / (CITRINE_BOLT_ATK_INIT || 1);
  for (let i = 0; i < count; i++) {
    const angle = initialAngleOffset + (i / count) * Math.PI * 2;
    const vx = Math.cos(angle) * 1.2;
    const vy = Math.sin(angle) * 1.2;
    const bolt = makeCitrineBolt(enemy.x, enemy.y, vx, vy);
    bolt.atk   = Math.max(1, Math.ceil(CITRINE_BOLT_ATK_INIT * atkMult));
    bolt.hp    = Math.max(1, Math.ceil(CITRINE_BOLT_HP_INIT  * atkMult));
    bolt.maxHp = bolt.hp;
    ctx.citrineBolts.push(bolt);
  }
}

/** Fire `count` AmethystShards evenly in a ring. */
export function fireShardsRing(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  count: number,
  angleOffset: number,
): void {
  const atkMult = enemy.atk / (AMETHYST_SHARD_ATK_INIT || 1);
  for (let i = 0; i < count; i++) {
    const angle = angleOffset + (i / count) * Math.PI * 2;
    const vx = Math.cos(angle) * AMETHYST_SHARD_SPEED * 1.15;
    const vy = Math.sin(angle) * AMETHYST_SHARD_SPEED * 1.15;
    const shard = makeAmethystShard(enemy.x, enemy.y, vx, vy);
    shard.atk   = Math.max(1, Math.ceil(AMETHYST_SHARD_ATK_INIT * atkMult));
    shard.hp    = Math.max(1, Math.ceil(AMETHYST_SHARD_HP_INIT  * atkMult));
    shard.maxHp = shard.hp;
    shard.lifeMs = AMETHYST_SHARD_LIFE_MS;
    ctx.amethystShards.push(shard);
  }
}

/** Fire `count` DiamondShards evenly in a ring. */
export function fireDiamondRing(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  count: number,
  angleOffset: number,
): void {
  const atkMult = enemy.atk / (DIAMOND_SHARD_ATK_INIT || 1);
  for (let i = 0; i < count; i++) {
    const angle = angleOffset + (i / count) * Math.PI * 2;
    const vx = Math.cos(angle) * DIAMOND_SHARD_SPEED * 1.1;
    const vy = Math.sin(angle) * DIAMOND_SHARD_SPEED * 1.1;
    const shard = makeDiamondShard(enemy.x, enemy.y, vx, vy);
    shard.atk   = Math.max(1, Math.ceil(DIAMOND_SHARD_ATK_INIT * atkMult));
    shard.hp    = Math.max(1, Math.ceil(DIAMOND_SHARD_HP_INIT  * atkMult));
    shard.maxHp = shard.hp;
    shard.lifeMs = DIAMOND_SHARD_LIFE_MS;
    ctx.diamondShards.push(shard);
  }
}

/** Fire `count` VoidTendrils evenly in a ring. */
export function fireTendrilRing(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  count: number,
  angleOffset: number,
): void {
  const atkMult = enemy.atk / (VOID_TENDRIL_ATK_INIT || 1);
  for (let i = 0; i < count; i++) {
    const angle = angleOffset + (i / count) * Math.PI * 2;
    const vx = Math.cos(angle) * VOID_TENDRIL_SPEED * 1.2;
    const vy = Math.sin(angle) * VOID_TENDRIL_SPEED * 1.2;
    const tendril = makeVoidTendril(enemy.x, enemy.y, vx, vy);
    tendril.atk   = Math.max(1, Math.ceil(VOID_TENDRIL_ATK_INIT * atkMult));
    tendril.hp    = Math.max(1, Math.ceil(VOID_TENDRIL_HP_INIT  * atkMult));
    tendril.maxHp = tendril.hp;
    tendril.lifeMs = VOID_TENDRIL_LIFE_MS * 1.3;
    ctx.voidTendrils.push(tendril);
  }
}

// Re-export FLUID_EXPLOSION_STRENGTH so callers don't need a second rpg-constants import.
export { FLUID_EXPLOSION_STRENGTH };
