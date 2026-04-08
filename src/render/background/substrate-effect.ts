/**
 * SubstrateEffect
 *
 * Ambient background effect for Chapter 6 (Shin Spire).
 * Renders a "Substrate"-inspired crystalline crack pattern: slowly growing
 * angular, city-like geometric regions on a fully transparent canvas.
 * Inspired by the XScreenSaver "Substrate" by J. Tarbell (2004), but
 * optimised for beauty, subtlety, transparency, and real-time game use.
 *
 * Visual style
 * ------------
 * • Pale crystalline linework in whites, greys, and golds at ~20% opacity.
 * • Thin architectural boundaries with faint interior deposition texture.
 * • No background fill – canvas remains fully transparent.
 * • Elegant, sparse, and luminous – suitable behind menus or gameplay.
 *
 * Ported from Thero_Idle_TD / assets/playfield/render/SubstrateEffect.js
 */

// ─── Configurable parameters ──────────────────────────────────────────────────

/** Number of seed growth fronts placed at each cycle start. */
const SEED_COUNT = 6;

/** Maximum simultaneously active growth front tips. */
const MAX_FRONTS = 60;

/** Base growth speed (CSS pixels per second). Individual fronts vary ±30%. */
const GROWTH_SPEED = 65;

/** Probability [0,1] that a stopped front spawns a perpendicular branch. */
const BRANCH_PROBABILITY = 0.60;

/** Per-pixel probability of a sharp perpendicular turn in straight mode. */
const PERPENDICULAR_TURN_PROBABILITY = 0.008;

/** Probability that a newly created front uses arc (curve) mode. */
const ARC_PROBABILITY = 0.15;

/** Maximum age (seconds) before a front expires. Actual age varies ×0.5–1.5. */
const MAX_AGE = 120;

/** Number of interior deposition striation dots per growth pixel. */
const GRAIN_DENSITY = 6;

/** Half-width (px) of the interior deposition scatter band. */
const DEPOSITION_WIDTH = 40;

/** Alpha of edge (crack line) pixels on the off-screen canvas. */
const EDGE_OPACITY = 0.70;

/** Maximum alpha of a single interior deposition grain. */
const INTERIOR_OPACITY = 0.025;

/** Width (px) of edge line pixels. Chalk-like – slightly thicker for texture. */
const LINE_WIDTH = 1.2;

/** Overall compositing alpha applied when blitting to the main canvas. */
const COMPOSITE_ALPHA = 0.20;

/** Duration (ms) of the gentle fade-in at each cycle's start. */
const FADE_IN_MS = 3000;

/** Arc curvature half-range (rad / pixel). Actual rate is random within ±. */
const ARC_RATE_RANGE = 0.012;

/** Grid sentinel: no growth front has claimed this cell yet. */
const GRID_EMPTY = -10001;

// ─── Undraw (tail-erase) parameters ──────────────────────────────────────────

/** Maximum simultaneously visible trail pixels before the tail starts erasing. */
const TRAIL_MAX_VISIBLE = 80000;

/** Radius (px) of the destination-out eraser brush at each trail point. */
const ERASE_RADIUS = 2.5;

/** Speed multiplier for undraw relative to the front's growth speed. */
const UNDRAW_SPEED_FACTOR = 1.2;

/**
 * Minimum trail pixels a stopped front must have drawn before it is allowed
 * to spawn perpendicular branches.
 */
const MINIMUM_TRAIL_FOR_BRANCH = 5;

/**
 * Maximum number of completed (stopped) lines that may persist visibly on the
 * canvas at one time.
 */
const MAX_LINES_BEFORE_UNDRAW = 120;

// ─── Collision glow parameters ────────────────────────────────────────────────

/** Total duration (ms) of the golden collision-glow effect. */
const COLLISION_GLOW_DURATION_MS = 3000;

/** Duration (ms) for the glow to ramp from zero to peak intensity (attack phase). */
const COLLISION_GLOW_PEAK_MS = 400;

/** Number of trail points back from the collision that the glow gradient covers. */
const COLLISION_GLOW_TRAIL_LENGTH = 180;

/** Peak alpha of the golden glow stroke at the exact collision point. */
const COLLISION_GLOW_MAX_ALPHA = 0.30;

/** Stroke width (px) of the golden glow drawn over the trail. */
const COLLISION_GLOW_LINE_WIDTH = 4.5;

// ─── Color palette ────────────────────────────────────────────────────────────

interface PaletteColor {
  r: number;
  g: number;
  b: number;
}

