/**
 * loom-panel.ts — Combined Upgrades panel orchestrator.
 *
 * Hosts four sub-tabs:
 *   Forge     – live forge preview + weapon crafting + weapon inventory
 *   Equa(STUB)– equation forge + upgrade buttons (dev mode only)
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
import { drawForgePreview } from '../../render/forge';
import { createRpgWeaponCraftingPage } from './rpg-weapon-crafting-page';
import type { RpgWeaponCraftingPage } from './rpg-weapon-crafting-page';
import { createForgeInventory } from './forge-inventory';
import type { ForgeInventory } from './forge-inventory';

// ── Forge preview canvas dimensions ─────────────────────────────
const FORGE_PREVIEW_SIZE = 160;

export interface LoomPanel {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat, isDevMode?: boolean): void;
  dispose(): void;
}

export function createLoomPanel(dispatch: ActionHandler, traceEffect?: TraceEffect, equationContent?: HTMLElement): LoomPanel {
  const panel = document.createElement('div');
  panel.className = 'panel loom-panel';

  // ── Sub-tab bar ──────────────────────────────────────────────

  const subTabBar = document.createElement('div');
  subTabBar.className = 'looms-sub-tab-bar';
  panel.appendChild(subTabBar);

  const forgeTabBtn = document.createElement('button');
  forgeTabBtn.className = 'looms-sub-tab-btn active';
  forgeTabBtn.textContent = 'FORGE';
  subTabBar.appendChild(forgeTabBtn);

  const equationTabBtn = document.createElement('button');
  equationTabBtn.className = 'looms-sub-tab-btn';
  equationTabBtn.textContent = 'Equa(STUB)';
  equationTabBtn.style.display = 'none';
  subTabBar.appendChild(equationTabBtn);

  const upgradesTabBtn = document.createElement('button');
  upgradesTabBtn.className = 'looms-sub-tab-btn';
  upgradesTabBtn.textContent = 'Loom';
  subTabBar.appendChild(upgradesTabBtn);

  const alivenTabBtn = document.createElement('button');
  alivenTabBtn.className = 'looms-sub-tab-btn';
  alivenTabBtn.textContent = 'Aliven';
  subTabBar.appendChild(alivenTabBtn);

  // ── Forge pane ───────────────────────────────────────────────

  const forgePane = document.createElement('div');
  forgePane.className = 'looms-sub-pane forge-preview-pane';
  panel.appendChild(forgePane);

  // Canvas preview (top center)
  const forgePreviewWrapper = document.createElement('div');
  forgePreviewWrapper.className = 'forge-preview-wrapper';
  forgePane.appendChild(forgePreviewWrapper);

  const forgePreviewCanvas = document.createElement('canvas');
  forgePreviewCanvas.width = FORGE_PREVIEW_SIZE;
  forgePreviewCanvas.height = FORGE_PREVIEW_SIZE;
  forgePreviewCanvas.className = 'forge-preview-canvas';
  forgePreviewWrapper.appendChild(forgePreviewCanvas);

  const forgePreviewCtx = forgePreviewCanvas.getContext('2d')!;

  // Section divider helper
  function makeDivider(label: string): HTMLElement {
    const div = document.createElement('div');
    div.className = 'forge-section-divider';
    div.textContent = label;
    return div;
  }

  // Crafting section
  forgePane.appendChild(makeDivider('Forge Crafting'));
  const craftingPage: RpgWeaponCraftingPage = createRpgWeaponCraftingPage(dispatch);
  forgePane.appendChild(craftingPage.element);

  // Inventory section
  forgePane.appendChild(makeDivider('Inventory'));
  const inventory: ForgeInventory = createForgeInventory();
  forgePane.appendChild(inventory.element);

  // ── Forge preview animation loop ─────────────────────────────

  let latestForgeState = null as GameState['forge'] | null;
  let forgePreviewRafId: number | null = null;

  function forgePreviewTick(): void {
    if (!latestForgeState) {
      forgePreviewRafId = requestAnimationFrame(forgePreviewTick);
      return;
    }
    const nowMs = performance.now();
    forgePreviewCtx.clearRect(0, 0, FORGE_PREVIEW_SIZE, FORGE_PREVIEW_SIZE);
    drawForgePreview(forgePreviewCtx, FORGE_PREVIEW_SIZE, FORGE_PREVIEW_SIZE, latestForgeState, nowMs);
    forgePreviewRafId = requestAnimationFrame(forgePreviewTick);
  }

  // ── Equation pane ────────────────────────────────────────────

  const equationPane = document.createElement('div');
  equationPane.className = 'looms-sub-pane';
  equationPane.style.display = 'none';
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

  let activeSubTab: 'forge' | 'equation' | 'loom' | 'aliven' = 'forge';

  function setSubTab(tab: 'forge' | 'equation' | 'loom' | 'aliven'): void {
    if (activeSubTab === 'aliven' && tab !== 'aliven') alivenPane.cancelTransient();
    activeSubTab = tab;
    forgeTabBtn.classList.toggle('active', tab === 'forge');
    equationTabBtn.classList.toggle('active', tab === 'equation');
    upgradesTabBtn.classList.toggle('active', tab === 'loom');
    alivenTabBtn.classList.toggle('active', tab === 'aliven');
    forgePane.style.display = tab === 'forge' ? '' : 'none';
    equationPane.style.display = tab === 'equation' ? '' : 'none';
    loomUpgradesPane.element.style.display = tab === 'loom' ? '' : 'none';
    alivenPane.element.style.display = tab === 'aliven' ? '' : 'none';

    if (tab === 'forge' && forgePreviewRafId === null) {
      forgePreviewTick();
    } else if (tab !== 'forge' && forgePreviewRafId !== null) {
      cancelAnimationFrame(forgePreviewRafId);
      forgePreviewRafId = null;
    }
  }

  forgeTabBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); setSubTab('forge'); });
  equationTabBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); setSubTab('equation'); });
  upgradesTabBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); setSubTab('loom'); });
  alivenTabBtn.addEventListener('pointerdown', (e) => { e.stopPropagation(); setSubTab('aliven'); });

  // Start forge preview immediately since FORGE is the default tab
  forgePreviewTick();

  // ── Update ───────────────────────────────────────────────────

  function update(state: GameState, numberFormat: NumberFormat, isDevMode = false): void {
    latestForgeState = state.forge;

    // Show/hide equation sub-tab based on dev mode
    equationTabBtn.style.display = isDevMode ? '' : 'none';
    if (!isDevMode && activeSubTab === 'equation') setSubTab('forge');

    if (activeSubTab === 'forge') {
      craftingPage.update(state.rpg, isDevMode, state.forge, state.resources, numberFormat);
      inventory.update(state.rpg.craftedWeapons);
    }
    if (activeSubTab === 'loom')   loomUpgradesPane.update(state, numberFormat);
    if (activeSubTab === 'aliven') alivenPane.update(state, numberFormat);
  }

  return {
    element: panel,
    update,
    dispose(): void {
      if (forgePreviewRafId !== null) cancelAnimationFrame(forgePreviewRafId);
      forgePreviewRafId = null;
      latestForgeState = null;
      craftingPage.dispose();
      inventory.dispose();
      alivenPane.cancelTransient();
    },
  };
}
