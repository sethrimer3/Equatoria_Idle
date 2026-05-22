/**
 * rpg-elite-enemy-updates-late.ts — Per-frame update logic for late elite tiers.
 *
 * Covers tiers: Iolite, Amethyst, Diamond, Nullstone.
 * Extracted from rpg-elite-enemy-updates.ts to keep individual files focused.
 *
 * Each function is called by the dispatcher in rpg-elite-enemy-updates.ts.
 *
 * Elite designs:
 *   Iolite  (7 sides) — Prism Fan: 7 beams in a wide arc; Gravity Well: pulls player 2.5 s.
 *   Amethyst(8 sides) — Crystal Storm: two staggered 8-shard rings; reactive shield burst.
 *   Diamond (9 sides) — Nine-Star burst; phase cycle (invuln orbit ↔ vulnerable patrol).
 *   Nullstone(10 sides)— Tendril Swarm; Event Horizon: 20-tendril ring when HP < 30%.
 */

import type { EliteEnemy } from './rpg-enemy-types';
import {
  NULLSTONE_GRAVITY_STRENGTH, NULLSTONE_GRAVITY_RADIUS,
  ELITE_IOLITE_A1_CD_MS, ELITE_IOLITE_A2_CD_MS, ELITE_IOLITE_GRAVITY_MS, ELITE_IOLITE_GLOW,
  ELITE_AMETHYST_A1_CD_MS, ELITE_AMETHYST_SALVO_MS, ELITE_AMETHYST_SHIELD_REGEN_RATE,
  ELITE_DIAMOND_A1_CD_MS, ELITE_DIAMOND_INVULN_MS, ELITE_DIAMOND_VULN_MS,
  ELITE_NULLSTONE_A1_CD_MS,
  ELITE_IOLITE_RADIUS, ELITE_AMETHYST_RADIUS, ELITE_DIAMOND_RADIUS, ELITE_NULLSTONE_RADIUS,
} from './rpg-enemy-constants';
import {
  type EliteEnemyCtx,
  TIER_FLUID,
  patrolStep,
  eliteFluidExplosion,
  fireShardsRing,
  fireDiamondRing,
  fireTendrilRing,
  FLUID_EXPLOSION_STRENGTH,
} from './rpg-elite-enemy-helpers';
import { applyEnemyTerrainPushOut } from './rpg-enemy-updates';

// ── Iolite elite — heptagon ───────────────────────────────────────────────────
// A1: Prism Fan    — 7 instant beams in a 150° arc aimed at player.
// A2: Gravity Well — pulls player toward self for 2.5 s.
export function updateEliteIolite(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
  const { mote } = ctx;
  patrolStep(enemy, dt);
  ctx.clampEnemyToBounds(enemy);
  applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_IOLITE_RADIUS);

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
export function updateEliteAmethyst(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  _toPlayerAngle: number,
): void {
  patrolStep(enemy, dt);
  ctx.clampEnemyToBounds(enemy);
  applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_AMETHYST_RADIUS);

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
export function updateEliteDiamond(
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
    applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_DIAMOND_RADIUS);
  } else {
    patrolStep(enemy, dt);
    ctx.clampEnemyToBounds(enemy);
    applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_DIAMOND_RADIUS);

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
export function updateEliteNullstone(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  _toPlayerAngle: number,
): void {
  const { mote } = ctx;
  patrolStep(enemy, dt);
  ctx.clampEnemyToBounds(enemy);
  applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_NULLSTONE_RADIUS);

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
