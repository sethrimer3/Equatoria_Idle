import {
  buildMergedContours,
  type MergedTopographicContours,
  type ContourPalette,
} from './topographic-terrain-field';
import type { TopographyLightCache } from './topographic-lighting-types';
import {
  type RecursiveSquareNode,
  type EnemyInfluencePoint,
  generateRecursiveSquareTerrain,
  getSquareNodeGrowthAlpha01,
  renderRecursiveSquareTerrain,
} from './recursive-square-terrain';
import {
  type BasaltTerrainState,
  generateBasaltTerrain,
  getBasaltCellAlpha,
  renderBasaltTerrain,
} from './basalt-terrain';
import {
  type SeafloorTerrainData,
  generateSeafloorTerrain,
  renderSeafloorTerrain,
} from './seafloor-terrain';
import { getRpgZoneTerrainProfile, type RpgZoneId } from '../../../data/rpg/rpg-zone-definitions';

// Re-export merged-contour types and recursive-square types for external consumers.
export type { MergedTopographicContours };
export type { RecursiveSquareNode };
export type { EnemyInfluencePoint };
// Re-export seafloor type for consumers that need to inspect terrain state.
export type { SeafloorTerrainData };

export type TopographicTerrainPaletteId = 'mono' | 'copper' | 'cyanTactical';

/**
 * Discriminant for terrain variants.
 * - 'none': boss-wave / empty-arena sentinel (beginWaveTerrain returns null).
 * - 'topographic': organic island/contour terrain (the original system).
 * - 'recursiveSquares': procedural branching rotated-square terrain.
 * - 'basalt': clustered hex-column terrain.
 * - 'seafloorRidges': elongated ridge/channel terrain for the Caustics zone.
 * - 'reserved4'/'reserved5': deterministic scheduler placeholders.
 */
export type RpgTerrainKind = 'none' | 'topographic' | 'recursiveSquares' | 'basalt' | 'seafloorRidges' | 'reserved4' | 'reserved5';

export interface TopographicTerrainPoint { x: number; y: number; }

export interface TopographicTerrainRing {
  points: TopographicTerrainPoint[];
  lineWidth: number;
  alpha: number;
  color: string;
  ringIndex: number;
}

/**
 * Shape profile for one terrain island.  All rings of the island are derived
 * from this profile — scaled versions of the same underlying landform — so
 * they look like nested topographic contours rather than independent loops.
 * Also used by the scalar-field computation for smooth multi-island merging.
 */
export interface IslandShapeProfile {
  harmonics: Array<{
    frequency: number;
    amplitude: number;
    phase: number;
  }>;
  /** Rotation angle (radians) of the elongation axis. */
  elongationAngle: number;
  /** 0 = round, up to ~0.28 = noticeably elongated ridge. */
  elongationAmount: number;
}

export interface TopographicTerrainIsland {
  id: string;
  centerX: number;
  centerY: number;
  outerRadius: number;
  /** Shape profile shared by all rings of this island. */
  profile: IslandShapeProfile;
  rings: TopographicTerrainRing[];
  /** Outer-ring polygon in UNSCALED space (for legacy collision fallback). */
  solidOuterPolygon: TopographicTerrainPoint[];
}

export interface TopographicTerrainState {
  waveNumber: number;
  seed: number;
  paletteId: TopographicTerrainPaletteId;
  /**
   * Which terrain variant this state represents.
   * - 'topographic': uses `islands` and `mergedContours`.
   * - 'recursiveSquares': uses `squareNodes` and `squareMaxDepth`.
   * - 'basalt': uses `basalt` hex-cell terrain data.
   */
  terrainKind: RpgTerrainKind;
  islands: TopographicTerrainIsland[];
  phase: 'hidden' | 'growing' | 'stable' | 'shrinking';
  phaseStartedAtMs: number;
  growDurationMs: number;
  shrinkDurationMs: number;
  growth01: number;
  /**
   * Merged scalar-field contour data computed once at generation time.
   * When non-null, rendering uses these smoothly merged contour polylines
   * instead of per-island ring polygons, and collision uses the merged
   * solid outer boundaries.
   * Only populated when terrainKind === 'topographic'.
   */
  mergedContours: MergedTopographicContours | null;
  /**
   * Cached lighting overlay for this terrain state.  Built on first render
   * and reused until canvas size or light config changes.  Managed exclusively
   * by `topographic-lighting.ts`; treat as opaque outside that module.
   * Only used when terrainKind === 'topographic'.
   */
  lightCache: TopographyLightCache | null;
  /**
   * Flat list of ALL recursive-square nodes (root + all descendants), ordered
   * parent-before-children.  Only populated when terrainKind === 'recursiveSquares'.
   */
  squareNodes: RecursiveSquareNode[];
  /**
   * Maximum depth found in squareNodes.  Used by the growth-animation formula
   * to stagger node appearance by depth level.
   * Only meaningful when terrainKind === 'recursiveSquares'.
   */
  squareMaxDepth: number;
  /** Basalt hex terrain data. Only populated when terrainKind === 'basalt'. */
  basalt?: BasaltTerrainState;
  /** Seafloor ridge/channel data. Only populated when terrainKind === 'seafloorRidges'. */
  seafloor?: SeafloorTerrainData;
}

const TERRAIN_GROW_DURATION_MS = 1800;
const TERRAIN_SHRINK_DURATION_MS = 1800;
const MIN_ISLANDS = 2;
const MAX_ISLANDS = 5;
const MIN_RINGS = 2;
const MAX_RINGS = 9;
/** Number of polygon points in each terrain ring and the solid outer polygon. */
export const RING_POINTS = 64;
const TERRAIN_EDGE_MARGIN = 40;
const PLAYER_EXCLUSION_RADIUS = 60;
const MAX_ISLAND_PLACEMENT_ATTEMPTS = 15;
const DEV_TEXT_LINE_HEIGHT_PX = 12;

/**
 * Minimum centre-to-centre separation for island placement, expressed as a
 * multiple of the *larger* island's outerRadius.  Reduced from 1.2 to 0.55
 * so islands can overlap and their scalar fields will merge smoothly.
 */
const MIN_ISLAND_SEPARATION_FACTOR = 0.55;

const PALETTE_SEQUENCE: TopographicTerrainPaletteId[] = ['mono', 'copper', 'cyanTactical'];

/**
 * Palette entries now include an `indexLine` color (used for every 3rd contour)
 * and a `glowAlpha` (very low — 0 to 0.06) to keep glow subtle and topographic.
 */
const PALETTES: Record<TopographicTerrainPaletteId, {
  lines: string[];
  indexLine: string;
  glow: string | null;
  glowAlpha: number;
}> = {
  mono: {
    lines: ['#c8c8c8', '#a0a0a0', '#787878', '#585858'],
    indexLine: '#e2e2e2',
    glow: null,
    glowAlpha: 0,
  },
  copper: {
    lines: ['#a06030', '#b07040', '#c28050', '#955028'],
    indexLine: '#d09060',
    glow: '#c07840',
    glowAlpha: 0.04,
  },
  cyanTactical: {
    lines: ['#186880', '#1a7090', '#1060a0', '#127888'],
    indexLine: '#1890aa',
    glow: '#1a8898',
    glowAlpha: 0.05,
  },
};

let terrainDevMode = false;

/**
 * A single reusable shape profile for one island.  All rings of the island are
 * derived from this profile — scaled versions of the same underlying landform —
 * so they look like nested topographic contours rather than independent loops.
 *
 * NOTE: The identical interface is exported above as `IslandShapeProfile`.
 * This alias exists for intra-module readability.
 */
// (Uses the exported IslandShapeProfile type directly; no duplicate definition.)

/**
 * Generates a shared shape profile for one island using low-frequency harmonics
 * to produce organic, map-like blobs rather than flower/petal shapes.
 */
