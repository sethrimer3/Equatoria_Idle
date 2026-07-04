/**
 * rpg-boss-update.ts — Per-frame update orchestration for the boss enemy and projectiles.
 *
 * Owns the shared BossUpdateCtx interface and the outer update loop (phase
 * transitions, timer steps, common geometry).  Per-boss-ID movement and attack
 * patterns live in rpg-boss-behaviors.ts (updateBossBehavior).
 *
 * Follows the same context-object pattern used by rpg-enemy-updates.ts: all
 * mutable closure state is accessed via getter/setter lambdas so changes are
 * reflected back in rpg-render.ts without rebuilding the context object.
 */

import type { BossEnemy, BossProjectile, DanmakuSafeZone } from './rpg-enemy-types';
import type { FluidImpulse } from './rpg-fluid';
import type { RpgFieldSpace } from './rpgFieldSpace';
import {
  TARGET_FRAME_MS,
  BOSS_SIZE_BASE,
  BOSS_PHASE2_HP_RATIO, BOSS_PHASE3_HP_RATIO, BOSS_PHASE_TRANSITION_MS,
  BOSS_ATTACK1_CD_BASE, BOSS_ATTACK1_CD_P1, BOSS_ATTACK1_CD_P2,
  BOSS_ATTACK2_CD_BASE, BOSS_ATTACK2_CD_P1, BOSS_ATTACK2_CD_P2,
  BOSS_BOTTOM_SAFE_ZONE_R, BOSS_SAFE_ZONE_Y_FACTOR,
  BOSS_PROJ_SPEED_FAST,
  DANMAKU_TELEPORT_MARGIN, DANMAKU_SAFE_ANGLE_WIDTH,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_ENEMY_STRENGTH, FLUID_MISSILE_STRENGTH,
  FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B,
  PLAYER_HIT_RADIUS,
  PLAYER_IFRAME_MIN_MS, PLAYER_IFRAME_MAX_ADD_MS,
  PLAYER_KNOCKBACK_MAX,
} from './rpg-constants';
import { makeDanmakuSafeZone } from './rpg-factories';
import { updateBossBehavior } from './rpg-boss-behaviors';
import { getBossTempoSyncedLegacyIntervalMs } from '../../data/rpg/boss-tempo-config';
import { isPlayerInBossAttackVoid } from './rpg-boss-attack-void';
import { initializeBossRhythmTimers } from './rpg-boss-rhythm-timers';

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
  /** Returns the current field-space snapshot (arena bounds, etc.). */
  getFieldSpace(): RpgFieldSpace;
  /** Euler fluid simulator — only addForce used by boss update code. */
  readonly fluid: { addForce(impulse: FluidImpulse): void };
  /** Player stats — def read, hp read + written. */
  readonly playerStats: { def: number; hp: number; maxHp: number };
  /** Boss projectile array — pushed to by updateBossEnemy. */
  readonly bossProjectiles: BossProjectile[];
  /** Returns whether a boss wave is currently active. */
  getIsBossWaveActive(): boolean;
  getBossEnemy(): BossEnemy | null;
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

/** Safe-zone test using active arena bounds rather than fixed canvas dimensions. */
function isInBottomSafeZone(
  px: number, py: number,
  ab: { left: number; top: number; right: number; bottom: number; width: number; height: number },
): boolean {
  const cx = (ab.left + ab.right) / 2;
  const cy = ab.top + ab.height * BOSS_SAFE_ZONE_Y_FACTOR;
  const dx = px - cx, dy = py - cy;
  return dx * dx + dy * dy <= BOSS_BOTTOM_SAFE_ZONE_R * BOSS_BOTTOM_SAFE_ZONE_R;
}

// ── Boss enemy update ─────────────────────────────────────────────────────────

