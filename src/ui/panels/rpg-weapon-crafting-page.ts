/**
 * rpg-weapon-crafting-page.ts — Standalone weapon-crafting workspace for the RPG Upgrades tab.
 *
 * Features:
 *   • Mote loom selector around the forge icon (up to forge capacity)
 *   • Multi-segment percentage slider with N-1 draggable handles
 *   • Power slider (1–100% of max budget)
 *   • Live composition preview (actual, post-floor)
 *   • Craft button with validation messages
 *   • Collapsible "Exact counts / advanced" fallback
 *
 * This module dispatches { kind: 'craft_weapon', ingredients } just like the
 * previous buildForgeCraftingPanel in rpg-weapons-tab.ts.  Move this file into
 * its own tab or the RPG Forge location whenever ready — no other file depends
 * on its internal structure.
 */

import { TIERS, TIER_BY_ID, type TierId } from '../../data/tiers';
import {
  getForgeCapacity,
  computeCraftedWeaponComposition,
  computeTotalWeightedMoteValue,
  computeCraftedWeaponBaseLevel,
  computeCraftedWeaponBaseStatMultiplier,
} from '../../data/rpg/crafted-weapon-helpers';
import {
  enforceMinSegmentSize,
  snapToStep,
  sharesFromHandles,
  handlesFromShares,
  clampHandle,
  computeMaxBudget,
  allocateIngredients,
  MIN_SEGMENT_PCT,
  SEGMENT_STEP_PCT,
} from '../../data/rpg/crafting-allocation';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgUpgradeLevel } from '../../sim/rpg/rpg-state';
import type { ActionHandler } from '../../input';
import { getGeneratorSpritePath } from '../../render/assets/asset-paths';
import { loadImage } from '../../render/assets/asset-loader';
import { createTintedCanvas } from '../../render/assets/sprite-tint';

// ─── Types ───────────────────────────────────────────────────────────────────

