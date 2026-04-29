/**
 * rpg-enemy-updates-basic.ts — Per-frame update logic for Laser and Sapphire enemies.
 *
 * These are the earliest-wave enemy types (Laser: wave 1, Sapphire: wave ~6).
 * Extracted from rpg-enemy-updates.ts to keep that file under ~650 lines.
 *
 * Imports RpgEnemyCtx from rpg-enemy-updates.ts (the interface stays there).
 */

import type { RpgEnemyCtx } from './rpg-enemy-updates';
import type { LaserEnemy, SapphireEnemy, SapphireMissile } from './rpg-types';
import {
  TARGET_FRAME_MS,
  LASER_ATTACK_RADIUS, LASER_DECEL_DURATION_MS, LASER_DASH_SPEED, LASER_DASH_DISTANCE,
  LASER_COOLDOWN_MS, LASER_OVERSHOOT_DAMPING, LASER_OVERSHOOT_STOP,
  LASER_PATROL_SPEED_MAX, LASER_PATROL_DAMPING, LASER_PATROL_TURN_MS,
  LASER_DECEL_FACTOR, ATTACK_TRAIL_CURVE_VARIATION,
  PATROL_TURN_DELAY_MIN_FACTOR, PATROL_TURN_DELAY_RANGE_FACTOR,
  SAPPHIRE_ENEMY_SIZE, SAPPHIRE_PATROL_SPEED, SAPPHIRE_PATROL_TURN_MS,
  SAPPHIRE_MISSILE_CD_MS, SAPPHIRE_MISSILE_JITTER,
  MISSILE_SPEED, MISSILE_SEEK_STR, MISSILE_MAX_SPEED, MISSILE_TRAIL_CAP,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_ENEMY_STRENGTH, FLUID_PROJECTILE_STRENGTH,
  FLUID_LASER_R, FLUID_LASER_G, FLUID_LASER_B,
  FLUID_SAPPH_R, FLUID_SAPPH_G, FLUID_SAPPH_B,
  FLUID_MISSILE_R, FLUID_MISSILE_G, FLUID_MISSILE_B,
  FLUID_MISSILE_STRENGTH,
  SPEED_EPSILON, PLAYER_HIT_RADIUS,
} from './rpg-constants';
import { makeSapphireMissile } from './rpg-factories';

// ── Sapphire enemy system ──────────────────────────────────────────────────────

function spawnMissileFromEnemy(
  enemy: SapphireEnemy,
  ctx: RpgEnemyCtx,
  sapphireMissiles: SapphireMissile[],
): void {
  const { mote, fluid } = ctx;
  const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const dirX = dist > 0.01 ? dx / dist : 0;
  const dirY = dist > 0.01 ? dy / dist : 1;
  sapphireMissiles.push(makeSapphireMissile(
    enemy.x, enemy.y,
    dirX * MISSILE_SPEED, dirY * MISSILE_SPEED,
  ));
  // Inject a gun-fire impulse in the launch direction.
  fluid.addForce({
    x: enemy.x, y: enemy.y,
    vx: dirX * FLUID_VEL_FRAME_TO_PX_S * 2.0,
    vy: dirY * FLUID_VEL_FRAME_TO_PX_S * 2.0,
    r: FLUID_MISSILE_R, g: FLUID_MISSILE_G, b: FLUID_MISSILE_B,
    strength: FLUID_PROJECTILE_STRENGTH * 1.5,
  });
}

export function updateSapphireEnemies(
  enemies: SapphireEnemy[],
  sapphireMissiles: SapphireMissile[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { fluid, dim } = ctx;
  for (const enemy of enemies) {
    // Patrol
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * SAPPHIRE_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * SAPPHIRE_PATROL_SPEED;
      enemy.patrolTimerMs = SAPPHIRE_PATROL_TURN_MS * (0.5 + Math.random() * 0.8);
    }
    enemy.vx *= Math.pow(LASER_PATROL_DAMPING, dt);
    enemy.vy *= Math.pow(LASER_PATROL_DAMPING, dt);
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    // Clamp to bounds
    const half = SAPPHIRE_ENEMY_SIZE / 2;
    if (enemy.x < half)             { enemy.x = half;             enemy.vx =  Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > dim.w  - half)    { enemy.x = dim.w  - half;    enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)             { enemy.y = half;             enemy.vy =  Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > dim.h - half)     { enemy.y = dim.h - half;     enemy.vy = -Math.abs(enemy.vy) * 0.5; }

    // Inject sapphire-enemy movement into fluid.
    const sespd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
    if (sespd > 0.04) {
      fluid.addForce({
        x: enemy.x, y: enemy.y,
        vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_SAPPH_R, g: FLUID_SAPPH_G, b: FLUID_SAPPH_B,
        strength: FLUID_ENEMY_STRENGTH,
      });
    }

    // Missile firing
    enemy.missileTimerMs -= deltaMs;
    if (enemy.missileTimerMs <= 0) {
      spawnMissileFromEnemy(enemy, ctx, sapphireMissiles);
      enemy.missileTimerMs = SAPPHIRE_MISSILE_CD_MS + (Math.random() - 0.5) * SAPPHIRE_MISSILE_JITTER;
    }
  }
}

