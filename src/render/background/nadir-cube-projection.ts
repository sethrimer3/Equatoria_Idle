/**
 * Shared Nadir cube projection helpers used by both the CubicGrid background
 * and Nadir cube-point gameplay entities.
 */

/** Half-width of the high-quality cubic lattice in cell-count units. */
export const NADIR_CUBE_HALF_CELLS = 7;
/** Half-width of the low-graphics cubic lattice in cell-count units. */
export const NADIR_CUBE_HALF_CELLS_LOW = 5;
/** Spacing between lattice grid lines in world units. */
export const NADIR_CUBE_CELL_SIZE = 50;
/** Z-position of the virtual camera (world units in front of the origin). */
export const NADIR_CUBE_CAMERA_Z = 860;
/** Perspective focal length in world units. */
export const NADIR_CUBE_FOCAL_LENGTH = 540;
/** Rotation speeds in radians/second. */
export const NADIR_ROT_SPEED_X = 0.155;
export const NADIR_ROT_SPEED_Y = 0.215;
export const NADIR_ROT_SPEED_Z = 0.063;

export interface NadirCubeProjectionState {
  angX: number;
  angY: number;
  angZ: number;
  gameW: number;
  gameH: number;
}

export interface NadirRotatedPoint {
  rx: number;
  ry: number;
  rz: number;
}

export interface NadirProjectedPoint {
  sx: number;
  sy: number;
  rz: number;
  depthAlpha: number;
}

export function rotateNadirWorldPoint(
  wx: number,
  wy: number,
  wz: number,
  state: Pick<NadirCubeProjectionState, 'angX' | 'angY' | 'angZ'>,
): NadirRotatedPoint {
  const { angX, angY, angZ } = state;
  const cX = Math.cos(angX), sX = Math.sin(angX);
  const cY = Math.cos(angY), sY = Math.sin(angY);
  const cZ = Math.cos(angZ), sZ = Math.sin(angZ);

  const wy2 = wy * cX - wz * sX;
  const wz2 = wy * sX + wz * cX;
  const wx3 = wx * cY + wz2 * sY;
  const wz3 = -wx * sY + wz2 * cY;

  return {
    rx: wx3 * cZ - wy2 * sZ,
    ry: wx3 * sZ + wy2 * cZ,
    rz: wz3,
  };
}

function getNadirDepthAlpha(rz: number): number {
  const maxRange = NADIR_CUBE_HALF_CELLS * NADIR_CUBE_CELL_SIZE * 1.8;
  const depth = Math.max(0, Math.min(1, (NADIR_CUBE_CAMERA_Z - rz) / (NADIR_CUBE_CAMERA_Z + maxRange)));
  return depth * depth;
}

export function projectNadirRotatedPointToGame(
  rx: number,
  ry: number,
  rz: number,
  state: Pick<NadirCubeProjectionState, 'gameW' | 'gameH'>,
): NadirProjectedPoint | null {
  const wzCam = rz + NADIR_CUBE_CAMERA_Z;
  if (wzCam <= 0) return null;

  const cx = state.gameW * 0.5;
  const cy = state.gameH * 0.5;
  return {
    sx: cx + rx * NADIR_CUBE_FOCAL_LENGTH / wzCam,
    sy: cy + ry * NADIR_CUBE_FOCAL_LENGTH / wzCam,
    rz,
    depthAlpha: getNadirDepthAlpha(rz),
  };
}

export function projectNadirWorldPointToGame(
  wx: number,
  wy: number,
  wz: number,
  state: NadirCubeProjectionState,
): NadirProjectedPoint | null {
  const rotated = rotateNadirWorldPoint(wx, wy, wz, state);
  return projectNadirRotatedPointToGame(rotated.rx, rotated.ry, rotated.rz, state);
}

export function projectNadirGamePointToOffscreen(
  sx: number,
  sy: number,
  scaleX: number,
  scaleY: number,
): { px: number; py: number } {
  return {
    px: ((sx * scaleX) + 0.5) | 0,
    py: ((sy * scaleY) + 0.5) | 0,
  };
}