function buildIslandShapeProfile(rng: () => number): IslandShapeProfile {
  const harmonicCount = randomIntInclusive(rng, 2, 3);
  const maxAmplitudes = [
    randomRange(rng, 0.08, 0.18),  // primary deformation
    randomRange(rng, 0.03, 0.08),  // secondary deformation
    randomRange(rng, 0.01, 0.04),  // tertiary deformation
  ];
  const harmonics: IslandShapeProfile['harmonics'] = [];
  for (let i = 0; i < harmonicCount; i++) {
    // Prefer low frequencies (1–4) to avoid symmetrical flower lobes.
    // Frequency 5 is allowed but rare.
    const freq = rng() < 0.85
      ? randomIntInclusive(rng, 1, 4)
      : 5;
    harmonics.push({
      frequency: freq,
      amplitude: maxAmplitudes[i] ?? 0.01,
      phase: randomRange(rng, 0, Math.PI * 2),
    });
  }
  return {
    harmonics,
    elongationAngle: randomRange(rng, 0, Math.PI * 2),
    elongationAmount: randomRange(rng, 0, 0.28),
  };
}

/**
 * Evaluates the shared shape multiplier at angle `theta`.
 * Returns a value ≥ 0.2 (always positive, never collapses to a point).
 *
 * Exported so the scalar-field code and tests can use the same function.
 */
export function computeShapeMultiplier(profile: IslandShapeProfile, theta: number): number {
  let mod = 1.0;
  for (const h of profile.harmonics) {
    mod += h.amplitude * Math.sin(h.frequency * theta + h.phase);
  }
  // Elongation: stretches/compresses along one axis for a ridge-like look.
  const cosElong = Math.cos(theta - profile.elongationAngle);
  mod *= 1 + profile.elongationAmount * (cosElong * cosElong - 0.5);
  return Math.max(0.2, mod);
}

