/**
 * rpg-procedural-fish-update.ts — Per-frame update logic for the 8 fish
 * creature types and fish-related projectiles/hazards.
 *
 * Fish use Boids-style schooling (schoolSwimStep) layered on top of the shared
 * contact-damage model.  Species-specific behaviours (lunge, dash, teleport,
 * diamond armour) are implemented per function.
 *
 * Navigation in Caustics (and any other zone with terrain):
 *   schoolSwimStep integrates A* path steering from the zone nav grid so fish
 *   route around topology islands instead of pressing straight into them.
 *   A multi-angle terrain probe fan is used for immediate local avoidance when
 *   the forward path is blocked.  A stuck-detection system forces repathing and
 *   boosts terrain avoidance when a fish has been near-stationary for too long.
 *
 * Extracted from rpg-procedural-update.ts to keep that file manageable.
 */

import { type RpgEnemyCtx, applyEnemyTerrainPushOut } from './rpg-enemy-updates';
import type {
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
  SchoolableFish,
} from './rpg-procedural-types';
import {
  PROC_CONTACT_RADIUS, PROC_CONTACT_CD_MS, PROC_PATROL_SPEED,
  SANDFISH_SIZE, QUARTZFISH_SIZE, RUBYFISH_SIZE, SUNSTONEFISH_SIZE,
  EMERALDFISH_SIZE, EMERALDFISH_MINI_SIZE, SAPPHIREFISH_SIZE, AMETHYSTFISH_SIZE, DIAMONDFISH_SIZE,
  SANDFISH_LUNGE_CD_MS, RUBYFISH_DASH_WINDUP_MS, RUBYFISH_DASH_MS, RUBYFISH_RECOVERY_MS,
  SUNSTONEFISH_MINE_CD_MS, SUNSTONEFISH_MINE_COUNT, SAPPHIREFISH_BOLT_CD_MS,
  AMETHYSTFISH_TELEPORT_CD_MS, DIAMONDFISH_ARMOR_ON_MS, DIAMONDFISH_ARMOR_OFF_MS,
  FISH_SCHOOL_SEPARATION_RADIUS, FISH_SCHOOL_ALIGNMENT_RADIUS, FISH_SCHOOL_COHESION_RADIUS,
  FISH_SCHOOL_SEPARATION_WEIGHT, FISH_SCHOOL_ALIGNMENT_WEIGHT, FISH_SCHOOL_COHESION_WEIGHT,
  FISH_SCHOOL_PLAYER_SEEK_WEIGHT, FISH_SCHOOL_TERRAIN_AVOID_WEIGHT, FISH_SCHOOL_EDGE_AVOID_WEIGHT,
  FISH_SCHOOL_MAX_TURN_RATE, FISH_SCHOOL_MAX_SPEED, FISH_SCHOOL_PROBE_DIST, FISH_SCHOOL_EDGE_MARGIN,
  FISH_STUCK_SPEED_THRESHOLD, FISH_STUCK_THRESHOLD_MS, FISH_STUCK_RECOVERY_MS,
} from './rpg-procedural-constants';
import { makeFishMine, makeFishSpike, makeFishBolt, makeFishDecoy } from './rpg-procedural-factories';
import { TARGET_FRAME_MS, PLAYER_HIT_RADIUS } from './rpg-constants';
import {
  circleIntersectsTopographicTerrain,
  segmentIntersectsTopographicTerrain,
  signedDistanceToTerrainBoundary,
} from './terrain/topographic-terrain';
import {
  computePathSteeredDirection,
  type RpgPathState,
} from './terrain/rpg-pathfinding';

/** Check contact damage (mirrors the same helper in rpg-procedural-update.ts). */
function contactDamage(
  e: { x: number; y: number; atk: number; contactCdMs: number; hitFlashMs: number },
  dt: number,
  ctx: RpgEnemyCtx,
): void {
  if (e.contactCdMs > 0) {
    e.contactCdMs -= dt * TARGET_FRAME_MS;
    return;
  }
  const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
  if (dx * dx + dy * dy <= (PROC_CONTACT_RADIUS + PLAYER_HIT_RADIUS) ** 2) {
    ctx.dealDamageToPlayer(e.atk);
    e.contactCdMs = PROC_CONTACT_CD_MS;
  }
}

// ── Fish helpers ────────────────────────────────────────────────────────────────

