/**
 * forge-inventory.ts — Inventory slot grid for crafted weapons in the FORGE tab.
 *
 * Displays crafted weapons in a grid of golden slots. Supports:
 *   - Drag-and-drop reordering between slots (pointer events, works on touch)
 *   - Tap/click to show a floating stat popup
 *   - Level badge in the bottom-right corner of each occupied slot
 */

import type { CraftedWeaponData } from '../../data/rpg/crafted-weapon-types';
import { TIER_BY_ID } from '../../data/tiers';
import { getCraftedModifierLines, formatCraftedWeaponModifier } from '../../data/rpg/crafted-weapon-helpers';
import { createItemIconCanvas, stringToIconSeed } from '../../render/assets/item-icon-renderer';

const MIN_SLOT_COUNT = 12;

export interface ForgeInventory {
  element: HTMLElement;
  update(craftedWeapons: readonly CraftedWeaponData[]): void;
}

export function createForgeInventory(): ForgeInventory {
  const element = document.createElement('div');
  element.className = 'forge-inventory';

  const titleEl = document.createElement('div');
  titleEl.className = 'forge-inventory__title';
  titleEl.textContent = 'Inventory';
  element.appendChild(titleEl);

  const grid = document.createElement('div');
  grid.className = 'forge-inventory__grid';
  element.appendChild(grid);

  // Per-slot weapon mapping — preserves user arrangement across updates
  let slotWeapons: Array<CraftedWeaponData | null> = Array(MIN_SLOT_COUNT).fill(null);

  // ── Popup ──────────────────────────────────────────────────────────

  let activePopup: HTMLElement | null = null;
  let popupDismissHandler: ((e: Event) => void) | null = null;

  function dismissPopup(): void {
    if (activePopup) { activePopup.remove(); activePopup = null; }
    if (popupDismissHandler) {
      document.removeEventListener('pointerdown', popupDismissHandler);
      popupDismissHandler = null;
    }
  }

  function showWeaponPopup(weapon: CraftedWeaponData, anchorEl: HTMLElement): void {
    dismissPopup();
    const dominantColor = TIER_BY_ID.get(weapon.dominantTierId)?.color ?? '#ffffff';

    const popup = document.createElement('div');
    popup.className = 'forge-inventory__popup';

    const nameRow = document.createElement('div');
    nameRow.className = 'forge-inventory__popup-name';
    nameRow.style.color = dominantColor;
    nameRow.textContent = weapon.name;
    popup.appendChild(nameRow);

    const lvlRow = document.createElement('div');
    lvlRow.className = 'forge-inventory__popup-row';
    lvlRow.textContent = `Level ${weapon.baseLevel}  ·  ×${weapon.baseStatMultiplier.toFixed(2)} stats  ·  ${weapon.totalWeightedMoteValue.toLocaleString()} mote-wt`;
    popup.appendChild(lvlRow);

    const compRow = document.createElement('div');
    compRow.className = 'forge-inventory__popup-row';
    compRow.textContent = formatCraftedWeaponModifier(weapon);
    popup.appendChild(compRow);

    const { stats } = weapon.definition;
    const statsRow = document.createElement('div');
    statsRow.className = 'forge-inventory__popup-stats';
    const effect = stats.effect;
    let effectLabel = 'Single';
    if (effect?.kind === 'multi')    effectLabel = `×${(effect as { targetCount: number }).targetCount} targets`;
    if (effect?.kind === 'aoe')      effectLabel = `AoE ${(effect as { aoeRadius: number }).aoeRadius}px`;
    if (effect?.kind === 'piercing') effectLabel = `${Math.round((effect as { defPierceRatio: number }).defPierceRatio * 100)}% pierce`;
    statsRow.innerHTML =
      `<span>+${stats.damage} ATK</span>` +
      `<span>+${stats.defBonus} DEF</span>` +
      `<span>${stats.cooldownMs}ms CD</span>` +
      `<span>${stats.range >= 9999 ? '∞' : stats.range}px RNG</span>` +
      `<span>${effectLabel}</span>`;
    popup.appendChild(statsRow);

    const modLines = getCraftedModifierLines(weapon);
    if (modLines.length > 0) {
      const modEl = document.createElement('div');
      modEl.className = 'forge-inventory__popup-mods';
      modEl.textContent = modLines.join('\n');
      popup.appendChild(modEl);
    }

    document.body.appendChild(popup);
    activePopup = popup;

    // Position next to the anchor slot, staying within viewport
    const rect = anchorEl.getBoundingClientRect();
    const popupW = 248;
    let left = rect.right + 8;
    if (left + popupW > window.innerWidth - 8) left = rect.left - popupW - 8;
    if (left < 8) left = 8;
    let top = rect.top;
    const approxH = popup.offsetHeight || 160;
    if (top + approxH > window.innerHeight - 8) top = window.innerHeight - approxH - 8;
    if (top < 8) top = 8;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    popupDismissHandler = (e: Event) => {
      if (activePopup && !activePopup.contains(e.target as Node)) dismissPopup();
    };
    setTimeout(() => {
      if (popupDismissHandler) document.addEventListener('pointerdown', popupDismissHandler);
    }, 0);
  }

  // ── Weapon icon canvas builder ──────────────────────────────────────

  function buildWeaponIconCanvas(weapon: CraftedWeaponData, size = 40): HTMLCanvasElement {
    const dominantColor = TIER_BY_ID.get(weapon.dominantTierId)?.color ?? '#fff';
    const iconCanvas = createItemIconCanvas({
      itemType: 'weapon',
      tierId: weapon.dominantTierId,
      composition: weapon.composition.map(e => ({ tierId: e.tierId, share: e.share })),
      width: size,
      height: size,
      seed: stringToIconSeed(weapon.id),
    });
    iconCanvas.style.cssText =
      `display:block;image-rendering:pixelated;` +
      `filter:drop-shadow(0 0 1px rgba(255,255,255,0.85)) drop-shadow(0 0 3px ${dominantColor}99);`;
    return iconCanvas;
  }

  // ── Drag-and-drop state ────────────────────────────────────────────

  let dragSourceIdx = -1;
  let dragGhost: HTMLElement | null = null;
  let isDragging = false;
  let activeDragPointerId = -1;
  let lastDragOverIdx = -1;

  function getSlotIndexAtPoint(x: number, y: number): number {
    const slots = grid.querySelectorAll<HTMLElement>('.forge-inventory__slot');
    for (let i = 0; i < slots.length; i++) {
      const r = slots[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return -1;
  }

  function clearDragHighlight(): void {
    grid.querySelectorAll('.forge-inventory__slot--drag-over')
      .forEach(el => el.classList.remove('forge-inventory__slot--drag-over'));
    lastDragOverIdx = -1;
  }

  function cleanupDrag(): void {
    isDragging = false;
    dragSourceIdx = -1;
    activeDragPointerId = -1;
    if (dragGhost) { dragGhost.remove(); dragGhost = null; }
    clearDragHighlight();
  }

  function onDocPointerMove(e: PointerEvent): void {
    if (!isDragging || e.pointerId !== activeDragPointerId) return;
    if (dragGhost) {
      dragGhost.style.left = `${e.clientX - 28}px`;
      dragGhost.style.top = `${e.clientY - 28}px`;
    }
    const targetIdx = getSlotIndexAtPoint(e.clientX, e.clientY);
    const newDragOver = (targetIdx !== -1 && targetIdx !== dragSourceIdx) ? targetIdx : -1;
    if (newDragOver !== lastDragOverIdx) {
      clearDragHighlight();
      if (newDragOver !== -1) {
        const slots = grid.querySelectorAll<HTMLElement>('.forge-inventory__slot');
        slots[newDragOver]?.classList.add('forge-inventory__slot--drag-over');
        lastDragOverIdx = newDragOver;
      }
    }
  }

  function onDocPointerUp(e: PointerEvent): void {
    if (!isDragging || e.pointerId !== activeDragPointerId) return;
    const targetIdx = getSlotIndexAtPoint(e.clientX, e.clientY);
    if (targetIdx !== -1 && targetIdx !== dragSourceIdx) {
      const tmp = slotWeapons[targetIdx];
      slotWeapons[targetIdx] = slotWeapons[dragSourceIdx];
      slotWeapons[dragSourceIdx] = tmp;
      renderGrid();
    }
    cleanupDrag();
    document.removeEventListener('pointermove', onDocPointerMove);
    document.removeEventListener('pointerup', onDocPointerUp);
  }

  // ── Slot builder ───────────────────────────────────────────────────

  function buildSlot(index: number): HTMLElement {
    const slot = document.createElement('div');
    slot.className = 'forge-inventory__slot';
    const weapon = slotWeapons[index] ?? null;

    if (!weapon) return slot;

    slot.appendChild(buildWeaponIconCanvas(weapon, 40));

    const lvlBadge = document.createElement('span');
    lvlBadge.className = 'forge-inventory__lvl';
    lvlBadge.textContent = String(weapon.baseLevel);
    slot.appendChild(lvlBadge);

    let pointerDownTs = 0;
    let dragStartX = 0;
    let dragStartY = 0;
    let thisDragging = false;
    let isPointerDown = false;

    slot.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      e.stopPropagation();
      pointerDownTs = e.timeStamp;
      dragStartX = e.clientX;
      dragStartY = e.clientY;
      thisDragging = false;
      isPointerDown = true;
    });

    slot.addEventListener('pointermove', (e: PointerEvent) => {
      if (!isPointerDown) return;
      if (isDragging && activeDragPointerId !== e.pointerId) return;
      if (thisDragging || isDragging) return;
      const dx = e.clientX - dragStartX;
      const dy = e.clientY - dragStartY;
      if (Math.hypot(dx, dy) > 6) {
        // Initiate drag
        thisDragging = true;
        isDragging = true;
        dragSourceIdx = index;
        activeDragPointerId = e.pointerId;
        slot.setPointerCapture(e.pointerId);

        const ghost = document.createElement('div');
        ghost.className = 'forge-inventory__drag-ghost';
        ghost.appendChild(buildWeaponIconCanvas(weapon, 56));
        ghost.style.left = `${e.clientX - 28}px`;
        ghost.style.top = `${e.clientY - 28}px`;
        document.body.appendChild(ghost);
        dragGhost = ghost;

        document.addEventListener('pointermove', onDocPointerMove);
        document.addEventListener('pointerup', onDocPointerUp);
        dismissPopup();
      }
    });

    slot.addEventListener('pointerup', (e: PointerEvent) => {
      if (!thisDragging && isPointerDown && e.timeStamp - pointerDownTs < 400) {
        showWeaponPopup(weapon, slot);
      }
      thisDragging = false;
      isPointerDown = false;
    });

    slot.addEventListener('pointerleave', () => {
      isPointerDown = false;
    });

    return slot;
  }

  function renderGrid(): void {
    grid.innerHTML = '';
    const totalSlots = Math.max(MIN_SLOT_COUNT, slotWeapons.length);
    for (let i = 0; i < totalSlots; i++) {
      grid.appendChild(buildSlot(i));
    }
  }

  renderGrid();

  // ── Public update ──────────────────────────────────────────────────

  function update(craftedWeapons: readonly CraftedWeaponData[]): void {
    // Track which weapon IDs already have a slot position
    const existingIds = new Set(slotWeapons.filter(Boolean).map(w => w!.id));

    // Refresh data for weapons already placed (in case stats changed)
    for (let i = 0; i < slotWeapons.length; i++) {
      if (slotWeapons[i]) {
        const fresh = craftedWeapons.find(w => w.id === slotWeapons[i]!.id);
        slotWeapons[i] = fresh ?? null;
      }
    }

    // Remove weapons that no longer exist in state
    for (let i = 0; i < slotWeapons.length; i++) {
      if (slotWeapons[i] && !craftedWeapons.some(w => w.id === slotWeapons[i]!.id)) {
        slotWeapons[i] = null;
      }
    }

    // Place newly crafted weapons into the first empty slot
    for (const weapon of craftedWeapons) {
      if (!existingIds.has(weapon.id)) {
        const emptyIdx = slotWeapons.indexOf(null);
        if (emptyIdx !== -1) {
          slotWeapons[emptyIdx] = weapon;
        } else {
          slotWeapons.push(weapon);
        }
      }
    }

    // Maintain minimum slot count
    while (slotWeapons.length < MIN_SLOT_COUNT) slotWeapons.push(null);

    renderGrid();
  }

  return { element, update };
}
