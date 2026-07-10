/**
 * rpg-actor-collision.ts — Deterministic AABB actor-vs-solid collision for the RPG tab.
 *
 * Implements a Celeste / TowerFall-inspired movement resolver adapted for
 * top-down gameplay.  Key properties:
 *
 *  • Actors (player, enemies) and Solids (walls, terrain, cave walls) are strictly
 *    separated.
 *  • Movement resolves one axis at a time (moveX then moveY), giving clean
 *    diagonal-into-wall sliding with no oscillation or bounce-back.
 *  • Subpixel remainders accumulate across frames so fractional velocities
 *    never lose precision.
 *  • Solids are queried before each pixel step; actors never overlap solids in
 *    steady-state movement.
 *
 * Supported solid types:
 *  • Arena boundary — 4 hard walls from the active field-space bounds.
 *  • Topographic terrain — polygon islands (Caustics / Euhedral / Horizon / basalt).
 *  • Verdure organic cave walls — depth-sampled boundary curves.
 *  • Axis-aligned rect solids — extensible for obstacles / destructibles.
 *
 * Usage — for any movable entity:
 *
 *   const ctx = buildActorSolidCtx(viewport, terrain, verdureWall);
 *   actorMoveX(entity, halfSize, halfSize, entity.vx * dt, ctx, () => { entity.vx = 0; });
 *   actorMoveY(entity, halfSize, halfSize, entity.vy * dt, ctx, () => { entity.vy = 0; });
 *
 * Call actorMoveX before actorMoveY every frame for consistent diagonal sliding:
 *   X blocked + Y free → slides vertically.
 *   Y blocked + X free → slides horizontally.
 *   Both blocked (corner) → stops flush, no oscillation.
 *
 * Spawn overlap recovery — entities placed inside a solid (teleport, spawn):
 *
 *   resolveSpawnOverlap(entity, halfSize, ctx);  // one-shot, not per-frame
 */

import {
  circleIntersectsTopographicTerrain,
  pushPointOutsideTopographicTerrain,
  type TopographicTerrainState,
} from './terrain/topographic-terrain';
import {
  isPointInVerdureWall,
  pushPointOutsideVerdureWall,
  type VerdureCaveWallState,
} from './terrain/verdure-cave-walls';

// ── Types ──────────────────────────────────────────────────────────────────────

export type AABB = { x: number; y: number; w: number; h: number };

export interface SolidCollider {
  id: string;
  bounds: AABB;
  collidable: boolean;
  kind?: string;
}

export interface CollisionHit {
  solid: SolidCollider;
  axis: 'x' | 'y';
  dir: -1 | 1;
}

/**
 * Collision context passed to every actor move call.
 *
 * arenaLeft/arenaRight/arenaTop/arenaBottom are world-space wall positions.
 * The entity AABB half-extents are compared against these directly, so:
 *   cx - halfW < arenaLeft  → left edge hit left wall.
 */
export interface ActorSolidCtx {
  arenaLeft: number;
  arenaRight: number;
  arenaTop: number;
  arenaBottom: number;
  terrain: TopographicTerrainState | null;
  verdureWall: VerdureCaveWallState | null;
  /** Axis-aligned rect solids (obstacles, destructibles). Optional. */
  rectSolids?: readonly SolidCollider[];
}

// ── Sentinel solid colliders ───────────────────────────────────────────────────

const _NULL_AABB: AABB = { x: 0, y: 0, w: 0, h: 0 };

/** Returned when the entity hits an arena boundary. */
export const ARENA_WALL_SOLID: SolidCollider = {
  id: '__arena', bounds: _NULL_AABB, collidable: true, kind: 'arena-wall',
};
/** Returned when the entity overlaps a terrain polygon. */
export const TERRAIN_SOLID: SolidCollider = {
  id: '__terrain', bounds: _NULL_AABB, collidable: true, kind: 'terrain',
};
/** Returned when the entity overlaps a Verdure cave wall. */
export const VERDURE_WALL_SOLID: SolidCollider = {
  id: '__verdure', bounds: _NULL_AABB, collidable: true, kind: 'verdure-wall',
};

