/**
 * rpg-enemy-updates.ts — Per-frame update logic for early-wave non-boss, non-laser enemy types.
 *
 * Each function is a pure transformation over its own entity arrays plus a
 * shared RpgEnemyCtx that holds the handful of cross-cutting references
 * (player position, canvas dimensions, fluid, callback delegates).
 *
 * Extracted from rpg-render.ts Phase 5 to keep that closure under ~5,500 lines
 * and give each enemy system a navigable, self-contained home.
 *
 * Sections (in wave-unlock order):
 *   - Emerald (wave 9)
 *   - Amber (wave 12)
 *   - Void (wave 15)
 *
 * Mid-wave types (Quartz, Ruby, Sunstone, Citrine) are in rpg-enemy-updates-mid.ts.
 * Advanced types (Iolite+) are in rpg-enemy-updates-adv.ts.
 * Earliest types (Laser, Sapphire) are in rpg-enemy-updates-basic.ts.
 */

import type {
  HitEffect, ShotLine,
} from './rpg-types';
import type {
  EmeraldEnemy,
  AmberEnemy, AmberShard,
  VoidEnemy,
} from './rpg-enemy-types';
import type { FluidImpulse } from './rpg-fluid';
import {
  TARGET_FRAME_MS,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_ENEMY_STRENGTH, FLUID_PROJECTILE_STRENGTH,
  FLUID_EMERALD_R, FLUID_EMERALD_G, FLUID_EMERALD_B,
  FLUID_AMBER_R, FLUID_AMBER_G, FLUID_AMBER_B,
  FLUID_VOID_R, FLUID_VOID_G, FLUID_VOID_B,
  FLUID_MISSILE_STRENGTH,
  SPEED_EPSILON,
  PLAYER_HIT_RADIUS,
} from './rpg-constants';
import {
  EMERALD_PATROL_SPEED, EMERALD_PATROL_TURN_MS, EMERALD_PATROL_DAMPING,
  EMERALD_ATTACK_RADIUS, EMERALD_CHARGE_MS, EMERALD_BLINK_OFFSET, EMERALD_COOLDOWN_MS,
  EMERALD_GHOST_FADE_MS, EMERALD_ENEMY_SIZE,
  AMBER_PATROL_SPEED, AMBER_PATROL_TURN_MS, AMBER_PATROL_DAMPING,
  AMBER_MISSILE_CD_MS, AMBER_MISSILE_JITTER,
  AMBER_SHARD_COUNT, AMBER_SHARD_SPREAD_RAD, AMBER_SHARD_SPEED,
  AMBER_SHARD_SEEK_STR, AMBER_SHARD_MAX_SPEED, AMBER_SHARD_TRAIL_CAP,
  AMBER_ENEMY_SIZE,
  VOID_PURSUE_SPEED, VOID_CONTACT_RADIUS, VOID_CONTACT_CD_MS,
  VOID_AURA_PULSE_MS, VOID_ENEMY_SIZE,
} from './rpg-enemy-constants';
import {
  makeAmberShard,
} from './rpg-factories';
import {
  segmentIntersectsTopographicTerrain,
  type TopographicTerrainState,
} from './terrain/topographic-terrain';

// ── Shared context interface ───────────────────────────────────────────────────

/**
 * Minimal shared context passed to every enemy update function.
 *
 * All fields are object references or callbacks captured by the
 * createRpgRender closure, so they always reflect current closure state.
 * `dim` is an object kept in sync with the closure's widthPx / heightPx
 * on every resize(), so reading `ctx.dim.w` is always current.
 */
export interface RpgEnemyCtx {
  /** Player mote — position and velocity (mutable reference). */
  readonly mote: { x: number; y: number; vx: number; vy: number };
  /** Current canvas dimensions — updated on resize via shared object. */
  readonly dim: { w: number; h: number };
  /** Euler fluid simulator — only addForce used by enemy update code. */
  readonly fluid: { addForce(impulse: FluidImpulse): void };
  /** Hit-flash effect array — pushed to by some enemy systems. */
  readonly hitEffects: HitEffect[];
  /** Shot-line visual array — pushed to by Iolite beams. */
  readonly shotLines: ShotLine[];
  /** Deal standard (no-knockback) damage to the player. Handles iframes. */
  dealDamageToPlayer(atk: number): void;
  /**
   * Deal knockback-carrying damage to the player (used only by Amber shards).
   * @param atk - raw attack value
   * @param normDirX - normalised knockback/damage-number direction X
   * @param normDirY - normalised knockback/damage-number direction Y
   */
  dealDamageToPlayerKnockback(atk: number, normDirX: number, normDirY: number): void;
  /** Clamp an entity within canvas bounds, reversing velocity on each axis. */
  clampEnemyToBounds(e: { x: number; y: number; vx: number; vy: number }): void;
  /** Returns the current topographic terrain state, or null if none is active. */
  getTerrainState(): TopographicTerrainState | null;
}

