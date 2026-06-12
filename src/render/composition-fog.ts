/**
 * composition-fog.ts — Shared fog/noise renderer for composition-based visuals.
 *
 * Provides two entry points:
 *   renderFogBarToCanvas  — horizontal bar where each segment has an ordered color
 *   drawFogFill           — 2-D fill where colors occupy area proportional to weight
 *
 * Both use a small offscreen pixel buffer (scaled up) to keep frame time low.
 *
 * Performance safeguards:
 *   - Renders into a fixed small buffer (80×10 for bars, 32×32 for fills) scaled up.
 *   - Per-color parameters are precomputed once when composition changes (keyed by seed).
 *   - No heap allocations inside the per-pixel loop.
 *   - Animation time frozen when prefers-reduced-motion is set.
 *   - document.hidden check: callers should gate calls; exported `isFogVisible()` helper.
 */

// ─── Visibility helpers ───────────────────────────────────────────────────────

let _reducedMotion = false;
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  _reducedMotion = mql.matches;
  mql.addEventListener('change', (e) => { _reducedMotion = e.matches; });
}

/** Returns false when the page is hidden or reduced-motion is preferred. */
export function isFogVisible(): boolean {
  return !_reducedMotion && (typeof document === 'undefined' || !document.hidden);
}

// ─── Low-res offscreen cache ──────────────────────────────────────────────────

interface LoBuf {
  canvas: HTMLCanvasElement;
  ctx:    CanvasRenderingContext2D;
  img:    ImageData;
}

const _loBufs = new Map<string, LoBuf>();

function getLoBuf(key: string, w: number, h: number): LoBuf {
  const ck = `${key}|${w}|${h}`;
  let lo = _loBufs.get(ck);
  if (!lo) {
    const canvas = document.createElement('canvas');
    canvas.width  = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d')!;
    lo = { canvas, ctx, img: ctx.createImageData(w, h) };
    _loBufs.set(ck, lo);
  }
  return lo;
}

// ─── Full-res bar canvas cache ────────────────────────────────────────────────

const _barCanvases = new Map<number, HTMLCanvasElement>();

function getBarCanvas(seed: number, w: number, h: number): HTMLCanvasElement {
  let c = _barCanvases.get(seed);
  if (!c || c.width !== w || c.height !== h) {
    c = document.createElement('canvas');
    c.width  = w;
    c.height = h;
    _barCanvases.set(seed, c);
  }
  return c;
}

// ─── Noise ────────────────────────────────────────────────────────────────────

/**
 * Multi-octave smooth noise, returns a value in approximately [-1, 1].
 * Four octaves provide broad cloudy forms (first two) plus finer turbulence (last two).
 */
function octaveNoise(x: number, y: number, t: number, seed: number): number {
  const s = seed * 0.0013;
  const n0 = Math.sin(x * 0.071 + y * 0.113 + t * 0.31  + s)              * 0.500;
  const n1 = Math.sin(x * 0.157 - y * 0.241 + t * 0.53  + s * 1.3 + 2.14) * 0.250;
  const n2 = Math.sin(x * 0.319 + y * 0.487 + t * 0.91  + s * 1.7 + 4.31) * 0.125;
  const n3 = Math.cos(x * 0.671 - y * 0.823 + t * 1.51  + s * 2.1 + 7.07) * 0.0625;
  return (n0 + n1 + n2 + n3) / 0.9375;
}

// ─── Public types ─────────────────────────────────────────────────────────────

/** Pre-parsed RGB triple for efficient per-pixel math. */
export type FogRgb = [number, number, number];

