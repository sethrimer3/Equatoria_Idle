/**
 * rpg-verdure-growth.ts — Verdure zone plant growth system.
 *
 * Manages the lifecycle of procedural plants that grow inward from the rocky
 * edges of the Verdure arena during active combat:
 *   - Spawning plants from edge anchor points on a tunable interval
 *   - Pre-computing per-plant Bezier path geometry (no per-frame alloc)
 *   - Advancing growth progress each frame
 *   - Tracking health and destruction state
 *   - Providing player-proximity targeting helpers
 *   - Emitting simple leaf-fragment death particles
 *
 * This module is Verdure-zone-only. All public functions must be guarded by
 * the caller (activeZoneId === 'verdure').
 *
 * Design constraints:
 *   - No per-frame object allocation in hot loops.
 *   - Path geometry generated once at spawn and cached in Float32Array.
 *   - Growth advances growthProgress 0..1; rendering reads only that scalar.
 *   - Plants are targetable only when (a) the player is within PLANT_TARGET_RANGE_PX,
 *     AND (b) the nearest grown segment is also within that range.
 */

import type { VerdureCaveWallState } from './verdure-cave-walls';

// ── Plant type definitions ──────────────────────────────────────────────────────

export type VerdurePlantType = 'vine' | 'spiral' | 'flower' | 'leafy' | 'thorn' | 'fern' | 'mushroom';

/**
 * One branch that splits from the main vine path.
 * Branches are generated at spawn and stored alongside the plant.
 */
export interface VerdureBranch {
  /** Index into the parent path's nodes where this branch starts. */
  startNode: number;
  /** Direction angle of this branch (radians). */
  angle: number;
  /** Bezier control points for the branch path [x0,y0,cx0,cy0,cx1,cy1,x1,y1,...]. */
  ctrlX: Float32Array;
  ctrlY: Float32Array;
  /** Number of cubic segments in this branch. */
  segCount: number;
  /** Total arc length of the branch path (logical px). */
  length: number;
}

/**
 * A leaf decoration at a specific point along the main vine.
 */
export interface VerdureLeaf {
  /** 0..1 progress along the main vine path where this leaf is attached. */
  tParam: number;
  /** Angle of the leaf relative to the vine tangent (radians). */
  angleDelta: number;
  /** Half-length of the leaf ellipse (logical px). */
  radiusA: number;
  /** Half-width of the leaf ellipse (logical px). */
  radiusB: number;
}

/**
 * A flower decoration at a specific point along the vine.
 */
export interface VerdureFlower {
  /** 0..1 progress along main path. */
  tParam: number;
  /** Radius of the flower head (logical px). */
  radius: number;
  /** Hue shift index (0..4) into the flower colour palette. */
  colorIdx: number;
}

/**
 * A death/destruction particle fragment (leaf fragment or petal).
 */
export interface VerdureFragment {
  x: number; y: number;
  vx: number; vy: number;
  /** Remaining life fraction 0..1. */
  life: number;
  /** Angular spin (rad/s). */
  spin: number;
  angle: number;
  size: number;
  colorIdx: number;
}

/**
 * One procedural plant instance in the Verdure zone.
 *
 * Path layout (ctrlX / ctrlY):
 *   Each cubic Bézier segment uses 4 points: P0, C0, C1, P1.
 *   Consecutive segments share their P1/P0, so for S segments we store S*3+1 points.
 *   Index arithmetic: segment i starts at point i*3.
 */
export interface VerdurePlant {
  id: number;
  type: VerdurePlantType;
  /** Root anchor position (on or near the arena edge). */
  rootX: number;
  rootY: number;
  /** Inward-pointing base direction (radians). */
  edgeDir: number;
  /** Pre-computed Bezier anchor+control points [x0,y0,cx0,cy0,cx1,cy1,x1,y1,...]. */
  ctrlX: Float32Array;
  ctrlY: Float32Array;
  /** Number of cubic segments along the main path. */
  segCount: number;
  /** Approximate arc length of the fully-grown main path (logical px). */
  fullLength: number;
  /** Branches (may be empty). */
  branches: VerdureBranch[];
  /** Leaf decorations (may be empty). */
  leaves: VerdureLeaf[];
  /** Flower decorations (may be empty). */
  flowers: VerdureFlower[];
  /** 0..1: fraction of the path that has been grown. Advances over time. */
  growthProgress: number;
  /** Progress units per second (1 = fully grown in 1 second). */
  growthSpeed: number;
  /** Current health. */
  hp: number;
  maxHp: number;
  /** True once hp reaches 0. */
  isDead: boolean;
  /** Death fade alpha 1..0 (decreases after isDead). */
  fadeAlpha: number;
  /** Elapsed ms since plant was created. */
  ageMs: number;
  /** Random seed (deterministic per plant). */
  seed: number;
  /** Thorn sharpness index for 'thorn' type (0..3). */
  thornIdx: number;
  /** True when the player is within target range of a grown segment. */
  isTargetable: boolean;
  /** Cached closest-segment distance (px) from player, updated each frame. */
  nearestSegDistPx: number;
}

