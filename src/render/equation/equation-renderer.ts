import type { CanvasContext } from '../canvas';
import type { EquationTermView } from '../../sim/equation';

/**
 * Renders the equation on the canvas.
 * The equation is drawn as coloured terms joined by '+' signs,
 * wrapped inside  E = <terms>  notation.
 */
export function drawEquation(
  cc: CanvasContext,
  terms: EquationTermView[],
  tapFlashAlpha: number,
): void {
  const ctx = cc.ctx;
  const centerX = cc.widthPx / 2;
  const topY = cc.heightPx * 0.15;

  // Title label
  ctx.font = 'bold 10px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#aaa';
  ctx.fillText('E =', centerX - cc.widthPx * 0.35, topY);

  if (terms.length === 0) {
    ctx.fillStyle = '#666';
    ctx.fillText('???', centerX, topY);
    return;
  }

  // Compute layout — stack terms horizontally if they fit, or wrap
  const fontSize = 10;
  ctx.font = `bold ${fontSize}px monospace`;
  const charWidth = ctx.measureText('0').width;

  const termTexts = terms.map(t => t.text);
  const gaps = terms.length - 1; // '+' signs
  const totalChars = termTexts.reduce((s, t) => s + t.length, 0) + gaps * 3;
  const totalWidth = totalChars * charWidth;

  // Determine if we should wrap to multiple lines
  const maxLineWidth = cc.widthPx * 0.65;
  const shouldWrap = totalWidth > maxLineWidth;

  if (!shouldWrap) {
    // Single line
    drawTermsLine(ctx, terms, centerX, topY, charWidth, tapFlashAlpha);
  } else {
    // Two-line layout
    const mid = Math.ceil(terms.length / 2);
    const line1 = terms.slice(0, mid);
    const line2 = terms.slice(mid);
    drawTermsLine(ctx, line1, centerX, topY - fontSize * 0.7, charWidth, tapFlashAlpha);
    drawTermsLine(ctx, line2, centerX, topY + fontSize * 0.7, charWidth, tapFlashAlpha);
  }

  // Tap flash overlay
  if (tapFlashAlpha > 0) {
    ctx.globalAlpha = tapFlashAlpha * 0.15;
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, topY - fontSize, cc.widthPx, fontSize * 2.5);
    ctx.globalAlpha = 1;
  }
}

function drawTermsLine(
  ctx: CanvasRenderingContext2D,
  terms: EquationTermView[],
  centerX: number,
  y: number,
  charWidth: number,
  _tapFlashAlpha: number,
): void {
  // Compute total width for centering
  const lineTexts = terms.map(t => t.text);
  const totalChars = lineTexts.reduce((s, t) => s + t.length, 0) + (terms.length - 1) * 3;
  const totalWidth = totalChars * charWidth;
  let x = centerX - totalWidth / 2;

  for (let i = 0; i < terms.length; i++) {
    const term = terms[i];
    ctx.fillStyle = term.color;
    ctx.fillText(term.text, x + (term.text.length * charWidth) / 2, y);
    x += term.text.length * charWidth;

    if (i < terms.length - 1) {
      ctx.fillStyle = '#777';
      ctx.fillText(' + ', x + 1.5 * charWidth, y);
      x += 3 * charWidth;
    }
  }
}

/**
 * Draw the score display at the top of the canvas.
 */
export function drawScore(cc: CanvasContext, score: number): void {
  const ctx = cc.ctx;
  ctx.font = 'bold 12px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ecf0f1';
  ctx.fillText(formatNumber(score), cc.widthPx / 2, 4);

  ctx.font = '7px monospace';
  ctx.fillStyle = '#888';
  ctx.fillText('motes', cc.widthPx / 2, 18);
}

/**
 * Draw a simple "TAP!" hint for new players.
 */
export function drawTapHint(cc: CanvasContext, pulse: number): void {
  const ctx = cc.ctx;
  const alpha = 0.3 + 0.3 * Math.sin(pulse);
  ctx.globalAlpha = alpha;
  ctx.font = '8px monospace';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ecf0f1';
  ctx.fillText('Tap the equation!', cc.widthPx / 2, cc.heightPx * 0.3);
  ctx.globalAlpha = 1;
}

function formatNumber(n: number): string {
  if (n < 1_000) return Math.floor(n).toString();
  if (n < 1_000_000) return (n / 1_000).toFixed(1) + 'K';
  if (n < 1_000_000_000) return (n / 1_000_000).toFixed(2) + 'M';
  return (n / 1_000_000_000).toFixed(2) + 'B';
}
