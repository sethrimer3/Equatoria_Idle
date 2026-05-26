import type { TopographicTerrainPoint } from './topographic-terrain';
import { createSeededRng } from './topographic-terrain';
import type { EnemyInfluencePoint } from './recursive-square-terrain';
import type { TerrainLightEmitter } from './terrain-lighting';
import { distToSegmentSq } from './terrain-lighting';

export interface BasaltHexCell {
  id: string;
  cx: number;
  cy: number;
  /** Circumradius of the hex in px. */
  radius: number;
  /** 6 world-space corners (clockwise). */
  corners: TopographicTerrainPoint[];
  /** Virtual column height 0–1. Higher = brighter + longer shadow. */
  height01: number;
  /** CSS fill color string. */
  color: string;
  /** CSS outline color string. */
  lineColor: string;
  /** Pre-computed RGB of the fill color, for enemy-proximity blending. */
  colorR: number;
  colorG: number;
  colorB: number;
  /** Pre-computed RGB of the line color, for enemy-proximity blending. */
  lineR: number;
  lineG: number;
  lineB: number;
  /** Normalized appear delay 0–1 for grow animation. */
  appearDelay01: number;
  /** Cluster index this cell belongs to. */
  clusterId: number;
}

export interface BasaltTerrainState {
  cells: BasaltHexCell[];
  /** Solid polygon list (= cells[i].corners for active cells). Rebuilt at generation. */
  solidPolygons: TopographicTerrainPoint[][];
  /** Sun direction (unit vector) for shadow casting. */
  sunDirX: number;
  sunDirY: number;
}

const HEX_RADIUS_BASE_PX = 14;
const HEX_RADIUS_JITTER_PX = 1;
const PLAYER_SAFE_RADIUS_PX = 65;
const EDGE_CLEARANCE_PX = 20;
const MAX_CELLS = 200;

function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

function basaltNoise(q: number, r: number, seed: number): number {
  const h = (Math.imul(q, 2654435761) ^ Math.imul(r, 2246822519) ^ seed) >>> 0;
  const rng = createSeededRng(h);
  return rng() * 2 - 1;
}

function basaltFillColor(height01: number): string {
  const lightness = 12 + height01 * 28;
  const sat = 8 + height01 * 12;
  return `hsl(210, ${sat.toFixed(1)}%, ${lightness.toFixed(1)}%)`;
}

function basaltLineColor(height01: number): string {
  const lightness = 25 + height01 * 30;
  return `hsl(210, 15%, ${lightness.toFixed(1)}%)`;
}

// ── Enemy-proximity colour blending ─────────────────────────────────────────

/** Converts HSL (h 0-360, s 0-100, l 0-100) to integer RGB [0-255]. */
function hslToRgb255(h: number, s: number, l: number): [number, number, number] {
  const sn = s / 100;
  const ln = l / 100;
  const C = (1 - Math.abs(2 * ln - 1)) * sn;
  const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = ln - C / 2;
  let r = 0, g = 0, b = 0;
  if      (h < 60)  { r = C; g = X; }
  else if (h < 120) { r = X; g = C; }
  else if (h < 180) { g = C; b = X; }
  else if (h < 240) { g = X; b = C; }
  else if (h < 300) { r = X; b = C; }
  else              { r = C; b = X; }
  return [((r + m) * 255 + 0.5) | 0, ((g + m) * 255 + 0.5) | 0, ((b + m) * 255 + 0.5) | 0];
}

/**
 * Distance within which an enemy influences hex fill and stroke colours.
 * Sized to cover a hex cell's full diameter plus comfortable margin.
 */
const HEX_ENEMY_INFLUENCE_RADIUS_PX = 110;

/**
 * Amplifier for the total enemy weight before clamping to [0, 1].
 * Higher values make colour shifts respond more quickly as enemies approach.
 */
const HEX_ENEMY_INFLUENCE_AMPLIFY = 1.8;

/**
 * Returns an rgba() colour string for a hex cell, blending its original RGB
 * toward the weighted average of nearby enemy colours and terrain light emitters.
 *
 * @param cx/cy           Cell centre in world space.
 * @param origR/G/B       Original cell RGB.
 * @param alpha           Per-cell global alpha (grow animation).
 * @param enemies         All active enemy influence points this frame.
 * @param lights          Terrain light emitters (point + beam) this frame.
 */
