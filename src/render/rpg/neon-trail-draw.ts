/**
 * neon-trail-draw.ts — Efficient neon particle trail rendering system.
 *
 * Provides two-pass rendering for trails stored in ring buffers:
 *   1. Glow pass  — accumulated on a module-level half-resolution offscreen canvas,
 *                   then composited onto the main canvas with additive blending.
 *   2. Core pass  — smooth tapered quadratic-bezier curve drawn directly on the
 *                   main canvas with graduated lineWidth + alpha.
 *
 * Performance guarantees:
 *   - Zero per-frame heap allocations inside the trail drawing functions.
 *   - One glow canvas resize only when the main canvas dimensions change.
 *   - One drawImage compositing call per `endNeonGlowBatch` invocation.
 *   - Glow canvas is half the main canvas size to minimise fill-rate cost.
 *   - Smooth quadratic bezier curves via the midpoint technique — no gradient
 *     objects are created per frame.
 *
 * Integration pattern:
 *   beginNeonGlowBatch(mainCtx)   // clears offscreen glow canvas for this frame
 *   for each trail entity:
 *     drawNeonTrailGlow(trailX, trailY, ..., cfg, headAlpha)   // writes to glow canvas
 *     drawNeonTrailCore(mainCtx, trailX, trailY, ..., cfg, headAlpha) // draws on main
 *   endNeonGlowBatch(mainCtx)     // composites glow → main canvas with 'lighter' blend
 *
 * The system is designed to be reusable: any projectile that stores a
 * Float64Array ring-buffer trail (trailX/trailY + trailHead + trailCount)
 * can use these functions by providing a NeonTrailConfig.
 */

// ── Trail configuration ─────────────────────────────────────────────────────

/**
 * Visual configuration for a neon trail.
 *
 * Create configs at module level (const) so they are never reallocated
 * per frame.
 */
export interface NeonTrailConfig {
  /** Core color — the bright, sharp center line. CSS hex string. */
  coreColor: string;
  /** Glow color — the soft additive halo layer. CSS hex string. */
  glowColor: string;
  /**
   * lineWidth at the trail head (newest point) for the core pass (px, main
   * canvas coordinate space).  Should be ≥ coreTailWidth.
   */
  coreHeadWidth: number;
  /**
   * lineWidth at the trail tail (oldest point) for the core pass (px, main
   * canvas coordinate space).  Should be > 0.
   */
  coreTailWidth: number;
  /**
   * lineWidth for the glow pass (px, glow canvas coordinate space).
   * Because the glow canvas is rendered at GLOW_SCALE resolution, this
   * value is multiplied by GLOW_SCALE before stroking, and the resulting
   * image is stretched back to full size on composite — producing a
   * naturally soft, blurry halo.
   */
  glowWidth: number;
  /**
   * Number of sub-paths used for the core taper effect.
   * Higher = smoother graduation.  Recommended: 3–5.  Min: 1.
   */
  taperSegments: number;
}

// ── Glow canvas (module-level, reused across frames) ───────────────────────

/** Resolution multiplier for the offscreen glow canvas. 0.5 = half size. */
const GLOW_SCALE = 0.5;

let _glowCanvas: HTMLCanvasElement | null = null;
let _glowCtx: CanvasRenderingContext2D | null = null;
let _glowW = 0;
let _glowH = 0;

/**
 * Must be called once per frame before any `drawNeonTrailGlow` calls.
 *
 * Creates the offscreen glow canvas on first call; resizes it if the main
 * canvas changed dimensions; clears it for the new frame.
 */
export function beginNeonGlowBatch(mainCtx: CanvasRenderingContext2D): void {
  const mainW = mainCtx.canvas.width;
  const mainH = mainCtx.canvas.height;
  const w = Math.max(1, Math.ceil(mainW * GLOW_SCALE));
  const h = Math.max(1, Math.ceil(mainH * GLOW_SCALE));
  if (!_glowCanvas) {
    _glowCanvas = document.createElement('canvas');
    _glowCtx = _glowCanvas.getContext('2d')!;
  }
  if (_glowW !== w || _glowH !== h) {
    // Assigning canvas dimensions clears the canvas automatically.
    _glowCanvas.width  = w;
    _glowCanvas.height = h;
    _glowW = w;
    _glowH = h;
  } else {
    _glowCtx!.clearRect(0, 0, _glowW, _glowH);
  }
}