// ── Emerald enemy system (blink-striker) ──────────────────────────────────────

export function updateEmeraldEnemies(
  enemies: EmeraldEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim, fluid } = ctx;
  for (const enemy of enemies) {
    // Fade ghost afterimage
    if (enemy.ghostAlpha > 0) {
      enemy.ghostAlpha = Math.max(0, enemy.ghostAlpha - deltaMs / EMERALD_GHOST_FADE_MS);
    }

    if (enemy.phase === 'patrol') {
      // Random patrol movement
      enemy.patrolTimerMs -= deltaMs;
      if (enemy.patrolTimerMs <= 0) {
        const angle = Math.random() * Math.PI * 2;
        enemy.vx = Math.cos(angle) * EMERALD_PATROL_SPEED;
        enemy.vy = Math.sin(angle) * EMERALD_PATROL_SPEED;
        enemy.patrolTimerMs = EMERALD_PATROL_TURN_MS * (0.5 + Math.random() * 0.8);
      }
      const dampFactor = Math.pow(EMERALD_PATROL_DAMPING, dt);
      enemy.vx *= dampFactor; enemy.vy *= dampFactor;
      enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
      // Clamp
      const half = EMERALD_ENEMY_SIZE / 2;
      if (enemy.x < half)            { enemy.x = half;            enemy.vx =  Math.abs(enemy.vx) * 0.5; }
      if (enemy.x > dim.w - half)    { enemy.x = dim.w - half;    enemy.vx = -Math.abs(enemy.vx) * 0.5; }
      if (enemy.y < half)            { enemy.y = half;             enemy.vy =  Math.abs(enemy.vy) * 0.5; }
      if (enemy.y > dim.h - half)    { enemy.y = dim.h - half;     enemy.vy = -Math.abs(enemy.vy) * 0.5; }

      // Fluid from patrol movement
      const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
      if (espd > 0.04) {
        fluid.addForce({
          x: enemy.x, y: enemy.y,
          vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
          vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
          strength: FLUID_ENEMY_STRENGTH,
        });
      }

      // Detect player
      const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
      if (dx * dx + dy * dy < EMERALD_ATTACK_RADIUS * EMERALD_ATTACK_RADIUS) {
        enemy.phase = 'charging'; enemy.phaseMs = 0; enemy.hasHitPlayer = false;
        enemy.vx = 0; enemy.vy = 0;
      }

    } else if (enemy.phase === 'charging') {
      enemy.phaseMs += deltaMs;
      // Brief charge-up — enemy freezes and pulses
      if (enemy.phaseMs >= EMERALD_CHARGE_MS) {
        // Blink: store ghost at current position, teleport near player
        enemy.ghostX = enemy.x; enemy.ghostY = enemy.y; enemy.ghostAlpha = 1;
        const angle = Math.random() * Math.PI * 2;
        enemy.x = mote.x + Math.cos(angle) * EMERALD_BLINK_OFFSET;
        enemy.y = mote.y + Math.sin(angle) * EMERALD_BLINK_OFFSET;
        // Clamp to bounds after blink
        const half = EMERALD_ENEMY_SIZE / 2;
        enemy.x = Math.max(half, Math.min(dim.w - half, enemy.x));
        enemy.y = Math.max(half, Math.min(dim.h - half, enemy.y));
        enemy.phase = 'blinking'; enemy.phaseMs = 0;
        // Flash of fluid at both origin and destination
        fluid.addForce({
          x: enemy.ghostX, y: enemy.ghostY,
          vx: (mote.x - enemy.ghostX) * 0.02 * FLUID_VEL_FRAME_TO_PX_S,
          vy: (mote.y - enemy.ghostY) * 0.02 * FLUID_VEL_FRAME_TO_PX_S,
          r: FLUID_EMERALD_R, g: FLUID_EMERALD_G, b: FLUID_EMERALD_B,
          strength: 1.2,
        });
      }

    } else if (enemy.phase === 'blinking') {
      // One-frame blink — deliver contact damage then go to cooldown
      if (!enemy.hasHitPlayer) {
        enemy.hasHitPlayer = true;
        ctx.dealDamageToPlayer(enemy.atk);
      }
      enemy.phase = 'cooldown'; enemy.phaseMs = 0;

    } else if (enemy.phase === 'cooldown') {
      enemy.phaseMs += deltaMs;
      if (enemy.phaseMs >= EMERALD_COOLDOWN_MS) {
        enemy.phase = 'patrol'; enemy.phaseMs = 0;
        enemy.patrolTimerMs = EMERALD_PATROL_TURN_MS * Math.random();
      }
    }
  }
}

