/**
 * Active DOM HUD above the idle/equation canvas.
 *
 * The visible equation and equivalence displays were intentionally retired.
 * This HUD now shows only mote counts and useful loom production-rate labels.
 */

import { formatNumberAs, type NumberFormat } from '../../util';
import type { GeneratorInfo } from '../../sim/particles/generator-state';
import type { TierId } from '../../data/tiers';
import { TIER_BY_ID } from '../../data/tiers';
import { SPAWNER_SIZE } from '../../data/particles/particle-config';

export interface HudUpdateParams {
  onScreenMotes: number;
  onScreenParticleCount: number;
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

const GENERATOR_LABEL_FADE_START_PX = 30;
const GENERATOR_LABEL_FADE_END_PX = 90;

export function createHudOverlay(): HudOverlay {
  const overlay = document.createElement('div');
  overlay.id = 'hud-overlay';

  const motesEl = document.createElement('div');
  motesEl.className = 'hud-motes';

  const motesValue = document.createElement('div');
  motesValue.className = 'hud-motes-value';

  const motesLabel = document.createElement('div');
  motesLabel.className = 'hud-motes-label';
  motesLabel.textContent = 'motes';

  motesEl.appendChild(motesValue);
  motesEl.appendChild(motesLabel);

  const generatorEqContainer = document.createElement('div');
  generatorEqContainer.className = 'hud-generator-equations';

  overlay.appendChild(motesEl);
  overlay.appendChild(generatorEqContainer);

  function update(params: HudUpdateParams): void {
    const {
      onScreenMotes,
      onScreenParticleCount,
      numberFormat,
      generatorInfos,
      generatorRatesPerSec,
      canvasWidthPx,
      canvasHeightPx,
      pointerX,
      pointerY,
      generatorEquationVisibility,
    } = params;

    motesValue.textContent =
      `${formatNumberAs(onScreenMotes, numberFormat)} (${formatNumberAs(onScreenParticleCount, numberFormat)})`;

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
