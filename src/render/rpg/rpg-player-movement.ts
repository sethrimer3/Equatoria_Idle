/**
 * rpg-player-movement.ts — Player physics and movement for the RPG tab.
 *
 * Contains `updatePlayerMovement`, which processes joystick/keyboard input,
 * auto-move steering, position integration, trail management, glow tracking,
 * aim-angle tracking, and fluid-background force injection.
 *
 * Extracted from rpg-render.ts to reduce file size.  All mutable state arrives
 * via `PlayerMovementCtx` and `PlayerMovementState`.
 */

import type { RpgMote, RpgJoystick, RpgKeyState, LaserEnemy, SapphireEnemy } from './rpg-types';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy, BossEnemy,
} from './rpg-enemy-types';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgSpeedMultiplier } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { getSwordLength } from './rpg-helpers';
import type { RpgFluid } from './rpg-fluid';
import {
  MAX_RPG_SPEED, RPG_VELOCITY_DAMPING, RPG_MOTE_SIZE,
  JOYSTICK_OUTER_RADIUS, AUTO_MOVE_JOYSTICK_DEAD_ZONE,
  TRAIL_SPEED_THRESHOLD, RPG_TRAIL_CAPACITY, MIN_TRAIL_DISTANCE,
  GLOW_MOVE_RAMP_UP, GLOW_MOVE_RAMP_DOWN,
  PLAYER_BASE_RANGE_PX, TARGET_FRAME_MS,
  FLUID_VEL_FRAME_TO_PX_S, FLUID_PLAYER_STRENGTH,
  FLUID_PLAYER_R, FLUID_PLAYER_G, FLUID_PLAYER_B,
} from './rpg-constants';

// ── Dependency-injection context ──────────────────────────────────────────────

export interface PlayerMovementCtx {
  /** Player mote (mutable — velocity and position are updated in place). */
  mote: RpgMote;
  /** Touch joystick state (read-only here). */
  joystick: RpgJoystick;
  /** Keyboard WASD/Arrow state (read-only here). */
  keys: RpgKeyState;
  /** Current canvas dimensions. */
  dim: { w: number; h: number };

  // Enemy arrays for nearest-enemy auto-move (read-only here)
  enemies: LaserEnemy[];
  sapphireEnemies: SapphireEnemy[];
  emeraldEnemies: EmeraldEnemy[];
  amberEnemies: AmberEnemy[];
  voidEnemies: VoidEnemy[];
  quartzEnemies: QuartzEnemy[];
  rubyEnemies: RubyEnemy[];
  sunstoneEnemies: SunstoneEnemy[];
  citrineEnemies: CitrineEnemy[];
  ioliteEnemies: IoliteEnemy[];
  amethystEnemies: AmethystEnemy[];
  diamondEnemies: DiamondEnemy[];
  nullstoneEnemies: NullstoneEnemy[];
  fracterylEnemies: FracterylEnemy[];
  eigensteinEnemies: EigensteinEnemy[];

  /** Live getter — bossEnemy changes during gameplay. */
  readonly bossEnemy: BossEnemy | null;

  /** True while the boss wave is active (disables auto-move). */
  readonly isBossWaveActive: boolean;

  /** True when auto-move is currently enabled by the player. */
  readonly autoMoveEnabled: boolean;

  rpgSimState: RpgSimState;
  getEffectiveEquippedIds(): Set<string>;

  /** Euler-fluid background (player movement injects force). */
  fluid: RpgFluid;
}

/**
 * Mutable scalars that are both produced and consumed by `updatePlayerMovement`.
 * Initialise once in the caller and pass the same object every frame.
 */
export interface PlayerMovementState {
  /** Current movement-glow intensity [0, 1]. Updated in place. */
  glowMovementIntensity: number;
  /** Current player aim angle (radians). Updated in place. */
  playerAimAngle: number;
}

// ── Core update function ──────────────────────────────────────────────────────

const MIN_TRAIL_DISTANCE_SQ = MIN_TRAIL_DISTANCE * MIN_TRAIL_DISTANCE;

/**
 * Advances player movement one frame:
 *  1. Translates joystick/keyboard/auto-move input into velocity.
 *  2. Integrates position and clamps to arena bounds.
 *  3. Updates the comet trail (distance-gated).
 *  4. Updates `state.glowMovementIntensity` via LERP ramp.
 *  5. Updates `state.playerAimAngle` from velocity or nearest enemy.
 *  6. Injects player movement into the Euler-fluid background.
 */
