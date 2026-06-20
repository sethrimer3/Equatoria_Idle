/**
 * rpg-boss-behaviors.ts — Per-boss-ID (non-wave) movement and attack patterns for bosses 1–6.
 *
 * Extracted from rpg-boss-update.ts to keep that file under ~200 lines.
 * Boss-wave danmaku patterns live in rpg-boss-behaviors-wave.ts.
 * Bosses 7–12 live in rpg-boss-behaviors-late.ts.
 *
 * The single exported function `updateBossBehavior` returns `true` when the
 * boss is in boss-wave mode (position already updated in rpg-boss-behaviors-wave)
 * and `false` otherwise (caller applies the generic position clamp + fluid step).
 */

import type { BossEnemy } from './rpg-enemy-types';
import {
  BOSS_PROJ_SPEED, BOSS_PROJ_SPEED_FAST,
  BOSS_PROJ_LIFE_MS, BOSS_PROJ_SIZE,
  BOSS_COLORS, BOSS_GLOW_COLORS,
} from './rpg-constants';
import {
  type BossBehaviorCtx,
  updateBossWaveBehavior,
} from './rpg-boss-behaviors-wave';
import { updateLateBossBehavior } from './rpg-boss-behaviors-late';

// Re-export the shared context type so existing importers stay compatible.
export type { BossBehaviorCtx };

// ── Boss behavior dispatch ────────────────────────────────────────────────────

/**
 * Applies per-boss movement, attack patterns, and (in boss-wave mode) position
 * updates for one frame.
 *
 * Returns `true` when the boss is in boss-wave mode — the boss position has
 * already been clamped in rpg-boss-behaviors-wave and the caller must skip the
 * generic contact-damage and movement-clamp steps.
 *
 * Returns `false` for normal (non-wave) encounters — only velocities have been
 * mutated; the caller applies contact damage and the movement clamp.
 *
 * @param boss     - The boss entity being updated.
 * @param ctx      - Minimal shared context (player mote, dim, projectiles, callbacks).
 * @param dt       - Frame delta in 60fps-frame units (deltaMs / TARGET_FRAME_MS, clamped to 3).
 * @param dx       - boss-to-player X offset.
 * @param dy       - boss-to-player Y offset.
 * @param dirX     - Normalised X direction toward player.
 * @param dirY     - Normalised Y direction toward player.
 * @param dist     - Distance from boss to player.
 * @param atk1Cd   - Primary attack cooldown for the current phase.
 * @param atk2Cd   - Secondary attack cooldown for the current phase.
 * @param deltaMs  - Raw frame time in milliseconds (for timer updates).
 */
