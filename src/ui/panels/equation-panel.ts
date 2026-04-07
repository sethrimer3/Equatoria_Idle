import type { GameState } from '../../sim';
import type { ActionHandler } from '../../input';
import { TIER_BY_ID, TIERS } from '../../data/tiers';
import { EQUATION_ROLE_BY_TIER } from '../../data/equation';
import { EQUATION_FORGE_COST } from '../../data/balance';
import { ALL_UPGRADES } from '../../data/upgrades';
import { getUpgradeLevel, getUpgradeCost } from '../../sim/progression';
import { getMotes } from '../../sim/resources';
import { buildEquationView } from '../../sim/equation';
import { formatNumber } from '../../util';
import { getGemIconPath } from '../../render/assets/asset-paths';
import type { TierId } from '../../data/tiers';

/**
 * Equation panel — shows the central equation and equation-specific upgrades.
 * Before forge unlock: shows locked forge presentation.
 * After unlock: shows the equation display + upgrade controls.
 */
export interface EquationPanel {
  element: HTMLElement;
  update(state: GameState): void;
}

export function createEquationPanel(dispatch: ActionHandler): EquationPanel {
  const panel = document.createElement('div');
  panel.className = 'panel equation-panel';

  // ── Locked forge presentation ──
  const lockedSection = document.createElement('div');
  lockedSection.className = 'forge-locked';
  lockedSection.innerHTML = `
    <div class="forge-locked-icon">⬡</div>
    <h3 class="forge-locked-title">Equation Forge</h3>
    <p class="forge-locked-desc">The forge lies dormant, waiting to be awakened.<br>Gather enough Sand to ignite its power.</p>
    <div class="forge-locked-cost">Requires ${EQUATION_FORGE_COST} Sand</div>
  `;

  const unlockBtn = document.createElement('button');
  unlockBtn.className = 'upgrade-btn forge-unlock-btn';
  unlockBtn.textContent = `🔥 Ignite the Equation Forge — ${EQUATION_FORGE_COST} Sand`;
  unlockBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dispatch({ kind: 'unlock_equation_forge' });
  });
  lockedSection.appendChild(unlockBtn);
  panel.appendChild(lockedSection);

  // ── Unlocked equation display ──
  const unlockedSection = document.createElement('div');
  unlockedSection.className = 'forge-unlocked';
  unlockedSection.style.display = 'none';

  const eqTitle = document.createElement('h3');
  eqTitle.className = 'panel-title equation-title';
  eqTitle.textContent = 'Equation Forge';
  unlockedSection.appendChild(eqTitle);

  // The equation display
  const eqDisplay = document.createElement('div');
  eqDisplay.className = 'equation-display';
  unlockedSection.appendChild(eqDisplay);

  // Equation upgrades section
  const upgradesTitle = document.createElement('h4');
  upgradesTitle.className = 'panel-title eq-upgrades-title';
  upgradesTitle.textContent = 'Equation Upgrades';
  unlockedSection.appendChild(upgradesTitle);

  // Tier unlock button
  const tierUnlockSection = document.createElement('div');
  tierUnlockSection.className = 'upgrade-section';
  const tierUnlockBtn = document.createElement('button');
  tierUnlockBtn.className = 'upgrade-btn unlock-btn';
  tierUnlockBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    dispatch({ kind: 'unlock_next_tier' });
  });
  tierUnlockSection.appendChild(tierUnlockBtn);
  unlockedSection.appendChild(tierUnlockSection);

  // Per-tier equation upgrade buttons
  const upgradeButtons: Map<string, HTMLButtonElement> = new Map();

  for (const def of ALL_UPGRADES) {
    const btn = document.createElement('button');
    btn.className = 'upgrade-btn eq-upgrade-btn';
    btn.dataset['upgradeId'] = def.id;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'purchase_upgrade', upgradeId: def.id });
    });
    unlockedSection.appendChild(btn);
    upgradeButtons.set(def.id, btn);
  }

  panel.appendChild(unlockedSection);

  function update(state: GameState): void {
    const isForgeUnlocked = state.equation.isForgeUnlocked;

    // Toggle locked/unlocked sections
    lockedSection.style.display = isForgeUnlocked ? 'none' : '';
    unlockedSection.style.display = isForgeUnlocked ? '' : 'none';

    if (!isForgeUnlocked) {
      // Update unlock button state
      const sandMotes = getMotes(state.resources, 'sand');
      unlockBtn.disabled = sandMotes < EQUATION_FORGE_COST;

      const progressEl = lockedSection.querySelector('.forge-locked-cost');
      if (progressEl) {
        progressEl.textContent = `${formatNumber(sandMotes)} / ${EQUATION_FORGE_COST} Sand`;
      }
      return;
    }

    // ── Update equation display ──
    const terms = buildEquationView(state.equation);
    if (terms.length === 0) {
      eqDisplay.innerHTML = `
        <span class="eq-prefix">f(t) = </span>
        <span class="eq-dormant">...</span>
      `;
    } else {
      let html = '<span class="eq-prefix">f(t) = </span>';
      // Build structured equation display based on operators
      const operatorGroups = buildStructuredEquation(terms);
      html += operatorGroups;
      eqDisplay.innerHTML = html;
    }

    // ── Update tier unlock button ──
    const nextIndex = state.progression.unlockedTierCount;
    if (nextIndex < TIERS.length && !TIERS[nextIndex].isSecret) {
      const nextTier = TIERS[nextIndex];
      const cost = tierUnlockCostFn(nextIndex);
      const payTierId = TIERS[nextIndex - 1]?.id ?? 'sand';
      const canAfford = getMotes(state.resources, payTierId) >= cost;
      const role = EQUATION_ROLE_BY_TIER.get(nextTier.id);
      const roleHint = role ? ` — ${role.roleDescription}` : '';
      tierUnlockBtn.textContent = `🔓 Unlock ${nextTier.displayName}${roleHint} — ${formatNumber(cost)} ${TIER_BY_ID.get(payTierId)?.displayName ?? ''} motes`;
      tierUnlockBtn.disabled = !canAfford;
      tierUnlockBtn.style.borderColor = nextTier.color;
      tierUnlockSection.style.display = '';
    } else {
      tierUnlockSection.style.display = 'none';
    }

    // ── Update equation upgrade buttons ──
    for (const def of ALL_UPGRADES) {
      const btn = upgradeButtons.get(def.id)!;
      const level = getUpgradeLevel(state.progression, def.id);
      const cost = getUpgradeCost(state.progression, def.id);
      const isMaxed = cost === null;

      const costTierId: TierId = def.tierId ?? 'sand';
      const canAfford = cost !== null && getMotes(state.resources, costTierId) >= cost;

      // Only show upgrades for unlocked tiers
      const isVisible = def.tierId === null ||
        state.equation.segments.some(s => s.tierId === def.tierId && s.isUnlocked);
      btn.style.display = isVisible ? '' : 'none';

      // Skip Sand tap upgrades (Sand is foundation, not equation)
      if (def.tierId === 'sand' && def.effectKind === 'tap_value') {
        btn.style.display = 'none';
        continue;
      }

      const tierColor = def.tierId ? TIER_BY_ID.get(def.tierId)?.color ?? '#888' : '#ecf0f1';
      btn.style.borderColor = tierColor;

      const iconSrc = def.tierId ? getGemIconPath(def.tierId) : '';
      const iconHtml = def.tierId
        ? `<img class="gem-icon" src="${iconSrc}" alt="" />`
        : '';

      const role = def.tierId ? EQUATION_ROLE_BY_TIER.get(def.tierId) : null;
      const roleHint = role ? ` (${role.symbol || role.operator})` : '';

      if (isMaxed) {
        btn.innerHTML = `${iconHtml}<span class="upgrade-text">${def.icon} ${def.displayName}${roleHint} — MAX (Lv ${level})</span>`;
        btn.disabled = true;
      } else {
        btn.innerHTML = `${iconHtml}<span class="upgrade-text">${def.icon} ${def.displayName}${roleHint} Lv ${level} — ${formatNumber(cost!)} motes</span>`;
        btn.disabled = !canAfford;
      }
    }
  }

  return { element: panel, update };
}

