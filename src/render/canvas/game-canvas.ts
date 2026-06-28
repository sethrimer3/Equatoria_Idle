/**
 * Manages the game canvas and its full-width presentation.
 *
 * The Equation / Idle render uses the full available container width.
 * `#game-area` is sized to fill the container exactly.  The canvas backing
 * store depends on `idleCanvasRenderStyle`:
 *
 *   'crisp'     — backing = container CSS size × devicePixelRatio (HiDPI).
 *                 `resetCanvasRenderState` applies a DPR scale transform so
 *                 draw calls can use CSS-pixel coordinates directly.
 *
 *   'pixelated' — backing = low-resolution internal size (~320 px wide,
 *                 aspect-matched to the current container).  CSS width/height
 *                 fill `#game-area`; `image-rendering: pixelated` on the
 *                 canvas element makes the browser scale up with
 *                 nearest-neighbor.  All draw calls use the small internal
 *                 coordinate space (cc.widthPx × cc.heightPx).
 *                 `resetCanvasRenderState` uses an identity transform.
 *
 * Coordinate systems:
 *   - World:          widthPx × heightPx.  In crisp mode this equals the CSS
 *                     container size.  In pixelated mode this is the internal
 *                     low-res size (~320 wide).
 *   - Canvas backing: canvas.width × canvas.height (physical pixels).
 *                     Crisp: widthPx×DPR × heightPx×DPR.
 *                     Pixelated: widthPx × heightPx (1:1 no DPR factor).
 *   - Input events:   arrive in CSS pixels; canvasCoordsFromPointerEvent
 *                     converts them via cc.widthPx / rect.width.
 *
 * Fallback constants — used as default world dimensions before first resize:
 */

/** Fallback logical width (used before first resize). */
export const IDLE_LOGICAL_WIDTH = 320;
/** Fallback logical height (used before first resize). */
export const IDLE_LOGICAL_HEIGHT = 640;

/** Target internal width used in pixelated mode. */
const PIXELATED_INTERNAL_WIDTH = 320;

export interface CanvasContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /**
   * Full-resolution crisp overlay canvas, always sized to container×DPR.
   * Used for debug text and UI overlays that must remain sharp regardless of
   * the main canvas render style (pixelated vs crisp).
   * Pointer events are disabled; it sits on top of the game canvas.
   */
  overlayCanvas: HTMLCanvasElement;
  overlayCtx: CanvasRenderingContext2D;
  /**
   * Current world coordinate width of the game area.
   * In crisp mode: matches the container's CSS width.
   * In pixelated mode: low-resolution internal width (~320).
   * Defaults to IDLE_LOGICAL_WIDTH before the first resize.
   */
  widthPx: number;
  /**
   * Current world coordinate height of the game area.
   * In crisp mode: matches the container's CSS height.
   * In pixelated mode: low-resolution internal height (aspect-matched).
   * Defaults to IDLE_LOGICAL_HEIGHT before the first resize.
   */
  heightPx: number;
  /**
   * Device pixel ratio captured during the last `resizeCanvas` call.
   * Used by `resetCanvasRenderState` in crisp mode to apply the DPR scale.
   * In pixelated mode this is stored but the transform is identity.
   */
  dpr: number;
  /**
   * The `#game-area` wrapper element that contains the canvas and HUD overlay.
   * Its CSS dimensions are updated by `resizeCanvas` to fill the container.
   */
  gameArea: HTMLElement;
  /**
   * Current render style for the idle/world canvas.
   * Update this field then call `resizeCanvas` to switch modes at runtime.
   * Defaults to 'pixelated'.
   */
  idleCanvasRenderStyle: 'pixelated' | 'crisp';
}

/**
 * Create and mount the game canvas inside the given container.
 *
 * DOM structure produced:
 *   container
 *     └─ #game-area          ← fills container (100 % × 100 %) via resizeCanvas
 *          ├─ #game-canvas   ← backing store managed by resizeCanvas per render style
 *          └─ (HUD overlay appended by caller)
 *
 * Returns the rendering context.  `widthPx` and `heightPx` reflect the
 * world coordinate space after the initial `resizeCanvas` call.
 * `idleCanvasRenderStyle` defaults to 'pixelated'; update it and call
 * `resizeCanvas` again to switch modes.
 */
