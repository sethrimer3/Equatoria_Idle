/**
 * Manages the low-resolution game canvas and its upscaled presentation.
 *
 * The Equation / Idle render uses a fixed logical coordinate space.
 * All gameplay positions (generators, looms, particles) live in this
 * stable space regardless of window size, browser zoom, or devicePixelRatio.
 *
 * The canvas is placed inside a `#game-area` wrapper div that is sized in
 * CSS pixels by `resizeCanvas` to fit the available container while
 * preserving the logical aspect ratio (letterboxing / pillarboxing).
 *
 * Coordinate systems:
 *   - Logical / world: IDLE_LOGICAL_WIDTH × IDLE_LOGICAL_HEIGHT px.
 *                      All game state lives here.  Never changes.
 *   - Canvas backing: same as logical (canvas.width / canvas.height).
 *                     The canvas always renders at the fixed logical size.
 *   - CSS / screen:   the game-area wrapper is sized by resizeCanvas to
 *                     fit the container with preserved aspect ratio.
 *                     Input events are converted from CSS → logical via
 *                     canvasCoordsFromPointerEvent in game-app-canvas-input.ts.
 */

/** Fixed logical width of the Equation/Idle game world in canvas pixels. */
export const IDLE_LOGICAL_WIDTH = 320;
/**
 * Fixed logical height of the Equation/Idle game world in canvas pixels.
 * Chosen for a ~1:2 (portrait) aspect ratio that fills typical phone screens
 * with minimal letterboxing while keeping the generator ring well-centred.
 */
export const IDLE_LOGICAL_HEIGHT = 640;

export interface CanvasContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /**
   * Logical game-world width — always IDLE_LOGICAL_WIDTH (320).
   * Stable across all resize and zoom events.
   */
  widthPx: number;
  /**
   * Logical game-world height — always IDLE_LOGICAL_HEIGHT (640).
   * Stable across all resize and zoom events.
   */
  heightPx: number;
  /**
   * The `#game-area` wrapper element that contains the canvas and HUD overlay.
   * Its CSS dimensions are updated by `resizeCanvas` for letterbox / pillarbox
   * scaling, while the canvas backing store stays fixed at the logical size.
   */
  gameArea: HTMLElement;
}

/**
 * Create and mount the game canvas inside the given container.
 *
 * DOM structure produced:
 *   container
 *     └─ #game-area          ← sized in CSS px by resizeCanvas (letterboxing)
 *          ├─ #game-canvas   ← backing store always IDLE_LOGICAL_WIDTH × IDLE_LOGICAL_HEIGHT
 *          └─ (HUD overlay appended by caller)
 *
 * Returns the rendering context with stable logical dimensions.
 */
export function createGameCanvas(container: HTMLElement): CanvasContext {
  const gameArea = document.createElement('div');
  gameArea.id = 'game-area';
  container.appendChild(gameArea);

  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  // Fixed logical / backing size — never changes after this point.
  canvas.width = IDLE_LOGICAL_WIDTH;
  canvas.height = IDLE_LOGICAL_HEIGHT;
  gameArea.appendChild(canvas);

  // Canvas fills its #game-area wrapper exactly.
  canvas.style.display = 'block';
  canvas.style.width = '100%';
  canvas.style.height = '100%';
  canvas.style.imageRendering = 'pixelated';
  // Prevent browser from claiming touch events for scrolling/panning,
  // which would fire pointercancel and break mote dragging on mobile.
  canvas.style.touchAction = 'none';

  const ctx = canvas.getContext('2d')!;

  const cc: CanvasContext = {
    canvas,
    ctx,
    widthPx: IDLE_LOGICAL_WIDTH,
    heightPx: IDLE_LOGICAL_HEIGHT,
    gameArea,
  };
  resizeCanvas(cc, container);
  return cc;
}

/**
 * Fit the `#game-area` wrapper inside the container while preserving the
 * logical aspect ratio (IDLE_LOGICAL_WIDTH : IDLE_LOGICAL_HEIGHT).
 *
 * Only the CSS dimensions of `#game-area` change — the canvas backing store
 * and all game-world coordinates remain completely unchanged.  This means
 * no gameplay state (particles, generators, looms) drifts when the window
 * is resized or browser zoom changes.
 *
 * If the container is wider than the logical aspect the game is pillarboxed;
 * if it is taller the game is letterboxed.
 */
export function resizeCanvas(cc: CanvasContext, container: HTMLElement): void {
  const containerW = container.clientWidth;
  const containerH = container.clientHeight;
  if (containerW <= 0 || containerH <= 0) return;

  // Aspect-ratio preserving scale: largest uniform scale that fits both axes.
  const scaleX = containerW / IDLE_LOGICAL_WIDTH;
  const scaleY = containerH / IDLE_LOGICAL_HEIGHT;
  const scale = Math.min(scaleX, scaleY);

  const displayW = Math.floor(IDLE_LOGICAL_WIDTH * scale);
  const displayH = Math.floor(IDLE_LOGICAL_HEIGHT * scale);

  cc.gameArea.style.width = `${displayW}px`;
  cc.gameArea.style.height = `${displayH}px`;

  // widthPx / heightPx are intentionally NOT updated here.
  // All game-world positions are expressed in logical coordinates and
  // must never change as a result of a resize event.
}

/** Restore baseline 2D state before a full-frame render pass. */
export function resetCanvasRenderState(cc: CanvasContext): void {
  const ctx = cc.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
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
