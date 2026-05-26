/**
 * zenith-binary-ring-background.ts — path-traced Zenith Binary Ring backdrop.
 *
 * Build 155: full-screen accumulated strand-field system.
 * Thousands of particles driven by a radial-outward + swirl + noise field
 * accumulate on a half-resolution offscreen canvas.  A bounded prewarm pass
 * fills the field before first display so the encounter never opens empty.
 */

export interface ZenithBinaryRingBackground {
  update(now: number, width: number, height: number, age: 'light' | 'dark'): void;
  draw(ctx: CanvasRenderingContext2D): void;
  reset(): void;
  destroy(): void;
}

// ── Configuration ────────────────────────────────────────────────────────────

const CFG = {
  internalScale:           0.50,   // offscreen canvas is this fraction of screen
  lowInternalScale:        0.35,

  particleCount:           6500,
  medParticleCount:        3600,
  lowParticleCount:        1800,

  /** Synchronous prewarm frames – keep low enough to avoid freeze. */
  prewarmSteps:            40,
  medPrewarmSteps:         20,
  lowPrewarmSteps:          8,

  fadeAlpha:               0.045,  // black overlay per frame (slow fade = accumulation)
  lightTrailAlpha:         0.032,  // strand stroke alpha, Age of Light
  darkTrailAlpha:          0.025,  // strand stroke alpha, Age of Darkness

  ringRadiusRatio:         0.078,  // ring spawn radius / min(IW, IH)
  ringSpawnJitter:         4.0,    // ± internal pixels at spawn
  ringFalloff:             38.0,   // exponential half-width around ring boundary

  /** Radial outward force (internal px / sec). */
  outwardBase:             14.0,
  /** Extra outward force applied near the ring boundary. */
  outwardRingBoost:        30.0,
  /** Tangential swirl force (internal px / sec). */
  swirlStrength:           22.0,
  swirlTimeFreq:            0.50,  // time modulation of swirl phase
  swirlRadialFreq:          0.038, // radius modulation of swirl phase
  /** Random noise force (internal px / sec). */
  wobbleStrength:          10.0,

  /** Per-frame velocity damping at 60 fps. */
  damping:                  0.985,

  /** Respawn when particle is beyond this fraction of min(IW, IH) from centre. */
  maxFieldRadiusRatio:      0.72,
  /** Respawn when particle is within this fraction of min(IW, IH) from centre. */
  centerVoidRadiusRatio:    0.044,

  ageLerpMs:             1500,
} as const;

// ── Colour palettes ───────────────────────────────────────────────────────────

const N_BUCKETS = 6;

// Age of Light: pale ivory, warm white, soft yellow, green-yellow, faint pink, cyan-white
const LIGHT_H = new Float32Array([50,  45,  58,  68,  40, 192]);
const LIGHT_S = new Float32Array([38,  22,  52,  48,  58,  22]);
const LIGHT_L = new Float32Array([93,  97,  83,  72,  89,  60]);

