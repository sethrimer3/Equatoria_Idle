import {
  computeShapeMultiplier,
  type TopographicTerrainPaletteId,
  type TopographicTerrainState,
} from './topographic-terrain';
import type {
  TopographyLightConfig,
  TopographyLightCache,
  TopographyLightSamplingData,
} from './topographic-lighting-types';

// Re-export public types so callers can import them from this module
// without knowing about the types-only file.
export type { TopographyLightConfig, TopographyLightCache, TopographyLightSamplingData };

interface LightingRgb {
  r: number;
  g: number;
  b: number;
}

interface LightingPalette {
  highlight: LightingRgb;
  shadow: LightingRgb;
  beam: LightingRgb;
}

/**
 * Internal extension of the public cache interface with the full baked data
 * needed for rendering and dev overlays.  Stored on `state.lightCache` and
 * cast to this type within this module.
 */
interface BakedTopographyLightCache extends TopographyLightCache {
  cellSizePx: number;
  gridW: number;
  gridH: number;
  heightGrid: Float32Array;
  shadowGrid: Float32Array;
  lightGrid: Float32Array;
  centroidX: number;
  centroidY: number;
}

const LIGHT_GRID_CELL_SIZE_PX = 8;
const CONTOUR_LEVEL_COUNT = 9;
const INNER_RING_SCALE = 0.28;
const LIGHT_DIRECTION_Z = 0.92;
const NORMAL_Z = 1.18;
const MAX_PER_ISLAND_FIELD_CONTRIBUTION = 8.0;
const LIGHTING_PALETTES: Record<TopographicTerrainPaletteId, LightingPalette> = {
  mono: {
    highlight: { r: 248, g: 242, b: 228 },
    shadow: { r: 44, g: 58, b: 88 },
    beam: { r: 225, g: 235, b: 255 },
  },
  copper: {
    highlight: { r: 255, g: 219, b: 166 },
    shadow: { r: 60, g: 34, b: 30 },
    beam: { r: 255, g: 214, b: 150 },
  },
  cyanTactical: {
    highlight: { r: 182, g: 246, b: 255 },
    shadow: { r: 16, g: 32, b: 52 },
    beam: { r: 148, g: 232, b: 255 },
  },
};
const CONTOUR_THRESHOLDS: number[] = (() => {
  const thresholds: number[] = [];
  for (let i = 0; i < CONTOUR_LEVEL_COUNT; i++) {
    const scale = 1.0 - (1.0 - INNER_RING_SCALE) * i / (CONTOUR_LEVEL_COUNT - 1);
    thresholds.push(1.0 / scale);
  }
  return thresholds;
})();

export const DEFAULT_TOPOGRAPHY_LIGHT_CONFIG: TopographyLightConfig = {
  lightAngle: Math.PI * 1.1,
  lightIntensity: 0.85,
  ambientFloor: 0.25,
  shadowLengthMult: 2.5,
  shadowSoftness: 0.6,
  heightPerLayer: 18,
  terrainOpacity: 0.82,
  slopeSmoothing: 0.7,
  beamStrength: 0.25,
};

let activeLightConfig: TopographyLightConfig = { ...DEFAULT_TOPOGRAPHY_LIGHT_CONFIG };
let lightingDevMode = false;

export function setTopographyLightConfig(partial: Partial<TopographyLightConfig>): TopographyLightConfig {
  activeLightConfig = { ...activeLightConfig, ...partial };
  return { ...activeLightConfig };
}

export function setTopographyLightingDevMode(enabled: boolean): void {
  lightingDevMode = enabled;
}

/**
 * Returns read-only sampling data from the given terrain state's lighting
 * cache.  Intended for future entity-shadow code.
 *
 * Returns `null` when the cache has not been built yet for this state
 * (i.e. the terrain has not been rendered at least once).
 */
export function getActiveTopographyLightSamplingData(
  state: TopographicTerrainState,
): TopographyLightSamplingData | null {
  const cache = state.lightCache as BakedTopographyLightCache | null;
  if (!cache) return null;
  return {
    lightAngle: cache.config.lightAngle,
    heightGrid: cache.heightGrid,
    shadowGrid: cache.shadowGrid,
    lightGrid: cache.lightGrid,
    cellSizePx: cache.cellSizePx,
    gridW: cache.gridW,
    gridH: cache.gridH,
  };
}