/**
 * Must be called once per frame after all `drawNeonTrailGlow` calls.
 *
 * Composites the accumulated glow canvas onto the main canvas using
 * additive ('lighter') blending — overlapping glows add up naturally,
 * producing a brighter, more luminous look where trails cross.
 */
export function endNeonGlowBatch(mainCtx: CanvasRenderingContext2D): void {
  if (!_glowCanvas || _glowW === 0 || _glowH === 0) return;
  mainCtx.save();
  mainCtx.globalCompositeOperation = 'lighter';
  mainCtx.globalAlpha = 1;
  // Stretch the half-resolution glow canvas back to full main canvas size.
  mainCtx.drawImage(
    _glowCanvas,
    0, 0, _glowW, _glowH,
    0, 0, _glowW / GLOW_SCALE, _glowH / GLOW_SCALE,
  );
  mainCtx.restore();
}

// ── Ring buffer helpers ─────────────────────────────────────────────────────

/** Read the X coordinate of trail point i from the ring buffer.
 *  i = 0 is the oldest point (tail); i = trailCount-1 is the newest (head). */
function _trailX(
  arr: Float64Array,
  trailHead: number, trailCount: number, trailCap: number,
  i: number,
): number {
  return arr[(trailHead - trailCount + i + trailCap) % trailCap];
}

/** Read the Y coordinate of trail point i from the ring buffer. */
function _trailY(
  arr: Float64Array,
  trailHead: number, trailCount: number, trailCap: number,
  i: number,
): number {
  return arr[(trailHead - trailCount + i + trailCap) % trailCap];
}

// ── Smooth path builder ─────────────────────────────────────────────────────

/**
 * Builds a smooth quadratic bezier path through a contiguous range of trail
 * points [startIdx, endIdx] (inclusive, oldest→newest order) using the
 * midpoint technique:
 *
 *   - Starts at the midpoint between startIdx and startIdx+1 so the path
 *     enters the segment tangentially.
 *   - Uses each interior point as a quadratic control vertex; the endpoint
 *     is the midpoint with the next point (smooth joining).
 *   - Terminates with a direct lineTo the final point so the head of the
 *     trail reaches the actual particle position.
 *
 * Coordinates are multiplied by scaleX/scaleY before being written to the
 * context — pass GLOW_SCALE for the glow canvas, 1 for the main canvas.
 *
 * @returns true if the path was built and beginPath was called; false if
 *          the range was too short.
 */
function _buildSubPath(
  ctx: CanvasRenderingContext2D,
  trailXArr: Float64Array,
  trailYArr: Float64Array,
  trailHead: number,
  trailCount: number,
  trailCap: number,
  startIdx: number,
  endIdx: number,
  scaleX: number,
  scaleY: number,
): boolean {
  if (endIdx <= startIdx) return false;

  const x0 = _trailX(trailXArr, trailHead, trailCount, trailCap, startIdx) * scaleX;
  const y0 = _trailY(trailYArr, trailHead, trailCount, trailCap, startIdx) * scaleY;

  if (endIdx === startIdx + 1) {
    // Only two points — draw a simple line segment.
    const x1 = _trailX(trailXArr, trailHead, trailCount, trailCap, endIdx) * scaleX;
    const y1 = _trailY(trailYArr, trailHead, trailCount, trailCap, endIdx) * scaleY;
    ctx.beginPath();
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    return true;
  }

  // Smooth midpoint quadratic path.
  const x1 = _trailX(trailXArr, trailHead, trailCount, trailCap, startIdx + 1) * scaleX;
  const y1 = _trailY(trailYArr, trailHead, trailCount, trailCap, startIdx + 1) * scaleY;
  ctx.beginPath();
  // Start at midpoint of first two control points (smooth entry).
  ctx.moveTo((x0 + x1) * 0.5, (y0 + y1) * 0.5);

  for (let i = startIdx + 1; i < endIdx; i++) {
    const cx = _trailX(trailXArr, trailHead, trailCount, trailCap, i)     * scaleX;
    const cy = _trailY(trailYArr, trailHead, trailCount, trailCap, i)     * scaleY;
    const nx = _trailX(trailXArr, trailHead, trailCount, trailCap, i + 1) * scaleX;
    const ny = _trailY(trailYArr, trailHead, trailCount, trailCap, i + 1) * scaleY;
    ctx.quadraticCurveTo(cx, cy, (cx + nx) * 0.5, (cy + ny) * 0.5);
  }

  // End precisely at the actual last point.
  const xN = _trailX(trailXArr, trailHead, trailCount, trailCap, endIdx) * scaleX;
  const yN = _trailY(trailYArr, trailHead, trailCount, trailCap, endIdx) * scaleY;
  ctx.lineTo(xN, yN);
  return true;
}

