/**
 * nadir-cube-point-types.ts — Types for the Nadir cube-point enemy encounter.
 *
 * During Horizon → Nadir waves divisible by 10, a subset of the rotating
 * CubicGrid lattice nodes "awaken" as live enemies. Their 2D hitbox positions
 * are derived each frame from the same rotation/projection math used by the
 * background visual.
 */

// ── Shared projection math ────────────────────────────────────────────────────

/** Camera Z offset (must match nadir-cubic-grid-background.ts CAMERA_Z). */
export const NADIR_CUBE_CAMERA_Z = 860;
/** Perspective focal length (must match nadir-cubic-grid-background.ts FOCAL_LENGTH). */
export const NADIR_CUBE_FOCAL_LENGTH = 540;
/** Half-cell count for anchor selection (must match HALF_CELLS). */
export const NADIR_CUBE_HALF_CELLS = 7;
/** Cell size in world units (must match CELL_SIZE). */
export const NADIR_CUBE_CELL_SIZE = 50;

/** The three rotation speeds (rad/s) from the background (ROT_SPEED_X/Y/Z). */
export const NADIR_ROT_SPEED_X = 0.155;
export const NADIR_ROT_SPEED_Y = 0.215;
export const NADIR_ROT_SPEED_Z = 0.063;

/**
 * Projection state shared between the background visual and the gameplay system.
 * The background exposes this via getProjectionState() each frame.
 */
export interface NadirCubeProjectionState {
  angX: number;
  angY: number;
  angZ: number;
  gameW: number;
  gameH: number;
}

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
  const { angX, angY, angZ, gameW, gameH } = state;

  const cX = Math.cos(angX), sX = Math.sin(angX);
  const cY = Math.cos(angY), sY = Math.sin(angY);
  const cZ = Math.cos(angZ), sZ = Math.sin(angZ);

  // Rotate around X
  const wy2 = wy * cX - wz * sX;
  const wz2 = wy * sX + wz * cX;
  // Rotate around Y
  const wx3 = wx * cY + wz2 * sY;
  const wz3 = -wx * sY + wz2 * cY;
  // Rotate around Z
  const rx = wx3 * cZ - wy2 * sZ;
  const ry = wx3 * sZ + wy2 * cZ;
  const rz = wz3;

  const wzCam = rz + NADIR_CUBE_CAMERA_Z;
  if (wzCam <= 0) return null;

  const cx = gameW / 2;
  const cy = gameH / 2;
  const sx = cx + rx * NADIR_CUBE_FOCAL_LENGTH / wzCam;
  const sy = cy + ry * NADIR_CUBE_FOCAL_LENGTH / wzCam;

  const maxRange = NADIR_CUBE_HALF_CELLS * NADIR_CUBE_CELL_SIZE * 1.8;
  const depth = Math.max(0, Math.min(1, (NADIR_CUBE_CAMERA_Z - rz) / (NADIR_CUBE_CAMERA_Z + maxRange)));
  const depthAlpha = depth * depth;

  return { sx, sy, depthAlpha };
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
