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
 *   - Not yet wired into the nav grid.  Ridges are visual-only obstacles.
 *   - Follow-up task documented in nextSteps.md.
 *
 * Used by topographic-terrain.ts via the 'seafloorRidges' terrain kind.
 */

// ── Types ────────────────────────────────────────────────────────────────────

export interface SeafloorPoint { x: number; y: number; }

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
}

/** All ridge data generated for one wave.  Stored in TopographicTerrainState.seafloor. */
export interface SeafloorTerrainData {
  ridges: SeafloorRidge[];
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

    ridges.push({
      points,
      width,
      crestWidth,
      bodyColor:  _BODY_COLORS[bodyColorIdx],
      crestColor: _CREST_COLORS[crestColorIdx],
      bodyAlpha,
      crestAlpha,
    });
  }

  return { ridges };
}

// ── Rendering ─────────────────────────────────────────────────────────────────

/**
 * Renders all seafloor ridges onto the canvas.
 *
 * Draw order (called from renderTopographicTerrain):
 *   - Each ridge: wide body stroke first, then narrow crest highlight.
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
