/**
 * composition-fog.ts — Shared fog/noise renderer for composition-based visuals.
 *
 * Provides two entry points:
 *   renderFogBarToCanvas  — horizontal bar where each segment has an ordered color
 *   drawFogFill           — 2-D fill where colors occupy area proportional to weight
 *
 * Both use a small offscreen pixel buffer (scaled up) to keep frame time low.
 * Animation pauses automatically when prefers-reduced-motion is set.
 */

// ─── Reduced-motion ───────────────────────────────────────────────────────────

let _reducedMotion = false;
if (typeof window !== 'undefined' && typeof window.matchMedia === 'function') {
  const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
  _reducedMotion = mql.matches;
  mql.addEventListener('change', (e) => { _reducedMotion = e.matches; });
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

// ─── Full-res bar cache (used by renderFogBarToCanvas) ───────────────────────

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
 * Multi-octave smooth noise.  Returns a value in approximately [-1, 1].
 * Four octaves give a balance of broad cloudy forms and finer turbulence.
 */
function octaveNoise(x: number, y: number, t: number, seed: number): number {
  const s = seed * 0.0013;
  const n0 = Math.sin(x * 0.071 + y * 0.113 + t * 0.31  + s)            * 0.500;
  const n1 = Math.sin(x * 0.157 - y * 0.241 + t * 0.53  + s * 1.3 + 2.14) * 0.250;
  const n2 = Math.sin(x * 0.319 + y * 0.487 + t * 0.91  + s * 1.7 + 4.31) * 0.125;
  const n3 = Math.cos(x * 0.671 - y * 0.823 + t * 1.51  + s * 2.1 + 7.07) * 0.0625;
  return (n0 + n1 + n2 + n3) / 0.9375;
}

// ─── Public types ─────────────────────────────────────────────────────────────

/** Pre-parsed RGB triple for efficient per-pixel math. */
export type FogRgb = [number, number, number];

/** Convert a CSS hex colour string to an FogRgb tuple. */
export function hexToFogRgb(hex: string): FogRgb {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

// ─── Bar fog ─────────────────────────────────────────────────────────────────

/**
 * Renders a continuous horizontal fog/noise bar and returns the offscreen
 * HTMLCanvasElement (w × h).  Call drawImage from it to blit to each
 * segment canvas cheaply.
 *
 * Colors flow left-to-right in segment order; adjacent colors blend softly
 * near boundaries.  Luminosity is modulated by multi-scale noise to create
 * flowing, cloud-like forms.
 *
 * @param w, h      - output dimensions
 * @param colorRgbs - ordered segment colours as FogRgb tuples
 * @param shares    - ordered width fractions (should sum to ≈ 1)
 * @param timeMs    - animation clock; frozen at 0 if prefers-reduced-motion
 * @param seed      - deterministic per-bar seed (use a stable value per bar)
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

  // Render at a small size and scale up for performance
  const LO_W = 80;
  const LO_H = 10;
  const lo = getLoBuf(`bar${seed}`, LO_W, LO_H);
  const d = lo.img.data;

  // Cumulative boundary positions in [0, 1]
  const bounds: number[] = [];
  let cumSum = 0;
  for (let si = 0; si < n - 1; si++) {
    cumSum += shares[si];
    bounds.push(cumSum);
  }

  for (let py = 0; py < LO_H; py++) {
    const fy = (py + 0.5) / LO_H;
    for (let px = 0; px < LO_W; px++) {
      const fx = (px + 0.5) / LO_W;

      // Multi-scale noise for this pixel
      const noise = octaveNoise(fx * LO_W, fy * LO_H, t, seed);

      // Horizontal displacement by noise — shifts color ownership left/right
      const xd = Math.max(0, Math.min(1, fx + noise * 0.055));

      // Weighted colour blend: each segment contributes according to how close
      // its centre is to xd, using quadratic falloff for readable boundaries.
      let totalW = 0;
      let rSum   = 0;
      let gSum   = 0;
      let bSum   = 0;

      for (let si = 0; si < n; si++) {
        const segL = si === 0       ? 0         : bounds[si - 1];
        const segR = si === n - 1   ? 1         : bounds[si];
        const ctr  = (segL + segR) * 0.5;
        const half = Math.max(0.01, (segR - segL) * 0.65);

        const dist = Math.abs(xd - ctr);
        const inf  = Math.max(0, 1 - dist / half);
        const w2   = inf * inf; // quadratic → sharper segment centres, soft boundary bleed

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
        const seg = colorRgbs[Math.min(n - 1, Math.round(xd * n))];
        rSum = seg[0]; gSum = seg[1]; bSum = seg[2];
      }

      // Luminosity from noise: broad dark valleys and bright crests → foggy depth
      const lum = 0.11 + 0.28 * ((noise + 1) * 0.5);

      const i = (py * LO_W + px) * 4;
      d[i]     = (Math.min(255, (rSum * lum) | 0));
      d[i + 1] = (Math.min(255, (gSum * lum) | 0));
      d[i + 2] = (Math.min(255, (bSum * lum) | 0));
      d[i + 3] = 255;
    }
  }

  lo.ctx.putImageData(lo.img, 0, 0);

  const barCtx = barCanvas.getContext('2d')!;
  barCtx.imageSmoothingEnabled  = true;
  barCtx.imageSmoothingQuality  = 'medium';
  barCtx.drawImage(lo.canvas, 0, 0, w, h);

  return barCanvas;
}

// ─── Fill fog (2-D, for item icons) ──────────────────────────────────────────

/**
 * Draws a 2-D composition fog directly onto `targetCtx` at the given bounds.
 *
 * Each color in `colorRgbs` is assigned a unique slow-drifting noise field
 * so that dominant weights occupy more area while minor ingredients appear as
 * veins and wisps.  Colors flow into one another organically — no hard bands.
 *
 * Performance: renders into a 32 × 32 buffer scaled to (w, h).
 * ~2–4 k trig ops per call, safe for per-frame use on many icons.
 *
 * @param targetCtx - destination 2-D context
 * @param x, y, w, h - destination rectangle
 * @param colorRgbs - composition colours as FogRgb tuples
 * @param weights   - proportional weights (need not sum to 1)
 * @param timeMs    - animation clock; frozen at 0 if prefers-reduced-motion
 * @param seed      - deterministic per-item seed (use stable value, e.g. stringToIconSeed(id))
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

  // Normalise weights so they sum to 1
  const totalWt = weights.reduce((a, b) => a + b, 0) || 1;
  const normWts = weights.map(wt => wt / totalWt);

  // Per-color drift parameters — deterministic from seed + color index.
  // Each color gets a unique slow-moving noise field so it flows
  // independently of its neighbours, producing organic blending.
  interface ColorField {
    freqX: number;
    freqY: number;
    speedX: number;
    speedY: number;
    phaseX: number;
    phaseY: number;
    spread: number; // weight amplifier — dominant colors cover more area
  }

  const fields: ColorField[] = colorRgbs.map((_, ci) => {
    // Simple LCG from (seed + ci * prime) to avoid correlated patterns
    let h = ((seed + ci * 7919) | 0) >>> 0;
    const lcg = (): number => {
      h = (Math.imul(1664525, h) + 1013904223) >>> 0;
      return h / 0x100000000;
    };
    return {
      freqX:  lcg() * 7  + 4,
      freqY:  lcg() * 7  + 4,
      speedX: lcg() * 0.25 + 0.10,
      speedY: lcg() * 0.20 + 0.08,
      phaseX: lcg() * Math.PI * 2,
      phaseY: lcg() * Math.PI * 2,
      spread: 0.45 + normWts[ci] * 2.2, // larger weight → more territorial presence
    };
  });

  for (let py = 0; py < LO_H; py++) {
    const fy = (py + 0.5) / LO_H;
    for (let px = 0; px < LO_W; px++) {
      const fx = (px + 0.5) / LO_W;

      // Base luminosity noise (large scale, slow drift)
      const lumNoise = octaveNoise(fx * 8, fy * 8, t * 0.28, seed);

      let totalInf = 0;
      let rSum = 0, gSum = 0, bSum = 0;

      for (let ci = 0; ci < n; ci++) {
        const f = fields[ci];
        // Each color has its own drifting sinusoidal field
        const raw =
          Math.sin(fx * f.freqX + t * f.speedX + f.phaseX) *
          Math.cos(fy * f.freqY + t * f.speedY + f.phaseY);
        // raw in [-1, 1] — shift to [0, 1] and apply spread + weight
        const influence = ((raw + 1) * 0.5) * f.spread;

        rSum     += colorRgbs[ci][0] * influence;
        gSum     += colorRgbs[ci][1] * influence;
        bSum     += colorRgbs[ci][2] * influence;
        totalInf += influence;
      }

      if (totalInf > 0.001) {
        rSum /= totalInf;
        gSum /= totalInf;
        bSum /= totalInf;
      } else {
        rSum = colorRgbs[0][0];
        gSum = colorRgbs[0][1];
        bSum = colorRgbs[0][2];
      }

      // Modulate brightness with base noise for depth and internal glow
      const lum = 0.09 + 0.33 * ((lumNoise + 1) * 0.5);

      const i = (py * LO_W + px) * 4;
      d[i]     = (Math.min(255, (rSum * lum) | 0));
      d[i + 1] = (Math.min(255, (gSum * lum) | 0));
      d[i + 2] = (Math.min(255, (bSum * lum) | 0));
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