export function createSeededRng(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateTopographicTerrain(
  waveNumber: number,
  seed: number,
  canvasW: number,
  canvasH: number,
  paletteOverride?: TopographicTerrainPaletteId,
): TopographicTerrainState {
  const rng = createSeededRng(seed);
  const paletteId = paletteOverride ?? PALETTE_SEQUENCE[Math.abs(waveNumber) % PALETTE_SEQUENCE.length];
  const palette = PALETTES[paletteId];
  const islands: TopographicTerrainIsland[] = [];
  const targetIslandCount = randomIntInclusive(rng, MIN_ISLANDS, MAX_ISLANDS);
  const centerX = canvasW * 0.5;
  const centerY = canvasH * 0.5;

  for (let islandIndex = 0; islandIndex < targetIslandCount; islandIndex++) {
    const outerRadius = randomRange(rng, 35, 80);
    let islandCenterX = 0;
    let islandCenterY = 0;
    let placed = false;

    for (let attempt = 0; attempt < MAX_ISLAND_PLACEMENT_ATTEMPTS; attempt++) {
      const minX = TERRAIN_EDGE_MARGIN + outerRadius;
      const maxX = canvasW - TERRAIN_EDGE_MARGIN - outerRadius;
      const minY = TERRAIN_EDGE_MARGIN + outerRadius;
      const maxY = canvasH - TERRAIN_EDGE_MARGIN - outerRadius;
      if (maxX <= minX || maxY <= minY) break;

      const candidateX = randomRange(rng, minX, maxX);
      const candidateY = randomRange(rng, minY, maxY);
      if (distanceSq(candidateX, candidateY, centerX, centerY) < PLAYER_EXCLUSION_RADIUS * PLAYER_EXCLUSION_RADIUS) {
        continue;
      }

      let overlapsExisting = false;
      for (const existing of islands) {
        const minSeparation = Math.max(existing.outerRadius, outerRadius) * MIN_ISLAND_SEPARATION_FACTOR;
        if (distanceSq(candidateX, candidateY, existing.centerX, existing.centerY) < minSeparation * minSeparation) {
          overlapsExisting = true;
          break;
        }
      }
      if (overlapsExisting) continue;

      islandCenterX = candidateX;
      islandCenterY = candidateY;
      placed = true;
      break;
    }

    if (!placed) continue;

    const ringCount = randomIntInclusive(rng, MIN_RINGS, MAX_RINGS);
    const rings: TopographicTerrainRing[] = [];
    let solidOuterPolygon: TopographicTerrainPoint[] = [];
    const colorOffset = randomIntInclusive(rng, 0, palette.lines.length - 1);

    // One shared shape profile drives ALL rings — this is the key change that makes
    // rings look like nested topographic contours of the same landform.
    const profile = buildIslandShapeProfile(rng);

    for (let ringIndex = 0; ringIndex < ringCount; ringIndex++) {
      const ringScale = ringCount <= 1 ? 1 : lerp(0.28, 1.0, ringIndex / (ringCount - 1));

      // Tiny per-ring perturbation (1–2.5%).  Must stay well below the radial gap
      // between adjacent rings to guarantee no ring crossing.
      const perturbPhase = randomRange(rng, 0, Math.PI * 2);
      const perturbAmp = randomRange(rng, 0.01, 0.025);

      const points: TopographicTerrainPoint[] = [];
      for (let pointIndex = 0; pointIndex < RING_POINTS; pointIndex++) {
        const theta = (pointIndex / RING_POINTS) * Math.PI * 2;
        const shapeBase = computeShapeMultiplier(profile, theta);
        // Perturbation is so small it cannot cause adjacent rings to cross.
        const perturb = 1 + perturbAmp * Math.sin(2 * theta + perturbPhase);
        const radius = outerRadius * ringScale * shapeBase * perturb;
        points.push({
          x: islandCenterX + Math.cos(theta) * radius,
          y: islandCenterY + Math.sin(theta) * radius,
        });
      }

      // Line hierarchy: every 3rd ring (from innermost) is an index contour —
      // slightly thicker and brighter, like traditional cartographic index lines.
      const isIndexContour = ringIndex % 3 === 2;
      const lineWidth = isIndexContour
        ? randomRange(rng, 1.2, 1.5)
        : randomRange(rng, 0.65, 1.0);
      const height01 = ringCount <= 1 ? 1 : 1 - ringIndex / (ringCount - 1);
      const alpha = isIndexContour
        ? lerp(0.66, 0.92, height01)
        : lerp(0.34, 0.74, height01);
      const color = isIndexContour
        ? palette.indexLine
        : palette.lines[(ringIndex + colorOffset) % palette.lines.length];

      const ring: TopographicTerrainRing = { points, lineWidth, alpha, color, ringIndex };
      rings.push(ring);
      if (ringIndex === ringCount - 1) solidOuterPolygon = points;
    }

    islands.push({
      id: `wave-${waveNumber}-island-${islandIndex}`,
      centerX: islandCenterX,
      centerY: islandCenterY,
      outerRadius,
      profile,
      rings,
      solidOuterPolygon,
    });
  }

  // Build merged scalar-field contours once for the whole wave.
  const mergedContours = buildMergedContours(
    islands,
    canvasW,
    canvasH,
    palette as ContourPalette,
    randomIntInclusive(rng, 0, palette.lines.length - 1),
    seed,
  );

  return {
    waveNumber,
    seed,
    paletteId,
    terrainKind: 'topographic',
    islands,
    phase: 'growing',
    phaseStartedAtMs: 0,
    growDurationMs: TERRAIN_GROW_DURATION_MS,
    shrinkDurationMs: TERRAIN_SHRINK_DURATION_MS,
    growth01: 0,
    mergedContours,
    lightCache: null,
    squareNodes: [],
    squareMaxDepth: 0,
    basalt: undefined,
  };
}

export function getTerrainKindForWave(waveNumber: number, isBossWave: boolean): RpgTerrainKind {
  if (isBossWave || (waveNumber > 0 && waveNumber % 100 === 0)) return 'none';
  const slot = Math.floor(((waveNumber - 1) % 100) / 20);
  switch (slot) {
    case 0: return 'topographic';
    case 1: return 'recursiveSquares';
    case 2: return 'basalt';
    case 3: return 'reserved4';
    case 4: return 'reserved5';
    default: return 'topographic';
  }
}

/**
 * Returns the terrain kind for a given zone and wave, used for the dev overlay.
 * This is the authoritative routing function - zone terrain is determined by zone,
 * not by 20-wave cycle.
 */
export function getTerrainKindForZone(
  zoneId: RpgZoneId,
  seed: number,
): RpgTerrainKind {
  const { terrainProfile } = getRpgZoneTerrainProfile(zoneId);
  if (terrainProfile === 'horizon') return 'none';
  if (terrainProfile === 'asteroids') return 'none';
  if (terrainProfile === 'overgrowth') return 'none';
  if (terrainProfile === 'seafloor') return 'seafloorRidges';
  // crystalline (Euhedral): recursiveSquares 75% of the time, basalt 25%
  if (seed % 4 === 0) return 'basalt';
  return 'recursiveSquares';
}

export function beginWaveTerrain(
  waveNumber: number,
  canvasW: number,
  canvasH: number,
  nowMs: number,
  activeZoneId: RpgZoneId = 'euhedral',
): TopographicTerrainState | null {
  // Seed is derived from waveNumber only — canvas dimensions must NOT be included
  // here.  The terrain coordinate space is the fixed RPG logical world size, so
  // terrain layout must be identical regardless of window size, browser zoom, or
  // devicePixelRatio.  Including canvasW/canvasH in the seed would cause different
  // terrain to be generated after a resize, violating coordinate stability.
  const seed = ((waveNumber + 1) * 0x9e3779b1) >>> 0;
  const { terrainProfile } = getRpgZoneTerrainProfile(activeZoneId);

  if (terrainProfile === 'horizon') {
    return null;
  }

  // Impetus: no terrain obstacles — visual space effects are handled by impetus-overlay.ts.
  if (terrainProfile === 'asteroids') {
    return null;
  }

  if (terrainProfile === 'seafloor') {
    const sfSeed = (seed ^ 0x51af100d) >>> 0;
    return {
      waveNumber,
      seed,
      paletteId: 'cyanTactical',
      terrainKind: 'seafloorRidges',
      islands: [],
      phase: 'growing',
      phaseStartedAtMs: nowMs,
      growDurationMs: TERRAIN_GROW_DURATION_MS,
      shrinkDurationMs: TERRAIN_SHRINK_DURATION_MS,
      growth01: 0,
      mergedContours: null,
      lightCache: null,
      squareNodes: [],
      squareMaxDepth: 0,
      basalt: undefined,
      seafloor: generateSeafloorTerrain(sfSeed, canvasW, canvasH),
    };
  }

  // Verdure: no terrain obstacles — cave-wall/vine visuals are handled by verdure-overlay.ts
  // and rpg-verdure-render.ts.
  if (terrainProfile === 'overgrowth') {
    return null;
  }

  // Euhedral (crystalline): fractured square plates primarily, basalt/hex occasionally.
  // Never use topographic terrain for Euhedral.
  if (terrainProfile === 'crystalline') {
    if (seed % 4 === 0) {
      return {
        waveNumber,
        seed,
        paletteId: 'mono',
        terrainKind: 'basalt',
        islands: [],
        phase: 'growing',
        phaseStartedAtMs: nowMs,
        growDurationMs: TERRAIN_GROW_DURATION_MS,
        shrinkDurationMs: TERRAIN_SHRINK_DURATION_MS,
        growth01: 0,
        mergedContours: null,
        lightCache: null,
        squareNodes: [],
        squareMaxDepth: 0,
        basalt: generateBasaltTerrain(seed, waveNumber, canvasW, canvasH),
      };
    }
    return createRecursiveSquareTerrainState(waveNumber, seed, canvasW, canvasH, nowMs);
  }

  // Fallback for unknown profiles: use the classic 20-wave cycle.
  const terrainKind = getTerrainKindForWave(waveNumber, false);

  if (terrainKind === 'none') {
    return null;
  }

  if (terrainKind === 'recursiveSquares') {
    return createRecursiveSquareTerrainState(waveNumber, seed, canvasW, canvasH, nowMs);
  }

  if (terrainKind === 'basalt') {
    return {
      waveNumber,
      seed,
      paletteId: 'mono',
      terrainKind: 'basalt',
      islands: [],
      phase: 'growing',
      phaseStartedAtMs: nowMs,
      growDurationMs: TERRAIN_GROW_DURATION_MS,
      shrinkDurationMs: TERRAIN_SHRINK_DURATION_MS,
      growth01: 0,
      mergedContours: null,
      lightCache: null,
      squareNodes: [],
      squareMaxDepth: 0,
      basalt: generateBasaltTerrain(seed, waveNumber, canvasW, canvasH),
    };
  }

  return createTopographicTerrainState(waveNumber, seed, canvasW, canvasH, nowMs);
}

function createTopographicTerrainState(
  waveNumber: number,
  seed: number,
  canvasW: number,
  canvasH: number,
  nowMs: number,
  paletteOverride?: TopographicTerrainPaletteId,
): TopographicTerrainState {
  const state = generateTopographicTerrain(waveNumber, seed, canvasW, canvasH, paletteOverride);
  state.phaseStartedAtMs = nowMs;
  state.phase = 'growing';
  state.growth01 = 0;
  return state;
}

function createRecursiveSquareTerrainState(
  waveNumber: number,
  seed: number,
  canvasW: number,
  canvasH: number,
  nowMs: number,
): TopographicTerrainState {
  const squareNodes = generateRecursiveSquareTerrain(seed, waveNumber, canvasW, canvasH);
  const squareMaxDepth = squareNodes.reduce((m, n) => Math.max(m, n.depth), 0);
  return {
    waveNumber,
    seed,
    paletteId: 'mono',
    terrainKind: 'recursiveSquares',
    islands: [],
    phase: 'growing',
    phaseStartedAtMs: nowMs,
    growDurationMs: TERRAIN_GROW_DURATION_MS,
    shrinkDurationMs: TERRAIN_SHRINK_DURATION_MS,
    growth01: 0,
    mergedContours: null,
    lightCache: null,
    squareNodes,
    squareMaxDepth,
    basalt: undefined,
  };
}

export function updateTopographicTerrain(state: TopographicTerrainState, nowMs: number): void {
  if (state.phase === 'hidden' || state.phase === 'stable') return;

  if (state.phase === 'growing') {
    const elapsedMs = nowMs - state.phaseStartedAtMs;
    const t = clamp(elapsedMs / Math.max(1, state.growDurationMs), 0, 1);
    state.growth01 = easeInOutSine(t);
    if (t >= 1) {
      state.phase = 'stable';
      state.growth01 = 1;
    }
    return;
  }

  if (state.phase === 'shrinking') {
    const elapsedMs = nowMs - state.phaseStartedAtMs;
    const t = clamp(elapsedMs / Math.max(1, state.shrinkDurationMs), 0, 1);
    state.growth01 = 1 - easeInCubic(t);
    if (t >= 1) {
      state.phase = 'hidden';
      state.growth01 = 0;
    }
  }
}

export function beginTopographicTerrainShrink(state: TopographicTerrainState, nowMs: number): void {
  if (state.phase === 'stable' || state.phase === 'growing') {
    state.phase = 'shrinking';
    state.phaseStartedAtMs = nowMs;
  }
}

export function isTopographicTerrainReadyForEnemySpawns(state: TopographicTerrainState): boolean {
  return state.phase === 'stable' || state.phase === 'hidden';
}

export function isTopographicTerrainGone(state: TopographicTerrainState): boolean {
  return state.phase === 'hidden';
}

export function renderTopographicTerrain(
  ctx: CanvasRenderingContext2D,
  state: TopographicTerrainState,
  nowMs: number,
  enemies?: EnemyInfluencePoint[],
  lowGraphics?: boolean,
): void {
  if (state.phase === 'hidden') return;

  void nowMs;

  // Dispatch to the appropriate renderer based on terrain variant.
  if (state.terrainKind === 'recursiveSquares') {
    renderRecursiveSquareTerrain(ctx, state.squareNodes, state.squareMaxDepth, state.growth01, enemies);
    return;
  }
  if (state.terrainKind === 'basalt') {
    if (state.basalt) renderBasaltTerrain(ctx, state.basalt, state.growth01);
    return;
  }
  if (state.terrainKind === 'seafloorRidges') {
    if (state.seafloor) renderSeafloorTerrain(ctx, state.seafloor, state.growth01, lowGraphics ?? false);
    return;
  }

  ctx.save();
  try {
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (state.mergedContours && state.mergedContours.levels.length > 0) {
      _renderMergedContours(ctx, state);
    } else {
      _renderPerIslandRings(ctx, state);
    }

    if (terrainDevMode) {
      drawTerrainDevOverlay(ctx, state);
    }
  } finally {
    ctx.restore();
  }
}

/**
 * Renders the merged scalar-field contour lines.
 *
 * Growing phase: rings reveal from innermost to outermost via opacity fade only.
 *   Each ring pops up at its full final position — no radial expansion.
 * Shrinking/stable phase: existing scale-based animation is preserved.
 */
function _renderMergedContours(
  ctx: CanvasRenderingContext2D,
  state: TopographicTerrainState,
): void {
  const mc = state.mergedContours!;
  const g = state.growth01;
  const { centroidX: cx, centroidY: cy } = mc;
  const numLevels = mc.levels.length;
  const isGrowing = state.phase === 'growing';

  // Draw solid fill of outermost contour first.
  const outerLevel = mc.levels[0];
  const outerGrowth = getRingGrowth01(g, numLevels, numLevels - 1);
  if (outerGrowth > 0 && outerLevel.polylines.length > 0) {
    for (const polyline of outerLevel.polylines) {
      if (isGrowing) {
        // Reveal at full size — opacity only, no radial scale.
        if (polyline.length < 2) continue;
        drawClosedPolygon(ctx, polyline);
        ctx.globalAlpha = outerGrowth;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();
      } else {
        const pts = _scalePolylineAroundCentroid(polyline, cx, cy, outerGrowth);
        if (pts.length < 2) continue;
        drawClosedPolygon(ctx, pts);
        ctx.globalAlpha = outerGrowth;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();
      }
    }
  }

  // Draw contour lines from innermost to outermost (so outer lines overlay inner).
  for (let li = numLevels - 1; li >= 0; li--) {
    const level = mc.levels[li];
    // Animation: inner levels (high li) appear early; outer levels (low li) appear late.
    // Map li → invertedIdx: li=numLevels-1 (innermost) → idx=0; li=0 (outermost) → idx=numLevels-1
    const invertedIdx = (numLevels - 1) - li;
    const levelGrowth = getRingGrowth01(g, numLevels, invertedIdx);
    if (levelGrowth <= 0) continue;

    for (const polyline of level.polylines) {
      if (isGrowing) {
        // Growing: render ring at its full generated size, fade in via opacity only.
        // This creates a "popping up from the ground" effect ring-by-ring, rather
        // than the previous radial expansion from the centroid.
        if (polyline.length < 2) continue;
        drawClosedPolygon(ctx, polyline);
        ctx.globalAlpha = level.alpha * levelGrowth;
        ctx.lineWidth = level.lineWidth;
        ctx.strokeStyle = level.color;
        ctx.stroke();
      } else {
        const pts = _scalePolylineAroundCentroid(polyline, cx, cy, levelGrowth);
        if (pts.length < 2) continue;
        drawClosedPolygon(ctx, pts);
        ctx.globalAlpha = level.alpha * levelGrowth;
        ctx.lineWidth = level.lineWidth;
        ctx.strokeStyle = level.color;
        ctx.stroke();
      }
    }
  }
}

/** Scales a polyline's points around (cx, cy) by `scale`. */
function _scalePolylineAroundCentroid(
  pts: TopographicTerrainPoint[],
  cx: number,
  cy: number,
  scale: number,
): TopographicTerrainPoint[] {
  const out = new Array<TopographicTerrainPoint>(pts.length);
  for (let i = 0; i < pts.length; i++) {
    out[i] = {
      x: cx + (pts[i].x - cx) * scale,
      y: cy + (pts[i].y - cy) * scale,
    };
  }
  return out;
}

/**
 * Legacy fallback: renders per-island ring polygons.
 * Used when mergedContours is unavailable (e.g. tests that construct
 * TerrainState manually without calling generateTopographicTerrain).
 *
 * Growing phase: rings reveal from innermost to outermost via opacity only (no scale).
 * Shrinking/stable phase: existing scale-based animation is preserved.
 */
function _renderPerIslandRings(
  ctx: CanvasRenderingContext2D,
  state: TopographicTerrainState,
): void {
  const palette = PALETTES[state.paletteId];
  const isGrowing = state.phase === 'growing';

  for (const island of state.islands) {
    const totalRings = island.rings.length;
    if (totalRings <= 0) continue;

    const outerRing = island.rings[totalRings - 1];
    const outerRingGrowth01 = getRingGrowth01(state.growth01, totalRings, outerRing.ringIndex);
    if (outerRingGrowth01 > 0) {
      if (isGrowing) {
        drawClosedPolygon(ctx, outerRing.points);
        ctx.globalAlpha = outerRingGrowth01;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();
      } else {
        const animatedOuterPolygon = animatePoints(
          outerRing.points,
          island.centerX,
          island.centerY,
          outerRingGrowth01,
        );
        drawClosedPolygon(ctx, animatedOuterPolygon);
        ctx.globalAlpha = outerRingGrowth01;
        ctx.fillStyle = 'rgba(0,0,0,0.18)';
        ctx.fill();
      }
    }

    for (const ring of island.rings) {
      const ringGrowth01 = getRingGrowth01(state.growth01, totalRings, ring.ringIndex);
      if (ringGrowth01 <= 0) continue;

      if (isGrowing) {
        // Growing: render ring at its full generated position, fade in via opacity only.
        drawClosedPolygon(ctx, ring.points);

        if (palette.glow !== null && palette.glowAlpha > 0) {
          ctx.globalAlpha = palette.glowAlpha * ringGrowth01;
          ctx.lineWidth = ring.lineWidth * 2.5;
          ctx.strokeStyle = palette.glow;
          ctx.stroke();
        }

        drawClosedPolygon(ctx, ring.points);
        ctx.globalAlpha = ring.alpha * ringGrowth01;
        ctx.lineWidth = ring.lineWidth;
        ctx.strokeStyle = ring.color;
        ctx.stroke();
      } else {
        const animatedPoints = animatePoints(ring.points, island.centerX, island.centerY, ringGrowth01);
        drawClosedPolygon(ctx, animatedPoints);

        if (palette.glow !== null && palette.glowAlpha > 0) {
          ctx.globalAlpha = palette.glowAlpha * ringGrowth01;
          ctx.lineWidth = ring.lineWidth * 2.5;
          ctx.strokeStyle = palette.glow;
          ctx.stroke();
        }

        drawClosedPolygon(ctx, animatedPoints);
        ctx.globalAlpha = ring.alpha * ringGrowth01;
        ctx.lineWidth = ring.lineWidth;
        ctx.strokeStyle = ring.color;
        ctx.stroke();
      }
    }
  }
}

export function setTopographicTerrainDevMode(enabled: boolean): void {
  terrainDevMode = enabled;
}

// ── Recursive-square collision helpers ────────────────────────────────────────

/**
 * Returns the corner polygons for all square nodes that are currently active
 * (visible and solid) based on growth01.  Squares pop in depth-by-depth, so
 * only nodes whose depth-activation threshold has been crossed are included.
 *
 * Uses a threshold of 0.1 (alpha > 0.1) to match the point where squares
 * are already well past their fade-in.
 */
function _getActiveSquarePolygons(state: TopographicTerrainState): TopographicTerrainPoint[][] {
  const result: TopographicTerrainPoint[][] = [];
  for (const node of state.squareNodes) {
    const alpha = getSquareNodeGrowthAlpha01(node.depth, state.squareMaxDepth, state.growth01);
    if (alpha > 0.1) {
      result.push(node.corners);
    }
  }
  return result;
}

function _getActiveBasaltPolygons(state: TopographicTerrainState): TopographicTerrainPoint[][] {
  const result: TopographicTerrainPoint[][] = [];
  if (!state.basalt) return result;
  for (const cell of state.basalt.cells) {
    if (getBasaltCellAlpha(cell, state.growth01) > 0.1) {
      result.push(cell.corners);
    }
  }
  return result;
}

/**
 * Returns true when `(x, y)` is inside any terrain island at its current
 * effective scale (phase-aware: uses `growth01` scaling).
 *
 * When mergedContours are available the test uses the merged outer boundaries
 * (scaled around the merged centroid); otherwise falls back to per-island
 * solid outer polygons.
 */
export function isPointInsideTopographicTerrain(
  state: TopographicTerrainState,
  x: number,
  y: number,
): boolean {
  if (state.phase === 'hidden') return false;
  const g = state.growth01;
  if (g <= 0) return false;

  // Recursive-square branch: corners are in world space, no centroid scaling.
  if (state.terrainKind === 'recursiveSquares') {
    for (const polygon of _getActiveSquarePolygons(state)) {
      if (isPointInPolygon(polygon, x, y)) return true;
    }
    return false;
  }

  if (state.terrainKind === 'basalt') {
    for (const polygon of _getActiveBasaltPolygons(state)) {
      if (isPointInPolygon(polygon, x, y)) return true;
    }
    return false;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return false;
    for (const seg of state.seafloor.allCollisionSegments) {
      if (_pointInCapsule(x, y, seg.x1, seg.y1, seg.x2, seg.y2, seg.radius)) return true;
    }
    return false;
  }

  if (state.mergedContours && state.mergedContours.solidBoundaries.length > 0) {
    const { centroidX: mcx, centroidY: mcy, solidBoundaries } = state.mergedContours;
    const xs = mcx + (x - mcx) / g;
    const ys = mcy + (y - mcy) / g;
    for (const boundary of solidBoundaries) {
      if (boundary.length >= 3 && isPointInPolygon(boundary, xs, ys)) return true;
    }
    return false;
  }

  // Legacy fallback: per-island polygons.
  for (const island of state.islands) {
    const xs = island.centerX + (x - island.centerX) / g;
    const ys = island.centerY + (y - island.centerY) / g;
    if (isPointInPolygon(island.solidOuterPolygon, xs, ys)) return true;
  }
  return false;
}

/**
 * Returns true when the segment `(x1,y1)→(x2,y2)` intersects or is contained
 * within any terrain island, accounting for the current growth scale.
 */
export function segmentIntersectsTopographicTerrain(
  state: TopographicTerrainState,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
): boolean {
  if (state.phase === 'hidden') return false;
  const g = state.growth01;
  if (g <= 0) return false;

  // Recursive-square branch: corners are in world space, no inverse-scaling needed.
  if (state.terrainKind === 'recursiveSquares') {
    for (const polygon of _getActiveSquarePolygons(state)) {
      if (polygon.length < 3) continue;
      if (isPointInPolygon(polygon, x1, y1) || isPointInPolygon(polygon, x2, y2)) return true;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (segmentsIntersect(x1, y1, x2, y2, a.x, a.y, b.x, b.y)) return true;
      }
    }
    return false;
  }

  if (state.terrainKind === 'basalt') {
    for (const polygon of _getActiveBasaltPolygons(state)) {
      if (polygon.length < 3) continue;
      if (isPointInPolygon(polygon, x1, y1) || isPointInPolygon(polygon, x2, y2)) return true;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (segmentsIntersect(x1, y1, x2, y2, a.x, a.y, b.x, b.y)) return true;
      }
    }
    return false;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return false;
    for (const seg of state.seafloor.allCollisionSegments) {
      if (_segmentIntersectsCapsule(x1, y1, x2, y2, seg.x1, seg.y1, seg.x2, seg.y2, seg.radius)) return true;
    }
    return false;
  }

  const { polygons, invCx, invCy } = _getSolidPolygonsAndCenter(state);

  // Inverse-scale both endpoints into unscaled polygon space.
  const lx1 = invCx + (x1 - invCx) / g, ly1 = invCy + (y1 - invCy) / g;
  const lx2 = invCx + (x2 - invCx) / g, ly2 = invCy + (y2 - invCy) / g;

  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    if (isPointInPolygon(polygon, lx1, ly1) || isPointInPolygon(polygon, lx2, ly2)) return true;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (segmentsIntersect(lx1, ly1, lx2, ly2, a.x, a.y, b.x, b.y)) return true;
    }
  }
  return false;
}

