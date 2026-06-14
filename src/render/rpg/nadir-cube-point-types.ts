/**
 * nadir-cube-point-types.ts — Types for the Nadir cube-point enemy encounter.
 *
 * During Horizon → Nadir waves divisible by 10, a subset of the rotating
 * CubicGrid lattice nodes "awaken" as live enemies. Their 2D hitbox positions
 * are derived each frame from the same rotation/projection math used by the
 * background visual.
 */

import {
  NADIR_CUBE_CAMERA_Z,
  NADIR_CUBE_FOCAL_LENGTH,
  NADIR_CUBE_HALF_CELLS,
  NADIR_CUBE_CELL_SIZE,
  NADIR_ROT_SPEED_X,
  NADIR_ROT_SPEED_Y,
  NADIR_ROT_SPEED_Z,
  projectNadirWorldPointToGame,
  type NadirCubeProjectionState,
} from '../background/nadir-cube-projection';

export {
  NADIR_CUBE_CAMERA_Z,
  NADIR_CUBE_FOCAL_LENGTH,
  NADIR_CUBE_HALF_CELLS,
  NADIR_CUBE_CELL_SIZE,
  NADIR_ROT_SPEED_X,
  NADIR_ROT_SPEED_Y,
  NADIR_ROT_SPEED_Z,
};
export type { NadirCubeProjectionState };

/**
 * Projects a 3D lattice world-space point into 2D screen coordinates using
 * the standard CubicGrid perspective projection.
 *
 * Returns null when the point is behind the camera.
 */
export function projectNadirAnchor(
  wx: number,
  wy: number,
  wz: number,
  state: NadirCubeProjectionState,
): { sx: number; sy: number; depthAlpha: number } | null {
  const projected = projectNadirWorldPointToGame(wx, wy, wz, state);
  if (!projected) return null;
  return { sx: projected.sx, sy: projected.sy, depthAlpha: projected.depthAlpha };
}

// ── Behavior types ────────────────────────────────────────────────────────────

export type NadirCubePointBehavior = 'mine_layer' | 'laser_trail' | 'turret' | 'link_laser';

// ── Enemy type ────────────────────────────────────────────────────────────────

export interface NadirCubePointEnemy {
  readonly kind: 'nadir_cube_point';
  id: number;
  /** World-space lattice anchor position. */
  anchorX: number;
  anchorY: number;
  anchorZ: number;
  /** Current projected 2D battlefield position. */
  x: number;
  y: number;
  /** Previous projected position (for trail segment). */
  prevX: number;
  prevY: number;
  hp: number;
  maxHp: number;
  atk: number;
  def: number;
  behavior: NadirCubePointBehavior;
  /** Countdown until next behavior action (ms). */
  cooldownMs: number;
  /** Pulse animation timer (ms, wraps). */
  pulseMs: number;
  /** Hit flash timer (ms, counts down). */
  hitFlashMs: number;
  /** Optional paired anchor IDs for link_laser. */
  linkedIds?: number[];
  /** True when the projected point is in front of camera and visible. */
  projectedVisible: boolean;
  /** Depth-based alpha [0,1] from projection (1 = close/bright). */
  depthAlpha: number;
  surfaceKind?: 'corkscrew' | 'dini' | 'henneberg' | 'seashell' | 'enneper' | 'bohemian_dome';
  surfaceUIndex?: number;
  surfaceVIndex?: number;
  surfaceCore?: boolean;
  surfaceActivated?: boolean;
  surfaceTrailX?: Float32Array;
  surfaceTrailY?: Float32Array;
  surfaceTrailHead?: number;
  surfaceTrailCount?: number;
}

// ── Hazard types ──────────────────────────────────────────────────────────────

/** A stationary damaging mine left by a mine_layer cube point. */
export interface NadirCubeMine {
  x: number;
  y: number;
  lifeMs: number;
  readonly maxLifeMs: number;
  readonly radius: number;
  readonly damage: number;
  /** True once the player has hit this mine (mines are consumed on contact). */
  triggered: boolean;
}

/** A damaging capsule/trail left between prev and current projected position by a laser_trail point. */
export interface NadirCubeTrailSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  lifeMs: number;
  readonly maxLifeMs: number;
  readonly damage: number;
  /** True once damage has been applied to avoid repeated hits. */
  hit: boolean;
}

/** A projectile fired by a turret cube point. */
export interface NadirCubeTurretBolt {
  x: number;
  y: number;
  vx: number;
  vy: number;
  lifeMs: number;
  readonly damage: number;
  readonly radius: number;
}

/** A link-laser connection between two live cube points. */
export interface NadirCubeLinkLaser {
  /** Source point ID. */
  sourceId: number;
  /** Target point ID. */
  targetId: number;
  /** Warning phase (ms remaining). */
  warningMs: number;
  /** Active damage phase (ms remaining; active only when warningMs <= 0). */
  activeMs: number;
  readonly damage: number;
  /** Source 2D position (updated each frame while active). */
  x1: number;
  y1: number;
  /** Target 2D position. */
  x2: number;
  y2: number;
}
