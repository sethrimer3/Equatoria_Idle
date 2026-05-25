/**
 * seafloor-terrain.ts — Dedicated seafloor ridge/channel terrain for the Caustics RPG zone.
 *
 * Generates elongated, sinuous ridge structures that flow horizontally/diagonally
 * across the arena, resembling underwater seafloor terrain: ridges, sandbars,
 * erosion channels, and light-cut grooves.
 *
 * Visual design goals:
 *   - Multiple wide soft ridge bands instead of a central "mountain blob".
 *   - Low vertical height contrast; no sharp topographic peaks.
 *   - Dark seafloor body colours with subtle teal crest highlights, visually
 *     compatible with the caustics-overlay.ts animated light filaments.
 *   - Semi-transparent so enemies and player remain clearly readable.
 *
 * Collision/pathfinding:
 *   - Collision capsules are generated for 25–45% of each ridge's width;
 *     deliberate gaps ensure the arena is always traversable.
 *   - Capsule geometry stored in SeafloorTerrainData.allCollisionSegments and
 *     per-ridge SeafloorRidge.collisionSegments.
 *   - Wired into nav-grid via isPointInsideTopographicTerrain /
 *     circleIntersectsTopographicTerrain in topographic-terrain.ts.
 *
 * Used by topographic-terrain.ts via the 'seafloorRidges' terrain kind.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SeafloorPoint { x: number; y: number; }

/**
 * A capsule-shaped collision/nav-grid obstacle along a seafloor ridge crest.
 * Represents a "hard" stretch of raised seabed that blocks movement.
 *
 * Collision rule: a point is blocked if its distance to the segment
 * [x1,y1]→[x2,y2] is ≤ radius.
 */
export interface SeafloorCollisionSegment {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  /** Half-width of the capsule in logical pixels. */
  radius: number;
}

/**
 * One sinuous ridge/channel structure spanning the arena width.
 * Rendered as a thick soft body stroke plus a thin bright crest stroke.
 */
export interface SeafloorRidge {
  /** Centerline control points from the left edge to the right edge. */
  points: SeafloorPoint[];
  /** Stroke width of the wide ridge body (px, logical coords). */
  width: number;
  /** Stroke width of the narrow crest highlight. */
  crestWidth: number;
  /** CSS colour string for the ridge body. */
  bodyColor: string;
  /** CSS colour string for the ridge crest. */
  crestColor: string;
  /** Opacity for the body stroke (0–1). */
  bodyAlpha: number;
  /** Opacity for the crest stroke (0–1). */
  crestAlpha: number;
  /**
   * Capsule obstacles along this ridge's hard-crest sections.
   * 25–45% of the ridge width is blocked; deliberate gaps ensure the arena
   * remains traversable.  Indices refer to the span of `points` that are
   * blocked; the actual capsule geometry is stored here for collision queries.
   *
   * Empty when the ridge has no hard-collision sections (rarer ridge variant).
   */
  collisionSegments: SeafloorCollisionSegment[];
}

/** All ridge data generated for one wave.  Stored in TopographicTerrainState.seafloor. */
export interface SeafloorTerrainData {
  ridges: SeafloorRidge[];
  /** Flat list of all collision capsules across every ridge for fast iteration. */
  allCollisionSegments: SeafloorCollisionSegment[];
}

// ── Pre-baked colour palettes ─────────────────────────────────────────────────

/** Dark seafloor sediment / compressed-sand body tones. */
const _BODY_COLORS: readonly string[] = [
  '#1a2d38',   // deep ocean shadow blue
  '#162830',   // dark teal-shadow
  '#1e2c28',   // deep aqua-grey
  '#1a2618',   // dark sea-green
  '#222820',   // olive-teal shadow
  '#1a2022',   // slate-seafloor
];

/** Teal/cyan ridge crest highlights — thin, lighter centre of each ridge. */
const _CREST_COLORS: readonly string[] = [
  '#2a6878',   // medium teal
  '#1e7890',   // blue-teal
  '#2a8070',   // aqua-teal
  '#307878',   // teal-cyan
  '#206070',   // deep cyan-teal
  '#288070',   // sea-teal
];