/** Convert a CSS hex colour string to a FogRgb tuple. */
export function hexToFogRgb(hex: string): FogRgb {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ─── Bar fog ─────────────────────────────────────────────────────────────────

// Bar rendering uses no per-call allocation — boundaries[] is rebuilt only
// when the number of segments changes (tiny array, stack-local).

/**
 * Renders a continuous horizontal fog/noise bar and returns the offscreen
 * HTMLCanvasElement (w × h).  Call drawImage from it to blit to each
 * segment canvas cheaply.
 *
 * Colors flow left-to-right in segment order; adjacent colors blend softly
 * near boundaries.  Luminosity is modulated by multi-scale noise.
 *
 * @param w, h      - output dimensions
 * @param colorRgbs - ordered segment colours as FogRgb tuples
 * @param shares    - ordered width fractions (should sum to ≈ 1)
 * @param timeMs    - animation clock; frozen at 0 if prefers-reduced-motion
 * @param seed      - deterministic per-bar seed (stable across frames)
 */
export function renderFogBarToCanvas(
  w: number,
  h: number,
  colorRgbs: FogRgb[],
  shares: number[],
  timeMs: number,
  seed: number,
): HTMLCanvasElement {
  const n = colorRgbs.length;
  const barCanvas = getBarCanvas(seed, w, h);
  if (n === 0 || w <= 0 || h <= 0) return barCanvas;

  const t = _reducedMotion ? 0 : timeMs / 1000;

  const LO_W = 80;
  const LO_H = 10;
  const lo = getLoBuf(`bar${seed}`, LO_W, LO_H);
  const d = lo.img.data;

  // Cumulative boundary positions in [0, 1] — small array, no closure allocation
  const bounds: number[] = new Array(n - 1);
  let cumSum = 0;
  for (let si = 0; si < n - 1; si++) {
    cumSum += shares[si];
    bounds[si] = cumSum;
  }

  // Precompute per-segment centre and half-width (avoids recomputing inside pixel loop)
  const segCtr: number[]  = new Array(n);
  const segHalf: number[] = new Array(n);
  for (let si = 0; si < n; si++) {
    const segL = si === 0     ? 0         : bounds[si - 1];
    const segR = si === n - 1 ? 1         : bounds[si];
    segCtr[si]  = (segL + segR) * 0.5;
    segHalf[si] = Math.max(0.01, (segR - segL) * 0.65);
  }

  for (let py = 0; py < LO_H; py++) {
    const fy = (py + 0.5) / LO_H;
    for (let px = 0; px < LO_W; px++) {
      const fx = (px + 0.5) / LO_W;

      const noise = octaveNoise(fx * LO_W, fy * LO_H, t, seed);

      // Noise-displaced x for colour sampling
      const xd = fx + noise * 0.055;

      let totalW = 0;
      let rSum   = 0;
      let gSum   = 0;
      let bSum   = 0;

      for (let si = 0; si < n; si++) {
        const dist = Math.abs(xd - segCtr[si]);
        const inf  = dist < segHalf[si] ? 1 - dist / segHalf[si] : 0;
        const w2   = inf * inf;

        rSum   += colorRgbs[si][0] * w2;
        gSum   += colorRgbs[si][1] * w2;
        bSum   += colorRgbs[si][2] * w2;
        totalW += w2;
      }

      if (totalW > 0.001) {
        rSum /= totalW;
        gSum /= totalW;
        bSum /= totalW;
      } else {
        // Clamp to nearest segment when xd falls in a gap (very small segments)
        const si = Math.min(n - 1, Math.max(0, Math.round(xd * n)));
        rSum = colorRgbs[si][0];
        gSum = colorRgbs[si][1];
        bSum = colorRgbs[si][2];
      }

      // Luminosity: broad dark valleys and bright crests create fog-like depth
      const lum = 0.11 + 0.28 * ((noise + 1) * 0.5);

      const i = (py * LO_W + px) * 4;
      d[i]     = (rSum * lum) | 0;
      d[i + 1] = (gSum * lum) | 0;
      d[i + 2] = (bSum * lum) | 0;
      d[i + 3] = 255;
    }
  }

  lo.ctx.putImageData(lo.img, 0, 0);

  const barCtx = barCanvas.getContext('2d')!;
  barCtx.imageSmoothingEnabled = true;
  barCtx.imageSmoothingQuality = 'medium';
  barCtx.drawImage(lo.canvas, 0, 0, w, h);

  return barCanvas;
}

// ─── Fill fog (2-D, for item icons) ──────────────────────────────────────────

// Precomputed per-color field parameters, cached by seed.
// Rebuilt only when the seed (= composition hash) changes.
interface ColorField {
  r: number;
  g: number;
  b: number;
  freqX: number;
  freqY: number;
  speedX: number;
  speedY: number;
  phaseX: number;
  phaseY: number;
  /** Presence weight: proportional to normalised share with a small floor so
   *  minor ingredients appear as wisps/veins without dominating. */
  presence: number;
}

const _fillCache = new Map<number, ColorField[]>();

function getOrBuildFields(colorRgbs: FogRgb[], weights: number[], seed: number): ColorField[] {
  let fields = _fillCache.get(seed);
  if (fields && fields.length === colorRgbs.length) return fields;

  const totalWt = weights.reduce((a, b) => a + b, 0) || 1;
  fields = colorRgbs.map((rgb, ci) => {
    const normShare = weights[ci] / totalWt;

    // LCG from (seed + ci * prime) — avoids correlated patterns across colours
    let h = ((seed + ci * 7919) | 0) >>> 0;
    const lcg = (): number => {
      h = (Math.imul(1664525, h) + 1013904223) >>> 0;
      return h / 0x100000000;
    };

    return {
      r: rgb[0],
      g: rgb[1],
      b: rgb[2],
      freqX:  lcg() * 7  + 4,
      freqY:  lcg() * 7  + 4,
      speedX: lcg() * 0.22 + 0.08,
      speedY: lcg() * 0.18 + 0.07,
      phaseX: lcg() * Math.PI * 2,
      phaseY: lcg() * Math.PI * 2,
      // Presence is strictly proportional to share; small floor keeps minor
      // ingredients visible as subtle wisps without inflating their territory.
      presence: Math.max(normShare, 0.04) * (1 / Math.max(normShare, 0.04) > 25 ? 0.5 : 1),
    } as ColorField;
  });

  // Rebuild presence with correct proportionality: dominant colors get larger
  // territory; trace ingredients get a small but non-zero floor.
  const minorFloor = 0.04;
  for (let ci = 0; ci < fields.length; ci++) {
    const share = weights[ci] / totalWt;
    fields[ci].presence = Math.max(share, minorFloor) * 2.5;
    // Scale down floor-boosted entries so 1% and 5% are visually distinct
    if (share < minorFloor) {
      fields[ci].presence = minorFloor * 2.5 * (share / minorFloor);
    }
  }

  _fillCache.set(seed, fields);
  return fields;
}

/**
 * Draws a 2-D composition fog directly onto `targetCtx` at the given bounds.
 *
 * Each colour in `colorRgbs` is assigned a unique slow-drifting sinusoidal
 * field weighted by its normalised share, so dominant ingredients cover more
 * area while trace ingredients remain visible as veins and wisps.
 *
 * Renders into a 32 × 32 buffer scaled to (w, h).
 * Per-colour parameters are precomputed once and cached by seed.
 *
 * @param targetCtx - destination 2-D context
 * @param x, y, w, h - destination rectangle
 * @param colorRgbs - composition colours as FogRgb tuples
 * @param weights   - proportional weights (need not sum to 1)
 * @param timeMs    - animation clock; frozen at 0 if prefers-reduced-motion
 * @param seed      - stable per-item seed (e.g. from stringToIconSeed(id))
 */
export function drawFogFill(
  targetCtx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  colorRgbs: FogRgb[],
  weights: number[],
  timeMs: number,
  seed: number,
): void {
  const n = colorRgbs.length;
  if (n === 0 || w <= 0 || h <= 0) return;

  const t = _reducedMotion ? 0 : timeMs / 1000;

  const LO_W = 32;
  const LO_H = 32;
  const lo = getLoBuf(`fill${seed}`, LO_W, LO_H);
  const d = lo.img.data;

  // Precomputed fields — no allocation inside the frame
  const fields = getOrBuildFields(colorRgbs, weights, seed);

  for (let py = 0; py < LO_H; py++) {
    const fy = (py + 0.5) / LO_H;
    for (let px = 0; px < LO_W; px++) {
      const fx = (px + 0.5) / LO_W;

      // Base luminosity noise (large scale, slow drift — shared across all colours)
      const lumNoise = octaveNoise(fx * 8, fy * 8, t * 0.28, seed);

      let totalInf = 0;
      let rSum = 0;
      let gSum = 0;
      let bSum = 0;

      for (let ci = 0; ci < n; ci++) {
        const f = fields[ci];
        // Unique drifting field per colour — sin×cos gives smooth organic blobs
        const raw =
          Math.sin(fx * f.freqX + t * f.speedX + f.phaseX) *
          Math.cos(fy * f.freqY + t * f.speedY + f.phaseY);
        // raw ∈ [-1, 1] → shift to [0, 1] then scale by presence
        const influence = ((raw + 1) * 0.5) * f.presence;

        rSum     += f.r * influence;
        gSum     += f.g * influence;
        bSum     += f.b * influence;
        totalInf += influence;
      }

      if (totalInf > 0.001) {
        rSum /= totalInf;
        gSum /= totalInf;
        bSum /= totalInf;
      } else {
        rSum = fields[0].r;
        gSum = fields[0].g;
        bSum = fields[0].b;
      }

      // Brightness from large-scale noise → restrained internal luminosity/glow
      const lum = 0.09 + 0.33 * ((lumNoise + 1) * 0.5);

      const i = (py * LO_W + px) * 4;
      d[i]     = (rSum * lum) | 0;
      d[i + 1] = (gSum * lum) | 0;
      d[i + 2] = (bSum * lum) | 0;
      d[i + 3] = 255;
    }
  }

  lo.ctx.putImageData(lo.img, 0, 0);

  targetCtx.save();
  targetCtx.imageSmoothingEnabled = true;
  targetCtx.imageSmoothingQuality = 'medium';
  targetCtx.drawImage(lo.canvas, x, y, w, h);
  targetCtx.restore();
}
