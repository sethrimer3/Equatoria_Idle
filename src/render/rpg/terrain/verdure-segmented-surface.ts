/**
 * verdure-segmented-surface.ts — Crisp segmented floor/wall material for non-elite Verdure waves.
 *
 * Used only when waveNumber % 10 !== 0.  Elite waves (multiples of 10) continue
 * to use the existing blocky Voronoi look in verdure-cave-walls.ts.
 *
 * Floor:  fine jittered-grid triangular segments with directional lighting.
 * Walls:  larger Voronoi-cell polygon segments with directional lighting.
 * Tint:   nearby combat objects (enemies, player) tint facing segments.
 *
 * Performance:
 *   - Segment geometry is computed and cached once per (seed, w, h, lowGraphics).
 *   - A static base canvas is baked once for each cache entry.
 *   - Per-frame dynamic tint redraws only influenced segments (no per-frame allocations).
 *
 * Coordinate convention:
 *   All geometry built and baked here operates in **local canvas space**:
 *   x ∈ [0, wState.widthPx], y ∈ [0, wState.heightPx].
 *   The resulting static canvas is drawn at world position (wState.originX, wState.originY)
 *   by the callers in verdure-cave-walls.ts and rpg-render-draw.ts.
 *   Wall tests use `isPointInVerdureWallLocal` (not `isPointInVerdureWall`) to avoid
 *   a double origin subtraction when coordinates are already in local space.
 */

import type { VerdureCaveWallState } from './verdure-cave-walls';
import {
  isPointInVerdureWallLocal,
  sampleVerdureTopDepth,
  sampleVerdureBottomDepth,
  sampleVerdureLeftDepth,
  sampleVerdureRightDepth,
  drawVerdureRimStrips,
} from './verdure-cave-walls';

// ── Public types ───────────────────────────────────────────────────────────────

/** A single combat object that can tint nearby segments. */
export interface VerdureInfluenceObj {
  x: number;
  y: number;
  /** Red channel 0–255. */
  r: number;
  /** Green channel 0–255. */
  g: number;
  /** Blue channel 0–255. */
  b: number;
  /** Maximum influence radius in logical pixels. */
  radiusPx: number;
  /** Overall intensity scalar 0–1. */
  intensity: number;
}

// ── Internal types ─────────────────────────────────────────────────────────────

/** A floor triangle segment. */
interface FloorTri {
  ax: number; ay: number;
  bx: number; by: number;
  cx: number; cy: number;
  centX: number; centY: number;
  /** Facing unit vector. */
  facX: number; facY: number;
  /** Base display colour channels (lighting already baked in). */
  r: number; g: number; b: number;
}

/** A wall Voronoi-cell polygon segment. */
interface WallCell {
  /** Flat coordinate array [x0,y0, x1,y1, …]. */
  pts: Float32Array;
  centX: number; centY: number;
  facX: number; facY: number;
  r: number; g: number; b: number;
}

interface SurfaceGeom {
  seed: number;
  widthPx: number;
  heightPx: number;
  lowGraphics: boolean;
  floorTris: FloorTri[];
  wallCells: WallCell[];
  /** Baked static base canvas (floor + wall, wall already masked). */
  staticCanvas: HTMLCanvasElement | null;
}

// ── Module-level geometry cache ────────────────────────────────────────────────

let _geom: SurfaceGeom | null = null;

// Pre-allocated per-segment tint accumulators — reused every frame, no GC pressure.
// Resized lazily if segment count exceeds initial capacity.
let _tintR = new Float32Array(1600);
let _tintG = new Float32Array(1600);
let _tintB = new Float32Array(1600);
let _tintA = new Float32Array(1600);

function _ensureTintBuffers(capacity: number): void {
  if (_tintR.length >= capacity) return;
  const n = capacity + 256;
  _tintR = new Float32Array(n);
  _tintG = new Float32Array(n);
  _tintB = new Float32Array(n);
  _tintA = new Float32Array(n);
}

// ── Constants ──────────────────────────────────────────────────────────────────

/** Verdure "sun" direction — upper-left (normalised). */
const _LIGHT_X =  0.4472;  // cos(≈63°) — from (1, −2) normalised
const _LIGHT_Y = -0.8944;

/** Grid step for floor triangulation (logical px). */
const _FLOOR_STEP = 18;
/** Jitter amplitude for grid vertices (logical px). */
const _FLOOR_JITTER = 3.5;