// ── Context helper ─────────────────────────────────────────────────────────────

/**
 * Build an ActorSolidCtx from a viewport bounds object plus optional terrain
 * and Verdure wall states.
 *
 * Accepts any object with `left / top / right / bottom` (both `activeBounds`
 * and the `viewport` alias on RpgEnemyCtx have this shape).
 */
export function buildActorSolidCtx(
  bounds: { left: number; top: number; right: number; bottom: number },
  terrain: TopographicTerrainState | null,
  verdureWall: VerdureCaveWallState | null | undefined,
  rectSolids?: readonly SolidCollider[],
): ActorSolidCtx {
  return {
    arenaLeft:   bounds.left,
    arenaRight:  bounds.right,
    arenaTop:    bounds.top,
    arenaBottom: bounds.bottom,
    terrain,
    verdureWall: verdureWall ?? null,
    rectSolids,
  };
}

// ── Overlap test ───────────────────────────────────────────────────────────────

/**
 * Returns the first solid that a circle/AABB centred at `(cx, cy)` with
 * half-extents `(hw, hh)` would overlap, or `null` if the position is free.
 *
 * Terrain uses a circle radius test (radius = hw); entities are conceptually
 * circular in this top-down game.  Verdure walls use center + 4 cardinal
 * samples to approximate that circle.  Arena bounds and rect solids use AABB.
 */
function _firstSolidAt(
  cx: number,
  cy: number,
  hw: number,
  hh: number,
  ctx: ActorSolidCtx,
): SolidCollider | null {
  // 1. Arena hard walls.
  if (cx - hw < ctx.arenaLeft  || cx + hw > ctx.arenaRight ||
      cy - hh < ctx.arenaTop   || cy + hh > ctx.arenaBottom) {
    return ARENA_WALL_SOLID;
  }

  // 2. Topographic terrain polygon — circle test against all active polygons.
  if (ctx.terrain && circleIntersectsTopographicTerrain(ctx.terrain, cx, cy, hw)) {
    return TERRAIN_SOLID;
  }

  // 3. Verdure organic cave wall — 5-point circle approximation.
  if (ctx.verdureWall) {
    const w = ctx.verdureWall;
    if (isPointInVerdureWall(w, cx,      cy     ) ||
        isPointInVerdureWall(w, cx - hw, cy     ) ||
        isPointInVerdureWall(w, cx + hw, cy     ) ||
        isPointInVerdureWall(w, cx,      cy - hh) ||
        isPointInVerdureWall(w, cx,      cy + hh)) {
      return VERDURE_WALL_SOLID;
    }
  }

  // 4. Axis-aligned rect solids (future obstacles / destructibles).
  if (ctx.rectSolids) {
    const left = cx - hw, right = cx + hw, top = cy - hh, bottom = cy + hh;
    for (const solid of ctx.rectSolids) {
      if (!solid.collidable) continue;
      const { x: sx, y: sy, w: sw, h: sh } = solid.bounds;
      if (left < sx + sw && right > sx && top < sy + sh && bottom > sy) return solid;
    }
  }

  return null;
}

// ── Subpixel remainder store ───────────────────────────────────────────────────

/** Per-entity subpixel remainders keyed by object reference. Auto-GC'd via WeakMap. */
const _remainderStore = new WeakMap<object, { x: number; y: number }>();

function _getRemainder(entity: object): { x: number; y: number } {
  let r = _remainderStore.get(entity);
  if (!r) { r = { x: 0, y: 0 }; _remainderStore.set(entity, r); }
  return r;
}

/**
 * Reset subpixel remainders for an entity.
 * Call after teleports, blinks, or respawns to avoid accumulated drift.
 */
export function resetActorRemainder(entity: object): void {
  const r = _remainderStore.get(entity);
  if (r) { r.x = 0; r.y = 0; }
}

