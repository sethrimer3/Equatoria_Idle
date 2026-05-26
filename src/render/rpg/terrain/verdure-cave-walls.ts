/**
 * verdure-cave-walls.ts — Organic cave-wall generation, rendering, and collision
 * for the Verdure RPG zone.
 *
 * The wall model is deterministic per seed. Inner-boundary depths are sampled at
 * fixed steps and reused for collision, plant anchoring, debug drawing, and the
 * cached Voronoi-style rock texture.
 */

const H_STEP = 8;
const V_STEP = 8;
const EDGE_POINT_STEP = 24;
const INFLUENCE_DEPTH_PX = 12;
const TEXTURE_SCALE = 4;
const ROCK_HEX_COLORS = ['#2c2417', '#1e1a10', '#31280e', '#1a2210', '#252015'] as const;
const RIM_WIDTH_PX = 4;

// ── Floor Voronoi constants ────────────────────────────────────────────────────
/** Darker brown tones for the arena floor — visually distinct from the lighter walls. */
const FLOOR_HEX_COLORS = ['#18100a', '#110c06', '#1b1309', '#0e1008', '#141108'] as const;
/** Lower-resolution scale for floor texture — larger Voronoi cells for a coarser rock look. */
const FLOOR_TEXTURE_SCALE = 7;

const TOP_EDGE = 0 as const;
const BOTTOM_EDGE = 1 as const;
const LEFT_EDGE = 2 as const;
const RIGHT_EDGE = 3 as const;

type VerdureWallEdgeId = typeof TOP_EDGE | typeof BOTTOM_EDGE | typeof LEFT_EDGE | typeof RIGHT_EDGE;

interface VoronoiSeedPoint {
  x: number;
  y: number;
  colorIdx: number;
}

export interface VerdureWallEdgePoint {
  x: number;
  y: number;
  nx: number;
  ny: number;
  edge: 0 | 1 | 2 | 3;
  isOccupied: boolean;
}

export interface VerdureCaveWallState {
  seed: number;
  widthPx: number;
  heightPx: number;
  topDepths: Float32Array;
  bottomDepths: Float32Array;
  leftDepths: Float32Array;
  rightDepths: Float32Array;
  hStep: number;
  vStep: number;
  edgePoints: VerdureWallEdgePoint[];
  textureCanvas: HTMLCanvasElement | null;
  textureSeed: number;
  textureW: number;
  textureH: number;
  /** Cached Voronoi floor texture (playable interior area). */
  floorTextureCanvas: HTMLCanvasElement | null;
  floorTextureSeed: number;
  floorTextureW: number;
  floorTextureH: number;
}

function _rng(seed: number, i: number): number {
  const n = Math.sin(seed * 127.1 + i * 311.7) * 43758.5453;
  return n - Math.floor(n);
}

function _sampleDepth(depths: Float32Array, step: number, pos: number): number {
  const maxIndex = depths.length - 1;
  if (maxIndex <= 0) return depths[0] ?? 0;
  const clamped = Math.max(0, Math.min(maxIndex * step, pos));
  const fi = clamped / step;
  const i0 = Math.floor(fi);
  const i1 = Math.min(maxIndex, i0 + 1);
  const t = fi - i0;
  return depths[i0] * (1 - t) + depths[i1] * t;
}

function _smoothDepths(depths: Float32Array, passes: number): void {
  const temp = new Float32Array(depths.length);
  for (let pass = 0; pass < passes; pass++) {
    for (let i = 0; i < depths.length; i++) {
      const prev = depths[Math.max(0, i - 1)];
      const curr = depths[i];
      const next = depths[Math.min(depths.length - 1, i + 1)];
      temp[i] = (prev + curr * 2 + next) * 0.25;
    }
    depths.set(temp);
  }
}

function _normalize(x: number, y: number): { x: number; y: number } {
  const len = Math.sqrt(x * x + y * y) || 1;
  return { x: x / len, y: y / len };
}

function _sampleTopDepth(state: VerdureCaveWallState, x: number): number {
  return _sampleDepth(state.topDepths, state.hStep, x);
}

function _sampleBottomDepth(state: VerdureCaveWallState, x: number): number {
  return _sampleDepth(state.bottomDepths, state.hStep, x);
}

function _sampleLeftDepth(state: VerdureCaveWallState, y: number): number {
  return _sampleDepth(state.leftDepths, state.vStep, y);
}

function _sampleRightDepth(state: VerdureCaveWallState, y: number): number {
  return _sampleDepth(state.rightDepths, state.vStep, y);
}