export interface RpgWeaponCraftingPage {
  element: HTMLElement;
  update(rpgState: RpgSimState, isDevMode: boolean): void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const MIN_FRACTION = MIN_SEGMENT_PCT / 100;
const STEP_FRACTION = SEGMENT_STEP_PCT / 100;

function renderMoteLoomGlyph(canvas: HTMLCanvasElement, spritePath: string, color: string): void {
  loadImage(spritePath).then((sprite) => {
    const tinted = createTintedCanvas(sprite, color);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(tinted, 0, 0, canvas.width, canvas.height);
  }).catch(() => { /* Sprite fallback is the CSS ring around the canvas. */ });
}

// ─── Factory ─────────────────────────────────────────────────────────────────

export function createRpgWeaponCraftingPage(dispatch: ActionHandler): RpgWeaponCraftingPage {
  // ── Root element ────────────────────────────────────────────────────────
  const element = document.createElement('div');
  element.className = 'forge-craft';

  // ── State ───────────────────────────────────────────────────────────────
  const selectedTiers: TierId[] = [];
  let handlePositions: number[] = [];   // N-1 values in (0,1), one per boundary
  let powerFraction = 1.0;              // 0–1 of max budget

  // Latest rpgState snapshot (for inventory etc.)
  let latestRpgState: RpgSimState | null = null;
  let latestIsDevMode = false;

  // ── Sections created during build() ─────────────────────────────────────
  let inventoryEl: HTMLElement | null = null;
  let moteLoomFieldEl: HTMLElement | null = null;
  let moteHeadingEl: HTMLElement | null = null;
  let capacityLabelEl: HTMLElement | null = null;
  let sliderSectionEl: HTMLElement | null = null;
  let powerSectionEl: HTMLElement | null = null;
  let previewSectionEl: HTMLElement | null = null;
  let craftBtnEl: HTMLButtonElement | null = null;
  let validationEl: HTMLElement | null = null;
  let advancedEl: HTMLElement | null = null;   // <details>

  // ── Derived shares from handle positions ────────────────────────────────
  function computeShares(): number[] {
    return sharesFromHandles(handlePositions);
  }

  // ── Inventory snapshot from rpgState ────────────────────────────────────
  function getInventory(): Map<TierId, number> {
    return latestRpgState?.refinedCrystalsByTierId ?? new Map();
  }

  function getForgeCapacityCurrent(): number {
    if (!latestRpgState) return 2;
    const level = getRpgUpgradeLevel(latestRpgState, 'forge_craft_level') + 1;
    return getForgeCapacity(level);
  }

  function refreshInventory(): void {
    if (!inventoryEl || !latestRpgState) return;
    const invMap = latestRpgState.refinedCrystalsByTierId;
    const hasAnyCrystals = Array.from(invMap.values()).some(n => n > 0);
    if (!hasAnyCrystals && !latestIsDevMode) {
      inventoryEl.textContent = 'No refined crystals yet. Trigger forge crunches to produce them.';
      return;
    }

    const rows: string[] = [];
    for (const tier of TIERS) {
      const count = invMap.get(tier.id) ?? 0;
      if (count <= 0 && !latestIsDevMode) continue;
      rows.push(`${tier.displayName}: ${latestIsDevMode && count === 0 ? 'inf' : count}`);
    }
    inventoryEl.textContent = rows.length > 0 ? 'Refined crystals: ' + rows.join(' · ') : '';
  }

  // ── Toggle a mote loom ───────────────────────────────────────────────────
  function toggleTier(tierId: TierId): void {
    const capacity = getForgeCapacityCurrent();
    const idx = selectedTiers.indexOf(tierId);
    if (idx >= 0) {
      selectedTiers.splice(idx, 1);
    } else {
      if (selectedTiers.length >= capacity) return;
      selectedTiers.push(tierId);
    }
    // Reset to equal shares when tier list changes
    const n = selectedTiers.length;
    if (n <= 1) {
      handlePositions = [];
    } else {
      const equalShare = 1 / n;
      handlePositions = handlesFromShares(new Array(n).fill(equalShare));
    }
    refreshSlider();
    refreshPower();
    refreshPreview();
    refreshCraftBtn();
    refreshAdvanced();
    refreshMoteLooms();
  }

  // ── Build mote loom field ────────────────────────────────────────────────
  function buildMoteLoomField(): HTMLElement {
    const field = document.createElement('div');
    field.className = 'forge-craft__loom-field';
    const forgeCore = document.createElement('div');
    forgeCore.className = 'forge-craft__forge-core';
    forgeCore.setAttribute('aria-hidden', 'true');
    field.appendChild(forgeCore);
    return field;
  }

  function refreshMoteLooms(): void {
    if (!moteLoomFieldEl) return;
    const loomField = moteLoomFieldEl;
    const forgeCore = loomField.querySelector('.forge-craft__forge-core');
    loomField.innerHTML = '';
    if (forgeCore) loomField.appendChild(forgeCore);

    const capacity = getForgeCapacityCurrent();
    const inventory = getInventory();
    if (moteHeadingEl) {
      moteHeadingEl.textContent = `Select mote types (${selectedTiers.length}/${capacity}):`;
    }
    const availableTiers = TIERS.filter(tier => latestIsDevMode || (inventory.get(tier.id) ?? 0) > 0);
    const total = Math.max(availableTiers.length, 1);

    availableTiers.forEach((tier, index) => {
      const available = latestIsDevMode
        ? 9999
        : (inventory.get(tier.id) ?? 0);
      const isSelected = selectedTiers.includes(tier.id);
      const atCapacity = selectedTiers.length >= capacity && !isSelected;
      const angleRad = -Math.PI / 2 + (Math.PI * 2 * index) / total;
      const xPct = 50 + Math.cos(angleRad) * 39;
      const yPct = 50 + Math.sin(angleRad) * 39;

      const loom = document.createElement('button');
      loom.type = 'button';
      loom.className = 'forge-craft__mote-loom';
      loom.classList.toggle('forge-craft__mote-loom--selected', isSelected);
      loom.classList.toggle('forge-craft__mote-loom--disabled', atCapacity && !isSelected);
      loom.style.setProperty('--loom-color', tier.color);
      loom.style.left = `${xPct}%`;
      loom.style.top = `${yPct}%`;
      loom.disabled = atCapacity && !isSelected;
      loom.setAttribute('aria-pressed', String(isSelected));
      loom.setAttribute(
        'aria-label',
        `${isSelected ? 'Remove' : 'Add'} ${tier.displayName} mote type (${available === 9999 ? 'unlimited' : available} crystals)`,
      );

      const glyph = document.createElement('canvas');
      glyph.className = 'forge-craft__mote-loom-glyph';
      glyph.width = 56;
      glyph.height = 56;
      glyph.setAttribute('aria-hidden', 'true');
      renderMoteLoomGlyph(glyph, getGeneratorSpritePath(tier.unlockOrder), tier.color);
      loom.appendChild(glyph);

      loom.addEventListener('click', () => toggleTier(tier.id));
      loomField.appendChild(loom);
    });
  }
  // ── Multi-segment percentage slider ─────────────────────────────────────

  let trackEl: HTMLElement | null = null;

  function buildSliderSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'forge-craft__slider-section';
    return section;
  }

