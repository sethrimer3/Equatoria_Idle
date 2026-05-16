/**
 * rpg-boss-behaviors-late.ts — Movement and attack patterns for bosses 7–12.
 *
 * Extracted from rpg-boss-behaviors.ts to keep individual files under ~300 lines.
 * Called by updateBossBehavior() in rpg-boss-behaviors.ts when bossId >= 7.
 *
 * Returns void — velocities only mutated; caller handles contact damage and
 * position clamp (same contract as bosses 1–6 in rpg-boss-behaviors.ts).
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
import type { BossBehaviorCtx } from './rpg-boss-behaviors-wave';

/**
 * Per-boss (non-wave) movement and attack patterns for bosses 7–12.
 * Called from updateBossBehavior() when bossId >= 7.
 *
 * @param boss     - The boss entity being updated.
 * @param ctx      - Shared context (player mote, dim, projectiles, callbacks).
 * @param dt       - Frame delta in 60fps-frame units.
 * @param dx       - boss-to-player X offset.
 * @param dy       - boss-to-player Y offset.
 * @param dirX     - Normalised X direction toward player.
 * @param dirY     - Normalised Y direction toward player.
 * @param dist     - Distance from boss to player.
 * @param atk1Cd   - Primary attack cooldown for the current phase.
 * @param atk2Cd   - Secondary attack cooldown for the current phase.
 * @param deltaMs  - Raw frame time in milliseconds.
 */
export function updateLateBossBehavior(
  boss: BossEnemy,
  ctx: BossBehaviorCtx,
  dt: number,
  dx: number, dy: number,
  dirX: number, dirY: number,
  dist: number,
  atk1Cd: number, atk2Cd: number,
  deltaMs: number,
): void {
  void dx; void dy; void dist; // used selectively below
  const bossId = boss.bossId;

  if (bossId === 7) {
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
}