function _sampleDepthSlope(
  depths: Float32Array,
  step: number,
  pos: number,
): number {
  const d0 = _sampleDepth(depths, step, pos - step);
  const d1 = _sampleDepth(depths, step, pos + step);
  return (d1 - d0) / (step * 2);
}

function _getBoundaryNormal(
  state: VerdureCaveWallState,
  edge: VerdureWallEdgeId,
  pos: number,
): { x: number; y: number } {
  switch (edge) {
    case TOP_EDGE: {
      const ddx = _sampleDepthSlope(state.topDepths, state.hStep, pos);
      return _normalize(-ddx, 1);
    }
    case BOTTOM_EDGE: {
      const ddx = _sampleDepthSlope(state.bottomDepths, state.hStep, pos);
      return _normalize(-ddx, -1);
    }
    case LEFT_EDGE: {
      const ddy = _sampleDepthSlope(state.leftDepths, state.vStep, pos);
      return _normalize(1, -ddy);
    }
    default: {
      const ddy = _sampleDepthSlope(state.rightDepths, state.vStep, pos);
      return _normalize(-1, -ddy);
    }
  }
}

function _createCanvas(widthPx: number, heightPx: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = widthPx;
  canvas.height = heightPx;
  return canvas;
}

function _isPointInVerdureWallWithMargin(
  state: VerdureCaveWallState,
  px: number,
  py: number,
  margin: number,
): boolean {
  return py < _sampleTopDepth(state, px) + margin
    || py > state.heightPx - _sampleBottomDepth(state, px) - margin
    || px < _sampleLeftDepth(state, py) + margin
    || px > state.widthPx - _sampleRightDepth(state, py) - margin;
}

function _appendBoundaryPath(
  canvas2d: CanvasRenderingContext2D,
  state: VerdureCaveWallState,
  edge: VerdureWallEdgeId,
): void {
  if (edge === TOP_EDGE) {
    canvas2d.moveTo(0, _sampleTopDepth(state, 0));
    for (let x = state.hStep; x <= state.widthPx; x += state.hStep) {
      canvas2d.lineTo(x, _sampleTopDepth(state, x));
    }
    if (state.widthPx % state.hStep !== 0) {
      canvas2d.lineTo(state.widthPx, _sampleTopDepth(state, state.widthPx));
    }
    return;
  }
  if (edge === BOTTOM_EDGE) {
    canvas2d.moveTo(0, state.heightPx - _sampleBottomDepth(state, 0));
    for (let x = state.hStep; x <= state.widthPx; x += state.hStep) {
      canvas2d.lineTo(x, state.heightPx - _sampleBottomDepth(state, x));
    }
    if (state.widthPx % state.hStep !== 0) {
      canvas2d.lineTo(state.widthPx, state.heightPx - _sampleBottomDepth(state, state.widthPx));
    }
    return;
  }
  if (edge === LEFT_EDGE) {
    canvas2d.moveTo(_sampleLeftDepth(state, 0), 0);
    for (let y = state.vStep; y <= state.heightPx; y += state.vStep) {
      canvas2d.lineTo(_sampleLeftDepth(state, y), y);
    }
    if (state.heightPx % state.vStep !== 0) {
      canvas2d.lineTo(_sampleLeftDepth(state, state.heightPx), state.heightPx);
    }
    return;
  }
  canvas2d.moveTo(state.widthPx - _sampleRightDepth(state, 0), 0);
  for (let y = state.vStep; y <= state.heightPx; y += state.vStep) {
    canvas2d.lineTo(state.widthPx - _sampleRightDepth(state, y), y);
  }
  if (state.heightPx % state.vStep !== 0) {
    canvas2d.lineTo(state.widthPx - _sampleRightDepth(state, state.heightPx), state.heightPx);
  }
}