// ── Amber enemy system (fan-gunner) ───────────────────────────────────────────

function spawnAmberFanBurst(enemy: AmberEnemy, shards: AmberShard[], ctx: RpgEnemyCtx): void {
  const { mote, fluid } = ctx;
  const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const baseDirX = dist > 0.01 ? dx / dist : 0;
  const baseDirY = dist > 0.01 ? dy / dist : 1;
  const baseAngle = Math.atan2(baseDirY, baseDirX);
  for (let i = 0; i < AMBER_SHARD_COUNT; i++) {
    const spread = (i - (AMBER_SHARD_COUNT - 1) / 2) * AMBER_SHARD_SPREAD_RAD;
    const angle = baseAngle + spread;
    const vx = Math.cos(angle) * AMBER_SHARD_SPEED;
    const vy = Math.sin(angle) * AMBER_SHARD_SPEED;
    shards.push(makeAmberShard(enemy.x, enemy.y, vx, vy));
  }
  fluid.addForce({
    x: enemy.x, y: enemy.y,
    vx: baseDirX * FLUID_VEL_FRAME_TO_PX_S * 2.0,
    vy: baseDirY * FLUID_VEL_FRAME_TO_PX_S * 2.0,
    r: FLUID_AMBER_R, g: FLUID_AMBER_G, b: FLUID_AMBER_B,
    strength: FLUID_PROJECTILE_STRENGTH * 1.5,
  });
}

export function updateAmberEnemies(
  enemies: AmberEnemy[],
  shards: AmberShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { dim, fluid } = ctx;
  for (const enemy of enemies) {
    // Patrol
    enemy.patrolTimerMs -= deltaMs;
    if (enemy.patrolTimerMs <= 0) {
      const angle = Math.random() * Math.PI * 2;
      enemy.vx = Math.cos(angle) * AMBER_PATROL_SPEED;
      enemy.vy = Math.sin(angle) * AMBER_PATROL_SPEED;
      enemy.patrolTimerMs = AMBER_PATROL_TURN_MS * (0.5 + Math.random() * 0.8);
    }
    const dampFactor = Math.pow(AMBER_PATROL_DAMPING, dt);
    enemy.vx *= dampFactor; enemy.vy *= dampFactor;
    enemy.x  += enemy.vx * dt; enemy.y += enemy.vy * dt;
    const half = AMBER_ENEMY_SIZE / 2;
    if (enemy.x < half)         { enemy.x = half;         enemy.vx =  Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > dim.w - half) { enemy.x = dim.w - half; enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < half)         { enemy.y = half;          enemy.vy =  Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > dim.h - half) { enemy.y = dim.h - half;  enemy.vy = -Math.abs(enemy.vy) * 0.5; }

    // Fluid from movement
    const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
    if (espd > 0.04) {
      fluid.addForce({
        x: enemy.x, y: enemy.y,
        vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_AMBER_R, g: FLUID_AMBER_G, b: FLUID_AMBER_B,
        strength: FLUID_ENEMY_STRENGTH,
      });
    }

    // Fan-burst timer
    enemy.missileTimerMs -= deltaMs;
    if (enemy.missileTimerMs <= 0) {
      spawnAmberFanBurst(enemy, shards, ctx);
      enemy.missileTimerMs = AMBER_MISSILE_CD_MS + (Math.random() - 0.5) * AMBER_MISSILE_JITTER;
    }
  }
}