export function buildTopographyLightCache(
  state: TopographicTerrainState,
  config: TopographyLightConfig,
  canvasW: number,
  canvasH: number,
): TopographyLightCache {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(canvasW));
  canvas.height = Math.max(1, Math.floor(canvasH));
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Failed to create topography lighting canvas context.');
  }

  const gridW = Math.ceil(canvas.width / LIGHT_GRID_CELL_SIZE_PX) + 2;
  const gridH = Math.ceil(canvas.height / LIGHT_GRID_CELL_SIZE_PX) + 2;
  const heightGrid = new Float32Array(gridW * gridH);

  for (let iy = 0; iy < gridH; iy++) {
    const wy = iy * LIGHT_GRID_CELL_SIZE_PX;
    const row = iy * gridW;
    for (let ix = 0; ix < gridW; ix++) {
      const wx = ix * LIGHT_GRID_CELL_SIZE_PX;
      heightGrid[row + ix] = mapFieldValueToHeight(computeScalarFieldValue(state, wx, wy));
    }
  }

  const towardLightX = Math.cos(config.lightAngle);
  const towardLightY = Math.sin(config.lightAngle);
  const shadowGrid = buildShadowGrid(heightGrid, gridW, gridH, towardLightX, towardLightY, config);
  const smoothedHeightGrid = blurScalarGridGaussian(heightGrid, gridW, gridH, 1);
  const lightGrid = buildLightGrid(smoothedHeightGrid, shadowGrid, gridW, gridH, towardLightX, towardLightY, config);

  const image = ctx.createImageData(canvas.width, canvas.height);
  const pixels = image.data;
  const palette = LIGHTING_PALETTES[state.paletteId];

  for (let py = 0; py < canvas.height; py++) {
    const gy = py / LIGHT_GRID_CELL_SIZE_PX;
    for (let px = 0; px < canvas.width; px++) {
      const gx = px / LIGHT_GRID_CELL_SIZE_PX;
      const h = sampleGridBilinear(smoothedHeightGrid, gridW, gridH, gx, gy);
      if (h <= 0.025) continue;

      const height01 = clamp01(h / CONTOUR_LEVEL_COUNT);
      const presence = smoothstep(0.02, 0.55, h);
      const lightAmount = sampleGridBilinear(lightGrid, gridW, gridH, gx, gy);
      const shadowAmount = sampleGridBilinear(shadowGrid, gridW, gridH, gx, gy);
      const terrace = 1 - Math.abs((((h % 1) + 1) % 1) * 2 - 1);
      const bias = (lightAmount - 0.54) * (0.95 + height01 * 0.55) - shadowAmount * (0.34 + height01 * 0.16);
      const idx = (py * canvas.width + px) * 4;

      if (bias >= 0) {
        const alpha = clamp01(config.terrainOpacity * presence * (bias * 0.95 + terrace * 0.06 * (1 - shadowAmount)));
        if (alpha <= 0.01) continue;
        pixels[idx] = palette.highlight.r;
        pixels[idx + 1] = palette.highlight.g;
        pixels[idx + 2] = palette.highlight.b;
        pixels[idx + 3] = Math.round(alpha * 255);
      } else {
        const alpha = clamp01(config.terrainOpacity * presence * ((-bias) * 1.08 + shadowAmount * 0.18 + height01 * 0.05));
        if (alpha <= 0.01) continue;
        pixels[idx] = palette.shadow.r;
        pixels[idx + 1] = palette.shadow.g;
        pixels[idx + 2] = palette.shadow.b;
        pixels[idx + 3] = Math.round(alpha * 255);
      }
    }
  }

  ctx.putImageData(image, 0, 0);
  if (config.beamStrength > 0.001) {
    drawLightBeams(ctx, heightGrid, gridW, gridH, LIGHT_GRID_CELL_SIZE_PX, towardLightX, towardLightY, palette, config, state.seed);
  }

  const { x: centroidX, y: centroidY } = getTerrainCentroid(state);
  const bakedCache: BakedTopographyLightCache = {
    canvas,
    width: canvas.width,
    height: canvas.height,
    config: { ...config },
    terrainSeed: state.seed,
    terrainWaveNumber: state.waveNumber,
    paletteId: state.paletteId,
    cellSizePx: LIGHT_GRID_CELL_SIZE_PX,
    gridW,
    gridH,
    heightGrid,
    shadowGrid,
    lightGrid,
    centroidX,
    centroidY,
  };
  return bakedCache;
}