export function updateSapphireMissiles(
  sapphireMissiles: SapphireMissile[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, fluid, dim } = ctx;
  for (let i = sapphireMissiles.length - 1; i >= 0; i--) {
    const m = sapphireMissiles[i];
    if (m.hp <= 0) { sapphireMissiles.splice(i, 1); continue; }

    // Heat-seeking toward player
    const dx = mote.x - m.x, dy = mote.y - m.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.01) {
      const seekDirX = dx / dist, seekDirY = dy / dist;
      m.vx += seekDirX * MISSILE_SEEK_STR;
      m.vy += seekDirY * MISSILE_SEEK_STR;
    }
    // Cap speed
    const speed = Math.sqrt(m.vx * m.vx + m.vy * m.vy);
    if (speed > MISSILE_MAX_SPEED) {
      m.vx = (m.vx / speed) * MISSILE_MAX_SPEED;
      m.vy = (m.vy / speed) * MISSILE_MAX_SPEED;
    }

    m.x += m.vx * dt; m.y += m.vy * dt;

    // Inject missile motion into fluid every frame — produces the curved
    // heat-seeker trail required by the acceptance criteria.
    fluid.addForce({
      x: m.x, y: m.y,
      vx: m.vx * FLUID_VEL_FRAME_TO_PX_S,
      vy: m.vy * FLUID_VEL_FRAME_TO_PX_S,
      r: FLUID_MISSILE_R, g: FLUID_MISSILE_G, b: FLUID_MISSILE_B,
      strength: FLUID_MISSILE_STRENGTH,
    });

    // Record trail
    m.trailX[m.trailHead] = m.x; m.trailY[m.trailHead] = m.y;
    m.trailHead = (m.trailHead + 1) % MISSILE_TRAIL_CAP;
    if (m.trailCount < MISSILE_TRAIL_CAP) m.trailCount++;

    // Hit player
    if (!m.hasHitPlayer) {
      const pdx = mote.x - m.x, pdy = mote.y - m.y;
      if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        m.hasHitPlayer = true;
        const normDirX = m.vx / (speed + SPEED_EPSILON);
        const normDirY = m.vy / (speed + SPEED_EPSILON);
        ctx.dealDamageToPlayerKnockback(m.atk, normDirX, normDirY);
        sapphireMissiles.splice(i, 1);
        continue;
      }
    }

    // Despawn if far out of bounds
    const margin = 20;
    if (m.x < -margin || m.x > dim.w + margin || m.y < -margin || m.y > dim.h + margin) {
      sapphireMissiles.splice(i, 1);
    }
  }
}

// ── Laser enemy system ─────────────────────────────────────────────────────────

function updateEnemyIdle(enemy: LaserEnemy, ctx: RpgEnemyCtx, dt: number, deltaMs: number): void {
  enemy.patrolTimerMs -= deltaMs;
  if (enemy.patrolTimerMs <= 0) {
    const angle = Math.random() * Math.PI * 2;
    enemy.vx = Math.cos(angle) * LASER_PATROL_SPEED_MAX;
    enemy.vy = Math.sin(angle) * LASER_PATROL_SPEED_MAX;
    enemy.patrolTimerMs = LASER_PATROL_TURN_MS * (PATROL_TURN_DELAY_MIN_FACTOR + Math.random() * PATROL_TURN_DELAY_RANGE_FACTOR);
  }
  const dampFactor = Math.pow(LASER_PATROL_DAMPING, dt);
  enemy.vx *= dampFactor; enemy.vy *= dampFactor;
  enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
  ctx.clampEnemyToBounds(enemy);
  const dx = ctx.mote.x - enemy.x; const dy = ctx.mote.y - enemy.y;
  if (dx * dx + dy * dy < LASER_ATTACK_RADIUS * LASER_ATTACK_RADIUS) {
    enemy.lockedTargetX = ctx.mote.x; enemy.lockedTargetY = ctx.mote.y;
    enemy.phase = 'decelerate'; enemy.phaseElapsedMs = 0;
  }
}

