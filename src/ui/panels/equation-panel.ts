import type { GameState } from '../../sim';
import { buildEquationView, buildStructuredEquationHtml } from '../../sim/equation';
import type { ActionHandler } from '../../input';
import { TIER_BY_ID, type TierId } from '../../data/tiers';
import { EQUATION_PART_UPGRADES } from '../../data/upgrades';
import { EQUATION_FORGE_COST } from '../../data/balance';
import { getUpgradeLevel, getUpgradeCost } from '../../sim/progression';
import { getMotes } from '../../sim/resources';
import { formatNumberAs, type NumberFormat } from '../../util';
import { getGemIconPath } from '../../render/assets/asset-paths';
import type { TraceEffect } from '../../render/ui/trace-effect';

/**
 * Equation panel — shows the Equation Forge.
 * Before unlock: dormant locked forge state with unlock button.
 * After unlock: structured nested equation + equation upgrades grouped by tier.
 */
export interface EquationPanel {
  element: HTMLElement;
  update(state: GameState, isDevMode?: boolean, numberFormat?: NumberFormat): void;
}

export function createEquationPanel(dispatch: ActionHandler, traceEffect?: TraceEffect): EquationPanel {
  const panel = document.createElement('div');
  panel.className = 'panel equation-panel';

  // ── Locked forge section ──
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

  // ── Unlocked forge section ──
  const unlockedSection = document.createElement('div');
  unlockedSection.className = 'forge-unlocked';
  unlockedSection.style.display = 'none';

  const eqTitle = document.createElement('h3');
  eqTitle.className = 'panel-title equation-title';
  eqTitle.textContent = 'Equation Forge';
  unlockedSection.appendChild(eqTitle);

  const eqDisplay = document.createElement('div');
  eqDisplay.className = 'equation-display';
  unlockedSection.appendChild(eqDisplay);

  // Equation upgrades section
  const upgradesTitle = document.createElement('h4');
  upgradesTitle.className = 'panel-title eq-upgrades-title';
  upgradesTitle.textContent = 'Equation Upgrades';
  unlockedSection.appendChild(upgradesTitle);

  const upgradeButtons: Map<string, HTMLButtonElement> = new Map();

  for (const def of EQUATION_PART_UPGRADES) {
    const btn = document.createElement('button');
    btn.className = 'upgrade-btn eq-upgrade-btn';
    btn.dataset['upgradeId'] = def.id;
    btn.dataset['tierId'] = def.tierId ?? '';

    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'purchase_upgrade', upgradeId: def.id });
    });

    // Hover highlight: add/remove class on the equation display
    btn.addEventListener('pointerenter', () => {
      if (def.tierId) {
        highlightEquationTier(eqDisplay, def.tierId);
        if (traceEffect) {
          const matching = Array.from(eqDisplay.querySelectorAll(`.eq-term[data-tier="${def.tierId}"]`));
          traceEffect.setEquationTargets(matching);
        }
      }
    });
    btn.addEventListener('pointerleave', () => {
      clearEquationHighlight(eqDisplay);
      if (traceEffect) {
        traceEffect.setEquationTargets([]);
      }
    });

    unlockedSection.appendChild(btn);
    upgradeButtons.set(def.id, btn);
  }

  panel.appendChild(unlockedSection);

  function update(state: GameState, isDevMode = false, numberFormat: NumberFormat = 'letters'): void {
    if (state.equation.isForgeUnlocked) {
      lockedSection.style.display = 'none';
      unlockedSection.style.display = '';

      // Update equation display
      const terms = buildEquationView(state.equation);
      const html = buildStructuredEquationHtml(terms);
      if (html) {
        eqDisplay.innerHTML = html;
      } else {
        eqDisplay.innerHTML = `
          <span class="eq-prefix">f(t) = </span>
          <span class="eq-dormant">…</span>
        `;
      }

      // Update equation upgrade buttons
      for (const def of EQUATION_PART_UPGRADES) {
        const btn = upgradeButtons.get(def.id)!;
        const level = getUpgradeLevel(state.progression, def.id);
        const cost = getUpgradeCost(state.progression, def.id);
        const isMaxed = cost === null;

        const costTierId: TierId = def.tierId ?? 'sand';
        const canAfford = isDevMode || (cost !== null && getMotes(state.resources, costTierId) >= cost);

        // Show only if the tier is unlocked
        const isVisible = isDevMode || def.tierId === null ||
          state.equation.segments.some(s => s.tierId === def.tierId && s.isUnlocked);
        btn.style.display = isVisible ? '' : 'none';

        const tierColor = def.tierId ? TIER_BY_ID.get(def.tierId)?.color ?? '#888' : '#ecf0f1';
        btn.style.borderColor = tierColor;

        const iconSrc = def.tierId ? getGemIconPath(def.tierId) : '';
        const iconHtml = def.tierId
          ? `<img class="gem-icon" src="${iconSrc}" alt="" />`
          : '';

        if (isMaxed) {
          btn.innerHTML = `${iconHtml}<span class="upgrade-text">${def.icon} ${def.displayName} — MAX (Lv ${level})</span>`;
          btn.disabled = true;
        } else {
          btn.innerHTML = `${iconHtml}<span class="upgrade-text">${def.icon} ${def.displayName} Lv ${level} — ${formatNumberAs(cost!, numberFormat)} motes</span>`;
          btn.disabled = !canAfford;
        }
      }
    } else {
      lockedSection.style.display = '';
      unlockedSection.style.display = 'none';

      // Update forge unlock button affordability
      const sandMotes = getMotes(state.resources, 'sand');
      forgeUnlockBtn.disabled = !isDevMode && sandMotes < EQUATION_FORGE_COST;
      forgeUnlockBtn.textContent = `🔥 Ignite the Forge — ${formatNumberAs(sandMotes, numberFormat)} / ${EQUATION_FORGE_COST} Sand`;
    }
  }

  return { element: panel, update };
}

// ─── Highlight helpers ──────────────────────────────────────────

function highlightEquationTier(display: HTMLElement, tierId: TierId): void {
  const terms = display.querySelectorAll('.eq-term');
  for (const el of terms) {
    const htmlEl = el as HTMLElement;
    if (htmlEl.dataset['tier'] === tierId) {
      htmlEl.classList.add('eq-highlight');
    } else {
      htmlEl.classList.add('eq-dimmed');
    }
  }
}

function clearEquationHighlight(display: HTMLElement): void {
  const terms = display.querySelectorAll('.eq-term');
  for (const el of terms) {
    const htmlEl = el as HTMLElement;
    htmlEl.classList.remove('eq-highlight', 'eq-dimmed');
  }
}
