/**
 * zenith-binary-horizon.ts — "Binary Horizon" background for the Zenith sublevel.
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
 * Call `createZenithBinaryHorizon({ quality })` once.
 * Each frame: call `effect.update(nowMs, canvasW, canvasH)`, then
 *             call `effect.draw(mainCtx)`.
 * On resize or subzone switch: call `effect.reset()` (or simply discard and
 * re-create).
 */

// ── Tuning constants ──────────────────────────────────────────────────────────

/** Number of path-tracing particles per quality tier. */
const PARTICLE_COUNT_HIGH   = 600;
const PARTICLE_COUNT_MEDIUM = 280;
const PARTICLE_COUNT_LOW    = 110;

/**
 * Alpha of the black fade-rectangle applied each frame.
 * Lower value → longer persistent trails.
 *   high:   ~4 s half-life at 60 fps
 *   medium: ~2 s half-life
 *   low:    ~1 s half-life
 */
const TRAIL_FADE_HIGH   = 0.010;
const TRAIL_FADE_MEDIUM = 0.018;
const TRAIL_FADE_LOW    = 0.032;

/** Horizon vertical position as a fraction of canvas height (0 = top, 1 = bottom). */
const HORIZON_Y_FRACTION = 0.48;

/** Strength of the central radial glow (0–1). */
const CENTER_GLOW_STRENGTH = 0.55;

/** Global velocity multiplier applied to the flow-field output. */
const FIELD_STRENGTH = 1.25;

/**
 * Maximum distance a particle travels from the horizon before respawning,
 * expressed as a fraction of half the internal canvas height.
 */
const VERTICAL_SPREAD = 0.90;

/**
 * Velocity scale: base pixels/second = IH × VELOCITY_SCALE.
 * At IH = 640 this gives ~41 px/s base speed.
 */
const VELOCITY_SCALE = 0.065;

/** Width of the horizon gradient, as a fraction of internal canvas width. */
const HORIZON_GLOW_HALF_WIDTH = 0.5;

/** Radius of the central glow fill, as a fraction of internal canvas width. */
const CENTER_GLOW_RADIUS_FRACTION = 0.40;

/** Minimum particle lifetime in seconds (short-lived central filaments). */
const LIFE_MIN = 7;

/** Maximum particle lifetime in seconds (long outer strands). */
const LIFE_MAX = 22;

/** Horizon line stroke width in internal pixels. */
const HORIZON_LINE_WIDTH = 1.5;

/** Breathing oscillation speed in radians per second (period ≈ 8.4 s). */
const BREATHE_SPEED = 0.75;

/** Duration of the fade-in on first render, in milliseconds. */
const FADE_IN_MS = 1400;

/** Internal render resolution scale per quality tier. */
const RENDER_SCALE_HIGH   = 1.0;
const RENDER_SCALE_MEDIUM = 0.75;
const RENDER_SCALE_LOW    = 0.5;

/**
 * globalAlpha used when stroking particle lines.
 * Low values → faint individual strands that only become bright via accumulation.
 */
const STROKE_ALPHA_HIGH   = 0.065;
const STROKE_ALPHA_MEDIUM = 0.055;
const STROKE_ALPHA_LOW    = 0.045;

/** Number of colour buckets for batched drawing (≤ 256; must fit in Uint8Array). */
const N_BUCKETS = 8;

// ── Colour lookup table ───────────────────────────────────────────────────────

/**
 * Builds the pre-computed stroke colour string for each of the `nBuckets`
 * colour buckets.  Bucket 0 is the centre (white/silver); bucket N−1 is the
 * outermost (violet/magenta).  The normalised distance used for each bucket is
 * the midpoint of its range so colour blending is visually even.
 */
