/**
 * rpg-boss-update.ts — Per-frame update logic for the boss enemy and boss projectiles.
 *
 * Extracted from rpg-render.ts to keep that closure manageable. Follows the
 * same context-object pattern used in rpg-enemy-updates.ts: the exported
 * functions receive the boss entity (or projectile array), a BossUpdateCtx
 * containing closure-owned references, and the frame delta in milliseconds.
 *
 * The BossUpdateCtx accessors for let-variables (danmakuSafeZone,
 * playerIFramesMs, isBossWaveActive) use getter/setter callbacks so changes
 * made inside these functions are always reflected back in the closure.
 */

import type { BossEnemy, BossProjectile, DanmakuSafeZone } from './rpg-types';
import type { FluidImpulse } from './rpg-fluid';
import {
  TARGET_FRAME_MS,
  BOSS_SIZE_BASE,
  BOSS_PHASE2_HP_RATIO, BOSS_PHASE3_HP_RATIO, BOSS_PHASE_TRANSITION_MS,
  BOSS_ATTACK1_CD_BASE, BOSS_ATTACK1_CD_P1, BOSS_ATTACK1_CD_P2,
  BOSS_ATTACK2_CD_BASE, BOSS_ATTACK2_CD_P1, BOSS_ATTACK2_CD_P2,
  BOSS_PROJ_SPEED, BOSS_PROJ_SPEED_FAST,
  BOSS_PROJ_LIFE_MS, BOSS_PROJ_SIZE,
  BOSS_COLORS, BOSS_GLOW_COLORS,
  BOSS_GRAV_STRENGTH, BOSS_GRAV_RADIUS,
  BOSS_INVULN_ON_MS, BOSS_INVULN_OFF_MS,
  BOSS_INVULN_ON_P1, BOSS_INVULN_OFF_P1,
  BOSS_INVULN_ON_P2, BOSS_INVULN_OFF_P2,
  BOSS_BOTTOM_SAFE_ZONE_R,
  DANMAKU_TELEPORT_MARGIN, DANMAKU_SAFE_ANGLE_WIDTH,
  DANMAKU_RING_COUNT, DANMAKU_BULLET_SPEED,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_ENEMY_STRENGTH, FLUID_MISSILE_STRENGTH,
  FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B,
  PLAYER_HIT_RADIUS,
  PLAYER_IFRAME_MIN_MS, PLAYER_IFRAME_MAX_ADD_MS,
  PLAYER_KNOCKBACK_MAX,
} from './rpg-constants';
import { makeDanmakuSafeZone } from './rpg-factories';

// ── Shared context interface ───────────────────────────────────────────────────

/**
 * Minimal shared context passed to every boss update function.
 *
 * Mutable closure state (let-variables) is exposed via getter/setter
 * callbacks so writes are visible back in rpg-render.ts without
 * rebuilding the context object on each frame.
 */
export interface BossUpdateCtx {
  /** Player mote — position and velocity (mutable reference). */
  readonly mote: { x: number; y: number; vx: number; vy: number };
  /** Current canvas dimensions — updated on resize via shared object. */
  readonly dim: { w: number; h: number };
  /** Euler fluid simulator — only addForce used by boss update code. */
  readonly fluid: { addForce(impulse: FluidImpulse): void };
  /** Player stats — def read, hp read + written. */
  readonly playerStats: { def: number; hp: number; maxHp: number };
  /** Boss projectile array — pushed to by updateBossEnemy. */
  readonly bossProjectiles: BossProjectile[];
  /** Returns whether a boss wave is currently active. */
  getIsBossWaveActive(): boolean;
  /** Returns the current danmaku safe zone, or null. */
  getDanmakuSafeZone(): DanmakuSafeZone | null;
  /** Overwrites the current danmaku safe zone. */
  setDanmakuSafeZone(dz: DanmakuSafeZone | null): void;
  /** Returns the current player i-frames timer value (ms). */
  getPlayerIFramesMs(): number;
  /** Overwrites the player i-frames timer. */
  setPlayerIFramesMs(n: number): void;
  /** Spawn a floating damage number at the given position. */
  spawnDamageNumber(
    x: number, y: number,
    vx: number, vy: number,
    text: string,
    severity: number,
    color: string,
  ): void;
}

// ── Local helper ──────────────────────────────────────────────────────────────

