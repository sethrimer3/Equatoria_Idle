/**
 * topographic-terrain-field.ts — Scalar field computation and Marching Squares
 * contour extraction for smooth topographic terrain merging.
 *
 * ## Theory
 * Each island contributes a scalar "height" value at every grid point.  The
 * contribution at point (wx, wy) for an island with centre (cx, cy), outer
 * radius R, and shape profile P is:
 *
 *   contribution = (R * shapeMultiplier(P, θ)) / max(dist, minDist)
 *
 * where θ = atan2(wy-cy, wx-cx) and dist = euclidean distance from centre.
 * This equals 1.0 on the island's outer boundary, >1.0 inside, <1.0 outside.
 *
 * All island contributions are summed.  Marching Squares is then applied at
 * several threshold levels to extract contour polylines.  Nearby islands whose
 * fields sum above the outermost threshold automatically merge into a single
 * smooth closed contour — no explicit polygon union is needed.
 *
 * ## Performance
 * Field computation and contour extraction run once at wave-generation time and
 * are cached in TopographicTerrainState.mergedContours.  Zero per-frame cost.
 */

/** Minimal shape-profile data needed by the field computation. */
export interface FieldIslandProfile {
  harmonics: Array<{
    frequency: number;
    amplitude: number;
    phase: number;
  }>;
  elongationAngle: number;
  elongationAmount: number;
}

/** Minimal island descriptor for field computation (no rendering data needed). */
export interface FieldIsland {
  centerX: number;
  centerY: number;
  outerRadius: number;
  profile: FieldIslandProfile;
}

// ── Exported contour types ────────────────────────────────────────────────────

export interface ContourPoint {
  x: number;
  y: number;
}

export interface MergedTopographicContourLevel {
  /** Contour threshold that produced this level.  Larger = closer to island centre. */
  threshold: number;
  /** Closed (or nearly-closed) polylines at this threshold. */
  polylines: ContourPoint[][];
  /** Whether this is an index contour (every 3rd level from outermost). */
  isIndexContour: boolean;
  lineWidth: number;
  alpha: number;
  color: string;
}

export interface MergedTopographicContours {
  /** Contour levels ordered outermost-first (index 0 = outermost = solid boundary). */
  levels: MergedTopographicContourLevel[];
  /** Outer-boundary polylines used for solid collision (copy of levels[0].polylines). */
  solidBoundaries: ContourPoint[][];
  /** Weighted centroid of all islands; used for growth-animation scaling. */
  centroidX: number;
  centroidY: number;
}

// ── Constants ─────────────────────────────────────────────────────────────────

/** World-pixels per field grid cell.  Smaller = smoother contours, more work. */
const FIELD_CELL_SIZE = 4;

/** Number of contour threshold levels extracted (innermost to outermost). */
const CONTOUR_LEVEL_COUNT = 9;

/** Scale of the innermost ring relative to outerRadius (must match terrain.ts). */
const INNER_RING_SCALE = 0.28;

/**
 * Contour threshold array, ordered outermost-first.
 * threshold = 1 / scale_of_the_corresponding_ring.
 *
 * Outermost level (index 0): scale=1.0 → threshold=1.0
 * Innermost level (index 8): scale=0.28 → threshold≈3.57
 */
const CONTOUR_THRESHOLDS: number[] = (() => {
  const ts: number[] = [];
  for (let i = 0; i < CONTOUR_LEVEL_COUNT; i++) {
    const scale = 1.0 - (1.0 - INNER_RING_SCALE) * i / (CONTOUR_LEVEL_COUNT - 1);
    ts.push(1.0 / scale);
  }
  return ts;
})();

// ── Shape multiplier (duplicated from topographic-terrain.ts to avoid circular import) ──

/**
 * Evaluates the shared shape multiplier for a profile at angle `theta`.
 * Returns a value ≥ 0.2 (always positive, never collapses to zero).
 */
function shapeMultiplier(profile: FieldIslandProfile, theta: number): number {
  let mod = 1.0;
  for (const h of profile.harmonics) {
    mod += h.amplitude * Math.sin(h.frequency * theta + h.phase);
  }
  const cosElong = Math.cos(theta - profile.elongationAngle);
  mod *= 1 + profile.elongationAmount * (cosElong * cosElong - 0.5);
  return Math.max(0.2, mod);
}

