/**
 * rpg-elite-enemy-updates.ts — Per-frame update logic for all elite polygon enemies.
 *
 * Each elite type (quartz through nullstone) has unique attack behaviors that
 * reuse existing projectile arrays (quartzSpikes, rubyBolts, citrineBolts,
 * amethystShards, diamondShards, voidTendrils).
 *
 * Elite designs:
 *   Quartz  (3 sides) — Crystal Salvo: two staggered 3-spike bursts; Crystal Nova: 9-spike ring.
 *   Ruby    (4 sides) — Cardinal Burst: 4 bolts at N/E/S/W; Triple Shot: tight 3-bolt spread.
 *   Sunstone(5 sides) — Star Flare: 5 homing citrine bolts; Corona Pulse: 10-spike ring.
 *   Citrine (6 sides) — Hex Swarm: 6 homing citrine bolts; Laser Hex: 6 instant beams.
 *   Iolite  (7 sides) — Prism Fan: 7 beams in a wide arc; Gravity Well: pulls player 2.5 s.
 *   Amethyst(8 sides) — Crystal Storm: two staggered 8-shard rings; reactive shield burst.
 *   Diamond (9 sides) — Nine-Star burst; phase cycle (invuln orbit ↔ vulnerable patrol).
 *   Nullstone(10 sides)— Tendril Swarm; Event Horizon: 20-tendril ring when HP < 30%.
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
  NULLSTONE_GRAVITY_STRENGTH, NULLSTONE_GRAVITY_RADIUS,
  QUARTZ_SPIKE_HP_INIT, QUARTZ_SPIKE_ATK_INIT, QUARTZ_SPIKE_LIFE_MS, QUARTZ_SPIKE_SPEED,
  RUBY_BOLT_HP_INIT, RUBY_BOLT_ATK_INIT, RUBY_BOLT_LIFE_MS, RUBY_BOLT_SPEED,
  CITRINE_BOLT_HP_INIT, CITRINE_BOLT_ATK_INIT,
  AMETHYST_SHARD_HP_INIT, AMETHYST_SHARD_ATK_INIT, AMETHYST_SHARD_LIFE_MS, AMETHYST_SHARD_SPEED,
  DIAMOND_SHARD_HP_INIT, DIAMOND_SHARD_ATK_INIT, DIAMOND_SHARD_LIFE_MS, DIAMOND_SHARD_SPEED,
  VOID_TENDRIL_HP_INIT, VOID_TENDRIL_ATK_INIT, VOID_TENDRIL_LIFE_MS, VOID_TENDRIL_SPEED,
  ELITE_QUARTZ_A1_CD_MS, ELITE_QUARTZ_A2_CD_MS, ELITE_QUARTZ_SALVO_MS,
  ELITE_RUBY_A1_CD_MS, ELITE_RUBY_A2_CD_MS,
  ELITE_SUNSTONE_A1_CD_MS, ELITE_SUNSTONE_A2_CD_MS,
  ELITE_CITRINE_A1_CD_MS, ELITE_CITRINE_A2_CD_MS, ELITE_CITRINE_GLOW,
  ELITE_IOLITE_A1_CD_MS, ELITE_IOLITE_A2_CD_MS, ELITE_IOLITE_GRAVITY_MS, ELITE_IOLITE_GLOW,
  ELITE_AMETHYST_A1_CD_MS, ELITE_AMETHYST_SALVO_MS, ELITE_AMETHYST_SHIELD_REGEN_RATE,
  ELITE_DIAMOND_A1_CD_MS, ELITE_DIAMOND_INVULN_MS, ELITE_DIAMOND_VULN_MS,
  ELITE_NULLSTONE_A1_CD_MS,
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

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Clamp x to [lo, hi]. */
function clamp(x: number, lo: number, hi: number): number {
  return x < lo ? lo : x > hi ? hi : x;
}

/**
 * Patrol movement shared by most elite types.
 * Picks a random direction every ELITE_PATROL_TURN_MS ms, damps velocity.
 */