/**
 * Returns the squared distance from point `(px, py)` to the nearest point on
 * segment `(ax, ay)→(bx, by)`.  Used by circleIntersectsTopographicTerrain.
 */
function pointToSegmentDistSq(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): number {
  return nearestPointOnSegment(px, py, ax, ay, bx, by).distSq;
}

/**
 * Returns true when a circle of `radiusPx` centred at `(x, y)` overlaps any
 * terrain island at its current growth scale.  Uses a fast outer-radius
 * pre-reject, then checks:
 *   1. Circle centre inside the scaled polygon.
 *   2. Any polygon edge within `radiusPx` of the centre (handles the case
 *      where the centre is outside but the edge grazes the circle).
 *
 * Phase-aware: the polygon is inverse-scaled so the test is performed in
 * unscaled space, with the radius correspondingly scaled by `1/g`.
 */
export function circleIntersectsTopographicTerrain(
  state: TopographicTerrainState,
  x: number,
  y: number,
  radiusPx: number,
): boolean {
  if (state.phase === 'hidden') return false;
  const g = state.growth01;
  if (g <= 0) return false;

  // Recursive-square branch: corners are in world space, bounding-circle pre-reject.
  if (state.terrainKind === 'recursiveSquares') {
    for (const node of state.squareNodes) {
      const alpha = getSquareNodeGrowthAlpha01(node.depth, state.squareMaxDepth, g);
      if (alpha <= 0.1) continue;
      // Fast bounding-circle pre-reject.
      const bdx = x - node.cx, bdy = y - node.cy;
      const outerR = node.boundingRadius + radiusPx;
      if (bdx * bdx + bdy * bdy > outerR * outerR) continue;
      const polygon = node.corners;
      if (isPointInPolygon(polygon, x, y)) return true;
      const r2 = radiusPx * radiusPx;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (pointToSegmentDistSq(x, y, a.x, a.y, b.x, b.y) <= r2) return true;
      }
    }
    return false;
  }

  if (state.terrainKind === 'basalt') {
    if (!state.basalt) return false;
    for (const cell of state.basalt.cells) {
      const alpha = getBasaltCellAlpha(cell, g);
      if (alpha <= 0.1) continue;
      const bdx = x - cell.cx, bdy = y - cell.cy;
      const outerR = cell.radius + radiusPx;
      if (bdx * bdx + bdy * bdy > outerR * outerR) continue;
      const polygon = cell.corners;
      if (isPointInPolygon(polygon, x, y)) return true;
      const r2b = radiusPx * radiusPx;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        if (pointToSegmentDistSq(x, y, a.x, a.y, b.x, b.y) <= r2b) return true;
      }
    }
    return false;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return false;
    for (const seg of state.seafloor.allCollisionSegments) {
      const combinedR = seg.radius + radiusPx;
      if (pointToSegmentDistSq(x, y, seg.x1, seg.y1, seg.x2, seg.y2) <= combinedR * combinedR) return true;
    }
    return false;
  }

  for (const island of state.islands) {
    const dx = x - island.centerX, dy = y - island.centerY;
    const distSq = dx * dx + dy * dy;
    const outerR = island.outerRadius * g + radiusPx;
    if (distSq > outerR * outerR) continue; // fast outer-radius reject

    const polygon = island.solidOuterPolygon;
    if (polygon.length < 3) continue;

    // Inverse-scale the query point into unscaled polygon space.
    const xs = island.centerX + (x - island.centerX) / g;
    const ys = island.centerY + (y - island.centerY) / g;

    // Case 1: circle centre is inside the scaled polygon.
    if (isPointInPolygon(polygon, xs, ys)) return true;

    // Case 2: any polygon edge is within radiusPx of the circle centre.
    // In inverse-scaled space the equivalent radius is radiusPx / g.
    const invR2 = (radiusPx / g) * (radiusPx / g);
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      if (pointToSegmentDistSq(xs, ys, a.x, a.y, b.x, b.y) <= invR2) return true;
    }
  }
  return false;
}