/** Max influence radius (px) for dynamic tint falloff. */
const _MAX_INF_RADIUS_SQ = 110 * 110;

/** Minimum tint alpha below which a segment is not redrawn. */
const _TINT_THRESHOLD = 0.025;

/** Maximum cumulative tint alpha applied to any single segment. */
const _MAX_TINT_ALPHA = 0.32;

/** Minimum dot product (facing · directionToObject) required for influence. */
const _DOT_THRESHOLD = 0.05;

// ── Colour palettes ────────────────────────────────────────────────────────────

// Floor: dark brown-green tones (fine triangles)
const _FLOOR_RGB: readonly [number, number, number][] = [
  [26, 18,  8],   // '#1a1208'
  [31, 26,  8],   // '#1f1a08'
  [18, 24, 10],   // '#12180a'
  [22, 27,  9],   // '#16'b09'
  [34, 18,  8],   // '#221208'
];

// Wall: dark rock with slight Verdure tint
const _WALL_RGB: readonly [number, number, number][] = [
  [37, 32, 20],   // '#252014'
  [30, 26, 18],   // '#1e1a12'
  [42, 34, 22],   // '#2a2216'
  [24, 28, 16],   // '#181c10'
  [32, 30, 20],   // '#201e14'
];

// ── RNG ────────────────────────────────────────────────────────────────────────

function _rng(seed: number, i: number): number {
  const n = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

// ── Sutherland-Hodgman half-plane clipping ────────────────────────────────────

type Pt2 = [number, number];
type Poly2 = Pt2[];

/**
 * Clip `poly` against the half-plane where `dot(v − (px,py), (nx,ny)) ≥ 0`.
 * Returns the clipped polygon (possibly empty).
 */
function _clipHalfPlane(poly: Poly2, px: number, py: number, nx: number, ny: number): Poly2 {
  const out: Poly2 = [];
  const len = poly.length;
  if (len === 0) return out;
  for (let i = 0; i < len; i++) {
    const a = poly[i];
    const b = poly[(i + 1) % len];
    const da = (a[0] - px) * nx + (a[1] - py) * ny;
    const db = (b[0] - px) * nx + (b[1] - py) * ny;
    const aIn = da >= 0;
    const bIn = db >= 0;
    if (aIn) out.push(a);
    if (aIn !== bIn) {
      const t = da / (da - db);
      out.push([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])]);
    }
  }
  return out;
}

/**
 * Compute the Voronoi cell polygon for `seeds[seedIdx]` by Sutherland-Hodgman
 * clipping of the initial bounding polygon against each perpendicular bisector.
 */
function _voronoiCell(seedIdx: number, seeds: Pt2[], initPoly: Poly2): Poly2 {
  let poly: Poly2 = initPoly.slice();
  const s = seeds[seedIdx];
  for (let j = 0; j < seeds.length; j++) {
    if (j === seedIdx || poly.length === 0) continue;
    const n = seeds[j];
    const mx = (s[0] + n[0]) * 0.5;
    const my = (s[1] + n[1]) * 0.5;
    // Normal toward s (un-normalised — sign is what matters)
    const nrx = s[0] - n[0];
    const nry = s[1] - n[1];
    poly = _clipHalfPlane(poly, mx, my, nrx, nry);
  }
  return poly;
}

// ── Lighting helper ────────────────────────────────────────────────────────────

/** Apply facing-direction lighting to a base RGB colour, return new channel values. */
function _light(facing_x: number, facing_y: number, r0: number, g0: number, b0: number): [number, number, number] {
  const dot = facing_x * _LIGHT_X + facing_y * _LIGHT_Y;
  const br = 0.55 + 0.42 * dot;   // range ≈ [0.13, 0.97]
  return [
    Math.max(0, Math.min(255, Math.round(r0 * br))),
    Math.max(0, Math.min(255, Math.round(g0 * br))),
    Math.max(0, Math.min(255, Math.round(b0 * br))),
  ];
}

// ── Floor triangulation ────────────────────────────────────────────────────────