// ── Core movement functions ────────────────────────────────────────────────────

/** Max integer pixel steps per axis per call — guards against tunnelling on lag spikes. */
const MAX_MOVE_STEPS = 200;

/**
 * Move `entity` by `amount` pixels along the X axis, stopping flush against
 * the first solid encountered.
 *
 * Subpixel amounts accumulate across frames via a WeakMap-keyed remainder so
 * fractional velocities (e.g. 0.7 px/frame) lose no precision over time.
 *
 * @param entity    - Mutable `{ x, y }` object; position is the entity's centre.
 * @param halfW     - Half the entity's collision width (used for AABB and circle tests).
 * @param halfH     - Half the entity's collision height.
 * @param amount    - Signed pixel displacement this frame (may be fractional).
 * @param ctx       - Solid query context (arena + terrain + verdure + optional rects).
 * @param onCollide - Called once when the axis is blocked; typically zeros `entity.vx`.
 */
export function actorMoveX(
  entity: { x: number; y: number },
  halfW: number,
  halfH: number,
  amount: number,
  ctx: ActorSolidCtx,
  onCollide?: (hit: SolidCollider, dir: -1 | 1) => void,
): void {
  const rem = _getRemainder(entity);
  rem.x += amount;
  const move = Math.round(rem.x);
  if (move === 0) return;
  rem.x -= move;
  const sign = (move > 0 ? 1 : -1) as 1 | -1;
  const steps = Math.min(Math.abs(move), MAX_MOVE_STEPS);
  for (let i = 0; i < steps; i++) {
    const hit = _firstSolidAt(entity.x + sign, entity.y, halfW, halfH, ctx);
    if (!hit) {
      entity.x += sign;
    } else {
      onCollide?.(hit, sign);
      return;
    }
  }
}

/**
 * Move `entity` by `amount` pixels along the Y axis, stopping flush against
 * the first solid encountered.  Mirrors `actorMoveX` exactly.
 *
 * Call actorMoveX before actorMoveY for consistent diagonal sliding behaviour.
 */
export function actorMoveY(
  entity: { x: number; y: number },
  halfW: number,
  halfH: number,
  amount: number,
  ctx: ActorSolidCtx,
  onCollide?: (hit: SolidCollider, dir: -1 | 1) => void,
): void {
  const rem = _getRemainder(entity);
  rem.y += amount;
  const move = Math.round(rem.y);
  if (move === 0) return;
  rem.y -= move;
  const sign = (move > 0 ? 1 : -1) as 1 | -1;
  const steps = Math.min(Math.abs(move), MAX_MOVE_STEPS);
  for (let i = 0; i < steps; i++) {
    const hit = _firstSolidAt(entity.x, entity.y + sign, halfW, halfH, ctx);
    if (!hit) {
      entity.y += sign;
    } else {
      onCollide?.(hit, sign);
      return;
    }
  }
}

// ── ActorBody class ────────────────────────────────────────────────────────────

/**
 * Self-contained movable actor body.  Holds its own position and subpixel
 * remainders.
 *
 * Use this for new code.  For existing `{ x, y }` entity objects (all current
 * enemies and the player mote) use `actorMoveX` / `actorMoveY` instead — they
 * attach remainder state via WeakMap without requiring entity-type changes.
 */
export class ActorBody {
  x: number;
  y: number;
  /** Full collision width. */
  w: number;
  /** Full collision height. */
  h: number;
  xRemainder = 0;
  yRemainder = 0;

  constructor(x: number, y: number, w: number, h: number) {
    this.x = x; this.y = y; this.w = w; this.h = h;
  }

  /** Returns the AABB for this body if centred at (cx, cy). */
  boundsAt(cx: number, cy: number): AABB {
    return { x: cx - this.w / 2, y: cy - this.h / 2, w: this.w, h: this.h };
  }

