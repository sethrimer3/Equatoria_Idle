/**
 * zenith-binary-ring-background.ts — XScreenSaver BinaryRing faithful adaptation.
 *
 * Build 159: Algorithmically faithful TypeScript/Canvas port of the XScreenSaver
 * BinaryRing hack by Emilio Del Tessandoro and J. Tarbell (binaryring.c, 2006-2014).
 *
 * Core algorithm from the C source (binaryring.c):
 *   - N particles evenly seeded around a circular ring at startup
 *   - Each frame: position += velocity; velocity += rand(±1) * curliness * maxDv
 *     (unbounded Brownian walk — no force field, no damping)
 *   - Draw a very faint antialiased line from previous to current position
 *   - Draw the same line mirrored across the vertical center axis (bilateral symmetry):
 *       draw_line(w+xx, h+yy, w+x, h+y)   — forward
 *       draw_line(w-xx, h+yy, w-x, h+y)   — mirrored X only
 *   - Buffer is never hard-cleared — strands accumulate (very slow fade only)
 *   - Epoch alternates between Age of Light (pale strands) and Age of Darkness (dark strands)
 *   - Particles respawn at a random ring point with zero velocity after maxAge frames
 *
 * Previous implementation used a radial-outward + swirl field and visible ring geometry.
 * This version replaces the force field with the pure curliness Brownian walk of the original.
 */

export interface ZenithBinaryRingBackground {
  update(now: number, width: number, height: number, age: 'light' | 'dark'): void;
  draw(ctx: CanvasRenderingContext2D): void;
  reset(): void;
  destroy(): void;
}

const TAU = Math.PI * 2;

// ── Configuration ─────────────────────────────────────────────────────────────

const CFG = {
  internalScale:    0.50,   // offscreen canvas fraction of screen size
  lowInternalScale: 0.35,

  particleCount:    5000,   // binaryring.c default: 5000
  lowParticleCount: 1500,

  /** Ring spawn radius as fraction of min(IW, IH). binaryring.c default: 40px on a ~800px screen ≈ 5%. */
  ringRadiusRatio:  0.045,

  /** Initial particle speed px/frame at internal resolution (binaryring.c: max_initial_velocity = 2.0). */
  initialVelocity:  2.0,

  /** Curliness: random velocity perturbation per frame (binaryring.c: curliness = 0.5). */
  curliness:        0.5,

  /** Max per-frame delta-v magnitude (binaryring.c: max_dv = 1.0). */
  maxDv:            1.0,

  /** Frames before particle respawns (binaryring.c default: max_age = 400). */
  maxAge:           400,

  /** Stroke alpha for Age of Light strands — many faint lines accumulate to visible brightness. */
  lightAlpha:       0.12,

  /** Stroke alpha for Age of Darkness strands. */
  darkAlpha:        0.09,

  /** Per-frame fade: very slow decay so paths persist for many seconds (binaryring.c: no fade — we use minimal). */
  fadeAlpha:        0.008,

  /** Synchronous prewarm — run before first display so the field is populated. */
  prewarmSteps:     120,
  lowPrewarmSteps:   35,
} as const;

// ── Colour palettes ───────────────────────────────────────────────────────────

// Age of Light: ivory and warm-white tones drawn on the dark accumulation buffer.
// Cycles through buckets over time to add palette variety to the accumulated field.
const LIGHT_COLORS = [
  '#fffef0', '#fff8e0', '#fffae8',
  '#f8f2e0', '#fffff4', '#fdf0e4',
] as const;

// Age of Darkness: deep void colors — dark violet, charcoal-indigo, near-black.
// Drawn on the bright field accumulated during Age of Light.
const DARK_COLORS = [
  '#190d2e', '#1a0828', '#1e1030',
  '#160825', '#200a30', '#181028',
] as const;

// ── Factory ───────────────────────────────────────────────────────────────────