function _drawRimStrip(
  canvas2d: CanvasRenderingContext2D,
  state: VerdureCaveWallState,
  edge: VerdureWallEdgeId,
): void {
  canvas2d.beginPath();
  if (edge === TOP_EDGE) {
    canvas2d.moveTo(0, _sampleTopDepth(state, 0));
    for (let x = state.hStep; x <= state.widthPx; x += state.hStep) {
      canvas2d.lineTo(x, _sampleTopDepth(state, x));
    }
    if (state.widthPx % state.hStep !== 0) {
      canvas2d.lineTo(state.widthPx, _sampleTopDepth(state, state.widthPx));
    }
    for (let x = state.widthPx; x >= 0; x -= state.hStep) {
      canvas2d.lineTo(x, _sampleTopDepth(state, x) + RIM_WIDTH_PX);
    }
    canvas2d.closePath();
    const grad = canvas2d.createLinearGradient(0, 0, 0, RIM_WIDTH_PX + 6);
    grad.addColorStop(0, 'rgba(10, 8, 6, 0.58)');
    grad.addColorStop(1, 'rgba(10, 8, 6, 0)');
    canvas2d.fillStyle = grad;
    canvas2d.fill();
    return;
  }
  if (edge === BOTTOM_EDGE) {
    const baseY = state.heightPx - _sampleBottomDepth(state, 0);
    canvas2d.moveTo(0, baseY);
    for (let x = state.hStep; x <= state.widthPx; x += state.hStep) {
      canvas2d.lineTo(x, state.heightPx - _sampleBottomDepth(state, x));
    }
    if (state.widthPx % state.hStep !== 0) {
      canvas2d.lineTo(state.widthPx, state.heightPx - _sampleBottomDepth(state, state.widthPx));
    }
    for (let x = state.widthPx; x >= 0; x -= state.hStep) {
      canvas2d.lineTo(x, state.heightPx - _sampleBottomDepth(state, x) - RIM_WIDTH_PX);
    }
    canvas2d.closePath();
    const grad = canvas2d.createLinearGradient(0, state.heightPx, 0, state.heightPx - (RIM_WIDTH_PX + 6));
    grad.addColorStop(0, 'rgba(10, 8, 6, 0.58)');
    grad.addColorStop(1, 'rgba(10, 8, 6, 0)');
    canvas2d.fillStyle = grad;
    canvas2d.fill();
    return;
  }
  if (edge === LEFT_EDGE) {
    canvas2d.moveTo(_sampleLeftDepth(state, 0), 0);
    for (let y = state.vStep; y <= state.heightPx; y += state.vStep) {
      canvas2d.lineTo(_sampleLeftDepth(state, y), y);
    }
    if (state.heightPx % state.vStep !== 0) {
      canvas2d.lineTo(_sampleLeftDepth(state, state.heightPx), state.heightPx);
    }
    for (let y = state.heightPx; y >= 0; y -= state.vStep) {
      canvas2d.lineTo(_sampleLeftDepth(state, y) + RIM_WIDTH_PX, y);
    }
    canvas2d.closePath();
    const grad = canvas2d.createLinearGradient(0, 0, RIM_WIDTH_PX + 6, 0);
    grad.addColorStop(0, 'rgba(10, 8, 6, 0.52)');
    grad.addColorStop(1, 'rgba(10, 8, 6, 0)');
    canvas2d.fillStyle = grad;
    canvas2d.fill();
    return;
  }
  canvas2d.moveTo(state.widthPx - _sampleRightDepth(state, 0), 0);
  for (let y = state.vStep; y <= state.heightPx; y += state.vStep) {
    canvas2d.lineTo(state.widthPx - _sampleRightDepth(state, y), y);
  }
  if (state.heightPx % state.vStep !== 0) {
    canvas2d.lineTo(state.widthPx - _sampleRightDepth(state, state.heightPx), state.heightPx);
  }
  for (let y = state.heightPx; y >= 0; y -= state.vStep) {
    canvas2d.lineTo(state.widthPx - _sampleRightDepth(state, y) - RIM_WIDTH_PX, y);
  }
  canvas2d.closePath();
  const grad = canvas2d.createLinearGradient(state.widthPx, 0, state.widthPx - (RIM_WIDTH_PX + 6), 0);
  grad.addColorStop(0, 'rgba(10, 8, 6, 0.52)');
  grad.addColorStop(1, 'rgba(10, 8, 6, 0)');
  canvas2d.fillStyle = grad;
  canvas2d.fill();
}

