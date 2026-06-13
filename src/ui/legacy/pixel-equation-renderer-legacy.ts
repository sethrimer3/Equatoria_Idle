/**
 * LEGACY/HISTORY ONLY: intentionally no longer imported by runtime systems.
 * The visible equation display was retired; this renderer is preserved only
 * for historical/reference purposes.
 *
 * pixel-equation-renderer.ts — Low-resolution offscreen pixel equation canvas.
 *
 * Renders the equation as coloured text into a deliberately tiny offscreen canvas,
 * then blits it into a visible canvas at 2× nearest-neighbor upscale so every pixel
 * becomes a crisp 2×2 block.  CSS `image-rendering: pixelated` on the visible canvas
 * prevents any further browser interpolation.
 *
 * The renderer tracks the last-rendered state and skips redraws when nothing changed
 * (requirement #10).  It never allocates new canvases after construction.
 *
 * Layout: a single combined canvas with three equal rows:
 *   Row 0  — main equation
 *   Row 1  — downward arrow (amber; invisible when no forge preview)
 *   Row 2  — forge preview equation (amber tint; invisible when no forge preview)
 *
 * Keeping all three rows at fixed height avoids layout jitter (requirement #9).
 */

import type { EqSegment } from './equation-segments-legacy';

// ─── Constants ───────────────────────────────────────────────────

/** Width of the offscreen (low-resolution) canvas in pixels. */
const LR_W = 160;
/** Height of one row on the offscreen canvas. */
const LR_ROW_H = 16;
/** Number of rows (main eq + arrow + preview). */
const ROWS = 3;
/** Integer upscale factor applied when blitting to the visible canvas. */
const UPSCALE = 2;

/** Font used for equation text on the offscreen canvas. */
const EQ_FONT = "bold 8px 'Pixelify Sans', 'Courier New', monospace";
/** Font used for the forge-preview arrow character. */
const ARROW_FONT = "bold 7px 'Pixelify Sans', 'Courier New', monospace";

/** Amber colour used for the forge preview row and arrow. */
const PREVIEW_COLOR = 'rgba(255, 200, 80, 0.9)';
/** Amber colour for the downward arrow (slightly more transparent). */
const ARROW_COLOR = 'rgba(255, 200, 80, 0.75)';

/** Baseline Y within a single row (text sits near the bottom of the row). */
const BASELINE_OFFSET = LR_ROW_H - 3;

// ─── Public interface ─────────────────────────────────────────────

export interface PixelEquationRenderer {
  /** The visible (upscaled) canvas element to append to the DOM. */
  readonly canvas: HTMLCanvasElement;
  /**
   * Re-render if content changed.  Pass `null` for `previewSegs` when there
   * is no forge preview active.
   */
  update(mainSegs: EqSegment[], previewSegs: EqSegment[] | null, styleChanged: boolean): void;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createPixelEquationRenderer(): PixelEquationRenderer {
  // ── Offscreen canvas (low resolution) ────────────────────────
  const offscreen = document.createElement('canvas');
  offscreen.width  = LR_W;
  offscreen.height = LR_ROW_H * ROWS;
  const offCtx = offscreen.getContext('2d')!;
  offCtx.imageSmoothingEnabled = false;

  // ── Visible canvas (upscaled) ────────────────────────────────
  const visible = document.createElement('canvas');
  visible.width  = LR_W    * UPSCALE;
  visible.height = LR_ROW_H * ROWS * UPSCALE;
  visible.className = 'hud-equation-pixel-canvas';
  const visCtx = visible.getContext('2d')!;
  visCtx.imageSmoothingEnabled = false;

  // ── Change-detection state ────────────────────────────────────
  let lastMainKey    = '\x00'; // force first render
  let lastPreviewKey = '\x00';

  // ─── Private helpers ──────────────────────────────────────────

  /** Render one row of coloured segments, centred horizontally. */
  function drawRow(
    ctx: CanvasRenderingContext2D,
    segments: EqSegment[],
    rowIndex: number,
    overrideColor: string | null,
  ): void {
    ctx.font = EQ_FONT;
    // Measure total row width for horizontal centring
    let totalW = 0;
    for (const seg of segments) {
      totalW += ctx.measureText(seg.text).width;
    }
    let x = Math.max(1, (LR_W - totalW) / 2);
    const y = rowIndex * LR_ROW_H + BASELINE_OFFSET;

    for (const seg of segments) {
      ctx.fillStyle = overrideColor ?? seg.color;
      ctx.fillText(seg.text, x, y);
      x += ctx.measureText(seg.text).width;
    }
  }

  /** Draw the amber preview arrow in the middle row. */
  function drawArrow(ctx: CanvasRenderingContext2D): void {
    ctx.font = ARROW_FONT;
    ctx.fillStyle = ARROW_COLOR;
    ctx.textAlign = 'center';
    ctx.fillText('\u25bc', LR_W / 2, 1 * LR_ROW_H + BASELINE_OFFSET - 1); // ▼
    ctx.textAlign = 'left';
  }

  /** Blit the offscreen canvas into the visible canvas at UPSCALE×. */
  function blit(): void {
    visCtx.imageSmoothingEnabled = false;
    visCtx.clearRect(0, 0, visible.width, visible.height);
    visCtx.drawImage(offscreen, 0, 0, visible.width, visible.height);
  }

  /** Full redraw of the offscreen canvas, then blit. */
  function redraw(mainSegs: EqSegment[], previewSegs: EqSegment[] | null): void {
    offCtx.imageSmoothingEnabled = false;
    offCtx.clearRect(0, 0, offscreen.width, offscreen.height);

    // Row 0 — main equation
    drawRow(offCtx, mainSegs, 0, null);

    if (previewSegs !== null && previewSegs.length > 0) {
      // Row 1 — arrow
      drawArrow(offCtx);
      // Row 2 — preview equation (amber tint overrides tier colours)
      drawRow(offCtx, previewSegs, 2, PREVIEW_COLOR);
    }
    // Rows 1 & 2 remain clear (transparent) when there is no preview.

    blit();
  }

  // ─── Public update ────────────────────────────────────────────

  function update(
    mainSegs: EqSegment[],
    previewSegs: EqSegment[] | null,
    styleChanged: boolean,
  ): void {
    const mainKey    = mainSegs.map(s => `${s.text}\0${s.color}`).join('|');
    const previewKey = previewSegs
      ? previewSegs.map(s => `${s.text}\0${s.color}`).join('|')
      : '';

    if (styleChanged || mainKey !== lastMainKey || previewKey !== lastPreviewKey) {
      lastMainKey    = mainKey;
      lastPreviewKey = previewKey;
      redraw(mainSegs, previewSegs);
    }
  }

  return { canvas: visible, update };
}
