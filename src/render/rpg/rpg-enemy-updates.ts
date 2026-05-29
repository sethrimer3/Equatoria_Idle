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
import type { RpgFieldSpace } from './rpgFieldSpace';
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
  pushPointOutsideTopographicTerrain,
  computeTerrainRepulsionForce,
  type TopographicTerrainState,
} from './terrain/topographic-terrain';
import {
  createRpgPathState, computePathSteeredDirection, DEFAULT_REPATH_MS,
  type RpgPathState,
} from './terrain/rpg-pathfinding';
import {
  computeVerdureWallRepulsion,
  pushPointOutsideVerdureWall,
} from './terrain/verdure-cave-walls';

// ── Shared context interface ───────────────────────────────────────────────────

/**
 * Minimal shared context passed to every enemy update function.
 *
 * All fields are object references or callbacks captured by the
 * createRpgRender closure, so they always reflect current closure state.
 * `dim` is the fixed safe-core world size (360×640); it is never updated.
 * Use `getFieldSpace().activeBounds` for the live visible gameplay area.
 */
export interface RpgEnemyCtx {
  /** Player mote — position and velocity (mutable reference). */
  readonly mote: { x: number; y: number; vx: number; vy: number };
  /**
   * Fixed safe-core world dimensions (360×640). Never updated after init.
   * For the live visible gameplay area, use `getFieldSpace().activeBounds`.
   */
  readonly dim: { w: number; h: number };
  /**
   * Full visible world-space bounds — updated on every resize via shared object.
   * Use these for spawn bounds, entity clamp/bounce, and cull checks.
   * On a reference 360×640 device: left=0, top=0, right=360, bottom=640.
   *
   * Prefer `getFieldSpace().activeBounds` for new code; `viewport` is a
   * compatibility alias kept in sync from `rpgFieldSpace.visibleBounds`.
   */
  readonly viewport: { left: number; top: number; right: number; bottom: number };
  /** Returns the current authoritative field-space snapshot. */
  getFieldSpace(): RpgFieldSpace;
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
  /** Returns the current navigation grid for pathfinding, or null if not built. */
  getNavGrid(): import('./terrain/rpg-pathfinding').RpgNavGrid | null;
  /** Returns the Verdure cave wall state if in the Verdure zone, otherwise null. */
  getVerdureCaveWallState?(): import('./terrain/verdure-cave-walls').VerdureCaveWallState | null;
}

// ── Shared terrain push-out helper ────────────────────────────────────────────

/** Reusable scratch objects to avoid allocations in push-out calls. */
const _pushOutScratch = { x: 0, y: 0 };
const _repForce = { x: 0, y: 0 };
const _wallRepForce = { x: 0, y: 0 };
const _wallPushScratch = { x: 0, y: 0 };

/**
 * Applies soft terrain repulsion followed by a hard push-out fail-safe to an
 * enemy entity.  Enemies cannot remain inside terrain after this call.
 *
 * - Soft repulsion: applies a quadratic outward force proportional to
 *   penetration depth so collision feels like an invisible barrier.
 * - Hard fail-safe: projects the entity to just outside the boundary if it
 *   is still inside after repulsion, guaranteeing robustness.
 *
 * @param entity  - mutable {x, y, vx, vy}
 * @param terrain - current terrain state (may be null)
 * @param halfSize - half the enemy's collision width/height (px)
 */
export function applyEnemyTerrainPushOut(
  entity: { x: number; y: number; vx: number; vy: number },
  terrain: TopographicTerrainState | null,
  halfSize: number,
): void {
  if (!terrain) return;

  // 1. Soft repulsion.
  const depth = computeTerrainRepulsionForce(terrain, entity.x, entity.y, 0.18, _repForce);
  if (depth > 0) {
    entity.vx += _repForce.x;
    entity.vy += _repForce.y;
    const fLen = Math.sqrt(_repForce.x ** 2 + _repForce.y ** 2) || 1;
    const nx = _repForce.x / fLen, ny = _repForce.y / fLen;
    const dot = entity.vx * nx + entity.vy * ny;
    if (dot < 0) { entity.vx -= dot * nx; entity.vy -= dot * ny; }
  }

  // 2. Hard fail-safe.
  if (pushPointOutsideTopographicTerrain(terrain, entity.x, entity.y, _pushOutScratch, halfSize + 2)) {
    const oldX = entity.x, oldY = entity.y;
    entity.x = _pushOutScratch.x;
    entity.y = _pushOutScratch.y;
    const pdx = _pushOutScratch.x - oldX, pdy = _pushOutScratch.y - oldY;
    const plen = Math.sqrt(pdx * pdx + pdy * pdy);
    if (plen > 0) {
      const nx = pdx / plen, ny = pdy / plen;
      const dot = entity.vx * nx + entity.vy * ny;
      if (dot < 0) { entity.vx -= dot * nx; entity.vy -= dot * ny; }
    }
  }
}

