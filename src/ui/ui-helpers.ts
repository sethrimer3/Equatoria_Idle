/**
 * ui-helpers.ts — Shared DOM utility helpers for UI panels.
 */

/**
 * Creates a decorative page-break image element.
 * Large page breaks indicate the top of a scrollable menu.
 * Small page breaks visually separate sections within a panel.
 */
export function makePageBreak(size: 'large' | 'small'): HTMLImageElement {
  const img = document.createElement('img');
  img.src = `/ASSETS/SPRITES/menuElements/pageBreak_${size}.png`;
  img.alt = '';
  img.className = `page-break-${size}`;
  return img;
}