function _buildVoronoiTexture(
  state: VerdureCaveWallState,
  lowGraphics: boolean,
): HTMLCanvasElement {
  const textureCanvas = _createCanvas(state.widthPx, state.heightPx);
  const texture2d = textureCanvas.getContext('2d');
  if (!texture2d) return textureCanvas;

  const lowW = Math.max(1, Math.ceil(state.widthPx / TEXTURE_SCALE));
  const lowH = Math.max(1, Math.ceil(state.heightPx / TEXTURE_SCALE));
  const tempCanvas = _createCanvas(lowW, lowH);
  const temp2d = tempCanvas.getContext('2d');
  if (!temp2d) return textureCanvas;

  const seeds: VoronoiSeedPoint[] = [];
  const pushSeed = (x: number, y: number, idx: number): void => {
    seeds.push({ x, y, colorIdx: idx % ROCK_HEX_COLORS.length });
  };

  const distributeSeeds = (
    count: number,
    regionSeed: number,
    pick: (r0: number, r1: number, r2: number) => { x: number; y: number },
  ): void => {
    for (let i = 0; i < count; i++) {
      const pos = pick(_rng(regionSeed, i * 3), _rng(regionSeed + 17, i * 3 + 1), _rng(regionSeed + 29, i * 3 + 2));
      pushSeed(pos.x, pos.y, Math.floor(_rng(regionSeed + 43, i + 1) * ROCK_HEX_COLORS.length));
    }
  };

  distributeSeeds(15, state.seed + 101, (r0, r1) => {
    const x = r0 * state.widthPx;
    return { x, y: r1 * (_sampleTopDepth(state, x) + 8) };
  });
  distributeSeeds(15, state.seed + 211, (r0, r1) => {
    const x = r0 * state.widthPx;
    const depth = _sampleBottomDepth(state, x);
    return { x, y: state.heightPx - r1 * (depth + 8) };
  });
  distributeSeeds(10, state.seed + 307, (r0, r1) => {
    const y = r1 * state.heightPx;
    return { x: r0 * (_sampleLeftDepth(state, y) + 8), y };
  });
  distributeSeeds(10, state.seed + 401, (r0, r1) => {
    const y = r1 * state.heightPx;
    const depth = _sampleRightDepth(state, y);
    return { x: state.widthPx - r0 * (depth + 8), y };
  });

  const image = temp2d.createImageData(lowW, lowH);
  const owner = new Int16Array(lowW * lowH);
  owner.fill(-1);
  const colorRgb = ROCK_HEX_COLORS.map((hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }));

  for (let iy = 0; iy < lowH; iy++) {
    for (let ix = 0; ix < lowW; ix++) {
      const worldX = Math.min(state.widthPx - 1, ix * TEXTURE_SCALE + TEXTURE_SCALE * 0.5);
      const worldY = Math.min(state.heightPx - 1, iy * TEXTURE_SCALE + TEXTURE_SCALE * 0.5);
      if (!isPointInVerdureWall(state, worldX, worldY)) continue;
      let bestIdx = 0;
      let bestDistSq = Infinity;
      for (let s = 0; s < seeds.length; s++) {
        const dx = worldX - seeds[s].x;
        const dy = worldY - seeds[s].y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) {
          bestDistSq = distSq;
          bestIdx = s;
        }
      }
      owner[iy * lowW + ix] = bestIdx;
    }
  }

  for (let iy = 0; iy < lowH; iy++) {
    for (let ix = 0; ix < lowW; ix++) {
      const ownerIdx = owner[iy * lowW + ix];
      if (ownerIdx < 0) continue;
      const dataIdx = (iy * lowW + ix) * 4;
      const rgb = colorRgb[seeds[ownerIdx].colorIdx];
      let r = rgb.r;
      let g = rgb.g;
      let b = rgb.b;
      const left = ix > 0 ? owner[iy * lowW + ix - 1] : ownerIdx;
      const right = ix + 1 < lowW ? owner[iy * lowW + ix + 1] : ownerIdx;
      const up = iy > 0 ? owner[(iy - 1) * lowW + ix] : ownerIdx;
      const down = iy + 1 < lowH ? owner[(iy + 1) * lowW + ix] : ownerIdx;
      if (left !== ownerIdx || right !== ownerIdx || up !== ownerIdx || down !== ownerIdx) {
        r = Math.max(0, r - 38);
        g = Math.max(0, g - 38);
        b = Math.max(0, b - 38);
      }
      image.data[dataIdx] = r;
      image.data[dataIdx + 1] = g;
      image.data[dataIdx + 2] = b;
      image.data[dataIdx + 3] = 255;
    }
  }

  temp2d.putImageData(image, 0, 0);
  texture2d.save();
  texture2d.clearRect(0, 0, state.widthPx, state.heightPx);
  texture2d.imageSmoothingEnabled = false;
  texture2d.drawImage(tempCanvas, 0, 0, lowW, lowH, 0, 0, state.widthPx, state.heightPx);

  texture2d.globalCompositeOperation = 'source-atop';
  _drawRimStrip(texture2d, state, TOP_EDGE);
  _drawRimStrip(texture2d, state, BOTTOM_EDGE);
  _drawRimStrip(texture2d, state, LEFT_EDGE);
  _drawRimStrip(texture2d, state, RIGHT_EDGE);

  const vignette = texture2d.createRadialGradient(
    state.widthPx * 0.5,
    state.heightPx * 0.5,
    Math.min(state.widthPx, state.heightPx) * 0.18,
    state.widthPx * 0.5,
    state.heightPx * 0.5,
    Math.max(state.widthPx, state.heightPx) * 0.7,
  );
  vignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
  vignette.addColorStop(1, 'rgba(0, 0, 0, 0.16)');
  texture2d.fillStyle = vignette;
  texture2d.fillRect(0, 0, state.widthPx, state.heightPx);

  if (!lowGraphics) {
    texture2d.fillStyle = 'rgba(20,60,10,0.15)';
    texture2d.fillRect(0, 0, state.widthPx, state.heightPx);
  }
  texture2d.restore();
  return textureCanvas;
}

