/**
 * rpg-boss-behaviors-wave.ts — Boss-wave danmaku attack patterns.
 *
 * Extracted from rpg-boss-behaviors.ts to keep that file focused on
 * per-boss-ID non-wave movement and attack behaviours.
 *
 * Exports:
 *   - BossBehaviorCtx   — shared context interface for both files
 *   - updateBossWaveBehavior — danmaku patterns used in boss-wave fights
 */

import type { BossEnemy, BossProjectile, DanmakuSafeZone } from './rpg-enemy-types';
import {
  BOSS_SIZE_BASE,
  BOSS_PROJ_SPEED, BOSS_PROJ_SPEED_FAST,
  BOSS_PROJ_LIFE_MS, BOSS_PROJ_SIZE,
  BOSS_COLORS, BOSS_GLOW_COLORS,
} from './rpg-constants';

// ── Shared context interface ──────────────────────────────────────────────────

/**
 * Subset of BossUpdateCtx that boss behaviour functions actually use.
 * Avoids a circular import with rpg-boss-update.ts.
 */
export interface BossBehaviorCtx {
  /** Player mote position and velocity (mutable). */
  readonly mote: { x: number; y: number; vx: number; vy: number };
  /** Current canvas dimensions. */
  readonly dim: { w: number; h: number };
  /** Boss projectile array — pushed to by attack patterns. */
  readonly bossProjectiles: BossProjectile[];
  /** Whether a boss-wave fight is currently active. */
  getIsBossWaveActive(): boolean;
  /** Current danmaku safe zone (null when none). */
  getDanmakuSafeZone(): DanmakuSafeZone | null;
  /** Overwrite the current danmaku safe zone. */
  setDanmakuSafeZone(dz: DanmakuSafeZone | null): void;
}

// ── Boss-wave danmaku behaviour ───────────────────────────────────────────────

/**
 * Updates the boss while in boss-wave mode: repositions it at the top of the
 * arena, fires danmaku patterns (flower ring, spiral burst, star formation),
 * and fires a secondary aimed fan.
 *
 * Mutates `boss` position/velocity and pushes to `ctx.bossProjectiles`.
 *
 * @param boss     - The boss entity being updated.
 * @param ctx      - Shared context (mote, dim, projectiles, safe-zone accessors).
 * @param dt       - Frame delta in 60fps-frame units (deltaMs / TARGET_FRAME_MS).
 * @param dx       - boss-to-player X offset.
 * @param dy       - boss-to-player Y offset.
 * @param atk1Cd   - Primary attack cooldown for the current danmaku phase.
 * @param atk2Cd   - Secondary attack cooldown.
 * @param deltaMs  - Raw frame time in milliseconds.
 */
