/**
 * hud-overlay.ts — DOM-based HUD rendered above the game canvas.
 *
 * Displays the equation, equivalence score, and mote count as real DOM
 * elements so they are crisp and non-pixelated regardless of the canvas
 * upscale factor.  Tap feedback is rendered as a gold drop-shadow glow on
 * the equation that fades as tapFlashAlpha decays.
 */

import type { EquationTermView } from '../../sim/equation';
import { buildStructuredEquationHtml } from '../../sim/equation';
import { formatNumberAs, type NumberFormat } from '../../util';

// ─── Types ───────────────────────────────────────────────────────

export interface HudUpdateParams {
  equivalence: number;
  onScreenMotes: number;
  onScreenParticleCount: number;
  terms: EquationTermView[];
  tapFlashAlpha: number;
  isForgeUnlocked: boolean;
  numberFormat: NumberFormat;
}

export interface HudOverlay {
  element: HTMLElement;
  update(params: HudUpdateParams): void;
}

// ─── Constants ───────────────────────────────────────────────────

/** Maximum spread (px) of the gold glow drop-shadow on equation tap. */
const MAX_GLOW_SPREAD_PX = 8;

// ─── Factory ─────────────────────────────────────────────────────

export function createHudOverlay(): HudOverlay {
  const overlay = document.createElement('div');
  overlay.id = 'hud-overlay';

  // ── Top-left: mote count ──────────────────────────────────────
  const motesEl = document.createElement('div');
  motesEl.className = 'hud-motes';

  const motesValue = document.createElement('div');
  motesValue.className = 'hud-motes-value';

  const motesLabel = document.createElement('div');
  motesLabel.className = 'hud-motes-label';
  motesLabel.textContent = 'motes';

  motesEl.appendChild(motesValue);
  motesEl.appendChild(motesLabel);

  // ── Top-center: equivalence score ────────────────────────────
  const scoreEl = document.createElement('div');
  scoreEl.className = 'hud-score';

  const scoreValue = document.createElement('div');
  scoreValue.className = 'hud-score-value';

  const scoreLabel = document.createElement('div');
  scoreLabel.className = 'hud-score-label';
  scoreLabel.textContent = 'Equivalence';

  scoreEl.appendChild(scoreValue);
  scoreEl.appendChild(scoreLabel);

  // ── Center: equation and tap hint ────────────────────────────
  const equationContainer = document.createElement('div');
  equationContainer.className = 'hud-equation-container';

  const equationEl = document.createElement('div');
  equationEl.className = 'hud-equation';

  equationContainer.appendChild(equationEl);

  overlay.appendChild(motesEl);
  overlay.appendChild(scoreEl);
  overlay.appendChild(equationContainer);

  // ── State for change detection ────────────────────────────────
  let lastTermsKey = '';
  let lastIsForgeUnlocked = false;

  // ── Update function ───────────────────────────────────────────
  function update(params: HudUpdateParams): void {
    const {
      equivalence,
      onScreenMotes,
      onScreenParticleCount,
      terms,
      tapFlashAlpha,
      isForgeUnlocked,
      numberFormat,
    } = params;

    // Score
    scoreValue.textContent = formatNumberAs(equivalence, numberFormat);

    // Motes
    motesValue.textContent =
      `${formatNumberAs(onScreenMotes, numberFormat)} (${formatNumberAs(onScreenParticleCount, numberFormat)})`;

    // Equation — only rebuild HTML when content changes
    const termsKey = isForgeUnlocked
      ? terms.map(t => `${t.tierId}:${t.paramValue}`).join(',')
      : '';

    if (termsKey !== lastTermsKey || isForgeUnlocked !== lastIsForgeUnlocked) {
      lastTermsKey = termsKey;
      lastIsForgeUnlocked = isForgeUnlocked;

      if (!isForgeUnlocked) {
        equationContainer.style.visibility = 'hidden';
        equationEl.innerHTML = '';
      } else if (terms.length === 0) {
        equationContainer.style.visibility = 'visible';
        equationEl.innerHTML = '<span style="color:#666">E = ???</span>';
      } else {
        equationContainer.style.visibility = 'visible';
        equationEl.innerHTML = buildStructuredEquationHtml(terms);
      }
    }

    // Tap flash — gold drop-shadow glow that fades with tapFlashAlpha
    if (tapFlashAlpha > 0) {
      const spread = tapFlashAlpha * MAX_GLOW_SPREAD_PX;
      equationEl.style.filter = `drop-shadow(0 0 ${spread}px rgba(201, 168, 76, ${tapFlashAlpha}))`;
    } else if (equationEl.style.filter) {
      equationEl.style.filter = '';
    }
  }

  return { element: overlay, update };
}
