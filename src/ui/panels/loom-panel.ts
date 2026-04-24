/**
 * loom-panel.ts — Combined Upgrades panel orchestrator.
 *
 * Hosts three sub-tabs:
 *   Equation  – equation forge + upgrade buttons + tier progression + resources
 *   Loom      – passive production Looms + special one-time upgrades
 *   Aliven    – the Particle Life Aliven matrix
 *
 * Each sub-tab's DOM and update logic live in a dedicated sub-pane module.
 * This file is responsible only for the outer shell and sub-tab switching.
 */

import type { GameState } from '../../sim';
import type { ActionHandler } from '../../input';
import type { NumberFormat } from '../../util';
import type { TraceEffect } from '../../render/ui/trace-effect';
import { createLoomUpgradesPane } from './loom-upgrades-pane';
import { createAlivenPane } from './aliven-pane';

export interface LoomPanel {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
}

export function createLoomPanel(dispatch: ActionHandler, traceEffect?: TraceEffect, equationContent?: HTMLElement): LoomPanel {
  const panel = document.createElement('div');
  panel.className = 'panel loom-panel';

  // ── Sub-tab bar ──────────────────────────────────────────────

  const subTabBar = document.createElement('div');
  subTabBar.className = 'looms-sub-tab-bar';
  panel.appendChild(subTabBar);

  const equationTabBtn = document.createElement('button');
  equationTabBtn.className = 'looms-sub-tab-btn active';
  equationTabBtn.textContent = 'Equation';
  subTabBar.appendChild(equationTabBtn);

  const upgradesTabBtn = document.createElement('button');
  upgradesTabBtn.className = 'looms-sub-tab-btn';
  upgradesTabBtn.textContent = 'Loom';
  subTabBar.appendChild(upgradesTabBtn);

  const alivenTabBtn = document.createElement('button');
  alivenTabBtn.className = 'looms-sub-tab-btn';
  alivenTabBtn.textContent = 'Aliven';
  subTabBar.appendChild(alivenTabBtn);

  // ── Equation pane ────────────────────────────────────────────

  const equationPane = document.createElement('div');
  equationPane.className = 'looms-sub-pane';
  if (equationContent) {
    equationPane.appendChild(equationContent);
  }
  panel.appendChild(equationPane);

  // ── Loom upgrades pane ───────────────────────────────────────

  const loomUpgradesPane = createLoomUpgradesPane(dispatch);
  loomUpgradesPane.element.style.display = 'none';
  panel.appendChild(loomUpgradesPane.element);

  // ── Aliven pane ──────────────────────────────────────────────

  const alivenPane = createAlivenPane(dispatch, traceEffect);
  alivenPane.element.style.display = 'none';
  panel.appendChild(alivenPane.element);

  // ── Sub-tab switching ────────────────────────────────────────

  let activeSubTab: 'equation' | 'loom' | 'aliven' = 'equation';

  function setSubTab(tab: 'equation' | 'loom' | 'aliven'): void {
    activeSubTab = tab;
    equationTabBtn.classList.toggle('active', tab === 'equation');
    upgradesTabBtn.classList.toggle('active', tab === 'loom');
    alivenTabBtn.classList.toggle('active', tab === 'aliven');
    equationPane.style.display           = tab === 'equation' ? '' : 'none';
    loomUpgradesPane.element.style.display = tab === 'loom'     ? '' : 'none';
    alivenPane.element.style.display       = tab === 'aliven'   ? '' : 'none';
  }

  equationTabBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    setSubTab('equation');
  });
  upgradesTabBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    setSubTab('loom');
  });
  alivenTabBtn.addEventListener('pointerdown', (e) => {
    e.stopPropagation();
    setSubTab('aliven');
  });

  // ── Update ───────────────────────────────────────────────────

  function update(state: GameState, numberFormat: NumberFormat): void {
    if (activeSubTab === 'loom')   loomUpgradesPane.update(state, numberFormat);
    if (activeSubTab === 'aliven') alivenPane.update(state, numberFormat);
  }

  return { element: panel, update };
}
