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
import type { RpgFieldSpace } from './rpgFieldSpace';
import type {
  EmeraldEnemy, AmberEnemy, VoidEnemy, QuartzEnemy, RubyEnemy,
  SunstoneEnemy, CitrineEnemy, IoliteEnemy, AmethystEnemy, DiamondEnemy,
  NullstoneEnemy, FracterylEnemy, EigensteinEnemy, EliteEnemy, BossEnemy,
} from './rpg-enemy-types';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgSpeedMultiplier, getSkillNodeRank } from '../../sim/rpg/rpg-state';
import { getPlayerMovementStatusMultiplier } from '../../sim/rpg/player-status-effects';
import { resolveWeaponDefinition } from '../../data/rpg/crafted-weapon-helpers';
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
  AUTO_MOVE_MELEE_STOP_MARGIN, AUTO_MOVE_CHAIN_WHIP_STOP_PX,
  DIAMOND_BLADE_ID,
} from './rpg-constants';
import {
  hasTopographicTerrainLineOfSight,
  type TopographicTerrainState,
} from './terrain/topographic-terrain';
import {
  actorMoveX, actorMoveY, buildActorSolidCtx,
} from './rpg-actor-collision';
import {
  createRpgPathState, computePathSteeredDirection, PLAYER_REPATH_MS,
  type RpgPathState,
} from './terrain/rpg-pathfinding';

// ── Dependency-injection context ──────────────────────────────────────────────

export interface PlayerMovementCtx {
  /** Player mote (mutable — velocity and position are updated in place). */
  mote: RpgMote;
  /** Touch joystick state (read-only here). */
  joystick: RpgJoystick;
  /** Keyboard WASD/Arrow state (read-only here). */
  keys: RpgKeyState;
  /** Current canvas dimensions (safe-core fixed size; kept for fluid/audio uses). */
  dim: { w: number; h: number };
  /** Returns the current authoritative field-space snapshot. */
  getFieldSpace(): RpgFieldSpace;

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
  eliteEnemies: EliteEnemy[];

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

  /** Returns the current topographic terrain state, or null if none is active. */
  getTerrainState(): TopographicTerrainState | null;
  /** Returns the current navigation grid for pathfinding, or null if not built. */
  getNavGrid(): import('./terrain/rpg-pathfinding').RpgNavGrid | null;
  /** Returns the current Verdure cave wall state, or null if not in Verdure zone. */
  getVerdureCaveWallState?(): import('./terrain/verdure-cave-walls').VerdureCaveWallState | null;
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

// ── Module-level path state for player auto-move ─────────────────────────────
// A single persistent instance shared across frames.  Avoided putting it in
// PlayerMovementState to keep that interface simple and serialisable.
const _playerPathState: RpgPathState = createRpgPathState();

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
  const { mote, joystick, keys, rpgSimState, fluid } = ctx;
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const speedMul = getRpgSpeedMultiplier(rpgSimState);
  const statusSpeedMul = getPlayerMovementStatusMultiplier(rpgSimState);
  const effectiveMaxSpeed = MAX_RPG_SPEED * speedMul * statusSpeedMul;

  // Acceleration skill: ranks 1–5 add responsiveness (lerp factor towards target velocity).
  // Rank 0 = instant snap (lerpFactor clamped to 1). Rank 5 = instant snap.
  const accelRank = getSkillNodeRank(rpgSimState, 'acceleration');
  const accelFactor = Math.min(1.0, 0.55 + accelRank * 0.09);

