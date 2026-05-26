/**
 * euhedral-hex-floor.ts — Full-screen dimly-lit hexagonal floor grid for the
 * Euhedral zone.
 *
 * The floor covers the entire camera area with small basalt-crystal hexagons.
 * By default the hexes are very dark (nearly invisible), but they react to
 * nearby terrain light emitters (enemies, player, attacks, beams) by picking up
 * a colored tint proportional to distance.
 *
 * Performance approach:
 *   - Hex geometry (corner coordinates) is computed once and cached per canvas size.
 *   - Per frame only tint/color values are recomputed — no path-geometry work.
 *   - A single canvas-path pass draws all floor hexes; lit hexes receive a second
 *     colored-overlay pass limited to hexes within any emitter's radius.
 *   - Squared-distance pre-cull eliminates most cells before the expensive sqrt.
 */

import type { TerrainLightEmitter } from './terrain-lighting';
import { sampleTerrainLightAt } from './terrain-lighting';
import { createSeededRng } from './topographic-terrain';

// ── Visual constants ───────────────────────────────────────────────────────────

/** Hex circumradius in logical px. Slightly larger than basalt formations (~14 px). */
const FLOOR_HEX_RADIUS = 19;

/** Base fill alpha for an unlit floor hex (0–1). */
const FLOOR_BASE_ALPHA = 0.13;

/** Base stroke alpha for an unlit floor hex (0–1). */
const FLOOR_STROKE_ALPHA = 0.20;

/** Maximum additive alpha for a fully-lit floor hex tint overlay. */
const FLOOR_TINT_ALPHA_MAX = 0.22;

/** Stroke line width for floor hexes (thin to differentiate from formations). */
const FLOOR_LINE_WIDTH = 0.55;

/** Base hue for the dark basalt fill (cool blue-gray). */
const FLOOR_BASE_HUE = 213;

/** Lightness variation range around the base lightness (0-100 scale, ±). */
const FLOOR_LIGHTNESS_VARIATION = 2.5;

/** Base fill lightness (very dark). */
const FLOOR_BASE_LIGHTNESS = 7;

// ── Internal types ─────────────────────────────────────────────────────────────

interface HexFloorCell {
  cx: number;
  cy: number;
  /** Flat array of 12 numbers: [x0,y0, x1,y1, …, x5,y5] in world space. */
  corners: Float32Array;
  /** Pre-varied base fill RGB (dark, subtle variation). */
  baseR: number;
  baseG: number;
  baseB: number;
  /** Pre-varied base stroke RGB. */
  strokeR: number;
  strokeG: number;
  strokeB: number;
}

interface HexFloorGeom {
  canvasW: number;
  canvasH: number;
  cells: HexFloorCell[];
}

// ── Module-level geometry cache ────────────────────────────────────────────────

let _cachedGeom: HexFloorGeom | null = null;

// ── Geometry helpers ───────────────────────────────────────────────────────────