function isInBottomSafeZone(px: number, py: number, dim: { w: number; h: number }): boolean {
  const dx = px - dim.w / 2, dy = py - dim.h * 0.85;
  return dx * dx + dy * dy <= BOSS_BOTTOM_SAFE_ZONE_R * BOSS_BOTTOM_SAFE_ZONE_R;
}

// ── Boss enemy update ─────────────────────────────────────────────────────────

export function updateBossEnemy(boss: BossEnemy, ctx: BossUpdateCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  boss.pulseMs = (boss.pulseMs + deltaMs) % 3000;
  if (boss.contactCdMs > 0) boss.contactCdMs = Math.max(0, boss.contactCdMs - deltaMs);

  const hpRatio = boss.hp / boss.maxHp;
  const targetPhase: 0|1|2 = hpRatio <= BOSS_PHASE3_HP_RATIO ? 2 : hpRatio <= BOSS_PHASE2_HP_RATIO ? 1 : 0;
  if (targetPhase > boss.phaseIndex) {
    boss.phaseIndex = targetPhase;
    boss.phaseTransitionMs = BOSS_PHASE_TRANSITION_MS;
    // Activate danmaku for phases 1 and 2
    boss.danmakuLevel = targetPhase;
    // Teleport for danmaku phases — pick a random edge position, announce safe zone
    if (boss.danmakuLevel > 0) {
      boss.x = DANMAKU_TELEPORT_MARGIN + Math.random() * (ctx.dim.w - DANMAKU_TELEPORT_MARGIN * 2);
      boss.y = DANMAKU_TELEPORT_MARGIN + Math.random() * (ctx.dim.h * 0.5);
      boss.vx = 0; boss.vy = 0;
      const safeAngle = Math.random() * Math.PI * 2;
      ctx.setDanmakuSafeZone(makeDanmakuSafeZone(boss.x, boss.y, safeAngle, DANMAKU_SAFE_ANGLE_WIDTH));
    }
    const blastCount = 8;
    for (let i = 0; i < blastCount; i++) {
      const angle = (i / blastCount) * Math.PI * 2;
      ctx.fluid.addForce({
        x: boss.x, y: boss.y,
        vx: Math.cos(angle) * FLUID_VEL_FRAME_TO_PX_S * 5,
        vy: Math.sin(angle) * FLUID_VEL_FRAME_TO_PX_S * 5,
        r: FLUID_VOID_R, g: FLUID_VOID_G, b: FLUID_VOID_B,
        strength: 2.5,
      });
    }
  }
  if (boss.phaseTransitionMs > 0) boss.phaseTransitionMs = Math.max(0, boss.phaseTransitionMs - deltaMs);

  const atk1Cd = boss.phaseIndex === 2 ? BOSS_ATTACK1_CD_P2 : boss.phaseIndex === 1 ? BOSS_ATTACK1_CD_P1 : BOSS_ATTACK1_CD_BASE;
  const atk2Cd = boss.phaseIndex === 2 ? BOSS_ATTACK2_CD_P2 : boss.phaseIndex === 1 ? BOSS_ATTACK2_CD_P1 : BOSS_ATTACK2_CD_BASE;
  boss.attackTimerMs -= deltaMs;
  boss.secondaryTimerMs -= deltaMs;

  const bossId = boss.bossId;
  const dx = ctx.mote.x - boss.x, dy = ctx.mote.y - boss.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dirX = dist > 0.01 ? dx / dist : 0;
  const dirY = dist > 0.01 ? dy / dist : 0;
  const bossSize = BOSS_SIZE_BASE + bossId * 1.5;
  const half = bossSize / 2;

  // During a boss wave the boss is pinned to top-middle with gentle side drift
  if (ctx.getIsBossWaveActive()) {
    const targetX = ctx.dim.w / 2 + Math.sin(boss.orbitAngle) * ctx.dim.w * 0.18;
    const targetY = ctx.dim.h * 0.12;
    boss.orbitAngle += 0.006 * dt;
    boss.vx += (targetX - boss.x) * 0.06;
    boss.vy += (targetY - boss.y) * 0.10;
    boss.vx *= 0.82; boss.vy *= 0.82;
    boss.x = Math.max(half, Math.min(ctx.dim.w - half, boss.x + boss.vx * dt));
    boss.y = Math.max(half, Math.min(ctx.dim.h * 0.30, boss.y + boss.vy * dt));
    // Danmaku attack patterns — scale with danmakuLevel
    const dl = boss.danmakuLevel;
    const bulletSpeed = BOSS_PROJ_SPEED * (1.0 + dl * 0.12);
    const bulletSpeedFast = BOSS_PROJ_SPEED_FAST * (1.0 + dl * 0.08);
    const bossColor = BOSS_COLORS[Math.min(bossId, BOSS_COLORS.length - 1)];
    const bossGlow  = BOSS_GLOW_COLORS[Math.min(bossId, BOSS_GLOW_COLORS.length - 1)];
    const seekStr = Math.min(0.025, 0.002 + dl * 0.003);

    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      // Ring burst: number of bullets grows with danmakuLevel
      const ringCount = 6 + dl * 2 + boss.phaseIndex * 4;
      const rotOffset = boss.orbitAngle;
      for (let i = 0; i < ringCount; i++) {
        const a = rotOffset + (i / ringCount) * Math.PI * 2;
        ctx.bossProjectiles.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * bulletSpeed, vy: Math.sin(a) * bulletSpeed,
          atk: boss.atk, hasHitPlayer: false,
          lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: bossColor, glowColor: bossGlow,
          size: BOSS_PROJ_SIZE, seekStr: 0,
        });
      }
      // Second offset ring at danmakuLevel 3+
      if (dl >= 3) {
        const ring2 = 8 + dl;
        const offset2 = Math.PI / ring2;
        for (let i = 0; i < ring2; i++) {
          const a = rotOffset + offset2 + (i / ring2) * Math.PI * 2;
          ctx.bossProjectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(a) * bulletSpeed * 0.8, vy: Math.sin(a) * bulletSpeed * 0.8,
            atk: boss.atk, hasHitPlayer: false,
            lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: bossColor, glowColor: bossGlow,
            size: BOSS_PROJ_SIZE - 1, seekStr: 0,
          });
        }
      }
      // Spiral burst at danmakuLevel 5+
      if (dl >= 5) {
        const spiralCount = 12 + boss.phaseIndex * 3;
        for (let i = 0; i < spiralCount; i++) {
          const a = rotOffset * 2 + (i / spiralCount) * Math.PI * 2;
          const spd = bulletSpeed * (0.7 + (i / spiralCount) * 0.6);
          ctx.bossProjectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
            atk: boss.atk, hasHitPlayer: false,
            lifeMs: BOSS_PROJ_LIFE_MS * 0.9, maxLifeMs: BOSS_PROJ_LIFE_MS * 0.9,
            color: bossGlow, glowColor: bossColor,
            size: BOSS_PROJ_SIZE, seekStr: seekStr * 0.5,
          });
        }
      }
    }

    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      // Aimed cluster toward player
      const aimAngle = Math.atan2(dy, dx);
      const spread = 3 + Math.floor(dl * 0.8);
      for (let i = 0; i < spread; i++) {
        const offset = (i - (spread - 1) / 2) * (0.18 + dl * 0.015);
        const a = aimAngle + offset;
        ctx.bossProjectiles.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * bulletSpeedFast, vy: Math.sin(a) * bulletSpeedFast,
          atk: boss.atk, hasHitPlayer: false,
          lifeMs: BOSS_PROJ_LIFE_MS * 0.7, maxLifeMs: BOSS_PROJ_LIFE_MS * 0.7,
          color: bossGlow, glowColor: bossColor,
          size: BOSS_PROJ_SIZE - 1, seekStr,
        });
      }
    }
    return; // skip the non-boss-wave movement/attack code below
  }


  if (bossId === 1) {
    const preferredDist = 100 + boss.phaseIndex * 20;
    const approachSpd = 0.5 + boss.phaseIndex * 0.15;
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
        const a = (i / count) * Math.PI * 2;
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
          const a = Math.atan2(dirY, dirX) + i * 0.25;
          const life = BOSS_PROJ_LIFE_MS;
          ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
            atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
            color: '#f0e8d8', glowColor: BOSS_GLOW_COLORS[1], size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
        }
      }
    }
  } else if (bossId === 2) {
    const preferredDist = 60 + boss.phaseIndex * 10;
    const speed = 0.9 + boss.phaseIndex * 0.35;
    if (dist > preferredDist) { boss.vx += dirX * speed * 0.25; boss.vy += dirY * speed * 0.25; }
    boss.vx *= 0.92; boss.vy *= 0.92;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const burstCount = 1 + boss.phaseIndex;
      for (let b = 0; b < burstCount; b++) {
        const spread = (b - (burstCount - 1) / 2) * 0.22;
        const a = Math.atan2(dirY, dirX) + spread;
        const spd = BOSS_PROJ_SPEED_FAST * (1 + boss.phaseIndex * 0.2);
        const life = BOSS_PROJ_LIFE_MS * 0.6;
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
    const targetDist = 120 - boss.phaseIndex * 20;
    const orbitSpd = 0.006 + boss.phaseIndex * 0.003;
    boss.orbitAngle += orbitSpd * dt * (2 + boss.phaseIndex);
    const targetX = ctx.mote.x + Math.cos(boss.orbitAngle) * targetDist;
    const targetY = ctx.mote.y + Math.sin(boss.orbitAngle) * targetDist;
    const tdx = targetX - boss.x, tdy = targetY - boss.y;
    const tdist = Math.sqrt(tdx * tdx + tdy * tdy);
    if (tdist > 2) { boss.vx += (tdx / tdist) * 0.6; boss.vy += (tdy / tdist) * 0.6; }
    boss.vx *= 0.88; boss.vy *= 0.88;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const ringCount = 8 + boss.phaseIndex * 4;
      for (let i = 0; i < ringCount; i++) {
        const a = (i / ringCount) * Math.PI * 2;
        const spd = BOSS_PROJ_SPEED * (1.2 + boss.phaseIndex * 0.4);
        const life = BOSS_PROJ_LIFE_MS * 0.8;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: BOSS_COLORS[3], glowColor: BOSS_GLOW_COLORS[3], size: BOSS_PROJ_SIZE, seekStr: 0 });
      }
    }
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      if (boss.phaseIndex >= 1) {
        const ringCount = 8 + boss.phaseIndex * 4;
        for (let i = 0; i < ringCount; i++) {
          const a = (i / ringCount) * Math.PI * 2 + Math.PI / ringCount;
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
      const count = 2 + boss.phaseIndex * 2;
      for (let i = 0; i < count; i++) {
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
          const a = (i / 12) * Math.PI * 2;
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
      const fanCount = 5 + boss.phaseIndex * 2;
      const angleToPlayer = Math.atan2(dirY, dirX);
      const fanSpread = Math.PI / 2.5;
      for (let i = 0; i < fanCount; i++) {
        const a = angleToPlayer - fanSpread / 2 + (i / (fanCount - 1)) * fanSpread;
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
    const speed6 = 0.5 + boss.phaseIndex * 0.15;
    if (dist > preferredDist6 + 20) { boss.vx += dirX * speed6 * 0.2; boss.vy += dirY * speed6 * 0.2; }
    else if (dist < preferredDist6 - 20) { boss.vx -= dirX * speed6 * 0.15; boss.vy -= dirY * speed6 * 0.15; }
    boss.vx *= 0.93; boss.vy *= 0.93;
    if (boss.attackTimerMs <= 0) {
      boss.attackTimerMs = atk1Cd;
      const count6 = 8 + boss.phaseIndex * 4;
      for (let i = 0; i < count6; i++) {
        const a = (i / count6) * Math.PI * 2;
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
      const orbitDist = 110;
      const tx7 = ctx.mote.x + Math.cos(boss.orbitAngle) * orbitDist;
      const ty7 = ctx.mote.y + Math.sin(boss.orbitAngle) * orbitDist;
      const tdx7 = tx7 - boss.x, tdy7 = ty7 - boss.y;
      const td7 = Math.sqrt(tdx7 * tdx7 + tdy7 * tdy7);
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
      const gravStr = BOSS_GRAV_STRENGTH * (1 + boss.phaseIndex * 0.5) * (boss.isAbsorbing ? 2.5 : 1.0);
      ctx.mote.vx -= dirX * gravStr * dist;
      ctx.mote.vy -= dirY * gravStr * dist;
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
        const a = Math.atan2(dirY, dirX) + spread;
        const life = BOSS_PROJ_LIFE_MS * 1.2;
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
        const a = (i / count9) * Math.PI * 2;
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
        const a = Math.atan2(dirY, dirX) + spread;
        const life = BOSS_PROJ_LIFE_MS * 0.8;
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
        const offset = ring * (Math.PI / count10);
        for (let i = 0; i < count10; i++) {
          const a = (i / count10) * Math.PI * 2 + offset;
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
        const a = Math.atan2(dirY, dirX) + (i - (cnt10b - 1) / 2) * 0.18;
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
      const ringCount = DANMAKU_RING_COUNT + boss.phaseIndex * 8;
      const safeAngle = ctx.getDanmakuSafeZone() ? ctx.getDanmakuSafeZone()!.angle : Math.random() * Math.PI * 2;
      const halfSafe = DANMAKU_SAFE_ANGLE_WIDTH / 2;
      for (let i = 0; i < ringCount; i++) {
        const a = (i / ringCount) * Math.PI * 2;
        const aRel = ((a - safeAngle) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (aRel < halfSafe || aRel > Math.PI * 2 - halfSafe) continue;
        const spd = DANMAKU_BULLET_SPEED * (1 + boss.phaseIndex * 0.2);
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd, vy: Math.sin(a) * spd,
          atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS * 1.5, maxLifeMs: BOSS_PROJ_LIFE_MS * 1.5,
          color: BOSS_COLORS[11], glowColor: BOSS_GLOW_COLORS[11], size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
      }
      // After firing, update safe zone for next burst
      ctx.setDanmakuSafeZone(makeDanmakuSafeZone(boss.x, boss.y, safeAngle + Math.PI * 0.6, DANMAKU_SAFE_ANGLE_WIDTH));
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
      const halfSafe12 = DANMAKU_SAFE_ANGLE_WIDTH / 2;
      for (let i = 0; i < ringCount12; i++) {
        const a = (i / ringCount12) * Math.PI * 2;
        const aRel = ((a - safeAngle12) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (aRel < halfSafe12 || aRel > Math.PI * 2 - halfSafe12) continue;
        const spd12 = DANMAKU_BULLET_SPEED * (1.2 + boss.phaseIndex * 0.15);
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * spd12, vy: Math.sin(a) * spd12,
          atk: boss.atk, hasHitPlayer: false, lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: BOSS_COLORS[12], glowColor: BOSS_GLOW_COLORS[12], size: BOSS_PROJ_SIZE - 1, seekStr: 0 });
      }
      ctx.setDanmakuSafeZone(makeDanmakuSafeZone(boss.x, boss.y, safeAngle12 + Math.PI * 0.7, DANMAKU_SAFE_ANGLE_WIDTH));
    }
    // Second attack: aim at player
    if (boss.secondaryTimerMs <= 0) {
      boss.secondaryTimerMs = atk2Cd;
      const aimCount = 3 + boss.phaseIndex * 2;
      for (let i = 0; i < aimCount; i++) {
        const spread = (i - (aimCount - 1) / 2) * 0.22;
        const a = Math.atan2(dirY, dirX) + spread;
        const life = BOSS_PROJ_LIFE_MS * 0.7;
        ctx.bossProjectiles.push({ x: boss.x, y: boss.y, vx: Math.cos(a) * BOSS_PROJ_SPEED_FAST, vy: Math.sin(a) * BOSS_PROJ_SPEED_FAST,
          atk: boss.atk, hasHitPlayer: false, lifeMs: life, maxLifeMs: life,
          color: BOSS_COLORS[12], glowColor: BOSS_GLOW_COLORS[12], size: BOSS_PROJ_SIZE, seekStr: 0.01 });
      }
    }
  }

  // Contact damage
  if (dist < bossSize + PLAYER_HIT_RADIUS + 2 && ctx.getPlayerIFramesMs() <= 0 && boss.contactCdMs <= 0) {
    const rawDmg = boss.atk - ctx.playerStats.def;
    const dmg = Math.max(0, rawDmg);
    if (dmg > 0) {
      ctx.playerStats.hp = Math.max(0, ctx.playerStats.hp - dmg);
      const ratio = Math.min(1, dmg / ctx.playerStats.maxHp);
      ctx.setPlayerIFramesMs(PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS);
      boss.contactCdMs = 800;
      ctx.spawnDamageNumber(ctx.mote.x, ctx.mote.y, -dirX, -dirY, String(Math.round(dmg)), ratio, '#ff6666');
    }
  }

  // Movement clamp + fluid
  boss.x += boss.vx * dt; boss.y += boss.vy * dt;
  if (boss.x < half)              { boss.x = half;              boss.vx =  Math.abs(boss.vx) * 0.5; }
  if (boss.x > ctx.dim.w - half)  { boss.x = ctx.dim.w - half;  boss.vx = -Math.abs(boss.vx) * 0.5; }
  if (boss.y < half)              { boss.y = half;               boss.vy =  Math.abs(boss.vy) * 0.5; }
  if (boss.y > ctx.dim.h - half)  { boss.y = ctx.dim.h - half;  boss.vy = -Math.abs(boss.vy) * 0.5; }
  const espd = Math.sqrt(boss.vx * boss.vx + boss.vy * boss.vy);
  if (espd > 0.04) {
    ctx.fluid.addForce({
      x: boss.x, y: boss.y,
      vx: boss.vx * FLUID_VEL_FRAME_TO_PX_S,
      vy: boss.vy * FLUID_VEL_FRAME_TO_PX_S,
      r: 0.4, g: 0.2, b: 0.8,
      strength: FLUID_ENEMY_STRENGTH * 2.0,
    });
  }
}

// ── Boss projectile update ────────────────────────────────────────────────────

export function updateBossProjectiles(bossProjectiles: BossProjectile[], ctx: BossUpdateCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = bossProjectiles.length - 1; i >= 0; i--) {
    const p = bossProjectiles[i];
    p.lifeMs -= deltaMs;
    if (p.lifeMs <= 0) { bossProjectiles.splice(i, 1); continue; }

    if (p.seekStr > 0) {
      const sdx = ctx.mote.x - p.x, sdy = ctx.mote.y - p.y;
      const sd = Math.sqrt(sdx * sdx + sdy * sdy);
      if (sd > 0.01) { p.vx += (sdx / sd) * p.seekStr; p.vy += (sdy / sd) * p.seekStr; }
      const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy);
      const maxSpd = BOSS_PROJ_SPEED_FAST * 1.5;
      if (spd > maxSpd) { p.vx = (p.vx / spd) * maxSpd; p.vy = (p.vy / spd) * maxSpd; }
    }

    p.x += p.vx * dt; p.y += p.vy * dt;

    // Boss projectiles are destroyed when they enter the bottom safe zone
    if (ctx.getIsBossWaveActive() && isInBottomSafeZone(p.x, p.y, ctx.dim)) {
      bossProjectiles.splice(i, 1); continue;
    }

    ctx.fluid.addForce({
      x: p.x, y: p.y,
      vx: p.vx * FLUID_VEL_FRAME_TO_PX_S,
      vy: p.vy * FLUID_VEL_FRAME_TO_PX_S,
      r: 0.4, g: 0.2, b: 0.8,
      strength: FLUID_MISSILE_STRENGTH * 0.8,
    });

    if (!p.hasHitPlayer) {
      // Player is immune inside the bottom safe zone
      if (ctx.getIsBossWaveActive() && isInBottomSafeZone(ctx.mote.x, ctx.mote.y, ctx.dim)) continue;
      const pdx = ctx.mote.x - p.x, pdy = ctx.mote.y - p.y;
      if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        p.hasHitPlayer = true;
        if (ctx.getPlayerIFramesMs() <= 0) {
          const rawDmg = p.atk - ctx.playerStats.def;
          const dmg = Math.max(0, rawDmg);
          if (dmg <= 0) {
            ctx.spawnDamageNumber(ctx.mote.x, ctx.mote.y, 0, -1, 'BLOCKED', 0.25, '#74c0fc');
          } else {
            ctx.playerStats.hp = Math.max(0, ctx.playerStats.hp - dmg);
            const ratio = Math.min(1, dmg / ctx.playerStats.maxHp);
            const spd = Math.sqrt(p.vx * p.vx + p.vy * p.vy) + 0.01;
            ctx.mote.vx += (p.vx / spd) * PLAYER_KNOCKBACK_MAX * ratio * 0.6;
            ctx.mote.vy += (p.vy / spd) * PLAYER_KNOCKBACK_MAX * ratio * 0.6;
            ctx.setPlayerIFramesMs(PLAYER_IFRAME_MIN_MS + ratio * PLAYER_IFRAME_MAX_ADD_MS);
            ctx.spawnDamageNumber(ctx.mote.x, ctx.mote.y, p.vx / spd, p.vy / spd, String(Math.round(dmg)), ratio, '#ff6666');
          }
        }
        bossProjectiles.splice(i, 1); continue;
      }
    }

    const margin = 30;
    if (p.x < -margin || p.x > ctx.dim.w + margin || p.y < -margin || p.y > ctx.dim.h + margin) {
      bossProjectiles.splice(i, 1);
    }
  }
}
