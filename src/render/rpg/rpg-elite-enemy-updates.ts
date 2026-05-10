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
 *
 * Helpers (patrolStep, fire*, eliteFluidExplosion, TIER_FLUID, EliteEnemyCtx) live in
 * rpg-elite-enemy-helpers.ts to keep this file focused on per-tier behavioral logic.
 */

import type { EliteEnemy } from './rpg-enemy-types';
import {
  NULLSTONE_GRAVITY_STRENGTH, NULLSTONE_GRAVITY_RADIUS,
  ELITE_QUARTZ_A1_CD_MS, ELITE_QUARTZ_A2_CD_MS, ELITE_QUARTZ_SALVO_MS,
  ELITE_RUBY_A1_CD_MS, ELITE_RUBY_A2_CD_MS,
  ELITE_SUNSTONE_A1_CD_MS, ELITE_SUNSTONE_A2_CD_MS,
  ELITE_CITRINE_A1_CD_MS, ELITE_CITRINE_A2_CD_MS, ELITE_CITRINE_GLOW,
  ELITE_IOLITE_A1_CD_MS, ELITE_IOLITE_A2_CD_MS, ELITE_IOLITE_GRAVITY_MS, ELITE_IOLITE_GLOW,
  ELITE_AMETHYST_A1_CD_MS, ELITE_AMETHYST_SALVO_MS, ELITE_AMETHYST_SHIELD_REGEN_RATE,
  ELITE_DIAMOND_A1_CD_MS, ELITE_DIAMOND_INVULN_MS, ELITE_DIAMOND_VULN_MS,
  ELITE_NULLSTONE_A1_CD_MS,
} from './rpg-enemy-constants';
import { TARGET_FRAME_MS } from './rpg-constants';
import {
  type EliteEnemyCtx,
  TIER_FLUID,
  clamp,
  patrolStep,
  eliteFluidExplosion,
  fireSpikeFan,
  fireSpikeRing,
  fireBoltFan,
  fireHomingBolts,
  fireShardsRing,
  fireDiamondRing,
  fireTendrilRing,
  FLUID_EXPLOSION_STRENGTH,
} from './rpg-elite-enemy-helpers';

// Re-export EliteEnemyCtx so rpg-render.ts can import it from either file.
export type { EliteEnemyCtx };

// ── Per-tier update functions ─────────────────────────────────────────────────
//
// Each function handles one elite tier for a single frame.
// Parameters:
//   enemy          — the elite entity being updated.
//   ctx            — shared context (mote, fluid, arrays, damage callbacks).
//   dt             — normalised frame delta: Math.min(deltaMs / TARGET_FRAME_MS, 3).
//   deltaMs        — raw frame time in ms (for timer countdowns).
//   toPlayerAngle  — atan2 angle from enemy to player, pre-computed for efficiency.

// ── Quartz elite — triangle ───────────────────────────────────────────────────
// A1: Crystal Salvo — two staggered 3-spike bursts.
// A2: Crystal Nova  — 9-spike ring + fluid explosion.
function updateEliteQuartz(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
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
    fireSpikeRing(enemy, ctx, 9, Math.random() * Math.PI * 2, 1.3, 1.6);
    const [r, g, b] = TIER_FLUID.quartz;
    eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 1.2, r, g, b);
  }
}

// ── Ruby elite — square ───────────────────────────────────────────────────────
// A1: Cardinal Burst — 4 bolts at N/E/S/W.
// A2: Triple Shot    — tight 3-bolt spread aimed at player.
function updateEliteRuby(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
  patrolStep(enemy, dt);
  ctx.clampEnemyToBounds(enemy);

  enemy.attack1TimerMs -= deltaMs;
  if (enemy.attack1TimerMs <= 0) {
    enemy.attack1TimerMs = ELITE_RUBY_A1_CD_MS;
    for (let i = 0; i < 4; i++) fireBoltFan(enemy, ctx, (i / 4) * Math.PI * 2, 1, 0);
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
}

// ── Sunstone elite — pentagon ─────────────────────────────────────────────────
// A1: Star Flare    — 5 homing citrine bolts at 72° apart.
// A2: Corona Pulse  — 10-spike ring + explosion.
function updateEliteSunstone(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
  const { mote } = ctx;

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
    fireSpikeRing(enemy, ctx, 10, Math.random() * Math.PI * 2, 1.4, 1.8);
    const [r, g, b] = TIER_FLUID.sunstone;
    eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 1.4, r, g, b);
  }
}