function buildBucketColors(nBuckets: number): string[] {
  const colors: string[] = [];
  for (let b = 0; b < nBuckets; b++) {
    const t = (b + 0.5) / nBuckets;   // 0 = centre, 1 = far edge
    let h: number, s: number, l: number;

    if (t < 0.12) {
      // Near-centre: white / silver
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

export interface ZenithBinaryHorizon {
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

export function createZenithBinaryHorizon(
  { quality = 'high' }: { quality?: 'low' | 'medium' | 'high' } = {},
): ZenithBinaryHorizon {

  const isLow    = quality === 'low';
  const isMedium = quality === 'medium';

  const N           = isLow ? PARTICLE_COUNT_LOW  : isMedium ? PARTICLE_COUNT_MEDIUM  : PARTICLE_COUNT_HIGH;
  const trailFade   = isLow ? TRAIL_FADE_LOW       : isMedium ? TRAIL_FADE_MEDIUM       : TRAIL_FADE_HIGH;
  const renderScale = isLow ? RENDER_SCALE_LOW     : isMedium ? RENDER_SCALE_MEDIUM     : RENDER_SCALE_HIGH;
  const strokeAlpha = isLow ? STROKE_ALPHA_LOW     : isMedium ? STROKE_ALPHA_MEDIUM     : STROKE_ALPHA_HIGH;

  // ── Pre-allocated particle state (zero heap allocation in the hot path) ─────
  /** Current x position, in internal canvas pixels. */
  const px      = new Float32Array(N);
  /** Current y position, in internal canvas pixels. */
  const py      = new Float32Array(N);
  /** Previous x (for drawing the line segment each frame). */
  const ppx     = new Float32Array(N);
  /** Previous y. */
  const ppy     = new Float32Array(N);
  /** Elapsed life in seconds. */
  const plife    = new Float32Array(N);
  /** Maximum lifetime in seconds. */
  const pmaxlife = new Float32Array(N);
  /** Vertical direction: +1 drifts downward from horizon, −1 drifts upward. */
  const pside    = new Float32Array(N);
  /** Colour bucket index (0 = centre/white, N_BUCKETS−1 = edge/magenta). */
  const pbucket  = new Uint8Array(N);

  const bucketColors = buildBucketColors(N_BUCKETS);

  // ── Offscreen canvas ────────────────────────────────────────────────────────
  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx:    CanvasRenderingContext2D | null = null;

  // Logical dimensions (= main RPG canvas size).
  let W = 0;
  let H = 0;
  // Internal (scaled) dimensions.
  let IW = 0;
  let IH = 0;
  // Derived layout values (recomputed in init()).
  let horizonY = 0;   // horizon y in internal pixels
  let cx       = 0;   // horizontal centre in internal pixels
  let halfW    = 0;   // half of internal width

  let lastTs:         number | null = null;
  let timeS:          number        = 0;
  let compositeAlpha: number        = 0;
  let initStartMs:    number | null = null;

  // ── Helpers ─────────────────────────────────────────────────────────────────

  /** Maps an internal x position to a colour bucket index. */
  function bucketForX(x: number): number {
    const normDist = Math.min(1, Math.abs(x - cx) / (halfW || 1));
    return Math.min(N_BUCKETS - 1, Math.floor(normDist * N_BUCKETS));
  }

  /**
   * Resets particle i to a fresh spawn near the horizon.
   * When `scatterLife` is true the initial elapsed life is randomised so that
   * particles do not all expire simultaneously.
   */
  function spawnParticle(i: number, scatterLife: boolean): void {
    // Horizontal position: mix of uniform and slight centre-density bias.
    const useUniform = Math.random() < 0.55;
    const normX = useUniform
      ? (Math.random() * 2 - 1) * 0.98
      : (Math.random() - 0.5) * 0.98;

    px[i]  = cx + normX * halfW;
    py[i]  = horizonY + (Math.random() - 0.5) * 3.5;
    ppx[i] = px[i];
    ppy[i] = py[i];

    pside[i] = Math.random() < 0.5 ? -1 : 1;

    // Outer particles live longer (calmer, longer strands at the edges).
    const outerFactor = Math.abs(normX);
    pmaxlife[i] = LIFE_MIN + (LIFE_MAX - LIFE_MIN) * (outerFactor * 0.6 + Math.random() * 0.4);

    plife[i] = scatterLife ? Math.random() * pmaxlife[i] : 0;

    // Colour bucket is assigned at spawn and kept fixed so each strand has
    // a characteristic colour throughout its lifetime.
    pbucket[i] = bucketForX(px[i]);
  }

  /** Allocates the offscreen canvas and seeds all particles. */
  function init(w: number, h: number): void {
    W  = w;
    H  = h;
    IW = Math.max(1, Math.round(w * renderScale));
    IH = Math.max(1, Math.round(h * renderScale));

    horizonY = IH * HORIZON_Y_FRACTION;
    cx       = IW / 2;
    halfW    = IW / 2;

    offCanvas        = document.createElement('canvas');
    offCanvas.width  = IW;
    offCanvas.height = IH;
    offCtx           = offCanvas.getContext('2d')!;

    // Fill solid black so there are no transparent holes behind the effect.
    offCtx.fillStyle = '#000000';
    offCtx.fillRect(0, 0, IW, IH);

    for (let i = 0; i < N; i++) spawnParticle(i, true);
  }

  // ── Flow field ───────────────────────────────────────────────────────────────
  //
  // Returns (vx, vy) in internal pixels/second for a particle at (x, y).
  // The field is constructed from superposed sine/cosine terms to produce
  // curl-like behaviour without external noise libraries.
  //
  // Design goals:
  //  • Vertical component always drifts away from the horizon (sign = pside).
  //  • Horizontal component oscillates; amplitude peaks near x = cx (centre)
  //    to create tangled, crossing paths there.
  //  • A small return-to-centre term drives particles from the edges back
  //    inward, producing repeated crossings and brightening the centre zone.
  //  • A tiny asymmetric perturbation breaks perfect bilateral symmetry.
  function flowField(
    x: number, y: number,
    side: number,
    ts: number,
  ): [number, number] {
    const nx    = (x - cx) / (halfW || 1);             // −1 … 1
    const ny    = (y - horizonY) / (IH * 0.5 || 1);   // −1 … 1  (0 at horizon)
    const distH = Math.abs(ny);                         // 0 at horizon, 1 at edge

    const vScale = IH * VELOCITY_SCALE;

    // Vertical: accelerates as particle moves further from the horizon.
    const vy = side * FIELD_STRENGTH * (0.35 + distH * 1.0) * vScale;

    // Centre-convergence factor: 1 at x = cx, decays toward edges.
    const centralFactor = Math.exp(-nx * nx * 2.8);

    // Horizontal oscillation terms.
    const hOsc = (
      Math.sin(ny * 3.8 + nx * 2.3 + ts * 0.52) * 0.70 * centralFactor +
      Math.cos(nx * 4.1 +             ts * 0.38) * 0.38 +
      Math.sin(ny * 6.5 +             ts * 0.67) * 0.24 * (1 - distH * 0.45)
    ) * FIELD_STRENGTH;

    // Gentle return-to-centre to produce crossings (stronger near centre).
    const returnToCenter = -nx * 0.14 * (1 + centralFactor);

    // Small asymmetric perturbation to avoid a perfectly mirrored look.
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
    compositeAlpha = Math.min(1, (now - initStartMs) / FADE_IN_MS);

    const dt = lastTs === null ? 0.016 : Math.min((now - lastTs) / 1000, 0.05);
    lastTs = now;
    timeS += dt;

    if (!offCtx) return;

    // ── Fade accumulated trails with a translucent black rect ─────────────────
    // This is the key to the "persistent trail" look: instead of clearing the
    // canvas we darken it slightly each frame so old strokes linger and fade.
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha              = trailFade;
    offCtx.fillStyle                = '#000000';
    offCtx.fillRect(0, 0, IW, IH);
    offCtx.globalAlpha = 1;

    // Maximum absolute vertical distance from the horizon before respawning.
    const maxVert = IH * VERTICAL_SPREAD * 0.5;

    // ── Advance all particles ────────────────────────────────────────────────
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

    // ── Draw particle strands — batched by colour bucket ──────────────────────
    // Each bucket issues only one beginPath() / stroke() pair, reducing canvas
    // state changes from N to N_BUCKETS per frame.
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha              = strokeAlpha;
    offCtx.lineWidth                = 1.0;
    offCtx.lineCap                  = 'round';

    for (let b = 0; b < N_BUCKETS; b++) {
      offCtx.strokeStyle = bucketColors[b];
      offCtx.beginPath();

      for (let i = 0; i < N; i++) {
        if (pbucket[i] !== b) continue;
        // Skip particles that have not moved (just spawned).
        if (ppx[i] === px[i] && ppy[i] === py[i]) continue;
        offCtx.moveTo(ppx[i], ppy[i]);
        offCtx.lineTo(px[i],  py[i]);
      }

      offCtx.stroke();
    }

    // ── Horizon line ──────────────────────────────────────────────────────────
    const breathe = 0.65 + 0.35 * Math.sin(timeS * BREATHE_SPEED);
    const hgw     = IW * HORIZON_GLOW_HALF_WIDTH;

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
    offCtx.lineWidth                = HORIZON_LINE_WIDTH;
    offCtx.beginPath();
    offCtx.moveTo(0,  horizonY);
    offCtx.lineTo(IW, horizonY);
    offCtx.stroke();

    // ── Central glow ──────────────────────────────────────────────────────────
    const glowR = IW * CENTER_GLOW_RADIUS_FRACTION;
    const ga    = CENTER_GLOW_STRENGTH * breathe;

    const cGrad = offCtx.createRadialGradient(cx, horizonY, 0, cx, horizonY, glowR);
    cGrad.addColorStop(0.00, `rgba(255,255,255,${(ga * 0.55).toFixed(3)})`);
    cGrad.addColorStop(0.18, `rgba(210,245,255,${(ga * 0.28).toFixed(3)})`);
    cGrad.addColorStop(0.50, `rgba(120,210,255,${(ga * 0.07).toFixed(3)})`);
    cGrad.addColorStop(1.00, 'rgba(0,80,180,0)');

    offCtx.globalAlpha = 1;
    offCtx.fillStyle   = cGrad;
    offCtx.fillRect(cx - glowR, horizonY - glowR, glowR * 2, glowR * 2);

    // Restore context state.
    offCtx.globalAlpha              = 1;
    offCtx.globalCompositeOperation = 'source-over';
  }

  // ── Draw ──────────────────────────────────────────────────────────────────────

  function draw(mainCtx: CanvasRenderingContext2D): void {
    if (!offCanvas || compositeAlpha <= 0) return;
    mainCtx.save();
    mainCtx.globalAlpha = compositeAlpha;
    // Scale the offscreen canvas up to the logical RPG canvas size.
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
