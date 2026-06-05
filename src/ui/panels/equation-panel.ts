import type { GameState } from '../../sim';
import { buildEquationView, buildStructuredEquationHtml } from '../../sim/equation';
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
 * Equation panel — shows the Equation Forge.
 * Before unlock: dormant locked forge state with unlock button.
 * After unlock: sticky equation display at top + two-column body:
 *   left column  — equation upgrade buttons
 *   right column — injected content (mote resources + tier unlock)
 */
export interface EquationPanel {
  element: HTMLElement;
  update(state: GameState, isDevMode?: boolean, numberFormat?: NumberFormat): void;
  /** Highlight (or clear) equation segments matching a given tier. */
  setHighlightedTier(tierId: TierId | null): void;
}

export function createEquationPanel(
  dispatch: ActionHandler,
  traceEffect?: TraceEffect,
  rightColumnElement?: HTMLElement,
): EquationPanel {
  const panel = document.createElement('div');
  panel.className = 'panel equation-panel';

  // ── Locked forge section (full-width, shown before forge unlock) ──
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

  // Sticky header — stays visible while the player scrolls through upgrades
  const stickyHeader = document.createElement('div');
  stickyHeader.className = 'equation-sticky-header';

  const eqTitle = document.createElement('h3');
  eqTitle.className = 'panel-title equation-title';
  eqTitle.textContent = 'Equation Forge';
  stickyHeader.appendChild(eqTitle);

  const eqDisplay = document.createElement('div');
  eqDisplay.className = 'equation-display';
  stickyHeader.appendChild(eqDisplay);

  // Forge heat indicator — shows tap progress toward the next crunch (0/3 → 2/3)
  const forgeHeatRow = document.createElement('div');
  forgeHeatRow.className = 'forge-heat-row';
  forgeHeatRow.style.display = 'none';
  stickyHeader.appendChild(forgeHeatRow);

  unlockedSection.appendChild(stickyHeader);

  // Two-column body: left = upgrade buttons, right = injected content
  const columnsBody = document.createElement('div');
  columnsBody.className = 'equation-columns-body';

  // Left column — equation upgrades
  const leftCol = document.createElement('div');
  leftCol.className = 'equation-left-col';

  const upgradesTitle = document.createElement('h4');
  upgradesTitle.className = 'panel-title eq-upgrades-title';
  upgradesTitle.textContent = 'Equation Upgrades';
  leftCol.appendChild(upgradesTitle);

  columnsBody.appendChild(leftCol);

  // Right column — mote resources + tier unlock button (injected from outside)
  if (rightColumnElement) {
    const rightCol = document.createElement('div');
    rightCol.className = 'equation-right-col';
    rightCol.appendChild(rightColumnElement);
    columnsBody.appendChild(rightCol);
  }

  unlockedSection.appendChild(columnsBody);
  panel.appendChild(unlockedSection);

  // Track which tier is currently hovered so the highlight survives innerHTML replacement
  let hoveredTierId: TierId | null = null;

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

    // Hover highlight: persist across innerHTML replacement by tracking hoveredTierId
    btn.addEventListener('pointerenter', () => {
      if (def.tierId) {
        hoveredTierId = def.tierId;
        highlightEquationTier(eqDisplay, def.tierId);
        if (traceEffect) {
          const matching = Array.from(eqDisplay.querySelectorAll(`.eq-term[data-tier="${def.tierId}"]`));
          traceEffect.setEquationTargets(matching);
        }
      }
    });
    btn.addEventListener('pointerleave', () => {
      hoveredTierId = null;
      clearEquationHighlight(eqDisplay);
      if (traceEffect) {
        traceEffect.setEquationTargets([]);
      }
    });

    leftCol.appendChild(btn);
    upgradeButtons.set(def.id, btn);
  }

  function update(state: GameState, isDevMode = false, numberFormat: NumberFormat = 'letters'): void {
    if (state.equation.isForgeUnlocked) {
      lockedSection.style.display = 'none';
      unlockedSection.style.display = '';

      // Update forge heat indicator
      const heatCount = state.forge.heatTapCount;
      if (heatCount > 0) {
        forgeHeatRow.style.display = '';
        let dotsHtml = '';
        for (let i = 0; i < HEAT_TAP_COUNT_FOR_CRUNCH; i++) {
          const filled = i < heatCount;
          dotsHtml += `<span class="forge-heat-dot${filled ? ' forge-heat-dot--filled' : ''}">●</span>`;
        }
        forgeHeatRow.innerHTML = `<span class="forge-heat-label">Forge heat:</span>${dotsHtml}<span class="forge-heat-hint">(${heatCount}/${HEAT_TAP_COUNT_FOR_CRUNCH})</span>`;
      } else {
        forgeHeatRow.style.display = 'none';
      }

      // Update equation display, then re-apply any active hover highlight
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

      // Re-apply highlight after innerHTML replacement to keep it persistent
      if (hoveredTierId) {
        highlightEquationTier(eqDisplay, hoveredTierId);
        if (traceEffect) {
          const matching = Array.from(eqDisplay.querySelectorAll(`.eq-term[data-tier="${hoveredTierId}"]`));
          traceEffect.setEquationTargets(matching);
        }
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

  function setHighlightedTier(tierId: TierId | null): void {
    if (tierId) {
      hoveredTierId = tierId;
      highlightEquationTier(eqDisplay, tierId);
      if (traceEffect) {
        const matching = Array.from(eqDisplay.querySelectorAll(`.eq-term[data-tier="${tierId}"]`));
        traceEffect.setEquationTargets(matching);
      }
    } else {
      hoveredTierId = null;
      clearEquationHighlight(eqDisplay);
      if (traceEffect) {
        traceEffect.setEquationTargets([]);
      }
    }
  }

  return { element: panel, update, setHighlightedTier };
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