function _buildEdgePoints(state: VerdureCaveWallState): VerdureWallEdgePoint[] {
  const edgePoints: VerdureWallEdgePoint[] = [];
  for (let x = 0; x <= state.widthPx; x += EDGE_POINT_STEP) {
    const xn = Math.min(state.widthPx, x);
    const topNormal = _getBoundaryNormal(state, TOP_EDGE, xn);
    edgePoints.push({
      x: xn,
      y: _sampleTopDepth(state, xn),
      nx: topNormal.x,
      ny: topNormal.y,
      edge: TOP_EDGE,
      isOccupied: false,
    });
    const bottomNormal = _getBoundaryNormal(state, BOTTOM_EDGE, xn);
    edgePoints.push({
      x: xn,
      y: state.heightPx - _sampleBottomDepth(state, xn),
      nx: bottomNormal.x,
      ny: bottomNormal.y,
      edge: BOTTOM_EDGE,
      isOccupied: false,
    });
  }
  for (let y = 0; y <= state.heightPx; y += EDGE_POINT_STEP) {
    const yn = Math.min(state.heightPx, y);
    const leftNormal = _getBoundaryNormal(state, LEFT_EDGE, yn);
    edgePoints.push({
      x: _sampleLeftDepth(state, yn),
      y: yn,
      nx: leftNormal.x,
      ny: leftNormal.y,
      edge: LEFT_EDGE,
      isOccupied: false,
    });
    const rightNormal = _getBoundaryNormal(state, RIGHT_EDGE, yn);
    edgePoints.push({
      x: state.widthPx - _sampleRightDepth(state, yn),
      y: yn,
      nx: rightNormal.x,
      ny: rightNormal.y,
      edge: RIGHT_EDGE,
      isOccupied: false,
    });
  }
  return edgePoints;
}

export function generateVerdureCaveWalls(seed: number, widthPx: number, heightPx: number): VerdureCaveWallState {
  const topCount = Math.floor(widthPx / H_STEP) + 1;
  const sideCount = Math.floor(heightPx / V_STEP) + 1;
  const topDepths = new Float32Array(topCount);
  const bottomDepths = new Float32Array(topCount);
  const leftDepths = new Float32Array(sideCount);
  const rightDepths = new Float32Array(sideCount);

  for (let i = 0; i < topCount; i++) {
    topDepths[i] = 28 + _rng(seed, i * 3) * 20;
    bottomDepths[i] = 28 + _rng(seed + 1, i * 3 + 1) * 20;
  }
  for (let i = 0; i < sideCount; i++) {
    leftDepths[i] = 24 + _rng(seed + 2, i * 3 + 2) * 16;
    rightDepths[i] = 24 + _rng(seed + 3, i * 3 + 3) * 16;
  }

  _smoothDepths(topDepths, 2);
  _smoothDepths(bottomDepths, 2);
  _smoothDepths(leftDepths, 2);
  _smoothDepths(rightDepths, 2);

  const state: VerdureCaveWallState = {
    seed,
    widthPx,
    heightPx,
    topDepths,
    bottomDepths,
    leftDepths,
    rightDepths,
    hStep: H_STEP,
    vStep: V_STEP,
    edgePoints: [],
    textureCanvas: null,
    textureSeed: Number.NaN,
    textureW: widthPx,
    textureH: heightPx,
    floorTextureCanvas: null,
    floorTextureSeed: Number.NaN,
    floorTextureW: widthPx,
    floorTextureH: heightPx,
  };
  state.edgePoints = _buildEdgePoints(state);
  return state;
}

export function isPointInVerdureWall(state: VerdureCaveWallState, px: number, py: number): boolean {
  return _isPointInVerdureWallWithMargin(state, px, py, 0);
}