// ── Tuning constants ───────────────────────────────────────────────────────────

/** Squared distance (px²) within which a plant becomes targetable. */
export const PLANT_TARGET_RANGE_SQ = 60 * 60;

/** High-graphics active plant cap. */
const MAX_PLANTS_HIGH = 16;
/** Low-graphics active plant cap. */
const MAX_PLANTS_LOW  = 8;

/** Wave-1 spawn interval (ms). Linearly decreases per wave. */
const PLANT_SPAWN_BASE_MS = 5000;
/** Minimum spawn interval (ms) at high wave numbers. */
const PLANT_SPAWN_MIN_MS  = 1800;
/** Per-wave reduction in spawn interval (ms). */
const PLANT_SPAWN_WAVE_REDUCTION_MS = 120;

/** Base plant HP. Scales gently with wave number. */
const PLANT_HP_BASE = 35;
const PLANT_HP_WAVE_SCALE = 4;

/** Base growth speed (progress/s). */
const PLANT_GROWTH_BASE  = 0.55;
const PLANT_GROWTH_RANGE = 0.30;

/** How fast a dead plant fades out (alpha/s). */
const PLANT_FADE_SPEED = 1.4;

/** Number of cubic segments along the main path (depends on plant type). */
const SEGS_BY_TYPE: Record<VerdurePlantType, number> = {
  vine:     5,
  spiral:   4,
  flower:   5,
  leafy:    4,
  thorn:    5,
  fern:     3,
  mushroom: 2,
};

/** Edge margin — plants spawn from within this many px of an arena edge. */
const EDGE_MARGIN = 12;

// ── Internal counter ───────────────────────────────────────────────────────────

let _nextId = 1;
let _spawnTimerMs = 0;

// ── Death fragment pool (static re-use array) ──────────────────────────────────

/** Active death fragments (leaves / petals). Capped to avoid alloc spikes. */
export const verdureFragments: VerdureFragment[] = [];
const MAX_FRAGMENTS = 60;

// ── Simple seeded pseudo-random ────────────────────────────────────────────────