export function renderTopographyLighting(
  ctx: CanvasRenderingContext2D,
  state: TopographicTerrainState,
  canvasW: number,
  canvasH: number,
): void {
  if (state.phase === 'hidden' || state.growth01 <= 0) return;

  const cache = ensureTopographyLightCache(state, canvasW, canvasH);
  if (!cache) return;

  const { x: centroidX, y: centroidY } = getTerrainCentroid(state);

  ctx.save();
  try {
    ctx.globalCompositeOperation = 'source-over';
    ctx.imageSmoothingEnabled = true;
    if (state.growth01 !== 1) {
      ctx.translate(centroidX, centroidY);
      ctx.scale(state.growth01, state.growth01);
      ctx.translate(-centroidX, -centroidY);
    }
    ctx.drawImage(cache.canvas, 0, 0, cache.width, cache.height);
  } finally {
    ctx.restore();
  }

  if (lightingDevMode) {
    drawLightingDevOverlay(ctx, cache);
  }
}

/**
 * Ensures `state.lightCache` is valid for the current canvas size and active
 * light config, rebuilding it when any input changes.
 *
 * Invalidation triggers:
 * - canvas width or height changed
 * - active light config changed (any field)
 * - palette changed (defensive; palette is normally fixed per wave)
 *
 * Wave/seed/island-geometry changes are handled naturally because a new wave
 * creates a fresh TopographicTerrainState with `lightCache: null`.
 */
function ensureTopographyLightCache(
  state: TopographicTerrainState,
  canvasW: number,
  canvasH: number,
): BakedTopographyLightCache | null {
  const targetWidth = Math.max(1, Math.floor(canvasW));
  const targetHeight = Math.max(1, Math.floor(canvasH));
  const existing = state.lightCache as BakedTopographyLightCache | null;
  if (
    existing === null
    || existing.width !== targetWidth
    || existing.height !== targetHeight
    || existing.paletteId !== state.paletteId
    || !configsMatch(existing.config, activeLightConfig)
  ) {
    const built = buildTopographyLightCache(
      state, activeLightConfig, targetWidth, targetHeight,
    ) as BakedTopographyLightCache;
    state.lightCache = built;
    return built;
  }
  return existing;
}

function configsMatch(a: TopographyLightConfig, b: TopographyLightConfig): boolean {
  return a.lightAngle === b.lightAngle
    && a.lightIntensity === b.lightIntensity
    && a.ambientFloor === b.ambientFloor
    && a.shadowLengthMult === b.shadowLengthMult
    && a.shadowSoftness === b.shadowSoftness
    && a.heightPerLayer === b.heightPerLayer
    && a.terrainOpacity === b.terrainOpacity
    && a.slopeSmoothing === b.slopeSmoothing
    && a.beamStrength === b.beamStrength;
}

function computeScalarFieldValue(state: TopographicTerrainState, wx: number, wy: number): number {
  let total = 0;
  for (const island of state.islands) {
    const dx = wx - island.centerX;
    const dy = wy - island.centerY;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const theta = Math.atan2(dy, dx);
    const effectiveRadius = island.outerRadius * computeShapeMultiplier(island.profile, theta);
    const minDist = effectiveRadius * 0.05;
    const ratio = effectiveRadius / Math.max(dist, minDist);
    total += Math.min(ratio * ratio, MAX_PER_ISLAND_FIELD_CONTRIBUTION);
  }
  return total;
}

function mapFieldValueToHeight(fieldValue: number): number {
  if (fieldValue <= CONTOUR_THRESHOLDS[0]) return 0;
  for (let i = 0; i < CONTOUR_THRESHOLDS.length - 1; i++) {
    const low = CONTOUR_THRESHOLDS[i];
    const high = CONTOUR_THRESHOLDS[i + 1];
    if (fieldValue < high) {
      const t = (fieldValue - low) / Math.max(1e-6, high - low);
      return i + 1 + t;
    }
  }
  return CONTOUR_LEVEL_COUNT;
}