/**
 * SwimEntity is the mutable fish type used inside schoolSwimStep.
 * It extends SchoolableFish with the per-fish navigation state fields
 * added to BaseFishEnemy.
 */
type SwimEntity = SchoolableFish & {
  pathState: RpgPathState;
  stuckMs: number;
  stuckRecoveryMs: number;
};

// Pre-computed squared radii — avoids repeated ** in the per-entity inner loop.
const _SEP_R2 = FISH_SCHOOL_SEPARATION_RADIUS ** 2;
const _ALI_R2 = FISH_SCHOOL_ALIGNMENT_RADIUS  ** 2;
const _COH_R2 = FISH_SCHOOL_COHESION_RADIUS   ** 2;
// Tighter separation radius for mini fish (squared).
const _MINI_SEP_R2 = (FISH_SCHOOL_SEPARATION_RADIUS * 0.65) ** 2;
const FISH_MOVEMENT_SPEED_MULTIPLIER = 3;
const FISH_TERRAIN_BERTH_PROBE_MULTIPLIER = 2.25;
const FISH_TERRAIN_MIN_BERTH_PX = 22;
const FISH_TERRAIN_CLOSE_PLAYER_BERTH_PX = 12;
const FISH_TERRAIN_BERTH_REPATH_PX = 12;
const FISH_TERRAIN_BERTH_WEIGHT = 1.35;
const _terrainNearestScratch = { x: 0, y: 0 };

function _hasTerrainBerth(
  terrain: NonNullable<ReturnType<RpgEnemyCtx['getTerrainState']>>,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
  clearancePx: number,
): boolean {
  if (segmentIntersectsTopographicTerrain(terrain, fromX, fromY, toX, toY)) return false;
  const midX = (fromX + toX) * 0.5;
  const midY = (fromY + toY) * 0.5;
  if (circleIntersectsTopographicTerrain(terrain, midX, midY, clearancePx)) return false;
  return !circleIntersectsTopographicTerrain(terrain, toX, toY, clearancePx);
}

/**
 * Try several candidate escape angles (starting from the most player-aligned)
 * and return the direction unit vector of the first clear probe, or null.
 *
 * @param terrain  — terrain state from ctx.getTerrainState()
 * @param ex/ey    — fish world position
 * @param angles   — candidate angles to try, in preference order
 * @param probeDist — probe length
 */
function _tryEscape(
  terrain: NonNullable<ReturnType<RpgEnemyCtx['getTerrainState']>>,
  ex: number, ey: number,
  angles: readonly number[],
  probeDist: number,
  clearancePx: number,
): { dx: number; dy: number } | null {
  for (const a of angles) {
    const px = ex + Math.cos(a) * probeDist;
    const py = ey + Math.sin(a) * probeDist;
    if (_hasTerrainBerth(terrain, ex, ey, px, py, clearancePx)) {
      return { dx: Math.cos(a), dy: Math.sin(a) };
    }
  }
  return null;
}

/**
 * Fish locomotion step that incorporates Boids-style schooling, A* terrain-aware
 * path steering, multi-angle obstacle probing, and stuck detection/recovery.
 *
 * Steering layers (blended into a single desired heading):
 *  1. Separation    — steer away from close neighbours.
 *  2. Alignment     — match the heading of nearby neighbours.
 *  3. Cohesion      — steer toward the local group centre of mass.
 *  4. Player seek   — A*-guided path direction when a nav grid is available;
 *                     otherwise direct seek toward the player.
 *  5. Edge avoidance — soft push inward before hard boundary clamp.
 *  6. Terrain anticipation — multi-angle fan probe; steer to first open direction.
 *
 * Stuck detection: when the fish speed is below FISH_STUCK_SPEED_THRESHOLD for
 * FISH_STUCK_THRESHOLD_MS ms, a stuck event fires — the path state is forced to
 * repath immediately, terrain avoidance weight is boosted for FISH_STUCK_RECOVERY_MS,
 * and a small random escape nudge is added to prevent all fish picking the same vector.
 *
 * @param e        — mutable fish entity (satisfies SwimEntity)
 * @param dt       — frame delta (1 = one target frame)
 * @param ctx      — shared enemy update context
 * @param speedMul — per-fish speed multiplier (unchanged from original swimStep)
 * @param school   — read-only list of ALL active fish this frame (self excluded inside)
 */