export function updateBossWaveBehavior(
  boss: BossEnemy,
  ctx: BossBehaviorCtx,
  dt: number,
  dx: number, dy: number,
  atk1Cd: number, atk2Cd: number,
): void {
  const bossId  = boss.bossId;
  const half    = (BOSS_SIZE_BASE + bossId * 1.5) / 2;

  // Position boss at top of arena, orbiting horizontally
  const targetX = ctx.dim.w / 2 + Math.sin(boss.orbitAngle) * ctx.dim.w * 0.18;
  const targetY = ctx.dim.h * 0.12;
  boss.orbitAngle += 0.006 * dt;
  boss.vx += (targetX - boss.x) * 0.06;
  boss.vy += (targetY - boss.y) * 0.10;
  boss.vx *= 0.82; boss.vy *= 0.82;
  boss.x = Math.max(half, Math.min(ctx.dim.w - half, boss.x + boss.vx * dt));
  boss.y = Math.max(half, Math.min(ctx.dim.h * 0.30, boss.y + boss.vy * dt));

  const dl = boss.danmakuLevel;
  const bulletSpeed     = BOSS_PROJ_SPEED      * (1.0 + dl * 0.12);
  const bulletSpeedFast = BOSS_PROJ_SPEED_FAST * (1.0 + dl * 0.08);
  const bossColor = BOSS_COLORS[Math.min(bossId, BOSS_COLORS.length - 1)];
  const bossGlow  = BOSS_GLOW_COLORS[Math.min(bossId, BOSS_GLOW_COLORS.length - 1)];
  const seekStr = Math.min(0.025, 0.002 + dl * 0.003);

  // ── Primary attack: cycling danmaku pattern ─────────────────────────────────
  if (boss.attackTimerMs <= 0) {
    boss.attackTimerMs = atk1Cd;
    boss.isFiringPaused = false;
    const rotOffset   = boss.orbitAngle;
    const patternType = (Math.floor(boss.pulseMs / 3000) + boss.phaseIndex) % 3;

    if (patternType === 0) {
      // ── Flower ring: petal-shaped speed variation ────────────────────────────
      const petalCount = 6 + dl * 2 + boss.phaseIndex * 4;
      for (let i = 0; i < petalCount; i++) {
        const a           = rotOffset + (i / petalCount) * Math.PI * 2;
        const petalFactor = 0.8 + 0.4 * Math.abs(Math.sin(i * Math.PI * 2 / 6));
        ctx.bossProjectiles.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * bulletSpeed * petalFactor,
          vy: Math.sin(a) * bulletSpeed * petalFactor,
          atk: boss.atk, hasHitPlayer: false,
          lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: bossColor, glowColor: bossGlow, size: BOSS_PROJ_SIZE, seekStr: 0,
        });
      }
      if (dl >= 1) {
        const innerOffset = Math.PI / petalCount;
        for (let i = 0; i < petalCount; i++) {
          const a = rotOffset + innerOffset + (i / petalCount) * Math.PI * 2;
          ctx.bossProjectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(a) * bulletSpeed * 0.65,
            vy: Math.sin(a) * bulletSpeed * 0.65,
            atk: boss.atk, hasHitPlayer: false,
            lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: bossGlow, glowColor: bossColor, size: BOSS_PROJ_SIZE - 1, seekStr: 0,
          });
        }
      }
    } else if (patternType === 1) {
      // ── Spiral burst: counter-rotating double spiral ─────────────────────────
      const spiralCount = Math.max(8, 10 + dl * 3 + boss.phaseIndex * 4);
      const turns       = 1 + boss.phaseIndex * 0.5;
      for (let i = 0; i < spiralCount; i++) {
        const t = i / spiralCount;
        const a = rotOffset + t * Math.PI * 2 * turns;
        ctx.bossProjectiles.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(a) * bulletSpeed * (0.6 + t * 0.8),
          vy: Math.sin(a) * bulletSpeed * (0.6 + t * 0.8),
          atk: boss.atk, hasHitPlayer: false,
          lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
          color: bossColor, glowColor: bossGlow, size: BOSS_PROJ_SIZE, seekStr: 0,
        });
      }
      if (dl >= 1) {
        const cCount = Math.max(6, 8 + dl * 2);
        for (let i = 0; i < cCount; i++) {
          const t = i / cCount;
          const a = -rotOffset + t * Math.PI * 2 * turns;
          ctx.bossProjectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(a) * bulletSpeed * (0.5 + t * 0.7),
            vy: Math.sin(a) * bulletSpeed * (0.5 + t * 0.7),
            atk: boss.atk, hasHitPlayer: false,
            lifeMs: BOSS_PROJ_LIFE_MS * 0.8, maxLifeMs: BOSS_PROJ_LIFE_MS * 0.8,
            color: bossGlow, glowColor: bossColor, size: BOSS_PROJ_SIZE - 1, seekStr: 0,
          });
        }
      }
    } else {
      // ── Star formation: multi-point star ─────────────────────────────────────
      const starPoints    = 4 + dl + boss.phaseIndex * 2;
      const spikesPerPoint = 2 + dl;
      for (let p = 0; p < starPoints; p++) {
        const baseAngle = rotOffset + (p / starPoints) * Math.PI * 2;
        for (let s = 0; s < spikesPerPoint; s++) {
          const spread = 0.15 * (spikesPerPoint - 1);
          const a = baseAngle + (s - (spikesPerPoint - 1) / 2) * spread / spikesPerPoint;
          ctx.bossProjectiles.push({
            x: boss.x, y: boss.y,
            vx: Math.cos(a) * bulletSpeed * (0.9 + s * 0.15),
            vy: Math.sin(a) * bulletSpeed * (0.9 + s * 0.15),
            atk: boss.atk, hasHitPlayer: false,
            lifeMs: BOSS_PROJ_LIFE_MS, maxLifeMs: BOSS_PROJ_LIFE_MS,
            color: bossColor, glowColor: bossGlow, size: BOSS_PROJ_SIZE, seekStr: 0,
          });
        }
      }
    }
  }

  // ── Secondary attack: aimed fan toward player ───────────────────────────────
  if (boss.secondaryTimerMs <= 0) {
    boss.secondaryTimerMs = atk2Cd;
    const aimAngle = Math.atan2(dy, dx);
    const spread   = 3 + Math.floor(dl * 0.7);
    const fanWidth = 0.40 + dl * 0.04;
    for (let i = 0; i < spread; i++) {
      const t = spread > 1 ? i / (spread - 1) : 0.5;
      const a = aimAngle + (t - 0.5) * fanWidth;
      ctx.bossProjectiles.push({
        x: boss.x, y: boss.y,
        vx: Math.cos(a) * bulletSpeedFast * (0.85 + t * 0.3),
        vy: Math.sin(a) * bulletSpeedFast * (0.85 + t * 0.3),
        atk: boss.atk, hasHitPlayer: false,
        lifeMs: BOSS_PROJ_LIFE_MS * 0.75, maxLifeMs: BOSS_PROJ_LIFE_MS * 0.75,
        color: bossGlow, glowColor: bossColor, size: BOSS_PROJ_SIZE - 1, seekStr,
      });
    }
    if (boss.phaseIndex >= 2) {
      const perpAngle = aimAngle + Math.PI / 2;
      for (let side = -1; side <= 1; side += 2) {
        ctx.bossProjectiles.push({
          x: boss.x, y: boss.y,
          vx: Math.cos(perpAngle + side * 0.3) * bulletSpeedFast * 0.9,
          vy: Math.sin(perpAngle + side * 0.3) * bulletSpeedFast * 0.9,
          atk: boss.atk, hasHitPlayer: false,
          lifeMs: BOSS_PROJ_LIFE_MS * 0.6, maxLifeMs: BOSS_PROJ_LIFE_MS * 0.6,
          color: bossColor, glowColor: bossGlow, size: BOSS_PROJ_SIZE, seekStr: seekStr * 0.3,
        });
      }
    }
  }
}