  function refreshSlider(): void {
    if (!sliderSectionEl) return;
    sliderSectionEl.innerHTML = '';

    const n = selectedTiers.length;
    if (n < 2) {
      if (n === 1) {
        const hint = document.createElement('div');
        hint.className = 'forge-craft__hint';
        hint.textContent = 'Select at least 2 mote types to enable the percentage slider.';
        sliderSectionEl.appendChild(hint);
      }
      return;
    }

    const shares = computeShares();

    // Heading
    const heading = document.createElement('div');
    heading.className = 'forge-craft__section-label';
    heading.textContent = 'Target composition:';
    sliderSectionEl.appendChild(heading);

    // Track container
    const trackWrap = document.createElement('div');
    trackWrap.className = 'forge-craft__track-wrap';

    trackEl = document.createElement('div');
    trackEl.className = 'forge-craft__track';

    // Segments
    let cumPct = 0;
    for (let i = 0; i < n; i++) {
      const pct = shares[i] * 100;
      const tier = TIER_BY_ID.get(selectedTiers[i]);
      const color = tier?.color ?? '#aaa';

      const seg = document.createElement('div');
      seg.className = 'forge-craft__segment';
      seg.style.left = `${cumPct}%`;
      seg.style.width = `${pct}%`;
      seg.style.background = `linear-gradient(135deg, ${color}cc, ${color}66)`;
      seg.style.setProperty('--seg-color', color);

      const segLabel = document.createElement('div');
      segLabel.className = 'forge-craft__segment-label';
      segLabel.textContent = `${tier?.displayName ?? selectedTiers[i]} ${Math.round(pct)}%`;
      seg.appendChild(segLabel);

      trackEl.appendChild(seg);
      cumPct += pct;
    }

    // Handles (N-1)
    for (let hi = 0; hi < n - 1; hi++) {
      const handlePct = handlePositions[hi] * 100;
      const handle = document.createElement('div');
      handle.className = 'forge-craft__handle';
      handle.style.left = `${handlePct}%`;
      handle.setAttribute('tabindex', '0');
      handle.setAttribute('aria-label', `Handle ${hi + 1}`);
      handle.dataset.handleIndex = String(hi);

      attachHandleDrag(handle, hi);
      attachHandleKeyboard(handle, hi);

      trackEl.appendChild(handle);
    }

    trackWrap.appendChild(trackEl);
    sliderSectionEl.appendChild(trackWrap);
  }

  // ── Drag handling ────────────────────────────────────────────────────────

  function getTrackRect(): DOMRect | null {
    return trackEl?.getBoundingClientRect() ?? null;
  }

  function pctFromClientX(clientX: number): number {
    const rect = getTrackRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
  }

  function moveHandle(hi: number, rawFraction: number): void {
    const snapped = snapToStep(rawFraction, STEP_FRACTION);
    const clamped = clampHandle(hi, snapped, handlePositions, MIN_FRACTION);
    if (Math.abs(handlePositions[hi] - clamped) < 1e-9) return;
    handlePositions[hi] = clamped;
    refreshSlider();
    refreshPreview();
    refreshCraftBtn();
    refreshAdvanced();
  }

