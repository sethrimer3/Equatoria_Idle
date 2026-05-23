/**
 * Shared types for the topography lighting system.
 *
 * Imported by both topographic-terrain.ts (to type the lightCache field on
 * TopographicTerrainState) and topographic-lighting.ts (which implements the
 * cache).  Keeping them here breaks the potential circular dependency.
 *
 * This file must NOT import from topographic-terrain.ts or
 * topographic-lighting.ts.
 */

/** Tunable parameters for the topography directional-lighting system. */
export interface TopographyLightConfig {
  /** Angle (radians) the light travels *toward* — i.e. the direction light comes from. */
  lightAngle: number;
  lightIntensity: number;
  ambientFloor: number;
  shadowLengthMult: number;
  shadowSoftness: number;
  heightPerLayer: number;
  terrainOpacity: number;
  slopeSmoothing: number;
  beamStrength: number;
}

/**
 * Public surface of the baked lighting cache.
 * Stored on `TopographicTerrainState.lightCache`.
 *
 * Consumers outside the lighting module should treat all fields as read-only.
 * Future entity-shadow code should use the dedicated
 * `TopographyLightSamplingData` interface (returned by
 * `getActiveTopographyLightSamplingData`) to access grid data.
 */
export interface TopographyLightCache {
  /** Offscreen canvas holding the composited lighting overlay. */
  readonly canvas: HTMLCanvasElement;
  readonly width: number;
  readonly height: number;
  /** Snapshot of the config used to bake this cache. */
  readonly config: Readonly<TopographyLightConfig>;
  readonly terrainSeed: number;
  readonly terrainWaveNumber: number;
  /** Palette id that was active when the cache was baked. */
  readonly paletteId: string;
}

/**
 * Read-only lighting data safe for external consumption by future
 * entity-shadow code.
 *
 * Returned by `getActiveTopographyLightSamplingData()`.
 * All arrays are the same Float32Array instances stored in the baked cache;
 * do not mutate them.
 */
export interface TopographyLightSamplingData {
  /** World-space angle the light arrives from (radians). Same as `config.lightAngle`. */
  readonly lightAngle: number;
  /** Height value at each grid cell (row-major, `gridW × gridH`). */
  readonly heightGrid: Float32Array;
  /** Cast-shadow intensity at each grid cell, range [0, 1]. */
  readonly shadowGrid: Float32Array;
  /** Composite light intensity at each grid cell, range [0, 1]. */
  readonly lightGrid: Float32Array;
  /** Grid cell size in canvas pixels. */
  readonly cellSizePx: number;
  /** Number of grid columns. */
  readonly gridW: number;
  /** Number of grid rows. */
  readonly gridH: number;
}
