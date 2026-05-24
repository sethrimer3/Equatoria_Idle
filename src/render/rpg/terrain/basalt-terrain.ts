import type { TopographicTerrainPoint } from './topographic-terrain';
import { createSeededRng } from './topographic-terrain';

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
        cells.push({
          id: `basalt-${waveNumber}-${idCounter++}`,
          cx,
          cy,
          radius: hexRadius,
          corners: computeHexCorners(cx, cy, hexRadius),
          height01,
          color: basaltFillColor(height01),
          lineColor: basaltLineColor(height01),
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
): void {
  ctx.save();
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';

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
    ctx.globalAlpha = alpha;
    ctx.fillStyle = cell.color;
    ctx.fill();
  }

  for (const cell of basalt.cells) {
    const alpha = getBasaltCellAlpha(cell, growth01);
    if (alpha <= 0) continue;
    drawPolygon(ctx, cell.corners);
    ctx.globalAlpha = alpha * 0.9;
    ctx.lineWidth = 0.8;
    ctx.strokeStyle = cell.lineColor;
    ctx.stroke();
  }

  ctx.restore();
}
