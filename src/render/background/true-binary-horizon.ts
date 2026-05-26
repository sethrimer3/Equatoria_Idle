/**
 * true-binary-horizon.ts — "Binary Horizon" legacy background for the True sublevel.
 *
 * This is a preserved copy of the original Zenith Binary Horizon effect (build 153),
 * used as the True subzone background so it remains available while Zenith receives
 * its reworked path-accumulation implementation.
 *
 * Visual design
 * ─────────────
 * A black void with a thin luminous horizontal horizon across the centre of the
 * gameplay area.  From the horizon, thousands of faint particle strands grow
 * upward and downward like tangled luminous filaments.  The centre zone has a
 * bright white/silver convergence glow while the outer regions graduate through
 * cyan → teal → blue → violet → faint magenta.  The field produces more tangled
 * crossings near the centre and longer, calmer strands at the edges.  A subtle
 * bilateral symmetry exists but is not perfect.  A slow "breathing" intensity
 * pulse adds organic life to the effect.
 *
 * Performance model
 * ─────────────────
 * • One persistent offscreen canvas; never fully cleared — faded each frame by
 *   a semi-transparent black rectangle to create persistent trails.
 * • All particle state lives in preallocated Float32Array / Uint8Array; zero
 *   per-frame heap allocation in the hot path.
 * • Particles are batched into N_BUCKETS colour buckets → only N_BUCKETS canvas
 *   state-changes (strokeStyle) per frame regardless of particle count.
 * • Internal resolution is scaled down per quality level, then upscaled when
 *   composited into the main RPG canvas.
 * • No external libraries or shader framework required.
 *
 * Integration
 * ───────────
 * Call `createTrueBinaryHorizon({ quality })` once.
 * Each frame: call `effect.update(nowMs, canvasW, canvasH)`, then
 *             call `effect.draw(mainCtx)`.
 * On resize or subzone switch: call `effect.reset()` (or simply discard and
 * re-create).
 */

// ── Tuning constants ──────────────────────────────────────────────────────────

/** Number of path-tracing particles per quality tier. */
const TRUE_PARTICLE_COUNT_HIGH   = 600;
const TRUE_PARTICLE_COUNT_MEDIUM = 280;
const TRUE_PARTICLE_COUNT_LOW    = 110;

/**
 * Alpha of the black fade-rectangle applied each frame.
 * Lower value → longer persistent trails.
 *   high:   ~4 s half-life at 60 fps
 *   medium: ~2 s half-life
 *   low:    ~1 s half-life
 */
const TRUE_TRAIL_FADE_HIGH   = 0.010;
const TRUE_TRAIL_FADE_MEDIUM = 0.018;
const TRUE_TRAIL_FADE_LOW    = 0.032;

/** Horizon vertical position as a fraction of canvas height (0 = top, 1 = bottom). */
const TRUE_HORIZON_Y_FRACTION = 0.48;

/** Strength of the central radial glow (0–1). */
const TRUE_CENTER_GLOW_STRENGTH = 0.55;

/** Global velocity multiplier applied to the flow-field output. */
const TRUE_FIELD_STRENGTH = 1.25;

/**
 * Maximum distance a particle travels from the horizon before respawning,
 * expressed as a fraction of half the internal canvas height.
 */
const TRUE_VERTICAL_SPREAD = 0.90;

/**
 * Velocity scale: base pixels/second = IH × VELOCITY_SCALE.
 * At IH = 640 this gives ~41 px/s base speed.
 */
const TRUE_VELOCITY_SCALE = 0.065;

/** Width of the horizon gradient, as a fraction of internal canvas width. */
const TRUE_HORIZON_GLOW_HALF_WIDTH = 0.5;

/** Radius of the central glow fill, as a fraction of internal canvas width. */
const TRUE_CENTER_GLOW_RADIUS_FRACTION = 0.40;

/** Minimum particle lifetime in seconds (short-lived central filaments). */
const TRUE_LIFE_MIN = 7;

/** Maximum particle lifetime in seconds (long outer strands). */
const TRUE_LIFE_MAX = 22;

/** Horizon line stroke width in internal pixels. */
const TRUE_HORIZON_LINE_WIDTH = 1.5;

/** Breathing oscillation speed in radians per second (period ≈ 8.4 s). */
const TRUE_BREATHE_SPEED = 0.75;

