/**
 * impetus-overlay.ts — Animated space/gravity visual overlay for the Impetus RPG zone.
 *
 * Renders when activeZoneId === 'impetus':
 *   1. Background starfield with parallax-feeling layers, twinkle, and faint nebula haze
 *   2. Gravity well visualizations: orbital ring distortions and lensing arcs
 *   3. Visual asteroid drift field (decorative only — no collision)
 *
 * Performance architecture (optimised 2024):
 *   - Gravity well blur arcs are rendered to a small DPR-independent offscreen
 *     canvas (_wellCanvas, 35 % of world-space size).  The main canvas never sets
 *     canvas2d.filter, eliminating the DPR² blur cost (up to 1000× cheaper on
 *     high-DPI devices).
 *   - The shadow buffer is always offscreen (45 % / 35 % world-space for hi/lo
 *     quality) and throttled to ~18 FPS; gameplay stays at 60 FPS.
 *   - When soft shadows are enabled the blur is pre-baked into the shadow canvas,
 *     not applied on the main canvas.
 *   - Both _FX_WELL_SCALE and _FX_SHADOW_SCALE_* are world-space fractions
 *     completely decoupled from devicePixelRatio.
 *   - Timing: getImpetusLightDrawMs() / getImpetusShadowDrawMs() for dev overlay.
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
const _WELL_SWIRL_COLOR = '#aa77ff';
const _WELL_FIELD_ALPHA = 0.12;
const _WELL_RING_ALPHA  = 0.16;
const _WELL_BLUR_PX     = 7;
const _ASTEROID_FILL    = '#4a4050';
const _ASTEROID_EDGE    = '#7a6880';

// Sun position as a fraction of canvas — upper-right, partially offscreen
const _SUN_X_FRAC     = 1.08;
const _SUN_Y_FRAC     = -0.06;
// Geometry for hard-edge asteroid shadow quads
const _SHADOW_LENGTH  = 2200;
// Softened shadow blur radius (world-space px apparent at full size after upscale)
const _SOFT_SHADOW_BLUR_PX = 10;

const _BG_ALPHA_HIGH = 0.55;
const _BG_ALPHA_LOW  = 0.50;

// ── FX resolution scales (world-space fractions, DPR-independent) ─────────────
// The main canvas transform already encodes DPR (scale * dpr).  Offscreen
// canvases sized by these fractions are pure world-space pixels, so high-DPI
// incurs no extra cost for the lighting and shadow passes.
//
// Quality tiers (mapped from lowGraphics):
//   high  (lowGraphics=false): _FX_WELL_SCALE + _FX_SHADOW_SCALE_HI, ~18 FPS shadow
//   low   (lowGraphics=true):  no well-arc canvas, _FX_SHADOW_SCALE_LO, ~18 FPS shadow
const _FX_WELL_SCALE        = 0.35;  // well-arc blur offscreen canvas
const _FX_SHADOW_SCALE_HI   = 0.45;  // shadow buffer, high quality
const _FX_SHADOW_SCALE_LO   = 0.35;  // shadow buffer, low-graphics
const _FX_SHADOW_INTERVAL   = 56;    // shadow throttle ms (~18 FPS)

// ── Offscreen: gravity well blur arcs ────────────────────────────────────────
// Blur is applied on this small canvas (35 % of world size).
// Main canvas never sets canvas2d.filter → eliminates DPR² blur cost.
let _wellCanvas: HTMLCanvasElement | null = null;
let _wellCtx: CanvasRenderingContext2D | null = null;
let _wellCanvasW = -1;
let _wellCanvasH = -1;

// ── Offscreen: shadow buffer (always active, throttled to ~18 FPS) ────────────
// When softened, blur is pre-baked here — NOT applied to the main canvas.
let _shadowCanvas: HTMLCanvasElement | null = null;
let _shadowCtx: CanvasRenderingContext2D | null = null;
let _shadowLastMs = -Infinity;

// ── Cached sun corona gradients ────────────────────────────────────────────────
// Recreated only when canvas dimensions change.
let _coronaCacheW   = -1;
let _coronaCacheH   = -1;
let _coronaCacheLow = false;
let _cachedCorona:     CanvasGradient | null = null;
let _cachedCoronaCore: CanvasGradient | null = null;

// ── Cached background gradient ────────────────────────────────────────────────
// Deep-space linear gradient — colours are constant; recreate only on resize.
let _bgGradient: CanvasGradient | null = null;
let _bgGradW    = -1;
let _bgGradH    = -1;

// ── Dev timing telemetry ──────────────────────────────────────────────────────
let _shadowDrawMs = 0;
let _lightDrawMs  = 0;

/** Wall-clock ms the gravity-well light pass took last frame (dev overlay). */
export function getImpetusLightDrawMs(): number { return _lightDrawMs; }
/** Wall-clock ms the shadow buffer pass took last frame (dev overlay). */
export function getImpetusShadowDrawMs(): number { return _shadowDrawMs; }