  moveX(amount: number, ctx: ActorSolidCtx, onCollide?: (hit: CollisionHit) => void): void {
    this.xRemainder += amount;
    const move = Math.round(this.xRemainder);
    if (move === 0) return;
    this.xRemainder -= move;
    const hw = this.w / 2, hh = this.h / 2;
    const sign = (move > 0 ? 1 : -1) as 1 | -1;
    const steps = Math.min(Math.abs(move), MAX_MOVE_STEPS);
    for (let i = 0; i < steps; i++) {
      const solid = _firstSolidAt(this.x + sign, this.y, hw, hh, ctx);
      if (!solid) {
        this.x += sign;
      } else {
        onCollide?.({ solid, axis: 'x', dir: sign });
        return;
      }
    }
  }

  moveY(amount: number, ctx: ActorSolidCtx, onCollide?: (hit: CollisionHit) => void): void {
    this.yRemainder += amount;
    const move = Math.round(this.yRemainder);
    if (move === 0) return;
    this.yRemainder -= move;
    const hw = this.w / 2, hh = this.h / 2;
    const sign = (move > 0 ? 1 : -1) as 1 | -1;
    const steps = Math.min(Math.abs(move), MAX_MOVE_STEPS);
    for (let i = 0; i < steps; i++) {
      const solid = _firstSolidAt(this.x, this.y + sign, hw, hh, ctx);
      if (!solid) {
        this.y += sign;
      } else {
        onCollide?.({ solid, axis: 'y', dir: sign });
        return;
      }
    }
  }
}

// ── Spawn overlap recovery ─────────────────────────────────────────────────────

const _spawnRecovScratch = { x: 0, y: 0 };

/**
 * One-shot spawn-overlap recovery.
 *
 * Called when an actor is placed at a position that already overlaps a solid
 * (e.g. terrain grew around it, blink-teleport landed inside terrain).
 * Tries the built-in push-out functions first; falls back to an outward spiral
 * search if those fail.
 *
 * This is a SPAWN-TIME fix.  Do NOT call every frame — for runtime movement
 * use `actorMoveX` / `actorMoveY`.
 *
 * Returns `true` if the entity was repositioned.
 */
export function resolveSpawnOverlap(
  entity: { x: number; y: number },
  halfSize: number,
  ctx: ActorSolidCtx,
): boolean {
  if (!_firstSolidAt(entity.x, entity.y, halfSize, halfSize, ctx)) return false;

  // Fast path: use the authoritative push-out functions for terrain / verdure.
  if (ctx.terrain &&
      pushPointOutsideTopographicTerrain(ctx.terrain, entity.x, entity.y, _spawnRecovScratch, halfSize + 2)) {
    entity.x = _spawnRecovScratch.x;
    entity.y = _spawnRecovScratch.y;
    resetActorRemainder(entity);
    if (!_firstSolidAt(entity.x, entity.y, halfSize, halfSize, ctx)) return true;
  }
  if (ctx.verdureWall &&
      pushPointOutsideVerdureWall(ctx.verdureWall, entity.x, entity.y, _spawnRecovScratch, halfSize + 2)) {
    entity.x = _spawnRecovScratch.x;
    entity.y = _spawnRecovScratch.y;
    resetActorRemainder(entity);
    if (!_firstSolidAt(entity.x, entity.y, halfSize, halfSize, ctx)) return true;
  }

  // Spiral fallback: search outward for the nearest free position.
  const STEP = 3;
  const MAX_R = 80;
  for (let r = STEP; r <= MAX_R; r += STEP) {
    const samples = Math.max(8, Math.ceil(2 * Math.PI * r / STEP));
    for (let s = 0; s < samples; s++) {
      const angle = (s / samples) * 2 * Math.PI;
      const cx = entity.x + Math.cos(angle) * r;
      const cy = entity.y + Math.sin(angle) * r;
      if (!_firstSolidAt(cx, cy, halfSize, halfSize, ctx)) {
        entity.x = cx;
        entity.y = cy;
        resetActorRemainder(entity);
        return true;
      }
    }
  }

  return false;
}