/**
 * Returns `true` when the straight line from `(fromX, fromY)` to `(toX, toY)`
 * is not blocked by any terrain island.  Returns `true` when terrain is null
 * or inactive.
 *
 * Convenience wrapper around segmentIntersectsTopographicTerrain for use in
 * weapon systems and targeting code.
 */
export function hasTopographicTerrainLineOfSight(
  terrain: TopographicTerrainState | null,
  fromX: number,
  fromY: number,
  toX: number,
  toY: number,
): boolean {
  if (!terrain) return true;
  return !segmentIntersectsTopographicTerrain(terrain, fromX, fromY, toX, toY);
}

/**
 * Finds the earliest parametric distance `t ∈ [0, 1]` at which the ray from
 * `(ox, oy)` in direction `(dx, dy)` with length `maxT` first intersects any
 * terrain island boundary.  Returns a value in `[0, 1]` (fraction of `maxT`)
 * when an intersection is found, or `1` if the ray is unobstructed.
 *
 * Useful for truncating projectile paths and laser beams at terrain surfaces.
 */
export function terrainFirstIntersectionT(
  state: TopographicTerrainState,
  ox: number,
  oy: number,
  dx: number,
  dy: number,
  maxT: number,
): number {
  if (state.phase === 'hidden' || maxT <= 0) return 1;
  const g = state.growth01;
  if (g <= 0) return 1;

  // Recursive-square branch: corners are already in world space.
  if (state.terrainKind === 'recursiveSquares') {
    const ex = ox + dx * maxT, ey = oy + dy * maxT;
    let bestFraction = 1;
    for (const polygon of _getActiveSquarePolygons(state)) {
      if (polygon.length < 3) continue;
      if (isPointInPolygon(polygon, ox, oy)) return 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const t = segmentIntersectT(ox, oy, ex, ey, a.x, a.y, b.x, b.y);
        if (t !== null && t < bestFraction) bestFraction = t;
      }
    }
    return bestFraction;
  }

  if (state.terrainKind === 'basalt') {
    const ex = ox + dx * maxT, ey = oy + dy * maxT;
    let bestFraction = 1;
    for (const polygon of _getActiveBasaltPolygons(state)) {
      if (polygon.length < 3) continue;
      if (isPointInPolygon(polygon, ox, oy)) return 0;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const t = segmentIntersectT(ox, oy, ex, ey, a.x, a.y, b.x, b.y);
        if (t !== null && t < bestFraction) bestFraction = t;
      }
    }
    return bestFraction;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return 1;
    // Check if origin is already inside a capsule.
    for (const seg of state.seafloor.allCollisionSegments) {
      if (_pointInCapsule(ox, oy, seg.x1, seg.y1, seg.x2, seg.y2, seg.radius)) return 0;
    }
    // Step along the ray to find the first capsule entry.
    const STEP_PX = 5;
    const steps = Math.ceil(maxT / STEP_PX);
    let bestFraction = 1;
    for (let si = 1; si <= steps; si++) {
      const t = Math.min(si / steps, 1);
      const px = ox + dx * maxT * t;
      const py = oy + dy * maxT * t;
      for (const seg of state.seafloor.allCollisionSegments) {
        if (_pointInCapsule(px, py, seg.x1, seg.y1, seg.x2, seg.y2, seg.radius)) {
          if (t < bestFraction) bestFraction = t;
          break;
        }
      }
    }
    return bestFraction;
  }

  const { polygons, invCx, invCy } = _getSolidPolygonsAndCenter(state);
  const ex = ox + dx * maxT, ey = oy + dy * maxT;
  const lox = invCx + (ox - invCx) / g, loy = invCy + (oy - invCy) / g;
  const lex = invCx + (ex - invCx) / g, ley = invCy + (ey - invCy) / g;

  let bestFraction = 1;
  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    if (isPointInPolygon(polygon, lox, loy)) return 0;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const t = segmentIntersectT(lox, loy, lex, ley, a.x, a.y, b.x, b.y);
      if (t !== null && t < bestFraction) bestFraction = t;
    }
  }
  return bestFraction;
}