const PALETTE: readonly PaletteColor[] = [
  { r: 255, g: 255, b: 255 },  // Pure white
  { r: 248, g: 245, b: 238 },  // Warm white
  { r: 210, g: 210, b: 210 },  // Soft grey
  { r: 190, g: 195, b: 200 },  // Cool grey
  { r: 235, g: 225, b: 190 },  // Pale gold
  { r: 215, g: 205, b: 180 },  // Warm gold-grey
];

// ─── Internal types ───────────────────────────────────────────────────────────

type FrontMode = 'straight' | 'arc';

interface TrailPoint {
  x: number;
  y: number;
}

interface CollisionGlow {
  active: boolean;
  age: number;
  trailEndIdx: number;
}

interface GrowthFront {
  x: number;
  y: number;
  angle: number;
  speed: number;
  age: number;
  maxAge: number;
  colorR: number;
  colorG: number;
  colorB: number;
  edgeFillStyle: string;
  baseColorStyle: string;
  mode: FrontMode;
  arcRate: number;
  alive: boolean;
  growing: boolean;
  trail: TrailPoint[];
  undrawIndex: number;
  stoppedOrder: number;
  undrawStarted: boolean;
  collisionGlow: CollisionGlow | null;
  lastGx: number;
  lastGy: number;
}

// ─── Pure helpers ─────────────────────────────────────────────────────────────

function randomPaletteColor(): PaletteColor {
  return PALETTE[Math.floor(Math.random() * PALETTE.length)];
}

/**
 * Return an angle quantised to a multiple of π/2 with small jitter (±0.075 rad).
 * This produces the city-block / crystal-lattice perpendicular alignments.
 */
function quantisedAngle(): number {
  const base = Math.floor(Math.random() * 4) * (Math.PI / 2);
  return base + (Math.random() - 0.5) * 0.15;
}

function createFront(x: number, y: number, angle: number, mode: FrontMode): GrowthFront {
  const col = randomPaletteColor();
  return {
    x,
    y,
    angle,
    speed: GROWTH_SPEED * (0.7 + Math.random() * 0.6),
    age: 0,
    maxAge: MAX_AGE * (0.5 + Math.random()),
    colorR: col.r,
    colorG: col.g,
    colorB: col.b,
    edgeFillStyle: `rgba(${col.r},${col.g},${col.b},${EDGE_OPACITY})`,
    baseColorStyle: `rgb(${col.r},${col.g},${col.b})`,
    mode,
    arcRate: (Math.random() - 0.5) * 2 * ARC_RATE_RANGE,
    alive: true,
    growing: true,
    trail: [],
    undrawIndex: 0,
    stoppedOrder: -1,
    undrawStarted: false,
    collisionGlow: null,
    lastGx: Math.round(x),
    lastGy: Math.round(y),
  };
}

// ─── Public interface ─────────────────────────────────────────────────────────

export interface SubstrateEffect {
  /** Advance the simulation and prepare for drawing. */
  update(now: number, width: number, height: number): void;
  /** Draw to the provided canvas context. */
  draw(ctx: CanvasRenderingContext2D): void;
  /** Reset the effect (e.g., on resize). */
  reset(): void;
  /** Clean up resources. */
  destroy(): void;
}

// ─── Factory ──────────────────────────────────────────────────────────────────