function _buildFloorTris(wState: VerdureCaveWallState, seed: number): FloorTri[] {
  const W = wState.widthPx;
  const H = wState.heightPx;
  const cols = Math.ceil(W / _FLOOR_STEP) + 1;
  const rows = Math.ceil(H / _FLOOR_STEP) + 1;
  const stride = cols + 1;
  const gseed = seed + 100;

  // Build jittered grid
  const gx = new Float32Array(stride * (rows + 1));
  const gy = new Float32Array(stride * (rows + 1));
  for (let r = 0; r <= rows; r++) {
    for (let c = 0; c <= cols; c++) {
      const idx = r * stride + c;
      const jx = (_rng(gseed, idx * 2)     - 0.5) * 2 * _FLOOR_JITTER;
      const jy = (_rng(gseed, idx * 2 + 1) - 0.5) * 2 * _FLOOR_JITTER;
      gx[idx] = Math.max(-_FLOOR_JITTER, Math.min(W + _FLOOR_JITTER, c * _FLOOR_STEP + jx));
      gy[idx] = Math.max(-_FLOOR_JITTER, Math.min(H + _FLOOR_JITTER, r * _FLOOR_STEP + jy));
    }
  }

  const tris: FloorTri[] = [];
  let triIdx = 0;
  const colPal = _FLOOR_RGB.length;

  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const i00 = r * stride + c;
      const i10 = r * stride + c + 1;
      const i01 = (r + 1) * stride + c;
      const i11 = (r + 1) * stride + c + 1;

      // Upper triangle: (00, 10, 01)
      const ax1 = gx[i00], ay1 = gy[i00];
      const bx1 = gx[i10], by1 = gy[i10];
      const cx1 = gx[i01], cy1 = gy[i01];
      const centX1 = (ax1 + bx1 + cx1) / 3;
      const centY1 = (ay1 + by1 + cy1) / 3;
      if (
        centX1 >= 0 && centX1 <= W && centY1 >= 0 && centY1 <= H &&
        // centX1/centY1 are local coords (0..W, 0..H) — use local variant to avoid double origin subtraction
        !isPointInVerdureWallLocal(wState, centX1, centY1)
      ) {
        const angle1 = _rng(seed + 300, triIdx) * Math.PI * 2;
        const facX1 = Math.cos(angle1), facY1 = Math.sin(angle1);
        const [r1, g1, b1] = _light(facX1, facY1, ..._FLOOR_RGB[Math.floor(_rng(seed + 400, triIdx) * colPal)]);
        tris.push({ ax: ax1, ay: ay1, bx: bx1, by: by1, cx: cx1, cy: cy1, centX: centX1, centY: centY1, facX: facX1, facY: facY1, r: r1, g: g1, b: b1 });
      }
      triIdx++;

      // Lower triangle: (10, 11, 01)
      const ax2 = gx[i10], ay2 = gy[i10];
      const bx2 = gx[i11], by2 = gy[i11];
      const cx2 = gx[i01], cy2 = gy[i01];
      const centX2 = (ax2 + bx2 + cx2) / 3;
      const centY2 = (ay2 + by2 + cy2) / 3;
      if (
        centX2 >= 0 && centX2 <= W && centY2 >= 0 && centY2 <= H &&
        // centX2/centY2 are local coords (0..W, 0..H) — use local variant to avoid double origin subtraction
        !isPointInVerdureWallLocal(wState, centX2, centY2)
      ) {
        const angle2 = _rng(seed + 300, triIdx) * Math.PI * 2;
        const facX2 = Math.cos(angle2), facY2 = Math.sin(angle2);
        const [r2, g2, b2] = _light(facX2, facY2, ..._FLOOR_RGB[Math.floor(_rng(seed + 400, triIdx) * colPal)]);
        tris.push({ ax: ax2, ay: ay2, bx: bx2, by: by2, cx: cx2, cy: cy2, centX: centX2, centY: centY2, facX: facX2, facY: facY2, r: r2, g: g2, b: b2 });
      }
      triIdx++;
    }
  }

  return tris;
}

// ── Wall Voronoi cells ─────────────────────────────────────────────────────────

