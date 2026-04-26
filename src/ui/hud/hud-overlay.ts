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
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { TierId } from '../../data/tiers';
import { TIER_BY_ID } from '../../data/tiers';
import { SPAWNER_SIZE } from '../../data/particles/particle-config';

// ─── Types ───────────────────────────────────────────────────────

export interface HudUpdateParams {
  equivalence: number;
  onScreenMotes: number;
  onScreenParticleCount: number;
  terms: EquationTermView[];
  tapFlashAlpha: number;
  isForgeUnlocked: boolean;
  numberFormat: NumberFormat;
  generatorInfos: readonly GeneratorInfo[];
  generatorRatesPerSec: ReadonlyMap<TierId, number>;
  canvasWidthPx: number;
  canvasHeightPx: number;
  pointerX: number | null;
  pointerY: number | null;
  generatorEquationVisibility: 'always' | 'proximity' | 'off';
}

export interface HudOverlay {
  element: HTMLElement;
  update(params: HudUpdateParams): void;
}

// ─── Constants ───────────────────────────────────────────────────

/** Maximum spread (px) of the gold glow drop-shadow on equation tap. */
const MAX_GLOW_SPREAD_PX = 8;
const GENERATOR_LABEL_FADE_START_PX = 30;
const GENERATOR_LABEL_FADE_END_PX = 90;

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
  const generatorEqContainer = document.createElement('div');
  generatorEqContainer.className = 'hud-generator-equations';

  overlay.appendChild(motesEl);
  overlay.appendChild(scoreEl);
  overlay.appendChild(equationContainer);
  overlay.appendChild(generatorEqContainer);

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
      generatorInfos,
      generatorRatesPerSec,
      canvasWidthPx,
      canvasHeightPx,
      pointerX,
      pointerY,
      generatorEquationVisibility,
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
      equationEl.style.filter = `drop-shadow(0 0 ${spread}px rgba(255, 241, 114, ${tapFlashAlpha}))`;
    } else if (equationEl.style.filter) {
      equationEl.style.filter = '';
    }

    generatorEqContainer.innerHTML = '';
    if (generatorEquationVisibility === 'off' || canvasWidthPx <= 0 || canvasHeightPx <= 0) return;
    const canvasCenterX = canvasWidthPx / 2;
    const canvasCenterY = canvasHeightPx / 2;
    const labelOffset = SPAWNER_SIZE * 5 / 2 + 16;
    for (const gen of generatorInfos) {
      const rate = generatorRatesPerSec.get(gen.tierId) ?? 0;
      if (rate <= 0) continue;
      const tier = TIER_BY_ID.get(gen.tierId);
      if (!tier) continue;

      const dx = gen.x - canvasCenterX;
      const dy = gen.y - canvasCenterY;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const nx = dist > 0 ? dx / dist : 0;
      const ny = dist > 0 ? dy / dist : 1;
      const labelX = gen.x + nx * labelOffset;
      const labelY = gen.y + ny * labelOffset;

      let alpha = 1;
      if (generatorEquationVisibility === 'proximity') {
        if (pointerX === null || pointerY === null) {
          alpha = 0;
        } else {
          const pdx = pointerX - gen.x;
          const pdy = pointerY - gen.y;
          const pdist = Math.sqrt(pdx * pdx + pdy * pdy);
          const t = Math.max(0, Math.min(1, (pdist - GENERATOR_LABEL_FADE_START_PX) / (GENERATOR_LABEL_FADE_END_PX - GENERATOR_LABEL_FADE_START_PX)));
          alpha = 1 - t * t;
        }
      }
      if (alpha <= 0.01) continue;
      const row = document.createElement('div');
      row.className = 'hud-generator-eq';
      row.style.left = `${(labelX / canvasWidthPx) * 100}%`;
      row.style.top = `${(labelY / canvasHeightPx) * 100}%`;
      row.style.opacity = alpha.toFixed(3);
      row.innerHTML = `<span class="hud-generator-rate" style="color:${tier.color}">${formatGeneratorRate(rate, numberFormat)}</span><span class="hud-generator-suffix">/s</span>`;
      generatorEqContainer.appendChild(row);
    }
  }

  return { element: overlay, update };
}

function formatGeneratorRate(rate: number, numberFormat: NumberFormat): string {
  if (rate < 1) return rate.toFixed(2);
  if (rate < 1000) return String(Math.floor(rate));
  return formatNumberAs(rate, numberFormat);
}
