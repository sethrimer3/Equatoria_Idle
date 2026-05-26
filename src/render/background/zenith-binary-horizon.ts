/**
 * zenith-binary-horizon.ts — Reworked Binary Horizon background for the Zenith sublevel.
 *
 * Inspired by the XScreenSaver "Binary Horizon" concept (Patrick Leiser, J. Tarbell,
 * Emilio Del Tessandoro, 2021): a system of path-tracing particles evolves continuously
 * from initial horizon lines, alternating between colour ages.
 *
 * Wave presentation
 * ─────────────────
 * Each Zenith wave begins with 1–5 sequential cut effects.  Each cut slices across the
 * screen from one edge-perimeter point to another, leaves a persistent luminous horizon
 * line, and triggers a brief screen shake.  Particles then emerge from all completed
 * source lines.  At wave end the field collapses back into the cut lines before clearing
 * for the next wave.
 *
 * Phase state machine
 * ───────────────────
 *   'cutting'   — Sequentially animating each cut.
 *   'active'    — Normal particle evolution from all source lines.
 *   'collapsing'— Particles converge back toward source lines; buffer drains.
 *   'cleared'   — Buffer is blank; ready for the next wave.
 *
 * Geometry rule
 * ─────────────
 * Every cut line must leave at least 10 % of the rectangle area on both sides.
 * A precise Shoelace-based polygon area test is used — no weak heuristics.
 *
 * Performance model
 * ─────────────────
 * • One persistent offscreen canvas; faded each frame with a low-alpha black rect.
 * • All particle state lives in typed arrays; zero per-frame heap allocation.
 * • Source-line data stored in fixed-length typed arrays (max 5 lines).
 * • Colour-bucket batching: only N_BUCKETS strokeStyle changes per frame.
 * • Bounded prewarm pass (after cuts complete) so the field is populated quickly.
 * • Low-graphics mode reduces particle count, prewarm, glow, and collapse work.
 */

// ── Configuration ─────────────────────────────────────────────────────────────

const ZENITH_BINARY_HORIZON_CONFIG = {
  internalScale:           0.50,
  lowInternalScale:        0.35,

  particleCount:           5200,
  lowParticleCount:        1600,

  /** Synchronous prewarm frames after all cuts complete. Keep small to avoid freeze. */
  prewarmSteps:            80,
  lowPrewarmSteps:         24,

  /** Per-frame black-overlay alpha — lower = longer persistent trails. */
  fadeAlpha:               0.007,

  /** Stroke alpha per particle line segment. Low => colour emerges via accumulation. */
  trailAlpha:              0.060,
  lowTrailAlpha:           0.075,

  // ── Particle motion ──────────────────────────────────────────────────────────
  baseSpeed:               0.038,
  normalPush:              0.55,
  tangentDrift:            0.28,
  curliness:               0.45,
  linePull:                0.06,
  damping:                 0.990,

  // ── Particle lifetime ─────────────────────────────────────────────────────────
  minAge:                  180,
  maxAge:                  380,

  // ── Colour cycle ──────────────────────────────────────────────────────────────
  colorCycleMinMs:         5000,
  colorCycleMaxMs:         11000,

  // ── Valid line geometry ───────────────────────────────────────────────────────
  waveLineMinAreaRatio:    0.10,
  lineReseedMaxAttempts:   64,

  // ── Multi-line similarity rejection ─────────────────────────────────────────
  /** |dot(d1,d2)| threshold: reject if parallel AND close in position. */
  multiLineSimilarityAngleThreshold:    0.18,
  /** Fraction of max(IW,IH): reject if centre-to-line distance < this. */
  multiLineSimilarityDistanceThreshold: 0.08,

  // ── Cut count per wave ───────────────────────────────────────────────────────
  minCutsPerWave: 1,
  maxCutsPerWave: 5,

  // ── Cut animation ────────────────────────────────────────────────────────────
  cutDurationMinMs: 90,
  cutDurationMaxMs: 220,
  cutGapMinMs:      60,
  cutGapMaxMs:      160,

  /** Alpha of the animated cut head line on the main canvas. */
  cutLineAlpha:     0.65,
  /** Alpha of the persistent completed-line accent drawn on the offscreen canvas. */
  completedLineAlpha: 0.22,
  cutLineWidth:     1.5,
  cutHeadGlowRadius: 8,

  // ── Screen shake per cut ─────────────────────────────────────────────────────
  cutShakeDurationMs:   120,
  cutShakeMinAmplitude:   2,
  cutShakeMaxAmplitude:   6,

  // ── Collapse ─────────────────────────────────────────────────────────────────
  collapseDurationMs:        1100,
  collapseAttraction:        0.18,
  collapseFadeAlpha:         0.035,
  collapseLineFadeStartRatio: 0.72,

  // ── Horizon accent line (source lines during 'active' phase) ─────────────────
  horizonLineAlpha: 0.55,
  horizonLineWidth: 1.2,

  /** Fade-in duration (ms) on first render after init. */
  fadeInMs: 1400,
} as const;