// ── Citrine elite — hexagon ───────────────────────────────────────────────────
// A1: Hex Swarm  — 6 homing citrine bolts at 60° apart.
// A2: Laser Hex  — 6 instant beams checked against player position.
function updateEliteCitrine(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
  const { mote } = ctx;
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
    for (let i = 0; i < 6; i++) {
      const angle = toPlayerAngle + (i / 6) * Math.PI * 2;
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
        timerMs: 220,
        color: ELITE_CITRINE_GLOW ?? '#ffe060',
      });
    }
    const [r, g, b] = TIER_FLUID.citrine;
    eliteFluidExplosion(enemy, ctx, FLUID_EXPLOSION_STRENGTH * 1.0, r, g, b);
  }
}

// ── Iolite elite — heptagon ───────────────────────────────────────────────────
// A1: Prism Fan    — 7 instant beams in a 150° arc aimed at player.
// A2: Gravity Well — pulls player toward self for 2.5 s.
function updateEliteIolite(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
  const { mote } = ctx;
  patrolStep(enemy, dt);
  ctx.clampEnemyToBounds(enemy);

  // Active gravity well
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
}

// ── Amethyst elite — octagon ──────────────────────────────────────────────────
// A1: Crystal Storm — 8 shards, then 8 more at +22.5° offset.
// Reactive: shield burst fires 16 shards when shield breaks; rearmed on full regen.
function updateEliteAmethyst(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  _toPlayerAngle: number,
): void {
  patrolStep(enemy, dt);
  ctx.clampEnemyToBounds(enemy);

  // Shield regeneration
  if (enemy.shieldHp < enemy.maxShieldHp) {
    enemy.shieldHp = Math.min(enemy.maxShieldHp,
      enemy.shieldHp + ELITE_AMETHYST_SHIELD_REGEN_RATE * deltaMs);
    if (enemy.shieldHp >= enemy.maxShieldHp) {
      enemy.hasTriggeredLowHp = false; // re-arm burst for next shield cycle
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
}

// ── Diamond elite — nonagon ───────────────────────────────────────────────────
// Phase cycle: vulnerable patrol (fires) ↔ invuln fast-orbit (immune, no fire).
// A1: Nine-Star burst — 9 diamond shards in a ring.
function updateEliteDiamond(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
  const { mote } = ctx;

  enemy.attack2TimerMs -= deltaMs;
  if (enemy.attack2TimerMs <= 0) {
    if (enemy.isInvuln) {
      enemy.isInvuln = false;
      enemy.invulnTimerMs = 0;
      enemy.attack2TimerMs = ELITE_DIAMOND_VULN_MS;
      fireDiamondRing(enemy, ctx, 5, Math.random() * Math.PI * 2); // small burst on re-entry
    } else {
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
}

// ── Nullstone elite — decagon ─────────────────────────────────────────────────
// Passive: strong gravity well pulling player toward self.
// A1: Tendril Swarm  — 10 void tendrils in a ring.
// A2 (one-time): Event Horizon — 20 tendrils + brief invuln + massive explosion (HP < 30%).
function updateEliteNullstone(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  _toPlayerAngle: number,
): void {
  const { mote } = ctx;
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
}

// ── Main dispatcher ───────────────────────────────────────────────────────────

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
      case 'quartz':    updateEliteQuartz   (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'ruby':      updateEliteRuby     (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'sunstone':  updateEliteSunstone (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'citrine':   updateEliteCitrine  (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'iolite':    updateEliteIolite   (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'amethyst':  updateEliteAmethyst (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'diamond':   updateEliteDiamond  (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'nullstone': updateEliteNullstone(enemy, ctx, dt, deltaMs, toPlayerAngle); break;
    }
  }
}