function influencedHexColor(
  cx: number, cy: number,
  origR: number, origG: number, origB: number,
  alpha: number,
  enemies: EnemyInfluencePoint[] | undefined,
  lights: TerrainLightEmitter[] | undefined,
): string {
  const radiusPx = HEX_ENEMY_INFLUENCE_RADIUS_PX;
  let totalW = 0;
  let sumR = 0, sumG = 0, sumB = 0;

  // ── Enemy point lights (legacy / existing system) ──────────────
  if (enemies !== undefined && enemies.length > 0) {
    for (let ei = 0; ei < enemies.length; ei++) {
      const e = enemies[ei];
      const dx = cx - e.x, dy = cy - e.y;
      const distSq = dx * dx + dy * dy;
      if (distSq >= radiusPx * radiusPx) continue;
      const w = (1 - Math.sqrt(distSq) / radiusPx) ** 2;
      totalW += w;
      sumR += w * e.r;
      sumG += w * e.g;
      sumB += w * e.b;
    }
  }

  // ── Terrain light emitters (point + beam) ─────────────────────
  if (lights !== undefined && lights.length > 0) {
    for (let li = 0; li < lights.length; li++) {
      const light = lights[li];
      const r2 = light.radiusPx * light.radiusPx;
      let distSq: number;
      if (light.type === 'beam') {
        distSq = distToSegmentSq(cx, cy, light.x, light.y, light.x2, light.y2);
      } else {
        const dx = cx - light.x, dy = cy - light.y;
        distSq = dx * dx + dy * dy;
      }
      if (distSq >= r2) continue;
      const dist = Math.sqrt(distSq);
      const w = ((1 - dist / light.radiusPx) ** 2) * light.intensity;
      totalW += w;
      sumR += w * light.r;
      sumG += w * light.g;
      sumB += w * light.b;
    }
  }

  let r = origR, g = origG, b = origB;
  if (totalW > 0) {
    const blend = clamp01(totalW * HEX_ENEMY_INFLUENCE_AMPLIFY);
    const invW = 1 / totalW;
    r = (origR + blend * (sumR * invW - origR) + 0.5) | 0;
    g = (origG + blend * (sumG * invW - origG) + 0.5) | 0;
    b = (origB + blend * (sumB * invW - origB) + 0.5) | 0;
  }
  return `rgba(${r},${g},${b},${alpha.toFixed(2)})`;
}

function computeHexCorners(cx: number, cy: number, radius: number): TopographicTerrainPoint[] {
  const corners: TopographicTerrainPoint[] = new Array(6);
  for (let i = 0; i < 6; i++) {
    const angle = Math.PI / 6 + i * Math.PI / 3;
    corners[i] = {
      x: cx + radius * Math.cos(angle),
      y: cy + radius * Math.sin(angle),
    };
  }
  return corners;
}

function drawPolygon(ctx: CanvasRenderingContext2D, corners: TopographicTerrainPoint[], offsetX = 0, offsetY = 0): void {
  if (corners.length === 0) return;
  ctx.beginPath();
  ctx.moveTo(corners[0].x + offsetX, corners[0].y + offsetY);
  for (let i = 1; i < corners.length; i++) {
    ctx.lineTo(corners[i].x + offsetX, corners[i].y + offsetY);
  }
  ctx.closePath();
}

export function getBasaltCellAlpha(cell: BasaltHexCell, growth01: number): number {
  const t = (growth01 - cell.appearDelay01 * 0.75) / 0.25;
  return clamp01(t);
}