export function updatePlayerMovement(
  ctx: PlayerMovementCtx,
  state: PlayerMovementState,
  deltaMs: number,
): void {
  const { mote, joystick, keys, dim, rpgSimState, fluid } = ctx;
  const widthPx  = dim.w;
  const heightPx = dim.h;
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const speedMul = getRpgSpeedMultiplier(rpgSimState);
  const effectiveMaxSpeed = MAX_RPG_SPEED * speedMul;

  if (joystick.isActive) {
    const dx = joystick.thumbX - joystick.baseX;
    const dy = joystick.thumbY - joystick.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > AUTO_MOVE_JOYSTICK_DEAD_ZONE) {
      const speed = (dist / JOYSTICK_OUTER_RADIUS) * effectiveMaxSpeed;
      mote.vx = (dx / dist) * speed;
      mote.vy = (dy / dist) * speed;
    } else {
      mote.vx *= RPG_VELOCITY_DAMPING;
      mote.vy *= RPG_VELOCITY_DAMPING;
    }
  } else {
    const dirX = (keys.right ? 1 : 0) - (keys.left ? 1 : 0);
    const dirY = (keys.down  ? 1 : 0) - (keys.up   ? 1 : 0);
    const dirLen = Math.sqrt(dirX * dirX + dirY * dirY);
    const hasKeyInput = dirLen > 0;

    if (hasKeyInput) {
      mote.vx = (dirX / dirLen) * effectiveMaxSpeed;
      mote.vy = (dirY / dirLen) * effectiveMaxSpeed;
    } else if (ctx.autoMoveEnabled && !ctx.isBossWaveActive && _anyEnemiesPresent(ctx)) {
      // Auto-move: steer toward the nearest enemy, stopping within weapon range.
      let autoMoveStopRange = PLAYER_BASE_RANGE_PX;
      let hasWeapon = false;
      for (const weaponId of ctx.getEffectiveEquippedIds()) {
        const wd = WEAPON_BY_ID.get(weaponId);
        if (wd) {
          let effectiveRange: number;
          if (wd.stats.effect?.kind === 'swordCombo') {
            const t = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
            effectiveRange = getSwordLength(t);
          } else {
            effectiveRange = wd.stats.range;
          }
          autoMoveStopRange = hasWeapon ? Math.min(autoMoveStopRange, effectiveRange) : effectiveRange;
          hasWeapon = true;
        }
      }

      const { distSq: nearestDistSq, x: nearestX, y: nearestY } = _findNearestEnemy(ctx);
      if (nearestDistSq < Infinity) {
        const ex = nearestX - mote.x, ey = nearestY - mote.y;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d > autoMoveStopRange) {
          mote.vx = (ex / d) * effectiveMaxSpeed;
          mote.vy = (ey / d) * effectiveMaxSpeed;
        } else {
          mote.vx *= RPG_VELOCITY_DAMPING;
          mote.vy *= RPG_VELOCITY_DAMPING;
        }
      }
    } else {
      mote.vx *= RPG_VELOCITY_DAMPING;
      mote.vy *= RPG_VELOCITY_DAMPING;
    }
  }

  // ── Position integration and arena clamping ─────────────────────
  mote.x += mote.vx * dt; mote.y += mote.vy * dt;
  const half = RPG_MOTE_SIZE / 2;
  if (mote.x < half)            { mote.x = half;            mote.vx = 0; }
  if (mote.x > widthPx  - half) { mote.x = widthPx  - half; mote.vx = 0; }
  if (mote.y < half)            { mote.y = half;            mote.vy = 0; }
  if (mote.y > heightPx - half) { mote.y = heightPx - half; mote.vy = 0; }

  // ── Trail update (distance-gated to prevent bunching at high Hz) ──
  const lastTrailIdx = (mote.trailHead - 1 + RPG_TRAIL_CAPACITY) % RPG_TRAIL_CAPACITY;
  const tdx = mote.x - mote.trailX[lastTrailIdx];
  const tdy = mote.y - mote.trailY[lastTrailIdx];
  if (mote.trailCount === 0 || tdx * tdx + tdy * tdy >= MIN_TRAIL_DISTANCE_SQ) {
    mote.trailX[mote.trailHead] = mote.x;
    mote.trailY[mote.trailHead] = mote.y;
    mote.trailHead = (mote.trailHead + 1) % RPG_TRAIL_CAPACITY;
    if (mote.trailCount < RPG_TRAIL_CAPACITY) mote.trailCount++;
  }

  // ── Glow movement intensity (LERP ramp) ────────────────────────
  const speed = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
  if (speed > TRAIL_SPEED_THRESHOLD) {
    state.glowMovementIntensity = Math.min(1, state.glowMovementIntensity + GLOW_MOVE_RAMP_UP * deltaMs);
  } else {
    state.glowMovementIntensity = Math.max(0, state.glowMovementIntensity - GLOW_MOVE_RAMP_DOWN * deltaMs);
  }

  // ── Aim angle (from velocity or nearest visible enemy) ──────────
  if (speed > 0.1) {
    state.playerAimAngle = Math.atan2(mote.vy, mote.vx);
  } else {
    let nearestAimDistSq = Infinity;
    const checkAimEnemy = (e: { x: number; y: number }) => {
      const ax = e.x - mote.x, ay = e.y - mote.y;
      const d = ax * ax + ay * ay;
      if (d < nearestAimDistSq) {
        nearestAimDistSq = d;
        state.playerAimAngle = Math.atan2(ay, ax);
      }
    };
    for (const e of ctx.enemies)          checkAimEnemy(e);
    for (const e of ctx.sapphireEnemies)  checkAimEnemy(e);
    for (const e of ctx.emeraldEnemies)   checkAimEnemy(e);
    for (const e of ctx.amberEnemies)     checkAimEnemy(e);
    for (const e of ctx.voidEnemies)      checkAimEnemy(e);
    for (const e of ctx.quartzEnemies)    checkAimEnemy(e);
    for (const e of ctx.rubyEnemies)      checkAimEnemy(e);
    for (const e of ctx.sunstoneEnemies)  checkAimEnemy(e);
    for (const e of ctx.citrineEnemies)   checkAimEnemy(e);
    for (const e of ctx.ioliteEnemies)    checkAimEnemy(e);
    for (const e of ctx.amethystEnemies)  checkAimEnemy(e);
    for (const e of ctx.diamondEnemies)   checkAimEnemy(e);
    for (const e of ctx.nullstoneEnemies) checkAimEnemy(e);
    for (const e of ctx.fracterylEnemies) checkAimEnemy(e);
    for (const e of ctx.eigensteinEnemies) checkAimEnemy(e);
    const boss = ctx.bossEnemy;
    if (boss) checkAimEnemy(boss);
  }

  // ── Fluid injection ─────────────────────────────────────────────
  if (speed > TRAIL_SPEED_THRESHOLD) {
    fluid.addForce({
      x: mote.x, y: mote.y,
      vx: mote.vx * FLUID_VEL_FRAME_TO_PX_S,
      vy: mote.vy * FLUID_VEL_FRAME_TO_PX_S,
      r: FLUID_PLAYER_R, g: FLUID_PLAYER_G, b: FLUID_PLAYER_B,
      strength: FLUID_PLAYER_STRENGTH,
    });
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Returns true if at least one non-boss enemy is alive. */
function _anyEnemiesPresent(ctx: PlayerMovementCtx): boolean {
  return (
    ctx.enemies.length > 0           || ctx.sapphireEnemies.length > 0  ||
    ctx.emeraldEnemies.length > 0    || ctx.amberEnemies.length > 0      ||
    ctx.voidEnemies.length > 0       || ctx.quartzEnemies.length > 0     ||
    ctx.rubyEnemies.length > 0       || ctx.sunstoneEnemies.length > 0   ||
    ctx.citrineEnemies.length > 0    || ctx.ioliteEnemies.length > 0     ||
    ctx.amethystEnemies.length > 0   || ctx.diamondEnemies.length > 0    ||
    ctx.nullstoneEnemies.length > 0  ||
    ctx.fracterylEnemies.length > 0  || ctx.eigensteinEnemies.length > 0
  );
}

/** Returns the squared distance and position of the nearest enemy to the mote. */
function _findNearestEnemy(ctx: PlayerMovementCtx): { distSq: number; x: number; y: number } {
  const { mote } = ctx;
  let nearestDistSq = Infinity;
  let nearestX = 0, nearestY = 0;

  const check = (e: { x: number; y: number }) => {
    const ex = e.x - mote.x, ey = e.y - mote.y;
    const d = ex * ex + ey * ey;
    if (d < nearestDistSq) { nearestDistSq = d; nearestX = e.x; nearestY = e.y; }
  };

  for (const e of ctx.enemies)          check(e);
  for (const e of ctx.sapphireEnemies)  check(e);
  for (const e of ctx.emeraldEnemies)   check(e);
  for (const e of ctx.amberEnemies)     check(e);
  for (const e of ctx.voidEnemies)      check(e);
  for (const e of ctx.quartzEnemies)    check(e);
  for (const e of ctx.rubyEnemies)      check(e);
  for (const e of ctx.sunstoneEnemies)  check(e);
  for (const e of ctx.citrineEnemies)   check(e);
  for (const e of ctx.ioliteEnemies)    check(e);
  for (const e of ctx.amethystEnemies)  check(e);
  for (const e of ctx.diamondEnemies)   check(e);
  for (const e of ctx.nullstoneEnemies) check(e);
  for (const e of ctx.fracterylEnemies) check(e);
  for (const e of ctx.eigensteinEnemies) check(e);

  return { distSq: nearestDistSq, x: nearestX, y: nearestY };
}