/** Duration of the fade-in on first render, in milliseconds. */
const TRUE_FADE_IN_MS = 1400;

/** Internal render resolution scale per quality tier. */
const TRUE_RENDER_SCALE_HIGH   = 1.0;
const TRUE_RENDER_SCALE_MEDIUM = 0.75;
const TRUE_RENDER_SCALE_LOW    = 0.5;

/**
 * globalAlpha used when stroking particle lines.
 * Low values → faint individual strands that only become bright via accumulation.
 */
const TRUE_STROKE_ALPHA_HIGH   = 0.065;
const TRUE_STROKE_ALPHA_MEDIUM = 0.055;
const TRUE_STROKE_ALPHA_LOW    = 0.045;

/** Number of colour buckets for batched drawing (≤ 256; must fit in Uint8Array). */
const TRUE_N_BUCKETS = 8;

// ── Colour lookup table ───────────────────────────────────────────────────────

function buildTrueBucketColors(nBuckets: number): string[] {
  const colors: string[] = [];
  for (let b = 0; b < nBuckets; b++) {
    const t = (b + 0.5) / nBuckets;   // 0 = centre, 1 = far edge
    let h: number, s: number, l: number;

    if (t < 0.12) {
      h = 195;  s = Math.round(t * 30);  l = 92;
    } else if (t < 0.28) {
      const u = (t - 0.12) / 0.16;
      h = 192;  s = Math.round(5 + u * 75);  l = Math.round(92 - u * 22);
    } else if (t < 0.50) {
      const u = (t - 0.28) / 0.22;
      h = Math.round(188 + u * 12);  s = 80;  l = Math.round(70 - u * 12);
    } else if (t < 0.68) {
      const u = (t - 0.50) / 0.18;
      h = Math.round(200 + u * 30);  s = 78;  l = Math.round(58 - u * 8);
    } else if (t < 0.82) {
      const u = (t - 0.68) / 0.14;
      h = Math.round(230 + u * 50);  s = 72;  l = Math.round(50 - u * 6);
    } else {
      const u = (t - 0.82) / 0.18;
      h = Math.round(280 + u * 45);  s = 62;  l = Math.round(44 - u * 8);
    }

    colors.push(`hsl(${h},${s}%,${l}%)`);
  }
  return colors;
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface TrueBinaryHorizon {
  /** Advance the simulation and render trails to the offscreen canvas. */
  update(now: number, width: number, height: number): void;
  /** Composite the offscreen canvas into the provided 2-D context. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Discard all state so the effect re-initialises on the next update call. */
  reset(): void;
  /** Release all allocated resources. */
  destroy(): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createTrueBinaryHorizon(
  { quality = 'high' }: { quality?: 'low' | 'medium' | 'high' } = {},
): TrueBinaryHorizon {

  const isLow    = quality === 'low';
  const isMedium = quality === 'medium';

  const N           = isLow ? TRUE_PARTICLE_COUNT_LOW  : isMedium ? TRUE_PARTICLE_COUNT_MEDIUM  : TRUE_PARTICLE_COUNT_HIGH;
  const trailFade   = isLow ? TRUE_TRAIL_FADE_LOW       : isMedium ? TRUE_TRAIL_FADE_MEDIUM       : TRUE_TRAIL_FADE_HIGH;
  const renderScale = isLow ? TRUE_RENDER_SCALE_LOW     : isMedium ? TRUE_RENDER_SCALE_MEDIUM     : TRUE_RENDER_SCALE_HIGH;
  const strokeAlpha = isLow ? TRUE_STROKE_ALPHA_LOW     : isMedium ? TRUE_STROKE_ALPHA_MEDIUM     : TRUE_STROKE_ALPHA_HIGH;

  // ── Pre-allocated particle state (zero heap allocation in the hot path) ─────
  const px      = new Float32Array(N);
  const py      = new Float32Array(N);
  const ppx     = new Float32Array(N);
  const ppy     = new Float32Array(N);
  const plife    = new Float32Array(N);
  const pmaxlife = new Float32Array(N);
  const pside    = new Float32Array(N);
  const pbucket  = new Uint8Array(N);

  const bucketColors = buildTrueBucketColors(TRUE_N_BUCKETS);

  // ── Offscreen canvas ────────────────────────────────────────────────────────
  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx:    CanvasRenderingContext2D | null = null;

  let W = 0;
  let H = 0;
  let IW = 0;
  let IH = 0;
  let horizonY = 0;
  let cx       = 0;
  let halfW    = 0;

  let lastTs:         number | null = null;
  let timeS:          number        = 0;
  let compositeAlpha: number        = 0;
  let initStartMs:    number | null = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  function bucketForX(x: number): number {
    const normDist = Math.min(1, Math.abs(x - cx) / (halfW || 1));
    return Math.min(TRUE_N_BUCKETS - 1, Math.floor(normDist * TRUE_N_BUCKETS));
  }

  function spawnParticle(i: number, scatterLife: boolean): void {
    const useUniform = Math.random() < 0.55;
    const normX = useUniform
      ? (Math.random() * 2 - 1) * 0.98
      : (Math.random() - 0.5) * 0.98;

    px[i]  = cx + normX * halfW;
    py[i]  = horizonY + (Math.random() - 0.5) * 3.5;
    ppx[i] = px[i];
    ppy[i] = py[i];

    pside[i] = Math.random() < 0.5 ? -1 : 1;

    const outerFactor = Math.abs(normX);
    pmaxlife[i] = TRUE_LIFE_MIN + (TRUE_LIFE_MAX - TRUE_LIFE_MIN) * (outerFactor * 0.6 + Math.random() * 0.4);

    plife[i] = scatterLife ? Math.random() * pmaxlife[i] : 0;

    pbucket[i] = bucketForX(px[i]);
  }

  function init(w: number, h: number): void {
    W  = w;
    H  = h;
    IW = Math.max(1, Math.round(w * renderScale));
    IH = Math.max(1, Math.round(h * renderScale));

    horizonY = IH * TRUE_HORIZON_Y_FRACTION;
    cx       = IW / 2;
    halfW    = IW / 2;

    offCanvas        = document.createElement('canvas');
    offCanvas.width  = IW;
    offCanvas.height = IH;
    offCtx           = offCanvas.getContext('2d')!;

    offCtx.fillStyle = '#000000';
    offCtx.fillRect(0, 0, IW, IH);

    for (let i = 0; i < N; i++) spawnParticle(i, true);
  }

  // ── Flow field ───────────────────────────────────────────────────────────────

  function flowField(
    x: number, y: number,
    side: number,
    ts: number,
  ): [number, number] {
    const nx    = (x - cx) / (halfW || 1);
    const ny    = (y - horizonY) / (IH * 0.5 || 1);
    const distH = Math.abs(ny);

    const vScale = IH * TRUE_VELOCITY_SCALE;

    const vy = side * TRUE_FIELD_STRENGTH * (0.35 + distH * 1.0) * vScale;

    const centralFactor = Math.exp(-nx * nx * 2.8);

    const hOsc = (
      Math.sin(ny * 3.8 + nx * 2.3 + ts * 0.52) * 0.70 * centralFactor +
      Math.cos(nx * 4.1 +             ts * 0.38) * 0.38 +
      Math.sin(ny * 6.5 +             ts * 0.67) * 0.24 * (1 - distH * 0.45)
    ) * TRUE_FIELD_STRENGTH;

    const returnToCenter = -nx * 0.14 * (1 + centralFactor);

    const asymm = Math.sin(ts * 0.11 + y * 0.035) * 0.08;

    const vx = (hOsc + returnToCenter + asymm) * vScale;

    return [vx, vy];
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  function update(now: number, w: number, h: number): void {
    const needsInit = !offCanvas || W !== w || H !== h;
    if (needsInit) {
      init(w, h);
      compositeAlpha = 0;
      initStartMs    = now;
      lastTs         = null;
    }

    if (initStartMs === null) initStartMs = now;
    compositeAlpha = Math.min(1, (now - initStartMs) / TRUE_FADE_IN_MS);

    const dt = lastTs === null ? 0.016 : Math.min((now - lastTs) / 1000, 0.05);
    lastTs = now;
    timeS += dt;

    if (!offCtx) return;

    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha              = trailFade;
    offCtx.fillStyle                = '#000000';
    offCtx.fillRect(0, 0, IW, IH);
    offCtx.globalAlpha = 1;

    const maxVert = IH * TRUE_VERTICAL_SPREAD * 0.5;

    for (let i = 0; i < N; i++) {
      plife[i] += dt;

      if (
        plife[i] >= pmaxlife[i] ||
        px[i] < -2 || px[i] > IW + 2 ||
        Math.abs(py[i] - horizonY) > maxVert
      ) {
        spawnParticle(i, false);
        continue;
      }

      ppx[i] = px[i];
      ppy[i] = py[i];

      const [vx, vy] = flowField(px[i], py[i], pside[i], timeS);
      px[i] += vx * dt;
      py[i] += vy * dt;
    }

    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha              = strokeAlpha;
    offCtx.lineWidth                = 1.0;
    offCtx.lineCap                  = 'round';

    for (let b = 0; b < TRUE_N_BUCKETS; b++) {
      offCtx.strokeStyle = bucketColors[b];
      offCtx.beginPath();

      for (let i = 0; i < N; i++) {
        if (pbucket[i] !== b) continue;
        if (ppx[i] === px[i] && ppy[i] === py[i]) continue;
        offCtx.moveTo(ppx[i], ppy[i]);
        offCtx.lineTo(px[i],  py[i]);
      }

      offCtx.stroke();
    }

    // ── Horizon line ──────────────────────────────────────────────────────────
    const breathe = 0.65 + 0.35 * Math.sin(timeS * TRUE_BREATHE_SPEED);
    const hgw     = IW * TRUE_HORIZON_GLOW_HALF_WIDTH;

    const hGrad = offCtx.createLinearGradient(cx - hgw, horizonY, cx + hgw, horizonY);
    hGrad.addColorStop(0.00, 'rgba(0,160,220,0.02)');
    hGrad.addColorStop(0.25, 'rgba(80,200,255,0.30)');
    hGrad.addColorStop(0.45, 'rgba(200,235,255,0.85)');
    hGrad.addColorStop(0.50, `rgba(255,255,255,${(0.95 * breathe).toFixed(2)})`);
    hGrad.addColorStop(0.55, 'rgba(200,235,255,0.85)');
    hGrad.addColorStop(0.75, 'rgba(80,200,255,0.30)');
    hGrad.addColorStop(1.00, 'rgba(0,160,220,0.02)');

    offCtx.globalCompositeOperation = 'lighter';
    offCtx.globalAlpha              = breathe;
    offCtx.strokeStyle              = hGrad;
    offCtx.lineWidth                = TRUE_HORIZON_LINE_WIDTH;
    offCtx.beginPath();
    offCtx.moveTo(0,  horizonY);
    offCtx.lineTo(IW, horizonY);
    offCtx.stroke();

    // ── Central glow ──────────────────────────────────────────────────────────
    const glowR = IW * TRUE_CENTER_GLOW_RADIUS_FRACTION;
    const ga    = TRUE_CENTER_GLOW_STRENGTH * breathe;

    const cGrad = offCtx.createRadialGradient(cx, horizonY, 0, cx, horizonY, glowR);
    cGrad.addColorStop(0.00, `rgba(255,255,255,${(ga * 0.55).toFixed(3)})`);
    cGrad.addColorStop(0.18, `rgba(210,245,255,${(ga * 0.28).toFixed(3)})`);
    cGrad.addColorStop(0.50, `rgba(120,210,255,${(ga * 0.07).toFixed(3)})`);
    cGrad.addColorStop(1.00, 'rgba(0,80,180,0)');

    offCtx.globalAlpha = 1;
    offCtx.fillStyle   = cGrad;
    offCtx.fillRect(cx - glowR, horizonY - glowR, glowR * 2, glowR * 2);

    offCtx.globalAlpha              = 1;
    offCtx.globalCompositeOperation = 'source-over';
  }

  // ── Draw ──────────────────────────────────────────────────────────────────────

  function draw(mainCtx: CanvasRenderingContext2D): void {
    if (!offCanvas || compositeAlpha <= 0) return;
    mainCtx.save();
    mainCtx.globalAlpha = compositeAlpha;
    mainCtx.drawImage(offCanvas, 0, 0, IW, IH, 0, 0, W, H);
    mainCtx.restore();
  }

  // ── Reset / Destroy ───────────────────────────────────────────────────────────

  function reset(): void {
    offCanvas      = null;
    offCtx         = null;
    W = H = IW = IH = 0;
    lastTs         = null;
    initStartMs    = null;
    compositeAlpha = 0;
    timeS          = 0;
  }

  function destroy(): void { reset(); }

  return { update, draw, reset, destroy };
}