export function createGameCanvas(container: HTMLElement): CanvasContext {
  const gameArea = document.createElement('div');
  gameArea.id = 'game-area';
  container.appendChild(gameArea);

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  // Backing size and image-rendering set by resizeCanvas based on render style.
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  // Prevent browser from claiming touch events for scrolling/panning,
  // which would fire pointercancel and break mote dragging on mobile.
  canvas.style.touchAction = 'none';
  gameArea.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;

  // Crisp overlay canvas — always full DPR resolution, pointer-events: none.
  // Positioned absolute over the game canvas so it composites on top.
  const overlayCanvas = document.createElement('canvas');
  overlayCanvas.id = 'debug-overlay-canvas';
  overlayCanvas.style.position = 'absolute';
  overlayCanvas.style.inset = '0';
  overlayCanvas.style.pointerEvents = 'none';
  overlayCanvas.style.width = '100%';
  overlayCanvas.style.height = '100%';
  gameArea.appendChild(overlayCanvas);
  const overlayCtx = overlayCanvas.getContext('2d')!;

  const cc: CanvasContext = {
    canvas,
    ctx,
    overlayCanvas,
    overlayCtx,
    widthPx: IDLE_LOGICAL_WIDTH,
    heightPx: IDLE_LOGICAL_HEIGHT,
    dpr: window.devicePixelRatio || 1,
    gameArea,
    idleCanvasRenderStyle: 'pixelated',
  };
  resizeCanvas(cc, container);
  return cc;
}

/**
 * Expand `#game-area` to fill the container and update the canvas backing
 * store and world coordinate dimensions according to `cc.idleCanvasRenderStyle`.
 *
 * **Crisp mode** (`idleCanvasRenderStyle === 'crisp'`):
 *   - `cc.widthPx / cc.heightPx` equal the container's CSS dimensions.
 *   - Canvas backing = containerW×DPR by containerH×DPR (HiDPI).
 *   - `resetCanvasRenderState` applies a DPR scale so draw calls use CSS coords.
 *   - `#game-canvas` has no special `image-rendering` class.
 *
 * **Pixelated mode** (`idleCanvasRenderStyle === 'pixelated'`):
 *   - Internal width is fixed at PIXELATED_INTERNAL_WIDTH (~320); height is
 *     computed to preserve the current container aspect ratio.
 *   - `cc.widthPx / cc.heightPx` equal those small internal dimensions.
 *   - Canvas backing = internalW × internalH (1:1, no DPR factor).
 *   - CSS width/height of #game-canvas remain 100% so the browser scales up.
 *   - `#game-canvas` gains the `idle-canvas-pixelated` class so CSS applies
 *     `image-rendering: pixelated`.
 *   - `resetCanvasRenderState` uses an identity transform.
 */
export function resizeCanvas(cc: CanvasContext, container: HTMLElement): void {
  const containerW = container.clientWidth;
  const containerH = container.clientHeight;
  if (containerW <= 0 || containerH <= 0) return;

  const dpr = window.devicePixelRatio || 1;

  // Size #game-area to fill the full container (no pillarboxing).
  cc.gameArea.style.width    = `${containerW}px`;
  cc.gameArea.style.height   = `${containerH}px`;
  cc.gameArea.style.position = 'relative';

  // Overlay canvas is always crisp at full DPR resolution.
  const overlayBackingW = Math.round(containerW * dpr);
  const overlayBackingH = Math.round(containerH * dpr);
  if (cc.overlayCanvas.width  !== overlayBackingW) cc.overlayCanvas.width  = overlayBackingW;
  if (cc.overlayCanvas.height !== overlayBackingH) cc.overlayCanvas.height = overlayBackingH;

  cc.dpr = dpr;

  if (cc.idleCanvasRenderStyle === 'pixelated') {
    // Compute low-resolution internal dimensions that preserve the container aspect.
    const internalW = PIXELATED_INTERNAL_WIDTH;
    const internalH = Math.round(containerH * (internalW / containerW));

    cc.widthPx  = internalW;
    cc.heightPx = internalH;

    // Canvas backing = internal size (no DPR upscale).
    if (cc.canvas.width  !== internalW) cc.canvas.width  = internalW;
    if (cc.canvas.height !== internalH) cc.canvas.height = internalH;

    // Apply pixelated upscaling class.
    cc.canvas.classList.add('idle-canvas-pixelated');
  } else {
    // Crisp HiDPI mode: world coords = CSS size, backing = CSS × DPR.
    cc.widthPx  = containerW;
    cc.heightPx = containerH;

    const backingW = Math.round(containerW * dpr);
    const backingH = Math.round(containerH * dpr);
    if (cc.canvas.width  !== backingW) cc.canvas.width  = backingW;
    if (cc.canvas.height !== backingH) cc.canvas.height = backingH;

    // Remove pixelated class.
    cc.canvas.classList.remove('idle-canvas-pixelated');
  }
}

/**
 * Restore baseline 2D state before a full-frame render pass.
 *
 * In **crisp** mode: applies a DPR scale transform so that all subsequent
 * draw calls can use CSS-pixel coordinates (widthPx × heightPx) without
 * knowing the physical backing size.
 *
 * In **pixelated** mode: uses an identity transform (backing store already
 * matches the world coordinate space); also disables image smoothing so
 * any scaled sub-images remain crisp.
 */
export function resetCanvasRenderState(cc: CanvasContext): void {
  const ctx = cc.ctx;
  if (cc.idleCanvasRenderStyle === 'pixelated') {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
  } else {
    const dpr = cc.dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.imageSmoothingEnabled = true;
  }
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