function buildShadowGrid(
  heightGrid: Float32Array,
  gridW: number,
  gridH: number,
  towardLightX: number,
  towardLightY: number,
  config: TopographyLightConfig,
): Float32Array {
  const shadowGrid = new Float32Array(heightGrid.length);
  const maxShadowPx = config.heightPerLayer * config.shadowLengthMult * CONTOUR_LEVEL_COUNT;
  const maxSteps = Math.max(4, Math.ceil(maxShadowPx / LIGHT_GRID_CELL_SIZE_PX));
  const heightDropPerPixel = 1 / Math.max(1, config.heightPerLayer * config.shadowLengthMult);

  for (let iy = 0; iy < gridH; iy++) {
    const row = iy * gridW;
    for (let ix = 0; ix < gridW; ix++) {
      const currentHeight = heightGrid[row + ix];
      if (currentHeight <= 0.05) continue;

      let maxOcclusion = 0;
      for (let step = 1; step <= maxSteps; step++) {
        const sampleX = ix + towardLightX * step;
        const sampleY = iy + towardLightY * step;
        if (sampleX < 0 || sampleY < 0 || sampleX >= gridW - 1 || sampleY >= gridH - 1) break;

        const distPx = step * LIGHT_GRID_CELL_SIZE_PX;
        const requiredHeight = currentHeight + distPx * heightDropPerPixel;
        const occluderHeight = sampleGridBilinear(heightGrid, gridW, gridH, sampleX, sampleY);
        const occlusion = occluderHeight - requiredHeight;
        if (occlusion > maxOcclusion) maxOcclusion = occlusion;
        if (maxOcclusion >= 1.1) break;
      }

      shadowGrid[row + ix] = clamp01(maxOcclusion / 1.1);
    }
  }

  const blurRadius = Math.max(0, Math.round(config.shadowSoftness * 3));
  return blurRadius > 0
    ? blurScalarGridGaussian(shadowGrid, gridW, gridH, blurRadius)
    : new Float32Array(shadowGrid);
}

function buildLightGrid(
  heightGrid: Float32Array,
  shadowGrid: Float32Array,
  gridW: number,
  gridH: number,
  towardLightX: number,
  towardLightY: number,
  config: TopographyLightConfig,
): Float32Array {
  const lightGrid = new Float32Array(heightGrid.length);
  let lx = -towardLightX;
  let ly = -towardLightY;
  let lz = LIGHT_DIRECTION_Z;
  const lightLen = Math.hypot(lx, ly, lz) || 1;
  lx /= lightLen;
  ly /= lightLen;
  lz /= lightLen;
  const slopeScale = 0.85 * config.slopeSmoothing;

  for (let iy = 0; iy < gridH; iy++) {
    const row = iy * gridW;
    for (let ix = 0; ix < gridW; ix++) {
      const h = heightGrid[row + ix];
      if (h <= 0.05) continue;

      const left = heightGrid[row + Math.max(0, ix - 1)];
      const right = heightGrid[row + Math.min(gridW - 1, ix + 1)];
      const up = heightGrid[Math.max(0, iy - 1) * gridW + ix];
      const down = heightGrid[Math.min(gridH - 1, iy + 1) * gridW + ix];
      let nx = -(right - left) * 0.5 * slopeScale;
      let ny = -(down - up) * 0.5 * slopeScale;
      let nz = NORMAL_Z;
      const normalLen = Math.hypot(nx, ny, nz) || 1;
      nx /= normalLen;
      ny /= normalLen;
      nz /= normalLen;

      const diffuse = Math.max(0, nx * lx + ny * ly + nz * lz);
      const height01 = clamp01(h / CONTOUR_LEVEL_COUNT);
      const shadowAmount = shadowGrid[row + ix];
      const lit = clamp01(
        config.ambientFloor
        + (1 - config.ambientFloor)
        * clamp01((0.16 + diffuse * config.lightIntensity + height01 * 0.08) * (1 - shadowAmount * 0.82)),
      );
      lightGrid[row + ix] = lit;
    }
  }

  return blurScalarGridGaussian(lightGrid, gridW, gridH, 1);
}

// ---------------------------------------------------------------------------
// Separable Gaussian blur
// ---------------------------------------------------------------------------

/**
 * Builds a normalized 1-D Gaussian kernel of half-width `radius`.
 *
 * The kernel has `2 * radius + 1` taps.  Sigma defaults to `radius / 2`
 * so roughly 95 % of the distribution fits within the kernel window.
 */
function buildGaussianKernel(radius: number, sigma?: number): Float32Array {
  const size = radius * 2 + 1;
  const s = sigma ?? Math.max(0.3, radius * 0.5);
  const s2 = 2 * s * s;
  const kernel = new Float32Array(size);
  let sum = 0;
  for (let i = 0; i < size; i++) {
    const x = i - radius;
    kernel[i] = Math.exp(-(x * x) / s2);
    sum += kernel[i];
  }
  for (let i = 0; i < size; i++) {
    kernel[i] /= sum;
  }
  return kernel;
}

