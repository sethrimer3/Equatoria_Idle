/**
 * impetus-overlay.ts — Animated space/gravity visual overlay for the Impetus RPG zone.
 *
 * Renders when activeZoneId === 'impetus':
 *   1. Background starfield with parallax-feeling layers, twinkle, and faint nebula haze
 *   2. Gravity well visualizations: orbital ring distortions and lensing arcs
 *   3. Visual asteroid drift field (decorative only — no collision)
 *
 * Design principles:
 *   - No per-frame object allocations: all star/asteroid parameters are pre-baked.
 *   - All visuals are time-based and fully deterministic.
 *   - Low-graphics mode reduces layer count and skips nebula/glow effects.
 *   - Gravity wells are visual-only for now; gameplay force-field integration
 *     is deferred (see nextSteps.md).
 *
 * Draw order expected by rpg-render-draw.ts:
 *   drawImpetusBackground()    — after the initial background fill, before fluid/terrain
 *   drawImpetusFloorEffects()  — after terrain rendering (currently null for Impetus),
 *                                before enemies/player
 */

// ── Pre-baked star data (no per-frame allocations) ────────────────────────────

/**
 * Star parameter table. One entry per star.
 * Layout: [xFrac, yFrac, radius, alphaPeak, twinklePeriod, twinklePhase, layer]
 * layer 0 = faint distant stars (smallest, slowest twinkle)
 * layer 1 = mid stars
 * layer 2 = bright near stars (largest, faster twinkle)
 */
const _STAR_DATA: readonly (readonly number[])[] = [
  // layer 0 (distant)
  [ 0.05, 0.08, 0.6, 0.35, 6.2, 0.00, 0 ], [ 0.12, 0.22, 0.5, 0.28, 7.1, 0.18, 0 ],
  [ 0.19, 0.41, 0.7, 0.32, 5.8, 0.36, 0 ], [ 0.28, 0.15, 0.6, 0.30, 8.3, 0.54, 0 ],
  [ 0.34, 0.62, 0.5, 0.27, 6.7, 0.72, 0 ], [ 0.41, 0.33, 0.6, 0.33, 7.5, 0.90, 0 ],
  [ 0.48, 0.78, 0.7, 0.31, 5.4, 0.08, 0 ], [ 0.55, 0.11, 0.5, 0.29, 9.1, 0.26, 0 ],
  [ 0.62, 0.52, 0.6, 0.34, 6.0, 0.44, 0 ], [ 0.68, 0.27, 0.7, 0.28, 7.8, 0.62, 0 ],
  [ 0.74, 0.65, 0.5, 0.31, 5.9, 0.80, 0 ], [ 0.81, 0.18, 0.6, 0.33, 8.6, 0.98, 0 ],
  [ 0.87, 0.44, 0.7, 0.29, 6.3, 0.16, 0 ], [ 0.93, 0.71, 0.5, 0.27, 7.2, 0.34, 0 ],
  [ 0.03, 0.55, 0.6, 0.32, 5.7, 0.52, 0 ], [ 0.09, 0.86, 0.7, 0.30, 8.0, 0.70, 0 ],
  [ 0.22, 0.73, 0.5, 0.28, 6.5, 0.88, 0 ], [ 0.37, 0.91, 0.6, 0.35, 7.4, 0.06, 0 ],
  [ 0.51, 0.46, 0.7, 0.31, 5.6, 0.24, 0 ], [ 0.76, 0.83, 0.5, 0.29, 9.0, 0.42, 0 ],
  // layer 1 (mid)
  [ 0.07, 0.31, 0.9, 0.48, 4.8, 0.05, 1 ], [ 0.16, 0.58, 1.0, 0.52, 5.3, 0.22, 1 ],
  [ 0.25, 0.84, 0.8, 0.45, 4.1, 0.39, 1 ], [ 0.33, 0.07, 1.1, 0.55, 5.9, 0.57, 1 ],
  [ 0.42, 0.47, 0.9, 0.50, 4.5, 0.74, 1 ], [ 0.50, 0.23, 1.0, 0.48, 6.2, 0.92, 1 ],
  [ 0.58, 0.69, 0.8, 0.46, 4.7, 0.10, 1 ], [ 0.66, 0.40, 1.1, 0.53, 5.1, 0.28, 1 ],
  [ 0.73, 0.14, 0.9, 0.49, 4.3, 0.46, 1 ], [ 0.80, 0.57, 1.0, 0.51, 6.0, 0.64, 1 ],
  [ 0.88, 0.82, 0.8, 0.47, 4.9, 0.82, 1 ], [ 0.95, 0.35, 1.1, 0.54, 5.5, 0.00, 1 ],
  // layer 2 (near/bright)
  [ 0.11, 0.48, 1.4, 0.72, 3.5, 0.10, 2 ], [ 0.23, 0.19, 1.6, 0.80, 4.0, 0.33, 2 ],
  [ 0.38, 0.76, 1.3, 0.68, 3.2, 0.56, 2 ], [ 0.54, 0.38, 1.5, 0.75, 3.8, 0.79, 2 ],
  [ 0.69, 0.61, 1.4, 0.71, 3.0, 0.02, 2 ], [ 0.84, 0.25, 1.6, 0.78, 4.2, 0.25, 2 ],
  [ 0.31, 0.92, 1.3, 0.69, 3.6, 0.48, 2 ], [ 0.77, 0.05, 1.5, 0.74, 3.1, 0.71, 2 ],
];