function updateEnemyDecelerate(enemy: LaserEnemy, ctx: RpgEnemyCtx, dt: number, deltaMs: number): void {
  enemy.phaseElapsedMs += deltaMs;
  const dampFactor = Math.pow(LASER_DECEL_FACTOR, dt);
  enemy.vx *= dampFactor; enemy.vy *= dampFactor;
  enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
  ctx.clampEnemyToBounds(enemy);
  if (enemy.phaseElapsedMs >= LASER_DECEL_DURATION_MS) {
    enemy.vx = 0; enemy.vy = 0;
    const dx = enemy.lockedTargetX - enemy.x; const dy = enemy.lockedTargetY - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.1) { enemy.dashDirX = dx / dist; enemy.dashDirY = dy / dist; }
    else { const a = Math.random() * Math.PI * 2; enemy.dashDirX = Math.cos(a); enemy.dashDirY = Math.sin(a); }
    enemy.dashTraveled = 0; enemy.hasHitPlayer = false;
    enemy.phase = 'dash'; enemy.phaseElapsedMs = 0;
    enemy.attackTrail = {
      active: true,
      startX: enemy.x, startY: enemy.y,
      endX: enemy.x + enemy.dashDirX * LASER_DASH_DISTANCE,
      endY: enemy.y + enemy.dashDirY * LASER_DASH_DISTANCE,
      controlAngle: (Math.random() - 0.5) * ATTACK_TRAIL_CURVE_VARIATION,
      trailStartMs: performance.now(), trailEndMs: Infinity,
    };
  }
}

function updateEnemyDash(enemy: LaserEnemy, ctx: RpgEnemyCtx, dt: number, nowMs: number): void {
  const stepDist = LASER_DASH_SPEED * dt;
  enemy.x += enemy.dashDirX * stepDist; enemy.y += enemy.dashDirY * stepDist;
  enemy.dashTraveled += stepDist;
  ctx.clampEnemyToBounds(enemy);
  if (!enemy.hasHitPlayer) {
    const dx = enemy.x - ctx.mote.x; const dy = enemy.y - ctx.mote.y;
    if (dx * dx + dy * dy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
      enemy.hasHitPlayer = true;
      ctx.dealDamageToPlayerKnockback(enemy.atk, enemy.dashDirX, enemy.dashDirY);
    }
  }
  if (enemy.dashTraveled >= LASER_DASH_DISTANCE) {
    enemy.attackTrail.trailEndMs = nowMs;
    enemy.vx = enemy.dashDirX * LASER_DASH_SPEED;
    enemy.vy = enemy.dashDirY * LASER_DASH_SPEED;
    enemy.phase = 'overshoot'; enemy.phaseElapsedMs = 0;
  }
}

function updateEnemyOvershoot(enemy: LaserEnemy, ctx: RpgEnemyCtx, dt: number): void {
  const dampFactor = Math.pow(LASER_OVERSHOOT_DAMPING, dt);
  enemy.vx *= dampFactor; enemy.vy *= dampFactor;
  enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
  ctx.clampEnemyToBounds(enemy);
  if (Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy) < LASER_OVERSHOOT_STOP) {
    enemy.vx = 0; enemy.vy = 0;
    enemy.phase = 'cooldown'; enemy.phaseElapsedMs = 0;
  }
}

function updateEnemyCooldown(enemy: LaserEnemy, deltaMs: number): void {
  enemy.phaseElapsedMs += deltaMs;
  if (enemy.phaseElapsedMs >= LASER_COOLDOWN_MS) { enemy.phase = 'idle'; enemy.phaseElapsedMs = 0; }
}

export function updateLaserEnemies(
  enemies: LaserEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  nowMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { fluid } = ctx;
  for (const enemy of enemies) {
    switch (enemy.phase) {
      case 'idle':       updateEnemyIdle(enemy, ctx, dt, deltaMs);       break;
      case 'decelerate': updateEnemyDecelerate(enemy, ctx, dt, deltaMs); break;
      case 'dash':       updateEnemyDash(enemy, ctx, dt, nowMs);         break;
      case 'overshoot':  updateEnemyOvershoot(enemy, ctx, dt);           break;
      case 'cooldown':   updateEnemyCooldown(enemy, deltaMs);            break;
    }
    // Inject laser-enemy movement into fluid.
    const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
    if (espd > 0.05) {
      fluid.addForce({
        x: enemy.x, y: enemy.y,
        vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_LASER_R, g: FLUID_LASER_G, b: FLUID_LASER_B,
        strength: FLUID_ENEMY_STRENGTH,
      });
    }
  }
}