/**
 * Applies soft Verdure cave-wall repulsion followed by a hard push-out
 * fail-safe to an enemy entity.  Mirrors the player-movement wall handling
 * in rpg-player-movement.ts.
 *
 * Call this every frame for every enemy when the Verdure zone is active.
 *
 * @param entity    Mutable enemy {x, y, vx, vy}.
 * @param wallState Current Verdure cave wall state.
 * @param halfSize  Half the enemy's collision radius (px).
 */
export function applyEnemyVerdureWallPushOut(
  entity: { x: number; y: number; vx: number; vy: number },
  wallState: import('./terrain/verdure-cave-walls').VerdureCaveWallState,
  halfSize: number,
): void {
  // 1. Soft repulsion keeps enemies from hugging the wall boundary.
  const wallDepth = computeVerdureWallRepulsion(wallState, entity.x, entity.y, 0.22, _wallRepForce);
  if (wallDepth > 0) {
    entity.vx += _wallRepForce.x;
    entity.vy += _wallRepForce.y;
    const wfl = Math.sqrt(_wallRepForce.x ** 2 + _wallRepForce.y ** 2) || 1;
    const wnx = _wallRepForce.x / wfl;
    const wny = _wallRepForce.y / wfl;
    const wvd = entity.vx * wnx + entity.vy * wny;
    if (wvd < 0) { entity.vx -= wvd * wnx; entity.vy -= wvd * wny; }
  }

  // 2. Hard fail-safe — snap out if still inside boundary.
  if (pushPointOutsideVerdureWall(wallState, entity.x, entity.y, _wallPushScratch, halfSize + 2)) {
    const wpdx = _wallPushScratch.x - entity.x;
    const wpdy = _wallPushScratch.y - entity.y;
    entity.x = _wallPushScratch.x;
    entity.y = _wallPushScratch.y;
    const wplen = Math.sqrt(wpdx * wpdx + wpdy * wpdy) || 1;
    const wpnx = wpdx / wplen;
    const wpny = wpdy / wplen;
    const wvd2 = entity.vx * wpnx + entity.vy * wpny;
    if (wvd2 < 0) { entity.vx -= wvd2 * wpnx; entity.vy -= wvd2 * wpny; }
  }
}

/**
 * Computes a terrain-aware direction from `(ex, ey)` toward `(tx, ty)`.
 *
 * This is local steering, NOT pathfinding.  It works statelessly by probing
 * a handful of candidate angles around the direct vector and picking the best
 * one that is unblocked.  It avoids the left/right oscillation that a simple
 * ±90° probe causes at concave terrain corners.
 *
 * Candidate angles (relative to direct vector, in radians):
 *   0, ±30°, ±60°, ±90°, ±120°, 180°
 * Each candidate is tested by probing `PROBE_DIST` px from the entity.
 * Candidates are scored by:
 *   1. Clear probe path (unblocked beats blocked).
 *   2. Positive dot product with direct direction (moving toward target).
 *   3. Lower absolute angle deviation (less detour).
 * If all candidates are blocked, the best (least-bad) is returned so the
 * entity does not freeze.
 *
 * Returns a normalised direction vector `{dx, dy}`.
 */
export function terrainAwareDirection(
  terrain: TopographicTerrainState | null,
  ex: number, ey: number,
  tx: number, ty: number,
): { dx: number; dy: number } {
  const rawDx = tx - ex, rawDy = ty - ey;
  const rawLen = Math.sqrt(rawDx * rawDx + rawDy * rawDy) || 1;
  const ndx = rawDx / rawLen, ndy = rawDy / rawLen;
  if (!terrain || !segmentIntersectsTopographicTerrain(terrain, ex, ey, tx, ty)) {
    return { dx: ndx, dy: ndy };
  }

  // Direct path is blocked — probe candidate angles around the direct vector.
  const PROBE_DIST = 40;
  // Offsets in radians, ordered from least to most deviation.
  const offsets = [
    Math.PI / 6,  // +30°
    -Math.PI / 6, // -30°
    Math.PI / 3,  // +60°
    -Math.PI / 3, // -60°
    Math.PI / 2,  // +90°
    -Math.PI / 2, // -90°
    2 * Math.PI / 3, // +120°
    -2 * Math.PI / 3, // -120°
    Math.PI,      // 180° (last resort)
  ];

  const directAngle = Math.atan2(ndy, ndx);
  let bestDx = ndx, bestDy = ndy;
  let bestClear = false;
  let bestDot = -Infinity;

  for (const offset of offsets) {
    const angle = directAngle + offset;
    const cx = Math.cos(angle), cy = Math.sin(angle);
    const blocked = segmentIntersectsTopographicTerrain(terrain, ex, ey, ex + cx * PROBE_DIST, ey + cy * PROBE_DIST);
    const dot = cx * ndx + cy * ndy;
    // Accept this candidate if it's strictly better than the current best:
    // clear > blocked, then higher dot product (progress toward target).
    const improves = (!blocked && !bestClear) || (blocked === bestClear && dot > bestDot);
    if (improves) {
      bestDx = cx; bestDy = cy;
      bestClear = !blocked;
      bestDot = dot;
    }
    // Stop searching once we have a clear path with positive progress.
    if (bestClear && bestDot > 0) break;
  }

  return { dx: bestDx, dy: bestDy };
}