export function createZenithBinaryRingBackground(
  opts: { quality?: 'low' | 'medium' | 'high' } = {},
): ZenithBinaryRingBackground {
  const q        = opts.quality ?? 'high';
  const isLow    = q === 'low';
  const intScale = isLow ? CFG.lowInternalScale : CFG.internalScale;
  const N        = isLow ? CFG.lowParticleCount  : CFG.particleCount;
  const nPrewarm = isLow ? CFG.lowPrewarmSteps    : CFG.prewarmSteps;

  // ── Typed arrays — zero per-frame heap allocation ────────────────────────

  /** Current X position, relative to internal-canvas center. */
  const px  = new Float32Array(N);
  /** Current Y position, relative to internal-canvas center. */
  const py  = new Float32Array(N);
  /** Velocity X (px/frame, unbounded — accumulates via curliness). */
  const pvx = new Float32Array(N);
  /** Velocity Y (px/frame). */
  const pvy = new Float32Array(N);
  /** Age in frames since last spawn. */
  const pag = new Uint16Array(N);

  // ── Canvas / world state ─────────────────────────────────────────────────

  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx:    CanvasRenderingContext2D | null = null;
  let W = 0, H = 0, IW = 0, IH = 0;
  let cx = 0, cy = 0, ringRadius = 0;
  let frameIdx  = 0;
  let lastNow:  number | null = null;
  let currentAge: 'light' | 'dark' = 'light';

  // ── Particle management ──────────────────────────────────────────────────

  /**
   * Respawn particle i at a random point on the ring with zero velocity.
   * Matches binaryring.c respawn logic: sin/cos on random angle, vx=vy=0, age=0.
   */
  function spawnOnRing(i: number): void {
    const dir = Math.random() * TAU;
    px[i]  = ringRadius * Math.sin(dir);
    py[i]  = ringRadius * Math.cos(dir);
    pvx[i] = 0;
    pvy[i] = 0;
    pag[i] = 0;
  }

  /**
   * Seed all N particles evenly around the ring with directional velocities.
   * Matches binaryring.c create_particles + init_particle:
   *   emitx = ring_radius * sin(TAU * i/N)
   *   direction = PI * i / N
   *   vx = max_initial_velocity * cos(direction)
   */
  function initParticles(): void {
    for (let i = 0; i < N; i++) {
      const a   = TAU * i / N;
      px[i]     = ringRadius * Math.sin(a);
      py[i]     = ringRadius * Math.cos(a);
      const dir = Math.PI * i / N;
      pvx[i]    = CFG.initialVelocity * Math.cos(dir);
      pvy[i]    = CFG.initialVelocity * Math.sin(dir);
      // Stagger ages so particles don't all die simultaneously
      pag[i]    = Math.floor(Math.random() * CFG.maxAge);
    }
  }

  // ── Core simulation step ─────────────────────────────────────────────────

  /**
   * One simulation frame — faithfully mirrors binaryring.c move():
   *
   *   p->xx = p->x;  p->yy = p->y;
   *   p->x += p->vx; p->y += p->vy;
   *   p->vx += frand1() * curliness * max_dv;
   *   p->vy += frand1() * curliness * max_dv;
   *   draw_line(w+xx, h+yy, w+x, h+y, color, 0.15);   // forward
   *   draw_line(w-xx, h+yy, w-x, h+y, color, 0.15);   // mirrored
   *   age++; if age > maxAge: respawn on ring
   *
   * All N particles are batched into a single beginPath/stroke call.
   */
  function runStep(trailAlpha: number, colors: readonly string[]): void {
    if (!offCtx) return;
    const oc        = offCtx;
    const curliness = CFG.curliness;
    const maxDv     = CFG.maxDv;
    const maxAge    = CFG.maxAge;

    // Very slow fade — preserves accumulated paths for many seconds
    oc.globalAlpha = CFG.fadeAlpha;
    oc.fillStyle   = '#000000';
    oc.fillRect(0, 0, IW, IH);

    // Single stroke pass: all particles share one color per frame (cycles over time
    // so the accumulated buffer builds up palette variety across the field)
    oc.strokeStyle = colors[frameIdx % colors.length]!;
    oc.globalAlpha = trailAlpha;
    oc.lineWidth   = 0.75;
    oc.beginPath();

    for (let i = 0; i < N; i++) {
      // Save previous position (equivalent to p->xx = p->x)
      const ox = px[i]!;
      const oy = py[i]!;

      // Advance by velocity (p->x += p->vx)
      px[i] = ox + pvx[i]!;
      py[i] = oy + pvy[i]!;

      // Perturb velocity by curliness (p->vx += frand1() * curliness * max_dv)
      pvx[i] = pvx[i]! + (Math.random() * 2 - 1) * curliness * maxDv;
      pvy[i] = pvy[i]! + (Math.random() * 2 - 1) * curliness * maxDv;

      const nx = px[i]!;
      const ny = py[i]!;

      // Forward line: draw_line(w + xx, h + yy, w + x, h + y)
      oc.moveTo(cx + ox, cy + oy);
      oc.lineTo(cx + nx, cy + ny);

      // Mirrored line across vertical axis: draw_line(w - xx, h + yy, w - x, h + y)
      oc.moveTo(cx - ox, cy + oy);
      oc.lineTo(cx - nx, cy + ny);

      // Age the particle; respawn on ring when too old
      pag[i] = (pag[i]! + 1);
      if (pag[i]! > maxAge) spawnOnRing(i);
    }

    oc.stroke();
    oc.globalAlpha = 1;
    frameIdx++;
  }

  // ── Init / resize ────────────────────────────────────────────────────────

  function init(w: number, h: number): void {
    W = w; H = h;
    IW = Math.max(1, Math.round(w * intScale));
    IH = Math.max(1, Math.round(h * intScale));
    cx = IW * 0.5;
    cy = IH * 0.5;
    ringRadius = Math.min(IW, IH) * CFG.ringRadiusRatio;

    offCanvas         = document.createElement('canvas');
    offCanvas.width   = IW;
    offCanvas.height  = IH;
    offCtx            = offCanvas.getContext('2d');
    if (!offCtx) throw new Error('ZenithBinaryRingBackground: offscreen context unavailable');

    // Black starting field — Age of Light strands will accumulate on this
    offCtx.fillStyle = '#000000';
    offCtx.fillRect(0, 0, IW, IH);
    offCtx.lineCap  = 'round';
    offCtx.lineJoin = 'round';

    frameIdx = 0;
    lastNow  = null;
    initParticles();

    // Prewarm: run N steps so the field is partially developed on first display
    const colors     = currentAge === 'light' ? LIGHT_COLORS : DARK_COLORS;
    const trailAlpha = currentAge === 'light' ? CFG.lightAlpha : CFG.darkAlpha;
    for (let s = 0; s < nPrewarm; s++) runStep(trailAlpha, colors);
    offCtx.globalAlpha = 1;
  }

  function ensureInit(w: number, h: number): void {
    if (!offCanvas || !offCtx || w !== W || h !== H) init(w, h);
  }

  // ── Public API ────────────────────────────────────────────────────────────

  return {
    update(now: number, width: number, height: number, age: 'light' | 'dark'): void {
      ensureInit(width, height);
      if (!offCtx) return;

      currentAge = age;

      const prevNow = lastNow ?? now;
      const rawDtMs = now - prevNow;
      // Run the appropriate number of simulation steps for elapsed time.
      // Clamp to 1–3 steps to stay smooth across frame-rate variation.
      const steps = rawDtMs < 2 ? 1 : Math.min(3, Math.round(rawDtMs / (1000 / 60)));
      lastNow = now;

      const colors     = age === 'light' ? LIGHT_COLORS : DARK_COLORS;
      const trailAlpha = age === 'light' ? CFG.lightAlpha : CFG.darkAlpha;
      for (let s = 0; s < steps; s++) runStep(trailAlpha, colors);
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
      lastNow = null; frameIdx = 0;
    },

    destroy(): void { this.reset(); },
  };
}
