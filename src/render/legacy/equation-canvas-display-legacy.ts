/**
 * LEGACY/HISTORY ONLY: intentionally no longer imported by runtime systems.
 * The visible canvas equation/equivalence display was retired; this code is
 * preserved only for historical/reference purposes.
 */
import type { CanvasContext } from '../canvas';
import type { EquationTermView } from './equation-term-view-legacy';
import type { EquationRole } from '../../data/equation';
import { formatNumberAs, type NumberFormat } from '../../util';

/**
 * Renders the structured nested equation on the canvas.
 * Builds from inside out: Ruby base → + Sunstone → × Citrine → ^Emerald → wrappers.
 * Quartz controls the f(…t) prefix.
 */
export function drawEquation(
  cc: CanvasContext,
  terms: EquationTermView[],
): void {
  const ctx = cc.ctx;
  const centerX = cc.widthPx / 2;
  const topY = cc.heightPx / 2;
  const fontSize = 9;
  ctx.font = `600 ${fontSize}px 'Cormorant Garamond', serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  if (terms.length === 0) {
    ctx.fillStyle = '#666';
    drawOutlinedText(ctx, 'E = ???', centerX, topY);
    return;
  }

  // Index by role
  const byRole = new Map<EquationRole, EquationTermView>();
  for (const t of terms) byRole.set(t.operator, t);

  // Build the equation text segments with colors
  const segments: Array<{ text: string; color: string }> = [];

  // f(…t) prefix
  const quartz = byRole.get('time_argument');
  if (quartz) {
    const argText = quartz.paramValue === 1 ? 't' : `${Math.floor(quartz.paramValue)}t`;
    segments.push({ text: 'f(', color: '#aaa' });
    segments.push({ text: argText, color: quartz.color });
    segments.push({ text: ') = ', color: '#aaa' });
  } else {
    segments.push({ text: 'f(t) = ', color: '#aaa' });
  }

  // Build core expression text
  const ruby = byRole.get('base_value');
  const sunstone = byRole.get('additive_slot');
  const citrine = byRole.get('multiplier_slot');
  const emerald = byRole.get('exponent_slot');
  const sapphire = byRole.get('summation_wrap');
  const iolite = byRole.get('product_wrap');
  const amethyst = byRole.get('factorial_wrap');
  const diamond = byRole.get('integral_wrap');
  const nullstone = byRole.get('recursion_wrap');

  if (!ruby) {
    segments.push({ text: '...', color: '#666' });
  } else {
    // Prefix wrappers (outermost first for display)
    if (nullstone) {
      const v = Math.round(nullstone.paramValue * 100) / 100;
      segments.push({ text: `lim`, color: nullstone.color });
      segments.push({ text: `(n→${v}) `, color: nullstone.color });
    }
    if (diamond) {
      const v = Math.round(diamond.paramValue * 100) / 100;
      segments.push({ text: `∫₀`, color: diamond.color });
      segments.push({ text: `^${v} `, color: diamond.color });
    }
    if (amethyst) {
      segments.push({ text: 'Γ(', color: amethyst.color });
    }
    if (iolite) {
      segments.push({ text: `Π`, color: iolite.color });
      segments.push({ text: `(${Math.floor(iolite.paramValue)}) `, color: iolite.color });
    }
    if (sapphire) {
      segments.push({ text: `Σ`, color: sapphire.color });
      segments.push({ text: `(${Math.floor(sapphire.paramValue)}) `, color: sapphire.color });
    }

    // Open parens for exponent wrapping
    if (emerald) segments.push({ text: '(', color: '#888' });
    // Open parens for multiplier wrapping
    if (citrine && sunstone) segments.push({ text: '(', color: '#888' });

    // Ruby base value
    segments.push({ text: String(Math.floor(ruby.paramValue)), color: ruby.color });

    // Sunstone additive
    if (sunstone) {
      segments.push({ text: ' + ', color: sunstone.color });
      segments.push({ text: String(Math.floor(sunstone.paramValue)), color: sunstone.color });
    }

    // Close parens for multiplier wrapping, then × value
    if (citrine && sunstone) segments.push({ text: ')', color: '#888' });
    if (citrine) {
      segments.push({ text: ' × ', color: citrine.color });
      segments.push({ text: String(Math.floor(citrine.paramValue)), color: citrine.color });
    }

    // Close parens for exponent, then ^value
    if (emerald) {
      segments.push({ text: ')', color: '#888' });
      segments.push({ text: `^${Math.floor(emerald.paramValue)}`, color: emerald.color });
    }

    // Close wrappers
    if (amethyst) {
      segments.push({ text: ')!', color: amethyst.color });
    }
    if (diamond) {
      segments.push({ text: ' dt', color: diamond.color });
    }
  }

  // Compute total text width for centering
  const charWidth = ctx.measureText('0').width;
  let totalWidth = 0;
  for (const seg of segments) totalWidth += seg.text.length * charWidth;

  // Wrap to two lines if too wide
  const maxLineWidth = cc.widthPx * 0.9;
  if (totalWidth > maxLineWidth) {
    // Find a good split point (after "= ")
    let splitIdx = 0;
    for (let i = 0; i < segments.length; i++) {
      if (segments[i].text.includes('=')) {
        splitIdx = i + 1;
        break;
      }
    }
    if (splitIdx === 0) splitIdx = Math.ceil(segments.length / 2);

    const line1 = segments.slice(0, splitIdx);
    const line2 = segments.slice(splitIdx);
    drawSegmentLine(ctx, line1, centerX, topY - fontSize * 0.8, charWidth);
    drawSegmentLine(ctx, line2, centerX, topY + fontSize * 0.8, charWidth);
  } else {
    drawSegmentLine(ctx, segments, centerX, topY, charWidth);
  }
}

function drawSegmentLine(
  ctx: CanvasRenderingContext2D,
  segments: Array<{ text: string; color: string }>,
  centerX: number,
  y: number,
  charWidth: number,
): void {
  let totalWidth = 0;
  for (const seg of segments) totalWidth += seg.text.length * charWidth;
  let x = centerX - totalWidth / 2;

  for (const seg of segments) {
    ctx.fillStyle = seg.color;
    drawOutlinedText(ctx, seg.text, x + (seg.text.length * charWidth) / 2, y);
    x += seg.text.length * charWidth;
  }
}

/**
 * Draw the Equivalence score (top-center) and on-screen mote count (top-left).
 */
export function drawScore(
  cc: CanvasContext,
  equivalence: number,
  onScreenMotes: number,
  numberFormat: NumberFormat,
): void {
  const ctx = cc.ctx;

  // ── Top-center: Equivalence (big number) ──
  ctx.font = `bold 12px 'Poiret One', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#ecf0f1';
  drawOutlinedText(ctx, formatNumberAs(equivalence, numberFormat), cc.widthPx / 2, 4);

  ctx.font = `7px 'Poiret One', monospace`;
  ctx.fillStyle = '#888';
  drawOutlinedText(ctx, 'Equivalence', cc.widthPx / 2, 18);

  // ── Top-left: on-screen mote count (small) ──
  ctx.font = `bold 7px 'Poiret One', monospace`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'top';
  ctx.fillStyle = '#aaa';
  drawOutlinedText(ctx, formatNumberAs(onScreenMotes, numberFormat), 4, 4);

  ctx.font = `6px 'Poiret One', monospace`;
  ctx.fillStyle = '#666';
  drawOutlinedText(ctx, 'motes', 4, 14);
}

/**
 * Draw a simple "TAP!" hint for new players.
 */
export function drawTapHint(cc: CanvasContext, pulse: number): void {
  const ctx = cc.ctx;
  const alpha = 0.3 + 0.3 * Math.sin(pulse);
  ctx.globalAlpha = alpha;
  ctx.font = `8px 'Poiret One', monospace`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#ecf0f1';
  drawOutlinedText(ctx, 'Tap the equation!', cc.widthPx / 2, cc.heightPx / 2 + cc.heightPx * 0.15);
  ctx.globalAlpha = 1;
}

function drawOutlinedText(
  ctx: CanvasRenderingContext2D,
  text: string,
  x: number,
  y: number,
): void {
  ctx.lineJoin = 'round';
  // White outer outline
  ctx.lineWidth = 4.5;
  ctx.strokeStyle = '#fff';
  ctx.strokeText(text, x, y);
  // Black inner outline
  ctx.lineWidth = 2.5;
  ctx.strokeStyle = '#000';
  ctx.strokeText(text, x, y);
  ctx.fillText(text, x, y);
}