// ── Emerald enemy system (blink-striker) ──────────────────────────────────────

export function updateEmeraldEnemies(
  enemies: EmeraldEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, fluid, viewport } = ctx;
  const terrain = ctx.getTerrainState();
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
      if (enemy.x < viewport.left + half)   { enemy.x = viewport.left + half;   enemy.vx =  Math.abs(enemy.vx) * 0.5; }
      if (enemy.x > viewport.right - half)  { enemy.x = viewport.right - half;  enemy.vx = -Math.abs(enemy.vx) * 0.5; }
      if (enemy.y < viewport.top + half)    { enemy.y = viewport.top + half;    enemy.vy =  Math.abs(enemy.vy) * 0.5; }
      if (enemy.y > viewport.bottom - half) { enemy.y = viewport.bottom - half; enemy.vy = -Math.abs(enemy.vy) * 0.5; }
      applyEnemyTerrainPushOut(enemy, terrain, half);

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
        enemy.x = Math.max(viewport.left + half, Math.min(viewport.right - half, enemy.x));
        enemy.y = Math.max(viewport.top + half, Math.min(viewport.bottom - half, enemy.y));
        // Push destination out of terrain if needed
        applyEnemyTerrainPushOut(enemy, terrain, half);
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
  const { fluid, viewport } = ctx;
  const terrain = ctx.getTerrainState();
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
    if (enemy.x < viewport.left + half)   { enemy.x = viewport.left + half;   enemy.vx =  Math.abs(enemy.vx) * 0.5; }
    if (enemy.x > viewport.right - half)  { enemy.x = viewport.right - half;  enemy.vx = -Math.abs(enemy.vx) * 0.5; }
    if (enemy.y < viewport.top + half)    { enemy.y = viewport.top + half;    enemy.vy =  Math.abs(enemy.vy) * 0.5; }
    if (enemy.y > viewport.bottom - half) { enemy.y = viewport.bottom - half; enemy.vy = -Math.abs(enemy.vy) * 0.5; }
    applyEnemyTerrainPushOut(enemy, terrain, half);

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
  const { mote, fluid, viewport } = ctx;
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
    if (s.x < viewport.left - margin || s.x > viewport.right + margin ||
        s.y < viewport.top - margin  || s.y > viewport.bottom + margin) {
      shards.splice(i, 1);
    }
  }
}

// ── Void enemy system (slow bruiser) ──────────────────────────────────────────

/** Per-Void-enemy path state — keyed on the enemy object so it is GC'd on despawn. */
const _voidPathStates = new WeakMap<VoidEnemy, RpgPathState>();

function _getVoidPathState(enemy: VoidEnemy): RpgPathState {
  let ps = _voidPathStates.get(enemy);
  if (!ps) { ps = createRpgPathState(); _voidPathStates.set(enemy, ps); }
  return ps;
}

export function updateVoidEnemies(
  enemies: VoidEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote, fluid, viewport } = ctx;
  const terrain = ctx.getTerrainState();
  for (const enemy of enemies) {
    enemy.pulseMs = (enemy.pulseMs + deltaMs) % VOID_AURA_PULSE_MS;

    // Terrain-aware pursuit: use A* pathfinding when terrain blocks the direct path.
    const navGrid = ctx.getNavGrid();
    const curSpeed = Math.sqrt(enemy.vx * enemy.vx + enemy.vy * enemy.vy);
    const dir = computePathSteeredDirection(
      _getVoidPathState(enemy),
      enemy.x, enemy.y,
      mote.x, mote.y,
      performance.now(),
      navGrid,
      terrain,
      DEFAULT_REPATH_MS,
      curSpeed,
    );
    enemy.vx = dir.dx * VOID_PURSUE_SPEED;
    enemy.vy = dir.dy * VOID_PURSUE_SPEED;
    enemy.x += enemy.vx * dt; enemy.y += enemy.vy * dt;

    // Clamp to bounds
    const half = VOID_ENEMY_SIZE / 2;
    if (enemy.x < viewport.left + half)   { enemy.x = viewport.left + half; }
    if (enemy.x > viewport.right - half)  { enemy.x = viewport.right - half; }
    if (enemy.y < viewport.top + half)    { enemy.y = viewport.top + half; }
    if (enemy.y > viewport.bottom - half) { enemy.y = viewport.bottom - half; }
    applyEnemyTerrainPushOut(enemy, terrain, half);

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