// Alias for internal use (shorter name).
const CFG = ZENITH_BINARY_HORIZON_CONFIG;

// ── Phase type ───────────────────────────────────────────────────────────────

type ZenithHorizonPhase = 'cutting' | 'active' | 'collapsing' | 'cleared';

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

/** Safe diagonal fallback. */
function makeFallbackLine(IW: number, IH: number): HorizonLine {
  const ax = 0,  ay = IH * 0.3;
  const bx = IW, by = IH * 0.7;
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

/**
 * Attempts one candidate line using the given rand function.
 * Returns the line or null if validation fails.
 */
function tryOneLine(
  IW: number, IH: number, rand: () => number,
  minLen: number, minArea: number,
): HorizonLine | null {
  const t1 = rand();
  const t2 = rand();
  const arc = ((t2 - t1) + 1) % 1;
  if (arc < 0.05 || arc > 0.95) return null;

  const [ax, ay] = samplePerimeter(t1, IW, IH);
  const [bx, by] = samplePerimeter(t2, IW, IH);

  const len = Math.hypot(bx - ax, by - ay);
  if (len < minLen) return null;

  const ratio = splitAreaRatio(t1, t2, ax, ay, bx, by, IW, IH);
  if (ratio < minArea || ratio > 1 - minArea) return null;

  const invLen = 1 / len;
  const dx = (bx - ax) * invLen;
  const dy = (by - ay) * invLen;
  return { ax, ay, bx, by, t1, t2, dx, dy, nx: -dy, ny: dx };
}

/**
 * Generates a single valid horizon line seeded by waveSeed.
 * Falls back to a safe diagonal if the attempt budget is exhausted.
 */
function generateValidLine(IW: number, IH: number, waveSeed: number): HorizonLine {
  const rand    = mulberry32(waveSeed);
  const minLen  = Math.min(IW, IH) * 0.20;
  const minArea = CFG.waveLineMinAreaRatio;

  for (let k = 0; k < CFG.lineReseedMaxAttempts; k++) {
    const line = tryOneLine(IW, IH, rand, minLen, minArea);
    if (line) return line;
  }
  return makeFallbackLine(IW, IH);
}

/**
 * Generates 1–count distinct horizon lines for the given internal canvas dimensions.
 *
 * Uses a single deterministic PRNG seeded by waveSeed.  Lines are tested for:
 *   - Basic validity (area ≥ 10%, length ≥ 20% of min(IW,IH)).
 *   - Similarity: if a candidate is nearly parallel to and positionally close to
 *     an already-accepted line, it is rejected.
 *
 * If fewer than count lines can be found within the attempt budget, fewer are returned.
 * The returned array always has at least 1 element.
 */
function generateMultipleValidLines(
  IW: number, IH: number, waveSeed: number, count: number,
): HorizonLine[] {
  const rand    = mulberry32(waveSeed);
  const minLen  = Math.min(IW, IH) * 0.20;
  const minArea = CFG.waveLineMinAreaRatio;
  const maxDim  = Math.max(IW, IH);
  const angleThresh = CFG.multiLineSimilarityAngleThreshold;
  const distThresh  = CFG.multiLineSimilarityDistanceThreshold;
  const attemptsPerLine = CFG.lineReseedMaxAttempts;
  const result: HorizonLine[] = [];

  for (let n = 0; n < count; n++) {
    for (let k = 0; k < attemptsPerLine; k++) {
      const line = tryOneLine(IW, IH, rand, minLen, minArea);
      if (!line) continue;

      // Similarity check against already-accepted lines.
      let tooSimilar = false;
      for (const existing of result) {
        const dotAbs = Math.abs(line.dx * existing.dx + line.dy * existing.dy);
        if (dotAbs > 1 - angleThresh) {
          const cx  = (line.ax + line.bx) * 0.5;
          const cy  = (line.ay + line.by) * 0.5;
          const dist = Math.abs(
            (cx - existing.ax) * existing.nx + (cy - existing.ay) * existing.ny,
          );
          if (dist / maxDim < distThresh) { tooSimilar = true; break; }
        }
      }
      if (!tooSimilar) { result.push(line); break; }
    }
  }

  if (result.length === 0) result.push(makeFallbackLine(IW, IH));
  return result;
}

// ── Public interface ──────────────────────────────────────────────────────────

export interface ZenithBinaryHorizon {
  /**
   * Advance the simulation and render to the offscreen canvas.
   * Pass waveNumber so the effect can detect a wave change on first creation.
   */
  update(now: number, width: number, height: number, waveNumber?: number): void;
  /** Composite the offscreen canvas into the provided 2-D context. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Discard all state so the effect re-initialises on the next update call. */
  reset(): void;
  /** Release all allocated resources. */
  destroy(): void;
  /**
   * Begin a new wave: generate 1–5 cuts and start the cutting sequence.
   * Call this when isInterWave transitions to false in Zenith.
   */
  beginZenithBinaryHorizonWave(waveNumber: number): void;
  /**
   * End the current wave: enter collapsing phase.
   * Call this when isInterWave transitions to true in Zenith.
   */
  endZenithBinaryHorizonWave(): void;
  /** Returns the current screen-shake offset (logical px) for the calling renderer. */
  getShakeOffset(): { x: number; y: number };
  /** Enable/disable screen shake (forwards setting.isScreenShakeEnabled). */
  setScreenShakeEnabled(enabled: boolean): void;
}

// ── Factory ───────────────────────────────────────────────────────────────────

export function createZenithBinaryHorizon(
  { quality = 'high' }: { quality?: 'low' | 'medium' | 'high' } = {},
): ZenithBinaryHorizon {

  const isLow       = quality === 'low';
  const N           = isLow ? CFG.lowParticleCount : CFG.particleCount;
  const renderScale = isLow ? CFG.lowInternalScale  : CFG.internalScale;
  const trailFade   = CFG.fadeAlpha;
  const strokeAlpha = isLow ? CFG.lowTrailAlpha     : CFG.trailAlpha;
  const prewarmSteps = isLow ? CFG.lowPrewarmSteps  : CFG.prewarmSteps;

  // ── Pre-allocated particle state (typed arrays — zero heap alloc per frame) ──
  const pposx        = new Float32Array(N);   // current x (internal coords)
  const pposy        = new Float32Array(N);   // current y
  const pprevx       = new Float32Array(N);   // previous x
  const pprevy       = new Float32Array(N);   // previous y
  const pvelx        = new Float32Array(N);   // velocity x
  const pvely        = new Float32Array(N);   // velocity y
  const page         = new Uint16Array(N);    // age in steps
  const plife        = new Uint16Array(N);    // max life in steps
  const pseed        = new Float32Array(N);   // per-particle deterministic seed [0,1)
  const psideBias    = new Int8Array(N);      // +1 or -1 (normal-side assignment)
  const pcolorBucket = new Uint8Array(N);     // colour bucket index
  const psrcLine     = new Int8Array(N);      // which source-line this particle belongs to

  // Initialise per-particle seeds once (never reallocated).
  for (let i = 0; i < N; i++) pseed[i] = Math.random();

  const bucketColors = buildBucketColors();

  // ── Source-line state (flat typed arrays, max 5 lines) ───────────────────────
  const MAX_LINES = 5;
  const lineAx = new Float32Array(MAX_LINES);
  const lineAy = new Float32Array(MAX_LINES);
  const lineBx = new Float32Array(MAX_LINES);
  const lineBy = new Float32Array(MAX_LINES);
  const lineDx = new Float32Array(MAX_LINES);
  const lineDy = new Float32Array(MAX_LINES);
  const lineNx = new Float32Array(MAX_LINES);
  const lineNy = new Float32Array(MAX_LINES);
  let completedLineCount = 0;

  // ── Offscreen accumulation canvas ────────────────────────────────────────────
  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx:    CanvasRenderingContext2D | null = null;

  // Logical canvas dimensions (world space).
  let W = 0;
  let H = 0;
  // Internal (downscaled) canvas dimensions.
  let IW = 0;
  let IH = 0;

  // ── Phase state machine ───────────────────────────────────────────────────────
  let horizonPhase: ZenithHorizonPhase = 'active';

  // ── Cut-animation state ───────────────────────────────────────────────────────
  // Small JavaScript object (not hot-path): allocated once during wave begin.
  let pendingCuts:      HorizonLine[] = [];   // cuts not yet animated
  let currentCut:       HorizonLine | null = null;  // cut currently being animated
  let cutHeadT          = 0;    // progress along current cut [0, 1]
  let cutElapsedMs      = 0;
  let cutDurationMs     = 0;
  let gapElapsedMs      = 0;
  let gapDurationMs     = 0;
  let isInCutGap        = false;

  // ── Collapse state ────────────────────────────────────────────────────────────
  let collapseElapsedMs = 0;

  // ── Timing / wave ─────────────────────────────────────────────────────────────
  let lastTsMs:       number | null = null;
  let timeS:          number        = 0;
  let compositeAlpha: number        = 0;
  let initStartMs:    number | null = null;

  // ── Colour cycle ──────────────────────────────────────────────────────────────
  let colorPhase:  0 | 1 = 0;
  let colorNextMs: number = 0;

  // ── Screen shake ─────────────────────────────────────────────────────────────
  let shakeEnabled    = true;
  let shakeX          = 0;
  let shakeY          = 0;
  let shakeRemainingMs = 0;
  let shakeAmplitude  = 0;
  let shakeDecayMs    = 1;   // total duration of current shake (for normalisation)
  let shakeTimeS      = 0;

  // ── Helpers ───────────────────────────────────────────────────────────────────

  /** Signed distance of (x, y) from source line lineIdx.  + => normal direction. */
  function signedDistToLine(x: number, y: number, li: number): number {
    return (x - lineAx[li]) * lineNx[li] + (y - lineAy[li]) * lineNy[li];
  }

  /**
   * Write source-line data from a HorizonLine descriptor into the flat typed arrays
   * at index li.
   */
  function storeLine(line: HorizonLine, li: number): void {
    lineAx[li] = line.ax; lineAy[li] = line.ay;
    lineBx[li] = line.bx; lineBy[li] = line.by;
    lineDx[li] = line.dx; lineDy[li] = line.dy;
    lineNx[li] = line.nx; lineNy[li] = line.ny;
  }

  /**
   * Spawn particle i on a random completed source line with small jitter.
   * If scatter=true, start age at a random position in the lifecycle.
   */
  function spawnParticle(i: number, scatter: boolean): void {
    const li = completedLineCount > 1
      ? Math.floor(Math.random() * completedLineCount)
      : 0;
    psrcLine[i] = li;

    const tPos = Math.random();
    const ax   = lineAx[li], ay = lineAy[li];
    const bx   = lineBx[li], by = lineBy[li];
    const nx   = lineNx[li], ny = lineNy[li];

    const wx = ax + tPos * (bx - ax);
    const wy = ay + tPos * (by - ay);
    const jitter = (Math.random() - 0.5) * 5.0;

    pposx[i]  = wx + nx * jitter;
    pposy[i]  = wy + ny * jitter;
    pprevx[i] = pposx[i];
    pprevy[i] = pposy[i];

    psideBias[i] = Math.random() < 0.5 ? 1 : -1;

    const spd  = IH * CFG.baseSpeed * (0.6 + Math.random() * 0.8);
    const side = psideBias[i];
    pvelx[i]   = side * nx * spd + (Math.random() - 0.5) * spd * 0.4;
    pvely[i]   = side * ny * spd + (Math.random() - 0.5) * spd * 0.4;

    plife[i] = CFG.minAge + Math.floor(pseed[i] * (CFG.maxAge - CFG.minAge));
    page[i]  = scatter ? Math.floor(Math.random() * plife[i]) : 0;

    pcolorBucket[i] = colorPhase * N_SHADE_BUCKETS + Math.floor(pseed[i] * N_SHADE_BUCKETS);
  }

  // ── Offscreen canvas init ─────────────────────────────────────────────────────

  /** (Re-)create the offscreen canvas for the given logical dimensions. */
  function initCanvas(w: number, h: number): void {
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
  }

  /** Clear the offscreen canvas to black. */
  function clearOffscreen(): void {
    if (!offCtx) return;
    offCtx.globalAlpha              = 1;
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.fillStyle                = '#000000';
    offCtx.fillRect(0, 0, IW, IH);
  }

  // ── Particle tick — normal 'active' mode ──────────────────────────────────────
  //
  // Motion model per particle (local to its source line):
  //   normal-push : drives away from line on assigned side
  //   tangent-drift: sinusoidal wavy paths
  //   curl        : rotates velocity, creates strand crossings
  //   line-pull   : weak attraction prevents excessive dispersal

  function tickParticlesActive(dt: number): void {
    if (!offCtx) return;

    // Fade accumulated trails.
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha              = trailFade;
    offCtx.fillStyle                = '#000000';
    offCtx.fillRect(0, 0, IW, IH);
    offCtx.globalAlpha = 1;

    const speedScale = IH * CFG.baseSpeed;
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

      const li   = psrcLine[i];
      const sd   = signedDistToLine(pposx[i], pposy[i], li);
      const absd = Math.abs(sd);
      const side = psideBias[i];
      const s    = pseed[i];
      const t    = timeS;

      const normFactor = Math.max(0, 1 - absd / maxDist);
      const fNormal    = side * CFG.normalPush * normFactor;

      const fTangent =
        CFG.tangentDrift * Math.sin(s * 6.28 + t * 0.72 + absd * 0.018);

      const pullFactor = Math.max(0, absd / maxDist - 0.45);
      const fPull      = -CFG.linePull * (sd / (absd || 1)) * pullFactor;

      const totalNormal = fNormal + fPull;
      const fax = (totalNormal * lineNx[li] + fTangent * lineDx[li]) * speedScale;
      const fay = (totalNormal * lineNy[li] + fTangent * lineDy[li]) * speedScale;

      pvelx[i] += fax * dt;
      pvely[i] += fay * dt;

      // Curl perturbation.
      const curlAmt =
        CFG.curliness * Math.sin(t * 0.55 + s * 5.13 + pposx[i] * 0.009 + pposy[i] * 0.007);
      const ca  = Math.cos(curlAmt * dt);
      const sa  = Math.sin(curlAmt * dt);
      const cvx = pvelx[i] * ca - pvely[i] * sa;
      const cvy = pvelx[i] * sa + pvely[i] * ca;
      pvelx[i]  = cvx;
      pvely[i]  = cvy;

      pvelx[i] *= CFG.damping;
      pvely[i] *= CFG.damping;

      pposx[i] += pvelx[i] * dt;
      pposy[i] += pvely[i] * dt;
    }

    // Draw strands batched by colour bucket.
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

  // ── Particle tick — 'collapsing' mode ────────────────────────────────────────
  //
  // Particles are attracted toward their assigned source line.
  // No respawn; they fade into the line and vanish.

  function tickParticlesCollapse(dt: number, collapseAlpha: number): void {
    if (!offCtx) return;

    // Stronger fade during collapse so the accumulated field drains away.
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha              = CFG.collapseFadeAlpha;
    offCtx.fillStyle                = '#000000';
    offCtx.fillRect(0, 0, IW, IH);
    offCtx.globalAlpha = 1;

    const attractForce = CFG.collapseAttraction * IH;

    for (let i = 0; i < N; i++) {
      pprevx[i] = pposx[i];
      pprevy[i] = pposy[i];

      const li  = psrcLine[i];
      // Nearest point on source line segment.
      const ax = lineAx[li], ay = lineAy[li];
      const bx = lineBx[li], by = lineBy[li];
      const dx = lineDx[li], dy = lineDy[li];
      const len = Math.hypot(bx - ax, by - ay);
      const tp  = len > 0
        ? Math.max(0, Math.min(1, ((pposx[i] - ax) * dx + (pposy[i] - ay) * dy) / len))
        : 0;
      const npx = ax + tp * (bx - ax);
      const npy = ay + tp * (by - ay);

      const toX = npx - pposx[i];
      const toY = npy - pposy[i];
      const dist = Math.hypot(toX, toY);

      if (dist > 0.5) {
        const invD = 1 / dist;
        pvelx[i] += (toX * invD) * attractForce * dt;
        pvely[i] += (toY * invD) * attractForce * dt;
      } else {
        pvelx[i] *= 0.5;
        pvely[i] *= 0.5;
      }

      pvelx[i] *= CFG.damping;
      pvely[i] *= CFG.damping;

      pposx[i] += pvelx[i] * dt;
      pposy[i] += pvely[i] * dt;
    }

    // Draw collapse inward-streaks batched by colour bucket.
    offCtx.globalCompositeOperation = 'source-over';
    // Alpha fades to 0 as collapse completes.
    offCtx.globalAlpha = strokeAlpha * Math.max(0, 1 - collapseAlpha);
    offCtx.lineWidth   = 1.0;
    offCtx.lineCap     = 'round';

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

    offCtx.globalAlpha = 1;
  }

  // ── Draw source-line accents on the offscreen canvas ─────────────────────────

  /** Draw all completed source lines as faint luminous accents on the offscreen canvas. */
  function drawSourceLineAccents(alphaScale: number): void {
    if (!offCtx || completedLineCount === 0) return;
    const accentColor = colorPhase === 0
      ? 'rgba(80,220,255,1)'
      : 'rgba(220,80,255,1)';

    offCtx.globalCompositeOperation = 'lighter';
    offCtx.globalAlpha  = CFG.horizonLineAlpha * (0.50 + 0.50 * Math.sin(timeS * 0.62)) * alphaScale;
    offCtx.strokeStyle  = accentColor;
    offCtx.lineWidth    = CFG.horizonLineWidth;
    offCtx.lineCap      = 'round';

    for (let li = 0; li < completedLineCount; li++) {
      offCtx.beginPath();
      offCtx.moveTo(lineAx[li], lineAy[li]);
      offCtx.lineTo(lineBx[li], lineBy[li]);
      offCtx.stroke();
    }

    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha = 1;
  }

  // ── Cut-line drawing on the MAIN canvas (not accumulated) ────────────────────

  /**
   * Draw the animated cut currently in-progress directly on mainCtx.
   * Rendered at logical (unscaled) coordinates so it appears crisp.
   */
  function drawCutOverlay(mainCtx: CanvasRenderingContext2D, scaleX: number, scaleY: number): void {
    if (!currentCut || horizonPhase !== 'cutting' || isInCutGap) return;

    const cut = currentCut;
    // Position of the cut-head in logical canvas pixels.
    const headX = (cut.ax + cutHeadT * (cut.bx - cut.ax)) * scaleX;
    const headY = (cut.ay + cutHeadT * (cut.by - cut.ay)) * scaleY;
    const fromX = cut.ax * scaleX;
    const fromY = cut.ay * scaleY;

    const accentColor = colorPhase === 0
      ? `rgba(120,240,255,${CFG.cutLineAlpha})`
      : `rgba(255,120,240,${CFG.cutLineAlpha})`;

    mainCtx.save();
    mainCtx.globalCompositeOperation = 'lighter';
    mainCtx.strokeStyle = accentColor;
    mainCtx.lineWidth   = CFG.cutLineWidth;
    mainCtx.lineCap     = 'round';
    mainCtx.beginPath();
    mainCtx.moveTo(fromX, fromY);
    mainCtx.lineTo(headX, headY);
    mainCtx.stroke();

    // Cut-head glow (skip in low-graphics).
    if (!isLow) {
      const glowColor = colorPhase === 0
        ? 'rgba(180,255,255,0.8)'
        : 'rgba(255,180,255,0.8)';
      mainCtx.strokeStyle = glowColor;
      mainCtx.lineWidth   = CFG.cutLineWidth * 2.5;
      mainCtx.beginPath();
      mainCtx.arc(headX, headY, 2, 0, Math.PI * 2);
      mainCtx.stroke();
    }
    mainCtx.restore();
  }

  // ── Screen shake ─────────────────────────────────────────────────────────────

  function triggerShake(amplitude: number): void {
    if (!shakeEnabled) return;
    shakeAmplitude   = amplitude;
    shakeDecayMs     = CFG.cutShakeDurationMs;
    shakeRemainingMs = CFG.cutShakeDurationMs;
  }

  function tickShake(deltaMs: number): void {
    if (shakeRemainingMs <= 0) { shakeX = 0; shakeY = 0; return; }
    shakeRemainingMs = Math.max(0, shakeRemainingMs - deltaMs);
    shakeTimeS      += deltaMs * 0.001;
    const t   = shakeRemainingMs / shakeDecayMs;          // 1→0 as shake decays
    const amp = shakeAmplitude * t;
    shakeX    = Math.cos(shakeTimeS * 18 * Math.PI * 2) * amp;
    shakeY    = Math.sin(shakeTimeS * 13 * Math.PI * 2) * amp;
  }

  // ── Completed-line persistent accent bake ────────────────────────────────────

  /**
   * Bake a faint completed-line trace into the offscreen canvas immediately.
   * Called once when a cut completes.
   */
  function bakeCompletedLine(li: number): void {
    if (!offCtx) return;
    const accentColor = colorPhase === 0
      ? `rgba(80,220,255,${CFG.completedLineAlpha})`
      : `rgba(220,80,255,${CFG.completedLineAlpha})`;

    offCtx.globalCompositeOperation = 'lighter';
    offCtx.globalAlpha  = 1;
    offCtx.strokeStyle  = accentColor;
    offCtx.lineWidth    = CFG.cutLineWidth;
    offCtx.lineCap      = 'round';
    offCtx.beginPath();
    offCtx.moveTo(lineAx[li], lineAy[li]);
    offCtx.lineTo(lineBx[li], lineBy[li]);
    offCtx.stroke();
    offCtx.globalCompositeOperation = 'source-over';
    offCtx.globalAlpha = 1;
  }

  // ── Cut-sequence state machine ────────────────────────────────────────────────

  /**
   * Advance the cut sequence by deltaMs.
   * Returns true when the full sequence has completed (→ enter 'active').
   */
  function tickCutSequence(deltaMs: number): boolean {
    if (isInCutGap) {
      gapElapsedMs += deltaMs;
      if (gapElapsedMs >= gapDurationMs) {
        isInCutGap = false;
        // Start next cut if any remain, otherwise sequence is done.
        if (pendingCuts.length > 0) {
          startNextCut();
        } else {
          return true; // sequence complete
        }
      }
      return false;
    }

    if (!currentCut) return true;

    cutElapsedMs += deltaMs;
    cutHeadT      = Math.min(1, cutElapsedMs / cutDurationMs);

    if (cutElapsedMs >= cutDurationMs) {
      // Cut complete — store the line.
      const li = completedLineCount;
      storeLine(currentCut, li);
      completedLineCount++;
      bakeCompletedLine(li);

      // Trigger screen shake.
      const amp = CFG.cutShakeMinAmplitude +
        Math.random() * (CFG.cutShakeMaxAmplitude - CFG.cutShakeMinAmplitude);
      triggerShake(amp);

      currentCut = null;

      if (pendingCuts.length === 0) {
        // Last cut done, no gap needed.
        return true;
      }
      // Enter gap before next cut.
      isInCutGap   = true;
      gapElapsedMs = 0;
      gapDurationMs = CFG.cutGapMinMs + Math.random() * (CFG.cutGapMaxMs - CFG.cutGapMinMs);
    }
    return false;
  }

  /** Begin animating the next pending cut. */
  function startNextCut(): void {
    if (pendingCuts.length === 0) return;
    currentCut   = pendingCuts.shift()!;
    cutHeadT     = 0;
    cutElapsedMs = 0;
    cutDurationMs = CFG.cutDurationMinMs +
      Math.random() * (CFG.cutDurationMaxMs - CFG.cutDurationMinMs);
  }

  // ── Init / reseed helpers ─────────────────────────────────────────────────────

  /** First-time init: create canvas, generate a single default line, go straight to active. */
  function initDefault(w: number, h: number, waveSeed: number): void {
    initCanvas(w, h);

    const line = generateValidLine(IW, IH, waveSeed);
    storeLine(line, 0);
    completedLineCount = 1;

    for (let i = 0; i < N; i++) spawnParticle(i, true);

    horizonPhase = 'active';
  }

  // ── Full update ───────────────────────────────────────────────────────────────

  function update(now: number, w: number, h: number, waveNumber = 0): void {
    // (Re-)initialise if canvas is missing or logical dimensions changed.
    const needsInit = !offCanvas || W !== w || H !== h;
    if (needsInit) {
      initDefault(w, h, waveNumber * 7919 + 31337);
      compositeAlpha = 0;
      initStartMs    = now;
      lastTsMs       = null;
      colorPhase     = 0;
      colorNextMs    = now + CFG.colorCycleMinMs +
        Math.random() * (CFG.colorCycleMaxMs - CFG.colorCycleMinMs);
      // Prewarm the field so it isn't completely blank on first frame.
      const dtPre = 0.016;
      for (let s = 0; s < prewarmSteps; s++) tickParticlesActive(dtPre);
    }

    if (initStartMs === null) initStartMs = now;
    compositeAlpha = Math.min(1, (now - initStartMs) / CFG.fadeInMs);

    // Colour cycle.
    if (now >= colorNextMs) {
      colorPhase  = colorPhase === 0 ? 1 : 0;
      colorNextMs = now + CFG.colorCycleMinMs +
        Math.random() * (CFG.colorCycleMaxMs - CFG.colorCycleMinMs);
    }

    const dt      = lastTsMs === null ? 0.016 : Math.min((now - lastTsMs) / 1000, 0.05);
    const deltaMs = dt * 1000;
    lastTsMs      = now;
    timeS        += dt;

    tickShake(deltaMs);

    if (!offCtx) return;

    // ── Per-phase rendering ───────────────────────────────────────────────────
    switch (horizonPhase) {

      case 'cutting': {
        // Tick particles from already-completed lines during cut sequence
        // (limited emission — gives a sense of life emerging from each cut).
        if (completedLineCount > 0) {
          tickParticlesActive(dt);
        } else {
          // No completed lines yet: just fade the canvas.
          offCtx.globalCompositeOperation = 'source-over';
          offCtx.globalAlpha = trailFade;
          offCtx.fillStyle   = '#000000';
          offCtx.fillRect(0, 0, IW, IH);
          offCtx.globalAlpha = 1;
        }

        const done = tickCutSequence(deltaMs);
        if (done) {
          // All cuts complete — prewarm a bit then go active.
          const dtPre = 0.016;
          for (let s = 0; s < prewarmSteps; s++) tickParticlesActive(dtPre);
          horizonPhase = 'active';
        }
        break;
      }

      case 'active': {
        tickParticlesActive(dt);
        drawSourceLineAccents(1.0);
        break;
      }

      case 'collapsing': {
        collapseElapsedMs += deltaMs;
        const collapseDuration = isLow
          ? CFG.collapseDurationMs * 0.6
          : CFG.collapseDurationMs;
        const collapseRatio = Math.min(1, collapseElapsedMs / collapseDuration);

        tickParticlesCollapse(dt, collapseRatio);

        // Draw source-line accents, fading near end of collapse.
        const lineFadeStart = CFG.collapseLineFadeStartRatio;
        const lineAlpha = collapseRatio > lineFadeStart
          ? 1 - (collapseRatio - lineFadeStart) / (1 - lineFadeStart)
          : 1.0;
        if (lineAlpha > 0.01) drawSourceLineAccents(lineAlpha);

        if (collapseRatio >= 1) {
          clearOffscreen();
          horizonPhase = 'cleared';
        }
        break;
      }

      case 'cleared': {
        // Nothing to render; the canvas is blank and waiting for beginZenithBinaryHorizonWave.
        break;
      }
    }

    offCtx.globalAlpha              = 1;
    offCtx.globalCompositeOperation = 'source-over';
  }

  // ── Draw ──────────────────────────────────────────────────────────────────────

  function draw(mainCtx: CanvasRenderingContext2D): void {
    if (!offCanvas || compositeAlpha <= 0) return;
    if (horizonPhase === 'cleared') return;

    // Scale factors from internal coords to logical world coords.
    const scaleX = W / IW;
    const scaleY = H / IH;

    mainCtx.save();
    mainCtx.globalAlpha = compositeAlpha;
    mainCtx.drawImage(offCanvas, 0, 0, IW, IH, 0, 0, W, H);
    mainCtx.restore();

    // Overlay the in-progress cut animation at full logical resolution.
    if (horizonPhase === 'cutting') {
      drawCutOverlay(mainCtx, scaleX, scaleY);
    }
  }

  // ── Public lifecycle methods ──────────────────────────────────────────────────

  function beginZenithBinaryHorizonWave(waveNumber: number): void {
    // Ensure canvas exists (it may not if called before the first update).
    if (!offCanvas) return;

    const waveSeed = (waveNumber * 7919 + 31337) >>> 0;

    // Determine cut count for this wave using the seeded PRNG.
    const rng = mulberry32(waveSeed);
    const cutCount = CFG.minCutsPerWave +
      Math.floor(rng() * (CFG.maxCutsPerWave - CFG.minCutsPerWave + 1));

    // Generate the cuts for this wave (using a different sub-seed so cut count
    // draw doesn't interfere with line-placement draw).
    const lineSeed = (waveSeed ^ 0xDEADBEEF) >>> 0;
    const lines    = generateMultipleValidLines(IW, IH, lineSeed, cutCount);

    // Reset accumulation buffer — the cuts should reveal a clean canvas.
    clearOffscreen();

    // Reset source-line state.
    completedLineCount = 0;
    // Reset particle source lines (will be reassigned as cuts complete).
    // Park all particles at index 0 (we'll have at least 1 line eventually).
    for (let i = 0; i < N; i++) psrcLine[i] = 0;

    // Prepare cut-animation state.
    pendingCuts   = lines.slice();  // copy so we can shift safely
    currentCut    = null;
    isInCutGap    = false;
    gapElapsedMs  = 0;
    cutElapsedMs  = 0;
    cutHeadT      = 0;

    horizonPhase  = 'cutting';

    // Begin animating the first cut immediately.
    startNextCut();
  }

  function endZenithBinaryHorizonWave(): void {
    if (horizonPhase === 'cutting' || horizonPhase === 'active') {
      // If we're still cutting, snap all pending cuts as instantly completed.
      // This avoids leaving an incomplete cut sequence hanging at wave-end.
      if (horizonPhase === 'cutting') {
        // Complete any unfinished cut.
        if (currentCut && completedLineCount < MAX_LINES) {
          const li = completedLineCount;
          storeLine(currentCut, li);
          completedLineCount++;
          bakeCompletedLine(li);
          currentCut = null;
        }
        // Complete all remaining pending cuts instantly.
        while (pendingCuts.length > 0 && completedLineCount < MAX_LINES) {
          const nextCut = pendingCuts.shift()!;
          const li      = completedLineCount;
          storeLine(nextCut, li);
          completedLineCount++;
          bakeCompletedLine(li);
        }
        pendingCuts  = [];
        isInCutGap   = false;
      }

      collapseElapsedMs = 0;
      horizonPhase      = 'collapsing';

      // Respawn all particles on the completed lines for a cleaner collapse visual.
      if (completedLineCount > 0) {
        for (let i = 0; i < N; i++) spawnParticle(i, true);
      }
    }
  }

  // ── Reset / Destroy ───────────────────────────────────────────────────────────

  function reset(): void {
    offCanvas           = null;
    offCtx              = null;
    W = H = IW = IH     = 0;
    lastTsMs            = null;
    initStartMs         = null;
    compositeAlpha      = 0;
    timeS               = 0;
    colorPhase          = 0;
    colorNextMs         = 0;
    horizonPhase        = 'active';
    completedLineCount  = 0;
    pendingCuts         = [];
    currentCut          = null;
    isInCutGap          = false;
    cutElapsedMs        = 0;
    cutHeadT            = 0;
    collapseElapsedMs   = 0;
    shakeX = shakeY     = 0;
    shakeRemainingMs    = 0;
  }

  function destroy(): void { reset(); }

  return {
    update,
    draw,
    reset,
    destroy,
    beginZenithBinaryHorizonWave,
    endZenithBinaryHorizonWave,
    getShakeOffset(): { x: number; y: number } { return { x: shakeX, y: shakeY }; },
    setScreenShakeEnabled(enabled: boolean): void { shakeEnabled = enabled; },
  };
}
