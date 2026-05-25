/**
 * caustics-overlay.ts — Animated underwater visual overlay for the Caustics RPG zone.
 *
 * Visual pipeline (drawn in this order by rpg-render-draw.ts):
 *   1. drawCausticsBackground()   — deep-water atmosphere + floor glow pool; before fluid/terrain
 *   2. drawCausticsFloorEffects() — caustic light network, shimmer bands, rising bubbles
 *
 * ── Caustic light network (build 148) ─────────────────────────────────────────
 *   22 closed organic loop cells drawn with globalCompositeOperation = 'lighter'.
 *   Each cell is a smooth 5-vertex closed Bézier polygon whose vertex radii oscillate
 *   independently, creating the morphing web of bright curves seen on the floor of an
 *   aquarium or a sunlit shallow seabed.
 *
 *   Physics: real caustics arise where a curved water surface refracts and focuses
 *   sunlight into a web of bright curves on the seafloor.  The bright regions are the
 *   caustic BOUNDARIES — where ray bundles converge.  Thin-stroked closed loops drawn
 *   with 'lighter' compositing reproduce this naturally: wherever loop edges overlap,
 *   light accumulates, creating authentic-looking bright hot-spots at intersection zones.
 *
 *   The entire light network drifts with a slow global sinusoidal oscillation that
 *   simulates the gentle rolling of the water surface above.  Each cell additionally
 *   has its own drift frequency and direction, so the pattern never repeats.
 *
 * No per-frame allocations: all parameters are baked into constant arrays.
 * _CVX / _CVY are module-level Float32Array vertex buffers reused each frame.
 *
 * Low-graphics mode: renders 11 cells (every other index) and skips shimmer bands.
 *
 * Draw order:
 *   drawCausticsBackground()   — after '#0a0a12' base fill, before fluid/terrain
 *   drawCausticsFloorEffects() — after terrain render, before enemies/player
 */

const _TWO_PI = Math.PI * 2;

// ── Caustic cell parameters ────────────────────────────────────────────────────

/**
 * Pre-baked data for the 22 caustic light cells.
 *
 * Row layout:
 *   [0] baseFracX  — base centre X as fraction of canvas width  (0–1)
 *   [1] baseFracY  — base centre Y as fraction of canvas height (0–1)
 *   [2] baseRadius — typical vertex radius in logical px
 *   [3] driftAmpX  — peak horizontal individual drift (px)
 *   [4] driftAmpY  — peak vertical individual drift (px)
 *   [5] driftFreqX — X-drift oscillation frequency (rad/s)
 *   [6] driftFreqY — Y-drift oscillation frequency (rad/s)
 *   [7] morphFreq  — vertex-radius morphing frequency (rad/s)
 *   [8] phaseOff   — initial phase scalar (0–1, mapped to 0–2π internally)
 *   [9] colorIdx   — index into _CELL_COLORS palette (0–3)
 *  [10] stretchY   — Y-axis shape scale (< 1 = wide/flat, > 1 = tall/narrow)
 */
const _CELL_DATA: readonly (readonly number[])[] = [
  // ── Surface zone  y 0.18–0.44 ── (lighter, sparser; caustics near water surface)
  [0.10, 0.22, 22, 20, 12, 0.110, 0.082, 0.170, 0.000, 2, 0.80],
  [0.33, 0.30, 26, 16, 16, 0.093, 0.110, 0.210, 0.190, 0, 1.20],
  [0.55, 0.26, 20, 22, 10, 0.120, 0.093, 0.195, 0.380, 3, 0.90],
  [0.76, 0.34, 24, 18, 14, 0.100, 0.105, 0.230, 0.570, 1, 1.10],
  [0.92, 0.42, 19, 14, 18, 0.082, 0.120, 0.162, 0.760, 2, 0.75],
  // ── Mid zone  y 0.44–0.68 ─────────────────────────────────────────────
  [0.05, 0.52, 30, 24, 14, 0.130, 0.072, 0.220, 0.050, 0, 1.00],
  [0.23, 0.59, 28, 18, 20, 0.092, 0.130, 0.182, 0.240, 3, 0.85],
  [0.42, 0.51, 24, 22, 12, 0.112, 0.100, 0.240, 0.430, 1, 1.25],
  [0.60, 0.63, 32, 16, 18, 0.100, 0.082, 0.200, 0.620, 2, 0.95],
  [0.78, 0.56, 22, 20, 16, 0.118, 0.112, 0.172, 0.810, 0, 1.15],
  [0.95, 0.60, 26, 14, 14, 0.082, 0.092, 0.210, 0.000, 3, 0.80],
  // ── Lower-mid zone  y 0.65–0.82 ───────────────────────────────────────
  [0.12, 0.72, 30, 20, 12, 0.102, 0.118, 0.230, 0.180, 1, 1.05],
  [0.30, 0.76, 26, 24, 16, 0.112, 0.092, 0.200, 0.360, 0, 0.90],
  [0.50, 0.70, 35, 18, 20, 0.092, 0.102, 0.250, 0.550, 2, 1.20],
  [0.68, 0.78, 22, 22, 14, 0.130, 0.082, 0.190, 0.730, 3, 0.85],
  [0.86, 0.73, 28, 16, 18, 0.082, 0.122, 0.172, 0.910, 1, 1.10],
  // ── Floor zone  y 0.82–0.97 ── (densest; most light pools on the seabed)
  [0.08, 0.89, 26, 18, 10, 0.110, 0.112, 0.240, 0.100, 2, 0.80],
  [0.27, 0.93, 32, 22, 14, 0.092, 0.082, 0.210, 0.290, 0, 1.00],
  [0.46, 0.87, 28, 16, 18, 0.120, 0.130, 0.182, 0.480, 3, 1.20],
  [0.65, 0.94, 20, 20, 12, 0.102, 0.102, 0.222, 0.670, 1, 0.90],
  [0.80, 0.89, 30, 14, 16, 0.082, 0.092, 0.200, 0.860, 0, 1.10],
  [0.95, 0.93, 24, 24, 10, 0.130, 0.120, 0.172, 0.040, 2, 0.85],
];