/**
 * Gravity well parameter table.
 * Layout: [xFrac, yFrac, outerRadius, innerRadius, ringAlpha, swirl1Phase, swirl2Phase]
 */
const _WELL_DATA: readonly (readonly number[])[] = [
  [ 0.22, 0.35, 38, 12, 0.28, 0.00, 1.57 ],
  [ 0.72, 0.60, 44, 15, 0.24, 2.09, 3.66 ],
  [ 0.48, 0.80, 32, 10, 0.22, 4.19, 0.52 ],
];

/**
 * Asteroid parameter table.
 * Layout: [xFrac, yFrac, driftXSign, driftYSign, driftSpeedFrac, size, rotRate, alpha, phase]
 */
const _ASTEROID_DATA: readonly (readonly number[])[] = [
  [ 0.10, 0.20, 1,  0.3, 0.018, 6, 0.40, 0.60, 0.00 ],
  [ 0.33, 0.55, -1, 0.5, 0.012, 9, 0.25, 0.55, 0.14 ],
  [ 0.60, 0.15, 0.5, 1, 0.015, 7, 0.35, 0.58, 0.27 ],
  [ 0.80, 0.70, -0.7, -1, 0.010, 11, 0.20, 0.52, 0.41 ],
  [ 0.45, 0.40, 1, -0.4, 0.020, 5, 0.50, 0.62, 0.55 ],
  [ 0.15, 0.85, 0.8, 0.6, 0.013, 8, 0.30, 0.57, 0.68 ],
  [ 0.90, 0.30, -1, 0.2, 0.016, 6, 0.45, 0.59, 0.82 ],
];

// Asteroid shape offsets (irregular polygon)
const _ASTER_ANGLES = [0, 0.90, 1.65, 2.50, 3.35, 4.20, 5.10];
const _ASTER_RADII  = [1.00, 0.75, 0.90, 0.68, 0.85, 0.78, 0.92];

// ── Visual constants ──────────────────────────────────────────────────────────

const _STAR_COLORS: readonly string[] = ['#ffffff', '#e8f0ff', '#fffde8', '#f8f0ff'];
const _WELL_RING_COLOR = '#8855ff';
const _WELL_SWIRL_COLOR = '#aa77ff';
const _WELL_RING_COLOR_LOW = '#aa66ff';  // slightly brighter for low-graphics contrast
const _ASTEROID_FILL = '#4a4050';
const _ASTEROID_EDGE = '#7a6880';