/**
 * Separable Gaussian blur applied in two passes (horizontal then vertical).
 *
 * Edge pixels are clamped (border replication).  Always returns a new
 * Float32Array, even when `radius` is 0, so callers can always treat the
 * result as a distinct buffer.
 */
function blurScalarGridGaussian(src: Float32Array, gridW: number, gridH: number, radius: number): Float32Array {
  if (radius <= 0) return new Float32Array(src);
  const kernel = buildGaussianKernel(radius);
  const temp = new Float32Array(src.length);
  const out = new Float32Array(src.length);

  // Horizontal pass
  for (let iy = 0; iy < gridH; iy++) {
    const row = iy * gridW;
    for (let ix = 0; ix < gridW; ix++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) {
        const sx = clampInt(ix + k - radius, 0, gridW - 1);
        sum += src[row + sx] * kernel[k];
      }
      temp[row + ix] = sum;
    }
  }

  // Vertical pass
  for (let iy = 0; iy < gridH; iy++) {
    for (let ix = 0; ix < gridW; ix++) {
      let sum = 0;
      for (let k = 0; k < kernel.length; k++) {
        const sy = clampInt(iy + k - radius, 0, gridH - 1);
        sum += temp[sy * gridW + ix] * kernel[k];
      }
      out[iy * gridW + ix] = sum;
    }
  }

  return out;
}

function drawLightBeams(
  ctx: CanvasRenderingContext2D,
  heightGrid: Float32Array,
  gridW: number,
  gridH: number,
  cellSizePx: number,
  towardLightX: number,
  towardLightY: number,
  palette: LightingPalette,
  config: TopographyLightConfig,
  seed: number,
): void {
  const beamDirX = -towardLightX;
  const beamDirY = -towardLightY;
  const maxBeams = Math.max(8, Math.round(14 + config.beamStrength * 30));
  let beamsDrawn = 0;

  ctx.save();
  try {
    ctx.lineCap = 'round';
    for (let iy = 1; iy < gridH - 1 && beamsDrawn < maxBeams; iy += 2) {
      for (let ix = 1; ix < gridW - 1 && beamsDrawn < maxBeams; ix += 2) {
        const h = heightGrid[iy * gridW + ix];
        if (h <= 0.7) continue;
        const upstream = sampleGridBilinear(heightGrid, gridW, gridH, ix + towardLightX * 1.35, iy + towardLightY * 1.35);
        const downstream = sampleGridBilinear(heightGrid, gridW, gridH, ix + beamDirX * 1.1, iy + beamDirY * 1.1);
        if (upstream > 0.12 || downstream > h * 0.92) continue;
        if ((((ix * 92821) ^ (iy * 68917) ^ seed) & 3) !== 0) continue;

        const startX = ix * cellSizePx - towardLightX * cellSizePx * 0.4;
        const startY = iy * cellSizePx - towardLightY * cellSizePx * 0.4;
        const beamLength = (26 + h * 10) * Math.max(0.2, config.beamStrength);
        const endX = startX + beamDirX * beamLength;
        const endY = startY + beamDirY * beamLength;
        const gradient = ctx.createLinearGradient(startX, startY, endX, endY);
        gradient.addColorStop(0, rgbToCss(palette.beam, 0.13 * config.beamStrength));
        gradient.addColorStop(0.45, rgbToCss(palette.beam, 0.05 * config.beamStrength));
        gradient.addColorStop(1, rgbToCss(palette.beam, 0));
        ctx.strokeStyle = gradient;
        ctx.lineWidth = (4 + h * 1.1) * (0.85 + config.beamStrength * 0.9);
        ctx.beginPath();
        ctx.moveTo(startX, startY);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        beamsDrawn++;
      }
    }
  } finally {
    ctx.restore();
  }
}