// Age of Darkness: dim violet, charcoal-magenta, brown-purple, muted ember, dark rose, deep blue-purple
const DARK_H  = new Float32Array([272, 292, 312, 282, 258, 300]);
const DARK_S  = new Float32Array([38,  46,  36,  26,  22,  42]);
const DARK_L  = new Float32Array([20,  24,  21,  18,  15,  26]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function clamp01(v: number): number { return v < 0 ? 0 : v > 1 ? 1 : v; }

function hueLerp(a: number, b: number, t: number): number {
  let d = b - a;
  if (d > 180) d -= 360; else if (d < -180) d += 360;
  let r = a + d * t;
  if (r < 0) r += 360; else if (r >= 360) r -= 360;
  return r;
}

/**
 * Deterministic pseudo-noise in [-1, 1].  No heap allocation.
 * Varies smoothly over (seed, t) at different frequencies.
 */
function hashNoise(s: number, t: number): number {
  const h = Math.sin(s * 127.1 + t * 311.7) * 43758.5453;
  return 2.0 * (h - Math.floor(h)) - 1.0;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createZenithBinaryRingBackground(
  opts: { quality?: 'low' | 'medium' | 'high' } = {},
): ZenithBinaryRingBackground {
  const q       = opts.quality ?? 'high';
  const isLow   = q === 'low';
  const isMed   = q === 'medium';

  const internalScale = isLow ? CFG.lowInternalScale : CFG.internalScale;
  const particleCount = isLow ? CFG.lowParticleCount
                      : isMed ? CFG.medParticleCount
                      :         CFG.particleCount;
  const prewarmSteps  = isLow ? CFG.lowPrewarmSteps
                      : isMed ? CFG.medPrewarmSteps
                      :         CFG.prewarmSteps;

  // ── Particle typed arrays ────────────────────────────────────────────────

  const px    = new Float32Array(particleCount);
  const py    = new Float32Array(particleCount);
  const ppx   = new Float32Array(particleCount);
  const ppy   = new Float32Array(particleCount);
  const pvx   = new Float32Array(particleCount);
  const pvy   = new Float32Array(particleCount);
  const pseed = new Float32Array(particleCount);
  for (let i = 0; i < particleCount; i++) pseed[i] = i * 1.6180339887 + 0.3;

  // ── Palette state ────────────────────────────────────────────────────────

  const curH  = new Float32Array(N_BUCKETS);
  const curS  = new Float32Array(N_BUCKETS);
  const curL  = new Float32Array(N_BUCKETS);
  const fromH = new Float32Array(N_BUCKETS);
  const fromS = new Float32Array(N_BUCKETS);
  const fromL = new Float32Array(N_BUCKETS);
  const toH   = new Float32Array(N_BUCKETS);
  const toS   = new Float32Array(N_BUCKETS);
  const toL   = new Float32Array(N_BUCKETS);
  const bucketHsl: string[] = new Array(N_BUCKETS).fill('#fff');

  // ── Canvas / world state ─────────────────────────────────────────────────

  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx:    CanvasRenderingContext2D | null = null;
  let W = 0, H = 0, IW = 0, IH = 0;
  let cx = 0, cy = 0, ringRadius = 0, maxR = 0, voidR = 0;
  let timeS       = 0;
  let lastNow: number | null = null;
  let currentAge: 'light' | 'dark' = 'light';
  let lerpStartMs = 0;
  let lerpActive  = false;
  let paletteDirty = true;

  // ── Palette helpers ──────────────────────────────────────────────────────

  function loadPalette(age: 'light' | 'dark', h: Float32Array, s: Float32Array, l: Float32Array): void {
    const sh = age === 'light' ? LIGHT_H : DARK_H;
    const ss = age === 'light' ? LIGHT_S : DARK_S;
    const sl = age === 'light' ? LIGHT_L : DARK_L;
    for (let i = 0; i < N_BUCKETS; i++) { h[i] = sh[i]!; s[i] = ss[i]!; l[i] = sl[i]!; }
  }

  function rebuildBucketHsl(): void {
    for (let i = 0; i < N_BUCKETS; i++) {
      bucketHsl[i] = `hsl(${curH[i]! | 0},${curS[i]! | 0}%,${curL[i]! | 0}%)`;
    }
    paletteDirty = false;
  }

  function tickPalette(now: number): void {
    if (lerpActive) {
      const t = clamp01((now - lerpStartMs) / CFG.ageLerpMs);
      for (let i = 0; i < N_BUCKETS; i++) {
        curH[i] = hueLerp(fromH[i]!, toH[i]!, t);
        curS[i] = fromS[i]! + (toS[i]! - fromS[i]!) * t;
        curL[i] = fromL[i]! + (toL[i]! - fromL[i]!) * t;
      }
      paletteDirty = true;
      if (t >= 1) lerpActive = false;
    }
    if (paletteDirty) rebuildBucketHsl();
  }

  // ── Particle helpers ─────────────────────────────────────────────────────

  function spawnParticle(i: number): void {
    const a = (i / particleCount) * Math.PI * 2 + pseed[i]! * 1.618;
    const jitter = hashNoise(pseed[i]!, i * 0.011) * CFG.ringSpawnJitter;
    const r = ringRadius + jitter;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    px[i] = x;  py[i] = y;
    ppx[i] = x; ppy[i] = y;
    pvx[i] = 0; pvy[i] = 0;
  }

  function stepParticles(dt: number): void {
    const falloff  = CFG.ringFalloff;
    const oBase    = CFG.outwardBase;
    const oBoost   = CFG.outwardRingBoost;
    const swirlStr = CFG.swirlStrength;
    const sTF      = CFG.swirlTimeFreq;
    const sRF      = CFG.swirlRadialFreq;
    const wob      = CFG.wobbleStrength;
    const damp     = CFG.damping;
    const maxR2    = maxR * maxR;
    const voidR2   = voidR * voidR;
    // Quantised time for noise – avoids per-particle float-floor each call
    const tq = Math.floor(timeS * 5) * 0.2;

    for (let i = 0; i < particleCount; i++) {
      const dx = px[i]! - cx;
      const dy = py[i]! - cy;
      const dist = Math.sqrt(dx * dx + dy * dy) + 0.001;
      const invD = 1.0 / dist;
      const nx   = dx * invD;
      const ny   = dy * invD;
      const tx   = -ny;
      const ty   =  nx;

      // Ring-boundary influence: boost outward force near the ring
      const ringDelta = Math.abs(dist - ringRadius);
      const ringInf   = ringDelta < falloff * 3
        ? Math.exp(-ringDelta / falloff)
        : 0.0;
      const outward = oBase + ringInf * oBoost;

      // Tangential swirl varies with time, per-particle seed, and radius
      const swirlV = swirlStr * Math.sin(timeS * sTF + pseed[i]! * 17.0 + dist * sRF);

      // Independent radial and tangential noise
      const noiseR = hashNoise(pseed[i]!,       tq + i * 0.00031) * wob;
      const noiseT = hashNoise(pseed[i]! + 200, tq + i * 0.00027) * (wob * 0.5);

      pvx[i] = pvx[i]! * damp + (nx * (outward + noiseR) + tx * (swirlV + noiseT)) * dt;
      pvy[i] = pvy[i]! * damp + (ny * (outward + noiseR) + ty * (swirlV + noiseT)) * dt;

      ppx[i] = px[i]!;
      ppy[i] = py[i]!;
      px[i]  = px[i]!  + pvx[i]! * dt;
      py[i]  = py[i]!  + pvy[i]! * dt;

      // Respawn out-of-bounds particles (compare squared distances to avoid sqrt)
      const ndx = px[i]! - cx;
      const ndy = py[i]! - cy;
      const nd2 = ndx * ndx + ndy * ndy;
      if (nd2 > maxR2 || nd2 < voidR2) spawnParticle(i);
    }
  }

  /**
   * Draw all particle trails in a single path call with a cycled colour.
   * Rotating through N_BUCKETS colours over time produces palette variety
   * in the accumulated canvas without needing multiple stroke() calls per frame.
   */
  function drawStrands(oc: CanvasRenderingContext2D, trailAlpha: number): void {
    const bucketIdx = Math.floor(timeS * 2.3) % N_BUCKETS;
    oc.strokeStyle  = bucketHsl[bucketIdx]!;
    oc.globalAlpha  = trailAlpha;
    oc.lineWidth    = 0.75;
    oc.beginPath();
    for (let i = 0; i < particleCount; i++) {
      oc.moveTo(ppx[i]!, ppy[i]!);
      oc.lineTo(px[i]!,  py[i]!);
    }
    oc.stroke();
    oc.globalAlpha = 1;
  }

  function runStep(dt: number, trailAlpha: number): void {
    if (!offCtx) return;
    timeS += dt;
    // Fade accumulated strands toward black slowly
    offCtx.globalAlpha  = CFG.fadeAlpha;
    offCtx.fillStyle    = '#000';
    offCtx.fillRect(0, 0, IW, IH);
    // Advance particle field
    stepParticles(dt);
    // Draw strand segments
    drawStrands(offCtx, trailAlpha);
  }

  /**
   * Synchronous prewarm: runs the full update pipeline for a bounded number of
   * steps so the field is partially developed on first display.  Steps are
   * intentionally limited to avoid a noticeable freeze.
   */
  function prewarm(steps: number, trailAlpha: number): void {
    const dt = 1 / 60;
    for (let s = 0; s < steps; s++) runStep(dt, trailAlpha);
    if (offCtx) offCtx.globalAlpha = 1;
  }

  // ── Init / resize ────────────────────────────────────────────────────────

  function init(w: number, h: number): void {
    W = w; H = h;
    IW = Math.max(1, Math.round(w * internalScale));
    IH = Math.max(1, Math.round(h * internalScale));
    cx = IW * 0.5;
    cy = IH * 0.5;
    const minDim = Math.min(IW, IH);
    ringRadius   = minDim * CFG.ringRadiusRatio;
    maxR         = minDim * CFG.maxFieldRadiusRatio;
    voidR        = minDim * CFG.centerVoidRadiusRatio;

    offCanvas         = document.createElement('canvas');
    offCanvas.width   = IW;
    offCanvas.height  = IH;
    offCtx            = offCanvas.getContext('2d');
    if (!offCtx) throw new Error('ZenithBinaryRingBackground: failed to create offscreen context');

    offCtx.fillStyle = '#000';
    offCtx.fillRect(0, 0, IW, IH);
    offCtx.lineCap    = 'round';
    offCtx.lineJoin   = 'round';
    offCtx.globalCompositeOperation = 'source-over';

    loadPalette(currentAge, curH,  curS,  curL);
    loadPalette(currentAge, fromH, fromS, fromL);
    loadPalette(currentAge, toH,   toS,   toL);
    paletteDirty = true;
    rebuildBucketHsl();

    timeS   = 0;
    lastNow = null;
    for (let i = 0; i < particleCount; i++) spawnParticle(i);

    const trailAlpha = currentAge === 'light' ? CFG.lightTrailAlpha : CFG.darkTrailAlpha;
    prewarm(prewarmSteps, trailAlpha);
  }

  function ensureInit(w: number, h: number): void {
    if (!offCanvas || !offCtx || w !== W || h !== H) init(w, h);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    update(now: number, width: number, height: number, age: 'light' | 'dark'): void {
      ensureInit(width, height);
      if (!offCtx) return;

      // Age of Light ↔ Dark transition
      if (age !== currentAge) {
        for (let i = 0; i < N_BUCKETS; i++) {
          fromH[i] = curH[i]!; fromS[i] = curS[i]!; fromL[i] = curL[i]!;
        }
        loadPalette(age, toH, toS, toL);
        lerpStartMs  = now;
        lerpActive   = true;
        paletteDirty = true;
        currentAge   = age;
      }

      tickPalette(now);

      const prevNow = lastNow ?? now;
      let dt = (now - prevNow) / 1000;
      if (dt < 0.001) dt = 1 / 60;
      if (dt > 0.05)  dt = 0.05;
      lastNow = now;

      const trailAlpha = currentAge === 'light' ? CFG.lightTrailAlpha : CFG.darkTrailAlpha;
      runStep(dt, trailAlpha);
    },

    draw(ctx: CanvasRenderingContext2D): void {
      if (!offCanvas) return;
      ctx.save();
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(offCanvas, 0, 0, W, H);
      ctx.restore();
    },

    reset(): void {
      offCanvas = null; offCtx = null;
      W = 0; H = 0; IW = 0; IH = 0;
      lastNow = null; timeS = 0;
    },

    destroy(): void { this.reset(); },
  };
}