const _BG_ALPHA_HIGH = 0.55;
const _BG_ALPHA_LOW  = 0.50;  // raised from 0.38 — more visible on mobile

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns a short diagnostic string describing the current Impetus rendering
 * mode.  Used by the dev overlay in rpg-render-draw.ts.
 */
export function getImpetusDevLine(lowGraphics: boolean): string {
  return [
    `impetusBg: true`,
    `stars: ${lowGraphics ? 'low' : 'high'}`,
    `gravityWells: ${lowGraphics ? 'low' : 'high'}`,
    `asteroids: ${lowGraphics ? 'low' : 'high'}`,
  ].join(' | ');
}

/**
 * Draw the space background tint, starfield, and nebula haze.
 * Call immediately after the initial background fill, before fluid and terrain.
 */
export function drawImpetusBackground(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  nowMs: number,
  lowGraphics: boolean,
): void {
  const tS = nowMs * 0.001;

  // Deep space gradient
  canvas2d.save();
  const grad = canvas2d.createLinearGradient(0, 0, widthPx, heightPx);
  grad.addColorStop(0, '#06041a');
  grad.addColorStop(1, '#0a0620');
  canvas2d.fillStyle = grad;
  canvas2d.globalAlpha = lowGraphics ? _BG_ALPHA_LOW : _BG_ALPHA_HIGH;
  canvas2d.fillRect(0, 0, widthPx, heightPx);
  canvas2d.restore();

  if (!lowGraphics) {
    _drawNebula(canvas2d, widthPx, heightPx, tS);
  }
  _drawStarfield(canvas2d, widthPx, heightPx, tS, lowGraphics);
}

/**
 * Draw gravity wells and drifting asteroid visuals above terrain, below enemies.
 * Call after terrain rendering (which is null for Impetus) and before enemies.
 */
export function drawImpetusFloorEffects(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  nowMs: number,
  lowGraphics: boolean,
): void {
  const tS = nowMs * 0.001;
  _drawAsteroidField(canvas2d, widthPx, heightPx, tS, lowGraphics);
  // Gravity wells render in both modes; low graphics uses a simplified version.
  if (lowGraphics) {
    _drawGravityWellsSimple(canvas2d, widthPx, heightPx, tS);
  } else {
    _drawGravityWells(canvas2d, widthPx, heightPx, tS);
  }
}

// ── Private helpers ───────────────────────────────────────────────────────────

/** Faint nebula haze — two large radial gradients with very low alpha. */
function _drawNebula(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  canvas2d.save();
  // Slow drift
  const dx = Math.sin(tS * 0.04) * widthPx * 0.04;
  const dy = Math.cos(tS * 0.03) * heightPx * 0.03;

  const cx = widthPx * 0.35 + dx;
  const cy = heightPx * 0.40 + dy;
  const r = Math.max(widthPx, heightPx) * 0.55;

  const nbGrad = canvas2d.createRadialGradient(cx, cy, 0, cx, cy, r);
  nbGrad.addColorStop(0, 'rgba(40, 10, 80, 0.08)');
  nbGrad.addColorStop(0.5, 'rgba(20, 5, 50, 0.04)');
  nbGrad.addColorStop(1, 'rgba(0,0,0,0)');

  canvas2d.globalAlpha = 1;
  canvas2d.fillStyle = nbGrad;
  canvas2d.fillRect(0, 0, widthPx, heightPx);
  canvas2d.restore();
}