/**
 * Caustic light colour palette.
 * Pale and cool — filtered sunlight through water, not a coloured spotlight.
 */
const _CELL_COLORS: readonly string[] = [
  '#78dcd4',  // 0: aquamarine
  '#58c8f0',  // 1: sky-blue
  '#a0f0e0',  // 2: pale mint
  '#48d0f8',  // 3: cerulean
];

/** Number of cells drawn in each graphics tier. */
const _HIGH_CELL_COUNT = 22;
const _LOW_CELL_COUNT  = 11;   // odd-indexed cells are skipped in low-graphics mode

/**
 * Per-frame vertex position buffers for one cell (5 vertices × x and y).
 * Module-level reuse avoids any allocation in the hot draw loop.
 */
const _CVX = new Float32Array(5);
const _CVY = new Float32Array(5);

// ── Pre-baked bubble data (unchanged) ─────────────────────────────────────────

/**
 * Bubble parameter table.
 * Layout per row: [baseXFrac, periodSec, xWobbleAmpPx, xWobbleFreq, radiusPx, alphaBase, phaseOffset]
 */
const _BUBBLE_DATA: readonly (readonly number[])[] = [
  //  baseX  period  wobAmp  wobFreq  r    alpha  phase
  [   0.12,   8.3,   7.0,   0.90,   2.0,  0.20,  0.00 ],
  [   0.28,   6.7,   5.0,   1.10,   1.5,  0.22,  0.07 ],
  [   0.43,   9.1,   9.0,   0.70,   1.8,  0.16,  0.14 ],
  [   0.57,   7.4,   6.0,   1.30,   2.5,  0.21,  0.21 ],
  [   0.71,  10.2,   4.0,   0.80,   1.2,  0.24,  0.29 ],
  [   0.85,   6.0,   8.0,   1.50,   2.0,  0.19,  0.36 ],
  [   0.18,  11.5,   5.0,   0.60,   1.5,  0.15,  0.43 ],
  [   0.35,   8.8,   7.0,   1.00,   1.8,  0.20,  0.50 ],
  [   0.50,   7.2,   3.0,   1.20,   2.2,  0.22,  0.57 ],
  [   0.65,   9.6,   6.0,   0.90,   1.6,  0.18,  0.64 ],
  [   0.78,   6.5,   9.0,   1.40,   1.3,  0.23,  0.71 ],
  [   0.92,   8.0,   5.0,   0.80,   2.4,  0.17,  0.79 ],
  [   0.22,  10.8,   7.0,   1.10,   1.7,  0.21,  0.86 ],
  [   0.47,   7.9,   4.0,   1.30,   2.1,  0.19,  0.93 ],
];

const _HIGH_BUBBLE_COUNT = 14;
const _LOW_BUBBLE_COUNT  = 6;

const _SHIMMER_COLOR = '#6ad8e0';

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Draw the deep-water atmosphere tint + floor glow pool behind the battlefield.
 *
 * Call immediately after the initial background fill, before fluid and terrain,
 * so it sits at the very bottom of the visual stack.
 */