function _buildWallCells(wState: VerdureCaveWallState, seed: number): WallCell[] {
  const W = wState.widthPx;
  const H = wState.heightPx;
  const wseed = seed + 600;

  // Distribute seed points within the four wall regions
  const rawSeeds: Pt2[] = [];

  const pushWallSeed = (count: number, rSeed: number, pick: (r0: number, r1: number) => Pt2): void => {
    for (let i = 0; i < count; i++) {
      rawSeeds.push(pick(_rng(rSeed, i * 3), _rng(rSeed, i * 3 + 1)));
    }
  };

  // Top wall
  pushWallSeed(16, wseed + 10, (r0, r1) => {
    const x = r0 * W;
    const depth = sampleVerdureTopDepth(wState, x);
    return [x, r1 * depth];
  });
  // Bottom wall
  pushWallSeed(16, wseed + 20, (r0, r1) => {
    const x = r0 * W;
    const depth = sampleVerdureBottomDepth(wState, x);
    return [x, H - r1 * depth];
  });
  // Left wall
  pushWallSeed(10, wseed + 30, (r0, r1) => {
    const y = r0 * H;
    const depth = sampleVerdureLeftDepth(wState, y);
    return [r1 * depth, y];
  });
  // Right wall
  pushWallSeed(10, wseed + 40, (r0, r1) => {
    const y = r0 * H;
    const depth = sampleVerdureRightDepth(wState, y);
    return [W - r1 * depth, y];
  });

  // Bounding polygon for Voronoi (padded beyond canvas)
  const pad = 30;
  const initPoly: Poly2 = [[-pad, -pad], [W + pad, -pad], [W + pad, H + pad], [-pad, H + pad]];

  const cells: WallCell[] = [];
  let cellIdx = 0;
  const colPal = _WALL_RGB.length;

  for (let si = 0; si < rawSeeds.length; si++) {
    const poly = _voronoiCell(si, rawSeeds, initPoly);
    if (poly.length < 3) continue;

    // Centroid
    let cx = 0, cy = 0;
    for (const [px, py] of poly) { cx += px; cy += py; }
    cx /= poly.length;
    cy /= poly.length;

    // Only render cells whose centre is in a wall region.
    // cx/cy are local coords (0..W, 0..H) — use local variant to avoid double origin subtraction.
    if (!isPointInVerdureWallLocal(wState, cx, cy)) continue;

    // Facing: inward from wall toward arena centre, with slight RNG jitter
    const fxBase = (W * 0.5 - cx);
    const fyBase = (H * 0.5 - cy);
    const fLen = Math.sqrt(fxBase * fxBase + fyBase * fyBase) || 1;
    const jAngle = (_rng(wseed + 500, cellIdx) - 0.5) * 0.9;  // ±0.45 rad
    const cosJ = Math.cos(jAngle), sinJ = Math.sin(jAngle);
    const facX = (fxBase / fLen) * cosJ - (fyBase / fLen) * sinJ;
    const facY = (fxBase / fLen) * sinJ + (fyBase / fLen) * cosJ;

    const [r, g, b] = _light(facX, facY, ..._WALL_RGB[Math.floor(_rng(wseed + 600, cellIdx) * colPal)]);

    const pts = new Float32Array(poly.length * 2);
    for (let pi = 0; pi < poly.length; pi++) {
      pts[pi * 2] = poly[pi][0];
      pts[pi * 2 + 1] = poly[pi][1];
    }

    cells.push({ pts, centX: cx, centY: cy, facX, facY, r, g, b });
    cellIdx++;
  }

  return cells;
}

// ── Canvas helpers ─────────────────────────────────────────────────────────────

function _makeCanvas(w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return c;
}

/** Trace the playable-area interior boundary as a canvas path (for evenodd clipping). */
function _tracePlayableAreaPath(ctx: CanvasRenderingContext2D, wState: VerdureCaveWallState): void {
  const W = wState.widthPx;
  const H = wState.heightPx;
  const hS = wState.hStep;
  const vS = wState.vStep;

  // Start at approximate top-left interior corner
  ctx.moveTo(sampleVerdureLeftDepth(wState, 0), sampleVerdureTopDepth(wState, 0));

  // Top inner edge: left → right
  for (let x = hS; x < W; x += hS) {
    ctx.lineTo(x, sampleVerdureTopDepth(wState, x));
  }
  ctx.lineTo(W, sampleVerdureTopDepth(wState, W));

  // Right inner edge: top → bottom
  for (let y = vS; y < H; y += vS) {
    ctx.lineTo(W - sampleVerdureRightDepth(wState, y), y);
  }
  ctx.lineTo(W - sampleVerdureRightDepth(wState, H), H);

  // Bottom inner edge: right → left
  for (let x = W - hS; x > 0; x -= hS) {
    ctx.lineTo(x, H - sampleVerdureBottomDepth(wState, x));
  }
  ctx.lineTo(0, H - sampleVerdureBottomDepth(wState, 0));

  // Left inner edge: bottom → top
  for (let y = H - vS; y > 0; y -= vS) {
    ctx.lineTo(sampleVerdureLeftDepth(wState, y), y);
  }
  ctx.closePath();
}