/** Draw all pre-baked stars with twinkle animation. */
function _drawStarfield(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  // In low-graphics mode, only draw layers 0 and 1 (skip bright layer 2 count-heavy)
  const maxLayer = lowGraphics ? 1 : 2;
  // Boost alpha in low graphics so stars are visible on mobile screens
  const alphaBoost = lowGraphics ? 1.4 : 1.0;
  canvas2d.save();
  for (const row of _STAR_DATA) {
    const layer = row[6];
    if (layer > maxLayer) continue;
    const x       = row[0] * widthPx;
    const y       = row[1] * heightPx;
    const radius  = row[2];
    const aPeak   = row[3];
    const period  = row[4];
    const phase   = row[5];
    const twinkle = 0.5 + 0.5 * Math.sin(tS / period * Math.PI * 2 + phase * Math.PI * 2);
    const alpha   = Math.min(1, aPeak * (0.5 + 0.5 * twinkle) * alphaBoost);

    canvas2d.globalAlpha = alpha;
    canvas2d.fillStyle = _STAR_COLORS[Math.floor(row[0] * _STAR_COLORS.length) % _STAR_COLORS.length];
    canvas2d.beginPath();
    canvas2d.arc(x, y, radius, 0, Math.PI * 2);
    canvas2d.fill();

    // Bright stars get a small glow cross (high-graphics layer 2 only)
    if (!lowGraphics && layer === 2 && alpha > 0.55) {
      canvas2d.globalAlpha = alpha * 0.25;
      canvas2d.strokeStyle = canvas2d.fillStyle;
      canvas2d.lineWidth = 0.5;
      canvas2d.beginPath();
      canvas2d.moveTo(x - radius * 2.5, y);
      canvas2d.lineTo(x + radius * 2.5, y);
      canvas2d.moveTo(x, y - radius * 2.5);
      canvas2d.lineTo(x, y + radius * 2.5);
      canvas2d.stroke();
    }
  }
  canvas2d.restore();
}

/** Draw gravity well ring distortions and swirl arcs. */
function _drawGravityWells(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  canvas2d.save();
  for (const row of _WELL_DATA) {
    const cx    = row[0] * widthPx;
    const cy    = row[1] * heightPx;
    const outerR = row[2];
    const innerR = row[3];
    const rAlpha = row[4];
    const s1Ph   = row[5];
    const s2Ph   = row[6];

    // Slow rotation
    const rotOffset = tS * 0.18;

    // Outer distortion ring — slightly pulsing
    const pulse = 0.7 + 0.3 * Math.sin(tS * 0.8 + s1Ph);
    canvas2d.globalAlpha = rAlpha * pulse;
    canvas2d.strokeStyle = _WELL_RING_COLOR;
    canvas2d.lineWidth = 1.0;
    canvas2d.beginPath();
    canvas2d.arc(cx, cy, outerR * pulse, 0, Math.PI * 2);
    canvas2d.stroke();

    // Second inner ring
    canvas2d.globalAlpha = rAlpha * 0.6 * pulse;
    canvas2d.lineWidth = 0.7;
    canvas2d.beginPath();
    canvas2d.arc(cx, cy, outerR * 0.65 * pulse, 0, Math.PI * 2);
    canvas2d.stroke();

    // Swirl arcs — two slow-rotating partial arcs
    canvas2d.globalAlpha = rAlpha * 0.5 * pulse;
    canvas2d.strokeStyle = _WELL_SWIRL_COLOR;
    canvas2d.lineWidth = 0.8;
    for (let arc = 0; arc < 2; arc++) {
      const startAngle = rotOffset + (arc === 0 ? s1Ph : s2Ph);
      const arcSpan = Math.PI * 0.6;
      canvas2d.beginPath();
      canvas2d.arc(cx, cy, outerR * 0.82, startAngle, startAngle + arcSpan);
      canvas2d.stroke();
    }

    // Dark central void
    canvas2d.globalAlpha = 0.55;
    const voidGrad = canvas2d.createRadialGradient(cx, cy, 0, cx, cy, innerR);
    voidGrad.addColorStop(0, 'rgba(20,0,40,0.8)');
    voidGrad.addColorStop(1, 'rgba(20,0,40,0)');
    canvas2d.fillStyle = voidGrad;
    canvas2d.beginPath();
    canvas2d.arc(cx, cy, innerR, 0, Math.PI * 2);
    canvas2d.fill();
  }
  canvas2d.restore();
}