export function generateBasaltTerrain(
  seed: number,
  waveNumber: number,
  canvasW: number,
  canvasH: number,
): BasaltTerrainState {
  const rng = createSeededRng((seed ^ 0xba5a170) >>> 0);
  const hexRadius = HEX_RADIUS_BASE_PX + (rng() * 2 - 1) * HEX_RADIUS_JITTER_PX;
  const sqrt3 = Math.sqrt(3);
  const minDim = Math.min(canvasW, canvasH);
  const centerX = canvasW * 0.5;
  const centerY = canvasH * 0.5;
  const clusterCount = rng() < 0.22 ? 2 : 1;
  const cells: BasaltHexCell[] = [];
  const occupied = new Set<string>();
  let idCounter = 0;

  for (let clusterId = 0; clusterId < clusterCount && cells.length < MAX_CELLS; clusterId++) {
    const angleBase = rng() * Math.PI * 2;
    const angle = clusterCount === 2
      ? angleBase + clusterId * Math.PI + (rng() - 0.5) * 0.45
      : angleBase;
    const offsetRadius = minDim * (0.22 + rng() * 0.12);
    const clusterCx = Math.min(
      canvasW - EDGE_CLEARANCE_PX - hexRadius,
      Math.max(EDGE_CLEARANCE_PX + hexRadius, centerX + Math.cos(angle) * offsetRadius),
    );
    const clusterCy = Math.min(
      canvasH - EDGE_CLEARANCE_PX - hexRadius,
      Math.max(EDGE_CLEARANCE_PX + hexRadius, centerY + Math.sin(angle) * offsetRadius),
    );
    const maxRadius = minDim * 0.3 * (0.92 + rng() * 0.18);
    const axialRange = Math.ceil(maxRadius / (hexRadius * 1.5)) + 2;

    for (let r = -axialRange; r <= axialRange && cells.length < MAX_CELLS; r++) {
      for (let q = -axialRange; q <= axialRange && cells.length < MAX_CELLS; q++) {
        const cx = clusterCx + hexRadius * sqrt3 * (q + r / 2);
        const cy = clusterCy + hexRadius * 1.5 * r;
        const dx = cx - clusterCx;
        const dy = cy - clusterCy;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const boundaryNoise = basaltNoise(q + clusterId * 97, r - clusterId * 53, seed ^ waveNumber);
        const threshold = 0.75 + 0.35 * boundaryNoise;
        if (dist / Math.max(1, maxRadius) >= threshold) continue;
        const safeDx = cx - centerX;
        const safeDy = cy - centerY;
        if (safeDx * safeDx + safeDy * safeDy < PLAYER_SAFE_RADIUS_PX * PLAYER_SAFE_RADIUS_PX) continue;
        if (cx < EDGE_CLEARANCE_PX || cy < EDGE_CLEARANCE_PX || cx > canvasW - EDGE_CLEARANCE_PX || cy > canvasH - EDGE_CLEARANCE_PX) continue;
        const key = `${Math.round(cx * 10)}:${Math.round(cy * 10)}`;
        if (occupied.has(key)) continue;
        occupied.add(key);
        const heightNoise = basaltNoise(q * 3 + 11, r * 5 - 7, seed ^ 0x5f3759df);
        const height01 = clamp01(1 - dist / Math.max(1, maxRadius) + 0.15 * heightNoise);
        const appearJitter = (rng() * 2 - 1) * 0.08;
        const fillLightness = 12 + height01 * 28;
        const fillSat = 8 + height01 * 12;
        const lineLightness = 25 + height01 * 30;
        const [colorR, colorG, colorB] = hslToRgb255(210, fillSat, fillLightness);
        const [lineR, lineG, lineB] = hslToRgb255(210, 15, lineLightness);
        cells.push({
          id: `basalt-${waveNumber}-${idCounter++}`,
          cx,
          cy,
          radius: hexRadius,
          corners: computeHexCorners(cx, cy, hexRadius),
          height01,
          color: basaltFillColor(height01),
          lineColor: basaltLineColor(height01),
          colorR, colorG, colorB,
          lineR, lineG, lineB,
          appearDelay01: 1 - height01 + appearJitter,
          clusterId,
        });
      }
    }
  }

  cells.sort((a, b) => b.height01 - a.height01);

  let minDelay = Infinity;
  let maxDelay = -Infinity;
  for (const cell of cells) {
    if (cell.appearDelay01 < minDelay) minDelay = cell.appearDelay01;
    if (cell.appearDelay01 > maxDelay) maxDelay = cell.appearDelay01;
  }
  const delaySpan = Math.max(1e-6, maxDelay - minDelay);
  for (const cell of cells) {
    cell.appearDelay01 = ((cell.appearDelay01 - minDelay) / delaySpan) * 0.7;
  }

  const sunLen = Math.hypot(0.5, 0.7) || 1;
  return {
    cells,
    solidPolygons: cells.map((cell) => cell.corners),
    sunDirX: 0.5 / sunLen,
    sunDirY: 0.7 / sunLen,
  };
}

export function renderBasaltTerrain(
  ctx: CanvasRenderingContext2D,
  basalt: BasaltTerrainState,
  growth01: number,
  enemies?: EnemyInfluencePoint[],
  lights?: TerrainLightEmitter[],
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

  const hasInfluence = (enemies !== undefined && enemies.length > 0) ||
                       (lights !== undefined && lights.length > 0);

  for (const cell of basalt.cells) {
    const alpha = getBasaltCellAlpha(cell, growth01);
    if (alpha <= 0) continue;
    const shadowLen = 1.5 + (7.0 - 1.5) * cell.height01;
    const shadowOffsetX = -basalt.sunDirX * shadowLen;
    const shadowOffsetY = -basalt.sunDirY * shadowLen;
    drawPolygon(ctx, cell.corners, shadowOffsetX, shadowOffsetY);
    ctx.globalAlpha = alpha * 0.6;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
  }

  for (const cell of basalt.cells) {
    const alpha = getBasaltCellAlpha(cell, growth01);
    if (alpha <= 0) continue;
    drawPolygon(ctx, cell.corners);
    ctx.globalAlpha = 1;
    ctx.fillStyle = hasInfluence
      ? influencedHexColor(cell.cx, cell.cy, cell.colorR, cell.colorG, cell.colorB, alpha, enemies, lights)
      : cell.color;
    ctx.fill();
  }

  for (const cell of basalt.cells) {
    const alpha = getBasaltCellAlpha(cell, growth01);
    if (alpha <= 0) continue;
    drawPolygon(ctx, cell.corners);
    ctx.globalAlpha = 1;
    // Thicker outline (2.5 px) for solid formations — clearly differentiates them
    // from the thin floor hex grid (0.55 px).
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = hasInfluence
      ? influencedHexColor(cell.cx, cell.cy, cell.lineR, cell.lineG, cell.lineB, alpha * 0.9, enemies, lights)
      : cell.lineColor;
    ctx.stroke();
  }

  ctx.restore();
}