// ── Scalar field computation ───────────────────────────────────────────────────

/**
 * Builds a flat Float32Array scalar field over the canvas area.
 * Field value at each sample point = sum of all island contributions.
 * Returns the field array along with grid dimensions.
 */
function buildField(
  islands: FieldIsland[],
  canvasW: number,
  canvasH: number,
): { field: Float32Array; gridW: number; gridH: number } {
  const gridW = Math.ceil(canvasW / FIELD_CELL_SIZE) + 2;
  const gridH = Math.ceil(canvasH / FIELD_CELL_SIZE) + 2;
  const field = new Float32Array(gridW * gridH);

  for (let iy = 0; iy < gridH; iy++) {
    const wy = iy * FIELD_CELL_SIZE;
    const row = iy * gridW;
    for (let ix = 0; ix < gridW; ix++) {
      const wx = ix * FIELD_CELL_SIZE;
      let total = 0;
      for (const island of islands) {
        const dx = wx - island.centerX;
        const dy = wy - island.centerY;
        const dist = Math.sqrt(dx * dx + dy * dy);
        const theta = Math.atan2(dy, dx);
        const effectiveR = island.outerRadius * shapeMultiplier(island.profile, theta);
        const minDist = effectiveR * 0.05; // cap near-zero division
        const ratio = effectiveR / Math.max(dist, minDist);
        const contrib = ratio * ratio;
        total += Math.min(contrib, 8.0); // cap per-island contribution
      }
      field[row + ix] = total;
    }
  }

  return { field, gridW, gridH };
}

// ── Marching Squares ──────────────────────────────────────────────────────────

interface MsSegment {
  ax: number; ay: number;
  bx: number; by: number;
}

/**
 * Linear interpolation helper: returns the world-coordinate crossing point on
 * the segment from (x0,y0,f0) to (x1,y1,f1) at field value `t`.
 */
function edgeCrossing(
  x0: number, y0: number, f0: number,
  x1: number, y1: number, f1: number,
  t: number,
): ContourPoint {
  const denom = f1 - f0;
  const alpha = Math.abs(denom) < 1e-9 ? 0.5 : (t - f0) / denom;
  const a = Math.max(0, Math.min(1, alpha));
  return { x: x0 + a * (x1 - x0), y: y0 + a * (y1 - y0) };
}

/**
 * Extracts Marching Squares line segments from the field at the given threshold.
 *
 * Corner index convention (clockwise from top-left):
 *   bit3 = TL, bit2 = TR, bit1 = BR, bit0 = BL
 *
 * Edge indices:
 *   0 = top (TL→TR), 1 = right (TR→BR), 2 = bottom (BL→BR), 3 = left (TL→BL)
 */