/**
 * Cheap low-graphics gravity well renderer.
 * Draws one bright ring and a dark center per well — no gradients or arcs.
 */
function _drawGravityWellsSimple(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  canvas2d.save();
  for (const row of _WELL_DATA) {
    const cx    = row[0] * widthPx;
    const cy    = row[1] * heightPx;
    const outerR = row[2];
    const innerR = row[3];
    const rAlpha = row[4];
    const s1Ph   = row[5];

    const pulse = 0.75 + 0.25 * Math.sin(tS * 0.8 + s1Ph);

    // Outer ring — single, more opaque than high-graphics for visibility
    canvas2d.globalAlpha = Math.min(1, rAlpha * 1.5 * pulse);
    canvas2d.strokeStyle = _WELL_RING_COLOR_LOW;
    canvas2d.lineWidth = 1.5;
    canvas2d.beginPath();
    canvas2d.arc(cx, cy, outerR * pulse, 0, Math.PI * 2);
    canvas2d.stroke();

    // Inner ring for depth
    canvas2d.globalAlpha = Math.min(1, rAlpha * pulse);
    canvas2d.lineWidth = 1.0;
    canvas2d.beginPath();
    canvas2d.arc(cx, cy, outerR * 0.6 * pulse, 0, Math.PI * 2);
    canvas2d.stroke();

    // Solid dark center dot — cheap, no gradient
    canvas2d.globalAlpha = 0.65;
    canvas2d.fillStyle = '#100020';
    canvas2d.beginPath();
    canvas2d.arc(cx, cy, innerR, 0, Math.PI * 2);
    canvas2d.fill();
  }
  canvas2d.restore();
}

/** Draw visual asteroid drift field — purely decorative, no collision. */
function _drawAsteroidField(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const count = lowGraphics ? Math.floor(_ASTEROID_DATA.length * 0.5) : _ASTEROID_DATA.length;
  canvas2d.save();

  for (let i = 0; i < count; i++) {
    const row        = _ASTEROID_DATA[i];
    const bXF        = row[0];
    const bYF        = row[1];
    const dXS        = row[2];
    const dYS        = row[3];
    const speed      = row[4];
    const size       = row[5];
    const rotRate    = row[6];
    const alpha      = row[7];
    const phase      = row[8];

    // Loop drift: position cycles within full-canvas range
    const driftT = (tS * speed + phase) % 1.0;
    const loopX  = (bXF + dXS * driftT + 2.0) % 1.2 - 0.1;
    const loopY  = (bYF + dYS * driftT + 2.0) % 1.2 - 0.1;
    const ax     = loopX * widthPx;
    const ay     = loopY * heightPx;

    const rotation = tS * rotRate;

    canvas2d.save();
    canvas2d.translate(ax, ay);
    canvas2d.rotate(rotation);
    canvas2d.globalAlpha = alpha;

    // Main body
    canvas2d.fillStyle = _ASTEROID_FILL;
    canvas2d.beginPath();
    for (let v = 0; v < _ASTER_ANGLES.length; v++) {
      const a  = _ASTER_ANGLES[v];
      const r  = size * _ASTER_RADII[v];
      const vx = Math.cos(a) * r;
      const vy = Math.sin(a) * r;
      if (v === 0) canvas2d.moveTo(vx, vy);
      else canvas2d.lineTo(vx, vy);
    }
    canvas2d.closePath();
    canvas2d.fill();

    // Bright edge highlight
    if (!lowGraphics) {
      canvas2d.globalAlpha = alpha * 0.55;
      canvas2d.strokeStyle = _ASTEROID_EDGE;
      canvas2d.lineWidth = 0.6;
      canvas2d.stroke();
    }

    canvas2d.restore();
  }

  canvas2d.restore();
}
