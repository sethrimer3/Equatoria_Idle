/**
 * Manages the game canvas and its full-width presentation.
 *
 * The Equation / Idle render uses the full available container width.
 * `#game-area` is sized to fill the container exactly, and the canvas backing
 * store is set to the container CSS size multiplied by devicePixelRatio for
 * crisp rendering on HiDPI screens.
 *
 * All draw calls use CSS-pixel coordinates (widthPx × heightPx).
 * `resetCanvasRenderState` applies a DPR scale transform so that every pixel
 * address in draw calls maps to a physical backing pixel.
 *
 * Coordinate systems:
 *   - CSS / world: widthPx × heightPx px (= container CSS size, updates on resize).
 *                  All game state (generators, looms, particles) lives here.
 *   - Canvas backing: widthPx × DPR by heightPx × DPR (physical backing pixels).
 *                     Set by resizeCanvas whenever the container changes.
 *   - Input events:   already in CSS-pixel space; canvasCoordsFromPointerEvent
 *                     converts them to world coords via cc.widthPx / rect.width.
 *
 * Fallback constants — used as default world dimensions before first resize:
 */

/** Fallback logical width (used before first resize). */
export const IDLE_LOGICAL_WIDTH = 320;
/** Fallback logical height (used before first resize). */
export const IDLE_LOGICAL_HEIGHT = 640;

export interface CanvasContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /**
   * Current world / CSS-pixel width of the game area.
   * Updated by `resizeCanvas` to match the container's CSS width.
   * Defaults to IDLE_LOGICAL_WIDTH before the first resize.
   */
  widthPx: number;
  /**
   * Current world / CSS-pixel height of the game area.
   * Updated by `resizeCanvas` to match the container's CSS height.
   * Defaults to IDLE_LOGICAL_HEIGHT before the first resize.
   */
  heightPx: number;
  /**
   * Device pixel ratio captured during the last `resizeCanvas` call.
   * Used by `resetCanvasRenderState` to apply the DPR scale transform.
   */
  dpr: number;
  /**
   * The `#game-area` wrapper element that contains the canvas and HUD overlay.
   * Its CSS dimensions are updated by `resizeCanvas` to fill the container.
   */
  gameArea: HTMLElement;
}

/**
 * Create and mount the game canvas inside the given container.
 *
 * DOM structure produced:
 *   container
 *     └─ #game-area          ← fills container (100 % × 100 %) via resizeCanvas
 *          ├─ #game-canvas   ← backing = widthPx×DPR × heightPx×DPR (updated on resize)
 *          └─ (HUD overlay appended by caller)
 *
 * Returns the rendering context.  `widthPx` and `heightPx` reflect the
 * container CSS size after the initial `resizeCanvas` call.
 */
export function createGameCanvas(container: HTMLElement): CanvasContext {
  const gameArea = document.createElement('div');
  gameArea.id = 'game-area';
  container.appendChild(gameArea);

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  // Backing size set by resizeCanvas — no fixed size here.
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  // No pixelated upscaling — the backing now matches the CSS size × DPR.
  // Prevent browser from claiming touch events for scrolling/panning,
  // which would fire pointercancel and break mote dragging on mobile.
  canvas.style.touchAction = 'none';
  gameArea.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;

  const cc: CanvasContext = {
    canvas,
    ctx,
    widthPx: IDLE_LOGICAL_WIDTH,
    heightPx: IDLE_LOGICAL_HEIGHT,
    dpr: window.devicePixelRatio || 1,
    gameArea,
  };
  resizeCanvas(cc, container);
  return cc;
}

/**
 * Expand `#game-area` to fill the container and update the canvas backing
 * store to `containerW × DPR by containerH × DPR` physical pixels.
 *
 * After this call:
 *   - `cc.widthPx / cc.heightPx` equal the container's CSS dimensions.
 *   - The canvas backing is the HiDPI equivalent of those CSS dimensions.
 *   - `resetCanvasRenderState` will apply a DPR scale so all draw calls can
 *     use CSS-pixel coordinates directly.
 */
export function resizeCanvas(cc: CanvasContext, container: HTMLElement): void {
  const containerW = container.clientWidth;
  const containerH = container.clientHeight;
  if (containerW <= 0 || containerH <= 0) return;

  const dpr = window.devicePixelRatio || 1;

  // Size #game-area to fill the full container (no pillarboxing).
  cc.gameArea.style.width  = `${containerW}px`;
  cc.gameArea.style.height = `${containerH}px`;

  // Update world / CSS-pixel dimensions.
  cc.widthPx  = containerW;
  cc.heightPx = containerH;
  cc.dpr      = dpr;

  // Resize the physical backing store to match.
  const backingW = Math.round(containerW * dpr);
  const backingH = Math.round(containerH * dpr);
  if (cc.canvas.width  !== backingW) cc.canvas.width  = backingW;
  if (cc.canvas.height !== backingH) cc.canvas.height = backingH;
}

/**
 * Restore baseline 2D state before a full-frame render pass.
 *
 * Applies a DPR scale transform so that all subsequent draw calls can use
 * CSS-pixel coordinates (widthPx × heightPx) without knowing the physical
 * backing size.
 */
export function resetCanvasRenderState(cc: CanvasContext): void {
  const ctx = cc.ctx;
  const dpr = cc.dpr;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.globalAlpha = 1;
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowBlur = 0;
  ctx.shadowColor = 'transparent';
  ctx.filter = 'none';
  ctx.setLineDash([]);
}

/** Clear the canvas. */
export function clearCanvas(cc: CanvasContext): void {
  cc.ctx.clearRect(0, 0, cc.widthPx, cc.heightPx);
}

/** Draw a filled background. */
export function drawBackground(cc: CanvasContext, color: string): void {
  cc.ctx.fillStyle = color;
  cc.ctx.fillRect(0, 0, cc.widthPx, cc.heightPx);
}