// ── Generation ───────────────────────────────────────────────────────────────

/**
 * Generates deterministic seafloor ridge terrain for the given wave.
 *
 * The seed is derived exclusively from the wave number; canvas dimensions are
 * NOT folded into the seed so that terrain layout stays identical across
 * resizes and browser zoom levels.
 *
 * @param seed       Deterministic seed (derived externally from waveNumber).
 * @param canvasW    Logical canvas width in pixels (used for ridge span).
 * @param canvasH    Logical canvas height in pixels (used for vertical spread).
 */
export function generateSeafloorTerrain(
  seed: number,
  canvasW: number,
  canvasH: number,
): SeafloorTerrainData {
  const rng = _makeRng(seed);

  // 4–7 ridges distributed across the vertical arena space.
  const ridgeCount = 4 + Math.floor(rng() * 4);
  const ridges: SeafloorRidge[] = [];
  const allCollisionSegments: SeafloorCollisionSegment[] = [];

  for (let i = 0; i < ridgeCount; i++) {
    // Spread ridges evenly with minor per-ridge jitter, concentrating towards
    // the lower two-thirds of the arena (seafloor is at the bottom).
    const yFracBase = 0.10 + (i / ridgeCount) * 0.78;
    const yFracJitter = (rng() - 0.5) * 0.08;
    const yBase = canvasH * Math.max(0.05, Math.min(0.93, yFracBase + yFracJitter));

    // Subtle diagonal bias; keeps ridges mostly horizontal.
    const angleRad = (rng() - 0.5) * 0.22;

    // Two sine-wave components for sinuous, eroded contour appearance.
    const amp1    = canvasH * (0.018 + rng() * 0.032);
    const amp2    = canvasH * (0.008 + rng() * 0.016);
    const freq1   = 0.012 + rng() * 0.010;
    const freq2   = 0.022 + rng() * 0.018;
    const phase1  = rng() * Math.PI * 2;
    const phase2  = rng() * Math.PI * 2;

    // 16–24 segments give smooth curves without excessive vertex count.
    const segCount = 16 + Math.floor(rng() * 9);

    const points: SeafloorPoint[] = [];
    for (let s = 0; s <= segCount; s++) {
      const t = s / segCount;
      const x = t * canvasW;
      const yOff =
        amp1 * Math.sin(x * freq1 + phase1) +
        amp2 * Math.sin(x * freq2 + phase2);
      const y = yBase + yOff + x * Math.tan(angleRad);
      points.push({ x, y });
    }

    // Ridge body: wide, very soft.  Crest: narrow, slightly brighter.
    const width      = 7 + rng() * 18;
    const crestWidth = 0.8 + rng() * 1.6;
    const bodyAlpha  = 0.11 + rng() * 0.11;
    const crestAlpha = 0.07 + rng() * 0.09;

    const bodyColorIdx  = Math.floor(rng() * _BODY_COLORS.length);
    const crestColorIdx = Math.floor(rng() * _CREST_COLORS.length);

    // ── Generate collision capsules for hard-crest sections ───────────────
    // 25–45% of each ridge's length is blocked, in non-contiguous spans.
    // Deliberate gaps ensure no full-width barrier.
    const collisionSegments = _generateRidgeCollisionSegments(
      rng, points, width, canvasW,
    );
    for (const seg of collisionSegments) {
      allCollisionSegments.push(seg);
    }

    ridges.push({
      points,
      width,
      crestWidth,
      bodyColor:  _BODY_COLORS[bodyColorIdx],
      crestColor: _CREST_COLORS[crestColorIdx],
      bodyAlpha,
      crestAlpha,
      collisionSegments,
    });
  }

  return { ridges, allCollisionSegments };
}

// ── Collision segment generation ──────────────────────────────────────────────