function _rng(seed: number, idx: number): number {
  // LCG-style mixing — deterministic, fast
  const n = Math.sin(seed * 127.1 + idx * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// ── Path generation helpers ────────────────────────────────────────────────────

/**
 * Build the cubic Bézier control point arrays for a plant's main stem.
 * Each cubic segment: P0, C0, C1, P1 (P1 = P0 of next segment).
 * Storage: (segCount*3 + 1) points per axis.
 */
function _buildMainPath(
  rootX: number,
  rootY: number,
  edgeDir: number,
  segCount: number,
  seed: number,
  widthPx: number,
  heightPx: number,
): { ctrlX: Float32Array; ctrlY: Float32Array; fullLength: number } {
  const ptCount = segCount * 3 + 1;
  const ctrlX = new Float32Array(ptCount);
  const ctrlY = new Float32Array(ptCount);

  // Segment length: 16–26 px per cubic, so overall path 80–130 px
  const segLen = 16 + _rng(seed, 0) * 10;

  let cx = rootX;
  let cy = rootY;
  let angle = edgeDir;

  for (let s = 0; s < segCount; s++) {
    const base = s * 3;
    // Anchor P0
    ctrlX[base]     = cx;
    ctrlY[base]     = cy;

    // Add gentle wobble to direction
    const wobble = (_rng(seed, s * 4 + 1) - 0.5) * 0.55;
    angle += wobble;

    // Control point C0 (1/3 along)
    const cp0x = cx + Math.cos(angle + (_rng(seed, s * 4 + 2) - 0.5) * 0.4) * segLen * 0.35;
    const cp0y = cy + Math.sin(angle + (_rng(seed, s * 4 + 2) - 0.5) * 0.4) * segLen * 0.35;
    ctrlX[base + 1] = cp0x;
    ctrlY[base + 1] = cp0y;

    // Control point C1 (2/3 along)
    const cp1x = cx + Math.cos(angle + (_rng(seed, s * 4 + 3) - 0.5) * 0.4) * segLen * 0.7;
    const cp1y = cy + Math.sin(angle + (_rng(seed, s * 4 + 3) - 0.5) * 0.4) * segLen * 0.7;
    ctrlX[base + 2] = cp1x;
    ctrlY[base + 2] = cp1y;

    // Anchor P1
    cx += Math.cos(angle) * segLen;
    cy += Math.sin(angle) * segLen;

    // Clamp to arena (keep within bounds)
    cx = Math.max(4, Math.min(widthPx - 4, cx));
    cy = Math.max(4, Math.min(heightPx - 4, cy));
  }

  // Last anchor
  ctrlX[segCount * 3]     = cx;
  ctrlY[segCount * 3]     = cy;

  // Approximate arc length: sum of straight-line distances between sampled points
  let fullLength = 0;
  const samples = segCount * 4;
  let prevX = ctrlX[0], prevY = ctrlY[0];
  for (let i = 1; i <= samples; i++) {
    const t = i / samples;
    const { x, y } = _evalPathAt(ctrlX, ctrlY, segCount, t);
    const dx = x - prevX, dy = y - prevY;
    fullLength += Math.sqrt(dx * dx + dy * dy);
    prevX = x; prevY = y;
  }

  return { ctrlX, ctrlY, fullLength };
}

/**
 * Evaluate a point on the composite cubic Bézier path at global parameter t (0..1).
 */
export function _evalPathAt(
  ctrlX: Float32Array,
  ctrlY: Float32Array,
  segCount: number,
  t: number,
): { x: number; y: number } {
  const tClamped = Math.max(0, Math.min(1, t));
  const sFloat   = tClamped * segCount;
  const segIdx   = Math.min(Math.floor(sFloat), segCount - 1);
  const u        = sFloat - segIdx;

  const base = segIdx * 3;
  const p0x = ctrlX[base],     p0y = ctrlY[base];
  const c0x = ctrlX[base + 1], c0y = ctrlY[base + 1];
  const c1x = ctrlX[base + 2], c1y = ctrlY[base + 2];
  const p1x = ctrlX[base + 3], p1y = ctrlY[base + 3];

  const inv  = 1 - u;
  const inv2 = inv * inv;
  const inv3 = inv2 * inv;
  const u2   = u * u;
  const u3   = u2 * u;

  return {
    x: inv3 * p0x + 3 * inv2 * u * c0x + 3 * inv * u2 * c1x + u3 * p1x,
    y: inv3 * p0y + 3 * inv2 * u * c0y + 3 * inv * u2 * c1y + u3 * p1y,
  };
}

/**
 * Evaluate the tangent direction at t on the composite Bézier path.
 * Returns a normalised [dx, dy] pair.
 */
export function _evalTangentAt(
  ctrlX: Float32Array,
  ctrlY: Float32Array,
  segCount: number,
  t: number,
): { tx: number; ty: number } {
  const tClamped = Math.max(0.001, Math.min(0.999, t));
  const sFloat   = tClamped * segCount;
  const segIdx   = Math.min(Math.floor(sFloat), segCount - 1);
  const u        = sFloat - segIdx;

  const base = segIdx * 3;
  const p0x = ctrlX[base],     p0y = ctrlY[base];
  const c0x = ctrlX[base + 1], c0y = ctrlY[base + 1];
  const c1x = ctrlX[base + 2], c1y = ctrlY[base + 2];
  const p1x = ctrlX[base + 3], p1y = ctrlY[base + 3];

  const inv = 1 - u;
  // Derivative of cubic Bézier
  const dx = 3 * (inv * inv * (c0x - p0x) + 2 * inv * u * (c1x - c0x) + u * u * (p1x - c1x));
  const dy = 3 * (inv * inv * (c0y - p0y) + 2 * inv * u * (c1y - c0y) + u * u * (p1y - c1y));
  const len = Math.sqrt(dx * dx + dy * dy);
  return len > 0.0001 ? { tx: dx / len, ty: dy / len } : { tx: 1, ty: 0 };
}

/**
 * Build branch definitions for the plant (0–3 branches depending on type and seed).
 */
function _buildBranches(
  ctrlX: Float32Array,
  ctrlY: Float32Array,
  segCount: number,
  type: VerdurePlantType,
  seed: number,
  widthPx: number,
  heightPx: number,
): VerdureBranch[] {
  const branchCount = type === 'thorn' ? 0
    : type === 'spiral' ? 0
    : type === 'leafy' ? (1 + Math.floor(_rng(seed, 20) * 2))
    : (Math.floor(_rng(seed, 21) * 3));

  const branches: VerdureBranch[] = [];

  for (let b = 0; b < branchCount; b++) {
    // Pick a split point along the upper half of the vine
    const splitT  = 0.3 + _rng(seed, 22 + b * 5) * 0.5;
    const splitN  = Math.min(Math.floor(splitT * segCount), segCount - 1);
    const { tx, ty } = _evalTangentAt(ctrlX, ctrlY, segCount, splitT);
    const { x: sx, y: sy } = _evalPathAt(ctrlX, ctrlY, segCount, splitT);

    // Branch deviates ±45° from vine tangent
    const side   = _rng(seed, 23 + b * 5) < 0.5 ? 1 : -1;
    const devAngle = Math.atan2(ty, tx) + side * (0.45 + _rng(seed, 24 + b * 5) * 0.5);

    const bSegCount = 2 + Math.floor(_rng(seed, 25 + b * 5) * 2);
    const bSeed     = seed + b * 7919;
    const { ctrlX: bCtrlX, ctrlY: bCtrlY, fullLength: bLen } =
      _buildMainPath(sx, sy, devAngle, bSegCount, bSeed, widthPx, heightPx);

    branches.push({
      startNode: splitN,
      angle: devAngle,
      ctrlX: bCtrlX,
      ctrlY: bCtrlY,
      segCount: bSegCount,
      length: bLen,
    });
  }

  return branches;
}

/**
 * Build leaf decoration list (for 'leafy', 'flower', and 'fern' types).
 */
function _buildLeaves(
  type: VerdurePlantType,
  _segCount: number,
  seed: number,
): VerdureLeaf[] {
  if (type !== 'leafy' && type !== 'flower' && type !== 'fern') return [];

  const leafCount = type === 'leafy'
    ? 4 + Math.floor(_rng(seed, 30) * 4)
    : type === 'fern'
      ? 6 + Math.floor(_rng(seed, 30) * 5)
      : 2 + Math.floor(_rng(seed, 30) * 2);

  const leaves: VerdureLeaf[] = [];
  for (let i = 0; i < leafCount; i++) {
    // Ferns: leaves are longer and more regularly spaced, alternating sides
    const tParam = type === 'fern'
      ? 0.10 + (i / leafCount) * 0.85
      : 0.15 + _rng(seed, 31 + i * 3) * 0.80;
    const angleDelta = type === 'fern'
      ? (i % 2 === 0 ? 1 : -1) * (0.55 + _rng(seed, 32 + i * 3) * 0.3)
      : (_rng(seed, 32 + i * 3) - 0.5) * Math.PI * 0.6;
    leaves.push({
      tParam,
      angleDelta,
      radiusA: type === 'fern' ? 6 + _rng(seed, 33 + i * 3) * 6 : 4 + _rng(seed, 33 + i * 3) * 5,
      radiusB: type === 'fern' ? 1.2 + _rng(seed, 34 + i * 3) * 1.5 : 1.5 + _rng(seed, 34 + i * 3) * 2,
    });
  }
  return leaves;
}

/**
 * Build flower decoration list (for 'flower', 'spiral', and 'mushroom' types).
 */
function _buildFlowers(
  type: VerdurePlantType,
  seed: number,
): VerdureFlower[] {
  if (type !== 'flower' && type !== 'spiral' && type !== 'mushroom') return [];

  const flowerCount = type === 'flower'
    ? 1 + Math.floor(_rng(seed, 40) * 3)
    : 1;

  const flowers: VerdureFlower[] = [];
  for (let i = 0; i < flowerCount; i++) {
    flowers.push({
      tParam:   type === 'flower'
        ? 0.4 + _rng(seed, 41 + i * 3) * 0.55
        : 1.0,
      // Mushroom cap is larger than normal flowers
      radius:   type === 'mushroom'
        ? 7 + _rng(seed, 42 + i * 3) * 5
        : 2.0 + _rng(seed, 42 + i * 3) * 2.5,
      colorIdx: Math.floor(_rng(seed, 43 + i * 3) * 5),
    });
  }
  return flowers;
}

// ── Spawn helpers ──────────────────────────────────────────────────────────────

/**
 * Pick a random edge anchor point around the arena perimeter.
 * Returns [rootX, rootY, edgeDir] where edgeDir points inward.
 */
function _pickEdgeAnchor(
  widthPx: number,
  heightPx: number,
  rng0: number,
  rng1: number,
): { rootX: number; rootY: number; edgeDir: number } {
  // Choose edge: 0=top, 1=bottom, 2=left, 3=right
  const edge = Math.floor(rng0 * 4);
  const t    = EDGE_MARGIN * 0.5 + rng1 * (
    edge < 2 ? (widthPx - EDGE_MARGIN) : (heightPx - EDGE_MARGIN)
  );
  let rootX = 0, rootY = 0, edgeDir = 0;
  switch (edge) {
    case 0: rootX = t;              rootY = EDGE_MARGIN * 0.5;    edgeDir =  Math.PI * 0.5;       break;
    case 1: rootX = t;              rootY = heightPx - EDGE_MARGIN * 0.5; edgeDir = -Math.PI * 0.5; break;
    case 2: rootX = EDGE_MARGIN * 0.5;    rootY = t;              edgeDir =  0;                   break;
    default: rootX = widthPx - EDGE_MARGIN * 0.5; rootY = t;     edgeDir =  Math.PI;              break;
  }
  // Add slight angular noise so vines don't all point straight inward
  edgeDir += (_rng(rng0 * 1000 + rng1, 0) - 0.5) * 0.6;
  return { rootX, rootY, edgeDir };
}

/** Pick a deterministic plant type weighted by wave number. */
function _pickType(wave: number, seed: number): VerdurePlantType {
  const r = _rng(seed, 50);
  if (wave < 3) {
    // Early waves: vines, ferns, flowers
    if (r < 0.45) return 'vine';
    if (r < 0.65) return 'fern';
    if (r < 0.82) return 'flower';
    if (r < 0.93) return 'leafy';
    return 'mushroom';
  } else if (wave < 8) {
    // Mid waves: all types, spirals and mushrooms join
    if (r < 0.25) return 'vine';
    if (r < 0.42) return 'fern';
    if (r < 0.54) return 'spiral';
    if (r < 0.68) return 'flower';
    if (r < 0.80) return 'leafy';
    if (r < 0.90) return 'mushroom';
    return 'thorn';
  } else {
    // Later waves: thorns more common, full diversity
    if (r < 0.18) return 'vine';
    if (r < 0.32) return 'fern';
    if (r < 0.44) return 'spiral';
    if (r < 0.56) return 'flower';
    if (r < 0.66) return 'leafy';
    if (r < 0.76) return 'mushroom';
    return 'thorn';
  }
}

// ── Public API ─────────────────────────────────────────────────────────────────


/**
 * Pick an edge anchor point using wall state if available.
 * Falls back to the original rectangular-edge approach.
 */
export function pickVerdurePlantAnchor(
  widthPx: number,
  heightPx: number,
  wallState: VerdureCaveWallState | null,
  rng0: number,
  rng1: number,
): { rootX: number; rootY: number; edgeDir: number } {
  if (wallState && wallState.edgePoints.length > 0) {
    const startIdx = Math.floor(rng0 * wallState.edgePoints.length) % wallState.edgePoints.length;
    for (let i = 0; i < wallState.edgePoints.length; i++) {
      const point = wallState.edgePoints[(startIdx + i) % wallState.edgePoints.length];
      if (point.isOccupied) continue;
      point.isOccupied = true;
      return {
        rootX: point.x,
        rootY: point.y,
        edgeDir: Math.atan2(point.ny, point.nx),
      };
    }
  }
  return _pickEdgeAnchor(widthPx, heightPx, rng0, rng1);
}

/**
 * Attempt to spawn one new plant if the spawn timer has elapsed and the cap
 * has not been reached.
 *
 * @param plants    Active plant array to push into.
 * @param deltaMs   Frame elapsed time.
 * @param wave      Current wave number (for scaling density/type).
 * @param widthPx   Arena logical width.
 * @param heightPx  Arena logical height.
 * @param lowGraphics Whether low-graphics mode is active.
 */
export function tickVerdurePlantSpawn(
  plants: VerdurePlant[],
  deltaMs: number,
  wave: number,
  widthPx: number,
  heightPx: number,
  lowGraphics: boolean,
  wallState: VerdureCaveWallState | null = null,
): void {
  _spawnTimerMs -= deltaMs;
  if (_spawnTimerMs > 0) return;

  const maxPlants = lowGraphics ? MAX_PLANTS_LOW : MAX_PLANTS_HIGH;
  // Count living plants
  let aliveCount = 0;
  for (const p of plants) {
    if (!p.isDead || p.fadeAlpha > 0) aliveCount++;
  }
  if (aliveCount >= maxPlants) {
    _spawnTimerMs = 800; // retry shortly
    return;
  }

  // Calculate spawn interval
  const interval = Math.max(
    PLANT_SPAWN_MIN_MS,
    PLANT_SPAWN_BASE_MS - wave * PLANT_SPAWN_WAVE_REDUCTION_MS,
  );
  _spawnTimerMs = interval * (0.7 + Math.random() * 0.6);

  // Generate a unique seed
  const seed = Math.floor(Math.random() * 100000);

  const { rootX, rootY, edgeDir } = pickVerdurePlantAnchor(
    widthPx, heightPx, wallState,
    _rng(seed, 60),
    _rng(seed, 61),
  );

  const type     = _pickType(wave, seed);
  const segCount = SEGS_BY_TYPE[type];
  const { ctrlX, ctrlY, fullLength } = _buildMainPath(
    rootX, rootY, edgeDir, segCount, seed, widthPx, heightPx,
  );
  const branches = _buildBranches(ctrlX, ctrlY, segCount, type, seed, widthPx, heightPx);
  const leaves   = _buildLeaves(type, segCount, seed);
  const flowers  = _buildFlowers(type, seed);

  const growthSpeed = PLANT_GROWTH_BASE + _rng(seed, 70) * PLANT_GROWTH_RANGE;
  const hp = Math.round(PLANT_HP_BASE + wave * PLANT_HP_WAVE_SCALE);

  plants.push({
    id: _nextId++,
    type,
    rootX, rootY, edgeDir,
    ctrlX, ctrlY, segCount,
    fullLength,
    branches,
    leaves,
    flowers,
    growthProgress: 0,
    growthSpeed,
    hp, maxHp: hp,
    isDead: false,
    fadeAlpha: 1.0,
    ageMs: 0,
    seed,
    thornIdx: Math.floor(_rng(seed, 80) * 4),
    isTargetable: false,
    nearestSegDistPx: Infinity,
  });
}

/**
 * Update all active plants: advance growth, check proximity to player,
 * fade out dead plants, update death fragments.
 *
 * @param plants    Active plant array.
 * @param playerX   Player X in logical coordinates.
 * @param playerY   Player Y in logical coordinates.
 * @param deltaMs   Frame elapsed time.
 */
export function updateVerdurePlants(
  plants: VerdurePlant[],
  playerX: number,
  playerY: number,
  deltaMs: number,
): void {
  const dtS = deltaMs / 1000;

  for (let i = plants.length - 1; i >= 0; i--) {
    const p = plants[i];

    // Remove fully faded dead plants
    if (p.isDead && p.fadeAlpha <= 0) {
      plants.splice(i, 1);
      continue;
    }

    p.ageMs += deltaMs;

    if (!p.isDead) {
      // Advance growth
      if (p.growthProgress < 1) {
        p.growthProgress = Math.min(1, p.growthProgress + p.growthSpeed * dtS);
      }

      // Update targetability: closest grown segment distance
      const nearDist = _closestGrownSegDist(p, playerX, playerY);
      p.nearestSegDistPx = nearDist;
      p.isTargetable = nearDist * nearDist <= PLANT_TARGET_RANGE_SQ && p.growthProgress > 0.1;
    } else {
      // Fade out
      p.fadeAlpha = Math.max(0, p.fadeAlpha - PLANT_FADE_SPEED * dtS);
      p.isTargetable = false;
    }
  }

  // Update death fragments
  for (let i = verdureFragments.length - 1; i >= 0; i--) {
    const f = verdureFragments[i];
    f.life -= dtS * 1.8;
    if (f.life <= 0) {
      verdureFragments.splice(i, 1);
      continue;
    }
    f.x    += f.vx * dtS * 60;
    f.y    += f.vy * dtS * 60;
    f.vy   += 0.025;          // gentle gravity
    f.vx   *= 0.97;
    f.angle += f.spin * dtS;
  }
}

/**
 * Apply damage to a plant. Returns actual damage dealt (0 if dead or invalid).
 * Spawns death fragments when the plant is destroyed.
 */
export function damageVerdurePlant(plant: VerdurePlant, rawDamage: number): number {
  if (plant.isDead) return 0;
  const dmg = Math.max(1, Math.round(rawDamage));
  plant.hp = Math.max(0, plant.hp - dmg);
  if (plant.hp <= 0) {
    plant.isDead = true;
    plant.isTargetable = false;
    _spawnDeathFragments(plant);
  }
  return dmg;
}

/**
 * Clear all plants and reset the spawn timer. Call on zone switch / wave reset.
 */
export function clearVerdurePlants(plants: VerdurePlant[]): void {
  plants.length = 0;
  verdureFragments.length = 0;
  _spawnTimerMs = 1500; // short delay before first spawn
}

/**
 * Find the closest targetable plant and return it, or null if none are in range.
 */
export function findClosestVerdurePlant(
  plants: VerdurePlant[],
  _playerX: number,
  _playerY: number,
): VerdurePlant | null {
  let best: VerdurePlant | null = null;
  let bestDist = Infinity;

  for (const p of plants) {
    if (!p.isTargetable) continue;
    const d = p.nearestSegDistPx;
    if (d < bestDist) {
      bestDist = d;
      best = p;
    }
  }
  return best;
}

// ── Private helpers ─────────────────────────────────────────────────────────────

/**
 * Compute approximate distance (px) from the player to the nearest grown
 * segment of the plant.  Samples a set of evenly-spaced points along the
 * grown portion of the path rather than doing exact cubic math.
 */
function _closestGrownSegDist(
  plant: VerdurePlant,
  playerX: number,
  playerY: number,
): number {
  const { ctrlX, ctrlY, segCount, growthProgress } = plant;
  const samples = Math.max(2, Math.floor(growthProgress * segCount * 4));
  let best = Infinity;

  for (let i = 0; i <= samples; i++) {
    const t = (i / samples) * growthProgress;
    const { x, y } = _evalPathAt(ctrlX, ctrlY, segCount, t);
    const dx = x - playerX, dy = y - playerY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < best) best = d;
  }
  return best;
}

/** Spawn leaf/petal death fragments at the plant's tip and mid-body. */
function _spawnDeathFragments(plant: VerdurePlant): void {
  if (verdureFragments.length >= MAX_FRAGMENTS) return;

  const count = 6 + Math.floor(_rng(plant.seed, 90) * 6);
  for (let i = 0; i < count; i++) {
    if (verdureFragments.length >= MAX_FRAGMENTS) break;
    const t   = _rng(plant.seed, 91 + i) * plant.growthProgress;
    const { x, y } = _evalPathAt(plant.ctrlX, plant.ctrlY, plant.segCount, t);
    const speed = 0.4 + _rng(plant.seed, 92 + i) * 0.8;
    const angle = _rng(plant.seed, 93 + i) * Math.PI * 2;
    verdureFragments.push({
      x, y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed - 0.5,
      life: 0.6 + _rng(plant.seed, 94 + i) * 0.5,
      spin: (_rng(plant.seed, 95 + i) - 0.5) * 6,
      angle: _rng(plant.seed, 96 + i) * Math.PI * 2,
      size: 1.5 + _rng(plant.seed, 97 + i) * 2.5,
      colorIdx: Math.floor(_rng(plant.seed, 98 + i) * 4),
    });
  }
}