export function updateBossBehavior(
  boss: BossEnemy,
  ctx: BossBehaviorCtx,
  dt: number,
  dx: number, dy: number,
  dirX: number, dirY: number,
  dist: number,
  atk1Cd: number, atk2Cd: number,
  deltaMs: number,
): boolean {
  const bossId = boss.bossId;

  // ── Boss-wave mode: danmaku patterns (delegated to rpg-boss-behaviors-wave) ──
  if (ctx.getIsBossWaveActive()) {
    updateBossWaveBehavior(boss, ctx, dt, dx, dy, atk1Cd, atk2Cd);
    return true; // position already updated — skip contact damage and movement clamp
  }

  // ── Non-wave: per-boss-ID movement and attack patterns ───────────────────────

  if (bossId === 1) {
    const preferredDist = 100 + boss.phaseIndex * 20;
    const approachSpd   = 0.5 + boss.phaseIndex * 0.15;
    if (dist > preferredDist + 20) { boss.vx += dirX * approachSpd * 0.15; boss.vy += dirY * approachSpd * 0.15; }
    else if (dist < preferredDist - 20) { boss.vx -= dirX * approachSpd * 0.1; boss.vy -= dirY * approachSpd * 0.1; }
    boss.orbitAngle += 0.008 * dt * (1 + boss.phaseIndex * 0.5);
    boss.vx += Math.cos(boss.orbitAngle) * 0.05;
    boss.vy += Math.sin(boss.orbitAngle) * 0.05;
    boss.vx *= 0.95; boss.vy *= 0.95;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const count = 6 + boss.phaseIndex * 3;
      for (let i = 0; i < count; i++) {
        const a   = (i / count) * Math.PI * 2;
        const spd = BOSS_PROJ_SPEED * (1 + boss.phaseIndex * 0.3);
        ctx.bossProjectiles.push({
          x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: BOSS_COLORS[1], glowColor: BOSS_GLOW_COLORS[1], size: BOSS_PROJ_SIZE, seekStr: 0,
          lengthScale: boss.phaseIndex >= 1 ? 4 : undefined,
          bouncesLeft: boss.phaseIndex >= 2 ? 1 : undefined,
        });
      }
    }
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      if (boss.phaseIndex >= 1) {
        for (let i = -1; i <= 1; i++) {
          const a    = Math.atan2(dirY, dirX) + i * 0.25;
          const life = BOSS_PROJ_LIFE_MS;
          ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: '#f0e8d8', glowColor: BOSS_GLOW_COLORS[1], size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
        }
      }
    }
  } else if (bossId === 2) {
    const preferredDist2 = 60 + boss.phaseIndex * 10;
    const speed2         = 0.9 + boss.phaseIndex * 0.35;
    if (dist > preferredDist2) { boss.vx += dirX * speed2 * 0.25; boss.vy += dirY * speed2 * 0.25; }
    boss.vx *= 0.92; boss.vy *= 0.92;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const burstCount = 1 + boss.phaseIndex;
      for (let b = 0; b < burstCount; b++) {
        const spread = (b - (burstCount - 1) / 2) * 0.22;
        const a      = Math.atan2(dirY, dirX) + spread;
        const spd    = BOSS_PROJ_SPEED_FAST * (1 + boss.phaseIndex * 0.2);
        const life   = BOSS_PROJ_LIFE_MS * 0.6;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: BOSS_COLORS[2], glowColor: BOSS_GLOW_COLORS[2], size: BOSS_PROJ_SIZE - 1, seekStr: 0.012 });
      }
    }
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      if (boss.phaseIndex >= 1 && dist > 30) {
        boss.vx = dirX * (8 + boss.phaseIndex * 4);
        boss.vy = dirY * (8 + boss.phaseIndex * 4);
      }
    }
  } else if (bossId === 3) {
    const targetDist3 = 120 - boss.phaseIndex * 20;
    const orbitSpd3   = 0.006 + boss.phaseIndex * 0.003;
    boss.orbitAngle += orbitSpd3 * dt * (2 + boss.phaseIndex);
    const targetX3 = ctx.mote.x + Math.cos(boss.orbitAngle) * targetDist3;
    const targetY3 = ctx.mote.y + Math.sin(boss.orbitAngle) * targetDist3;
    const tdx3     = targetX3 - boss.x, tdy3 = targetY3 - boss.y;
    const tdist3   = Math.sqrt(tdx3 * tdx3 + tdy3 * tdy3);
    if (tdist3 > 2) { boss.vx += (tdx3 / tdist3) * 0.6; boss.vy += (tdy3 / tdist3) * 0.6; }
    boss.vx *= 0.88; boss.vy *= 0.88;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const ringCount3 = 8 + boss.phaseIndex * 4;
      for (let i = 0; i < ringCount3; i++) {
        const a    = (i / ringCount3) * Math.PI * 2;
        const spd  = BOSS_PROJ_SPEED * (1.2 + boss.phaseIndex * 0.4);
        const life = BOSS_PROJ_LIFE_MS * 0.8;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: BOSS_COLORS[3], glowColor: BOSS_GLOW_COLORS[3], size: BOSS_PROJ_SIZE, seekStr: 0 });
      }
    }
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      if (boss.phaseIndex >= 1) {
        const ringCount3b = 8 + boss.phaseIndex * 4;
        for (let i = 0; i < ringCount3b; i++) {
          const a    = (i / ringCount3b) * Math.PI * 2 + Math.PI / ringCount3b;
          const life = BOSS_PROJ_LIFE_MS * 0.7;
          ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED * 1.4, vy: Math.sin(a) * BOSS_PROJ_SPEED * 1.4,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: '#ffcc88', glowColor: '#ffe0aa', size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
        }
      }
    }
  } else if (bossId === 4) {
    boss.orbitAngle += 0.015 * dt;
    boss.vx += Math.cos(boss.orbitAngle) * 0.3 + dirX * 0.1;
    boss.vy += Math.sin(boss.orbitAngle) * 0.3 + dirY * 0.1;
    boss.vx *= 0.93; boss.vy *= 0.93;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const count4 = 2 + boss.phaseIndex * 2;
      for (let i = 0; i < count4; i++) {
        const spread = (Math.random() - 0.5) * 0.6;
        const a = Math.atan2(dirY, dirX) + spread;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED * 1.2, vy: Math.sin(a) * BOSS_PROJ_SPEED * 1.2,
          atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: BOSS_COLORS[4], glowColor: BOSS_GLOW_COLORS[4], size: BOSS_PROJ_SIZE - 1, seekStr: 0.03 + boss.phaseIndex * 0.01 });
      }
    }
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      if (boss.phaseIndex >= 1) {
        for (let i = 0; i < 12; i++) {
          const a    = (i / 12) * Math.PI * 2;
          const life = BOSS_PROJ_LIFE_MS * 0.7;
          ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: '#f0d870', glowColor: BOSS_GLOW_COLORS[4], size: BOSS_PROJ_SIZE, seekStr: 0 });
        }
      }
    }
  } else if (bossId === 5) {
    const speed5 = (0.25 + boss.phaseIndex * 0.3) * (boss.phaseIndex >= 2 ? 2.0 : 1.0);
    if (dist > 40) { boss.vx += dirX * speed5 * 0.2; boss.vy += dirY * speed5 * 0.2; }
    boss.vx *= 0.94; boss.vy *= 0.94;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const fanCount5   = 5 + boss.phaseIndex * 2;
      const angleToPlayer = Math.atan2(dirY, dirX);
      const fanSpread5    = Math.PI / 2.5;
      for (let i = 0; i < fanCount5; i++) {
        const a    = angleToPlayer - fanSpread5 / 2 + (i / (fanCount5 - 1)) * fanSpread5;
        const life = BOSS_PROJ_LIFE_MS * 0.5;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST * 1.3, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST * 1.3,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: BOSS_COLORS[5], glowColor: BOSS_GLOW_COLORS[5], size: BOSS_PROJ_SIZE + 1, seekStr: 0 });
      }
    }
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      if (boss.phaseIndex >= 2) {
        boss.vx = dirX * 12; boss.vy = dirY * 12;
      }
    }
  } else if (bossId === 6) {
    const preferredDist6 = 90 + boss.phaseIndex * 15;
    const speed6         = 0.5 + boss.phaseIndex * 0.15;
    if (dist > preferredDist6 + 20) { boss.vx += dirX * speed6 * 0.2; boss.vy += dirY * speed6 * 0.2; }
    else if (dist < preferredDist6 - 20) { boss.vx -= dirX * speed6 * 0.15; boss.vy -= dirY * speed6 * 0.15; }
    boss.vx *= 0.93; boss.vy *= 0.93;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const count6 = 8 + boss.phaseIndex * 4;
      for (let i = 0; i < count6; i++) {
        const a    = (i / count6) * Math.PI * 2;
        const life = BOSS_PROJ_LIFE_MS * 0.9;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED * 1.3, vy: Math.sin(a) * BOSS_PROJ_SPEED * 1.3,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: BOSS_COLORS[6], glowColor: BOSS_GLOW_COLORS[6], size: BOSS_PROJ_SIZE, seekStr: 0 });
      }
    }
    if (boss.phaseIndex >= 1 && boss.shieldHp < boss.maxShieldHp) {
      boss.shieldHp = Math.min(boss.maxShieldHp, boss.shieldHp + deltaMs * 0.8);
    }
  } else {
    // Bosses 7–12: delegated to rpg-boss-behaviors-late.ts
    updateLateBossBehavior(boss, ctx, dt, dx, dy, dirX, dirY, dist, atk1Cd, atk2Cd, deltaMs);
  }

  return false; // velocities only mutated — caller handles contact damage and position clamp
}
