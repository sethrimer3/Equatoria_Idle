import type { GameState } from '../../sim';
import type { ActionHandler } from '../../input';
import { TIER_BY_ID, type TierId } from '../../data/tiers';
import { EQUATION_PART_UPGRADES } from '../../data/upgrades';
import { EQUATION_FORGE_COST } from '../../data/balance';
import { getUpgradeLevel, getUpgradeCost } from '../../sim/progression';
import { getMotes } from '../../sim/resources';
import { formatNumberAs, type NumberFormat } from '../../util';
import { getMoteIconPath } from '../../render/assets/asset-paths';
import type { TraceEffect } from '../../render/ui/trace-effect';
import { HEAT_TAP_COUNT_FOR_CRUNCH } from '../../sim/forge';

/**
 * Equation progression panel.
 *
 * The visible equation formula was intentionally retired. The panel retains
 * forge unlock, heat state, upgrades, resources, and tier progression.
 */
export interface EquationPanel {
  element: HTMLElement;
  update(state: GameState, isDevMode?: boolean, numberFormat?: NumberFormat): void;
  setHighlightedTier(tierId: TierId | null): void;
}

export function createEquationPanel(
  dispatch: ActionHandler,
  _traceEffect?: TraceEffect,
  rightColumnElement?: HTMLElement,
): EquationPanel {
  const panel = document.createElement('div');
  panel.className = 'panel equation-panel';

  const lockedSection = document.createElement('div');
  lockedSection.className = 'forge-locked';
  lockedSection.innerHTML = `
    <div class="forge-locked-icon">&#x2726;</div>
    <div class="forge-locked-title">Equation Forge</div>
    <div class="forge-locked-desc">
      The Equation Forge lies dormant, awaiting enough Sand to ignite its power.
      <br/>Gather Sand from your Loom to awaken it.
    </div>
    <div class="forge-locked-cost">Requires <strong>${EQUATION_FORGE_COST} Sand</strong></div>
  `;

  const forgeUnlockBtn = document.createElement('button');
  forgeUnlockBtn.className = 'upgrade-btn forge-unlock-btn';
  forgeUnlockBtn.textContent = `🔥 Ignite the Forge — ${EQUATION_FORGE_COST} Sand`;
  forgeUnlockBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dispatch({ kind: 'unlock_equation_forge' });
  });
  lockedSection.appendChild(forgeUnlockBtn);
  panel.appendChild(lockedSection);

  const unlockedSection = document.createElement('div');
  unlockedSection.className = 'forge-unlocked';
  unlockedSection.style.display = 'none';

  const stickyHeader = document.createElement('div');
  stickyHeader.className = 'equation-sticky-header';
  const eqTitle = document.createElement('h3');
  eqTitle.className = 'panel-title equation-title';
  eqTitle.textContent = 'Equation Forge';
  stickyHeader.appendChild(eqTitle);

  const forgeHeatRow = document.createElement('div');
  forgeHeatRow.className = 'forge-heat-row';
  forgeHeatRow.style.display = 'none';
  stickyHeader.appendChild(forgeHeatRow);
  unlockedSection.appendChild(stickyHeader);

  const columnsBody = document.createElement('div');
  columnsBody.className = 'equation-columns-body';
  const leftCol = document.createElement('div');
  leftCol.className = 'equation-left-col';
  const upgradesTitle = document.createElement('h4');
  upgradesTitle.className = 'panel-title eq-upgrades-title';
  upgradesTitle.textContent = 'Equation Upgrades';
  leftCol.appendChild(upgradesTitle);
  columnsBody.appendChild(leftCol);

  if (rightColumnElement) {
    const rightCol = document.createElement('div');
    rightCol.className = 'equation-right-col';
    rightCol.appendChild(rightColumnElement);
    columnsBody.appendChild(rightCol);
  }
  unlockedSection.appendChild(columnsBody);
  panel.appendChild(unlockedSection);

  const upgradeButtons: Map<string, HTMLButtonElement> = new Map();
  // Per-button render signatures so update() only touches the DOM when the
  // rendered content actually changes (update() runs ~10x/sec).
  const upgradeSig: Map<string, string> = new Map();
  let lastForgeUnlocked: boolean | null = null;
  let lastHeatSig = '';
  let lastLockedSig = '';
  for (const def of EQUATION_PART_UPGRADES) {
    const btn = document.createElement('button');
    btn.className = 'upgrade-btn eq-upgrade-btn';
    btn.dataset['upgradeId'] = def.id;
    btn.dataset['tierId'] = def.tierId ?? '';
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'purchase_upgrade', upgradeId: def.id });
    });
    leftCol.appendChild(btn);
    upgradeButtons.set(def.id, btn);
  }

  function update(state: GameState, isDevMode = false, numberFormat: NumberFormat = 'letters'): void {
    if (state.equation.isForgeUnlocked) {
      if (lastForgeUnlocked !== true) {
        lockedSection.style.display = 'none';
        unlockedSection.style.display = '';
        lastForgeUnlocked = true;
      }

      const heatCount = state.forge.heatTapCount;
      const heatSig = String(heatCount);
      if (heatSig !== lastHeatSig) {
        lastHeatSig = heatSig;
        if (heatCount > 0) {
          forgeHeatRow.style.display = '';
          let dotsHtml = '';
          for (let i = 0; i < HEAT_TAP_COUNT_FOR_CRUNCH; i++) {
            dotsHtml += `<span class="forge-heat-dot${i < heatCount ? ' forge-heat-dot--filled' : ''}">&#9679;</span>`;
          }
          forgeHeatRow.innerHTML = `<span class="forge-heat-label">Forge heat:</span>${dotsHtml}<span class="forge-heat-hint">(${heatCount}/${HEAT_TAP_COUNT_FOR_CRUNCH})</span>`;
        } else {
          forgeHeatRow.style.display = 'none';
        }
      }

      for (const def of EQUATION_PART_UPGRADES) {
        const btn = upgradeButtons.get(def.id)!;
        const level = getUpgradeLevel(state.progression, def.id);
        const cost = getUpgradeCost(state.progression, def.id);
        const isMaxed = cost === null;
        const costTierId: TierId = def.tierId ?? 'sand';
        const canAfford = isDevMode || (cost !== null && getMotes(state.resources, costTierId) >= cost);
        const isVisible = isDevMode || def.tierId === null ||
          state.equation.segments.some(s => s.tierId === def.tierId && s.isUnlocked);

        // Single signature gates every DOM write for this button.
        const sig = `${isVisible ? 1 : 0}|${isMaxed ? 1 : 0}|${level}|${cost ?? ''}|${canAfford ? 1 : 0}|${numberFormat}`;
        if (sig === upgradeSig.get(def.id)) continue;
        upgradeSig.set(def.id, sig);

        btn.style.display = isVisible ? '' : 'none';
        btn.style.borderColor = def.tierId ? TIER_BY_ID.get(def.tierId)?.color ?? '#888' : '#ecf0f1';
        const iconHtml = def.tierId ? `<img class="gem-icon" src="${getMoteIconPath(def.tierId)}" alt="" />` : '';

        if (isMaxed) {
          btn.innerHTML = `${iconHtml}<span class="upgrade-text">${def.icon} ${def.displayName} — MAX (Lv ${level})</span>`;
          btn.disabled = true;
        } else {
          btn.innerHTML = `${iconHtml}<span class="upgrade-text">${def.icon} ${def.displayName} Lv ${level} — ${formatNumberAs(cost!, numberFormat)} motes</span>`;
          btn.disabled = !canAfford;
        }
      }
    } else {
      if (lastForgeUnlocked !== false) {
        lockedSection.style.display = '';
        unlockedSection.style.display = 'none';
        lastForgeUnlocked = false;
      }
      const sandMotes = getMotes(state.resources, 'sand');
      const lockedSig = `${sandMotes}|${isDevMode ? 1 : 0}|${numberFormat}`;
      if (lockedSig !== lastLockedSig) {
        lastLockedSig = lockedSig;
        forgeUnlockBtn.disabled = !isDevMode && sandMotes < EQUATION_FORGE_COST;
        forgeUnlockBtn.textContent = `🔥 Ignite the Forge — ${formatNumberAs(sandMotes, numberFormat)} / ${EQUATION_FORGE_COST} Sand`;
      }
    }
  }

  function setHighlightedTier(_tierId: TierId | null): void {
    // Equation segment highlighting retired with the visible equation display.
  }

  return { element: panel, update, setHighlightedTier };
}