// ─── Helper: build structured equation HTML from terms ──────────

import type { EquationTermView } from '../../sim/equation';
import { tierUnlockCost as tierUnlockCostFn } from '../../data/balance';

function buildStructuredEquation(terms: EquationTermView[]): string {
  let html = '';
  let needsParenWrap = false;

  // Group terms by their structural role
  const passiveTerms = terms.filter(t => t.operator === 'passive_time');
  const manualTerms = terms.filter(t => t.operator === 'manual_input');
  const additionTerms = terms.filter(t => t.operator === 'addition');
  const multTerms = terms.filter(t => t.operator === 'multiplication');
  const expTerms = terms.filter(t => t.operator === 'exponentiation');
  const sumTerms = terms.filter(t => t.operator === 'summation');
  const prodTerms = terms.filter(t => t.operator === 'product');
  const factTerms = terms.filter(t => t.operator === 'factorial');
  const intTerms = terms.filter(t => t.operator === 'integration');
  const recTerms = terms.filter(t => t.operator === 'recursion');

  // Build summation prefix if present
  if (sumTerms.length > 0) {
    const t = sumTerms[0];
    html += `<span class="eq-term" data-tier="${t.tierId}" style="color:${t.color}">Σ<sub>k=1</sub><sup>${Math.floor(t.paramValue)}</sup></span> `;
  }

  // Build product prefix if present
  if (prodTerms.length > 0) {
    const t = prodTerms[0];
    html += `<span class="eq-term" data-tier="${t.tierId}" style="color:${t.color}">Π<sub>j=1</sub><sup>${Math.floor(t.paramValue)}</sup></span> `;
  }

  // Build integration prefix if present
  if (intTerms.length > 0) {
    const t = intTerms[0];
    html += `<span class="eq-term" data-tier="${t.tierId}" style="color:${t.color}">∫</span> `;
  }

  // Build factorial wrapper if present
  const hasFactorial = factTerms.length > 0;

  // Core expression: build from inner terms
  const innerParts: string[] = [];

  for (const t of manualTerms) {
    innerParts.push(`<span class="eq-term" data-tier="${t.tierId}" style="color:${t.color}">${t.text}</span>`);
  }

  // Add addition operator between manual and passive
  if (additionTerms.length > 0 && innerParts.length > 0 && passiveTerms.length > 0) {
    const at = additionTerms[0];
    innerParts.push(`<span class="eq-term eq-operator" data-tier="${at.tierId}" style="color:${at.color}"> + </span>`);
  } else if (innerParts.length > 0 && passiveTerms.length > 0) {
    innerParts.push('<span class="eq-operator"> + </span>');
  }

  for (const t of passiveTerms) {
    innerParts.push(`<span class="eq-term" data-tier="${t.tierId}" style="color:${t.color}">${t.text}</span>`);
  }

  // Wrap in parens if multiplication or exponent follows
  needsParenWrap = (multTerms.length > 0 || expTerms.length > 0) && innerParts.length > 1;

  let coreExpr = innerParts.join('');
  if (needsParenWrap) {
    coreExpr = `(${coreExpr})`;
  }

  // Apply multiplication
  if (multTerms.length > 0) {
    const mt = multTerms[0];
    coreExpr = `${coreExpr} <span class="eq-term" data-tier="${mt.tierId}" style="color:${mt.color}">${mt.text}</span>`;
  }

  // Apply exponentiation as superscript
  if (expTerms.length > 0) {
    const et = expTerms[0];
    const expVal = et.text.replace('^ ', '');
    coreExpr = `(${coreExpr})<sup class="eq-term" data-tier="${et.tierId}" style="color:${et.color}">${expVal}</sup>`;
  }

  // Apply factorial
  if (hasFactorial) {
    const ft = factTerms[0];
    coreExpr = `(${coreExpr})<span class="eq-term" data-tier="${ft.tierId}" style="color:${ft.color}">!</span>`;
  }

  html += coreExpr;

  // Integration suffix
  if (intTerms.length > 0) {
    const t = intTerms[0];
    html += ` <span class="eq-term" data-tier="${t.tierId}" style="color:${t.color}">dt</span>`;
  }

  // Recursion
  if (recTerms.length > 0) {
    const t = recTerms[0];
    html += ` <span class="eq-term" data-tier="${t.tierId}" style="color:${t.color}"> · f(f)</span>`;
  }

  return html;
}