export function getTopographicTerrainSolidPolygons(state: TopographicTerrainState): TopographicTerrainPoint[][] {
  if (state.phase === 'hidden') return [];
  // Recursive-square variant: return active square corner polygons.
  if (state.terrainKind === 'recursiveSquares') {
    return _getActiveSquarePolygons(state);
  }
  if (state.terrainKind === 'basalt') {
    return _getActiveBasaltPolygons(state);
  }
  if (state.mergedContours && state.mergedContours.solidBoundaries.length > 0) {
    return state.mergedContours.solidBoundaries;
  }
  return state.islands.map(island => island.solidOuterPolygon);
}

/**
 * Returns the nearest point on any solid terrain boundary polygon to the given
 * point (in world coordinates, accounting for growth01 scaling).
 *
 * @param state     Terrain state
 * @param x         Query x (world)
 * @param y         Query y (world)
 * @param outNearest  Written with the nearest boundary point (world coords)
 * @returns         Signed distance: negative = point is INSIDE terrain,
 *                  positive = outside.  Returns +Infinity if no terrain.
 */
export function signedDistanceToTerrainBoundary(
  state: TopographicTerrainState,
  x: number,
  y: number,
  outNearest: { x: number; y: number } | null,
): number {
  if (state.phase === 'hidden') return Infinity;
  const g = state.growth01;
  if (g <= 0) return Infinity;

  // Recursive-square branch: corners are in world space, no inverse-scaling.
  if (state.terrainKind === 'recursiveSquares') {
    const polygons = _getActiveSquarePolygons(state);
    if (polygons.length === 0) return Infinity;
    let bestDistSq = Infinity;
    let bestNx = x, bestNy = y;
    let bestInsideAny = false;
    for (const polygon of polygons) {
      if (polygon.length < 3) continue;
      const inside = isPointInPolygon(polygon, x, y);
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestNx = nx; bestNy = ny;
          bestInsideAny = inside;
        }
      }
    }
    if (bestDistSq === Infinity) return Infinity;
    if (outNearest) { outNearest.x = bestNx; outNearest.y = bestNy; }
    const distWorld = Math.sqrt(bestDistSq);
    return bestInsideAny ? -distWorld : distWorld;
  }

  if (state.terrainKind === 'basalt') {
    if (!state.basalt) return Infinity;
    let bestDistSq = Infinity;
    let bestNx = x, bestNy = y;
    let bestInsideAny = false;
    for (const cell of state.basalt.cells) {
      if (getBasaltCellAlpha(cell, g) <= 0.1) continue;
      const polygon = cell.corners;
      if (polygon.length < 3) continue;
      const inside = isPointInPolygon(polygon, x, y);
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestNx = nx;
          bestNy = ny;
          bestInsideAny = inside;
        }
      }
    }
    if (bestDistSq === Infinity) return Infinity;
    if (outNearest) { outNearest.x = bestNx; outNearest.y = bestNy; }
    const distWorld = Math.sqrt(bestDistSq);
    return bestInsideAny ? -distWorld : distWorld;
  }

  if (state.terrainKind === 'seafloorRidges') {
    if (!state.seafloor || state.seafloor.allCollisionSegments.length === 0) return Infinity;
    // For capsule terrain: signed distance = dist_to_capsule_axis - radius.
    // Negative means inside (blocked).
    let bestSigned = Infinity;
    let bestNx = x, bestNy = y;
    for (const seg of state.seafloor.allCollisionSegments) {
      const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, seg.x1, seg.y1, seg.x2, seg.y2);
      const distToAxis = Math.sqrt(distSq);
      const signed = distToAxis - seg.radius;
      if (signed < bestSigned) {
        bestSigned = signed;
        // Nearest point on capsule surface: push from axis toward (x,y) by radius.
        if (distToAxis > 1e-6) {
          const frac = seg.radius / distToAxis;
          bestNx = nx + (x - nx) * frac;
          bestNy = ny + (y - ny) * frac;
        } else {
          bestNx = nx; bestNy = ny;
        }
      }
    }
    if (bestSigned === Infinity) return Infinity;
    if (outNearest) { outNearest.x = bestNx; outNearest.y = bestNy; }
    return bestSigned;
  }

  const { polygons, invCx, invCy } = _getSolidPolygonsAndCenter(state);
  if (polygons.length === 0) return Infinity;

  // Work in unscaled space.
  const xs = invCx + (x - invCx) / g;
  const ys = invCy + (y - invCy) / g;

  let bestDistSq = Infinity;
  let bestNx = xs, bestNy = ys;
  let bestInsideAny = false;

  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    const inside = isPointInPolygon(polygon, xs, ys);

    // Find nearest edge point.
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const { x: nx, y: ny, distSq } = nearestPointOnSegment(xs, ys, a.x, a.y, b.x, b.y);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestNx = nx;
        bestNy = ny;
        bestInsideAny = inside;
      }
    }
  }

  if (bestDistSq === Infinity) return Infinity;

  // Convert nearest-boundary point back to world space.
  if (outNearest) {
    outNearest.x = invCx + (bestNx - invCx) * g;
    outNearest.y = invCy + (bestNy - invCy) * g;
  }

  const distWorld = Math.sqrt(bestDistSq) * g;
  return bestInsideAny ? -distWorld : distWorld;
}

