/**
 * rpg-elite-enemy-updates-early.ts — Per-frame update logic for early elite tiers.
 *
 * Covers tiers: Quartz, Ruby, Sunstone, Citrine.
 * Extracted from rpg-elite-enemy-updates.ts to keep individual files focused.
 *
 * Each function is called by the dispatcher in rpg-elite-enemy-updates.ts.
 *
 * Elite designs:
 *   Quartz  (3 sides) — Crystal Salvo: two staggered 3-spike bursts; Crystal Nova: 9-spike ring.
 *   Ruby    (4 sides) — Cardinal Burst: 4 bolts at N/E/S/W; Triple Shot: tight 3-bolt spread.
 *   Sunstone(5 sides) — Star Flare: 5 homing citrine bolts; Corona Pulse: 10-spike ring.
 *   Citrine (6 sides) — Hex Swarm: 6 homing citrine bolts; Laser Hex: 6 instant beams.
 */

import type { EliteEnemy } from './rpg-enemy-types';
import {
  ELITE_QUARTZ_A1_CD_MS, ELITE_QUARTZ_A2_CD_MS, ELITE_QUARTZ_SALVO_MS,
  ELITE_RUBY_A1_CD_MS, ELITE_RUBY_A2_CD_MS,
  ELITE_SUNSTONE_A1_CD_MS, ELITE_SUNSTONE_A2_CD_MS,
  ELITE_CITRINE_A1_CD_MS, ELITE_CITRINE_A2_CD_MS, ELITE_CITRINE_GLOW,
  ELITE_QUARTZ_RADIUS, ELITE_RUBY_RADIUS, ELITE_SUNSTONE_RADIUS, ELITE_CITRINE_RADIUS,
} from './rpg-enemy-constants';
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
  FLUID_EXPLOSION_STRENGTH,
} from './rpg-elite-enemy-helpers';
import { applyEnemyTerrainPushOut } from './rpg-enemy-updates';

// ── Quartz elite — triangle ───────────────────────────────────────────────────
// A1: Crystal Salvo — two staggered 3-spike bursts.
// A2: Crystal Nova  — 9-spike ring + fluid explosion.
export function updateEliteQuartz(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
  patrolStep(enemy, dt);
  ctx.clampEnemyToBounds(enemy);
  applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_QUARTZ_RADIUS);
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
export function updateEliteRuby(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
  patrolStep(enemy, dt);
  ctx.clampEnemyToBounds(enemy);
  applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_RUBY_RADIUS);

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
export function updateEliteSunstone(
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
  applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_SUNSTONE_RADIUS);

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
export function updateEliteCitrine(
  enemy: EliteEnemy,
  ctx: EliteEnemyCtx,
  dt: number,
  deltaMs: number,
  toPlayerAngle: number,
): void {
  const { mote } = ctx;
  patrolStep(enemy, dt);
  ctx.clampEnemyToBounds(enemy);
  applyEnemyTerrainPushOut(enemy, ctx.getTerrainState(), ELITE_CITRINE_RADIUS);

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
