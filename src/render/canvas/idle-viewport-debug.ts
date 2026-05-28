/**
 * idle-viewport-debug.ts — Developer-mode viewport diagnostic overlay.
 *
 * Draws a small info panel in the top-right corner of the game canvas showing
 * the full viewport chain so it is easy to verify that canvas fills the
 * available container and the DPR backing is correct.
 *
 * Displayed information:
 *   - Container CSS size (the #canvas-container available area)
 *   - Game-area CSS size (should match container — warns if not)
 *   - Canvas backing size (physical pixels = CSS × DPR)
 *   - widthPx × heightPx (world / CSS-pixel coordinate space)
 *   - devicePixelRatio
 *
 * Usage: call drawIdleViewportDebug(cc) once per frame when dev mode is on.
 */

import type { CanvasContext } from './game-canvas';

/** Background fill for the debug overlay box. */
const BG = 'rgba(0,0,0,0.65)';
/** Text colour. */
const FG = '#00ff99';
/** Warning colour — used when canvas doesn't fill the container. */
const WARN = '#ff4444';
/** Font used for debug text. */
const FONT = '8px monospace';
/** Padding inside the debug box (CSS px). */
const PAD = 4;
/** Line height for debug text rows (CSS px). */
const LINE_H = 10;

export function drawIdleViewportDebug(cc: CanvasContext): void {
  const { ctx, canvas, widthPx, heightPx, gameArea } = cc;

  const backingW = canvas.width;
  const backingH = canvas.height;

  const areaW = gameArea.clientWidth;
  const areaH = gameArea.clientHeight;

  const containerW = gameArea.parentElement?.clientWidth ?? 0;
  const containerH = gameArea.parentElement?.clientHeight ?? 0;

  const dpr = window.devicePixelRatio ?? 1;

  // Warn if the game-area is narrower than the container (canvas not filling).
  const widthMismatch = containerW > 0 && Math.abs(areaW - containerW) > 2;

  const lines: Array<{ text: string; warn?: boolean }> = [
    { text: `[Idle Viewport Debug]` },
    { text: `container: ${containerW} × ${containerH}` },
    { text: `game-area: ${areaW} × ${areaH}`, warn: widthMismatch },
    { text: `backing  : ${backingW} × ${backingH}` },
    { text: `world px : ${widthPx} × ${heightPx}` },
    { text: `dpr      : ${dpr.toFixed(2)}` },
  ];
  if (widthMismatch) {
    lines.push({ text: `⚠ area < container!`, warn: true });
  }

  const boxW = 148;
  const boxH = PAD * 2 + lines.length * LINE_H;
  const boxX = widthPx - boxW - 2;
  const boxY = 2;

  ctx.save();

  ctx.fillStyle = BG;
  ctx.fillRect(boxX, boxY, boxW, boxH);

  ctx.font = FONT;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';

  for (let i = 0; i < lines.length; i++) {
    ctx.fillStyle = lines[i].warn ? WARN : FG;
    ctx.fillText(lines[i].text, boxX + PAD, boxY + PAD + i * LINE_H);
  }

  ctx.restore();
}