/**
 * If `(x, y)` is inside terrain, finds the nearest boundary point and pushes
 * the point just outside it (by `marginPx`).
 *
 * Uses nearest-point-on-polygon logic so the push destination lies on the
 * actual solid boundary, even for concave or elongated island shapes.
 *
 * @param marginPx  Extra clearance beyond the boundary (px)
 * @returns true if a push occurred, false if already outside.
 */
export function pushPointOutsideTopographicTerrain(
  state: TopographicTerrainState,
  x: number,
  y: number,
  outPos: { x: number; y: number },
  marginPx: number,
): boolean {
  if (state.phase === 'hidden') { outPos.x = x; outPos.y = y; return false; }
  const g = state.growth01;
  if (g <= 0) { outPos.x = x; outPos.y = y; return false; }

  // Recursive-square branch: corners are in world space.
  if (state.terrainKind === 'recursiveSquares') {
    for (const polygon of _getActiveSquarePolygons(state)) {
      if (polygon.length < 3) continue;
      if (!isPointInPolygon(polygon, x, y)) continue;
      let bestDistSq = Infinity;
      let bestNx = x, bestNy = y;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
        if (distSq < bestDistSq) { bestDistSq = distSq; bestNx = nx; bestNy = ny; }
      }
      const bdx = bestNx - x, bdy = bestNy - y;
      const bdLen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
      outPos.x = bestNx + (bdx / bdLen) * marginPx;
      outPos.y = bestNy + (bdy / bdLen) * marginPx;
      return true;
    }
    outPos.x = x; outPos.y = y;
    return false;
  }

  if (state.terrainKind === 'basalt') {
    if (!state.basalt) { outPos.x = x; outPos.y = y; return false; }
    for (const cell of state.basalt.cells) {
      if (getBasaltCellAlpha(cell, g) <= 0.1) continue;
      const polygon = cell.corners;
      if (polygon.length < 3) continue;
      if (!isPointInPolygon(polygon, x, y)) continue;
      let bestDistSq = Infinity;
      let bestNx = x, bestNy = y;
      for (let i = 0; i < polygon.length; i++) {
        const a = polygon[i];
        const b = polygon[(i + 1) % polygon.length];
        const { x: nx, y: ny, distSq } = nearestPointOnSegment(x, y, a.x, a.y, b.x, b.y);
        if (distSq < bestDistSq) { bestDistSq = distSq; bestNx = nx; bestNy = ny; }
      }
      const bdx = bestNx - x, bdy = bestNy - y;
      const bdLen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
      outPos.x = bestNx + (bdx / bdLen) * marginPx;
      outPos.y = bestNy + (bdy / bdLen) * marginPx;
      return true;
    }
    outPos.x = x; outPos.y = y;
    return false;
  }

  const { polygons, invCx, invCy } = _getSolidPolygonsAndCenter(state);

  // Work in unscaled (precomputed polygon) space.
  const xs = invCx + (x - invCx) / g;
  const ys = invCy + (y - invCy) / g;

  for (const polygon of polygons) {
    if (polygon.length < 3) continue;
    if (!isPointInPolygon(polygon, xs, ys)) continue;

    // Find nearest point on the polygon boundary.
    let bestDistSq = Infinity;
    let bestNx = xs, bestNy = ys;
    for (let i = 0; i < polygon.length; i++) {
      const a = polygon[i];
      const b = polygon[(i + 1) % polygon.length];
      const { x: nx, y: ny, distSq } = nearestPointOnSegment(xs, ys, a.x, a.y, b.x, b.y);
      if (distSq < bestDistSq) {
        bestDistSq = distSq;
        bestNx = nx;
        bestNy = ny;
      }
    }

    // Push direction: from query point toward the boundary (outward).
    // The boundary point (bestNx, bestNy) is on the polygon; moving toward it
    // (and slightly past) puts the point just outside.
    const marginUnscaled = marginPx / g;
    const bdx = bestNx - xs;
    const bdy = bestNy - ys;
    const bdLen = Math.sqrt(bdx * bdx + bdy * bdy) || 1;
    const destXU = bestNx + (bdx / bdLen) * marginUnscaled;
    const destYU = bestNy + (bdy / bdLen) * marginUnscaled;

    // Convert back to world space.
    outPos.x = invCx + (destXU - invCx) * g;
    outPos.y = invCy + (destYU - invCy) * g;
    return true;
  }

  outPos.x = x; outPos.y = y;
  return false;
}

/**
 * Computes a soft repulsion force for an entity at (x, y) near terrain.
 *
 * If the entity is OUTSIDE terrain, returns zero force.
 * If the entity is INSIDE terrain (penetrating), returns a force directed
 * outward from the boundary whose magnitude scales quadratically with
 * penetration depth (`depthPx`²).
 *
 * This is designed to be applied to velocity *before* the hard push-out
 * fail-safe, giving collision a smooth "invisible barrier" feel.
 *
 * @param state       Terrain state.
 * @param x, y        Entity world position.
 * @param strength    Scaling factor for the repulsion force (px/frame).
 * @param outForce    Written with (fx, fy) repulsion force.
 * @returns           Penetration depth in px (0 if outside).
 */
export function computeTerrainRepulsionForce(
  state: TopographicTerrainState,
  x: number,
  y: number,
  strength: number,
  outForce: { x: number; y: number },
): number {
  outForce.x = 0; outForce.y = 0;
  if (state.phase === 'hidden') return 0;
  const g = state.growth01;
  if (g <= 0) return 0;

  const nearest = _repulsionScratch;
  const signedDist = signedDistanceToTerrainBoundary(state, x, y, nearest);

  if (signedDist >= 0) return 0; // outside — no force

  const depth = -signedDist; // positive
  const force = strength * depth * depth; // quadratic rise

  // Direction from entity to nearest boundary point = outward.
  const dx = nearest.x - x;
  const dy = nearest.y - y;
  const len = Math.sqrt(dx * dx + dy * dy) || 1;
  outForce.x = (dx / len) * force;
  outForce.y = (dy / len) * force;

  return depth;
}

// Scratch objects to avoid allocations in hot paths.
const _repulsionScratch = { x: 0, y: 0 };

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Returns the solid boundary polygons for the current terrain plus the
 * "inverse-scaling centre" to use when going from world space to unscaled space.
 */
function _getSolidPolygonsAndCenter(state: TopographicTerrainState): {
  polygons: TopographicTerrainPoint[][];
  invCx: number;
  invCy: number;
} {
  if (state.mergedContours && state.mergedContours.solidBoundaries.length > 0) {
    const mc = state.mergedContours;
    return {
      polygons: mc.solidBoundaries,
      invCx: mc.centroidX,
      invCy: mc.centroidY,
    };
  }
  // Per-island fallback: can only handle one polygon at a time.
  // We'll return all island polygons and use an approximate shared centroid.
  let cx = 0, cy = 0, n = 0;
  for (const island of state.islands) { cx += island.centerX; cy += island.centerY; n++; }
  if (n > 0) { cx /= n; cy /= n; }
  return {
    polygons: state.islands.map(i => i.solidOuterPolygon),
    invCx: cx,
    invCy: cy,
  };
}