function extractSegments(
  field: Float32Array,
  gridW: number,
  gridH: number,
  threshold: number,
): MsSegment[] {
  const cs = FIELD_CELL_SIZE;
  const numCX = gridW - 1;
  const numCY = gridH - 1;
  const segments: MsSegment[] = [];

  for (let cy = 0; cy < numCY; cy++) {
    for (let cx = 0; cx < numCX; cx++) {
      const fTL = field[cy * gridW + cx];
      const fTR = field[cy * gridW + (cx + 1)];
      const fBR = field[(cy + 1) * gridW + (cx + 1)];
      const fBL = field[(cy + 1) * gridW + cx];

      const above = (v: number) => v > threshold ? 1 : 0;
      const msCase = (above(fTL) << 3) | (above(fTR) << 2) | (above(fBR) << 1) | above(fBL);
      if (msCase === 0 || msCase === 15) continue;

      const xL = cx * cs, xR = (cx + 1) * cs;
      const yT = cy * cs, yB = (cy + 1) * cs;

      // Compute edge-crossing point by edge index.
      const e = (edgeIdx: number): ContourPoint => {
        switch (edgeIdx) {
          case 0: return edgeCrossing(xL, yT, fTL, xR, yT, fTR, threshold); // top
          case 1: return edgeCrossing(xR, yT, fTR, xR, yB, fBR, threshold); // right
          case 2: return edgeCrossing(xL, yB, fBL, xR, yB, fBR, threshold); // bottom
          default: return edgeCrossing(xL, yT, fTL, xL, yB, fBL, threshold); // left (3)
        }
      };

      const addSeg = (e1: number, e2: number) => {
        const p1 = e(e1), p2 = e(e2);
        segments.push({ ax: p1.x, ay: p1.y, bx: p2.x, by: p2.y });
      };

      // Saddle-case disambiguation uses average cell value.
      const fCentre = (fTL + fTR + fBR + fBL) * 0.25;

      switch (msCase) {
        case 1:  addSeg(3, 2); break;                 // BL
        case 2:  addSeg(2, 1); break;                 // BR
        case 3:  addSeg(3, 1); break;                 // BL+BR
        case 4:  addSeg(0, 1); break;                 // TR
        case 5:                                        // TR+BL saddle
          if (fCentre > threshold) { addSeg(0, 3); addSeg(1, 2); }
          else                     { addSeg(0, 1); addSeg(3, 2); }
          break;
        case 6:  addSeg(0, 2); break;                 // TR+BR
        case 7:  addSeg(0, 3); break;                 // TR+BR+BL (only TL below)
        case 8:  addSeg(0, 3); break;                 // TL (only TL above)
        case 9:  addSeg(0, 2); break;                 // TL+BL
        case 10:                                       // TL+BR saddle
          if (fCentre > threshold) { addSeg(0, 3); addSeg(2, 1); }
          else                     { addSeg(0, 1); addSeg(2, 3); }
          break;
        case 11: addSeg(0, 1); break;                 // TL+BR+BL (only TR below)
        case 12: addSeg(1, 3); break;                 // TL+TR
        case 13: addSeg(1, 2); break;                 // TL+TR+BL (only BR below)
        case 14: addSeg(2, 3); break;                 // TL+TR+BR (only BL below)
      }
    }
  }

  return segments;
}

// ── Polyline stitching ────────────────────────────────────────────────────────

/**
 * Snaps a coordinate to a 0.25-pixel grid for hashing.
 * Marching Squares produces exact shared edge crossings, so snapping is only
 * needed as a hedge against floating-point edge cases.
 */
function ptKey(x: number, y: number): string {
  return `${Math.round(x * 4)},${Math.round(y * 4)}`;
}

/**
 * Stitches a flat list of Marching Squares segments into closed (or near-closed)
 * polylines by following the graph of shared endpoints.
 */
function stitchSegments(segments: MsSegment[]): ContourPoint[][] {
  const n = segments.length;
  if (n === 0) return [];

  // Build endpoint → [segment index, ...] adjacency map.
  const adjMap = new Map<string, number[]>();
  const addAdj = (key: string, idx: number) => {
    let list = adjMap.get(key);
    if (!list) { list = []; adjMap.set(key, list); }
    list.push(idx);
  };
  for (let i = 0; i < n; i++) {
    const s = segments[i];
    addAdj(ptKey(s.ax, s.ay), i);
    addAdj(ptKey(s.bx, s.by), i);
  }

  const used = new Uint8Array(n);
  const polylines: ContourPoint[][] = [];

  for (let start = 0; start < n; start++) {
    if (used[start]) continue;
    used[start] = 1;

    const s0 = segments[start];
    const pts: ContourPoint[] = [{ x: s0.ax, y: s0.ay }, { x: s0.bx, y: s0.by }];

    // Walk both directions from the seed segment. Marching-squares output is
    // an undirected graph; following only one endpoint can leave the other
    // half of a valid loop unstiched and make it look like an open fragment.
    for (;;) {
      const head = pts[pts.length - 1];
      const neighbors = adjMap.get(ptKey(head.x, head.y));
      if (!neighbors) break;
      let advanced = false;
      for (const ni of neighbors) {
        if (used[ni]) continue;
        used[ni] = 1;
        const ns = segments[ni];
        const headKey = ptKey(head.x, head.y);
        const fromA = ptKey(ns.ax, ns.ay) === headKey;
        pts.push({ x: fromA ? ns.bx : ns.ax, y: fromA ? ns.by : ns.ay });
        advanced = true;
        break;
      }
      if (!advanced) break;
    }

    for (;;) {
      const tail = pts[0];
      const neighbors = adjMap.get(ptKey(tail.x, tail.y));
      if (!neighbors) break;
      let advanced = false;
      for (const ni of neighbors) {
        if (used[ni]) continue;
        used[ni] = 1;
        const ns = segments[ni];
        const tailKey = ptKey(tail.x, tail.y);
        const fromA = ptKey(ns.ax, ns.ay) === tailKey;
        pts.unshift({ x: fromA ? ns.bx : ns.ax, y: fromA ? ns.by : ns.ay });
        advanced = true;
        break;
      }
      if (!advanced) break;
    }

    // Require at least 3 distinct points for a usable polygon.
    if (pts.length < 3) continue;

    // If the last point snaps to the first, close the loop cleanly.
    const first = pts[0], last = pts[pts.length - 1];
    const closeDistSq = (last.x - first.x) ** 2 + (last.y - first.y) ** 2;
    if (closeDistSq < 1.0) {
      pts[pts.length - 1] = { x: first.x, y: first.y };
    } else {
      continue;
    }

    polylines.push(pts);
  }

  return polylines;
}