  function attachHandleDrag(handle: HTMLElement, hi: number): void {
    let dragging = false;

    const onMouseMove = (e: MouseEvent) => {
      if (!dragging) return;
      e.preventDefault();
      moveHandle(hi, pctFromClientX(e.clientX));
    };
    const onMouseUp = () => {
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
    };
    handle.addEventListener('mousedown', (e) => {
      e.preventDefault();
      dragging = true;
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('mouseup', onMouseUp);
    });

    // Touch
    const onTouchMove = (e: TouchEvent) => {
      if (!dragging) return;
      e.preventDefault();
      const touch = e.touches[0];
      if (touch) moveHandle(hi, pctFromClientX(touch.clientX));
    };
    const onTouchEnd = () => {
      dragging = false;
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
    handle.addEventListener('touchstart', (e) => {
      e.preventDefault();
      dragging = true;
      document.addEventListener('touchmove', onTouchMove, { passive: false });
      document.addEventListener('touchend', onTouchEnd);
    }, { passive: false });
  }

  function attachHandleKeyboard(handle: HTMLElement, hi: number): void {
    handle.addEventListener('keydown', (e) => {
      const step = e.shiftKey ? 0.05 : STEP_FRACTION;
      if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
        e.preventDefault();
        moveHandle(hi, handlePositions[hi] - step);
      } else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
        e.preventDefault();
        moveHandle(hi, handlePositions[hi] + step);
      }
    });
  }

  // ── Power slider ─────────────────────────────────────────────────────────

  function buildPowerSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'forge-craft__power-section';
    return section;
  }

  function refreshPower(): void {
    if (!powerSectionEl) return;
    powerSectionEl.innerHTML = '';

    const n = selectedTiers.length;
    if (n === 0) return;

    const inventory = getInventory();
    const shares = enforceMinSegmentSize(computeShares(), MIN_FRACTION);
    const maxBudget = computeMaxBudget(selectedTiers, shares, inventory, latestIsDevMode);
    const ingredients = allocateIngredients(selectedTiers, shares, inventory, powerFraction, latestIsDevMode);
    const totalCount = ingredients.reduce((s, e) => s + e.refinedCount, 0);

    const row = document.createElement('div');
    row.className = 'forge-craft__power-row';

    const label = document.createElement('label');
    label.className = 'forge-craft__section-label';
    label.textContent = `Power: ${Math.round(powerFraction * 100)}%  (${totalCount} crystals)`;
    label.htmlFor = 'forge-power-input';
    row.appendChild(label);

    const rangeEl = document.createElement('input');
    rangeEl.type = 'range';
    rangeEl.id = 'forge-power-input';
    rangeEl.className = 'forge-craft__power-range';
    rangeEl.min = '1';
    rangeEl.max = '100';
    rangeEl.value = String(Math.round(powerFraction * 100));
    rangeEl.addEventListener('input', () => {
      powerFraction = parseInt(rangeEl.value, 10) / 100;
      refreshPower();
      refreshPreview();
      refreshCraftBtn();
      refreshAdvanced();
    });
    row.appendChild(rangeEl);

    if (maxBudget > 0) {
      const maxEl = document.createElement('div');
      maxEl.className = 'forge-craft__power-max';
      maxEl.textContent = `Max budget: ${Math.floor(maxBudget).toLocaleString()} mote-weight`;
      row.appendChild(maxEl);
    }

    powerSectionEl.appendChild(row);
  }

  // ── Preview ───────────────────────────────────────────────────────────────

  function buildPreviewSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'forge-craft__preview-section';
    return section;
  }

  function refreshPreview(): void {
    if (!previewSectionEl) return;
    previewSectionEl.innerHTML = '';

    const n = selectedTiers.length;
    if (n === 0) return;

    const inventory = getInventory();
    const shares = enforceMinSegmentSize(computeShares(), MIN_FRACTION);
    const ingredients = allocateIngredients(selectedTiers, shares, inventory, powerFraction, latestIsDevMode);

    if (ingredients.length === 0) return;

    const actualComp = computeCraftedWeaponComposition(ingredients);
    const totalWt = computeTotalWeightedMoteValue(ingredients);
    const baseLevel = computeCraftedWeaponBaseLevel(totalWt);
    const baseMult = computeCraftedWeaponBaseStatMultiplier(totalWt);

    const heading = document.createElement('div');
    heading.className = 'forge-craft__section-label';
    heading.textContent = 'Actual composition after floor:';
    previewSectionEl.appendChild(heading);

    const compRow = document.createElement('div');
    compRow.className = 'forge-craft__comp-row';

    for (const entry of actualComp) {
      const tier = TIER_BY_ID.get(entry.tierId);
      const color = tier?.color ?? '#aaa';
      const pct = Math.round(entry.share * 100);
      const ingEntry = ingredients.find(e => e.tierId === entry.tierId);
      const count = ingEntry?.refinedCount ?? 0;

      const chip = document.createElement('div');
      chip.className = 'forge-craft__comp-chip';
      chip.style.setProperty('--chip-color', color);
      chip.innerHTML =
        `<span class="forge-craft__comp-name" style="color:${color}">${tier?.displayName ?? entry.tierId}</span>` +
        `<span class="forge-craft__comp-pct">${pct}%</span>` +
        `<span class="forge-craft__comp-count">${count}×</span>`;
      compRow.appendChild(chip);
    }
    previewSectionEl.appendChild(compRow);

    const statsRow = document.createElement('div');
    statsRow.className = 'forge-craft__stats-row';
    statsRow.textContent =
      `Lv.${baseLevel}  ×${baseMult.toFixed(2)} base  ${totalWt.toLocaleString()} mote-wt`;
    previewSectionEl.appendChild(statsRow);
  }

  // ── Craft button + validation ─────────────────────────────────────────────

  function getValidationMessage(): string | null {
    const n = selectedTiers.length;
    if (n === 0) return 'Select at least 2 mote types to craft.';
    if (n === 1) return 'Select at least 2 mote types to craft.';
    const inventory = getInventory();
    const shares = enforceMinSegmentSize(computeShares(), MIN_FRACTION);
    const ingredients = allocateIngredients(selectedTiers, shares, inventory, powerFraction, latestIsDevMode);
    if (ingredients.length === 0) return 'Not enough refined crystals. Forge some motes first.';
    const hasCrystals = ingredients.some(e => e.refinedCount > 0);
    if (!hasCrystals) return 'All ingredient counts rounded to zero. Use more crystals or a different ratio.';
    const capacity = getForgeCapacityCurrent();
    if (n > capacity) return `Over forge capacity (${capacity} types max). Deselect some mote types.`;
    return null;
  }

  function refreshCraftBtn(): void {
    if (!craftBtnEl || !validationEl) return;
    const msg = getValidationMessage();
    craftBtnEl.disabled = msg !== null;
    validationEl.textContent = msg ?? '';
    validationEl.className = 'forge-craft__validation' + (msg ? ' forge-craft__validation--error' : '');
  }

  function buildCraftButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'weapon-store__btn forge-craft__craft-btn';
    btn.textContent = 'Craft Weapon';
    btn.addEventListener('click', () => {
      const inventory = getInventory();
      const shares = enforceMinSegmentSize(computeShares(), MIN_FRACTION);
      const ingredients = allocateIngredients(selectedTiers, shares, inventory, powerFraction, latestIsDevMode);
      if (ingredients.length > 0) {
        dispatch({ kind: 'craft_weapon', ingredients });
      }
    });
    return btn;
  }

  // ── Advanced / exact-counts fallback (<details>) ─────────────────────────

  function buildAdvancedSection(): HTMLElement {
    const details = document.createElement('details');
    details.className = 'forge-craft__advanced';
    const summary = document.createElement('summary');
    summary.className = 'forge-craft__advanced-summary';
    summary.textContent = 'Exact counts / advanced';
    details.appendChild(summary);
    return details;
  }

  function refreshAdvanced(): void {
    if (!advancedEl) return;
    // Keep only the summary element, rebuild content
    const summary = advancedEl.querySelector('summary');
    advancedEl.innerHTML = '';
    if (summary) advancedEl.appendChild(summary);

    const inventory = getInventory();
    const ingredientMap = new Map<TierId, HTMLInputElement>();

    const inputGrid = document.createElement('div');
    inputGrid.className = 'forge-craft__advanced-grid';

    const allTiers = latestIsDevMode
      ? TIERS
      : TIERS.filter(t => (inventory.get(t.id) ?? 0) > 0);

    for (const tier of allTiers) {
      const available = latestIsDevMode ? 9999 : (inventory.get(tier.id) ?? 0);

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';

      const label = document.createElement('label');
      label.style.cssText = `color:${tier.color};font-size:0.78em;min-width:70px;`;
      label.textContent = `${tier.displayName} (${available === 9999 ? '∞' : available})`;

      const input = document.createElement('input');
      input.type = 'number';
      input.min = '0';
      input.max = latestIsDevMode ? '9999' : String(available);
      input.value = '0';
      input.style.cssText =
        'width:54px;background:rgba(0,0,0,0.5);border:1px solid rgba(200,200,200,0.3);' +
        'color:#fff;padding:2px 4px;border-radius:3px;font-size:0.78em;';
      ingredientMap.set(tier.id, input);

      row.appendChild(label);
      row.appendChild(input);
      inputGrid.appendChild(row);
    }
    advancedEl.appendChild(inputGrid);

    const craftExactBtn = document.createElement('button');
    craftExactBtn.className = 'weapon-store__btn';
    craftExactBtn.style.cssText = 'margin-top:8px;background:rgba(200,160,0,0.1);border-color:rgba(200,160,0,0.4);color:#c8a832;font-size:0.8em;';
    craftExactBtn.textContent = 'Craft with exact counts';
    craftExactBtn.addEventListener('click', () => {
      const ingredients: Array<{ tierId: string; refinedCount: number }> = [];
      for (const [tierId, input] of ingredientMap) {
        const n = Math.max(0, parseInt(input.value, 10) || 0);
        if (n > 0) ingredients.push({ tierId, refinedCount: n });
      }
      if (ingredients.length > 0) dispatch({ kind: 'craft_weapon', ingredients });
    });
    advancedEl.appendChild(craftExactBtn);
  }

  // ── Full build ────────────────────────────────────────────────────────────

  function build(rpgState: RpgSimState, isDevMode: boolean): void {
    latestRpgState = rpgState;
    latestIsDevMode = isDevMode;

    element.innerHTML = '';

    // Header
    const header = document.createElement('div');
    header.className = 'forge-craft__header';
    const forgeCraftLevel = getRpgUpgradeLevel(rpgState, 'forge_craft_level') + 1;
    const capacity = getForgeCapacity(forgeCraftLevel);

    const titleEl = document.createElement('div');
    titleEl.className = 'forge-craft__title';
    titleEl.textContent = 'Weapon Crafting';
    header.appendChild(titleEl);

    capacityLabelEl = document.createElement('div');
    capacityLabelEl.className = 'forge-craft__capacity';
    capacityLabelEl.textContent = `Forge capacity: ${capacity} mote types`;
    header.appendChild(capacityLabelEl);
    element.appendChild(header);

    // Refined crystal inventory
    inventoryEl = document.createElement('div');
    inventoryEl.className = 'forge-craft__inventory';

    refreshInventory();
    element.appendChild(inventoryEl);

    // Mote type looms
    moteHeadingEl = document.createElement('div');
    moteHeadingEl.className = 'forge-craft__section-label';
    moteHeadingEl.textContent = `Select mote types (${selectedTiers.length}/${capacity}):`;
    element.appendChild(moteHeadingEl);

    moteLoomFieldEl = buildMoteLoomField();
    element.appendChild(moteLoomFieldEl);
    refreshMoteLooms();

    // Slider
    sliderSectionEl = buildSliderSection();
    element.appendChild(sliderSectionEl);
    refreshSlider();

    // Power
    powerSectionEl = buildPowerSection();
    element.appendChild(powerSectionEl);
    refreshPower();

    // Preview
    previewSectionEl = buildPreviewSection();
    element.appendChild(previewSectionEl);
    refreshPreview();

    // Validation + craft button
    validationEl = document.createElement('div');
    validationEl.className = 'forge-craft__validation';
    element.appendChild(validationEl);

    craftBtnEl = buildCraftButton();
    element.appendChild(craftBtnEl);
    refreshCraftBtn();

    // Advanced fallback
    advancedEl = buildAdvancedSection();
    element.appendChild(advancedEl);
    refreshAdvanced();
  }

  // ── Public interface ──────────────────────────────────────────────────────

  function update(rpgState: RpgSimState, isDevMode: boolean): void {
    latestRpgState = rpgState;
    latestIsDevMode = isDevMode;
    if (element.childElementCount === 0) {
      build(rpgState, isDevMode);
      return;
    }

    const capacity = getForgeCapacityCurrent();
    while (selectedTiers.length > capacity) selectedTiers.pop();
    if (capacityLabelEl) {
      capacityLabelEl.textContent = `Forge capacity: ${capacity} mote types`;
    }
    refreshInventory();
    refreshMoteLooms();
    refreshSlider();
    refreshPower();
    refreshPreview();
    refreshCraftBtn();
    refreshAdvanced();
  }

  // Initial build happens on first update() call
  return { element, update };
}