/**
 * Minimum horizontal gap (px) that must remain open between blocked spans.
 * Ensures at least one clear channel exists across the full arena width.
 */
const _MIN_GAP_PX = 55;

/**
 * Generates blocked capsule segments for a single ridge.
 *
 * Design constraints:
 *  - Only 25–45% of the ridge's horizontal extent is blocked.
 *  - At least one gap of ≥ MIN_GAP_PX is left open — never a wall-to-wall barrier.
 *  - Collision radius is smaller than the visual body width, so the visible
 *    ridge looks wider than the actual hard obstacle.
 *  - Edge regions (leftmost 10% and rightmost 10% of arena) are never blocked
 *    so entities can always escape along the walls.
 */
function _generateRidgeCollisionSegments(
  rng: () => number,
  points: SeafloorPoint[],
  bodyWidth: number,
  canvasW: number,
): SeafloorCollisionSegment[] {
  if (points.length < 2) return [];

  // Capsule radius: tighter than the visual body so the ridge visually looks
  // wider than the hard obstacle, giving a "sandbar" rather than "brick wall" feel.
  const radius = Math.max(4, bodyWidth * 0.38);

  // Blocked fraction of the ridge: 25–45%.
  const blockedFrac = 0.25 + rng() * 0.20;

  // Number of blocked spans: 1–3.  More spans = more varied obstacle layout.
  const spanCount = 1 + Math.floor(rng() * 3);

  // Edge exclusion: never block within the leftmost/rightmost 10% of the arena.
  const edgeExclusion = canvasW * 0.10;
  // Arena's usable x range for blockage.
  const usableMin = edgeExclusion;
  const usableMax = canvasW - edgeExclusion;
  const usableWidth = usableMax - usableMin;
  if (usableWidth <= _MIN_GAP_PX * 2) return [];

  // Total blocked width budget.
  const totalBlockedPx = usableWidth * blockedFrac;
  // Per-span budget.
  const perSpanPx = totalBlockedPx / spanCount;

  const segments: SeafloorCollisionSegment[] = [];

  // Divide the usable range into `spanCount` slots; pick a random blocked sub-range
  // within each slot so spans don't overlap and gaps are forced.
  const slotWidth = usableWidth / spanCount;
  for (let s = 0; s < spanCount; s++) {
    const slotStart = usableMin + s * slotWidth;
    const slotEnd   = slotStart + slotWidth;

    // Blocked sub-range is at most perSpanPx wide; offset randomly within the slot
    // so there's always a gap before and after the blocked region.
    const maxStart = slotEnd - perSpanPx - _MIN_GAP_PX * 0.5;
    if (maxStart <= slotStart) continue;  // slot too narrow — skip this span

    const spanStart = slotStart + rng() * (maxStart - slotStart);
    const spanEnd   = spanStart + perSpanPx;

    // Walk the ridge points to extract the capsule from spanStart to spanEnd.
    const capsule = _ridgeCapsuleForXRange(points, spanStart, spanEnd);
    if (capsule) {
      segments.push({ ...capsule, radius });
    }
  }

  return segments;
}

/**
 * Extracts a single capsule (start point, end point) for the portion of a ridge
 * polyline between x-coordinates `xFrom` and `xTo`.
 *
 * Since ridge points are ordered left-to-right, we interpolate on the polyline
 * to find the world-space (x, y) at each x boundary.
 */
function _ridgeCapsuleForXRange(
  points: SeafloorPoint[],
  xFrom: number,
  xTo: number,
): { x1: number; y1: number; x2: number; y2: number } | null {
  const start = _sampleRidgeAtX(points, xFrom);
  const end   = _sampleRidgeAtX(points, xTo);
  if (!start || !end) return null;
  return { x1: start.x, y1: start.y, x2: end.x, y2: end.y };
}

/**
 * Samples the ridge polyline at a given x by linear interpolation between the
 * two nearest points bracketing that x.  Returns null if x is out of range.
 */
