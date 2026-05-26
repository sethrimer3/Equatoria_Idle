/**
 * zenith-binary-horizon.ts — Reworked Binary Horizon background for the Zenith sublevel.
 *
 * Inspired by the XScreenSaver "Binary Horizon" concept (Patrick Leiser, J. Tarbell,
 * Emilio Del Tessandoro, 2021): a system of path-tracing particles evolves continuously
 * from an initial horizon, alternating between colour ages.
 *
 * Visual design
 * ─────────────
 * • A black void with an edge-to-edge horizon line whose orientation is randomised
 *   each wave (always touching two edges of the render area).
 * • Thousands of faint path-tracing strands evolve from that line, diverging into
 *   tangled filamentary patterns on each side.
 * • Trails accumulate persistently on an offscreen canvas — the field builds up over
 *   time rather than appearing as a static glow.
 * • Two alternating colour ages (light: cyan/teal/blue; dark: magenta/violet/rose)
 *   cycle slowly, giving the field a living, breathing polarity.
 * • On each wave transition the horizon line is re-randomised and the effect rebuilds.
 *
 * Geometry rule
 * ─────────────
 * The divider line must leave at least 10 % of the rectangle area on both sides.
 * A precise Shoelace-based polygon area test is used — no weak heuristics.
 *
 * Performance model
 * ─────────────────
 * • One persistent offscreen canvas; faded each frame with a low-alpha black rect.
 * • All particle state lives in typed arrays; zero per-frame heap allocation.
 * • Colour-bucket batching: only N_BUCKETS strokeStyle changes per frame.
 * • Bounded prewarm pass on wave reseed so the field is populated on first display.
 * • Low-graphics mode reduces particle count, prewarm, and internal resolution.
 */

// ── Configuration ─────────────────────────────────────────────────────────────

const ZENITH_CFG = {
  internalScale:           0.50,
  lowInternalScale:        0.35,

  particleCount:           5200,
  lowParticleCount:        1600,

  /** Synchronous prewarm frames on wave reseed. Keep small to avoid freeze. */
  prewarmSteps:            120,
  lowPrewarmSteps:         35,

  /** Per-frame black-overlay alpha — lower = longer persistent trails. */
  fadeAlpha:               0.007,

  /** Stroke alpha per particle line segment. Low => colour emerges via accumulation. */
  trailAlpha:              0.060,
  lowTrailAlpha:           0.075,

  // ── Particle motion ──────────────────────────────────────────────────────────
  /** Base speed: internal px per second = IH * baseSpeed. */
  baseSpeed:               0.038,
  /** How strongly the normal-push force drives particles away from the line. */
  normalPush:              0.55,
  /** Amplitude of sinusoidal tangential drift (creates wavy paths). */
  tangentDrift:            0.28,
  /** Amplitude of velocity-curl perturbation (creates strand crossings). */
  curliness:               0.45,
  /** Weak attraction toward line — keeps strands lingering near the horizon. */
  linePull:                0.06,
  /** Per-frame velocity damping (at ~60 fps). */
  damping:                 0.990,

  // ── Particle lifetime ─────────────────────────────────────────────────────────
  /** Min lifetime in ticks (at ~60 fps). */
  minAge:                  180,
  /** Max lifetime in ticks. */
  maxAge:                  380,

  // ── Colour cycle ──────────────────────────────────────────────────────────────
  colorCycleMinMs:         5000,
  colorCycleMaxMs:         11000,

  // ── Valid line geometry ───────────────────────────────────────────────────────
  /** Both polygon regions must have at least this fraction of the total area. */
  waveLineMinAreaRatio:    0.10,
  lineReseedMaxAttempts:   48,

  // ── Horizon accent line ───────────────────────────────────────────────────────
  horizonLineAlpha:        0.55,
  horizonLineWidth:        1.2,

  /** Fade-in duration (ms) on first render after init. */
  fadeInMs:                1400,
} as const;

// ── Colour tables ────────────────────────────────────────────────────────────

/** Number of shade buckets per colour age (total buckets = 2 x N_SHADE_BUCKETS). */
const N_SHADE_BUCKETS = 8;
/** Total number of colour buckets. */
const N_BUCKETS = N_SHADE_BUCKETS * 2;

