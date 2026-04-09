import type { GameState } from '../../sim';
import { TIERS } from '../../data/tiers';
import { getMotes, getLifetimeMotes } from '../../sim/resources';
import { formatNumberAs, type NumberFormat } from '../../util';
import { getRefinedGemFallbackPath, getRefinedGemPath } from '../../render/assets/asset-paths';

/**
 * Resources panel — shows per-tier mote totals and lifetime earnings.
 */
export interface ResourcePanel {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
}

export function createResourcePanel(): ResourcePanel {
  const panel = document.createElement('div');
  panel.className = 'panel resource-panel';

  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Mote Resources';
  panel.appendChild(title);

  const rows: Map<string, HTMLElement> = new Map();

  for (const tier of TIERS) {
    const row = document.createElement('div');
    row.className = 'resource-row';
    row.style.borderLeftColor = tier.color;
    panel.appendChild(row);
    rows.set(tier.id, row);
  }

  function update(state: GameState, numberFormat: NumberFormat): void {
    for (const tier of TIERS) {
      const row = rows.get(tier.id)!;
      const isUnlocked = state.equation.segments.some(
        s => s.tierId === tier.id && s.isUnlocked,
      );
      row.style.display = isUnlocked ? '' : 'none';

      if (isUnlocked) {
        const current = getMotes(state.resources, tier.id);
        const lifetime = getLifetimeMotes(state.resources, tier.id);
        const iconSrc = getRefinedGemPath(tier.id);
        const fallbackIconSrc = getRefinedGemFallbackPath(tier.id);
        row.innerHTML = `
          <img class="resource-icon" src="${iconSrc}" alt="" onerror="this.onerror=null;this.src='${fallbackIconSrc}'" />
          <span class="resource-name" style="color:${tier.color}">${tier.displayName}</span>
          <span class="resource-value">${formatNumberAs(current, numberFormat)}</span>
          <span class="resource-lifetime">(${formatNumberAs(lifetime, numberFormat)} total)</span>
        `;
      }
    }
  }

  return { element: panel, update };
}
