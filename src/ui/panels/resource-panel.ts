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

  // Persistent per-row child elements so update() only writes changed text
  // (update runs ~10x/sec). Recreating the <img> each tick caused needless
  // re-parsing and flicker.
  interface RowRefs {
    row: HTMLElement;
    valueEl: HTMLElement;
    lifetimeEl: HTMLElement;
    sizesEl: HTMLElement;
    lastSig: string;
  }
  const rows: Map<string, RowRefs> = new Map();

  for (const tier of TIERS) {
    const row = document.createElement('div');
    row.className = 'resource-row';
    row.style.borderLeftColor = tier.color;
    if (onHoverTier) {
      row.addEventListener('pointerenter', () => onHoverTier(tier.id));
      row.addEventListener('pointerleave', () => onHoverTier(null));
    }

    const img = document.createElement('img');
    img.className = 'resource-icon';
    img.alt = '';
    img.src = getRefinedGemPath(tier.id);
    const fallbackIconSrc = getRefinedGemFallbackPath(tier.id);
    img.addEventListener('error', function onErr() {
      img.removeEventListener('error', onErr);
      img.src = fallbackIconSrc;
    });

    const nameEl = document.createElement('span');
    nameEl.className = 'resource-name';
    nameEl.style.color = tier.color;
    nameEl.textContent = tier.displayName;

    const valueEl = document.createElement('span');
    valueEl.className = 'resource-value';
    const lifetimeEl = document.createElement('span');
    lifetimeEl.className = 'resource-lifetime';
    const sizesEl = document.createElement('span');
    sizesEl.className = 'resource-sizes';

    row.append(img, nameEl, valueEl, lifetimeEl, sizesEl);
    panel.appendChild(row);
    rows.set(tier.id, { row, valueEl, lifetimeEl, sizesEl, lastSig: '' });
  }

  function update(state: GameState, numberFormat: NumberFormat): void {
    for (const tier of TIERS) {
      const refs = rows.get(tier.id)!;
      const isUnlocked = state.equation.segments.some(
        s => s.tierId === tier.id && s.isUnlocked,
      );
      refs.row.style.display = isUnlocked ? '' : 'none';
      if (!isUnlocked) continue;

      const current = getMotes(state.resources, tier.id);
      const lifetime = getLifetimeMotes(state.resources, tier.id);

      const sig = `${current}|${lifetime}|${numberFormat}`;
      if (sig === refs.lastSig) continue;
      refs.lastSig = sig;

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

      refs.valueEl.textContent = formatNumberAs(current, numberFormat);
      refs.lifetimeEl.textContent = `(${formatNumberAs(lifetime, numberFormat)} total)`;
      refs.sizesEl.textContent = sizeBreakdown;
      refs.sizesEl.style.display = sizeBreakdown ? '' : 'none';
    }
  }

  return { element: panel, update };
}