function _sampleRidgeAtX(points: SeafloorPoint[], x: number): SeafloorPoint | null {
  if (points.length < 2) return null;
  const first = points[0];
  const last  = points[points.length - 1];
  if (x < first.x || x > last.x) return null;

  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    if (x >= p0.x && x <= p1.x) {
      const denom = p1.x - p0.x;
      if (denom < 1e-8) return { x: p0.x, y: p0.y };
      const t = (x - p0.x) / denom;
      return { x, y: p0.y + t * (p1.y - p0.y) };
    }
  }
  return null;
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Renders all seafloor ridges onto the canvas.
 *
 * Draw order (called from renderTopographicTerrain):
 *   - Each ridge: wide body stroke first, then narrow crest highlight.
 *   - Blocked-crest sections receive a slightly brighter edge marker so the
 *     player can tell which parts of the ridge are hard obstacles.
 *   - Low-graphics mode halves ridge count and skips crest strokes.
 *
 * @param ctx       Canvas 2D rendering context.
 * @param data      SeafloorTerrainData produced by generateSeafloorTerrain.
 * @param growth01  Terrain growth animation progress (0 = invisible, 1 = fully visible).
 * @param lowGraphics  When true, render a simplified version.
 */
export function renderSeafloorTerrain(
  ctx: CanvasRenderingContext2D,
  data: SeafloorTerrainData,
  growth01: number,
  lowGraphics: boolean,
): void {
  if (growth01 <= 0) return;

  ctx.save();
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  // In low-graphics mode only render every other ridge, and skip crest strokes.
  const ridgesToDraw = lowGraphics
    ? data.ridges.filter((_, i) => i % 2 === 0)
    : data.ridges;

  for (const ridge of ridgesToDraw) {
    if (ridge.points.length < 2) continue;

    // ── Build the shared path ──
    ctx.beginPath();
    ctx.moveTo(ridge.points[0].x, ridge.points[0].y);
    for (let i = 1; i < ridge.points.length; i++) {
      ctx.lineTo(ridge.points[i].x, ridge.points[i].y);
    }

    // ── Wide body stroke ──
    ctx.globalAlpha = ridge.bodyAlpha * growth01;
    ctx.strokeStyle = ridge.bodyColor;
    ctx.lineWidth   = ridge.width;
    ctx.stroke();

    // ── Narrow crest highlight (skipped in low-graphics mode) ──
    if (!lowGraphics) {
      ctx.beginPath();
      ctx.moveTo(ridge.points[0].x, ridge.points[0].y);
      for (let i = 1; i < ridge.points.length; i++) {
        ctx.lineTo(ridge.points[i].x, ridge.points[i].y);
      }
      ctx.globalAlpha = ridge.crestAlpha * growth01;
      ctx.strokeStyle = ridge.crestColor;
      ctx.lineWidth   = ridge.crestWidth;
      ctx.stroke();
    }

    // ── Hard-crest collision markers ──────────────────────────────────────
    // Blocked capsule sections are drawn with a slightly brighter, harder edge
    // so players can read which parts of the ridge are solid obstacles.
    // The marker is a short thick stroke slightly wider than the visual body.
    if (ridge.collisionSegments.length > 0) {
      const markerAlpha = (lowGraphics ? 0.18 : 0.28) * growth01;
      ctx.globalAlpha = markerAlpha;
      // Use a lighter, more saturated version of the crest colour for markers.
      ctx.strokeStyle = ridge.crestColor;
      ctx.lineWidth   = ridge.width * 0.55;
      ctx.lineCap = 'butt';

      for (const seg of ridge.collisionSegments) {
        ctx.beginPath();
        ctx.moveTo(seg.x1, seg.y1);
        ctx.lineTo(seg.x2, seg.y2);
        ctx.stroke();
      }

      ctx.lineCap = 'round';
    }
  }

  ctx.restore();
}

// ── Helpers ──────────────────────────────────────────────────────────────────

/** Fast deterministic PRNG (mulberry32-style). */
function _makeRng(seed: number): () => number {
  let state = seed >>> 0;
  return (): number => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