function patrolStep(enemy: EliteEnemy, dt: number): void {
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

/** Fire `count` QuartzSpikes evenly fanned around a central angle (radians). */
function fireSpikeFan(
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

/** Fire `count` RubyBolts evenly fanned around a central angle. */
function fireBoltFan(
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

/** Fire `count` CitrineBolts in a ring (full 360°) or fan. */
function fireHomingBolts(
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
function fireShardsRing(
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
function fireDiamondRing(
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
function fireTendrilRing(
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

/** Emit a fluid explosion centered on the enemy, sized for the tier's color. */
function eliteFluidExplosion(
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

// ── Per-tier fluid colors ─────────────────────────────────────────────────────

const TIER_FLUID: Record<string, [number, number, number]> = {
  quartz:    [FLUID_QUARTZ_R,    FLUID_QUARTZ_G,    FLUID_QUARTZ_B],
  ruby:      [FLUID_RUBY_R,      FLUID_RUBY_G,      FLUID_RUBY_B],
  sunstone:  [FLUID_SUNSTONE_R,  FLUID_SUNSTONE_G,  FLUID_SUNSTONE_B],
  citrine:   [FLUID_CITRINE_R,   FLUID_CITRINE_G,   FLUID_CITRINE_B],
  iolite:    [FLUID_IOLITE_R,    FLUID_IOLITE_G,    FLUID_IOLITE_B],
  amethyst:  [FLUID_AMETHYST_R,  FLUID_AMETHYST_G,  FLUID_AMETHYST_B],
  diamond:   [FLUID_DIAMOND_R,   FLUID_DIAMOND_G,   FLUID_DIAMOND_B],
  nullstone: [FLUID_NULLSTONE_R, FLUID_NULLSTONE_G, FLUID_NULLSTONE_B],
};

// ── Main update function ──────────────────────────────────────────────────────

export function updateEliteEnemies(
  eliteEnemies: EliteEnemy[],
  ctx: EliteEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;

  for (const enemy of eliteEnemies) {
    enemy.pulseMs += deltaMs;

    const toPlayerAngle = Math.atan2(mote.y - enemy.y, mote.x - enemy.x);

    switch (enemy.tier) {
      // ──────────────────────────────────────────────────────────────
      // Quartz elite — triangle
      // A1: Crystal Salvo (3 spikes aimed at player, then 3 more at +60° offset)
      // A2: Crystal Nova  (9 spikes in full ring + fluid explosion)
      // ──────────────────────────────────────────────────────────────
      case 'quartz': {
        patrolStep(enemy, dt);
        ctx.clampEnemyToBounds(enemy);

        // Pending second salvo
        if (enemy.pendingSalvoMs >= 0) {
          enemy.pendingSalvoMs -= deltaMs;
          if (enemy.pendingSalvoMs <= 0) {
            enemy.pendingSalvoMs = -1;
            fireSpikeFan(enemy, ctx, toPlayerAngle + Math.PI / 3, 3, 0.3);
          }
        }

        enemy.attack1TimerMs -= deltaMs;
        if (enemy.attack1TimerMs <= 0) {
          enemy.attack1TimerMs = ELITE_QUARTZ_A1_CD_MS;
          fireSpikeFan(enemy, ctx, toPlayerAngle, 3, 0.25);
          enemy.pendingSalvoMs = ELITE_QUARTZ_SALVO_MS;
          const [r, g, b] = TIER_FLUID.quartz;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 0.5, r, g, b);
        }

        enemy.attack2TimerMs -= deltaMs;
        if (enemy.attack2TimerMs <= 0) {
          enemy.attack2TimerMs = ELITE_QUARTZ_A2_CD_MS;
          // 9-spike ring with random rotation offset
          const offset = Math.random() * Math.PI * 2;
          const atkMult = enemy.atk / (QUARTZ_SPIKE_ATK_INIT || 1);
          for (let i = 0; i < 9; i++) {
            const angle = offset + (i / 9) * Math.PI * 2;
            const vx = Math.cos(angle) * QUARTZ_SPIKE_SPEED * 1.3;
            const vy = Math.sin(angle) * QUARTZ_SPIKE_SPEED * 1.3;
            const spike = makeQuartzSpike(enemy.x, enemy.y, vx, vy);
            spike.atk   = Math.max(1, Math.ceil(QUARTZ_SPIKE_ATK_INIT * atkMult));
            spike.hp    = Math.max(1, Math.ceil(QUARTZ_SPIKE_HP_INIT  * atkMult));
            spike.maxHp = spike.hp;
            spike.lifeMs = QUARTZ_SPIKE_LIFE_MS * 1.6;
            ctx.quartzSpikes.push(spike);
          }
          const [r, g, b] = TIER_FLUID.quartz;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 1.2, r, g, b);
        }
        break;
      }

      // ──────────────────────────────────────────────────────────────
      // Ruby elite — square
      // A1: Cardinal Burst (4 bolts at 0°, 90°, 180°, 270°)
      // A2: Triple Shot (3-bolt tight spread aimed at player)
      // ──────────────────────────────────────────────────────────────
      case 'ruby': {
        patrolStep(enemy, dt);
        ctx.clampEnemyToBounds(enemy);

        enemy.attack1TimerMs -= deltaMs;
        if (enemy.attack1TimerMs <= 0) {
          enemy.attack1TimerMs = ELITE_RUBY_A1_CD_MS;
          // N/E/S/W burst
          for (let i = 0; i < 4; i++) {
            fireBoltFan(enemy, ctx, (i / 4) * Math.PI * 2, 1, 0);
          }
          const [r, g, b] = TIER_FLUID.ruby;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 0.6, r, g, b);
        }

        enemy.attack2TimerMs -= deltaMs;
        if (enemy.attack2TimerMs <= 0) {
          enemy.attack2TimerMs = ELITE_RUBY_A2_CD_MS;
          fireBoltFan(enemy, ctx, toPlayerAngle, 3, 0.22);
          const [r, g, b] = TIER_FLUID.ruby;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 0.8, r, g, b);
        }
        break;
      }

      // ──────────────────────────────────────────────────────────────
      // Sunstone elite — pentagon
      // A1: Star Flare (5 homing citrine bolts at 72° apart)
      // A2: Corona Pulse (10 quartz spikes in ring + explosion)
      // ──────────────────────────────────────────────────────────────
      case 'sunstone': {
        // Orbit player at preferred distance of ~90px
        const dx = mote.x - enemy.x;
        const dy = mote.y - enemy.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const preferredDist = 90;
        if (dist > preferredDist + 10) {
          enemy.vx += (dx / dist) * 0.03 * dt;
          enemy.vy += (dy / dist) * 0.03 * dt;
        } else if (dist < preferredDist - 10) {
          enemy.vx -= (dx / dist) * 0.03 * dt;
          enemy.vy -= (dy / dist) * 0.03 * dt;
        }
        // Orbit tangentially
        enemy.orbitAngle += 0.0006 * deltaMs;
        enemy.vx += Math.cos(enemy.orbitAngle) * 0.02 * dt;
        enemy.vy += Math.sin(enemy.orbitAngle) * 0.02 * dt;
        enemy.vx = clamp(enemy.vx, -0.7, 0.7);
        enemy.vy = clamp(enemy.vy, -0.7, 0.7);
        enemy.x += enemy.vx * dt;
        enemy.y += enemy.vy * dt;
        ctx.clampEnemyToBounds(enemy);

        enemy.attack1TimerMs -= deltaMs;
        if (enemy.attack1TimerMs <= 0) {
          enemy.attack1TimerMs = ELITE_SUNSTONE_A1_CD_MS;
          fireHomingBolts(enemy, ctx, 5, toPlayerAngle);
          const [r, g, b] = TIER_FLUID.sunstone;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 0.6, r, g, b);
        }

        enemy.attack2TimerMs -= deltaMs;
        if (enemy.attack2TimerMs <= 0) {
          enemy.attack2TimerMs = ELITE_SUNSTONE_A2_CD_MS;
          // 10-spike ring
          const off = Math.random() * Math.PI * 2;
          const atkMult = enemy.atk / (QUARTZ_SPIKE_ATK_INIT || 1);
          for (let i = 0; i < 10; i++) {
            const angle = off + (i / 10) * Math.PI * 2;
            const vx = Math.cos(angle) * QUARTZ_SPIKE_SPEED * 1.4;
            const vy = Math.sin(angle) * QUARTZ_SPIKE_SPEED * 1.4;
            const spike = makeQuartzSpike(enemy.x, enemy.y, vx, vy);
            spike.atk   = Math.max(1, Math.ceil(QUARTZ_SPIKE_ATK_INIT * atkMult));
            spike.hp    = Math.max(1, Math.ceil(QUARTZ_SPIKE_HP_INIT  * atkMult));
            spike.maxHp = spike.hp;
            spike.lifeMs = QUARTZ_SPIKE_LIFE_MS * 1.8;
            ctx.quartzSpikes.push(spike);
          }
          const [r, g, b] = TIER_FLUID.sunstone;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 1.4, r, g, b);
        }
        break;
      }

      // ──────────────────────────────────────────────────────────────
      // Citrine elite — hexagon
      // A1: Hex Swarm (6 homing bolts at 60° apart)
      // A2: Laser Hex (6 instant beams at 60° apart, checked against player)
      // ──────────────────────────────────────────────────────────────
      case 'citrine': {
        patrolStep(enemy, dt);
        ctx.clampEnemyToBounds(enemy);

        enemy.attack1TimerMs -= deltaMs;
        if (enemy.attack1TimerMs <= 0) {
          enemy.attack1TimerMs = ELITE_CITRINE_A1_CD_MS;
          fireHomingBolts(enemy, ctx, 6, Math.random() * Math.PI * 2);
          const [r, g, b] = TIER_FLUID.citrine;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 0.6, r, g, b);
        }

        enemy.attack2TimerMs -= deltaMs;
        if (enemy.attack2TimerMs <= 0) {
          enemy.attack2TimerMs = ELITE_CITRINE_A2_CD_MS;
          const BEAM_RANGE = 140;
          const baseAngle = toPlayerAngle;
          for (let i = 0; i < 6; i++) {
            const angle = baseAngle + (i / 6) * Math.PI * 2;
            const bdirX = Math.cos(angle);
            const bdirY = Math.sin(angle);
            // Project player onto beam axis to check hit
            const toPx = mote.x - enemy.x;
            const toPy = mote.y - enemy.y;
            const tProj = toPx * bdirX + toPy * bdirY;
            const perpDist = Math.abs(toPx - bdirX * tProj) + Math.abs(toPy - bdirY * tProj);
            if (tProj >= 0 && tProj <= BEAM_RANGE && perpDist <= 5) {
              ctx.dealDamageToPlayer(enemy.atk);
            }
            ctx.shotLines.push({
              x1: enemy.x, y1: enemy.y,
              x2: enemy.x + bdirX * BEAM_RANGE,
              y2: enemy.y + bdirY * BEAM_RANGE,
              timerMs: 220,
              color: ELITE_CITRINE_GLOW ?? '#ffe060',
            });
          }
          const [r, g, b] = TIER_FLUID.citrine;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 1.0, r, g, b);
        }
        break;
      }

      // ──────────────────────────────────────────────────────────────
      // Iolite elite — heptagon
      // A1: Prism Fan (7 instant beams in a 150° arc aimed at player)
      // A2: Gravity Well (pulls player toward self for 2.5 s)
      // ──────────────────────────────────────────────────────────────
      case 'iolite': {
        patrolStep(enemy, dt);
        ctx.clampEnemyToBounds(enemy);

        // Gravity well: pull player toward elite
        if (enemy.gravityTimerMs > 0) {
          enemy.gravityTimerMs -= deltaMs;
          const gx = enemy.x - mote.x;
          const gy = enemy.y - mote.y;
          const gDist = Math.sqrt(gx * gx + gy * gy);
          if (gDist > 1) {
            const strength = NULLSTONE_GRAVITY_STRENGTH * 4.5 * dt;
            mote.vx += (gx / gDist) * strength;
            mote.vy += (gy / gDist) * strength;
          }
        }

        enemy.attack1TimerMs -= deltaMs;
        if (enemy.attack1TimerMs <= 0) {
          enemy.attack1TimerMs = ELITE_IOLITE_A1_CD_MS;
          const BEAM_RANGE = 160;
          const fanAngle = (7 - 1) / 7 * Math.PI; // ~150° spread
          const halfFan = fanAngle / 2;
          for (let i = 0; i < 7; i++) {
            const angle = toPlayerAngle - halfFan + (i / 6) * fanAngle;
            const bdirX = Math.cos(angle);
            const bdirY = Math.sin(angle);
            const toPx = mote.x - enemy.x;
            const toPy = mote.y - enemy.y;
            const tProj = toPx * bdirX + toPy * bdirY;
            const perpDist = Math.abs(toPx - bdirX * tProj) + Math.abs(toPy - bdirY * tProj);
            if (tProj >= 0 && tProj <= BEAM_RANGE && perpDist <= 5) {
              ctx.dealDamageToPlayer(enemy.atk);
            }
            ctx.shotLines.push({
              x1: enemy.x, y1: enemy.y,
              x2: enemy.x + bdirX * BEAM_RANGE,
              y2: enemy.y + bdirY * BEAM_RANGE,
              timerMs: 240,
              color: ELITE_IOLITE_GLOW ?? '#8888ee',
            });
          }
          const [r, g, b] = TIER_FLUID.iolite;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 0.8, r, g, b);
        }

        enemy.attack2TimerMs -= deltaMs;
        if (enemy.attack2TimerMs <= 0) {
          enemy.attack2TimerMs = ELITE_IOLITE_A2_CD_MS;
          enemy.gravityTimerMs = ELITE_IOLITE_GRAVITY_MS;
          const [r, g, b] = TIER_FLUID.iolite;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 1.5, r, g, b);
        }
        break;
      }

      // ──────────────────────────────────────────────────────────────
      // Amethyst elite — octagon
      // A1: Crystal Storm (8 shards, then 8 more at +22.5° offset)
      // Reactive: shield burst fires 16 shards when shield breaks
      // Shield regenerates slowly; burst can re-arm each new shield cycle
      // ──────────────────────────────────────────────────────────────
      case 'amethyst': {
        patrolStep(enemy, dt);
        ctx.clampEnemyToBounds(enemy);

        // Shield regeneration
        if (enemy.shieldHp < enemy.maxShieldHp) {
          enemy.shieldHp = Math.min(enemy.maxShieldHp,
            enemy.shieldHp + ELITE_AMETHYST_SHIELD_REGEN_RATE * deltaMs);
          // Reset burst arm when fully regenerated
          if (enemy.shieldHp >= enemy.maxShieldHp) {
            enemy.hasTriggeredLowHp = false;
          }
        }

        // Reactive shield burst when shield drops to 0
        if (enemy.shieldHp <= 0 && !enemy.hasTriggeredLowHp) {
          enemy.hasTriggeredLowHp = true;
          fireShardsRing(enemy, ctx, 16, Math.random() * Math.PI * 2);
          const [r, g, b] = TIER_FLUID.amethyst;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 2.0, r, g, b);
        }

        // Pending second ring
        if (enemy.pendingSalvoMs >= 0) {
          enemy.pendingSalvoMs -= deltaMs;
          if (enemy.pendingSalvoMs <= 0) {
            enemy.pendingSalvoMs = -1;
            fireShardsRing(enemy, ctx, 8, Math.PI / 8); // 22.5° offset
          }
        }

        enemy.attack1TimerMs -= deltaMs;
        if (enemy.attack1TimerMs <= 0) {
          enemy.attack1TimerMs = ELITE_AMETHYST_A1_CD_MS;
          fireShardsRing(enemy, ctx, 8, 0);
          enemy.pendingSalvoMs = ELITE_AMETHYST_SALVO_MS;
          const [r, g, b] = TIER_FLUID.amethyst;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 0.8, r, g, b);
        }
        break;
      }

      // ──────────────────────────────────────────────────────────────
      // Diamond elite — nonagon
      // Phase cycle: vulnerable patrol (fires) ↔ invuln fast-orbit (immune, no fire)
      // A1: Nine-Star burst (9 diamond shards in a ring)
      // ──────────────────────────────────────────────────────────────
      case 'diamond': {
        // Phase management
        enemy.attack2TimerMs -= deltaMs;
        if (enemy.attack2TimerMs <= 0) {
          if (enemy.isInvuln) {
            // Switch to vulnerable
            enemy.isInvuln = false;
            enemy.invulnTimerMs = 0;
            enemy.attack2TimerMs = ELITE_DIAMOND_VULN_MS;
            // Small burst when becoming vulnerable
            fireDiamondRing(enemy, ctx, 5, Math.random() * Math.PI * 2);
          } else {
            // Switch to invuln orbit
            enemy.isInvuln = true;
            enemy.invulnTimerMs = ELITE_DIAMOND_INVULN_MS;
            enemy.attack2TimerMs = ELITE_DIAMOND_INVULN_MS;
            const [r, g, b] = TIER_FLUID.diamond;
            eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 1.5, r, g, b);
          }
        }

        if (enemy.isInvuln) {
          // Fast orbit around player
          enemy.orbitAngle += 0.0035 * deltaMs;
          const orbitR = 60;
          const targetX = mote.x + Math.cos(enemy.orbitAngle) * orbitR;
          const targetY = mote.y + Math.sin(enemy.orbitAngle) * orbitR;
          enemy.vx = (targetX - enemy.x) * 0.18 * dt;
          enemy.vy = (targetY - enemy.y) * 0.18 * dt;
          enemy.x += enemy.vx * dt;
          enemy.y += enemy.vy * dt;
          ctx.clampEnemyToBounds(enemy);
        } else {
          patrolStep(enemy, dt);
          ctx.clampEnemyToBounds(enemy);

          enemy.attack1TimerMs -= deltaMs;
          if (enemy.attack1TimerMs <= 0) {
            enemy.attack1TimerMs = ELITE_DIAMOND_A1_CD_MS;
            fireDiamondRing(enemy, ctx, 9, toPlayerAngle);
            const [r, g, b] = TIER_FLUID.diamond;
            eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 0.9, r, g, b);
          }
        }
        break;
      }

      // ──────────────────────────────────────────────────────────────
      // Nullstone elite — decagon
      // Passive: strong gravity well pulling player toward self
      // A1: Tendril Swarm (10 void tendrils in a ring)
      // A2 (one-time): Event Horizon — 20 tendrils + brief invuln + massive explosion
      // ──────────────────────────────────────────────────────────────
      case 'nullstone': {
        patrolStep(enemy, dt);
        ctx.clampEnemyToBounds(enemy);

        // Invuln countdown (singularity phase)
        if (enemy.isInvuln) {
          enemy.invulnTimerMs -= deltaMs;
          if (enemy.invulnTimerMs <= 0) {
            enemy.isInvuln = false;
            enemy.invulnTimerMs = 0;
          }
        }

        // Passive gravity pull (stronger than regular nullstone)
        const gx = enemy.x - mote.x;
        const gy = enemy.y - mote.y;
        const gDistSq = gx * gx + gy * gy;
        if (gDistSq < NULLSTONE_GRAVITY_RADIUS * NULLSTONE_GRAVITY_RADIUS) {
          const gDist = Math.sqrt(gDistSq);
          if (gDist > 1) {
            const strength = NULLSTONE_GRAVITY_STRENGTH * 3.0 * dt;
            mote.vx += (gx / gDist) * strength;
            mote.vy += (gy / gDist) * strength;
          }
        }

        enemy.attack1TimerMs -= deltaMs;
        if (enemy.attack1TimerMs <= 0) {
          enemy.attack1TimerMs = ELITE_NULLSTONE_A1_CD_MS;
          fireTendrilRing(enemy, ctx, 10, Math.random() * Math.PI * 2);
          const [r, g, b] = TIER_FLUID.nullstone;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 0.8, r, g, b);
        }

        // Event Horizon: one-time trigger at 30% HP
        if (!enemy.hasTriggeredLowHp && enemy.hp <= enemy.maxHp * 0.3) {
          enemy.hasTriggeredLowHp = true;
          enemy.isInvuln = true;
          enemy.invulnTimerMs = 2200;
          fireTendrilRing(enemy, ctx, 20, Math.random() * Math.PI * 2);
          const [r, g, b] = TIER_FLUID.nullstone;
          eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 4.0, r, g, b);
          // Extra purple burst
          ctx.fluid.addForce({
            x: enemy.x, y: enemy.y, vx: 0, vy: 0,
            r: 153, g: 51, b: 255,
            strength: FLUID_EXPLOSION_STRENGTH * 2.5,
          });
        }
        break;
      }
    }
  }
}