export function updateAmberShards(
  shards: AmberShard[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim, fluid } = ctx;
  const terrain = ctx.getTerrainState();
  for (let i = shards.length - 1; i >= 0; i--) {
    const s = shards[i];
    if (s.hp <= 0) { shards.splice(i, 1); continue; }

    // Heat-seeking toward player
    const dx = mote.x - s.x, dy = mote.y - s.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.01) {
      s.vx += (dx / dist) * AMBER_SHARD_SEEK_STR;
      s.vy += (dy / dist) * AMBER_SHARD_SEEK_STR;
    }
    const speed = Math.sqrt(s.vx * s.vx + s.vy * s.vy);
    if (speed > AMBER_SHARD_MAX_SPEED) {
      s.vx = (s.vx / speed) * AMBER_SHARD_MAX_SPEED;
      s.vy = (s.vy / speed) * AMBER_SHARD_MAX_SPEED;
    }
    const prevX = s.x, prevY = s.y;
    s.x += s.vx * dt; s.y += s.vy * dt;

    // Destroy if the projectile crossed terrain this step
    if (terrain && segmentIntersectsTopographicTerrain(terrain, prevX, prevY, s.x, s.y)) {
      shards.splice(i, 1); continue;
    }

    // Fluid trail
    fluid.addForce({
      x: s.x, y: s.y,
      vx: s.vx * FLUID_VEL_FRAME_TO_PX_S,
      vy: s.vy * FLUID_VEL_FRAME_TO_PX_S,
      r: FLUID_AMBER_R, g: FLUID_AMBER_G, b: FLUID_AMBER_B,
      strength: FLUID_MISSILE_STRENGTH * 0.7,
    });

    // Trail recording
    s.trailX[s.trailHead] = s.x; s.trailY[s.trailHead] = s.y;
    s.trailHead = (s.trailHead + 1) % AMBER_SHARD_TRAIL_CAP;
    if (s.trailCount < AMBER_SHARD_TRAIL_CAP) s.trailCount++;

    // Player hit (with knockback)
    if (!s.hasHitPlayer) {
      const pdx = mote.x - s.x, pdy = mote.y - s.y;
      if (pdx * pdx + pdy * pdy < PLAYER_HIT_RADIUS * PLAYER_HIT_RADIUS) {
        s.hasHitPlayer = true;
        const curSpeed = speed + SPEED_EPSILON;
        ctx.dealDamageToPlayerKnockback(s.atk, s.vx / curSpeed, s.vy / curSpeed);
        shards.splice(i, 1); continue;
      }
    }

    // Despawn if out of bounds
    const margin = 20;
    if (s.x < -margin || s.x > dim.w + margin || s.y < -margin || s.y > dim.h + margin) {
      shards.splice(i, 1);
    }
  }
}

// ── Void enemy system (slow bruiser) ──────────────────────────────────────────

export function updateVoidEnemies(
  enemies: VoidEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, dim, fluid } = ctx;
  for (const enemy of enemies) {
    enemy.pulseMs = (enemy.pulseMs + deltaMs) % VOID_AURA_PULSE_MS;

    // Constant pursuit of player
    const dx = mote.x - enemy.x, dy = mote.y - enemy.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > 0.01) {
      enemy.vx = (dx / dist) * VOID_PURSUE_SPEED;
      enemy.vy = (dy / dist) * VOID_PURSUE_SPEED;
    } else {
      enemy.vx = 0; enemy.vy = 0;
    }
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;

    // Clamp to bounds
    const half = VOID_ENEMY_SIZE / 2;
    if (enemy.x < half)         { enemy.x = half; }
    if (enemy.x > dim.w - half) { enemy.x = dim.w - half; }
    if (enemy.y < half)         { enemy.y = half; }
    if (enemy.y > dim.h - half) { enemy.y = dim.h - half; }

    // Fluid from movement
    const espd = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
    if (espd > 0.04) {
      fluid.addForce({
        x: enemy.x, y: enemy.y,
        vx: enemy.vx * FLUID_VEL_FRAME_TO_PX_S,
        vy: enemy.vy * FLUID_VEL_FRAME_TO_PX_S,
        r: FLUID_VOID_R, g: FLUID_VOID_G, b: FLUID_VOID_B,
        strength: FLUID_ENEMY_STRENGTH * 1.3,
      });
    }

    // Contact damage (with cooldown per tick)
    if (enemy.contactCdMs > 0) {
      enemy.contactCdMs = Math.max(0, enemy.contactCdMs - deltaMs);
    }
    if (enemy.contactCdMs <= 0) {
      const cdx = mote.x - enemy.x, cdy = mote.y - enemy.y;
      if (cdx * cdx + cdy * cdy < VOID_CONTACT_RADIUS * VOID_CONTACT_RADIUS) {
        ctx.dealDamageToPlayer(enemy.atk);
        enemy.contactCdMs = VOID_CONTACT_CD_MS;
      }
    }
  }
}