export function drawCausticsBackground(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  lowGraphics: boolean,
): void {
  canvas2d.save();

  // ── Main atmosphere gradient ──────────────────────────────────────────────
  // Near-black navy at the top (deep open water) transitioning to murky
  // seafloor teal at the bottom — the ground receives more scattered light.
  const atmoGrad = canvas2d.createLinearGradient(0, 0, 0, heightPx);
  atmoGrad.addColorStop(0,   '#010d1a');  // near-black navy (deep water column)
  atmoGrad.addColorStop(0.5, '#011e1e');  // dark teal (mid-water)
  atmoGrad.addColorStop(1,   '#023028');  // murky seafloor teal
  canvas2d.fillStyle = atmoGrad;
  canvas2d.globalAlpha = lowGraphics ? 0.30 : 0.40;
  canvas2d.fillRect(0, 0, widthPx, heightPx);

  // ── Floor glow pool (high-graphics only) ─────────────────────────────────
  // A soft warm-teal radial gradient pooled at the seabed, representing
  // diffuse ambient light that accumulates on a sandy/rocky substrate.
  if (!lowGraphics) {
    const poolGrad = canvas2d.createRadialGradient(
      widthPx * 0.5, heightPx,        0,
      widthPx * 0.5, heightPx * 0.88, widthPx * 0.70,
    );
    poolGrad.addColorStop(0,   'rgba(42, 170, 148, 0.13)');
    poolGrad.addColorStop(0.55, 'rgba(18, 105, 105, 0.05)');
    poolGrad.addColorStop(1,   'rgba(0,   0,   0,  0)');
    canvas2d.fillStyle = poolGrad;
    canvas2d.globalAlpha = 1;
    canvas2d.fillRect(0, heightPx * 0.68, widthPx, heightPx * 0.32);
  }

  canvas2d.restore();
}

/**
 * Draw animated caustic light network, shimmer bands, and rising bubble particles
 * on top of the terrain but below enemies and the player.
 *
 * Call after terrain rendering and before the first enemy draw call.
 */
export function drawCausticsFloorEffects(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  nowMs: number,
  lowGraphics: boolean,
): void {
  const tS = nowMs * 0.001;
  _drawCausticsLightNet(canvas2d, widthPx, heightPx, tS, lowGraphics);
  if (!lowGraphics) {
    _drawCausticsShimmer(canvas2d, widthPx, heightPx, tS);
  }
  _drawCausticsBubbles(canvas2d, widthPx, heightPx, tS, lowGraphics);
}

// ── Private helpers ───────────────────────────────────────────────────────────

/**
 * Draw the caustic light network.
 *
 * Each of the 22 pre-baked cells is rendered as a smooth closed 5-vertex
 * Bézier polygon (midpoint quadratic technique) with independently oscillating
 * vertex radii.  All cells are drawn with globalCompositeOperation = 'lighter'
 * so overlapping loop edges accumulate brightness — naturally producing the
 * bright hot-spots that appear wherever multiple refracted ray bundles converge
 * (the hallmark of real caustic light patterns).
 *
 * The whole pattern drifts with a very slow global sinusoidal motion that
 * simulates the water surface gently rolling above the arena.
 *
 * Draw details:
 *   lineWidth   1.4 px  — thin but visible; thicker would look like brush strokes
 *   alpha       0.055–0.090 per cell (+ gentle pulse) — conservative so
 *               overlapping regions brighten without washing out gameplay
 *   stretchY    pre-baked per cell — gives variety (flat sandbars, tall ridges)
 */