// ── Static canvas baking ───────────────────────────────────────────────────────

function _bakeStaticCanvas(
  wState: VerdureCaveWallState,
  floorTris: FloorTri[],
  wallCells: WallCell[],
  lowGraphics: boolean,
): HTMLCanvasElement {
  const W = wState.widthPx;
  const H = wState.heightPx;

  // ── Draw floor triangles ─────────────────────────────────────────────────
  const floorCanvas = _makeCanvas(W, H);
  const floorCtx = floorCanvas.getContext('2d')!;
  const strokeAlpha = lowGraphics ? 0 : 0.22;
  for (const tri of floorTris) {
    floorCtx.beginPath();
    floorCtx.moveTo(tri.ax, tri.ay);
    floorCtx.lineTo(tri.bx, tri.by);
    floorCtx.lineTo(tri.cx, tri.cy);
    floorCtx.closePath();
    floorCtx.fillStyle = `rgb(${tri.r},${tri.g},${tri.b})`;
    floorCtx.fill();
    if (!lowGraphics) {
      floorCtx.globalAlpha = strokeAlpha;
      floorCtx.strokeStyle = '#0a0a04';
      floorCtx.lineWidth = 0.5;
      floorCtx.stroke();
      floorCtx.globalAlpha = 1;
    }
  }

  // ── Draw wall Voronoi cells (then mask to wall region) ───────────────────
  const wallCanvas = _makeCanvas(W, H);
  const wallCtx = wallCanvas.getContext('2d')!;
  const wallStrokeAlpha = lowGraphics ? 0 : 0.35;
  for (const cell of wallCells) {
    const pts = cell.pts;
    const n = pts.length / 2;
    wallCtx.beginPath();
    wallCtx.moveTo(pts[0], pts[1]);
    for (let i = 1; i < n; i++) wallCtx.lineTo(pts[i * 2], pts[i * 2 + 1]);
    wallCtx.closePath();
    wallCtx.fillStyle = `rgb(${cell.r},${cell.g},${cell.b})`;
    wallCtx.fill();
    if (!lowGraphics) {
      wallCtx.globalAlpha = wallStrokeAlpha;
      wallCtx.strokeStyle = '#050605';
      wallCtx.lineWidth = 0.8;
      wallCtx.stroke();
      wallCtx.globalAlpha = 1;
    }
  }

  // Build wall-region mask (pixel-level; runs once).
  // px/py are local pixel coords (0..W, 0..H) — use local variant to avoid double origin subtraction.
  const maskCanvas = _makeCanvas(W, H);
  const maskCtx = maskCanvas.getContext('2d')!;
  const maskImg = maskCtx.createImageData(W, H);
  for (let py = 0; py < H; py++) {
    for (let px = 0; px < W; px++) {
      if (isPointInVerdureWallLocal(wState, px, py)) {
        const idx = (py * W + px) * 4;
        maskImg.data[idx] = maskImg.data[idx + 1] = maskImg.data[idx + 2] = maskImg.data[idx + 3] = 255;
      }
    }
  }
  maskCtx.putImageData(maskImg, 0, 0);

  // Apply mask: keep wall canvas pixels only where wall region
  wallCtx.globalCompositeOperation = 'destination-in';
  wallCtx.drawImage(maskCanvas, 0, 0);
  wallCtx.globalCompositeOperation = 'source-over';

  // ── Composite onto final static canvas ───────────────────────────────────
  const staticCanvas = _makeCanvas(W, H);
  const staticCtx = staticCanvas.getContext('2d')!;
  staticCtx.drawImage(floorCanvas, 0, 0);
  staticCtx.drawImage(wallCanvas, 0, 0);

  // Rim strips
  staticCtx.save();
  drawVerdureRimStrips(staticCtx, wState);
  staticCtx.restore();

  // Slight moss tint over floor on high graphics
  if (!lowGraphics) {
    staticCtx.fillStyle = 'rgba(8, 18, 4, 0.14)';
    staticCtx.fillRect(0, 0, W, H);
  }

  return staticCanvas;
}