/** Convert HSL (h 0–360, s 0–100, l 0–100) to integer RGB 0–255. */
function _hslToRgb255(h: number, s: number, l: number): [number, number, number] {
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
 * Builds and caches the hex grid geometry for the given canvas size.
 * Hex layout: pointy-top, axial spacing.
 */
function _getOrBuildGeom(canvasW: number, canvasH: number): HexFloorGeom {
  if (
    _cachedGeom !== null &&
    _cachedGeom.canvasW === canvasW &&
    _cachedGeom.canvasH === canvasH
  ) {
    return _cachedGeom;
  }

  const R = FLOOR_HEX_RADIUS;
  const sqrt3 = Math.sqrt(3);
  // Pointy-top hex: horizontal spacing = sqrt3 * R, vertical spacing = 1.5 * R
  const colW = sqrt3 * R;
  const rowH = 1.5 * R;

  // Add one extra cell on each side so hexes fully cover the canvas edge.
  const colCount = Math.ceil(canvasW / colW) + 2;
  const rowCount = Math.ceil(canvasH / rowH) + 2;

  // Seeded RNG for per-hex variation (fixed seed so it doesn't change frame-to-frame)
  const rng = createSeededRng(0xE0EB1DEA | 0);

  const cells: HexFloorCell[] = [];

  for (let row = -1; row < rowCount; row++) {
    for (let col = -1; col < colCount; col++) {
      // Offset every other column by half a row (pointy-top axial)
      const cx = (col + 0.5) * colW + (row % 2 !== 0 ? colW * 0.5 : 0);
      const cy = (row + 0.5) * rowH + R * 0.25;

      // Pre-compute 6 corner positions (pointy-top: first angle = π/6)
      const corners = new Float32Array(12);
      for (let i = 0; i < 6; i++) {
        const angle = Math.PI / 6 + i * Math.PI / 3;
        corners[i * 2]     = cx + R * Math.cos(angle);
        corners[i * 2 + 1] = cy + R * Math.sin(angle);
      }

      // Per-hex lightness variation
      const lightVar = (rng() * 2 - 1) * FLOOR_LIGHTNESS_VARIATION;
      const lit = FLOOR_BASE_LIGHTNESS + lightVar;
      const satVar = rng() * 4;

      const [br, bg, bb] = _hslToRgb255(FLOOR_BASE_HUE, 8 + satVar, lit);
      const [sr, sg, sb] = _hslToRgb255(FLOOR_BASE_HUE, 12, lit + 8);

      cells.push({ cx, cy, corners, baseR: br, baseG: bg, baseB: bb, strokeR: sr, strokeG: sg, strokeB: sb });
    }
  }

  _cachedGeom = { canvasW, canvasH, cells };
  return _cachedGeom;
}

// ── Public draw function ───────────────────────────────────────────────────────

/**
 * Draws the full-screen Euhedral hex floor.
 *
 * Call this after the background fill, before enemies and terrain formations.
 * Should only be called when `activeZoneId === 'euhedral'`.
 *
 * @param ctx        2D rendering context.
 * @param canvasW    Canvas backing width in logical px.
 * @param canvasH    Canvas backing height in logical px.
 * @param emitters   Terrain light emitters collected this frame (may be empty).
 * @param lowGraphics  When true, skip the tint overlay pass for performance.
 */
export function drawEuhedralHexFloor(
  ctx: CanvasRenderingContext2D,
  canvasW: number,
  canvasH: number,
  emitters: TerrainLightEmitter[],
  lowGraphics: boolean,
): void {
  const geom = _getOrBuildGeom(canvasW, canvasH);
  const cells = geom.cells;

  ctx.save();
  ctx.lineJoin = 'miter';
  ctx.lineWidth = FLOOR_LINE_WIDTH;

  // ── Pass 1: base dim floor (all cells) ────────────────────────────────────
  for (let ci = 0; ci < cells.length; ci++) {
    const cell = cells[ci];
    const c = cell.corners;
    ctx.beginPath();
    ctx.moveTo(c[0], c[1]);
    ctx.lineTo(c[2], c[3]);
    ctx.lineTo(c[4], c[5]);
    ctx.lineTo(c[6], c[7]);
    ctx.lineTo(c[8], c[9]);
    ctx.lineTo(c[10], c[11]);
    ctx.closePath();

    ctx.globalAlpha = FLOOR_BASE_ALPHA;
    ctx.fillStyle = `rgb(${cell.baseR},${cell.baseG},${cell.baseB})`;
    ctx.fill();

    ctx.globalAlpha = FLOOR_STROKE_ALPHA;
    ctx.strokeStyle = `rgb(${cell.strokeR},${cell.strokeG},${cell.strokeB})`;
    ctx.stroke();
  }

  // ── Pass 2: tint overlay for cells near emitters ───────────────────────────
  // Skip if no emitters or low-graphics mode.
  if (!lowGraphics && emitters.length > 0) {
    // Pre-compute per-emitter bounding boxes (AABB) for quick cull.
    // Extended by radiusPx in all directions.

    for (let ci = 0; ci < cells.length; ci++) {
      const cell = cells[ci];

      // Quick AABB cull: check if the cell center is within any emitter's radius.
      // We only need the expensive sampleTerrainLightAt when this passes.
      let anyNear = false;
      for (let ei = 0; ei < emitters.length; ei++) {
        const em = emitters[ei];
        const maxR = em.radiusPx + FLOOR_HEX_RADIUS;
        const ddx = cell.cx - em.x;
        const ddy = cell.cy - em.y;
        // For beams, also check against the far endpoint
        if (em.type === 'beam') {
          const dx2 = cell.cx - em.x2;
          const dy2 = cell.cy - em.y2;
          if (
            ddx * ddx + ddy * ddy < maxR * maxR ||
            dx2 * dx2 + dy2 * dy2 < maxR * maxR
          ) {
            anyNear = true;
            break;
          }
          // Also check midpoint of beam for fast-cull approximation
          const mx = (em.x + em.x2) * 0.5;
          const my = (em.y + em.y2) * 0.5;
          const dmx = cell.cx - mx, dmy = cell.cy - my;
          if (dmx * dmx + dmy * dmy < maxR * maxR) {
            anyNear = true;
            break;
          }
        } else {
          if (ddx * ddx + ddy * ddy < maxR * maxR) {
            anyNear = true;
            break;
          }
        }
      }
      if (!anyNear) continue;

      const sample = sampleTerrainLightAt(cell.cx, cell.cy, emitters);
      if (!sample || sample.blend <= 0.01) continue;

      const alpha = sample.blend * FLOOR_TINT_ALPHA_MAX;
      const c = cell.corners;
      ctx.beginPath();
      ctx.moveTo(c[0], c[1]);
      ctx.lineTo(c[2], c[3]);
      ctx.lineTo(c[4], c[5]);
      ctx.lineTo(c[6], c[7]);
      ctx.lineTo(c[8], c[9]);
      ctx.lineTo(c[10], c[11]);
      ctx.closePath();

      ctx.globalAlpha = alpha;
      ctx.fillStyle = `rgb(${sample.r},${sample.g},${sample.b})`;
      ctx.fill();
    }
  }

  ctx.globalAlpha = 1;
  ctx.restore();
}

/**
 * Invalidates the cached hex floor geometry, forcing a rebuild on the next draw.
 * Call this if the canvas is resized outside of a normal size-change detected
 * by the draw function itself.
 */
export function invalidateEuhedralHexFloorCache(): void {
  _cachedGeom = null;
}