function drawLightingDevOverlay(ctx: CanvasRenderingContext2D, cache: BakedTopographyLightCache): void {
  const panelX = 8;
  const panelY = 40;
  const panelW = 110;
  const panelH = 78;
  const gap = 8;

  ctx.save();
  try {
    drawMiniGrid(ctx, panelX, panelY, panelW, panelH, cache.heightGrid, cache.gridW, cache.gridH, 'height');
    drawMiniGrid(ctx, panelX + panelW + gap, panelY, panelW, panelH, cache.shadowGrid, cache.gridW, cache.gridH, 'shadow');

    const arrowX = panelX + (panelW + gap) * 2;
    ctx.fillStyle = 'rgba(8, 10, 18, 0.8)';
    ctx.fillRect(arrowX, panelY, 72, panelH);
    ctx.strokeStyle = 'rgba(255,255,255,0.22)';
    ctx.strokeRect(arrowX + 0.5, panelY + 0.5, 71, panelH - 1);
    ctx.fillStyle = '#dbefff';
    ctx.font = '10px monospace';
    ctx.fillText('LIGHT', arrowX + 18, panelY + 12);
    const cx = arrowX + 36;
    const cy = panelY + 44;
    const len = 22;
    const ax = cx + Math.cos(cache.config.lightAngle) * len;
    const ay = cy + Math.sin(cache.config.lightAngle) * len;
    ctx.strokeStyle = '#fff0b0';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(ax, ay);
    ctx.stroke();
    const headAngle = Math.atan2(ay - cy, ax - cx);
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - Math.cos(headAngle - 0.45) * 7, ay - Math.sin(headAngle - 0.45) * 7);
    ctx.lineTo(ax - Math.cos(headAngle + 0.45) * 7, ay - Math.sin(headAngle + 0.45) * 7);
    ctx.closePath();
    ctx.fillStyle = '#fff0b0';
    ctx.fill();
  } finally {
    ctx.restore();
  }
}

function drawMiniGrid(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  grid: Float32Array,
  gridW: number,
  gridH: number,
  mode: 'height' | 'shadow',
): void {
  ctx.fillStyle = 'rgba(8, 10, 18, 0.8)';
  ctx.fillRect(x, y, w, h);
  const cellW = w / gridW;
  const cellH = h / gridH;

  for (let iy = 0; iy < gridH; iy++) {
    const row = iy * gridW;
    for (let ix = 0; ix < gridW; ix++) {
      const v = grid[row + ix];
      if (mode === 'height' && v <= 0.02) continue;
      if (mode === 'height') {
        const t = clamp01(v / CONTOUR_LEVEL_COUNT);
        const r = Math.round(lerp(18, 255, t));
        const g = Math.round(lerp(38, 186, t));
        const b = Math.round(lerp(56, 94, 1 - t));
        ctx.fillStyle = `rgb(${r}, ${g}, ${b})`;
      } else {
        const t = clamp01(v);
        const shade = Math.round(lerp(18, 230, t));
        ctx.fillStyle = `rgb(${shade}, ${shade}, ${shade})`;
      }
      ctx.fillRect(x + ix * cellW, y + iy * cellH, cellW + 0.5, cellH + 0.5);
    }
  }

  ctx.strokeStyle = 'rgba(255,255,255,0.22)';
  ctx.strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  ctx.fillStyle = '#dbefff';
  ctx.font = '10px monospace';
  ctx.fillText(mode === 'height' ? 'HEIGHT' : 'SHADOW', x + 6, y + 12);
}

function getTerrainCentroid(state: TopographicTerrainState): { x: number; y: number } {
  if (state.mergedContours) {
    return { x: state.mergedContours.centroidX, y: state.mergedContours.centroidY };
  }

  let weightSum = 0;
  let x = 0;
  let y = 0;
  for (const island of state.islands) {
    const weight = island.outerRadius * island.outerRadius;
    x += island.centerX * weight;
    y += island.centerY * weight;
    weightSum += weight;
  }
  if (weightSum <= 0) {
    return { x: 0, y: 0 };
  }
  return { x: x / weightSum, y: y / weightSum };
}

function sampleGridBilinear(
  grid: Float32Array,
  gridW: number,
  gridH: number,
  x: number,
  y: number,
): number {
  const x0 = clampInt(Math.floor(x), 0, gridW - 1);
  const y0 = clampInt(Math.floor(y), 0, gridH - 1);
  const x1 = clampInt(x0 + 1, 0, gridW - 1);
  const y1 = clampInt(y0 + 1, 0, gridH - 1);
  const tx = clamp01(x - x0);
  const ty = clamp01(y - y0);
  const a = lerp(grid[y0 * gridW + x0], grid[y0 * gridW + x1], tx);
  const b = lerp(grid[y1 * gridW + x0], grid[y1 * gridW + x1], tx);
  return lerp(a, b, ty);
}

function rgbToCss(rgb: LightingRgb, alpha: number): string {
  return `rgba(${rgb.r}, ${rgb.g}, ${rgb.b}, ${clamp01(alpha)})`;
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function clampInt(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  if (edge0 === edge1) return x < edge0 ? 0 : 1;
  const t = clamp01((x - edge0) / (edge1 - edge0));
  return t * t * (3 - 2 * t);
}
