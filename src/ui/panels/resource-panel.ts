import type { GameState } from '../../sim';
import { TIERS, type TierId } from '../../data/tiers';
import { getMotes, getLifetimeMotes, totalToSizeCounts } from '../../sim/resources';
import { formatNumberAs, type NumberFormat } from '../../util';
import { getRefinedGemFallbackPath, getRefinedGemPath } from '../../render/assets/asset-paths';
import { SMALL_SIZE_INDEX, MEDIUM_SIZE_INDEX, LARGE_SIZE_INDEX, EXTRA_LARGE_SIZE_INDEX } from '../../data/particles/size-tiers';

/** Human-readable label for each size index. */
const SIZE_LABELS: Record<number, string> = {
  [SMALL_SIZE_INDEX]:       'Grain',
  [MEDIUM_SIZE_INDEX]:      'Shard',
  [LARGE_SIZE_INDEX]:       'Chunk',
  [EXTRA_LARGE_SIZE_INDEX]: 'Mass',
};

function getSizeLabel(sizeIndex: number): string {
  return SIZE_LABELS[sizeIndex] ?? `Size ${sizeIndex}`;
}

/**
 * Resources panel — shows per-tier mote totals and per-size breakdown.
 */
export interface ResourcePanel {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
}

export function createResourcePanel(onHoverTier?: (tierId: TierId | null) => void): ResourcePanel {
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
    if (onHoverTier) {
      row.addEventListener('pointerenter', () => onHoverTier(tier.id));
      row.addEventListener('pointerleave', () => onHoverTier(null));
    }
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

        // Build per-size breakdown string (largest size first, omit zeros)
        const sizeCounts = totalToSizeCounts(current);
        let sizeBreakdown = '';
        if (sizeCounts.size > 0) {
          const sortedSizes = Array.from(sizeCounts.entries())
            .filter(([, c]) => c > 0)
            .sort(([a], [b]) => b - a); // largest size first
          sizeBreakdown = sortedSizes
            .map(([s, c]) => `${c}×${getSizeLabel(s)}`)
            .join(' + ');
        }

        row.innerHTML = `
          <img class="resource-icon" src="${iconSrc}" alt="" onerror="this.onerror=null;this.src='${fallbackIconSrc}'" />
          <span class="resource-name" style="color:${tier.color}">${tier.displayName}</span>
          <span class="resource-value">${formatNumberAs(current, numberFormat)}</span>
          <span class="resource-lifetime">(${formatNumberAs(lifetime, numberFormat)} total)</span>
          ${sizeBreakdown ? `<span class="resource-sizes">${sizeBreakdown}</span>` : ''}
        `;
      }
    }
  }

  return { element: panel, update };
}
