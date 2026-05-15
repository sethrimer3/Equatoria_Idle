/**
 * rpg-boss-behaviors.ts — Per-boss-ID (non-wave) movement and attack patterns.
 *
 * Extracted from rpg-boss-update.ts to keep that file under ~200 lines.
 * Boss-wave danmaku patterns live in rpg-boss-behaviors-wave.ts.
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
  BOSS_GRAV_STRENGTH, BOSS_GRAV_RADIUS,
  BOSS_INVULN_ON_MS, BOSS_INVULN_OFF_MS,
  BOSS_INVULN_ON_P1, BOSS_INVULN_OFF_P1,
  BOSS_INVULN_ON_P2, BOSS_INVULN_OFF_P2,
  DANMAKU_SAFE_ANGLE_WIDTH,
  DANMAKU_RING_COUNT, DANMAKU_BULLET_SPEED,
} from './rpg-constants';
import { makeDanmakuSafeZone } from './rpg-factories';
import {
  type BossBehaviorCtx,
  updateBossWaveBehavior,
} from './rpg-boss-behaviors-wave';

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
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: BOSS_COLORS[1], glowColor: BOSS_GLOW_COLORS[1], size: BOSS_PROJ_SIZE, seekStr: 0 });
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
  } else if (bossId === 7) {
    const onTime  = boss.phaseIndex === 2 ? BOSS_INVULN_ON_P2  : boss.phaseIndex === 1 ? BOSS_INVULN_ON_P1  : BOSS_INVULN_ON_MS;
    const offTime = boss.phaseIndex === 2 ? BOSS_INVULN_OFF_P2 : boss.phaseIndex === 1 ? BOSS_INVULN_OFF_P1 : BOSS_INVULN_OFF_MS;
    boss.invulnTimerMs -= deltaMs;
    if (boss.invulnTimerMs <= 0) {
      boss.isInvuln = !boss.isInvuln;
      boss.invulnTimerMs = boss.isInvuln ? onTime : offTime;
    }
    if (boss.isInvuln) {
      boss.orbitAngle += 0.01 * dt * (1 + boss.phaseIndex * 0.5);
      const orbitDist7 = 110;
      const tx7        = ctx.mote.x + Math.cos(boss.orbitAngle) * orbitDist7;
      const ty7        = ctx.mote.y + Math.sin(boss.orbitAngle) * orbitDist7;
      const tdx7       = tx7 - boss.x, tdy7 = ty7 - boss.y;
      const td7        = Math.sqrt(tdx7 * tdx7 + tdy7 * tdy7);
      if (td7 > 2) { boss.vx += (tdx7 / td7) * 0.7; boss.vy += (tdy7 / td7) * 0.7; }
    } else {
      if (dist > 40) { boss.vx += dirX * 0.5; boss.vy += dirY * 0.5; }
    }
    boss.vx *= 0.9; boss.vy *= 0.9;
    if (!boss.isInvuln && boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const count7 = 6 + boss.phaseIndex * 3;
      for (let i = 0; i < count7; i++) {
        const a = (i / count7) * Math.PI * 2;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED * 1.5, vy: Math.sin(a) * BOSS_PROJ_SPEED * 1.5,
          atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: BOSS_COLORS[7], glowColor: BOSS_GLOW_COLORS[7], size: BOSS_PROJ_SIZE, seekStr: 0 });
      }
    }
  } else if (bossId === 8) {
    if (dist > 0 && dist < BOSS_GRAV_RADIUS) {
      const gravStr8 = BOSS_GRAV_STRENGTH * (1 + boss.phaseIndex * 0.5) * (boss.isAbsorbing ? 2.5 : 1.0);
      ctx.mote.vx -= dirX * gravStr8 * dist;
      ctx.mote.vy -= dirY * gravStr8 * dist;
    }
    if (boss.phaseIndex >= 2 && !boss.isAbsorbing && dist < BOSS_GRAV_RADIUS) {
      ctx.mote.vx += dirX * BOSS_GRAV_STRENGTH * 0.7 * dist;
      ctx.mote.vy += dirY * BOSS_GRAV_STRENGTH * 0.7 * dist;
    }
    boss.orbitAngle += 0.003 * dt;
    boss.vx += Math.cos(boss.orbitAngle) * 0.08;
    boss.vy += Math.sin(boss.orbitAngle) * 0.08;
    boss.vx *= 0.97; boss.vy *= 0.97;
    boss.absorbTimerMs -= deltaMs;
    if (boss.absorbTimerMs <= 0) {
      boss.isAbsorbing = !boss.isAbsorbing;
      boss.absorbTimerMs = boss.isAbsorbing ? 2500 : 5000;
    }
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const count8 = 3 + boss.phaseIndex * 2;
      for (let i = 0; i < count8; i++) {
        const spread = (i - (count8 - 1) / 2) * 0.3;
        const a      = Math.atan2(dirY, dirX) + spread;
        const life   = BOSS_PROJ_LIFE_MS * 1.2;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED, vy: Math.sin(a) * BOSS_PROJ_SPEED,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: '#4d2280', glowColor: BOSS_GLOW_COLORS[8], size: BOSS_PROJ_SIZE + 1, seekStr: 0.008 });
      }
    }
  } else if (bossId === 9) {
    boss.orbitAngle += 0.012 * dt * (1 + boss.phaseIndex * 0.4);
    boss.vx += Math.cos(boss.orbitAngle) * 0.25 + dirX * 0.15 * boss.phaseIndex;
    boss.vy += Math.sin(boss.orbitAngle) * 0.25 + dirY * 0.15 * boss.phaseIndex;
    boss.vx *= 0.92; boss.vy *= 0.92;
    if (boss.phaseIndex >= 2 && dist < BOSS_GRAV_RADIUS) {
      const gravStr9 = BOSS_GRAV_STRENGTH * 0.8;
      ctx.mote.vx -= dirX * gravStr9 * dist;
      ctx.mote.vy -= dirY * gravStr9 * dist;
    }
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const count9 = 10 + boss.phaseIndex * 4;
      for (let i = 0; i < count9; i++) {
        const a    = (i / count9) * Math.PI * 2;
        const spd9 = i % 2 === 0 ? BOSS_PROJ_SPEED : BOSS_PROJ_SPEED_FAST;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd9, vy: Math.sin(a) * spd9,
          atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: BOSS_COLORS[9], glowColor: BOSS_GLOW_COLORS[9], size: BOSS_PROJ_SIZE, seekStr: 0.005 });
      }
    }
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      const cnt9b = 4 + boss.phaseIndex * 2;
      for (let i = 0; i < cnt9b; i++) {
        const spread = (i - (cnt9b - 1) / 2) * 0.2;
        const a      = Math.atan2(dirY, dirX) + spread;
        const life   = BOSS_PROJ_LIFE_MS * 0.8;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: '#c090ff', glowColor: '#e0c0ff', size: BOSS_PROJ_SIZE - 1, seekStr: 0.02 });
      }
    }
  } else if (bossId === 10) {
    // The Equation Incarnate — multi-ring spiral
    boss.orbitAngle += 0.01 * dt * (1 + boss.phaseIndex * 0.6);
    boss.vx += Math.cos(boss.orbitAngle) * 0.2 + dirX * 0.2;
    boss.vy += Math.sin(boss.orbitAngle) * 0.2 + dirY * 0.2;
    boss.vx *= 0.91; boss.vy *= 0.91;
    if (boss.phaseIndex >= 1 && dist < BOSS_GRAV_RADIUS) {
      ctx.mote.vx -= dirX * BOSS_GRAV_STRENGTH * 0.6 * dist;
      ctx.mote.vy -= dirY * BOSS_GRAV_STRENGTH * 0.6 * dist;
    }
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      for (let ring = 0; ring < 1 + boss.phaseIndex; ring++) {
        const count10 = 8 + ring * 4;
        const offset  = ring * (Math.PI / count10);
        for (let i = 0; i < count10; i++) {
          const a     = (i / count10) * Math.PI * 2 + offset;
          const spd10 = BOSS_PROJ_SPEED * (1 + ring * 0.3);
          ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd10, vy: Math.sin(a) * spd10,
            atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: BOSS_COLORS[10] ?? '#ffd764', glowColor: BOSS_GLOW_COLORS[10] ?? '#ffe599', size: BOSS_PROJ_SIZE, seekStr: 0.006 });
        }
      }
    }
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      const cnt10b = 5 + boss.phaseIndex * 3;
      for (let i = 0; i < cnt10b; i++) {
        const a    = Math.atan2(dirY, dirX) + (i - (cnt10b - 1) / 2) * 0.18;
        const life = BOSS_PROJ_LIFE_MS * 0.6;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST * 1.3, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST * 1.3,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: '#ffe599', glowColor: '#ffffff', size: BOSS_PROJ_SIZE, seekStr: 0.015 });
      }
    }
  } else if (bossId === 11) {
    // Fracteryl Manifestation — fractal burst danmaku with teleport on phase transitions
    boss.orbitAngle += 0.015 * dt * (1 + boss.phaseIndex * 0.5);
    boss.vx += Math.cos(boss.orbitAngle) * 0.3 + dirX * 0.1;
    boss.vy += Math.sin(boss.orbitAngle) * 0.3 + dirY * 0.1;
    boss.vx *= 0.90; boss.vy *= 0.90;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const ringCount11 = DANMAKU_RING_COUNT + boss.phaseIndex * 8;
      const safeAngle11 = ctx.getDanmakuSafeZone() ? ctx.getDanmakuSafeZone()!.angle : Math.random() * Math.PI * 2;
      const halfSafe11  = DANMAKU_SAFE_ANGLE_WIDTH / 2;
      for (let i = 0; i < ringCount11; i++) {
        const a     = (i / ringCount11) * Math.PI * 2;
        const aRel  = ((a - safeAngle11) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (aRel < halfSafe11 || aRel > Math.PI * 2 - halfSafe11) continue;
        const spd11 = DANMAKU_BULLET_SPEED * (1 + boss.phaseIndex * 0.2);
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd11, vy: Math.sin(a) * spd11,
          atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS * 1.5, maxLifeMs: BOSS_PROJ_LIFE_MS * 1.5,
          color: BOSS_COLORS[11], glowColor: BOSS_GLOW_COLORS[11], size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
      }
      ctx.setDanmakuSafeZone(makeDanmakuSafeZone(boss.x, boss.y, safeAngle11 + Math.PI * 0.6, DANMAKU_SAFE_ANGLE_WIDTH));
    }
  } else {
    // bossId === 12: Eigenstein Entity — perpendicular beam walls + danmaku
    boss.orbitAngle += 0.008 * dt * (1 + boss.phaseIndex * 0.4);
    boss.vx += Math.cos(boss.orbitAngle + Math.PI / 2) * 0.25 + dirX * 0.12;
    boss.vy += Math.sin(boss.orbitAngle + Math.PI / 2) * 0.25 + dirY * 0.12;
    boss.vx *= 0.91; boss.vy *= 0.91;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const ringCount12 = DANMAKU_RING_COUNT + boss.phaseIndex * 6;
      const safeAngle12 = ctx.getDanmakuSafeZone() ? ctx.getDanmakuSafeZone()!.angle : Math.random() * Math.PI * 2;
      const halfSafe12  = DANMAKU_SAFE_ANGLE_WIDTH / 2;
      for (let i = 0; i < ringCount12; i++) {
        const a    = (i / ringCount12) * Math.PI * 2;
        const aRel = ((a - safeAngle12) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (aRel < halfSafe12 || aRel > Math.PI * 2 - halfSafe12) continue;
        const spd12 = DANMAKU_BULLET_SPEED * (1.2 + boss.phaseIndex * 0.15);
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd12, vy: Math.sin(a) * spd12,
          atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: BOSS_COLORS[12], glowColor: BOSS_GLOW_COLORS[12], size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
      }
      ctx.setDanmakuSafeZone(makeDanmakuSafeZone(boss.x, boss.y, safeAngle12 + Math.PI * 0.7, DANMAKU_SAFE_ANGLE_WIDTH));
    }
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      const aimCount12 = 3 + boss.phaseIndex * 2;
      for (let i = 0; i < aimCount12; i++) {
        const spread = (i - (aimCount12 - 1) / 2) * 0.22;
        const a      = Math.atan2(dirY, dirX) + spread;
        const life   = BOSS_PROJ_LIFE_MS * 0.7;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: BOSS_COLORS[12], glowColor: BOSS_GLOW_COLORS[12], size: BOSS_PROJ_SIZE, seekStr: 0.01 });
      }
    }
  }

  return false; // velocities only mutated — caller handles contact damage and position clamp
}
