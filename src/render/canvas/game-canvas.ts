/**
 * Manages the low-resolution game canvas and its upscaled presentation.
 * The game renders at a small internal resolution, then the CSS scales it up
 * for a crisp, slightly pixelated look.
 */

export interface CanvasContext {
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  /** Internal (game-world) width in logical pixels. */
  widthPx: number;
  /** Internal (game-world) height in logical pixels. */
  heightPx: number;
}

/** Internal base resolution — the game world is this many logical pixels wide. */
const INTERNAL_WIDTH = 320;

/**
 * Create and mount the game canvas inside the given container.
 * Returns the rendering context sized to the internal resolution.
 */
export function createGameCanvas(container: HTMLElement): CanvasContext {
  const canvas = document.createElement('canvas');
  canvas.id = 'game-canvas';
  container.appendChild(canvas);

  const ctx = canvas.getContext('2d')!;

  const cc: CanvasContext = { canvas, ctx, widthPx: INTERNAL_WIDTH, heightPx: 0 };
  resizeCanvas(cc, container);
  return cc;
}

/**
 * Recalculate canvas dimensions to fill the container while preserving
 * the internal resolution aspect ratio.
 */
export function resizeCanvas(cc: CanvasContext, container: HTMLElement): void {
  const containerW = container.clientWidth;
  const containerH = container.clientHeight;

  // Determine internal height based on container aspect ratio
  const aspect = containerH / containerW;
  const internalH = Math.round(INTERNAL_WIDTH * aspect);

  cc.widthPx = INTERNAL_WIDTH;
  cc.heightPx = internalH;
  cc.canvas.width = INTERNAL_WIDTH;
  cc.canvas.height = internalH;

  // CSS handles upscaling: canvas fills its container
  cc.canvas.style.width = '100%';
  cc.canvas.style.height = '100%';
  cc.canvas.style.imageRendering = 'pixelated';
  cc.canvas.style.display = 'block';
  // Prevent browser from claiming touch events for scrolling/panning,
  // which would fire pointercancel and break mote dragging on mobile.
  cc.canvas.style.touchAction = 'none';
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
