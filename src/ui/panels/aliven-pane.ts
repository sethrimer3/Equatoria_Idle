/**
 * aliven-pane.ts — Aliven sub-tab content.
 *
 * Renders the "Aliven" sub-tab within the combined Upgrades panel:
 *   • Per-tier aliven rows with purchase buttons
 *   • Interactive NxN interaction-matrix grid with drag-to-adjust cells
 *
 * Extracted from loom-panel.ts to keep each sub-tab in its own focused module.
 */

import type { GameState } from '../../sim';
import type { ActionHandler } from '../../input';
import type { NumberFormat } from '../../util';
import { TIERS } from '../../data/tiers';
import {
  isAlivened,
  isTierAliveneable,
  canAffordAliven,
  ALIVEN_COST,
} from '../../sim/aliven';
import { formatNumberAs } from '../../util';
import type { TraceEffect } from '../../render/ui/trace-effect';
import { makePageBreak } from '../ui-helpers';
import { createAlivenPaneMatrixSection } from './aliven-pane-matrix';

export interface AlivenPane {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createAlivenPane(dispatch: ActionHandler, traceEffect?: TraceEffect): AlivenPane {
  const pane = document.createElement('div');
  pane.className = 'looms-sub-pane';

  // ── Title & subtitle ─────────────────────────────────────────

  const alivenTitle = document.createElement('h3');
  alivenTitle.className = 'panel-title';
  alivenTitle.textContent = 'Aliven';
  pane.appendChild(alivenTitle);

  const alivenSubtitle = document.createElement('p');
  alivenSubtitle.className = 'panel-subtitle';
  alivenSubtitle.textContent = 'Awaken motes to enable Particle Life interactions';
  pane.appendChild(alivenSubtitle);

  const matrixSection = createAlivenPaneMatrixSection(dispatch, traceEffect);
  pane.appendChild(matrixSection.element);

  // ── Aliven upgrade rows (below matrix) ───────────────────────

  const alivenRows: Map<string, HTMLElement> = new Map();
  const alivenButtons: Map<string, HTMLButtonElement> = new Map();
  const alivenRowsContainer = document.createElement('div');
  alivenRowsContainer.className = 'aliven-rows';
  pane.appendChild(alivenRowsContainer);

  for (const tier of TIERS) {
    if (!isTierAliveneable(tier.id)) continue;

    const row = document.createElement('div');
    row.className = 'aliven-tier-row';
    row.style.borderLeftColor = tier.color;

    const rowHeader = document.createElement('div');
    rowHeader.className = 'aliven-tier-row-header';

    const nameBadge = document.createElement('span');
    nameBadge.className = 'aliven-tier-name';
    nameBadge.style.color = tier.color;
    nameBadge.textContent = tier.displayName;
    rowHeader.appendChild(nameBadge);

    const statusBadge = document.createElement('span');
    statusBadge.className = 'aliven-status-badge';
    rowHeader.appendChild(statusBadge);

    row.appendChild(rowHeader);

    const btn = document.createElement('button');
    btn.className = 'upgrade-btn aliven-btn';
    btn.style.borderColor = tier.color;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'aliven_mote', tierId: tier.id });
    });
    row.appendChild(btn);

    alivenRowsContainer.appendChild(row);
    alivenRows.set(tier.id, row);
    alivenButtons.set(tier.id, btn);
  }

  // DOM order: title, subtitle, matrixSection, [page break], alivenRowsContainer, [page break]
  pane.insertBefore(makePageBreak('small'), alivenRowsContainer);
  pane.appendChild(makePageBreak('small'));

  // ─── Update ───────────────────────────────────────────────────

  function update(state: GameState, numberFormat: NumberFormat): void {
    matrixSection.update(state);

    const unlockedCount = state.progression.unlockedTierCount;

    for (const tier of TIERS) {
      if (!isTierAliveneable(tier.id)) continue;
      const row = alivenRows.get(tier.id);
      const btn = alivenButtons.get(tier.id);
      if (!row || !btn) continue;

      const tierUnlocked = tier.unlockOrder < unlockedCount;
      row.style.display = tierUnlocked ? '' : 'none';
      if (!tierUnlocked) continue;

      const alive = isAlivened(state.aliven, tier.id);
      const affordable = canAffordAliven(state.resources, tier.id);

      const statusBadge = row.querySelector('.aliven-status-badge') as HTMLElement | null;
      if (statusBadge) {
        statusBadge.textContent = alive ? '✦ Alive' : '';
        statusBadge.style.color = tier.color;
      }

      row.classList.toggle('aliven-tier-row--alive', alive);

      if (alive) {
        btn.style.display = 'none';
      } else {
        btn.style.display = '';
        btn.textContent = `✦ Aliven — ${formatNumberAs(ALIVEN_COST, numberFormat)} ${tier.displayName}`;
        btn.disabled = !affordable;
        btn.style.opacity = affordable ? '1' : '0.5';
      }
    }

  }

  return { element: pane, update };
}