/**
 * Builds N_BUCKETS colour strings:
 *  Buckets 0-7: "light age" -- white-silver -> cyan -> teal -> blue (near -> far from line)
 *  Buckets 8-15: "dark age" -- white-rose -> magenta -> violet -> deep-violet
 */
function buildBucketColors(): string[] {
  const colors: string[] = [];

  // Light age (buckets 0-7)
  const lightHue   = [195, 190, 185, 182, 188, 200, 210, 220];
  const lightSat   = [15,  55,  75,  80,  80,  78,  72,  65];
  const lightLight = [90,  82,  72,  63,  55,  52,  47,  42];
  for (let b = 0; b < N_SHADE_BUCKETS; b++) {
    colors.push(`hsl(${lightHue[b]},${lightSat[b]}%,${lightLight[b]}%)`);
  }

  // Dark age (buckets 8-15)
  const darkHue   = [330, 315, 300, 305, 285, 270, 255, 240];
  const darkSat   = [20,  55,  72,  75,  72,  68,  64,  60];
  const darkLight = [90,  80,  68,  60,  56,  50,  46,  40];
  for (let b = 0; b < N_SHADE_BUCKETS; b++) {
    colors.push(`hsl(${darkHue[b]},${darkSat[b]}%,${darkLight[b]}%)`);
  }

  return colors;
}

// ── Perimeter geometry ────────────────────────────────────────────────────────
//
// The canvas perimeter is parameterised clockwise from (0, 0):
//   t in [0,    0.25): top edge,    left -> right,  y = 0
//   t in [0.25, 0.50): right edge,  top  -> bottom, x = W
//   t in [0.50, 0.75): bottom edge, right -> left,  y = H
//   t in [0.75, 1.00): left edge,   bottom -> top,  x = 0

/**
 * Returns the (x, y) position of perimeter parameter t in [0, 1).
 */
function samplePerimeter(t: number, W: number, H: number): [number, number] {
  t = ((t % 1) + 1) % 1;
  if (t < 0.25) return [t * 4 * W, 0];
  if (t < 0.50) return [W, (t - 0.25) * 4 * H];
  if (t < 0.75) return [W - (t - 0.50) * 4 * W, H];
  return [0, H - (t - 0.75) * 4 * H];
}

/**
 * Computes the area ratio of the "clockwise polygon" formed by walking from P1
 * to P2 along the perimeter (clockwise) and then straight back to P1.
 *
 * Returns the fraction [0, 1] of the total rectangle area on that side.
 * The other side has area (1 - returned value).
 * Uses the Shoelace / surveyor's formula -- exact, not an approximation.
 */
function splitAreaRatio(
  t1: number, t2: number,
  p1x: number, p1y: number,
  p2x: number, p2y: number,
  W: number, H: number,
): number {
  // Corner positions and their t-values (clockwise from top-left).
  const CORNER_T: readonly number[] = [0.25, 0.50, 0.75, 1.00];
  const CORNER_X: readonly number[] = [W,    W,    0,    0];
  const CORNER_Y: readonly number[] = [0,    H,    H,    0];

  // Clockwise arc length from t1 to t2.
  const span = ((t2 - t1) + 1) % 1 || 1;

  // Build the polygon: [P1, (corners strictly inside the arc), P2].
  const vx: number[] = [p1x];
  const vy: number[] = [p1y];

  for (let i = 0; i < 4; i++) {
    // Clockwise distance from t1 to this corner.
    const dt = ((CORNER_T[i] - t1) + 1) % 1;
    if (dt > 0 && dt < span) {
      vx.push(CORNER_X[i]);
      vy.push(CORNER_Y[i]);
    }
  }

  vx.push(p2x);
  vy.push(p2y);

  // Shoelace formula.
  const n = vx.length;
  let area = 0;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += vx[i] * vy[j] - vx[j] * vy[i];
  }

  return Math.abs(area) * 0.5 / (W * H);
}

// ── Seeded PRNG (mulberry32) ─────────────────────────────────────────────────