// ── Public API ────────────────────────────────────────────────────────────────

/**
 * Returns obstacle circles for the static base positions of all asteroids.
 * Call this once when building the Impetus nav grid.
 */
export function getImpetusAsteroidObstacles(
  widthPx: number,
  heightPx: number,
): ReadonlyArray<{ x: number; y: number; radiusPx: number }> {
  return _ASTEROID_DATA.map((row) => ({
    x: row[0] * widthPx,
    y: row[1] * heightPx,
    radiusPx: row[5] * 2.5,
  }));
}

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
    `wellMs: ${_lightDrawMs.toFixed(1)}`,
    `shadowMs: ${_shadowDrawMs.toFixed(1)}`,
  ].join(' | ');
}

/**
 * Draw warm ambient sunlight from the upper-right offscreen sun.
 * Call after drawImpetusBackground(), before floor effects.
 */
export function drawImpetusSunLight(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  lowGraphics: boolean,
): void {
  const sunX = _SUN_X_FRAC * widthPx;
  const sunY = _SUN_Y_FRAC * heightPx;

  // Rebuild cached gradients only when canvas size or graphics tier changes.
  if (_coronaCacheW !== widthPx || _coronaCacheH !== heightPx || _coronaCacheLow !== lowGraphics) {
    _coronaCacheW   = widthPx;
    _coronaCacheH   = heightPx;
    _coronaCacheLow = lowGraphics;
    const coronaR = Math.max(widthPx, heightPx) * (lowGraphics ? 1.1 : 1.35);
    const corona = canvas2d.createRadialGradient(sunX, sunY, 0, sunX, sunY, coronaR);
    corona.addColorStop(0.00, 'rgba(255,192,96,0.18)');
    corona.addColorStop(0.25, 'rgba(255,166,70,0.10)');
    corona.addColorStop(0.55, 'rgba(255,140,56,0.05)');
    corona.addColorStop(1.00, 'rgba(255,120,40,0)');
    _cachedCorona = corona;
    if (!lowGraphics) {
      const coreR = Math.max(widthPx, heightPx) * 0.38;
      const core = canvas2d.createRadialGradient(sunX, sunY, 0, sunX, sunY, coreR);
      core.addColorStop(0.00, 'rgba(255,220,140,0.22)');
      core.addColorStop(0.40, 'rgba(255,180,80,0.08)');
      core.addColorStop(1.00, 'rgba(255,160,60,0)');
      _cachedCoronaCore = core;
    } else {
      _cachedCoronaCore = null;
    }
  }

  canvas2d.save();
  canvas2d.globalAlpha = 1;
  canvas2d.fillStyle = _cachedCorona!;
  canvas2d.fillRect(0, 0, widthPx, heightPx);
  canvas2d.restore();

  if (!lowGraphics && _cachedCoronaCore) {
    canvas2d.save();
    canvas2d.globalAlpha = 1;
    canvas2d.fillStyle = _cachedCoronaCore;
    canvas2d.fillRect(0, 0, widthPx, heightPx);
    canvas2d.restore();
  }
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

  // Cache the deep-space linear gradient — colours are constant, recreate on resize only.
  if (_bgGradW !== widthPx || _bgGradH !== heightPx) {
    _bgGradW    = widthPx;
    _bgGradH    = heightPx;
    _bgGradient = canvas2d.createLinearGradient(0, 0, widthPx, heightPx);
    _bgGradient.addColorStop(0, '#06041a');
    _bgGradient.addColorStop(1, '#0a0620');
  }

  canvas2d.save();
  canvas2d.fillStyle = _bgGradient!;
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
 *
 * Performance: shadow buffer is throttled to ~18 FPS.  Gravity well blur arcs are
 * rendered to a small DPR-independent offscreen canvas — main canvas never sets
 * canvas2d.filter.
 */
export function drawImpetusFloorEffects(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  nowMs: number,
  lowGraphics: boolean,
  softAsteroidShadows = false,
): void {
  const tS = nowMs * 0.001;

  // ── Shadow pass ───────────────────────────────────────────────────────────
  // Always uses an offscreen buffer (throttled).  Blur pre-baked there when
  // softened — no filter set on the main canvas.
  const _t0shadow = performance.now();
  _updateShadowCanvas(widthPx, heightPx, tS, nowMs, lowGraphics, softAsteroidShadows);
  _blitShadowCanvas(canvas2d, widthPx, heightPx, softAsteroidShadows);
  _shadowDrawMs = performance.now() - _t0shadow;

  // ── Asteroid field (purely decorative) ────────────────────────────────────
  _drawAsteroidField(canvas2d, widthPx, heightPx, tS, lowGraphics);

  // ── Gravity wells ─────────────────────────────────────────────────────────
  const _t0light = performance.now();
  if (lowGraphics) {
    _drawGravityWellsSimple(canvas2d, widthPx, heightPx, tS);
  } else {
    // Field fills (no blur) drawn directly on the main canvas — cheap radial fills.
    _drawGravityWellFields(canvas2d, widthPx, heightPx, tS);
    // Blurred swirl arcs: rendered at 35 % world-space on _wellCanvas,
    // then screen-blended onto the main canvas.  No canvas2d.filter on main canvas.
    _updateWellArcCanvas(widthPx, heightPx, tS);
    _blitWellArcCanvas(canvas2d, widthPx, heightPx);
  }
  _lightDrawMs = performance.now() - _t0light;
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
  const dx = Math.sin(tS * 0.04) * widthPx * 0.04;
  const dy = Math.cos(tS * 0.03) * heightPx * 0.03;

  const cx = widthPx * 0.35 + dx;
  const cy = heightPx * 0.40 + dy;
  const r  = Math.max(widthPx, heightPx) * 0.55;

  const nbGrad = canvas2d.createRadialGradient(cx, cy, 0, cx, cy, r);
  nbGrad.addColorStop(0,   'rgba(40, 10, 80, 0.08)');
  nbGrad.addColorStop(0.5, 'rgba(20, 5, 50, 0.04)');
  nbGrad.addColorStop(1,   'rgba(0,0,0,0)');

  canvas2d.globalAlpha = 1;
  canvas2d.fillStyle   = nbGrad;
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
  const maxLayer  = lowGraphics ? 1 : 2;
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
    canvas2d.fillStyle   = _STAR_COLORS[Math.floor(row[0] * _STAR_COLORS.length) % _STAR_COLORS.length];
    canvas2d.beginPath();
    canvas2d.arc(x, y, radius, 0, Math.PI * 2);
    canvas2d.fill();

    if (!lowGraphics && layer === 2 && alpha > 0.55) {
      canvas2d.globalAlpha = alpha * 0.25;
      canvas2d.strokeStyle = canvas2d.fillStyle;
      canvas2d.lineWidth   = 0.5;
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

// ── Gravity well field fills (no blur, main canvas) ──────────────────────────

/**
 * Draw only the non-blurred radial field fills for each gravity well.
 * These are cheap (small arc-clipped fills, no filter), so they stay on the main
 * canvas.  The blurred swirl arcs are handled separately via _updateWellArcCanvas.
 */
function _drawGravityWellFields(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  canvas2d.save();
  for (const row of _WELL_DATA) {
    const cx     = row[0] * widthPx;
    const cy     = row[1] * heightPx;
    const outerR = row[2];
    const innerR = row[3];
    const rAlpha = row[4];
    const s1Ph   = row[5];
    const pulse  = 0.92 + 0.08 * Math.sin(tS * 0.45 + s1Ph);
    const fieldR = outerR * 1.35 * pulse;
    const field  = canvas2d.createRadialGradient(cx, cy, innerR * 0.2, cx, cy, fieldR);
    field.addColorStop(0,    'rgba(20,0,40,0.18)');
    field.addColorStop(0.28, 'rgba(60,22,110,0.055)');
    field.addColorStop(0.66, 'rgba(120,72,210,0.022)');
    field.addColorStop(1,    'rgba(120,72,210,0)');
    canvas2d.globalAlpha = rAlpha * _WELL_FIELD_ALPHA;
    canvas2d.fillStyle   = field;
    canvas2d.beginPath();
    canvas2d.arc(cx, cy, fieldR, 0, Math.PI * 2);
    canvas2d.fill();
  }
  canvas2d.restore();
}

// ── Gravity well blur arcs (offscreen canvas) ─────────────────────────────────

/**
 * Render animated swirl arcs to the small offscreen _wellCanvas with blur applied
 * there.  Cost: proportional to _FX_WELL_SCALE² of the main canvas area, fully
 * decoupled from devicePixelRatio.
 *
 * The apparent blur radius at full size ≈ _WELL_BLUR_PX world-space pixels
 * (same visual as the original main-canvas blur(7px)).
 */
function _updateWellArcCanvas(
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  const bufW = Math.max(1, Math.ceil(widthPx  * _FX_WELL_SCALE));
  const bufH = Math.max(1, Math.ceil(heightPx * _FX_WELL_SCALE));

  if (!_wellCanvas) {
    _wellCanvas = document.createElement('canvas');
    _wellCtx    = _wellCanvas.getContext('2d', { alpha: true });
  }
  if (!_wellCtx) return;
  if (_wellCanvasW !== bufW || _wellCanvasH !== bufH) {
    _wellCanvas.width  = bufW;
    _wellCanvas.height = bufH;
    _wellCanvasW = bufW;
    _wellCanvasH = bufH;
  }

  const ctx = _wellCtx;
  ctx.clearRect(0, 0, bufW, bufH);
  ctx.save();
  ctx.scale(_FX_WELL_SCALE, _FX_WELL_SCALE);

  // Apply blur on the small canvas in canvas-pixel units.
  // Apparent radius when upscaled to full size = _WELL_BLUR_PX world-space px.
  ctx.filter    = `blur(${_WELL_BLUR_PX * _FX_WELL_SCALE}px)`;
  ctx.strokeStyle = _WELL_SWIRL_COLOR;
  ctx.lineCap   = 'round';
  const rotOffset = tS * 0.18;
  for (const row of _WELL_DATA) {
    const cx     = row[0] * widthPx;
    const cy     = row[1] * heightPx;
    const outerR = row[2];
    const rAlpha = row[4];
    const s1Ph   = row[5];
    const s2Ph   = row[6];
    const pulse  = 0.92 + 0.08 * Math.sin(tS * 0.45 + s1Ph);
    for (let arc = 0; arc < 5; arc++) {
      const layerT     = arc / 4;
      const startAngle = rotOffset * (0.7 + layerT * 0.4) + s1Ph + s2Ph * layerT;
      const arcSpan    = Math.PI * (0.42 + layerT * 0.25);
      ctx.globalAlpha  = rAlpha * _WELL_RING_ALPHA * (1 - layerT * 0.7) * pulse;
      ctx.lineWidth    = 1.2 + layerT * 2.8;
      ctx.beginPath();
      ctx.arc(cx, cy, outerR * (0.62 + layerT * 0.38) * pulse, startAngle, startAngle + arcSpan);
      ctx.stroke();
    }
  }
  ctx.filter = 'none';
  ctx.restore();
}

/**
 * Screen-blend the well-arc canvas onto the main canvas.
 * Screen mode brightens the underlying stars/background exactly as the original
 * main-canvas blur arcs did, but now the blur cost was paid on the small canvas.
 */
function _blitWellArcCanvas(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
): void {
  if (!_wellCanvas || _wellCanvasW <= 0) return;
  canvas2d.save();
  canvas2d.globalCompositeOperation = 'screen';
  canvas2d.globalAlpha = 1;
  canvas2d.drawImage(_wellCanvas, 0, 0, widthPx, heightPx);
  canvas2d.restore();
}

// ── Gravity wells (low-graphics fallback) ─────────────────────────────────────

/**
 * Cheap low-graphics gravity well renderer.
 * Draws one pulsing radial field per well — no blur, no arcs.
 */
function _drawGravityWellsSimple(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
): void {
  canvas2d.save();
  for (const row of _WELL_DATA) {
    const cx     = row[0] * widthPx;
    const cy     = row[1] * heightPx;
    const outerR = row[2];
    const rAlpha = row[4];
    const s1Ph   = row[5];
    const pulse  = 0.94 + 0.06 * Math.sin(tS * 0.45 + s1Ph);
    const fieldR = outerR * 1.25 * pulse;
    const field  = canvas2d.createRadialGradient(cx, cy, 0, cx, cy, fieldR);
    field.addColorStop(0,    'rgba(35,8,65,0.10)');
    field.addColorStop(0.55, 'rgba(130,72,220,0.025)');
    field.addColorStop(1,    'rgba(130,72,220,0)');
    canvas2d.globalAlpha = rAlpha * 0.3;
    canvas2d.fillStyle   = field;
    canvas2d.beginPath();
    canvas2d.arc(cx, cy, fieldR, 0, Math.PI * 2);
    canvas2d.fill();
  }
  canvas2d.restore();
}

// ── Shadow buffer (offscreen, throttled) ──────────────────────────────────────

/**
 * Update the shadow buffer if the throttle interval has elapsed.
 * Asteroid positions drift slowly so ~18 FPS shadow updates are imperceptible.
 *
 * When softened, `ctx.filter = blur()` is applied on the shadow canvas before
 * drawing the quads — no filter is ever set on the main canvas.
 */
function _updateShadowCanvas(
  widthPx: number,
  heightPx: number,
  tS: number,
  nowMs: number,
  lowGraphics: boolean,
  softened: boolean,
): void {
  const scale = lowGraphics ? _FX_SHADOW_SCALE_LO : _FX_SHADOW_SCALE_HI;
  const bufW  = Math.max(1, Math.ceil(widthPx  * scale));
  const bufH  = Math.max(1, Math.ceil(heightPx * scale));

  if (!_shadowCanvas) {
    _shadowCanvas = document.createElement('canvas');
    _shadowCtx    = _shadowCanvas.getContext('2d');
  }
  if (!_shadowCtx) return;

  // Resize triggers immediate re-render (skip throttle).
  if (_shadowCanvas.width !== bufW || _shadowCanvas.height !== bufH) {
    _shadowCanvas.width  = bufW;
    _shadowCanvas.height = bufH;
    _shadowLastMs = -Infinity;
  }

  if (nowMs - _shadowLastMs < _FX_SHADOW_INTERVAL) return;
  _shadowLastMs = nowMs;

  const ctx = _shadowCtx;
  ctx.clearRect(0, 0, bufW, bufH);
  ctx.save();
  ctx.scale(scale, scale);

  if (softened) {
    // Pre-blur the quads on the shadow canvas.
    // Apparent blur at full upscaled size ≈ _SOFT_SHADOW_BLUR_PX world-space px.
    ctx.filter = `blur(${_SOFT_SHADOW_BLUR_PX * scale}px)`;
  }
  _drawAsteroidShadowQuads(ctx, widthPx, heightPx, tS, lowGraphics, softened ? 0.22 : 0.38);
  ctx.restore();
}

/** Blit the cached shadow buffer to the main canvas (no filter on main canvas). */
function _blitShadowCanvas(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  softened: boolean,
): void {
  if (!_shadowCanvas || _shadowCanvas.width <= 0) return;
  canvas2d.save();
  canvas2d.globalAlpha = softened ? 0.72 : 1.0;
  canvas2d.drawImage(_shadowCanvas, 0, 0, widthPx, heightPx);
  canvas2d.restore();
}

// ── Asteroid shadow geometry ──────────────────────────────────────────────────

/**
 * Compute the world-space (canvas pixel) vertices for asteroid[i] at time tS.
 * Writes into the provided pre-allocated flat array [x0,y0, x1,y1, ...].
 */
function _getAsteroidVerts(
  i: number,
  widthPx: number,
  heightPx: number,
  tS: number,
  out: Float32Array,
): void {
  const row   = _ASTEROID_DATA[i];
  const bXF   = row[0];
  const bYF   = row[1];
  const dXS   = row[2];
  const dYS   = row[3];
  const speed = row[4];
  const size  = row[5];
  const rotR  = row[6];
  const phase = row[8];

  const driftT = (tS * speed + phase) % 1.0;
  const loopX  = (bXF + dXS * driftT + 2.0) % 1.2 - 0.1;
  const loopY  = (bYF + dYS * driftT + 2.0) % 1.2 - 0.1;
  const ax     = loopX * widthPx;
  const ay     = loopY * heightPx;
  const rot    = tS * rotR;
  const cosR   = Math.cos(rot);
  const sinR   = Math.sin(rot);
  const n      = _ASTER_ANGLES.length;

  for (let v = 0; v < n; v++) {
    const a  = _ASTER_ANGLES[v];
    const r  = size * _ASTER_RADII[v];
    const lx = Math.cos(a) * r;
    const ly = Math.sin(a) * r;
    out[v * 2]     = ax + cosR * lx - sinR * ly;
    out[v * 2 + 1] = ay + sinR * lx + cosR * ly;
  }
}

// Reusable vertex buffer — avoids per-frame allocation.
const _VERT_BUF = new Float32Array(_ASTER_ANGLES.length * 2);

/**
 * Draw shadow quads for each asteroid edge that faces away from the sun.
 * Batched per asteroid (one beginPath/fill per asteroid) to minimise draw calls.
 */
function _drawAsteroidShadowQuads(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
  alphaScale: number,
): void {
  const count = lowGraphics ? Math.floor(_ASTEROID_DATA.length * 0.5) : _ASTEROID_DATA.length;
  const sunX  = _SUN_X_FRAC * widthPx;
  const sunY  = _SUN_Y_FRAC * heightPx;
  const n     = _ASTER_ANGLES.length;

  canvas2d.save();
  canvas2d.fillStyle = '#000000';

  for (let i = 0; i < count; i++) {
    const alpha = _ASTEROID_DATA[i][7];
    _getAsteroidVerts(i, widthPx, heightPx, tS, _VERT_BUF);

    canvas2d.globalAlpha = alpha * alphaScale;
    canvas2d.beginPath();

    for (let e = 0; e < n; e++) {
      const ne  = (e + 1) % n;
      const v1x = _VERT_BUF[e  * 2];
      const v1y = _VERT_BUF[e  * 2 + 1];
      const v2x = _VERT_BUF[ne * 2];
      const v2y = _VERT_BUF[ne * 2 + 1];

      // Inward normal for CW polygon in Y-down canvas: (-(v2y-v1y), v2x-v1x)
      // dot > 0 with inward normal means toSun aligns inward → edge faces AWAY from sun → cast shadow
      const ecx    = (v1x + v2x) * 0.5;
      const ecy    = (v1y + v2y) * 0.5;
      const toSunX = sunX - ecx;
      const toSunY = sunY - ecy;
      const nx     = -(v2y - v1y);
      const ny     =  (v2x - v1x);
      if (toSunX * nx + toSunY * ny <= 0) continue;

      // Extend vertices away from sun by _SHADOW_LENGTH.
      const d1x = v1x - sunX;
      const d1y = v1y - sunY;
      const d1l = Math.sqrt(d1x * d1x + d1y * d1y) || 1;
      const d2x = v2x - sunX;
      const d2y = v2y - sunY;
      const d2l = Math.sqrt(d2x * d2x + d2y * d2y) || 1;
      const s1x = v1x + (d1x / d1l) * _SHADOW_LENGTH;
      const s1y = v1y + (d1y / d1l) * _SHADOW_LENGTH;
      const s2x = v2x + (d2x / d2l) * _SHADOW_LENGTH;
      const s2y = v2y + (d2y / d2l) * _SHADOW_LENGTH;

      canvas2d.moveTo(v1x, v1y);
      canvas2d.lineTo(v2x, v2y);
      canvas2d.lineTo(s2x, s2y);
      canvas2d.lineTo(s1x, s1y);
      canvas2d.closePath();
    }

    canvas2d.fill();
  }
  canvas2d.restore();
}

// ── Asteroid field (decorative) ───────────────────────────────────────────────

/** Draw visual asteroid drift field — purely decorative, no collision. */
function _drawAsteroidField(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
  tS: number,
  lowGraphics: boolean,
): void {
  const count = lowGraphics ? Math.floor(_ASTEROID_DATA.length * 0.5) : _ASTEROID_DATA.length;
  const n     = _ASTER_ANGLES.length;
  canvas2d.save();

  for (let i = 0; i < count; i++) {
    const alpha = _ASTEROID_DATA[i][7];
    _getAsteroidVerts(i, widthPx, heightPx, tS, _VERT_BUF);

    canvas2d.globalAlpha = alpha;
    canvas2d.fillStyle   = _ASTEROID_FILL;
    canvas2d.beginPath();
    for (let v = 0; v < n; v++) {
      const vx = _VERT_BUF[v * 2];
      const vy = _VERT_BUF[v * 2 + 1];
      if (v === 0) canvas2d.moveTo(vx, vy);
      else         canvas2d.lineTo(vx, vy);
    }
    canvas2d.closePath();
    canvas2d.fill();

    if (!lowGraphics) {
      canvas2d.globalAlpha = alpha * 0.55;
      canvas2d.strokeStyle = _ASTEROID_EDGE;
      canvas2d.lineWidth   = 0.6;
      canvas2d.stroke();
    }
  }

  canvas2d.restore();
}