function schoolSwimStep(
  e: SwimEntity,
  dt: number,
  ctx: RpgEnemyCtx,
  speedMul: number,
  school: readonly SchoolableFish[],
): void {
  const approxDeltaMs = dt * TARGET_FRAME_MS;
  const terrain = ctx.getTerrainState();
  const navGrid = ctx.getNavGrid();

  // ── Current speed (before this tick) ─────────────────────────────────────
  const curSpd = Math.sqrt(e.vx * e.vx + e.vy * e.vy);

  // ── Stuck detection ───────────────────────────────────────────────────────
  if (curSpd < FISH_STUCK_SPEED_THRESHOLD) {
    e.stuckMs += approxDeltaMs;
    if (e.stuckMs >= FISH_STUCK_THRESHOLD_MS) {
      // Trigger recovery: force immediate repath + boost avoidance window.
      e.stuckMs = 0;
      e.stuckRecoveryMs = FISH_STUCK_RECOVERY_MS;
      // Force A* repath on next computePathSteeredDirection call.
      e.pathState.nextRepathMs = 0;
    }
  } else {
    // Moving — decay stuck timer faster than it accumulates, but don't zero-snap.
    e.stuckMs = Math.max(0, e.stuckMs - approxDeltaMs * 1.5);
  }

  // Decay recovery window.
  if (e.stuckRecoveryMs > 0) {
    e.stuckRecoveryMs = Math.max(0, e.stuckRecoveryMs - approxDeltaMs);
  }
  const isRecovering = e.stuckRecoveryMs > 0;

  // ── 1–3. Boids neighbour scan ─────────────────────────────────────────────
  let sepX = 0, sepY = 0;
  let aliVx = 0, aliVy = 0, aliCount = 0;
  let cohSumX = 0, cohSumY = 0, cohCount = 0;

  // Mini fish school tighter.
  const sepR2 = e.isMini ? _MINI_SEP_R2 : _SEP_R2;

  for (const n of school) {
    if (n === e) continue;
    const ndx = e.x - n.x;
    const ndy = e.y - n.y;
    const dsq = ndx * ndx + ndy * ndy;

    // Separation (close neighbours)
    if (dsq < sepR2 && dsq > 0) {
      const dist = Math.sqrt(dsq);
      sepX += ndx / dist;
      sepY += ndy / dist;
    }
    // Alignment (medium range)
    if (dsq < _ALI_R2) {
      aliVx += n.vx;
      aliVy += n.vy;
      aliCount++;
    }
    // Cohesion (wider range)
    if (dsq < _COH_R2) {
      cohSumX += n.x;
      cohSumY += n.y;
      cohCount++;
    }
  }

  // Normalise alignment vector
  let aliX = 0, aliY = 0;
  if (aliCount > 0) {
    aliX = aliVx / aliCount;
    aliY = aliVy / aliCount;
    const aliLen = Math.sqrt(aliX * aliX + aliY * aliY);
    if (aliLen > 0.001) { aliX /= aliLen; aliY /= aliLen; }
  }

  // Cohesion: direction toward centre of mass
  let cohX = 0, cohY = 0;
  if (cohCount > 0) {
    cohX = cohSumX / cohCount - e.x;
    cohY = cohSumY / cohCount - e.y;
    const cohLen = Math.sqrt(cohX * cohX + cohY * cohY);
    if (cohLen > 0.001) { cohX /= cohLen; cohY /= cohLen; }
  }

  // ── 4. Player seek (A*-guided when terrain and nav grid are available) ────
  let seekX: number, seekY: number;

  if (terrain && navGrid) {
    // Use the existing A* steering helper — throttled internally to DEFAULT_REPATH_MS.
    const steered = computePathSteeredDirection(
      e.pathState,
      e.x, e.y,
      ctx.mote.x, ctx.mote.y,
      performance.now(),
      navGrid,
      terrain,
      undefined,
      curSpd,
    );
    if (steered) {
      seekX = steered.dx;
      seekY = steered.dy;
    } else {
      // Fallback: direct seek (e.g. path not yet computed this tick).
      const pdx = ctx.mote.x - e.x;
      const pdy = ctx.mote.y - e.y;
      const pLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
      seekX = pdx / pLen;
      seekY = pdy / pLen;
    }
  } else {
    // No terrain/nav grid — direct seek as before.
    const pdx = ctx.mote.x - e.x;
    const pdy = ctx.mote.y - e.y;
    const pLen = Math.sqrt(pdx * pdx + pdy * pdy) || 1;
    seekX = pdx / pLen;
    seekY = pdy / pLen;
  }

  // ── 5. Edge avoidance ─────────────────────────────────────────────────────
  let edgeX = 0, edgeY = 0;
  const em = FISH_SCHOOL_EDGE_MARGIN;
  if (e.x < ctx.viewport.left + em) {
    edgeX += (ctx.viewport.left + em - e.x) / em;
  } else if (e.x > ctx.viewport.right - em) {
    edgeX -= (e.x - (ctx.viewport.right - em)) / em;
  }
  if (e.y < ctx.viewport.top + em) {
    edgeY += (ctx.viewport.top + em - e.y) / em;
  } else if (e.y > ctx.viewport.bottom - em) {
    edgeY -= (e.y - (ctx.viewport.bottom - em)) / em;
  }

  // ── 6. Terrain anticipation — multi-angle fan probe ───────────────────────
  let terrX = 0, terrY = 0;
  let berthX = 0, berthY = 0;
  let terrainHit = false;
  if (terrain) {
    const playerDist = Math.hypot(ctx.mote.x - e.x, ctx.mote.y - e.y);
    const isPlayerCloseToFish = playerDist <= FISH_SCHOOL_PROBE_DIST * 2;
    const berthClearancePx = isPlayerCloseToFish
      ? FISH_TERRAIN_CLOSE_PLAYER_BERTH_PX
      : FISH_TERRAIN_MIN_BERTH_PX;

    const signedDist = signedDistanceToTerrainBoundary(terrain, e.x, e.y, _terrainNearestScratch);
    if (signedDist < berthClearancePx) {
      const awayX = signedDist < 0 ? _terrainNearestScratch.x - e.x : e.x - _terrainNearestScratch.x;
      const awayY = signedDist < 0 ? _terrainNearestScratch.y - e.y : e.y - _terrainNearestScratch.y;
      const awayLen = Math.sqrt(awayX * awayX + awayY * awayY) || 1;
      const proximity01 = Math.min(
        1,
        Math.max(0, (berthClearancePx - signedDist) / berthClearancePx),
      );
      const berthStrength = proximity01 * proximity01;
      berthX = (awayX / awayLen) * berthStrength;
      berthY = (awayY / awayLen) * berthStrength;
      if (signedDist < FISH_TERRAIN_BERTH_REPATH_PX) {
        e.pathState.nextRepathMs = 0;
      }
    }

    // Keep a modest buffer from topology while pursuing, but relax it near the
    // player so fish can still reach a player pressed against an island.
    const berthScale = !isPlayerCloseToFish
      ? FISH_TERRAIN_BERTH_PROBE_MULTIPLIER
      : 1;
    const terrainProbeDist = FISH_SCHOOL_PROBE_DIST * berthScale;
    const probeX = e.x + Math.cos(e.swimAngle) * terrainProbeDist;
    const probeY = e.y + Math.sin(e.swimAngle) * terrainProbeDist;
    if (!_hasTerrainBerth(terrain, e.x, e.y, probeX, probeY, berthClearancePx)) {
      terrainHit = true;
      // Build a fan of candidate escape angles ordered by proximity to the
      // player-seek direction so fish preferentially route around in the correct
      // direction.  Player-side perpendicular is tried first, then ±45°, ±90°,
      // and ±135° (backward near-reversal as last resort).
      const toPlayerAngle = Math.atan2(ctx.mote.y - e.y, ctx.mote.x - e.x);
      const leftOf  = e.swimAngle + Math.PI / 4;
      const rightOf = e.swimAngle - Math.PI / 4;
      const left90  = e.swimAngle + Math.PI / 2;
      const right90 = e.swimAngle - Math.PI / 2;
      const left135 = e.swimAngle + (3 * Math.PI / 4);
      const right135 = e.swimAngle - (3 * Math.PI / 4);
      // Determine which perpendicular is closer to the player direction.
      const diffLeft  = Math.abs(((left90  - toPlayerAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const diffRight = Math.abs(((right90 - toPlayerAngle + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      const [firstPerp, secondPerp]   = diffLeft <= diffRight ? [left90, right90] : [right90, left90];
      const [firstDiag, secondDiag]   = diffLeft <= diffRight ? [leftOf, rightOf] : [rightOf, leftOf];
      const [firstBack, secondBack]   = diffLeft <= diffRight ? [left135, right135] : [right135, left135];
      const escapeCandidates: number[] = [firstDiag, secondDiag, firstPerp, secondPerp, firstBack, secondBack];
      const escape = _tryEscape(terrain, e.x, e.y, escapeCandidates, terrainProbeDist, berthClearancePx);
      if (escape) {
        terrX = escape.dx;
        terrY = escape.dy;
      } else {
        // All probes blocked (fully enclosed) — push backward.
        terrX = -Math.cos(e.swimAngle);
        terrY = -Math.sin(e.swimAngle);
      }
    }
  }

  // ── Terrain avoidance weight — boosted during stuck recovery ─────────────
  const terrW = FISH_SCHOOL_TERRAIN_AVOID_WEIGHT * (isRecovering ? 2.5 : 1.0);

  // During recovery with no terrain hit, add a small random perpendicular nudge
  // to break symmetry so fish groups don't all pick the same escape direction.
  let nudgeX = 0, nudgeY = 0;
  if (isRecovering && !terrainHit) {
    const nudgeAngle = e.swimAngle + Math.PI / 2 * (Math.random() < 0.5 ? 1 : -1);
    nudgeX = Math.cos(nudgeAngle) * 0.4;
    nudgeY = Math.sin(nudgeAngle) * 0.4;
  }

  // ── Blend all steering forces ─────────────────────────────────────────────
  const desX = sepX  * FISH_SCHOOL_SEPARATION_WEIGHT
             + aliX  * FISH_SCHOOL_ALIGNMENT_WEIGHT
             + cohX  * FISH_SCHOOL_COHESION_WEIGHT
             + seekX * FISH_SCHOOL_PLAYER_SEEK_WEIGHT
             + edgeX * FISH_SCHOOL_EDGE_AVOID_WEIGHT
             + terrX * terrW
             + berthX * FISH_TERRAIN_BERTH_WEIGHT
             + nudgeX;
  const desY = sepY  * FISH_SCHOOL_SEPARATION_WEIGHT
             + aliY  * FISH_SCHOOL_ALIGNMENT_WEIGHT
             + cohY  * FISH_SCHOOL_COHESION_WEIGHT
             + seekY * FISH_SCHOOL_PLAYER_SEEK_WEIGHT
             + edgeY * FISH_SCHOOL_EDGE_AVOID_WEIGHT
             + terrY * terrW
             + berthY * FISH_TERRAIN_BERTH_WEIGHT
             + nudgeY;

  // Derive target angle from the blended heading.
  const desLen = Math.sqrt(desX * desX + desY * desY);
  let targetAngle: number;
  if (desLen < 0.001) {
    targetAngle = Math.atan2(ctx.mote.y - e.y, ctx.mote.x - e.x);
  } else {
    targetAngle = Math.atan2(desY / desLen, desX / desLen);
  }

  // Add sinusoidal wander (reduced amplitude since schooling shapes the path).
  e.turnPhase += dt * 0.04;
  targetAngle  += Math.sin(e.turnPhase) * 0.20;

  // Clamp turn rate — same style as original swimStep.
  let delta = targetAngle - e.swimAngle;
  while (delta >  Math.PI) delta -= Math.PI * 2;
  while (delta < -Math.PI) delta += Math.PI * 2;
  const maxTurn = FISH_SCHOOL_MAX_TURN_RATE * dt;
  e.swimAngle += Math.max(-maxTurn, Math.min(maxTurn, delta * 0.14));

  // ── Tail-kick thrust (preserved from original swimStep) ───────────────────
  const kick  = 0.65 + 0.35 * Math.max(0, Math.sin(e.animPhase * 2.8));
  const speed = PROC_PATROL_SPEED * 0.85 * speedMul * FISH_MOVEMENT_SPEED_MULTIPLIER;
  e.vx += Math.cos(e.swimAngle) * speed * kick * 0.09;
  e.vy += Math.sin(e.swimAngle) * speed * kick * 0.09;

  // ── Velocity damping ──────────────────────────────────────────────────────
  e.vx *= 0.91;
  e.vy *= 0.91;

  // ── Speed clamp (prevent runaway from accumulated boids forces) ───────────
  const spd2 = e.vx * e.vx + e.vy * e.vy;
  const maxSpeed = FISH_SCHOOL_MAX_SPEED * FISH_MOVEMENT_SPEED_MULTIPLIER;
  if (spd2 > maxSpeed * maxSpeed) {
    const spd = Math.sqrt(spd2);
    e.vx = (e.vx / spd) * maxSpeed;
    e.vy = (e.vy / spd) * maxSpeed;
  }

  // ── Move + clamp ──────────────────────────────────────────────────────────
  e.x += e.vx * dt;
  e.y += e.vy * dt;
  ctx.clampEnemyToBounds(e);
}

function hitPlayerProjectile(
  p: { x: number; y: number; atk: number; hasHit?: boolean },
  ctx: RpgEnemyCtx,
  radius: number,
): boolean {
  const dx = ctx.mote.x - p.x;
  const dy = ctx.mote.y - p.y;
  if (dx * dx + dy * dy <= (PLAYER_HIT_RADIUS + radius) ** 2) {
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    ctx.dealDamageToPlayerKnockback(p.atk, -dx / len, -dy / len);
    if ('hasHit' in p) p.hasHit = true;
    return true;
  }
  return false;
}

export function updateSandFishEnemies(
  enemies: SandFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.lungeTimerMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, 1.15, school);
    if (e.lungeTimerMs <= 0) {
      const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      e.vx += (dx / len) * 1.8;
      e.vy += (dy / len) * 1.8;
      e.lungeTimerMs = SANDFISH_LUNGE_CD_MS;
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), SANDFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateQuartzFishEnemies(
  enemies: QuartzFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.shieldBroken = e.shieldHp <= 0;
    schoolSwimStep(e, dt, ctx, e.shieldBroken ? 1.05 : 0.85, school);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), QUARTZFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateRubyFishEnemies(
  enemies: RubyFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.dashTimerMs -= deltaMs;
    if (e.dashState === 'idle') {
      schoolSwimStep(e, dt, ctx, 1.1, school);
      if (e.dashTimerMs <= 0) {
        e.dashState = 'windup';
        e.dashTimerMs = RUBYFISH_DASH_WINDUP_MS;
      }
    } else if (e.dashState === 'windup') {
      const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      e.dashVx = (dx / len) * 3.4;
      e.dashVy = (dy / len) * 3.4;
      if (e.dashTimerMs <= 0) {
        e.dashState = 'dash';
        e.dashTimerMs = RUBYFISH_DASH_MS;
      }
    } else if (e.dashState === 'dash') {
      e.swimAngle = Math.atan2(e.dashVy, e.dashVx); // face the dash direction
      e.vx = e.dashVx; e.vy = e.dashVy;
      e.x += e.vx * dt; e.y += e.vy * dt;
      ctx.clampEnemyToBounds(e);
      if (e.dashTimerMs <= 0) {
        e.dashState = 'recovery';
        e.dashTimerMs = RUBYFISH_RECOVERY_MS;
      }
    } else {
      schoolSwimStep(e, dt, ctx, 0.75, school);
      if (e.dashTimerMs <= 0) {
        e.dashState = 'idle';
        e.dashTimerMs = RUBYFISH_DASH_WINDUP_MS + RUBYFISH_RECOVERY_MS;
      }
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), RUBYFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateSunstoneFishEnemies(
  enemies: SunstoneFishEnemy[],
  mines: FishMine[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.mineTimerMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, 0.95, school);
    if (e.mineTimerMs <= 0) {
      for (let i = 0; i < SUNSTONEFISH_MINE_COUNT; i++) {
        const a = e.animPhase + (i / SUNSTONEFISH_MINE_COUNT) * Math.PI * 2;
        mines.push(makeFishMine(e.x, e.y, Math.cos(a) * 0.35, Math.sin(a) * 0.35, e.atk));
      }
      e.mineTimerMs = SUNSTONEFISH_MINE_CD_MS;
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), SUNSTONEFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateEmeraldFishEnemies(
  enemies: EmeraldFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, e.isMini ? 1.25 : 1.0, school);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), (e.isMini ? EMERALDFISH_MINI_SIZE : EMERALDFISH_SIZE) / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateSapphireFishEnemies(
  enemies: SapphireFishEnemy[],
  bolts: FishBolt[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.boltTimerMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, 0.9, school);
    if (e.boltTimerMs <= 0) {
      const dx = ctx.mote.x - e.x, dy = ctx.mote.y - e.y;
      const len = Math.sqrt(dx * dx + dy * dy) || 1;
      bolts.push(makeFishBolt(e.x, e.y, (dx / len) * 1.9, (dy / len) * 1.9, e.atk));
      e.boltTimerMs = SAPPHIREFISH_BOLT_CD_MS;
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), SAPPHIREFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateAmethystFishEnemies(
  enemies: AmethystFishEnemy[],
  decoys: FishDecoy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.teleportCdMs -= deltaMs;
    schoolSwimStep(e, dt, ctx, 1.0, school);
    if (e.teleportCdMs <= 0) {
      decoys.push(makeFishDecoy(e.x, e.y, e.swimAngle, e.animPhase));
      const angle = Math.random() * Math.PI * 2;
      const dist = 48 + Math.random() * 28;
      e.x = Math.max(ctx.viewport.left + 10, Math.min(ctx.viewport.right - 10, ctx.mote.x + Math.cos(angle) * dist));
      e.y = Math.max(ctx.viewport.top + 10, Math.min(ctx.viewport.bottom - 10, ctx.mote.y + Math.sin(angle) * dist));
      e.teleportCdMs = AMETHYSTFISH_TELEPORT_CD_MS;
    }
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), AMETHYSTFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateDiamondFishEnemies(
  enemies: DiamondFishEnemy[],
  ctx: RpgEnemyCtx,
  deltaMs: number,
  school: readonly SchoolableFish[] = [],
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (const e of enemies) {
    e.animPhase += deltaMs / 1000;
    if (e.hitFlashMs > 0) e.hitFlashMs -= deltaMs;
    e.armorTimerMs -= deltaMs;
    if (e.armorTimerMs <= 0) {
      e.armorActive = !e.armorActive;
      e.armorTimerMs = e.armorActive ? DIAMONDFISH_ARMOR_ON_MS : DIAMONDFISH_ARMOR_OFF_MS;
    }
    schoolSwimStep(e, dt, ctx, e.armorActive ? 0.8 : 1.05, school);
    applyEnemyTerrainPushOut(e, ctx.getTerrainState(), DIAMONDFISH_SIZE / 2);
    contactDamage(e, dt, ctx);
  }
}

export function updateFishMines(mines: FishMine[], spikes: FishSpike[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = mines.length - 1; i >= 0; i--) {
    const m = mines[i];
    m.lifeMs -= deltaMs;
    m.armedMs -= deltaMs;
    m.x += m.vx * dt;
    m.y += m.vy * dt;
    if (m.lifeMs <= 0) { mines.splice(i, 1); continue; }
    if (m.armedMs <= 0 && hitPlayerProjectile({ x: m.x, y: m.y, atk: m.atk }, ctx, 6)) {
      for (let s = 0; s < 8; s++) {
        const a = (s / 8) * Math.PI * 2;
        spikes.push(makeFishSpike(m.x, m.y, Math.cos(a) * 2.4, Math.sin(a) * 2.4, Math.max(1, m.atk * 0.8)));
      }
      mines.splice(i, 1);
    }
  }
}

export function updateFishSpikes(spikes: FishSpike[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = spikes.length - 1; i >= 0; i--) {
    const s = spikes[i];
    s.lifeMs -= deltaMs;
    s.x += s.vx * dt;
    s.y += s.vy * dt;
    if (s.lifeMs <= 0 || s.hasHit) { spikes.splice(i, 1); continue; }
    if (hitPlayerProjectile(s, ctx, 4)) spikes.splice(i, 1);
  }
}

export function updateFishBolts(bolts: FishBolt[], ctx: RpgEnemyCtx, deltaMs: number): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  for (let i = bolts.length - 1; i >= 0; i--) {
    const b = bolts[i];
    b.lifeMs -= deltaMs;
    const dx = ctx.mote.x - b.x, dy = ctx.mote.y - b.y;
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    b.vx = b.vx * 0.97 + (dx / len) * 0.08;
    b.vy = b.vy * 0.97 + (dy / len) * 0.08;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.lifeMs <= 0 || b.hasHit) { bolts.splice(i, 1); continue; }
    if (hitPlayerProjectile(b, ctx, 4)) bolts.splice(i, 1);
  }
}

export function updateFishDecoys(decoys: FishDecoy[], deltaMs: number): void {
  for (let i = decoys.length - 1; i >= 0; i--) {
    const d = decoys[i];
    d.lifeMs -= deltaMs;
    d.animPhase += deltaMs / 1000;
    if (d.lifeMs <= 0) decoys.splice(i, 1);
  }
}