export function pushPointOutsideVerdureWall(
  state: VerdureCaveWallState,
  px: number,
  py: number,
  out: { x: number; y: number },
  margin: number,
): boolean {
  let x = px;
  let y = py;
  let pushed = false;

  for (let iter = 0; iter < 4; iter++) {
    const candidates: Array<{ x: number; y: number; distSq: number }> = [];
    const topLimit = _sampleTopDepth(state, x) + margin;
    if (y < topLimit) {
      const dy = topLimit - y;
      candidates.push({ x, y: topLimit, distSq: dy * dy });
    }
    const bottomLimit = state.heightPx - _sampleBottomDepth(state, x) - margin;
    if (y > bottomLimit) {
      const dy = y - bottomLimit;
      candidates.push({ x, y: bottomLimit, distSq: dy * dy });
    }
    const leftLimit = _sampleLeftDepth(state, y) + margin;
    if (x < leftLimit) {
      const dx = leftLimit - x;
      candidates.push({ x: leftLimit, y, distSq: dx * dx });
    }
    const rightLimit = state.widthPx - _sampleRightDepth(state, y) - margin;
    if (x > rightLimit) {
      const dx = x - rightLimit;
      candidates.push({ x: rightLimit, y, distSq: dx * dx });
    }
    if (candidates.length === 0) break;
    let best = candidates[0];
    for (let i = 1; i < candidates.length; i++) {
      if (candidates[i].distSq < best.distSq) best = candidates[i];
    }
    x = best.x;
    y = best.y;
    pushed = true;
  }

  out.x = x;
  out.y = y;
  return pushed;
}

export function computeVerdureWallRepulsion(
  state: VerdureCaveWallState,
  px: number,
  py: number,
  strength: number,
  out: { x: number; y: number },
): number {
  out.x = 0;
  out.y = 0;
  let maxInfluence = 0;

  const apply = (dist: number, nx: number, ny: number): void => {
    if (dist >= INFLUENCE_DEPTH_PX) return;
    const influence = INFLUENCE_DEPTH_PX - dist;
    const force = strength * (1 - dist / INFLUENCE_DEPTH_PX);
    out.x += nx * force;
    out.y += ny * force;
    if (influence > maxInfluence) maxInfluence = influence;
  };

  const topNormal = _getBoundaryNormal(state, TOP_EDGE, px);
  apply(py - _sampleTopDepth(state, px), topNormal.x, topNormal.y);

  const bottomNormal = _getBoundaryNormal(state, BOTTOM_EDGE, px);
  apply((state.heightPx - _sampleBottomDepth(state, px)) - py, bottomNormal.x, bottomNormal.y);

  const leftNormal = _getBoundaryNormal(state, LEFT_EDGE, py);
  apply(px - _sampleLeftDepth(state, py), leftNormal.x, leftNormal.y);

  const rightNormal = _getBoundaryNormal(state, RIGHT_EDGE, py);
  apply((state.widthPx - _sampleRightDepth(state, py)) - px, rightNormal.x, rightNormal.y);

  return maxInfluence;
}

// ── Floor Voronoi texture ─────────────────────────────────────────────────────

/**
 * Build a Voronoi-coloured floor texture covering the entire arena.
 * Seeds are distributed in a grid with jitter over the playable interior.
 * Colors are dark brown (darker than the wall palette).
 * The walls are drawn on top of this, so wall-region floor pixels are
 * automatically concealed.
 */