// ── Geometry cache management ──────────────────────────────────────────────────

function _getOrBuildGeom(wState: VerdureCaveWallState, lowGraphics: boolean): SurfaceGeom {
  if (
    _geom !== null &&
    _geom.seed === wState.seed &&
    _geom.widthPx === wState.widthPx &&
    _geom.heightPx === wState.heightPx &&
    _geom.lowGraphics === lowGraphics
  ) {
    return _geom;
  }

  const seed = wState.seed;
  const floorTris = _buildFloorTris(wState, seed);
  const wallCells = _buildWallCells(wState, seed);
  const staticCanvas = typeof document !== 'undefined'
    ? _bakeStaticCanvas(wState, floorTris, wallCells, lowGraphics)
    : null;

  _geom = { seed, widthPx: wState.widthPx, heightPx: wState.heightPx, lowGraphics, floorTris, wallCells, staticCanvas };
  return _geom;
}

// ── Dynamic tint path helpers ──────────────────────────────────────────────────

/** Compute per-segment tint accumulators from a list of influence objects. */
function _computeTints(
  tris: FloorTri[],
  cells: WallCell[],
  influences: VerdureInfluenceObj[],
): void {
  const total = tris.length + cells.length;
  _ensureTintBuffers(total);
  _tintR.fill(0, 0, total);
  _tintG.fill(0, 0, total);
  _tintB.fill(0, 0, total);
  _tintA.fill(0, 0, total);

  if (influences.length === 0) return;

  // Floor triangles
  for (let i = 0; i < tris.length; i++) {
    const tri = tris[i];
    for (const obj of influences) {
      const dx = obj.x - tri.centX;
      const dy = obj.y - tri.centY;
      const distSq = dx * dx + dy * dy;
      const radSq = obj.radiusPx * obj.radiusPx;
      if (distSq > radSq) continue;
      const invDist = 1 / (Math.sqrt(distSq) || 1);
      const dot = tri.facX * dx * invDist + tri.facY * dy * invDist;
      if (dot < _DOT_THRESHOLD) continue;
      const falloff = 1 - distSq / radSq;
      const contrib = dot * falloff * obj.intensity;
      _tintR[i] += obj.r * contrib;
      _tintG[i] += obj.g * contrib;
      _tintB[i] += obj.b * contrib;
      _tintA[i] = Math.min(_MAX_TINT_ALPHA, _tintA[i] + contrib * 0.5);
    }
  }

  // Wall cells
  const offset = tris.length;
  for (let i = 0; i < cells.length; i++) {
    const cell = cells[i];
    for (const obj of influences) {
      const dx = obj.x - cell.centX;
      const dy = obj.y - cell.centY;
      const distSq = dx * dx + dy * dy;
      const radSq = Math.min(obj.radiusPx * obj.radiusPx, _MAX_INF_RADIUS_SQ);
      if (distSq > radSq) continue;
      const invDist = 1 / (Math.sqrt(distSq) || 1);
      const dot = cell.facX * dx * invDist + cell.facY * dy * invDist;
      if (dot < _DOT_THRESHOLD) continue;
      const falloff = 1 - distSq / radSq;
      const contrib = dot * falloff * obj.intensity;
      _tintR[offset + i] += obj.r * contrib;
      _tintG[offset + i] += obj.g * contrib;
      _tintB[offset + i] += obj.b * contrib;
      _tintA[offset + i] = Math.min(_MAX_TINT_ALPHA, _tintA[offset + i] + contrib * 0.5);
    }
  }
}

/** Draw path for a floor triangle. */
function _pathTri(ctx: CanvasRenderingContext2D, tri: FloorTri): void {
  ctx.moveTo(tri.ax, tri.ay);
  ctx.lineTo(tri.bx, tri.by);
  ctx.lineTo(tri.cx, tri.cy);
  ctx.closePath();
}

/** Draw path for a wall cell polygon. */
function _pathCell(ctx: CanvasRenderingContext2D, cell: WallCell): void {
  const pts = cell.pts;
  const n = pts.length / 2;
  ctx.moveTo(pts[0], pts[1]);
  for (let i = 1; i < n; i++) ctx.lineTo(pts[i * 2], pts[i * 2 + 1]);
  ctx.closePath();
}

