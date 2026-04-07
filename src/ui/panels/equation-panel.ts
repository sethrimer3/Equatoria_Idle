import type { GameState } from '../../sim';
import { buildEquationView } from '../../sim/equation';

/**
 * Equation panel — shows only the equation display.
 * All upgrades and unlock buttons live in the Upgrades tab.
 */
export interface EquationPanel {
  element: HTMLElement;
  update(state: GameState): void;
}

export function createEquationPanel(): EquationPanel {
  const panel = document.createElement('div');
  panel.className = 'panel equation-panel';

  const eqTitle = document.createElement('h3');
  eqTitle.className = 'panel-title equation-title';
  eqTitle.textContent = 'Equation Forge';
  panel.appendChild(eqTitle);

  const eqDisplay = document.createElement('div');
  eqDisplay.className = 'equation-display';
  panel.appendChild(eqDisplay);

  function update(state: GameState): void {
    const terms = buildEquationView(state.equation);
    if (terms.length === 0) {
      eqDisplay.innerHTML = `
        <span class="eq-prefix">f(t) = </span>
        <span class="eq-dormant">...</span>
      `;
    } else {
      let html = '<span class="eq-prefix">f(t) = </span>';
      const operatorGroups = buildStructuredEquation(terms);
      html += operatorGroups;
      eqDisplay.innerHTML = html;
    }
  }

  return { element: panel, update };
}

// ─── Helper: build structured equation HTML from terms ──────────

import type { EquationTermView } from '../../sim/equation';

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