export function updateBossEnemy(boss: BossEnemy, ctx: BossUpdateCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  boss.pulseMs = (boss.pulseMs + deltaMs) % 3000;
  boss.rhythmClockMs += deltaMs;
  boss.spawnIntroMs = Math.max(0, boss.spawnIntroMs - deltaMs);
  if (boss.contactCdMs > 0) boss.contactCdMs = Math.max(0, boss.contactCdMs - deltaMs);

  // ── Phase transition ──────────────────────────────────────────────────────
  const hpRatio = boss.hp / boss.maxHp;
  const targetPhase: 0|1|2 = hpRatio <= BOSS_PHASE3_HP_RATIO ? 2 : hpRatio <= BOSS_PHASE2_HP_RATIO ? 1 : 0;
  if (targetPhase > boss.phaseIndex) {
    boss.phaseIndex = targetPhase;
    boss.areRhythmTimersInitialized = false;
    boss.phaseTransitionMs = BOSS_PHASE_TRANSITION_MS;
    boss.danmakuLevel = targetPhase;
    if (boss.danmakuLevel > 0) {
      const ab = ctx.getFieldSpace().activeBounds;
      const xRange = Math.max(0, ab.width  - DANMAKU_TELEPORT_MARGIN * 2);
      const yRange = Math.max(0, ab.height * 0.5 - DANMAKU_TELEPORT_MARGIN);
      boss.x = ab.left + DANMAKU_TELEPORT_MARGIN + Math.random() * xRange;
      boss.y = ab.top  + DANMAKU_TELEPORT_MARGIN + Math.random() * yRange;
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

  // ── Attack cooldown timers ────────────────────────────────────────────────
  const atk1LegacyMs = boss.phaseIndex === 2 ? BOSS_ATTACK1_CD_P2 : boss.phaseIndex === 1 ? BOSS_ATTACK1_CD_P1 : BOSS_ATTACK1_CD_BASE;
  const atk2LegacyMs = boss.phaseIndex === 2 ? BOSS_ATTACK2_CD_P2 : boss.phaseIndex === 1 ? BOSS_ATTACK2_CD_P1 : BOSS_ATTACK2_CD_BASE;
  const atk1Cd = getBossTempoSyncedLegacyIntervalMs(boss.bossId, atk1LegacyMs);
  const atk2Cd = getBossTempoSyncedLegacyIntervalMs(boss.bossId, atk2LegacyMs);
  if (!boss.areRhythmTimersInitialized) {
    initializeBossRhythmTimers(boss, atk1Cd, atk2Cd);
  }
  if (boss.isFiringPaused) {
    initializeBossRhythmTimers(boss, atk1Cd, atk2Cd);
  } else {
    boss.attackTimerMs -= deltaMs;
    boss.secondaryTimerMs -= deltaMs;
  }

  // ── Direction to player ───────────────────────────────────────────────────
  const dx = ctx.mote.x - boss.x, dy = ctx.mote.y - boss.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dirX = dist > 0.01 ? dx / dist : 0;
  const dirY = dist > 0.01 ? dy / dist : 0;
  const bossSize = BOSS_SIZE_BASE + boss.bossId * 1.5;
  const half = bossSize / 2;

  // Dispatch to per-boss behavior — returns true when in boss-wave mode
  // (position was already clamped inside updateBossBehavior).
  if (updateBossBehavior(boss, ctx, dt, dx, dy, dirX, dirY, dist, atk1Cd, atk2Cd, deltaMs)) {
    return;
  }

  // ── Contact damage (non-wave only) ───────────────────────────────────────
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

  // ── Position clamp + fluid impulse (non-wave only) ────────────────────────
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
  const ab = ctx.getFieldSpace().activeBounds;
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

    // Wall bounce — phase 3 quartz boss projectiles
    if ((p.bouncesLeft ?? 0) > 0) {
      let bounced = false;
      if (p.x < ab.left)   { p.x = ab.left;   p.vx =  Math.abs(p.vx); bounced = true; }
      if (p.x > ab.right)  { p.x = ab.right;  p.vx = -Math.abs(p.vx); bounced = true; }
      if (p.y < ab.top)    { p.y = ab.top;     p.vy =  Math.abs(p.vy); bounced = true; }
      if (p.y > ab.bottom) { p.y = ab.bottom;  p.vy = -Math.abs(p.vy); bounced = true; }
      if (bounced) {
        p.bouncesLeft = (p.bouncesLeft ?? 1) - 1;
        // Fade out quickly after bouncing
        p.lifeMs = Math.min(p.lifeMs, 800);
        p.maxLifeMs = 800;
      }
    }

    // Boss projectiles are destroyed when they enter the bottom safe zone
    if (ctx.getIsBossWaveActive() && isInBottomSafeZone(p.x, p.y, ab)) {
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
      if (
        (ctx.getIsBossWaveActive() && isInBottomSafeZone(ctx.mote.x, ctx.mote.y, ab)) ||
        isPlayerInBossAttackVoid(ctx.mote.x, ctx.mote.y, ctx.getBossEnemy())
      ) continue;
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
    if (p.x < ab.left - margin || p.x > ab.right + margin || p.y < ab.top - margin || p.y > ab.bottom + margin) {
      bossProjectiles.splice(i, 1);
    }
  }
}