  if (joystick.isActive) {
    // Manual input: clear cached path so A* re-runs when auto-move resumes.
    _playerPathState.path.length = 0;
    const dx = joystick.thumbX - joystick.baseX;
    const dy = joystick.thumbY - joystick.baseY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist > AUTO_MOVE_JOYSTICK_DEAD_ZONE) {
      const speed = (dist / JOYSTICK_OUTER_RADIUS) * effectiveMaxSpeed;
      const targetVx = (dx / dist) * speed;
      const targetVy = (dy / dist) * speed;
      const lerpT = Math.min(1, accelFactor * dt);
      mote.vx += (targetVx - mote.vx) * lerpT;
      mote.vy += (targetVy - mote.vy) * lerpT;
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
      // Manual keyboard input: clear cached path so A* re-runs when auto-move resumes.
      _playerPathState.path.length = 0;
      const targetVx = (dirX / dirLen) * effectiveMaxSpeed;
      const targetVy = (dirY / dirLen) * effectiveMaxSpeed;
      const lerpT = Math.min(1, accelFactor * dt);
      mote.vx += (targetVx - mote.vx) * lerpT;
      mote.vy += (targetVy - mote.vy) * lerpT;
    } else if (ctx.autoMoveEnabled && !ctx.isBossWaveActive && _anyEnemiesPresent(ctx)) {
      // Auto-move: steer toward the nearest enemy, stopping within weapon range.
      //
      // Stop distance policy:
      //   - Sand blade (default melee, enabled): stop at swordLength × AUTO_MOVE_MELEE_STOP_MARGIN.
      //     This is *slightly inside* actual swing reach (30–78px) to guarantee the player is
      //     always within attacking distance, including when the enemy is pressed against a wall.
      //     Using a margin < 1.0 provides a safety buffer against corner/wall occlusion.
      //   - Chain whip: stop very close (AUTO_MOVE_CHAIN_WHIP_STOP_PX ≈ 10px). The whip
      //     strikes at close range and its nominal 75px range is misleading for positioning.
      //   - Diamond blade (swordCombo): same melee margin formula as sand blade.
      //   - Other weapons: use their nominal range from weapon definition.
      //   - No weapons equipped, sand blade disabled: use PLAYER_BASE_RANGE_PX as a neutral
      //     keep-away distance (player has no attack, so just keep some space).
      let autoMoveStopRange: number | null = null;
      let hasWeapon = false;
      const equippedIds = ctx.getEffectiveEquippedIds();
      const hasDiamondBlade = equippedIds.has(DIAMOND_BLADE_ID);

      for (const weaponId of equippedIds) {
        const wd = resolveWeaponDefinition(weaponId);
        if (!wd) continue;
        let effectiveRange: number;
        if (wd.stats.effect?.kind === 'swordCombo') {
          // Diamond blade uses the same melee-range margin as the sand blade.
          const t = rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
          effectiveRange = getSwordLength(t) * AUTO_MOVE_MELEE_STOP_MARGIN;
        } else if (wd.stats.effect?.kind === 'chainWhip') {
          // Chain whip: player should get very close regardless of nominal range.
          effectiveRange = AUTO_MOVE_CHAIN_WHIP_STOP_PX;
        } else {
          effectiveRange = wd.stats.range;
        }
        // Prefer the closest stop range so melee weapons dominate over long-range ones
        // when multiple weapons are equipped (player needs to be in melee range to use them).
        autoMoveStopRange = autoMoveStopRange === null ? effectiveRange : Math.min(autoMoveStopRange, effectiveRange);
        hasWeapon = true;
      }

      // Include the sand blade if enabled and not suppressed by the diamond blade.
      // The sand blade is tier-1 by default; its stop range is well inside actual reach (30px).
      if (rpgSimState.sandBladeEnabled && !hasDiamondBlade) {
        const sandBladeStopRange = getSwordLength(1) * AUTO_MOVE_MELEE_STOP_MARGIN;
        autoMoveStopRange = autoMoveStopRange === null ? sandBladeStopRange : Math.min(autoMoveStopRange, sandBladeStopRange);
        hasWeapon = true;
      }

      // Fallback: no usable weapon → keep a neutral distance (don't charge into danger).
      if (autoMoveStopRange === null) autoMoveStopRange = PLAYER_BASE_RANGE_PX;
      void hasWeapon; // used above, suppress lint if needed

      const { distSq: nearestDistSq, x: nearestX, y: nearestY } = _findNearestEnemy(ctx);
      if (nearestDistSq < Infinity) {
        const ex = nearestX - mote.x, ey = nearestY - mote.y;
        const d = Math.sqrt(ex * ex + ey * ey);
        if (d > autoMoveStopRange) {
          // Choose a goal point near the enemy but respecting stop range.
          // Pull the goal back along the enemy→player direction by autoMoveStopRange.
          const goalX = d > autoMoveStopRange
            ? mote.x + (ex / d) * (d - autoMoveStopRange * 0.8)
            : nearestX;
          const goalY = d > autoMoveStopRange
            ? mote.y + (ey / d) * (d - autoMoveStopRange * 0.8)
            : nearestY;

          const terrain = ctx.getTerrainState();
          const hasLos = hasTopographicTerrainLineOfSight(terrain, mote.x, mote.y, nearestX, nearestY);

          let steerDx: number, steerDy: number;
          if (hasLos) {
            // Direct line of sight: steer straight toward the goal.
            steerDx = ex / d; steerDy = ey / d;
          } else {
            // Terrain blocks direct path: use A* pathfinding.
            const navGrid = ctx.getNavGrid();
            const speed = Math.sqrt(mote.vx * mote.vx + mote.vy * mote.vy);
            const dir = computePathSteeredDirection(
              _playerPathState,
              mote.x, mote.y,
              goalX, goalY,
              performance.now(),
              navGrid,
              terrain,
              PLAYER_REPATH_MS,
              speed,
            );
            steerDx = dir.dx; steerDy = dir.dy;
          }

          mote.vx = steerDx * effectiveMaxSpeed;
          mote.vy = steerDy * effectiveMaxSpeed;
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

  // ── Position integration with deterministic AABB collision ────────────────
  // Resolves X then Y independently so diagonal-into-wall movement slides
  // cleanly along the free axis with no oscillation or bounce-back.
  const half = RPG_MOTE_SIZE / 2;
  const ab = ctx.isBossWaveActive
    ? ctx.getFieldSpace().safeCoreBounds
    : ctx.getFieldSpace().activeBounds;
  const terrainState = ctx.getTerrainState();
  const wallState = ctx.getVerdureCaveWallState?.() ?? null;
  const _solidCtx = buildActorSolidCtx(ab, terrainState, wallState);
  actorMoveX(mote, half, half, mote.vx * dt, _solidCtx, () => { mote.vx = 0; });
  actorMoveY(mote, half, half, mote.vy * dt, _solidCtx, () => { mote.vy = 0; });

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
    for (const e of ctx.eliteEnemies) checkAimEnemy(e);
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
    ctx.fracterylEnemies.length > 0  || ctx.eigensteinEnemies.length > 0 ||
    ctx.eliteEnemies.length > 0
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
  for (const e of ctx.eliteEnemies) check(e);

  return { distSq: nearestDistSq, x: nearestX, y: nearestY };
}