function _buildFloorVoronoiTexture(
  state: VerdureCaveWallState,
  lowGraphics: boolean,
): HTMLCanvasElement {
  const textureCanvas = _createCanvas(state.widthPx, state.heightPx);
  const texture2d = textureCanvas.getContext('2d');
  if (!texture2d) return textureCanvas;

  const lowW = Math.max(1, Math.ceil(state.widthPx / FLOOR_TEXTURE_SCALE));
  const lowH = Math.max(1, Math.ceil(state.heightPx / FLOOR_TEXTURE_SCALE));
  const tempCanvas = _createCanvas(lowW, lowH);
  const temp2d = tempCanvas.getContext('2d');
  if (!temp2d) return textureCanvas;

  const floorSeed = state.seed + 700;

  // Distribute seeds in a loose grid across the whole arena with per-cell jitter
  const cellCols = Math.max(3, Math.ceil(state.widthPx / 48));
  const cellRows = Math.max(3, Math.ceil(state.heightPx / 48));
  const cellW = state.widthPx / cellCols;
  const cellH = state.heightPx / cellRows;

  const floorSeeds: { x: number; y: number; colorIdx: number }[] = [];
  for (let row = 0; row < cellRows; row++) {
    for (let col = 0; col < cellCols; col++) {
      const jx = _rng(floorSeed, row * 100 + col * 3)     * cellW * 0.7;
      const jy = _rng(floorSeed, row * 100 + col * 3 + 1) * cellH * 0.7;
      floorSeeds.push({
        x: (col + 0.15) * cellW + jx,
        y: (row + 0.15) * cellH + jy,
        colorIdx: Math.floor(_rng(floorSeed, row * 100 + col * 3 + 2) * FLOOR_HEX_COLORS.length),
      });
    }
  }

  const image = temp2d.createImageData(lowW, lowH);
  const owner = new Int16Array(lowW * lowH);

  const colorRgb = FLOOR_HEX_COLORS.map((hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  }));

  for (let iy = 0; iy < lowH; iy++) {
    for (let ix = 0; ix < lowW; ix++) {
      const worldX = Math.min(state.widthPx - 1, ix * FLOOR_TEXTURE_SCALE + FLOOR_TEXTURE_SCALE * 0.5);
      const worldY = Math.min(state.heightPx - 1, iy * FLOOR_TEXTURE_SCALE + FLOOR_TEXTURE_SCALE * 0.5);
      let bestIdx = 0;
      let bestDistSq = Infinity;
      for (let s = 0; s < floorSeeds.length; s++) {
        const dx = worldX - floorSeeds[s].x;
        const dy = worldY - floorSeeds[s].y;
        const distSq = dx * dx + dy * dy;
        if (distSq < bestDistSq) { bestDistSq = distSq; bestIdx = s; }
      }
      owner[iy * lowW + ix] = bestIdx;
    }
  }

  for (let iy = 0; iy < lowH; iy++) {
    for (let ix = 0; ix < lowW; ix++) {
      const ownerIdx = owner[iy * lowW + ix];
      const dataIdx = (iy * lowW + ix) * 4;
      const rgb = colorRgb[floorSeeds[ownerIdx].colorIdx];
      let r = rgb.r, g = rgb.g, b = rgb.b;
      // Edge darkening — darker crevice lines between cells
      const left  = ix > 0       ? owner[iy * lowW + ix - 1]       : ownerIdx;
      const right  = ix + 1 < lowW ? owner[iy * lowW + ix + 1]       : ownerIdx;
      const up    = iy > 0       ? owner[(iy - 1) * lowW + ix]       : ownerIdx;
      const down  = iy + 1 < lowH ? owner[(iy + 1) * lowW + ix]       : ownerIdx;
      if (left !== ownerIdx || right !== ownerIdx || up !== ownerIdx || down !== ownerIdx) {
        r = Math.max(0, r - 28);
        g = Math.max(0, g - 28);
        b = Math.max(0, b - 28);
      }
      image.data[dataIdx]     = r;
      image.data[dataIdx + 1] = g;
      image.data[dataIdx + 2] = b;
      image.data[dataIdx + 3] = 255;
    }
  }

  temp2d.putImageData(image, 0, 0);
  texture2d.save();
  texture2d.clearRect(0, 0, state.widthPx, state.heightPx);
  texture2d.imageSmoothingEnabled = false;
  texture2d.drawImage(tempCanvas, 0, 0, lowW, lowH, 0, 0, state.widthPx, state.heightPx);

  // Slight moss/damp tint over the floor (high-graphics only)
  if (!lowGraphics) {
    texture2d.fillStyle = 'rgba(12, 22, 8, 0.22)';
    texture2d.fillRect(0, 0, state.widthPx, state.heightPx);
  }

  texture2d.restore();
  return textureCanvas;
}

/**
 * Draw the Voronoi brown rock floor texture underneath the arena before walls.
 * Lazily builds and caches the texture; invalidates when seed or canvas size changes.
 *
 * Call BEFORE drawVerdureCaveWalls so the walls paint over the floor edges.
 */
export function drawVerdureFloor(
  canvas2d: CanvasRenderingContext2D,
  state: VerdureCaveWallState,
  lowGraphics: boolean,
): void {
  if (typeof document === 'undefined') return;
  const desiredSeed = state.seed + (lowGraphics ? 500 : 501);
  if (
    state.floorTextureCanvas === null
    || state.floorTextureW !== state.widthPx
    || state.floorTextureH !== state.heightPx
    || state.floorTextureSeed !== desiredSeed
  ) {
    state.floorTextureCanvas = _buildFloorVoronoiTexture(state, lowGraphics);
    state.floorTextureSeed = desiredSeed;
    state.floorTextureW = state.widthPx;
    state.floorTextureH = state.heightPx;
  }
  if (!state.floorTextureCanvas) return;

  canvas2d.save();
  canvas2d.globalAlpha = 1;
  canvas2d.drawImage(state.floorTextureCanvas, 0, 0);
  canvas2d.restore();
}