/**
 * Returns the nearest point on segment (ax,ay)→(bx,by) to point (px,py),
 * together with the squared distance.
 */
function nearestPointOnSegment(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
): { x: number; y: number; distSq: number } {
  const abx = bx - ax, aby = by - ay;
  const lenSq = abx * abx + aby * aby;
  if (lenSq < 1e-12) {
    const dx = px - ax, dy = py - ay;
    return { x: ax, y: ay, distSq: dx * dx + dy * dy };
  }
  const t = Math.max(0, Math.min(1, ((px - ax) * abx + (py - ay) * aby) / lenSq));
  const nx = ax + t * abx, ny = ay + t * aby;
  const dx = px - nx, dy = py - ny;
  return { x: nx, y: ny, distSq: dx * dx + dy * dy };
}

function drawTerrainDevOverlay(ctx: CanvasRenderingContext2D, state: TopographicTerrainState): void {
  ctx.save();
  ctx.font = '10px monospace';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ffffff';
  ctx.globalAlpha = 0.9;
  const lines = [
    `terrain seed=${state.seed}`,
    `palette=${state.paletteId}`,
    `islands=${state.islands.length}`,
    `phase=${state.phase} growth=${state.growth01.toFixed(2)}`,
  ];
  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], 8, 40 + i * DEV_TEXT_LINE_HEIGHT_PX);
  }

  // Unscaled (raw geometry) polygon — red dashed
  ctx.globalAlpha = 0.4;
  ctx.strokeStyle = '#ff4040';
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 4]);
  for (const island of state.islands) {
    drawClosedPolygon(ctx, island.solidOuterPolygon);
    ctx.stroke();
  }

  // Scaled (effective collision) polygon — bright green solid
  const g = state.growth01;
  if (g > 0) {
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = '#00ff88';
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    for (const island of state.islands) {
      const scaledPts = island.solidOuterPolygon.map(p => ({
        x: island.centerX + (p.x - island.centerX) * g,
        y: island.centerY + (p.y - island.centerY) * g,
      }));
      drawClosedPolygon(ctx, scaledPts);
      ctx.stroke();
      // Draw island centre dot
      ctx.fillStyle = '#00ff88';
      ctx.globalAlpha = 0.6;
      ctx.beginPath();
      ctx.arc(island.centerX, island.centerY, 3, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.setLineDash([]);
  ctx.restore();
}

function drawClosedPolygon(ctx: CanvasRenderingContext2D, points: TopographicTerrainPoint[]): void {
  if (points.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.closePath();
}

function animatePoints(
  points: TopographicTerrainPoint[],
  centerX: number,
  centerY: number,
  growth01: number,
): TopographicTerrainPoint[] {
  const animated: TopographicTerrainPoint[] = new Array(points.length);
  for (let i = 0; i < points.length; i++) {
    const point = points[i];
    animated[i] = {
      x: centerX + (point.x - centerX) * growth01,
      y: centerY + (point.y - centerY) * growth01,
    };
  }
  return animated;
}

function getRingGrowth01(growth01: number, totalRings: number, ringIndex: number): number {
  return clamp(growth01 * (totalRings + 1) - ringIndex, 0, 1);
}

function isPointInPolygon(polygon: TopographicTerrainPoint[], x: number, y: number): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const pi = polygon[i];
    const pj = polygon[j];
    const intersects = ((pi.y > y) !== (pj.y > y))
      && (x < ((pj.x - pi.x) * (y - pi.y)) / ((pj.y - pi.y) || Number.EPSILON) + pi.x);
    if (intersects) inside = !inside;
  }
  return inside;
}

function segmentsIntersect(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  x3: number,
  y3: number,
  x4: number,
  y4: number,
): boolean {
  const d1 = cross(x1, y1, x2, y2, x3, y3);
  const d2 = cross(x1, y1, x2, y2, x4, y4);
  const d3 = cross(x3, y3, x4, y4, x1, y1);
  const d4 = cross(x3, y3, x4, y4, x2, y2);

  if (((d1 > 0 && d2 < 0) || (d1 < 0 && d2 > 0))
    && ((d3 > 0 && d4 < 0) || (d3 < 0 && d4 > 0))) {
    return true;
  }

  return (Math.abs(d1) <= 1e-6 && isPointOnSegment(x1, y1, x2, y2, x3, y3))
    || (Math.abs(d2) <= 1e-6 && isPointOnSegment(x1, y1, x2, y2, x4, y4))
    || (Math.abs(d3) <= 1e-6 && isPointOnSegment(x3, y3, x4, y4, x1, y1))
    || (Math.abs(d4) <= 1e-6 && isPointOnSegment(x3, y3, x4, y4, x2, y2));
}

function isPointOnSegment(
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  px: number,
  py: number,
): boolean {
  const minX = Math.min(x1, x2) - 1e-6;
  const maxX = Math.max(x1, x2) + 1e-6;
  const minY = Math.min(y1, y2) - 1e-6;
  const maxY = Math.max(y1, y2) + 1e-6;
  return px >= minX && px <= maxX && py >= minY && py <= maxY;
}

function cross(ax: number, ay: number, bx: number, by: number, px: number, py: number): number {
  return (bx - ax) * (py - ay) - (by - ay) * (px - ax);
}

/**
 * Returns the parametric `t ∈ [0, 1]` at which segment `(p1→p2)` crosses
 * segment `(p3→p4)`, or `null` if they do not cross within both extents.
 */
function segmentIntersectT(
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
  x4: number, y4: number,
): number | null {
  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-9) return null;
  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
  const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;
  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) return t;
  return null;
}

function randomRange(rng: () => number, min: number, max: number): number {
  return min + (max - min) * rng();
}

function randomIntInclusive(rng: () => number, min: number, max: number): number {
  return Math.floor(randomRange(rng, min, max + 1));
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function easeInCubic(t: number): number {
  return t * t * t;
}

function easeInOutSine(t: number): number {
  return -(Math.cos(Math.PI * t) - 1) / 2;
}

function distanceSq(ax: number, ay: number, bx: number, by: number): number {
  const dx = ax - bx;
  const dy = ay - by;
  return dx * dx + dy * dy;
}

// ── Seafloor capsule collision helpers ────────────────────────────────────────

/**
 * Returns true if point (px, py) is inside the capsule defined by segment
 * (ax,ay)→(bx,by) with the given radius.
 */
function _pointInCapsule(
  px: number, py: number,
  ax: number, ay: number,
  bx: number, by: number,
  radius: number,
): boolean {
  const r2 = radius * radius;
  return pointToSegmentDistSq(px, py, ax, ay, bx, by) <= r2;
}

/**
 * Returns true if segment (p1x,p1y)→(p2x,p2y) intersects capsule
 * (ax,ay)→(bx,by) with given radius.
 *
 * A segment intersects a capsule when any of these is true:
 *  1. Either segment endpoint is inside the capsule.
 *  2. Either capsule endpoint is within radius of the query segment.
 *  3. The two line segments cross (handled implicitly by case 1/2 via the
 *     zero-distance crossing case, plus the explicit segmentsIntersect guard).
 */
function _segmentIntersectsCapsule(
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  ax: number, ay: number,
  bx: number, by: number,
  radius: number,
): boolean {
  const r2 = radius * radius;
  if (pointToSegmentDistSq(p1x, p1y, ax, ay, bx, by) <= r2) return true;
  if (pointToSegmentDistSq(p2x, p2y, ax, ay, bx, by) <= r2) return true;
  if (pointToSegmentDistSq(ax, ay, p1x, p1y, p2x, p2y) <= r2) return true;
  if (pointToSegmentDistSq(bx, by, p1x, p1y, p2x, p2y) <= r2) return true;
  if (segmentsIntersect(p1x, p1y, p2x, p2y, ax, ay, bx, by)) return true;
  return false;
}