// ── Glow pass ───────────────────────────────────────────────────────────────

/**
 * Draws the glow layer for one trail onto the module-level offscreen glow
 * canvas.  The glow canvas is composited back to the main canvas by
 * `endNeonGlowBatch`.
 *
 * The full trail is drawn as a single smooth path at the glow canvas's
 * reduced resolution.  The natural stretching when compositing back produces
 * a soft, blurry halo without an explicit blur pass.
 *
 * @param headAlpha  Overall alpha multiplier at the trail head (0–1).  Use
 *                   the entity's life fraction (e.g. `laser.lifeMs / maxLifeMs`)
 *                   to fade the glow as the projectile expires.
 */
export function drawNeonTrailGlow(
  trailXArr: Float64Array,
  trailYArr: Float64Array,
  trailHead: number,
  trailCount: number,
  trailCap: number,
  cfg: NeonTrailConfig,
  headAlpha: number,
): void {
  if (trailCount < 2 || !_glowCtx) return;

  const gc = _glowCtx;
  const last = trailCount - 1;

  if (!_buildSubPath(gc, trailXArr, trailYArr, trailHead, trailCount, trailCap, 0, last, GLOW_SCALE, GLOW_SCALE)) return;

  gc.lineCap    = 'round';
  gc.lineJoin   = 'round';
  gc.lineWidth  = cfg.glowWidth * GLOW_SCALE;
  gc.strokeStyle = cfg.glowColor;
  gc.globalAlpha = headAlpha * 0.65;
  gc.stroke();
  gc.globalAlpha = 1;
}

// ── Core pass ───────────────────────────────────────────────────────────────

/**
 * Draws the crisp core trail directly onto the main canvas.
 *
 * The trail is drawn in `cfg.taperSegments` passes, each covering a
 * fraction of the trail from tail to head.  Earlier (tail) passes use a
 * thinner lineWidth and lower alpha; later (head) passes use the full
 * coreHeadWidth and headAlpha.  This creates a smooth taper effect without
 * per-point state changes.
 *
 * Alpha uses a quadratic ramp (t²) so the tail fades quickly and the head
 * is bright.
 *
 * @param headAlpha  Overall alpha multiplier at the trail head (0–1).
 */
export function drawNeonTrailCore(
  mainCtx: CanvasRenderingContext2D,
  trailXArr: Float64Array,
  trailYArr: Float64Array,
  trailHead: number,
  trailCount: number,
  trailCap: number,
  cfg: NeonTrailConfig,
  headAlpha: number,
): void {
  if (trailCount < 2) return;

  const segs = Math.max(1, Math.min(cfg.taperSegments, trailCount - 1));
  const last  = trailCount - 1;
  const widthRange = cfg.coreHeadWidth - cfg.coreTailWidth;

  mainCtx.lineCap    = 'round';
  mainCtx.lineJoin   = 'round';
  mainCtx.strokeStyle = cfg.coreColor;

  for (let s = 0; s < segs; s++) {
    // Normalised [0,1] range where 0 = tail, 1 = head.
    const t0 = s       / segs;
    const t1 = (s + 1) / segs;

    const startIdx = Math.floor(t0 * last);
    const endIdx   = Math.floor(t1 * last);
    if (endIdx <= startIdx) continue;

    // Width and alpha are sampled at the segment's far (head-side) edge so
    // the head segment always achieves full width and alpha.
    const lerpW = cfg.coreTailWidth + widthRange * t1;
    const alpha  = t1 * t1 * headAlpha; // quadratic ramp: dim tail, bright head

    if (!_buildSubPath(mainCtx, trailXArr, trailYArr, trailHead, trailCount, trailCap, startIdx, endIdx, 1, 1)) continue;

    mainCtx.lineWidth   = lerpW;
    mainCtx.globalAlpha = alpha;
    mainCtx.stroke();
  }

  mainCtx.globalAlpha = 1;
  mainCtx.lineWidth   = 1;
}