function _drawCausticsLightNet(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const cellCount = lowGraphics ? _LOW_CELL_COUNT : _HIGH_CELL_COUNT;
  const ANGLE_STEP = _TWO_PI / 5;

  // Very slow global drift — simulates the water surface undulating overhead.
  const globalDriftX = Math.sin(tS * 0.053) * 15;
  const globalDriftY = Math.cos(tS * 0.040) * 10;

  canvas2d.save();
  canvas2d.globalCompositeOperation = 'lighter';
  canvas2d.lineWidth = 1.4;
  canvas2d.lineCap   = 'round';
  canvas2d.lineJoin  = 'round';

  for (let ci = 0; ci < cellCount; ci++) {
    // In low-graphics mode render every other cell (even indices).
    const di = lowGraphics ? ci * 2 : ci;
    if (di >= _CELL_DATA.length) break;
    const row = _CELL_DATA[di];

    const baseFracX  = row[0];
    const baseFracY  = row[1];
    const baseRadius = row[2];
    const driftAmpX  = row[3];
    const driftAmpY  = row[4];
    const driftFreqX = row[5];
    const driftFreqY = row[6];
    const morphFreq  = row[7];
    const phaseOff   = row[8] * _TWO_PI;  // 0–1 → 0–2π
    const colorIdx   = row[9] | 0;
    const stretchY   = row[10];

    // Cell centre: base position + individual drift + global drift.
    const cx = baseFracX * widthPx
      + driftAmpX * Math.sin(tS * driftFreqX + phaseOff * 0.41)
      + globalDriftX;
    const cy = baseFracY * heightPx
      + driftAmpY * Math.cos(tS * driftFreqY + phaseOff * 0.37)
      + globalDriftY;

    // Gentle per-cell brightness pulse — makes each cell breathe independently.
    const brightPulse = 0.62 + 0.38 * Math.sin(tS * morphFreq * 0.44 + phaseOff);
    // Base alpha varies slightly per cell so no two cells look identical.
    const baseAlpha = 0.055 + (di % 4) * 0.008;
    canvas2d.globalAlpha = baseAlpha * brightPulse;
    canvas2d.strokeStyle = _CELL_COLORS[colorIdx];

    // Compute 5 vertex positions.
    // Each vertex oscillates at morphFreq with a per-vertex phase stagger so
    // the shape morphs organically rather than uniformly expanding/contracting.
    for (let vi = 0; vi < 5; vi++) {
      const r = baseRadius * (0.50 + 0.50 * Math.sin(
        tS * morphFreq + phaseOff + vi * ANGLE_STEP * 0.85,
      ));
      // Tiny angle bias from phaseOff adds per-cell rotational asymmetry.
      const angle = vi * ANGLE_STEP + phaseOff * 0.06;
      _CVX[vi] = cx + r * Math.cos(angle);
      _CVY[vi] = cy + r * Math.sin(angle) * stretchY;
    }

    // Draw smooth closed polygon using the midpoint quadratic Bézier technique.
    // Each original vertex is used as a control point; the on-curve points are
    // the midpoints between adjacent vertices.  This always produces a smooth
    // closed shape regardless of vertex positions.
    canvas2d.beginPath();
    canvas2d.moveTo(
      (_CVX[4] + _CVX[0]) * 0.5,
      (_CVY[4] + _CVY[0]) * 0.5,
    );
    for (let vi = 0; vi < 5; vi++) {
      const ni = (vi + 1) % 5;
      canvas2d.quadraticCurveTo(
        _CVX[vi], _CVY[vi],
        (_CVX[vi] + _CVX[ni]) * 0.5,
        (_CVY[vi] + _CVY[ni]) * 0.5,
      );
    }
    canvas2d.closePath();
    canvas2d.stroke();
  }

  canvas2d.restore();
}

/**
 * Draw faint horizontal shimmer bands simulating light ripples on the water
 * surface seen from below.  High-graphics only.
 *
 * Slightly more pronounced than earlier builds so the shimmer is visible
 * against the brighter caustic backdrop.
 */
function _drawCausticsShimmer(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  const bandCount = 5;
  canvas2d.save();
  canvas2d.strokeStyle = _SHIMMER_COLOR;
  canvas2d.lineWidth = 1.1;

  for (let b = 0; b < bandCount; b++) {
    const yBase = heightPx * (0.06 + b * 0.065);
    const alpha = 0.018 + 0.010 * Math.sin(tS * 0.55 + b * 1.5708);
    canvas2d.globalAlpha = alpha;

    canvas2d.beginPath();
    canvas2d.moveTo(0, yBase);
    for (let x = 8; x <= widthPx; x += 8) {
      const y = yBase + 2.8 * Math.sin(x * 0.068 + tS * (0.68 + b * 0.17));
      canvas2d.lineTo(x, y);
    }
    canvas2d.stroke();
  }

  canvas2d.restore();
}

/**
 * Draw sparse rising bubble particles.  Each bubble cycles continuously from
 * the bottom of the arena to the top with a gentle horizontal wobble.
 * All parameters are pre-baked — no per-frame allocations.
 */
function _drawCausticsBubbles(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const bubbleCount = lowGraphics ? _LOW_BUBBLE_COUNT : _HIGH_BUBBLE_COUNT;
  canvas2d.save();
  canvas2d.strokeStyle = 'rgba(160, 230, 255, 0.85)';
  canvas2d.lineWidth = 0.6;

  for (let i = 0; i < bubbleCount; i++) {
    const row       = _BUBBLE_DATA[i];
    const baseXFrac = row[0];
    const period    = row[1];
    const wobAmp    = row[2];
    const wobFreq   = row[3];
    const radius    = row[4];
    const alphaBase = row[5];
    const phaseOff  = row[6];

    // phase 0 = just appeared at bottom; phase 1 = reached top
    const phase = ((tS / period) + phaseOff) % 1.0;

    const y = heightPx * (1.0 - phase);
    const x = widthPx * baseXFrac + wobAmp * Math.sin(tS * wobFreq + phaseOff * 6.283);

    // Fade in from bottom and fade out near the top
    const fadeEdge = Math.min(phase * 8.0, (1.0 - phase) * 6.0, 1.0);
    const alpha = alphaBase * fadeEdge;

    canvas2d.globalAlpha = alpha;
    canvas2d.beginPath();
    canvas2d.arc(x, y, radius, 0, Math.PI * 2);
    canvas2d.stroke();
  }

  canvas2d.restore();
}
