/**
 * idle-viewport-debug.ts — Developer-mode viewport diagnostic overlay.
 *
 * Draws a small info panel in the top-right corner of the game canvas that
 * shows the key dimensions of the Equation / Idle viewport so it is easy to
 * verify that logical coordinates stay stable across resize and zoom events.
 *
 * Displayed information:
 *   - Logical size (always IDLE_LOGICAL_WIDTH × IDLE_LOGICAL_HEIGHT)
 *   - Canvas backing size (canvas.width × canvas.height — matches logical)
 *   - Game-area CSS size (the letterboxed display size in CSS pixels)
 *   - devicePixelRatio
 *   - Render scale (CSS size / logical size, both axes)
 *
 * Usage: call drawIdleViewportDebug(cc) once per frame when dev mode is on.
 */

import type { CanvasContext } from './game-canvas';

/** Background fill for the debug overlay box. */
const BG = 'rgba(0,0,0,0.65)';
/** Text colour. */
const FG = '#00ff99';
/** Font used for debug text. */
const FONT = '8px monospace';
/** Padding inside the debug box (logical px). */
const PAD = 4;
/** Line height for debug text rows (logical px). */
const LINE_H = 10;

export function drawIdleViewportDebug(cc: CanvasContext): void {
  const { ctx, canvas, widthPx, heightPx, gameArea } = cc;

  const backingW = canvas.width;
  const backingH = canvas.height;

  const cssW = gameArea.clientWidth;
  const cssH = gameArea.clientHeight;

  const dpr = window.devicePixelRatio ?? 1;

  // Render scale: how many CSS pixels correspond to one logical pixel.
  const scaleX = cssW > 0 ? (cssW / widthPx).toFixed(3) : '?';
  const scaleY = cssH > 0 ? (cssH / heightPx).toFixed(3) : '?';

  const lines = [
    `[Idle Viewport Debug]`,
    `logical : ${widthPx} × ${heightPx}`,
    `backing : ${backingW} × ${backingH}`,
    `css     : ${cssW} × ${cssH}`,
    `dpr     : ${dpr.toFixed(2)}`,
    `scale   : ${scaleX} × ${scaleY}`,
  ];

  const boxW = 140;
  const boxH = PAD * 2 + lines.length * LINE_H;
  const boxX = widthPx - boxW - 2;
  const boxY = 2;

  ctx.save();

  ctx.fillStyle = BG;
  ctx.fillRect(boxX, boxY, boxW, boxH);

  ctx.font = FONT;
  ctx.fillStyle = FG;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillText(lines[i], boxX + PAD, boxY + PAD + i * LINE_H);
  }

  ctx.restore();
}