export function createSubstrateEffect(
  { quality = 'high' }: { quality?: 'low' | 'medium' | 'high' } = {},
): SubstrateEffect {
  // ── Quality-scaled workload parameters ──────────────────────────────────
  const isLow    = quality === 'low';
  const isMedium = quality === 'medium';

  const effectSeedCount    = isLow ? 3  : isMedium ? 4  : SEED_COUNT;
  const effectMaxFronts    = isLow ? 20 : isMedium ? 35 : MAX_FRONTS;
  const effectGrainDensity = isLow ? 0  : isMedium ? 3  : GRAIN_DENSITY;

  // Off-screen canvas accumulates the crystalline pattern over time.
  let offCanvas: HTMLCanvasElement | null = null;
  let offCtx: CanvasRenderingContext2D | null = null;

  // Occupancy grid: cgrid[y * W + x] = front angle at that pixel, or GRID_EMPTY.
  let cgrid: Float32Array | null = null;

  // Logical viewport dimensions.
  let W = 0;
  let H = 0;

  let fronts: GrowthFront[] = [];

  let lastTs: number | null = null;

  // Initial fade-in alpha multiplier (0 → 1).
  let compositeAlpha = 0;
  let initStartMs: number | null = null;

  // Monotonically increasing counter assigned to each front when it first stops.
  let nextStoppedOrder = 0;

  // Cached count of actively growing fronts.
  let growingCount = 0;

  // ── Initialisation ──────────────────────────────────────────────────────

  function init(w: number, h: number): void {
    W = Math.ceil(w);
    H = Math.ceil(h);

    nextStoppedOrder = 0;
    growingCount     = 0;

    offCanvas        = document.createElement('canvas');
    offCanvas.width  = W;
    offCanvas.height = H;
    offCtx           = offCanvas.getContext('2d')!;
    offCtx.clearRect(0, 0, W, H);

    cgrid = new Float32Array(W * H);
    cgrid.fill(GRID_EMPTY);

    fronts = [];

    for (let i = 0; i < effectSeedCount; i++) {
      spawnRandom();
    }
  }

  // ── Front spawning ───────────────────────────────────────────────────────

  function spawnRandom(): void {
    if (growingCount >= effectMaxFronts) return;
    const x     = 10 + Math.random() * (W - 20);
    const y     = 10 + Math.random() * (H - 20);
    const angle = quantisedAngle();
    const mode: FrontMode = Math.random() < ARC_PROBABILITY ? 'arc' : 'straight';
    fronts.push(createFront(x, y, angle, mode));
    growingCount++;
  }

  function spawnPerp(xi: number, yi: number, hitAngle: number): void {
    if (growingCount >= effectMaxFronts) return;
    const perp = hitAngle + (Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2);
    const ox = xi + Math.cos(perp) * 2;
    const oy = yi + Math.sin(perp) * 2;
    if (ox < 0 || ox >= W || oy < 0 || oy >= H) return;
    const mode: FrontMode = Math.random() < ARC_PROBABILITY ? 'arc' : 'straight';
    fronts.push(createFront(ox, oy, perp, mode));
    growingCount++;
  }

  // ── Growth front simulation ──────────────────────────────────────────────

  function stepFront(front: GrowthFront, growthSteps: number, dtSec: number): void {
    if (!front.growing) return;

    front.age += dtSec;
    if (front.age >= front.maxAge) {
      front.stoppedOrder = nextStoppedOrder++;
      front.growing = false;
      growingCount = Math.max(0, growingCount - 1);
      return;
    }

    // Extract grid reference once at function boundary.
    const grid = cgrid!;

    let dx = Math.cos(front.angle);
    let dy = Math.sin(front.angle);

    for (let s = 0; s < growthSteps; s++) {
      if (front.mode === 'arc') {
        front.angle += front.arcRate;
        dx = Math.cos(front.angle);
        dy = Math.sin(front.angle);
      }

      if (front.mode === 'straight' &&
          Math.random() < PERPENDICULAR_TURN_PROBABILITY) {
        front.angle += Math.random() < 0.5 ? Math.PI / 2 : -Math.PI / 2;
        dx = Math.cos(front.angle);
        dy = Math.sin(front.angle);
      }

      front.x += dx;
      front.y += dy;

      const xi = Math.round(front.x);
      const yi = Math.round(front.y);

      if (xi < 0 || xi >= W || yi < 0 || yi >= H) {
        front.stoppedOrder = nextStoppedOrder++;
        front.growing = false;
        growingCount = Math.max(0, growingCount - 1);
        return;
      }

      if (xi === front.lastGx && yi === front.lastGy) continue;

      front.lastGx = xi;
      front.lastGy = yi;

      const idx = yi * W + xi;

      if (grid[idx] !== GRID_EMPTY) {
        front.stoppedOrder = nextStoppedOrder++;
        front.growing = false;
        growingCount = Math.max(0, growingCount - 1);
        front.collisionGlow = {
          active:      true,
          age:         0,
          trailEndIdx: front.trail.length,
        };
        if (front.trail.length >= MINIMUM_TRAIL_FOR_BRANCH) {
          if (Math.random() < BRANCH_PROBABILITY) {
            spawnPerp(xi, yi, grid[idx]);
          }
          if (Math.random() < BRANCH_PROBABILITY * 0.3) {
            spawnPerp(xi, yi, grid[idx]);
          }
        }
        return;
      }

      grid[idx] = front.angle;

      drawEdgePixel(front.x, front.y, front.edgeFillStyle);

      if (effectGrainDensity > 0) {
        drawDeposition(front.x, front.y, front.angle, front.baseColorStyle);
      }

      front.trail.push({ x: front.x, y: front.y });
    }
  }

  // ── Off-screen canvas drawing ────────────────────────────────────────────

  function drawEdgePixel(x: number, y: number, fillStyle: string): void {
    const ctx = offCtx!;
    ctx.fillStyle = fillStyle;
    ctx.globalAlpha = 0.70 + Math.random() * 0.30;
    ctx.fillRect(x - LINE_WIDTH / 2, y - LINE_WIDTH / 2, LINE_WIDTH, LINE_WIDTH);
    if (Math.random() < 0.35) {
      const gx = x + (Math.random() - 0.5) * LINE_WIDTH * 2.5;
      const gy = y + (Math.random() - 0.5) * LINE_WIDTH * 2.5;
      ctx.globalAlpha = 0.15 + Math.random() * 0.15;
      ctx.fillRect(gx, gy, 1, 1);
    }
    ctx.globalAlpha = 1;
  }

  function drawDeposition(cx: number, cy: number, angle: number, baseColorStyle: string): void {
    const ctx = offCtx!;
    const px = -Math.sin(angle);
    const py =  Math.cos(angle);

    ctx.fillStyle = baseColorStyle;

    for (let i = 0; i < effectGrainDensity; i++) {
      const t  = (Math.random() * 2 - 1) * DEPOSITION_WIDTH;
      const gx = cx + px * t;
      const gy = cy + py * t;

      if (gx < 0 || gx >= W || gy < 0 || gy >= H) continue;

      const fade  = 1 - Math.abs(t) / DEPOSITION_WIDTH;
      const alpha = INTERIOR_OPACITY * fade * fade * (0.3 + Math.random() * 0.7);

      ctx.globalAlpha = alpha;
      ctx.fillRect(gx, gy, 1, 1);
    }

    ctx.globalAlpha = 1;
  }

  // ── Tail-erase ("undraw") ────────────────────────────────────────────────

  function undrawFront(front: GrowthFront, steps: number): void {
    if (!offCtx || front.undrawIndex >= front.trail.length) return;

    offCtx.save();
    offCtx.globalCompositeOperation = 'destination-out';
    offCtx.fillStyle = 'rgba(0,0,0,1)';

    const limit = Math.min(front.undrawIndex + steps, front.trail.length);

    offCtx.beginPath();
    for (let i = front.undrawIndex; i < limit; i++) {
      const pt = front.trail[i];
      offCtx.moveTo(pt.x + ERASE_RADIUS, pt.y);
      offCtx.arc(pt.x, pt.y, ERASE_RADIUS, 0, Math.PI * 2);

      const xi = Math.round(pt.x);
      const yi = Math.round(pt.y);
      if (xi >= 0 && xi < W && yi >= 0 && yi < H) {
        cgrid![yi * W + xi] = GRID_EMPTY;
      }
    }
    offCtx.fill();
    offCtx.restore();

    front.undrawIndex = limit;
  }

  // ── Update ───────────────────────────────────────────────────────────────

  function update(now: number, w: number, h: number): void {
    const needsInit = !offCanvas || W !== Math.ceil(w) || H !== Math.ceil(h);
    if (needsInit) {
      init(w, h);
      compositeAlpha = 0;
      initStartMs    = now;
      lastTs         = null;
    }

    if (initStartMs === null) initStartMs = now;

    const dtSec = lastTs === null ? 0.016 : Math.min((now - lastTs) / 1000, 0.1);
    lastTs = now;

    compositeAlpha = Math.min(1, (now - initStartMs) / FADE_IN_MS);

    for (const front of fronts) {
      if (!front.alive) continue;
      if (front.growing) {
        const growthSteps = Math.max(1, Math.round(front.speed * dtSec));
        stepFront(front, growthSteps, dtSec);
      }
    }

    // Enforce per-front pixel cap on growing fronts.
    for (const front of fronts) {
      if (!front.alive || !front.growing) continue;
      const visibleCount = front.trail.length - front.undrawIndex;
      if (visibleCount > TRAIL_MAX_VISIBLE) {
        undrawFront(front, visibleCount - TRAIL_MAX_VISIBLE);
      }
    }

    // Advance collision-glow age and expire finished glows.
    for (const front of fronts) {
      const glow = front.collisionGlow;
      if (!glow?.active) continue;
      glow.age += dtSec;
      if (glow.age >= COLLISION_GLOW_DURATION_MS / 1000) {
        glow.active = false;
      }
    }

    // Count stopped fronts that have not begun erasing; schedule oldest if over cap.
    let persistentCount = 0;
    for (const front of fronts) {
      if (front.alive && !front.growing && !front.undrawStarted) persistentCount++;
    }

    if (persistentCount > MAX_LINES_BEFORE_UNDRAW) {
      const toStart = persistentCount - MAX_LINES_BEFORE_UNDRAW;
      const stopped: GrowthFront[] = [];
      for (const front of fronts) {
        if (front.alive && !front.growing && !front.undrawStarted && front.stoppedOrder >= 0) {
          stopped.push(front);
        }
      }
      stopped.sort((a, b) => a.stoppedOrder - b.stoppedOrder);
      for (let i = 0; i < Math.min(toStart, stopped.length); i++) {
        stopped[i].undrawStarted = true;
      }
    }

    // Advance erase animation for fronts whose undraw has started.
    for (const front of fronts) {
      if (!front.alive || front.growing || !front.undrawStarted) continue;
      const visibleCount = front.trail.length - front.undrawIndex;
      if (visibleCount > 0) {
        const eraseSteps = Math.max(1, Math.round(front.speed * UNDRAW_SPEED_FACTOR * dtSec));
        undrawFront(front, eraseSteps);
      }
      if (front.undrawIndex >= front.trail.length) {
        front.alive = false;
      }
    }

    // Mark stopped fronts with empty trails as dead.
    for (const front of fronts) {
      if (!front.alive || front.growing) continue;
      if (front.trail.length === 0) front.alive = false;
    }

    // Remove dead fronts.
    fronts = fronts.filter(f => f.alive);

    // Re-seed if actively-growing count drops below threshold.
    const needed = Math.max(0, effectSeedCount - growingCount);
    for (let i = 0; i < needed; i++) {
      spawnRandom();
    }
  }

  // ── Draw ─────────────────────────────────────────────────────────────────

  function draw(ctx: CanvasRenderingContext2D): void {
    if (!offCanvas || compositeAlpha <= 0) return;

    ctx.save();
    ctx.globalAlpha = compositeAlpha * COMPOSITE_ALPHA;
    ctx.drawImage(offCanvas, 0, 0);
    ctx.restore();

    // Collision glow overlays
    for (const front of fronts) {
      const glow = front.collisionGlow;
      if (!glow?.active) continue;

      const trail = front.trail;
      const glowEndIdx = Math.min(glow.trailEndIdx, trail.length) - 1;
      if (glowEndIdx < 0) continue;

      const glowStartIdx = Math.max(
        front.undrawIndex,
        glowEndIdx - COLLISION_GLOW_TRAIL_LENGTH + 1,
      );
      if (glowStartIdx > glowEndIdx) continue;

      const startPt = trail[glowStartIdx];
      const endPt   = trail[glowEndIdx];
      if (!startPt || !endPt) continue;

      const duration = COLLISION_GLOW_DURATION_MS / 1000;
      const peakTime = COLLISION_GLOW_PEAK_MS / 1000;
      let timeFade: number;
      if (glow.age < peakTime) {
        timeFade = glow.age / peakTime;
      } else {
        timeFade = 1 - (glow.age - peakTime) / (duration - peakTime);
      }
      timeFade = Math.max(0, Math.min(1, timeFade));

      const alpha = COLLISION_GLOW_MAX_ALPHA * timeFade * compositeAlpha;
      if (alpha <= 0.001) continue;

      const grad = ctx.createLinearGradient(startPt.x, startPt.y, endPt.x, endPt.y);
      grad.addColorStop(0, 'rgba(255,240,200,0)');
      grad.addColorStop(1, `rgba(255,240,200,${alpha.toFixed(3)})`);

      ctx.save();
      ctx.strokeStyle = grad;
      ctx.lineWidth   = COLLISION_GLOW_LINE_WIDTH;
      ctx.lineCap     = 'round';
      ctx.lineJoin    = 'round';
      ctx.globalAlpha = 1;
      ctx.beginPath();
      ctx.moveTo(startPt.x, startPt.y);
      for (let i = glowStartIdx + 1; i <= glowEndIdx; i++) {
        ctx.lineTo(trail[i].x, trail[i].y);
      }
      ctx.stroke();
      ctx.restore();
    }
  }

  // ── Reset ────────────────────────────────────────────────────────────────

  function reset(): void {
    offCanvas        = null;
    offCtx           = null;
    cgrid            = null;
    fronts           = [];
    W                = 0;
    H                = 0;
    lastTs           = null;
    initStartMs      = null;
    compositeAlpha   = 0;
    nextStoppedOrder = 0;
    growingCount     = 0;
  }

  function destroy(): void {
    reset();
  }

  return { update, draw, reset, destroy };
}