function mulberry32(seed: number): () => number {
  let s = (seed | 0) >>> 0;
  return function rand(): number {
    s = (s + 0x6D2B79F5) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 15), z | 1) >>> 0;
    z ^= z + Math.imul(z ^ (z >>> 7), z | 61) >>> 0;
    return ((z ^ (z >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Valid line generation ────────────────────────────────────────────────────

interface HorizonLine {
  /** Endpoint A in internal canvas coordinates. */
  ax: number; ay: number;
  /** Endpoint B in internal canvas coordinates. */
  bx: number; by: number;
  /** Perimeter t-value for endpoint A. */
  t1: number;
  /** Perimeter t-value for endpoint B. */
  t2: number;
  /** Normalised direction vector (B - A). */
  dx: number; dy: number;
  /** Normalised normal vector, rotated 90 degrees counterclockwise from direction. */
  nx: number; ny: number;
}

/**
 * Generates a valid horizon line for the given internal canvas dimensions using
 * rejection sampling seeded by waveSeed.  A line is valid when:
 *   - Both endpoints lie on the perimeter.
 *   - Both split polygons have area >= waveLineMinAreaRatio x total area.
 *   - The line is at least 20 % of min(IW, IH) long (avoids degenerate lines).
 *
 * Falls back to a safe diagonal if the attempt budget is exhausted.
 */
function generateValidLine(IW: number, IH: number, waveSeed: number): HorizonLine {
  const rand    = mulberry32(waveSeed);
  const minLen  = Math.min(IW, IH) * 0.20;
  const minArea = ZENITH_CFG.waveLineMinAreaRatio;

  for (let k = 0; k < ZENITH_CFG.lineReseedMaxAttempts; k++) {
    const t1 = rand();
    const t2 = rand();

    // Avoid t1 approximately equal to t2 (degenerate).
    const arc = ((t2 - t1) + 1) % 1;
    if (arc < 0.05 || arc > 0.95) continue;

    const [ax, ay] = samplePerimeter(t1, IW, IH);
    const [bx, by] = samplePerimeter(t2, IW, IH);

    const len = Math.hypot(bx - ax, by - ay);
    if (len < minLen) continue;

    const ratio = splitAreaRatio(t1, t2, ax, ay, bx, by, IW, IH);
    if (ratio < minArea || ratio > 1 - minArea) continue;

    const invLen = 1 / len;
    const dx = (bx - ax) * invLen;
    const dy = (by - ay) * invLen;
    // Normal: rotate direction 90 degrees counterclockwise.
    const nx = -dy;
    const ny =  dx;

    return { ax, ay, bx, by, t1, t2, dx, dy, nx, ny };
  }

  // Fallback: safe diagonal from (0, IH * 0.3) to (IW, IH * 0.7).
  const ax = 0;
  const ay = IH * 0.3;
  const bx = IW;
  const by = IH * 0.7;
  const len = Math.hypot(bx - ax, by - ay);
  const invLen = 1 / len;
  const dx = (bx - ax) * invLen;
  const dy = (by - ay) * invLen;
  return {
    ax, ay, bx, by,
    t1: 0.75 + (1 - ay / IH) * 0.25,
    t2: 0.25 + by / IH * 0.25,
    dx, dy, nx: -dy, ny: dx,
  };
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface ZenithBinaryHorizon {
  /**
   * Advance the simulation and render to the offscreen canvas.
   * Pass waveNumber so the effect can reseed the horizon line on wave change.
   */
  update(now: number, width: number, height: number, waveNumber?: number): void;
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

  const N           = isLow ? ZENITH_CFG.lowParticleCount  : ZENITH_CFG.particleCount;
  const renderScale = isLow ? ZENITH_CFG.lowInternalScale  : ZENITH_CFG.internalScale;
  const trailFade   = ZENITH_CFG.fadeAlpha;
  const strokeAlpha = isLow ? ZENITH_CFG.lowTrailAlpha     : ZENITH_CFG.trailAlpha;
  const prewarmSteps = isLow ? ZENITH_CFG.lowPrewarmSteps  : ZENITH_CFG.prewarmSteps;

  // ── Pre-allocated particle state ─────────────────────────────────────────────
  const pposx       = new Float32Array(N);   // current x
  const pposy       = new Float32Array(N);   // current y
  const pprevx      = new Float32Array(N);   // previous x
  const pprevy      = new Float32Array(N);   // previous y
  const pvelx       = new Float32Array(N);   // velocity x
  const pvely       = new Float32Array(N);   // velocity y
  const page        = new Uint16Array(N);    // age in steps
  const plife       = new Uint16Array(N);    // max life in steps
  const pseed       = new Float32Array(N);   // per-particle random seed [0, 1)
  const psideBias   = new Int8Array(N);      // +1 or -1 (normal-side assignment)
  const pcolorBucket = new Uint8Array(N);    // colour bucket index

  // Initialise per-particle seeds once (never reallocated).
  for (let i = 0; i < N; i++) pseed[i] = Math.random();

  const bucketColors = buildBucketColors();

  // ── Offscreen canvas ─────────────────────────────────────────────────────────
  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx:    CanvasRenderingContext2D | null = null;

  // Logical canvas dimensions.
  let W = 0;
  let H = 0;
  // Internal (down-scaled) dimensions.
  let IW = 0;
  let IH = 0;

  // ── Horizon line state ───────────────────────────────────────────────────────
  let lAx = 0; let lAy = 0;
  let lBx = 0; let lBy = 0;
  let lDx = 1; let lDy = 0;   // normalised direction (A -> B)
  let lNx = 0; let lNy = 1;   // normalised normal (perpendicular, CCW)

  // ── Timing / wave state ──────────────────────────────────────────────────────
  let lastTsMs:       number | null = null;
  let timeS:          number        = 0;
  let compositeAlpha: number        = 0;
  let initStartMs:    number | null = null;
  let lastWaveNumber: number        = -1;

  // ── Colour cycle ─────────────────────────────────────────────────────────────
  let colorPhase:   0 | 1 = 0;
  let colorNextMs:  number = 0;

  // ── Helpers ──────────────────────────────────────────────────────────────────

  /**
   * Signed distance of point (x, y) from the horizon line.
   * Positive => "normal side" (lN direction); negative => opposite side.
   */
  function signedDist(x: number, y: number): number {
    return (x - lAx) * lNx + (y - lAy) * lNy;
  }

  function spawnParticle(i: number, scatter: boolean): void {
    // Random position along the line.
    const tPos = Math.random();
    const wx = lAx + tPos * (lBx - lAx);
    const wy = lAy + tPos * (lBy - lAy);

    // Small jitter perpendicular to the line.
    const jitter = (Math.random() - 0.5) * 5.0;

    pposx[i]  = wx + lNx * jitter;
    pposy[i]  = wy + lNy * jitter;
    pprevx[i] = pposx[i];
    pprevy[i] = pposy[i];

    // Assign to one side of the line.
    psideBias[i] = Math.random() < 0.5 ? 1 : -1;

    // Initial speed -- scaled by canvas height.
    const spd = IH * ZENITH_CFG.baseSpeed * (0.6 + Math.random() * 0.8);
    const side = psideBias[i];
    pvelx[i] = side * lNx * spd + (Math.random() - 0.5) * spd * 0.4;
    pvely[i] = side * lNy * spd + (Math.random() - 0.5) * spd * 0.4;

    // Lifetime randomised per particle.
    plife[i] = ZENITH_CFG.minAge + Math.floor(pseed[i] * (ZENITH_CFG.maxAge - ZENITH_CFG.minAge));
    page[i]  = scatter ? Math.floor(Math.random() * plife[i]) : 0;

    // Colour bucket: colorPhase selects light vs dark palette.
    pcolorBucket[i] = colorPhase * N_SHADE_BUCKETS + Math.floor(pseed[i] * N_SHADE_BUCKETS);
  }

  /** Set the horizon line from a HorizonLine descriptor. */
  function applyLine(line: HorizonLine): void {
    lAx = line.ax; lAy = line.ay;
    lBx = line.bx; lBy = line.by;
    lDx = line.dx; lDy = line.dy;
    lNx = line.nx; lNy = line.ny;
  }

  /** Allocate offscreen canvas and seed all particles. */
  function init(w: number, h: number, waveSeed: number): void {
    W  = w;
    H  = h;
    IW = Math.max(1, Math.round(w * renderScale));
    IH = Math.max(1, Math.round(h * renderScale));

    offCanvas        = document.createElement('canvas');
    offCanvas.width  = IW;
    offCanvas.height = IH;
    offCtx           = offCanvas.getContext('2d')!;

    offCtx.fillStyle = '#000000';
    offCtx.fillRect(0, 0, IW, IH);

    applyLine(generateValidLine(IW, IH, waveSeed));

    for (let i = 0; i < N; i++) spawnParticle(i, true);
  }

  /** Regenerate horizon line, reseed particles, and prewarm the field. */
  function reseedWave(waveNumber: number, doPrewarm: boolean): void {
    if (!offCtx) return;

    offCtx.fillStyle = '#000000';
    offCtx.fillRect(0, 0, IW, IH);

    applyLine(generateValidLine(IW, IH, waveNumber * 7919 + 31337));

    for (let i = 0; i < N; i++) spawnParticle(i, true);

    if (doPrewarm) {
      const dt = 0.016;
      for (let s = 0; s < prewarmSteps; s++) {
        tickParticles(dt);
      }
    }
  }

  // ── Particle tick ─────────────────────────────────────────────────────────────
  //
  // One step of the particle simulation (dt in seconds).
  // Motion model (local line coordinates):
  //   - normal-push: drives particles away from the line on their assigned side
  //   - tangential drift (sinusoidal): creates wavy, strand-like paths
  //   - curl perturbation: rotates velocity, causing strand crossings
  //   - line-pull: weak attraction prevents too-fast dispersal

  function tickParticles(dt: number): void {
    if (!offCtx) return;

    // Fade accumulated trails.
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha              = trailFade;
    offCtx.fillStyle                = '#000000';
    offCtx.fillRect(0, 0, IW, IH);
    offCtx.globalAlpha = 1;

    const speedScale = IH * ZENITH_CFG.baseSpeed;
    const maxDist    = Math.min(IW, IH) * 0.68;

    for (let i = 0; i < N; i++) {
      page[i]++;
      if (
        page[i] >= plife[i] ||
        pposx[i] < -4 || pposx[i] > IW + 4 ||
        pposy[i] < -4 || pposy[i] > IH + 4
      ) {
        spawnParticle(i, false);
        continue;
      }

      pprevx[i] = pposx[i];
      pprevy[i] = pposy[i];

      const sd   = signedDist(pposx[i], pposy[i]);
      const absd = Math.abs(sd);
      const side = psideBias[i];
      const s    = pseed[i];
      const t    = timeS;

      // Normal-push force (drives particle away from line on its side).
      const normFactor = Math.max(0, 1 - absd / maxDist);
      const fNormal    = side * ZENITH_CFG.normalPush * normFactor;

      // Tangential sinusoidal drift (wavy paths).
      const fTangent =
        ZENITH_CFG.tangentDrift *
        Math.sin(s * 6.28 + t * 0.72 + absd * 0.018);

      // Weak line-pull (only when far from line).
      const pullFactor = Math.max(0, absd / maxDist - 0.45);
      const fPull      = -ZENITH_CFG.linePull * (sd / (absd || 1)) * pullFactor;

      // Transform forces from line-local to world space.
      const totalNormal = fNormal + fPull;
      const ax = (totalNormal * lNx + fTangent * lDx) * speedScale;
      const ay = (totalNormal * lNy + fTangent * lDy) * speedScale;

      pvelx[i] += ax * dt;
      pvely[i] += ay * dt;

      // Curl perturbation: rotate velocity.
      const curlAmt =
        ZENITH_CFG.curliness *
        Math.sin(t * 0.55 + s * 5.13 + pposx[i] * 0.009 + pposy[i] * 0.007);
      const ca  = Math.cos(curlAmt * dt);
      const sa  = Math.sin(curlAmt * dt);
      const cvx = pvelx[i] * ca - pvely[i] * sa;
      const cvy = pvelx[i] * sa + pvely[i] * ca;
      pvelx[i] = cvx;
      pvely[i] = cvy;

      // Velocity damping.
      pvelx[i] *= ZENITH_CFG.damping;
      pvely[i] *= ZENITH_CFG.damping;

      // Advance position.
      pposx[i] += pvelx[i] * dt;
      pposy[i] += pvely[i] * dt;
    }

    // ── Draw strands, batched by colour bucket ────────────────────────────────
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha              = strokeAlpha;
    offCtx.lineWidth                = 1.0;
    offCtx.lineCap                  = 'round';

    for (let b = 0; b < N_BUCKETS; b++) {
      offCtx.strokeStyle = bucketColors[b];
      offCtx.beginPath();
      for (let i = 0; i < N; i++) {
        if (pcolorBucket[i] !== b) continue;
        if (pprevx[i] === pposx[i] && pprevy[i] === pposy[i]) continue;
        offCtx.moveTo(pprevx[i], pprevy[i]);
        offCtx.lineTo(pposx[i],  pposy[i]);
      }
      offCtx.stroke();
    }
  }

  // ── Horizon accent line ───────────────────────────────────────────────────────

  function drawHorizonAccent(ts: number): void {
    if (!offCtx) return;

    const breathe = 0.50 + 0.50 * Math.sin(ts * 0.62);
    const alpha   = ZENITH_CFG.horizonLineAlpha * breathe;

    const accentColor = colorPhase === 0
      ? `rgba(80,220,255,${alpha.toFixed(3)})`
      : `rgba(220,80,255,${alpha.toFixed(3)})`;

    offCtx.globalCompositeOperation = 'lighter';
    offCtx.globalAlpha  = 1;
    offCtx.strokeStyle  = accentColor;
    offCtx.lineWidth    = ZENITH_CFG.horizonLineWidth;
    offCtx.lineCap      = 'round';
    offCtx.beginPath();
    offCtx.moveTo(lAx, lAy);
    offCtx.lineTo(lBx, lBy);
    offCtx.stroke();

    offCtx.globalCompositeOperation = 'source-over';
  }

  // ── Update ────────────────────────────────────────────────────────────────────

  function update(now: number, w: number, h: number, waveNumber = 0): void {
    const needsInit = !offCanvas || W !== w || H !== h;

    if (needsInit) {
      init(w, h, waveNumber * 7919 + 31337);
      compositeAlpha = 0;
      initStartMs    = now;
      lastTsMs       = null;
      lastWaveNumber = waveNumber;
      colorPhase     = 0;
      colorNextMs    = now + ZENITH_CFG.colorCycleMinMs +
        Math.random() * (ZENITH_CFG.colorCycleMaxMs - ZENITH_CFG.colorCycleMinMs);
      const dt = 0.016;
      for (let s = 0; s < prewarmSteps; s++) tickParticles(dt);
    } else if (waveNumber !== lastWaveNumber) {
      lastWaveNumber = waveNumber;
      reseedWave(waveNumber, true);
    }

    if (initStartMs === null) initStartMs = now;
    compositeAlpha = Math.min(1, (now - initStartMs) / ZENITH_CFG.fadeInMs);

    // Colour cycle.
    if (now >= colorNextMs) {
      colorPhase = colorPhase === 0 ? 1 : 0;
      colorNextMs = now + ZENITH_CFG.colorCycleMinMs +
        Math.random() * (ZENITH_CFG.colorCycleMaxMs - ZENITH_CFG.colorCycleMinMs);
    }

    const dt = lastTsMs === null ? 0.016 : Math.min((now - lastTsMs) / 1000, 0.05);
    lastTsMs = now;
    timeS   += dt;

    if (!offCtx) return;

    tickParticles(dt);
    drawHorizonAccent(timeS);

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
    lastTsMs       = null;
    initStartMs    = null;
    compositeAlpha = 0;
    timeS          = 0;
    lastWaveNumber = -1;
    colorPhase     = 0;
    colorNextMs    = 0;
  }

  function destroy(): void { reset(); }

  return { update, draw, reset, destroy };
}
