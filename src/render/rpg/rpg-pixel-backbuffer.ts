/**
 * rpg-pixel-backbuffer.ts — Dev-mode pixelated RPG render pipeline.
 *
 * When enabled, renders the entire RPG frame to a quarter-resolution offscreen
 * canvas then blits it back to the real canvas with imageSmoothingEnabled=false,
 * producing a crisply pixelated look that matches the equation renderer.
 *
 * Input/collision coordinates are never changed — this is purely visual.
 */

import type { RpgDrawCtx, RpgDrawFrameState } from './rpg-render-draw';
import { drawRpgFrame } from './rpg-render-draw';
import type { RpgFieldSpace } from './rpgFieldSpace';

/** Internal resolution divisor: physical backing pixels ÷ PIXEL_DIV per axis. */
const PIXEL_DIV = 4;

let _offCanvas: HTMLCanvasElement | null = null;
let _offCtx: CanvasRenderingContext2D | null = null;

/**
 * Draws one RPG frame, routing through the pixelated backbuffer when enabled.
 * Drop-in replacement for `drawRpgFrame` at every call site in rpg-render-update.ts.
 */
export function drawRpgFramePixelated(
  drawCtx: RpgDrawCtx,
  state: RpgDrawFrameState,
  nowMs: number,
): void {
  if (!drawCtx.getRpgPixelatedRenderEnabled()) {
    drawRpgFrame(drawCtx, state, nowMs);
    return;
  }

  const realCtx = drawCtx.canvas2d;
  const fs = drawCtx.getFieldSpace();

  // Offscreen canvas dimensions: 1/PIXEL_DIV of the physical backing store.
  const offW = Math.max(1, Math.floor(fs.backingW / PIXEL_DIV));
  const offH = Math.max(1, Math.floor(fs.backingH / PIXEL_DIV));

  // Create or resize the persistent offscreen canvas.
  if (!_offCanvas) {
    _offCanvas = document.createElement('canvas');
    _offCtx = _offCanvas.getContext('2d')!;
  }
  if (_offCanvas.width !== offW || _offCanvas.height !== offH) {
    _offCanvas.width = offW;
    _offCanvas.height = offH;
  }
  const offCtx = _offCtx!;

  // Downscaled field space: same world coordinates, reduced physical dimensions.
  // The draw transform (scale * dpr) is divided by PIXEL_DIV so world units map
  // correctly onto the smaller offscreen canvas.
  const proxyFs: RpgFieldSpace = {
    ...fs,
    dpr: fs.dpr / PIXEL_DIV,
    backingW: offW,
    backingH: offH,
  };

  // Proxy draw context: offscreen canvas + downscaled field space, everything else identical.
  const proxyCtx: RpgDrawCtx = {
    ...drawCtx,
    canvas2d: offCtx,
    getFieldSpace: () => proxyFs,
  };

  // Render the full RPG frame into the small offscreen canvas.
  drawRpgFrame(proxyCtx, state, nowMs);

  // Blit the offscreen canvas to the real canvas at identity transform with no
  // interpolation, producing the crisp pixelated upscale.
  realCtx.save();
  realCtx.setTransform(1, 0, 0, 1, 0, 0);
  realCtx.imageSmoothingEnabled = false;
  realCtx.drawImage(_offCanvas, 0, 0, fs.backingW, fs.backingH);

  // Dev overlay: crisp label at the top of the physical canvas.
  if (drawCtx.getIsDevMode()) {
    const label = `RPG PIXEL ×${PIXEL_DIV}  ${offW}×${offH}px`;
    realCtx.font = 'bold 11px monospace';
    const tw = realCtx.measureText(label).width;
    realCtx.fillStyle = 'rgba(0,0,0,0.65)';
    realCtx.fillRect(4, 4, tw + 10, 18);
    realCtx.fillStyle = '#ffcc44';
    realCtx.textAlign = 'left';
    realCtx.textBaseline = 'top';
    realCtx.fillText(label, 9, 6);
  }

  realCtx.restore();
}