export function drawVerdureCaveWalls(
  canvas2d: CanvasRenderingContext2D,
  state: VerdureCaveWallState,
  lowGraphics: boolean,
): void {
  if (typeof document === 'undefined') return;
  const desiredTextureSeed = state.seed + (lowGraphics ? 0 : 0.5);
  if (
    state.textureCanvas === null
    || state.textureW !== state.widthPx
    || state.textureH !== state.heightPx
    || state.textureSeed !== desiredTextureSeed
  ) {
    state.textureCanvas = _buildVoronoiTexture(state, lowGraphics);
    state.textureSeed = desiredTextureSeed;
    state.textureW = state.widthPx;
    state.textureH = state.heightPx;
  }
  if (!state.textureCanvas) return;

  canvas2d.save();
  canvas2d.globalAlpha = 1;
  canvas2d.drawImage(state.textureCanvas, 0, 0);
  _drawRimStrip(canvas2d, state, TOP_EDGE);
  _drawRimStrip(canvas2d, state, BOTTOM_EDGE);
  _drawRimStrip(canvas2d, state, LEFT_EDGE);
  _drawRimStrip(canvas2d, state, RIGHT_EDGE);
  canvas2d.restore();
}

export function drawVerdureWallDebug(
  canvas2d: CanvasRenderingContext2D,
  state: VerdureCaveWallState,
): void {
  canvas2d.save();
  canvas2d.lineWidth = 1;
  canvas2d.setLineDash([4, 3]);
  canvas2d.strokeStyle = 'rgba(120, 255, 160, 0.85)';
  canvas2d.beginPath();
  _appendBoundaryPath(canvas2d, state, TOP_EDGE);
  canvas2d.stroke();
  canvas2d.beginPath();
  _appendBoundaryPath(canvas2d, state, BOTTOM_EDGE);
  canvas2d.stroke();
  canvas2d.beginPath();
  _appendBoundaryPath(canvas2d, state, LEFT_EDGE);
  canvas2d.stroke();
  canvas2d.beginPath();
  _appendBoundaryPath(canvas2d, state, RIGHT_EDGE);
  canvas2d.stroke();
  canvas2d.setLineDash([]);

  for (const point of state.edgePoints) {
    canvas2d.fillStyle = point.isOccupied ? 'rgba(255, 120, 120, 0.95)' : 'rgba(255, 240, 120, 0.95)';
    canvas2d.beginPath();
    canvas2d.arc(point.x, point.y, 1.6, 0, Math.PI * 2);
    canvas2d.fill();
    canvas2d.strokeStyle = 'rgba(180,255,180,0.65)';
    canvas2d.beginPath();
    canvas2d.moveTo(point.x, point.y);
    canvas2d.lineTo(point.x + point.nx * 8, point.y + point.ny * 8);
    canvas2d.stroke();
  }

  canvas2d.restore();
}

// ── Depth-sampling exports (for verdure-segmented-surface.ts) ────────────────

/** Sample the top-wall depth at canvas X coordinate `x`. */
export function sampleVerdureTopDepth(state: VerdureCaveWallState, x: number): number {
  return _sampleTopDepth(state, x);
}

/** Sample the bottom-wall depth (from canvas bottom) at canvas X coordinate `x`. */
export function sampleVerdureBottomDepth(state: VerdureCaveWallState, x: number): number {
  return _sampleBottomDepth(state, x);
}

/** Sample the left-wall depth at canvas Y coordinate `y`. */
export function sampleVerdureLeftDepth(state: VerdureCaveWallState, y: number): number {
  return _sampleLeftDepth(state, y);
}

/** Sample the right-wall depth (from canvas right) at canvas Y coordinate `y`. */
export function sampleVerdureRightDepth(state: VerdureCaveWallState, y: number): number {
  return _sampleRightDepth(state, y);
}

/**
 * Draw the four inner-edge rim-strip gradients on top of a Verdure wall surface.
 * Used by both the legacy blocky system and the new segmented system.
 */
export function drawVerdureRimStrips(
  canvas2d: CanvasRenderingContext2D,
  state: VerdureCaveWallState,
): void {
  _drawRimStrip(canvas2d, state, TOP_EDGE);
  _drawRimStrip(canvas2d, state, BOTTOM_EDGE);
  _drawRimStrip(canvas2d, state, LEFT_EDGE);
  _drawRimStrip(canvas2d, state, RIGHT_EDGE);
}
