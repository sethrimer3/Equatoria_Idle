/**
 * rpg-weapon-crafting-page.ts â€” Forge crafting workspace supporting Weapon, Weave, and Lens modes.
 *
 * Modes:
 *   WEAPON â€” existing behavior, dispatches craft_weapon
 *   WEAVE  â€” new, dispatches craft_weave; one affix per distinct ingredient tier
 *   LENS   â€” crafting via the lens inventory panel
 *
 * Layout from top to bottom:
 *   1. Weave slots row (6 slots, always visible)
 *   2. Mode selector (WEAPON / WEAVE / LENS)
 *   3. Mode-specific crafting controls
 *   4. Weave inventory (WEAVE mode only)
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
  sharesFromHandles,
  handlesFromShares,
  computeBudgetRange,
  findNearestFeasibleHandle,
  minimumPowerPct,
  allocateIngredients,
  MIN_SEGMENT_PCT,
  SEGMENT_STEP_PCT,
} from '../../data/rpg/crafting-allocation';
import { WEAVE_AFFIX_FAMILIES } from '../../data/rpg/weave-definitions';
import { computeWeavePowerScale } from '../../data/rpg/weave-rolling';
import { LENS_EFFECT_NAMES, getLensMaxMoteTypes, getLensEffectUnlockChances } from '../../data/rpg/lens-definitions';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgUpgradeLevel } from '../../sim/rpg/rpg-state';
import { hasDiscoveredMote, type ResourceState } from '../../sim/resources/resource-state';
import { buildLensInventorySection } from './lens-inventory';
import { getUnlockedWeaveSlotCount } from '../../sim/forge/forge-state';
import type { ActionHandler } from '../../input';
import { createWeaveSlotsPanel } from './weave-slots';
import { createWeaveInventoryPanel } from './weave-inventory';
import { getRefinedGemPath, getGeneratorSpritePath } from '../../render/assets/asset-paths';
import { getCachedImage, loadImage } from '../../render/assets/asset-loader';
import { getTintedSpriteCanvas } from '../../render/assets/sprite-tint';
import { drawForgePreview } from '../../render/forge';
import type { ForgeCrunchState } from '../../sim/forge/forge-state';
import { createForgeCrunchState } from '../../sim/forge/forge-state';
import { hexToFogRgb, renderFogBarToCanvas, type FogRgb } from '../../render/composition-fog';
import { formatNumberAs, type NumberFormat } from '../../util';

// â”€â”€â”€ Types â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

type CraftingMode = 'weapon' | 'weave' | 'lens';

export interface RpgWeaponCraftingPage {
  element: HTMLElement;
  update(rpgState: RpgSimState, isDevMode: boolean, forgeState?: ForgeCrunchState, resources?: ResourceState, numberFormat?: NumberFormat): void;
  dispose(): void;
}

// â”€â”€â”€ Constants â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const MIN_FRACTION = MIN_SEGMENT_PCT;
const STEP_FRACTION = SEGMENT_STEP_PCT;
const FORGE_CANVAS_SIZE = 160;
const LOOM_GLYPH_SIZE = 56;
const LOOM_ROTATION_SPEED = 0.01; // rad per frame at 60 fps, matching spawner rotation

// â”€â”€â”€ Factory â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

export function createRpgWeaponCraftingPage(dispatch: ActionHandler): RpgWeaponCraftingPage {
  const element = document.createElement('div');
  element.className = 'forge-craft';

  // â”€â”€ State â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let craftingMode: CraftingMode = 'weapon';
  const selectedTiers: TierId[] = [];
  let handlePositions: number[] = [];
  let powerFraction = 1.0;
  let latestRpgState: RpgSimState | null = null;
  let latestIsDevMode = false;
  let latestForgeState: ForgeCrunchState = createForgeCrunchState();
  let latestResources: ResourceState | null = null;
  let latestNumberFormat: NumberFormat = 'letters';
  let showMoteAmounts = true;

  // â”€â”€ Animation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let forgeCoreCanvas: HTMLCanvasElement | null = null;
  let forgeCoreCtx: CanvasRenderingContext2D | null = null;
  const loomCanvases = new Map<TierId, HTMLCanvasElement>();
  const loomRotations = new Map<TierId, number>();
  let animRafId: number | null = null;
  let isDisposed = false;
  let lastAnimMs: number | null = null;

  // â”€â”€ Segment fog fills â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const FILL_W = 320;
  const FILL_H = 16;

  interface SegmentFillEntry {
    canvas: HTMLCanvasElement;
    segIndex: number;
  }
  let activeSegmentFills: SegmentFillEntry[] = [];

  // Fog bar state â€” updated by refreshSlider, consumed by animTick
  interface FogBarState {
    colors: FogRgb[];
    shares: number[]; // fractions summing to ~1
    seed: number;
  }
  let activeFogBar: FogBarState | null = null;
  let lastFogMs    = 0;
  const FOG_INTERVAL_MS = 33; // ~30 fps for fog; full-speed for looms/forge

  function animTick(nowMs: number): void {
    // Stop the loop if the component has been removed from the DOM
    if (isDisposed || !element.isConnected) { animRafId = null; return; }

    const deltaMs = lastAnimMs !== null ? nowMs - lastAnimMs : 16.67;
    lastAnimMs = nowMs;
    const frameDelta = deltaMs / (1000 / 60);

    if (forgeCoreCanvas && forgeCoreCtx) {
      forgeCoreCtx.clearRect(0, 0, FORGE_CANVAS_SIZE, FORGE_CANVAS_SIZE);
      drawForgePreview(forgeCoreCtx, FORGE_CANVAS_SIZE, FORGE_CANVAS_SIZE, latestForgeState, nowMs);
    }

    for (const [tierId, canvas] of loomCanvases) {
      const tier = TIER_BY_ID.get(tierId);
      if (!tier) continue;
      const loomSpritePath = getGeneratorSpritePath(tier.unlockOrder);
      const tinted = getTintedSpriteCanvas(loomSpritePath, tier.color);
      if (!tinted) {
        if (!getCachedImage(loomSpritePath)) loadImage(loomSpritePath).catch(() => {});
        continue;
      }

      const rot = (loomRotations.get(tierId) ?? 0) + LOOM_ROTATION_SPEED * frameDelta;
      loomRotations.set(tierId, rot);

      const ctx = canvas.getContext('2d');
      if (!ctx) continue;
      const s = canvas.width;
      ctx.clearRect(0, 0, s, s);
      ctx.save();
      ctx.translate(s / 2, s / 2);
      ctx.rotate(rot);
      ctx.drawImage(tinted, -s / 2, -s / 2, s, s);
      ctx.restore();
    }

    if (activeFogBar && activeSegmentFills.length > 0 && !document.hidden) {
      const fogElapsed = nowMs - lastFogMs;
      if (fogElapsed >= FOG_INTERVAL_MS) {
        lastFogMs = nowMs;
        // Render fog once to a shared offscreen, then blit to each segment canvas
        const fogCanvas = renderFogBarToCanvas(
          FILL_W, FILL_H,
          activeFogBar.colors,
          activeFogBar.shares,
          nowMs,
          activeFogBar.seed,
        );
        for (const entry of activeSegmentFills) {
          if (entry.canvas.offsetWidth > 4) {
            const segCtx = entry.canvas.getContext('2d');
            if (segCtx) {
              segCtx.clearRect(0, 0, FILL_W, FILL_H);
              segCtx.drawImage(fogCanvas, 0, 0);
            }
          }
        }
      }
    }

    animRafId = requestAnimationFrame(animTick);
  }

  function startAnimLoop(): void {
    if (isDisposed || animRafId !== null) return;
    animRafId = requestAnimationFrame(animTick);
  }

  // â”€â”€ Sub-components â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  const weaveSlotsPanel = createWeaveSlotsPanel(dispatch);
  const weaveInventoryPanel = createWeaveInventoryPanel(weaveSlotsPanel, dispatch);

  // â”€â”€ Section elements â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
  let inventoryEl: HTMLElement | null = null;
  let moteLoomFieldEl: HTMLElement | null = null;
  let moteHeadingEl: HTMLElement | null = null;
  let capacityLabelEl: HTMLElement | null = null;
  let sliderSectionEl: HTMLElement | null = null;
  let powerSectionEl: HTMLElement | null = null;
  let previewSectionEl: HTMLElement | null = null;
  let craftBtnEl: HTMLButtonElement | null = null;
  let validationEl: HTMLElement | null = null;
  let advancedEl: HTMLElement | null = null;

  function computeShares(): number[] {
    return sharesFromHandles(handlePositions);
  }

  function getInventory(): Map<TierId, number> {
    return latestResources?.moteTotals ?? latestRpgState?.refinedCrystalsByTierId ?? new Map();
  }

  function isTierAvailableForCrafting(tierId: TierId): boolean {
    if (latestIsDevMode) return true;
    if (latestResources && !hasDiscoveredMote(latestResources, tierId)) return false;
    return (getInventory().get(tierId) ?? 0) > 0;
  }

  function getForgeCapacityCurrent(): number {
    if (!latestRpgState) return 2;
    const level = getRpgUpgradeLevel(latestRpgState, 'forge_craft_level') + 1;
    return getForgeCapacity(level);
  }

  function formatCraftingMoteCount(count: number): string {
    if (!Number.isFinite(count)) return '0.0';
    if (count < 0) return `-${formatCraftingMoteCount(-count)}`;
    if (count < 1_000) return count.toFixed(1);
    return formatNumberAs(count, latestNumberFormat);
  }

  // â”€â”€ Mode selector â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function buildModeSelector(): HTMLElement {
    const bar = document.createElement('div');
    bar.className = 'forge-craft__mode-bar';

    const modes: Array<{ id: CraftingMode; label: string }> = [
      { id: 'weapon', label: 'Weapon' },
      { id: 'weave',  label: 'Weave' },
      { id: 'lens',   label: 'Lens' },
    ];

    for (const { id, label } of modes) {
      const btn = document.createElement('button');
      btn.className = 'forge-craft__mode-btn';
      btn.textContent = label;
      btn.classList.toggle('forge-craft__mode-btn--active', id === craftingMode);
      btn.addEventListener('click', () => {
        if (id === craftingMode) return;
        craftingMode = id;
        if (latestRpgState) build(latestRpgState, latestIsDevMode);
      });
      bar.appendChild(btn);
    }
    return bar;
  }

  // â”€â”€ Inventory display â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function refreshInventory(): void {
    if (!inventoryEl || !latestRpgState) return;
    const invMap = getInventory();
    const hasAnyMotes = TIERS.some(tier => isTierAvailableForCrafting(tier.id));
    inventoryEl.innerHTML = '';

    if (!hasAnyMotes && !latestIsDevMode) {
      inventoryEl.textContent = 'No motes available for forging yet.';
      return;
    }

    // Label
    const label = document.createElement('div');
    label.className = 'forge-craft__inventory-label';
    const labelText = document.createElement('span');
    labelText.textContent = 'Motes:';
    const amountToggle = document.createElement('button');
    amountToggle.type = 'button';
    amountToggle.className = 'forge-craft__inventory-toggle';
    amountToggle.classList.toggle('forge-craft__inventory-toggle--hidden', !showMoteAmounts);
    amountToggle.textContent = '>';
    amountToggle.title = showMoteAmounts ? 'Hide mote amounts' : 'Show mote amounts';
    amountToggle.setAttribute('aria-label', amountToggle.title);
    amountToggle.setAttribute('aria-pressed', String(showMoteAmounts));
    amountToggle.addEventListener('click', () => {
      showMoteAmounts = !showMoteAmounts;
      refreshInventory();
    });
    label.appendChild(labelText);
    label.appendChild(amountToggle);
    inventoryEl.appendChild(label);

    const list = document.createElement('div');
    list.className = 'forge-craft__inventory-list';
    list.classList.toggle('forge-craft__inventory-list--amounts-hidden', !showMoteAmounts);
    inventoryEl.appendChild(list);

    // One chip per tier
    for (const tier of TIERS) {
      const count = invMap.get(tier.id) ?? 0;
      if (!isTierAvailableForCrafting(tier.id)) continue;

      const chip = document.createElement('span');
      chip.className = 'forge-craft__inventory-chip';

      const img = document.createElement('img');
      img.src = getRefinedGemPath(tier.id);
      img.alt = tier.displayName;
      img.className = 'forge-craft__inventory-icon';

      chip.appendChild(img);
      if (showMoteAmounts) {
        const countEl = document.createElement('span');
        countEl.className = 'forge-craft__inventory-count';
        countEl.style.color = tier.color;
        countEl.textContent = latestIsDevMode && count === 0 ? 'inf' : formatCraftingMoteCount(count);
        countEl.title = `${count.toLocaleString(undefined, { maximumFractionDigits: 1 })} ${tier.displayName} motes`;
        chip.appendChild(countEl);
      }
      list.appendChild(chip);
    }
  }

  // â”€â”€ Mote loom field â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function getEffectiveCapacity(): number {
    if (craftingMode === 'lens' && latestRpgState) {
      const forgeCraftLevel = getRpgUpgradeLevel(latestRpgState, 'forge_craft_level') + 1;
      return getLensMaxMoteTypes(forgeCraftLevel);
    }
    return getForgeCapacityCurrent();
  }

  function toggleTier(tierId: TierId): void {
    const capacity = getEffectiveCapacity();
    const idx = selectedTiers.indexOf(tierId);
    if (idx >= 0) {
      selectedTiers.splice(idx, 1);
    } else {
      if (selectedTiers.length >= capacity) return;
      selectedTiers.push(tierId);
    }
    const n = selectedTiers.length;
    if (n <= 1) {
      handlePositions = [];
    } else {
      handlePositions = handlesFromShares(new Array(n).fill(Math.floor(100 / n)));
    }
    refreshSlider();
    refreshPower();
    refreshPreview();
    refreshCraftBtn();
    refreshAdvanced();
    refreshMoteLooms();
  }

  function buildMoteLoomField(): HTMLElement {
    const field = document.createElement('div');
    field.className = 'forge-craft__loom-field';

    forgeCoreCanvas = document.createElement('canvas');
    forgeCoreCanvas.className = 'forge-craft__forge-core';
    forgeCoreCanvas.width = FORGE_CANVAS_SIZE;
    forgeCoreCanvas.height = FORGE_CANVAS_SIZE;
    forgeCoreCanvas.setAttribute('aria-hidden', 'true');
    forgeCoreCtx = forgeCoreCanvas.getContext('2d');
    field.appendChild(forgeCoreCanvas);

    return field;
  }

  function refreshMoteLooms(): void {
    if (!moteLoomFieldEl) return;
    const loomField = moteLoomFieldEl;

    const capacity = getEffectiveCapacity();
    const inventory = getInventory();
    if (moteHeadingEl) {
      if (craftingMode === 'lens' && latestRpgState) {
        const forgeCraftLevel = getRpgUpgradeLevel(latestRpgState, 'forge_craft_level') + 1;
        const lensMax = getLensMaxMoteTypes(forgeCraftLevel);
        moteHeadingEl.textContent = `Select mote types (${selectedTiers.length}/${lensMax} for lens):`;
      } else {
        moteHeadingEl.textContent = `Select mote types (${selectedTiers.length}/${capacity}):`;
      }
    }
    const availableTiers = TIERS.filter(tier => isTierAvailableForCrafting(tier.id));
    const total = Math.max(availableTiers.length, 1);

    // Remove buttons for tiers no longer in the available set
    const availableIds = new Set(availableTiers.map(t => t.id));
    const existingBtns = loomField.querySelectorAll<HTMLButtonElement>('.forge-craft__mote-loom');
    for (const btn of existingBtns) {
      const tid = btn.dataset.tierId as TierId | undefined;
      if (tid && !availableIds.has(tid)) {
        btn.remove();
        loomCanvases.delete(tid);
      }
    }

    availableTiers.forEach((tier, index) => {
      const available = inventory.get(tier.id) ?? 0n;
      const isSelected = selectedTiers.includes(tier.id);
      const atCapacity = selectedTiers.length >= capacity && !isSelected;
      const angleRad = -Math.PI / 2 + (Math.PI * 2 * index) / total;
      const xPct = 50 + Math.cos(angleRad) * 39;
      const yPct = 50 + Math.sin(angleRad) * 39;

      // Reuse existing button element to preserve hover/focus state
      let loom = loomField.querySelector<HTMLButtonElement>(`[data-tier-id="${tier.id}"]`);
      if (!loom) {
        loom = document.createElement('button');
        loom.type = 'button';
        loom.className = 'forge-craft__mote-loom';
        loom.dataset.tierId = tier.id;
        loom.style.setProperty('--loom-color', tier.color);

        const glyph = document.createElement('canvas');
        glyph.className = 'forge-craft__mote-loom-glyph';
        glyph.width = LOOM_GLYPH_SIZE;
        glyph.height = LOOM_GLYPH_SIZE;
        glyph.setAttribute('aria-hidden', 'true');
        loom.appendChild(glyph);
        loomCanvases.set(tier.id, glyph);

        loom.addEventListener('click', () => toggleTier(tier.id));
        loomField.appendChild(loom);
      }

      // Update mutable state in-place (never destroy the element)
      loom.classList.toggle('forge-craft__mote-loom--selected', isSelected);
      loom.classList.toggle('forge-craft__mote-loom--disabled', atCapacity && !isSelected);
      loom.style.left = `${xPct}%`;
      loom.style.top = `${yPct}%`;
      loom.disabled = atCapacity && !isSelected;
      loom.setAttribute('aria-pressed', String(isSelected));
      loom.setAttribute(
        'aria-label',
        `${isSelected ? 'Remove' : 'Add'} ${tier.displayName} mote type (${latestIsDevMode ? 'unlimited' : available} crystals)`,
      );
    });
  }

  // â”€â”€ Multi-segment percentage slider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let trackEl: HTMLElement | null = null;
  let sliderStructureKey = '';

  function buildSliderSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'forge-craft__slider-section';
    return section;
  }

  function updateFogBar(shares: number[]): void {
    if (selectedTiers.length < 1) {
      activeFogBar = null;
      return;
    }

    let fogSeed = 0;
    for (const tid of selectedTiers) {
      for (let ci = 0; ci < tid.length; ci++) {
        fogSeed = (Math.imul(31, fogSeed) + tid.charCodeAt(ci)) | 0;
      }
    }
    activeFogBar = {
      colors: selectedTiers.map(tid => hexToFogRgb(TIER_BY_ID.get(tid)?.color ?? '#aaa')),
      shares: shares.map(s => s / 100),
      seed: Math.abs(fogSeed),
    };
  }

  function updateSliderMutableState(shares: number[]): void {
    if (!trackEl) return;

    const segments = Array.from(trackEl.querySelectorAll<HTMLElement>('.forge-craft__segment'));
    const handles = Array.from(trackEl.querySelectorAll<HTMLElement>('.forge-craft__handle'));
    const targetChips = Array.from(sliderSectionEl?.querySelectorAll<HTMLElement>('.forge-craft__target-chips .forge-craft__comp-chip') ?? []);

    let cumPct = 0;
    for (let i = 0; i < selectedTiers.length; i++) {
      const pct = shares[i] ?? 0;
      const tier = TIER_BY_ID.get(selectedTiers[i]);
      const segment = segments[i];
      if (segment) {
        segment.style.left = `${cumPct}%`;
        segment.style.width = `${pct}%`;
        segment.setAttribute('aria-label', `${tier?.displayName ?? selectedTiers[i]} target ${pct}%`);
        const fillCanvas = segment.querySelector<HTMLElement>('.forge-craft__segment-fill');
        if (fillCanvas && pct > 0) {
          fillCanvas.style.left = `${-(cumPct / pct) * 100}%`;
          fillCanvas.style.width = `${(100 / pct) * 100}%`;
        }
        const segLabel = segment.querySelector<HTMLElement>('.forge-craft__segment-label');
        if (segLabel) {
          segLabel.textContent = `${tier?.displayName ?? selectedTiers[i]} ${Math.round(pct)}%`;
          segLabel.hidden = pct < 14;
        }
      }

      const targetChip = targetChips[i];
      if (targetChip) {
        const pctEl = targetChip.querySelector<HTMLElement>('.forge-craft__comp-pct');
        if (pctEl) pctEl.textContent = `${pct}%`;
      }
      cumPct += pct;
    }

    for (let hi = 0; hi < handlePositions.length; hi++) {
      const handle = handles[hi];
      if (handle) handle.style.left = `${handlePositions[hi]}%`;
    }

    updateFogBar(shares);
  }

  function refreshSlider(): void {
    if (!sliderSectionEl) return;

    const n = selectedTiers.length;
    const structureKey = n >= 2
      ? `${craftingMode}:${selectedTiers.join('|')}`
      : `${craftingMode}:hint:${n}`;
    if (structureKey === sliderStructureKey) {
      if (n >= 2) updateSliderMutableState(computeShares());
      return;
    }

    sliderStructureKey = structureKey;
    sliderSectionEl.innerHTML = '';
    activeSegmentFills = [];
    activeFogBar = null;
    trackEl = null;

    if (n < 2) {
      if (n === 1 && (craftingMode === 'weapon' || craftingMode === 'lens')) {
        const hint = document.createElement('div');
        hint.className = 'forge-craft__hint';
        hint.textContent = 'Select at least 2 mote types to enable the percentage slider.';
        sliderSectionEl.appendChild(hint);
      }
      return;
    }

    const shares = computeShares();

    const heading = document.createElement('div');
    heading.className = 'forge-craft__section-label';
    heading.textContent = 'Target composition:';
    sliderSectionEl.appendChild(heading);

    const trackWrap = document.createElement('div');
    trackWrap.className = 'forge-craft__track-wrap';

    trackEl = document.createElement('div');
    trackEl.className = 'forge-craft__track';

    let cumPct = 0;
    for (let i = 0; i < n; i++) {
      const pct = shares[i];
      const tier = TIER_BY_ID.get(selectedTiers[i]);
      const color = tier?.color ?? '#aaa';

      const seg = document.createElement('div');
      seg.className = 'forge-craft__segment';
      seg.style.left = `${cumPct}%`;
      seg.style.width = `${pct}%`;
      seg.style.setProperty('--seg-color', color);

      const fillCanvas = document.createElement('canvas');
      fillCanvas.className = 'forge-craft__segment-fill';
      fillCanvas.width = FILL_W;
      fillCanvas.height = FILL_H;
      fillCanvas.style.left = `${-(cumPct / pct) * 100}%`;
      fillCanvas.style.width = `${(100 / pct) * 100}%`;
      fillCanvas.setAttribute('aria-hidden', 'true');
      seg.appendChild(fillCanvas);
      activeSegmentFills.push({ canvas: fillCanvas, segIndex: i });

      const segLabel = document.createElement('div');
      segLabel.className = 'forge-craft__segment-label';
      segLabel.textContent = `${tier?.displayName ?? selectedTiers[i]} ${Math.round(pct)}%`;
      if (pct < 14) segLabel.hidden = true;
      seg.setAttribute('aria-label', `${tier?.displayName ?? selectedTiers[i]} target ${pct}%`);
      seg.appendChild(segLabel);

      trackEl.appendChild(seg);
      cumPct += pct;
    }

    for (let hi = 0; hi < n - 1; hi++) {
      const handlePct = handlePositions[hi];
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

    const targetChips = document.createElement('div');
    targetChips.className = 'forge-craft__comp-row forge-craft__target-chips';
    for (let i = 0; i < n; i++) {
      const tier = TIER_BY_ID.get(selectedTiers[i]);
      const color = tier?.color ?? '#aaa';
      const chip = document.createElement('div');
      chip.className = 'forge-craft__comp-chip';
      chip.style.setProperty('--chip-color', color);
      chip.innerHTML =
        `<span class="forge-craft__comp-name" style="color:${color}">${tier?.displayName ?? selectedTiers[i]}</span>` +
        `<span class="forge-craft__comp-pct">${shares[i]}%</span>`;
      targetChips.appendChild(chip);
    }
    sliderSectionEl.appendChild(targetChips);

    updateFogBar(shares);
  }

  // â”€â”€ Drag handling â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function getTrackRect(): DOMRect | null {
    return trackEl?.getBoundingClientRect() ?? null;
  }

  function pctFromClientX(clientX: number): number {
    const rect = getTrackRect();
    if (!rect || rect.width === 0) return 0;
    return Math.max(0, Math.min(100, ((clientX - rect.left) / rect.width) * 100));
  }

  function moveHandle(hi: number, rawFraction: number): void {
    const clamped = findNearestFeasibleHandle(hi, rawFraction, handlePositions, selectedTiers, getInventory(), latestIsDevMode);
    if (Math.abs(handlePositions[hi] - clamped) < 1e-9) return;
    handlePositions[hi] = clamped;
    refreshSlider();
    refreshPreview();
    refreshCraftBtn();
    refreshAdvanced();
  }

  const documentDragCleanups: Array<() => void> = [];

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

    documentDragCleanups.push(() => {
      dragging = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    });
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

  // â”€â”€ Power slider â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  let powerRowEl: HTMLElement | null = null;
  let powerLabelEl: HTMLLabelElement | null = null;
  let powerRangeEl: HTMLInputElement | null = null;
  let powerMaxEl: HTMLElement | null = null;

  function buildPowerSection(): HTMLElement {
    const section = document.createElement('div');
    section.className = 'forge-craft__power-section';
    return section;
  }

  function refreshPower(): void {
    if (!powerSectionEl) return;

    const n = selectedTiers.length;
    if (n === 0) {
      powerSectionEl.innerHTML = '';
      powerRowEl = null;
      powerLabelEl = null;
      powerRangeEl = null;
      powerMaxEl = null;
      return;
    }

    const inventory = getInventory();
    const shares = enforceMinSegmentSize(computeShares(), MIN_FRACTION);
    const range = computeBudgetRange(selectedTiers, shares, inventory, latestIsDevMode);
    const minPower = minimumPowerPct(range);
    powerFraction = Math.max(powerFraction, minPower / 100);
    const ingredients = allocateIngredients(selectedTiers, shares, inventory, powerFraction * 100, latestIsDevMode);
    const totalCount = ingredients.reduce((s, e) => s + BigInt(e.refinedCount), 0n);

    if (!powerRowEl || !powerRowEl.isConnected) {
      powerSectionEl.innerHTML = '';

      powerRowEl = document.createElement('div');
      powerRowEl.className = 'forge-craft__power-row';

      powerLabelEl = document.createElement('label');
      powerLabelEl.className = 'forge-craft__section-label';
      powerLabelEl.htmlFor = 'forge-power-input';
      powerRowEl.appendChild(powerLabelEl);

      powerRangeEl = document.createElement('input');
      powerRangeEl.type = 'range';
      powerRangeEl.id = 'forge-power-input';
      powerRangeEl.className = 'forge-craft__power-range';
      powerRangeEl.max = '100';
      powerRangeEl.addEventListener('input', () => {
        if (!powerRangeEl) return;
        powerFraction = parseInt(powerRangeEl.value, 10) / 100;
        refreshPower();
        refreshPreview();
        refreshCraftBtn();
        refreshAdvanced();
      });
      powerRowEl.appendChild(powerRangeEl);

      powerMaxEl = document.createElement('div');
      powerMaxEl.className = 'forge-craft__power-max';
      powerRowEl.appendChild(powerMaxEl);

      powerSectionEl.appendChild(powerRowEl);
    }

    if (powerLabelEl) {
      powerLabelEl.textContent = `Power: ${Math.round(powerFraction * 100)}%  (${totalCount} crystals)`;
    }
    if (powerRangeEl) {
      powerRangeEl.min = String(minPower);
      powerRangeEl.value = String(Math.round(powerFraction * 100));
    }
    if (powerMaxEl) {
      powerMaxEl.hidden = range.maximumBudget <= 0n;
      powerMaxEl.textContent = `Max budget: ${range.maximumBudget.toLocaleString()} mote-weight · Minimum ${minPower}% for this composition.`;
    }
  }
  // â”€â”€ Preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
    const ingredients = allocateIngredients(selectedTiers, shares, inventory, powerFraction * 100, latestIsDevMode);
    if (ingredients.length === 0) return;

    const totalWt = computeTotalWeightedMoteValue(ingredients);

    if (craftingMode === 'weapon') {
      const actualComp = computeCraftedWeaponComposition(ingredients);
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
          `<span class="forge-craft__comp-count">${count}Ã—</span>`;
        compRow.appendChild(chip);
      }
      previewSectionEl.appendChild(compRow);

      const statsRow = document.createElement('div');
      statsRow.className = 'forge-craft__stats-row';
      statsRow.textContent = `Lv.${baseLevel}  Ã—${baseMult.toFixed(2)} base  ${totalWt.toLocaleString()} mote-wt`;
      previewSectionEl.appendChild(statsRow);
    } else if (craftingMode === 'weave') {
      // Weave preview: one affix family per distinct ingredient tier
      const heading = document.createElement('div');
      heading.className = 'forge-craft__section-label';
      heading.textContent = 'Expected thread affixes:';
      previewSectionEl.appendChild(heading);

      const powerScale = computeWeavePowerScale(totalWt);

      for (const ing of ingredients) {
        const family = WEAVE_AFFIX_FAMILIES[ing.tierId];
        if (!family) continue;

        const tier = TIER_BY_ID.get(ing.tierId);
        const color = tier?.color ?? '#aaa';

        const row = document.createElement('div');
        row.className = 'forge-craft__weave-preview-row';

        const chip = document.createElement('span');
        chip.className = 'forge-craft__weave-tier-chip';
        chip.style.background = color;
        chip.textContent = tier?.displayName ?? ing.tierId;
        row.appendChild(chip);

        const desc = document.createElement('span');
        desc.className = 'forge-craft__weave-preview-desc';
        const maxVal = family.reduce((mx, s) => Math.max(mx, s.baseMaxValue), 0) * powerScale;
        desc.textContent = `1 of ${family.length} possible affixes, up to ${maxVal.toFixed(0)}${family[0]?.unit ?? '%'} at Mythic`;
        row.appendChild(desc);

        previewSectionEl.appendChild(row);
      }

      const statsRow = document.createElement('div');
      statsRow.className = 'forge-craft__stats-row';
      statsRow.textContent = `${totalWt.toLocaleString()} mote-wt Â· power scale Ã—${powerScale.toFixed(2)}`;
      previewSectionEl.appendChild(statsRow);
    } else if (craftingMode === 'lens') {
      const heading = document.createElement('div');
      heading.className = 'forge-craft__section-label';
      heading.textContent = 'Expected lens effects:';
      previewSectionEl.appendChild(heading);

      const forgeCraftLevel = getRpgUpgradeLevel(latestRpgState!, 'forge_craft_level') + 1;
      const { tier2Chance, tier3Chance } = getLensEffectUnlockChances(forgeCraftLevel);

      for (const ing of ingredients) {
        const names = LENS_EFFECT_NAMES[ing.tierId as import('../../data/tiers').TierId];
        if (!names) continue;

        const tier = TIER_BY_ID.get(ing.tierId as import('../../data/tiers').TierId);
        const color = tier?.color ?? '#aaa';

        const row = document.createElement('div');
        row.className = 'forge-craft__weave-preview-row';

        const chip = document.createElement('span');
        chip.className = 'forge-craft__weave-tier-chip';
        chip.style.background = color;
        chip.textContent = tier?.displayName ?? ing.tierId;
        row.appendChild(chip);

        const desc = document.createElement('span');
        desc.className = 'forge-craft__weave-preview-desc';
        const t2pct = Math.round(tier2Chance * 100);
        const t3pct = Math.round(tier3Chance * 100);
        desc.textContent =
          `T1: ${names[1]} (always) Â· T2: ${names[2]} (${t2pct}%) Â· T3: ${names[3]} (${t3pct}%)`;
        row.appendChild(desc);

        previewSectionEl.appendChild(row);
      }

      const statsRow = document.createElement('div');
      statsRow.className = 'forge-craft__stats-row';
      statsRow.textContent = `${totalWt.toLocaleString()} mote-wt`;
      previewSectionEl.appendChild(statsRow);
    }
  }

  // â”€â”€ Validation â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function getValidationMessage(): string | null {
    const n = selectedTiers.length;
    if (craftingMode === 'weapon') {
      if (n < 1) return 'Select at least 1 mote type to craft.';
    } else if (craftingMode === 'weave') {
      if (n === 0) return 'Select at least 1 mote type to weave.';
    } else {
      // lens mode
      if (n === 0) return 'Select at least 1 mote type to craft a lens.';
      const forgeCraftLevel = getRpgUpgradeLevel(latestRpgState!, 'forge_craft_level') + 1;
      const maxMoteTypes = getLensMaxMoteTypes(forgeCraftLevel);
      if (n > maxMoteTypes) {
        const plural = maxMoteTypes === 1 ? 'mote type' : 'mote types';
        return `Lenses can use up to ${maxMoteTypes} ${plural} at this forge level. Upgrade the forge to combine more lens effects.`;
      }
    }
    const inventory = getInventory();
    const shares = enforceMinSegmentSize(
      n > 1 ? computeShares() : [1],
      MIN_FRACTION,
    );
    const tiersForAlloc = n === 1 ? [selectedTiers[0]!] : selectedTiers;
    const sharesForAlloc = n === 1 ? [1] : shares;
    const range = computeBudgetRange(tiersForAlloc, sharesForAlloc, inventory, latestIsDevMode);
    if (!range.feasible) {
      const tierName = TIER_BY_ID.get(range.limitingTierId!)?.displayName ?? range.limitingTierId;
      return `Not enough ${tierName} to combine at the minimum 1%.`;
    }
    const ingredients = allocateIngredients(tiersForAlloc, sharesForAlloc, inventory, powerFraction * 100, latestIsDevMode);
    if (ingredients.length === 0) return 'Not enough refined crystals. Forge some motes first.';
    const hasCrystals = ingredients.some(e => BigInt(e.refinedCount) > 0n);
    if (!hasCrystals) return 'All ingredient counts rounded to zero. Use more crystals or a different ratio.';
    const capacity = getForgeCapacityCurrent();
    if (n > capacity) return `Over forge capacity (${capacity} types max). Deselect some mote types.`;
    return null;
  }

  function refreshCraftBtn(): void {
    if (!craftBtnEl || !validationEl) return;
    const msg = getValidationMessage();
    craftBtnEl.disabled = msg !== null;
    if (craftingMode === 'weave') {
      craftBtnEl.textContent = 'Craft Weave';
    } else if (craftingMode === 'weapon') {
      craftBtnEl.textContent = 'Craft Weapon';
    } else {
      craftBtnEl.textContent = 'Craft Lens';
    }
    validationEl.textContent = msg ?? '';
    validationEl.className = 'forge-craft__validation' + (msg ? ' forge-craft__validation--error' : '');
  }

  function buildCraftButton(): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.className = 'weapon-store__btn forge-craft__craft-btn';
    btn.addEventListener('click', () => {
      const inventory = getInventory();
      const n = selectedTiers.length;
      const shares = enforceMinSegmentSize(
        n > 1 ? computeShares() : [1],
        MIN_FRACTION,
      );
      const tiersForAlloc = n === 1 ? [selectedTiers[0]!] : selectedTiers;
      const sharesForAlloc = n === 1 ? [1] : shares;
      const ingredients = allocateIngredients(tiersForAlloc, sharesForAlloc, inventory, powerFraction * 100, latestIsDevMode);
      if (ingredients.length === 0) return;

      if (craftingMode === 'weapon') {
        dispatch({ kind: 'craft_weapon', ingredients });
      } else if (craftingMode === 'weave') {
        dispatch({ kind: 'craft_weave', ingredients });
      } else if (craftingMode === 'lens') {
        dispatch({ kind: 'craft_lens', ingredients });
      }
    });
    return btn;
  }

  // â”€â”€ Advanced / exact-counts fallback â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

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
      const available = inventory.get(tier.id) ?? 0n;

      const row = document.createElement('div');
      row.style.cssText = 'display:flex;align-items:center;gap:6px;';

      const label = document.createElement('label');
      label.style.cssText = `color:${tier.color};font-size:0.78em;min-width:70px;`;
      label.textContent = `${tier.displayName} (${latestIsDevMode ? 'âˆž' : available})`;

      const input = document.createElement('input');
      input.type = 'text';
      input.inputMode = 'numeric';
      input.min = '0';
      if (!latestIsDevMode) input.max = String(available);
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

    const actionKind = craftingMode === 'weave' ? 'craft_weave' : craftingMode === 'lens' ? 'craft_lens' : 'craft_weapon';
    const craftExactLabel = craftingMode === 'weave' ? 'weave' : craftingMode === 'lens' ? 'lens' : 'weapon';
    const craftExactBtn = document.createElement('button');
    craftExactBtn.className = 'weapon-store__btn';
    craftExactBtn.style.cssText = 'margin-top:8px;background:rgba(200,160,0,0.1);border-color:rgba(200,160,0,0.4);color:#c8a832;font-size:0.8em;';
    craftExactBtn.textContent = `Craft ${craftExactLabel} with exact counts`;
    craftExactBtn.addEventListener('click', () => {
      const ingredients: Array<{ tierId: string; refinedCount: bigint }> = [];
      for (const [tierId, input] of ingredientMap) {
        const n = /^\d+$/.test(input.value) ? BigInt(input.value) : 0n;
        if (n > 0n) ingredients.push({ tierId, refinedCount: n });
      }
      if (ingredients.length > 0) dispatch({ kind: actionKind, ingredients });
    });
    advancedEl.appendChild(craftExactBtn);
  }

  // â”€â”€ Build â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function build(rpgState: RpgSimState, isDevMode: boolean): void {
    latestRpgState = rpgState;
    latestIsDevMode = isDevMode;

    element.innerHTML = '';

    const forgeLevel = latestForgeState.forgeLevel;

    // 1. Weave slots (always at top)
    element.appendChild(weaveSlotsPanel.element);
    const unlockedSlots = getUnlockedWeaveSlotCount(forgeLevel);
    weaveSlotsPanel.update(
      rpgState.equippedWeaveSlots,
      rpgState.craftedWeaves,
      unlockedSlots,
    );

    // 2. Mode selector
    element.appendChild(buildModeSelector());


    // 4. Header
    const header = document.createElement('div');
    header.className = 'forge-craft__header';
    const forgeCraftLevel = getRpgUpgradeLevel(rpgState, 'forge_craft_level') + 1;
    const capacity = getForgeCapacity(forgeCraftLevel);

    const titleEl = document.createElement('div');
    titleEl.className = 'forge-craft__title';
    titleEl.textContent = craftingMode === 'weave' ? 'Weave Crafting' : craftingMode === 'lens' ? 'Lens Crafting' : 'Weapon Crafting';
    header.appendChild(titleEl);

    capacityLabelEl = document.createElement('div');
    capacityLabelEl.className = 'forge-craft__capacity';
    if (craftingMode === 'lens') {
      const forgeCraftLevel = getRpgUpgradeLevel(rpgState, 'forge_craft_level') + 1;
      const lensMax = getLensMaxMoteTypes(forgeCraftLevel);
      capacityLabelEl.textContent = `Lens limit: ${lensMax} mote type${lensMax === 1 ? '' : 's'}`;
    } else {
      capacityLabelEl.textContent = `Forge capacity: ${capacity} mote types`;
    }
    header.appendChild(capacityLabelEl);
    element.appendChild(header);

    // 5. Mote inventory and type looms
    const selectorLayout = document.createElement('div');
    selectorLayout.className = 'forge-craft__selector-layout';

    inventoryEl = document.createElement('div');
    inventoryEl.className = 'forge-craft__inventory';
    refreshInventory();
    selectorLayout.appendChild(inventoryEl);

    const selectorStage = document.createElement('div');
    selectorStage.className = 'forge-craft__selector-stage';

    moteHeadingEl = document.createElement('div');
    moteHeadingEl.className = 'forge-craft__section-label';
    if (craftingMode === 'lens') {
      const forgeCraftLevel = getRpgUpgradeLevel(rpgState, 'forge_craft_level') + 1;
      const lensMax = getLensMaxMoteTypes(forgeCraftLevel);
      moteHeadingEl.textContent = `Select mote types (${selectedTiers.length}/${lensMax} for lens):`;
    } else {
      moteHeadingEl.textContent = `Select mote types (${selectedTiers.length}/${capacity}):`;
    }
    selectorStage.appendChild(moteHeadingEl);

    moteLoomFieldEl = buildMoteLoomField();
    selectorStage.appendChild(moteLoomFieldEl);
    selectorLayout.appendChild(selectorStage);
    element.appendChild(selectorLayout);
    refreshMoteLooms();

    // 7. Slider
    sliderSectionEl = buildSliderSection();
    element.appendChild(sliderSectionEl);
    refreshSlider();

    // 8. Power
    powerSectionEl = buildPowerSection();
    element.appendChild(powerSectionEl);
    refreshPower();

    // 9. Preview
    previewSectionEl = buildPreviewSection();
    element.appendChild(previewSectionEl);
    refreshPreview();

    // 10. Validation + craft button
    validationEl = document.createElement('div');
    validationEl.className = 'forge-craft__validation';
    element.appendChild(validationEl);

    craftBtnEl = buildCraftButton();
    element.appendChild(craftBtnEl);
    refreshCraftBtn();

    // 11. Advanced fallback
    advancedEl = buildAdvancedSection();
    element.appendChild(advancedEl);
    refreshAdvanced();

    // 12. Weave inventory (below crafting controls, WEAVE mode only)
    if (craftingMode === 'weave') {
      const invDivider = document.createElement('div');
      invDivider.className = 'forge-section-divider';
      invDivider.textContent = 'Weave Inventory';
      element.appendChild(invDivider);
      element.appendChild(weaveInventoryPanel.element);
    }
    weaveInventoryPanel.update(rpgState.craftedWeaves, rpgState.equippedWeaveSlots, rpgState);

    // 13. Lens inventory (below crafting controls, LENS mode only)
    if (craftingMode === 'lens') {
      const invDivider = document.createElement('div');
      invDivider.className = 'forge-section-divider';
      invDivider.textContent = 'Lens Inventory';
      element.appendChild(invDivider);
      element.appendChild(buildLensInventorySection(rpgState, dispatch));
    }

    startAnimLoop();
  }

  // â”€â”€ Public interface â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

  function update(rpgState: RpgSimState, isDevMode: boolean, forgeState?: ForgeCrunchState, resources?: ResourceState, numberFormat: NumberFormat = 'letters'): void {
    latestRpgState = rpgState;
    latestIsDevMode = isDevMode;
    if (forgeState) latestForgeState = forgeState;
    if (resources) latestResources = resources;
    latestNumberFormat = numberFormat;
    if (element.childElementCount === 0) {
      build(rpgState, isDevMode);
      return;
    }

    const capacity = getEffectiveCapacity();
    while (selectedTiers.length > capacity) selectedTiers.pop();
    for (let i = selectedTiers.length - 1; i >= 0; i--) {
      if (!isTierAvailableForCrafting(selectedTiers[i])) selectedTiers.splice(i, 1);
    }
    if (capacityLabelEl) {
      if (craftingMode === 'lens') {
        capacityLabelEl.textContent = `Lens limit: ${capacity} mote type${capacity === 1 ? '' : 's'}`;
      } else {
        capacityLabelEl.textContent = `Forge capacity: ${capacity} mote types`;
      }
    }
    refreshInventory();
    refreshMoteLooms();
    refreshSlider();
    refreshPower();
    refreshPreview();
    refreshCraftBtn();
    refreshAdvanced();

    const forgeLevel = latestForgeState.forgeLevel;
    const unlockedSlots = getUnlockedWeaveSlotCount(forgeLevel);
    weaveSlotsPanel.update(rpgState.equippedWeaveSlots, rpgState.craftedWeaves, unlockedSlots);
    weaveInventoryPanel.update(rpgState.craftedWeaves, rpgState.equippedWeaveSlots, rpgState);
  }

  return {
    element,
    update,
    dispose(): void {
      if (isDisposed) return;
      isDisposed = true;
      if (animRafId !== null) cancelAnimationFrame(animRafId);
      animRafId = null;
      for (const cleanup of documentDragCleanups) cleanup();
      documentDragCleanups.length = 0;
      weaveInventoryPanel.dispose();
      weaveSlotsPanel.dispose();
    },
  };
}