// ── Public API ────────────────────────────────────────────────────────────────

/** Palette data needed for contour visual styling. */
export interface ContourPalette {
  lines: string[];
  indexLine: string;
}

/**
 * Computes and returns the complete merged-contour data for a wave's terrain.
 *
 * @param islands       Island descriptors (must include `profile`).
 * @param canvasW       Canvas width in pixels.
 * @param canvasH       Canvas height in pixels.
 * @param palette       Visual palette (colours for contour lines).
 * @param colorOffset   Per-wave colour cycling offset (integer).
 * @param seed          RNG seed for per-level line-width/alpha jitter.
 */
export function buildMergedContours(
  islands: FieldIsland[],
  canvasW: number,
  canvasH: number,
  palette: ContourPalette,
  colorOffset: number,
  seed: number,
): MergedTopographicContours {
  // ── Weighted centroid (weight = outerRadius²) ──────────────────────────
  let wSum = 0, cx = 0, cy = 0;
  for (const island of islands) {
    const w = island.outerRadius * island.outerRadius;
    cx += island.centerX * w;
    cy += island.centerY * w;
    wSum += w;
  }
  if (wSum > 0) { cx /= wSum; cy /= wSum; }

  if (islands.length === 0) {
    return { levels: [], solidBoundaries: [], centroidX: cx, centroidY: cy };
  }

  // ── Build scalar field once ────────────────────────────────────────────
  const { field, gridW, gridH } = buildField(islands, canvasW, canvasH);

  // ── Simple seeded random for visual jitter ─────────────────────────────
  let rngState = seed >>> 0;
  const rng = (): number => {
    rngState = (rngState + 0x6d2b79f5) >>> 0;
    let t = Math.imul(rngState ^ (rngState >>> 15), 1 | rngState);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  // ── Extract contours at each threshold ───────────────────────────────
  const levels: MergedTopographicContourLevel[] = [];

  for (let li = 0; li < CONTOUR_THRESHOLDS.length; li++) {
    const threshold = CONTOUR_THRESHOLDS[li];
    const segments = extractSegments(field, gridW, gridH, threshold);
    const polylines = stitchSegments(segments);

    // Visual style: index contour every 3rd level from the outermost.
    // li=0 is outermost.  li=2 is the first index contour (2, 5, 8, …).
    const isIndexContour = li % 3 === 2;
    const lineWidth = isIndexContour
      ? 1.2 + rng() * 0.3
      : 0.65 + rng() * 0.35;
    const alpha = isIndexContour
      ? 0.70 + rng() * 0.18
      : 0.42 + rng() * 0.28;
    const color = isIndexContour
      ? palette.indexLine
      : palette.lines[(li + colorOffset) % palette.lines.length];

    levels.push({ threshold, polylines, isIndexContour, lineWidth, alpha, color });
  }

  const solidBoundaries = levels.length > 0 ? levels[0].polylines : [];

  return { levels, solidBoundaries, centroidX: cx, centroidY: cy };
}