// ── Public draw functions ──────────────────────────────────────────────────────

/**
 * Draw the segmented floor/wall base (fine triangular floor + Voronoi wall pieces)
 * for non-elite Verdure waves.
 *
 * This draws the static baked base canvas which contains both floor and wall geometry.
 * Call this once, then follow with `drawVerdureWallsSegmented` to apply dynamic tint.
 */
export function drawVerdureFloorSegmented(
  canvas2d: CanvasRenderingContext2D,
  wState: VerdureCaveWallState,
  lowGraphics: boolean,
): void {
  if (typeof document === 'undefined') return;

  const geom = _getOrBuildGeom(wState, lowGraphics);

  // Static base — contains both floor triangles and wall cells
  if (geom.staticCanvas) {
    canvas2d.save();
    canvas2d.globalAlpha = 1;
    canvas2d.drawImage(geom.staticCanvas, wState.originX, wState.originY);
    canvas2d.restore();
  }
}

/**
 * Draw the segmented walls (Voronoi-cell pieces) for non-elite Verdure waves.
 *
 * Call immediately after `drawVerdureFloorSegmented`.
 *
 * @param influences  Combat objects that tint facing segments dynamically.
 */
export function drawVerdureWallsSegmented(
  canvas2d: CanvasRenderingContext2D,
  wState: VerdureCaveWallState,
  lowGraphics: boolean,
  influences: VerdureInfluenceObj[],
): void {
  if (typeof document === 'undefined') return;

  const geom = _getOrBuildGeom(wState, lowGraphics);

  // Dynamic tint — skip on low graphics or when no influences
  if (!lowGraphics && influences.length > 0) {
    const tris = geom.floorTris;
    const cells = geom.wallCells;

    // Influences arrive in world coordinates; tris/cells use local (0..W/H) coords.
    // Convert influences to local space before computing tints.
    const ox = wState.originX;
    const oy = wState.originY;
    const localInfluences: VerdureInfluenceObj[] = influences.map(inf => ({
      ...inf,
      x: inf.x - ox,
      y: inf.y - oy,
    }));
    _computeTints(tris, cells, localInfluences);

    const offset = tris.length;

    // All tris/cells are in local space — translate to world origin before drawing.
    canvas2d.save();
    canvas2d.translate(wState.originX, wState.originY);

    // Draw tinted floor triangles
    for (let i = 0; i < tris.length; i++) {
      const a = _tintA[i];
      if (a < _TINT_THRESHOLD) continue;
      const tri = tris[i];
      // Blend: lerp from base toward tint colour
      const invA = 1 - a;
      const tr = Math.min(255, Math.round(tri.r * invA + _tintR[i] * a));
      const tg = Math.min(255, Math.round(tri.g * invA + _tintG[i] * a));
      const tb = Math.min(255, Math.round(tri.b * invA + _tintB[i] * a));
      canvas2d.beginPath();
      _pathTri(canvas2d, tri);
      canvas2d.fillStyle = `rgb(${tr},${tg},${tb})`;
      canvas2d.fill();
    }

    // Draw tinted wall cells (clipped to wall region using evenodd rule)
    let hasWallTint = false;
    for (let i = 0; i < cells.length; i++) {
      if (_tintA[offset + i] >= _TINT_THRESHOLD) { hasWallTint = true; break; }
    }
    if (hasWallTint) {
      canvas2d.save();
      canvas2d.beginPath();
      canvas2d.rect(0, 0, wState.widthPx, wState.heightPx);
      _tracePlayableAreaPath(canvas2d, wState);
      canvas2d.clip('evenodd');

      for (let i = 0; i < cells.length; i++) {
        const a = _tintA[offset + i];
        if (a < _TINT_THRESHOLD) continue;
        const cell = cells[i];
        const invA = 1 - a;
        const tr = Math.min(255, Math.round(cell.r * invA + _tintR[offset + i] * a));
        const tg = Math.min(255, Math.round(cell.g * invA + _tintG[offset + i] * a));
        const tb = Math.min(255, Math.round(cell.b * invA + _tintB[offset + i] * a));
        canvas2d.beginPath();
        _pathCell(canvas2d, cell);
        canvas2d.fillStyle = `rgb(${tr},${tg},${tb})`;
        canvas2d.fill();
      }
      canvas2d.restore();
    }

    canvas2d.restore();
  }
}
