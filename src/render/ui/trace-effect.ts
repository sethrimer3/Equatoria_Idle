/**
 * trace-effect.ts — Animated golden outline with tracing circles.
 *
 * Renders a fullscreen fixed canvas overlay that draws:
 *  - A golden glowing rectangle outline around target DOM elements.
 *  - Two small glowing golden circles that continuously trace the perimeter.
 *
 * Used for:
 *  - Equation term highlights when hovering over an upgrade button.
 *  - Interaction matrix cell highlight during a click-and-hold drag.
 */

// ─── Types ────────────────────────────────────────────────────────

export interface TraceEffect {
  /** Highlight the borders of the given equation-term elements. Pass [] to clear. */
  setEquationTargets(elements: Element[]): void;
  /** Highlight the border of the given matrix cell element. Pass null to clear. */
  setMatrixTarget(element: Element | null): void;
  /** Remove the overlay canvas and stop the animation loop. */
  dispose(): void;
}

// ─── Constants ───────────────────────────────────────────────────

/** Padding around each target element's bounding rect (CSS px). */
const OUTLINE_PAD = 5;
/** Golden circle radius (CSS px). */
const CIRCLE_RADIUS = 3;
/** Revolutions per second each tracer circle completes. */
const TRACE_SPEED_RPS = 0.4;
/** Stroke width for the golden outline (CSS px). */
const OUTLINE_LINE_WIDTH = 1.5;
/** Glow blur radius for the outline (CSS px). */
const OUTLINE_SHADOW_BLUR = 8;
/** Glow blur radius for the tracer circles (CSS px). */
const CIRCLE_SHADOW_BLUR = 10;

const GOLD_STROKE = 'rgba(255, 178, 26, 0.85)';
const GOLD_FILL   = '#FFD700';
const GOLD_SHADOW = '#FFB21A';

// ─── Helpers ─────────────────────────────────────────────────────

/**
 * Given a rectangle (x, y, w, h) and a linear position along its perimeter,
 * return the (px, py) coordinate at that position.
 */
function perimeterPoint(
  x: number, y: number, w: number, h: number,
  pos: number,
): [number, number] {
  // Top edge
  if (pos < w) return [x + pos, y];
  pos -= w;
  // Right edge
  if (pos < h) return [x + w, y + pos];
  pos -= h;
  // Bottom edge (right to left)
  if (pos < w) return [x + w - pos, y + h];
  pos -= w;
  // Left edge (bottom to top)
  return [x, y + h - pos];
}

// ─── Factory ─────────────────────────────────────────────────────

export function createTraceEffect(mountTarget: HTMLElement): TraceEffect {
  const canvas = document.createElement('canvas');
  canvas.style.cssText = [
    'position:fixed',
    'top:0',
    'left:0',
    'width:100%',
    'height:100%',
    'pointer-events:none',
    'z-index:25',
  ].join(';');

  mountTarget.appendChild(canvas);

  const ctx = canvas.getContext('2d');
  let equationTargets: Element[] = [];
  let matrixTarget: Element | null = null;
  let animId: number | null = null;
  let isDisposed = false;
  const animationOriginMs = performance.now();

  function syncCanvasSize(): void {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
  }
  syncCanvasSize();
  window.addEventListener('resize', syncCanvasSize);

  function hasTargets(): boolean {
    return equationTargets.length > 0 || matrixTarget !== null;
  }

  function drawTarget(el: Element, tSec: number): void {
    if (!ctx) return;
    const rect = el.getBoundingClientRect();
    if (rect.width === 0 && rect.height === 0) return;

    const rx = rect.left - OUTLINE_PAD;
    const ry = rect.top  - OUTLINE_PAD;
    const rw = rect.width  + OUTLINE_PAD * 2;
    const rh = rect.height + OUTLINE_PAD * 2;
    const perimeter = 2 * (rw + rh);

    ctx.save();
    ctx.strokeStyle = GOLD_STROKE;
    ctx.lineWidth = OUTLINE_LINE_WIDTH;
    ctx.shadowColor = GOLD_SHADOW;
    ctx.shadowBlur = OUTLINE_SHADOW_BLUR;
    ctx.strokeRect(rx, ry, rw, rh);
    ctx.restore();

    ctx.save();
    ctx.fillStyle = GOLD_FILL;
    ctx.shadowColor = GOLD_SHADOW;
    ctx.shadowBlur = CIRCLE_SHADOW_BLUR;
    for (let k = 0; k < 2; k++) {
      const offset = k * 0.5 * perimeter;
      const pos = ((tSec * TRACE_SPEED_RPS * perimeter) + offset) % perimeter;
      const [px, py] = perimeterPoint(rx, ry, rw, rh, pos);
      ctx.beginPath();
      ctx.arc(px, py, CIRCLE_RADIUS, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(now: number): void {
    animId = null;
    if (isDisposed || !ctx || !hasTargets()) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    const tSec = (now - animationOriginMs) / 1000;
    for (let i = 0; i < equationTargets.length; i++) {
      drawTarget(equationTargets[i], tSec);
    }
    if (matrixTarget) drawTarget(matrixTarget, tSec);

    animId = requestAnimationFrame(draw);
  }

  function updateAnimationState(): void {
    if (isDisposed || !ctx) return;
    if (hasTargets()) {
      if (animId === null) animId = requestAnimationFrame(draw);
      return;
    }
    if (animId !== null) {
      cancelAnimationFrame(animId);
      animId = null;
    }
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  }

  return {
    setEquationTargets(els) {
      equationTargets = els;
      updateAnimationState();
    },
    setMatrixTarget(el) {
      matrixTarget = el;
      updateAnimationState();
    },
    dispose() {
      if (isDisposed) return;
      isDisposed = true;
      if (animId !== null) cancelAnimationFrame(animId);
      animId = null;
      equationTargets = [];
      matrixTarget = null;
      window.removeEventListener('resize', syncCanvasSize);
      canvas.remove();
    },
  };
}
