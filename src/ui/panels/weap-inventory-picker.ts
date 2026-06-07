/**
 * weap-inventory-picker.ts — Floating weapon-inventory popup for the WEAP column.
 *
 * Opened by tapping the "Weap" header or any WEAP data cell in the RPG stats panel.
 * Shows all owned weapons; supports tap-to-select + slot-button equip and
 * drag-and-drop directly onto WEAP slot cells in the stats panel.
 *
 * Reuse guide: the component is column-agnostic in structure; ATK/SPD/RNG/PRC
 * columns can instantiate similar pickers with their own item lists and actions.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getMaxEquippedWeapons } from '../../sim/rpg/rpg-state';
import { resolveWeaponDefinition } from '../../data/rpg/crafted-weapon-helpers';
import { TIER_BY_ID } from '../../data/tiers';
import type { TierId } from '../../data/tiers';
import type { ActionHandler } from '../../input';
import { createItemIconCanvas, stringToIconSeed } from '../../render/assets/item-icon-renderer';
import type { CompositionEntry } from '../../render/assets/item-icon-renderer';
import { INFINITE_RANGE } from '../../data/rpg/weapon-definitions';
import type { CraftedWeaponData } from '../../data/rpg/crafted-weapon-types';

// ── Weapon entry normalised for display ────────────────────────────────────

interface WeaponEntry {
  id: string;
  name: string;
  tierId: TierId;
  composition: CompositionEntry[];
  craftedData: CraftedWeaponData | null;
}

function buildWeaponEntries(rpgSimState: RpgSimState): WeaponEntry[] {
  const craftedById = new Map(rpgSimState.craftedWeapons.map(w => [w.id, w]));
  const entries: WeaponEntry[] = [];

  for (const weaponId of rpgSimState.purchasedWeaponIds) {
    const crafted = craftedById.get(weaponId);
    const def = resolveWeaponDefinition(weaponId);
    if (!def) continue;

    if (crafted) {
      entries.push({
        id: weaponId,
        name: crafted.name,
        tierId: crafted.dominantTierId,
        composition: crafted.composition.map(e => ({ tierId: e.tierId as TierId, share: e.share })),
        craftedData: crafted,
      });
    } else {
      entries.push({
        id: weaponId,
        name: def.name,
        tierId: def.costTierId as TierId,
        composition: [{ tierId: def.costTierId as TierId, share: 1 }],
        craftedData: null,
      });
    }
  }

  return entries;
}

// ── Public interface ───────────────────────────────────────────────────────

export interface WeapInventoryPickerOpts {
  /** The DOM element that was tapped — popup anchors relative to it. */
  anchor: HTMLElement;
  /** Which weapon-row slot was tapped (0–4), or null when the header was tapped. */
  slotIdx: number | null;
  rpgSimState: RpgSimState;
  dispatch: ActionHandler;
  /** The WEAP column cell elements for drag-drop target detection (from statsPanel.getWeapSlotCells()). */
  weapSlotCells: HTMLElement[];
}

export function showWeapInventoryPicker(opts: WeapInventoryPickerOpts): { dismiss: () => void } {
  const { anchor, slotIdx, rpgSimState, dispatch, weapSlotCells } = opts;

  // Pre-select the weapon already in the tapped slot (if any)
  let selectedWeaponId: string | null =
    slotIdx !== null ? (rpgSimState.equippedWeaponSlots.get(slotIdx) ?? null) : null;

  // ── Helper: which slot (0–4) holds a given weapon ID ──────────────────────
  function getWeaponSlot(weaponId: string): number | null {
    for (const [s, wid] of rpgSimState.equippedWeaponSlots) {
      if (wid === weaponId) return s;
    }
    return null;
  }

  // ── Helper: compact stat summary line ─────────────────────────────────────
  function formatStatSummary(weaponId: string): string {
    const def = resolveWeaponDefinition(weaponId);
    if (!def) return '';
    const spdText = def.stats.cooldownMs < 1000
      ? `${def.stats.cooldownMs}ms`
      : `${(def.stats.cooldownMs / 1000).toFixed(1)}s`;
    const rngText = def.stats.range >= INFINITE_RANGE ? '∞' : String(def.stats.range);
    return `ATK:${def.stats.damage}  SPD:${spdText}  RNG:${rngText}`;
  }

  // ── Build popup skeleton ───────────────────────────────────────────────────
  const popup = document.createElement('div');
  popup.className = 'weap-picker';

  // Header
  const header = document.createElement('div');
  header.className = 'weap-picker__header';
  const title = document.createElement('span');
  title.className = 'weap-picker__title';
  title.textContent = 'WEAPONS';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'weap-picker__close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', dismiss);
  header.appendChild(title);
  header.appendChild(closeBtn);
  popup.appendChild(header);

  // Weapon list
  const list = document.createElement('div');
  list.className = 'weap-picker__list';
  popup.appendChild(list);

  // Info section — initially hidden, shown when a weapon is selected
  const infoSection = document.createElement('div');
  infoSection.className = 'weap-picker__info';
  infoSection.hidden = true;
  popup.appendChild(infoSection);

  document.body.appendChild(popup);

  // ── Position popup: prefer above anchor, fall back to below ──────────────
  const POPUP_W = 240;
  const POPUP_MAX_H = 340;
  const MARGIN = 8;
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const anchorRect = anchor.getBoundingClientRect();
  const popupH = popup.offsetHeight || 160;

  let left = anchorRect.left;
  if (left + POPUP_W > vw - MARGIN) left = vw - POPUP_W - MARGIN;
  if (left < MARGIN) left = MARGIN;

  let top = anchorRect.top - popupH - 4;
  if (top < MARGIN) top = anchorRect.bottom + 4;
  if (top + POPUP_MAX_H > vh - MARGIN) top = vh - POPUP_MAX_H - MARGIN;
  if (top < MARGIN) top = MARGIN;

  popup.style.left   = `${left}px`;
  popup.style.top    = `${top}px`;
  popup.style.width  = `${POPUP_W}px`;
  popup.style.maxHeight = `${POPUP_MAX_H}px`;

  // ── Info section builder ───────────────────────────────────────────────────
  function buildInfoSection(entry: WeaponEntry): void {
    infoSection.innerHTML = '';
    infoSection.hidden = false;

    const def = resolveWeaponDefinition(entry.id);
    const color = TIER_BY_ID.get(entry.tierId)?.color ?? '#fff';

    const nameEl = document.createElement('div');
    nameEl.className = 'weap-picker__info-name';
    nameEl.style.color = color;
    nameEl.textContent = entry.name;
    infoSection.appendChild(nameEl);

    const statsEl = document.createElement('div');
    statsEl.className = 'weap-picker__info-stats';
    statsEl.textContent = formatStatSummary(entry.id);
    infoSection.appendChild(statsEl);

    if (def?.description) {
      const descEl = document.createElement('div');
      descEl.className = 'weap-picker__info-desc';
      descEl.textContent = def.description.length > 90
        ? def.description.slice(0, 90) + '…'
        : def.description;
      infoSection.appendChild(descEl);
    }

    // Slot selector
    const maxSlots = getMaxEquippedWeapons(rpgSimState);
    const slotsLabel = document.createElement('div');
    slotsLabel.className = 'weap-picker__slots-label';
    slotsLabel.textContent = 'Equip to slot:';
    infoSection.appendChild(slotsLabel);

    const slotRow = document.createElement('div');
    slotRow.className = 'weap-picker__slot-row';

    for (let s = 0; s < maxSlots; s++) {
      const occupant = rpgSimState.equippedWeaponSlots.get(s);
      const btn = document.createElement('button');
      btn.className = 'weap-picker__slot-btn';

      if (occupant === entry.id) {
        btn.classList.add('weap-picker__slot-btn--current');
        btn.title = 'Already in this slot';
        btn.disabled = true;
      } else if (occupant) {
        btn.classList.add('weap-picker__slot-btn--occupied');
        const occDef = resolveWeaponDefinition(occupant);
        btn.title = `Swap with ${occDef?.name ?? occupant}`;
      } else {
        btn.classList.add('weap-picker__slot-btn--empty');
        btn.title = `Empty slot`;
      }

      if (s === slotIdx) btn.classList.add('weap-picker__slot-btn--target');
      btn.textContent = String(s + 1);

      if (!btn.disabled) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sourceSlot = getWeaponSlot(entry.id);
          if (sourceSlot !== null && occupant) {
            // Already equipped elsewhere — true slot-to-slot swap
            dispatch({ kind: 'swap_weapon_slots', slotA: sourceSlot, slotB: s });
          } else {
            dispatch({ kind: 'equip_weapon_to_slot', weaponId: entry.id, slotIndex: s });
          }
          dismiss();
        });
      }

      slotRow.appendChild(btn);
    }
    infoSection.appendChild(slotRow);

    // Unequip button if the weapon is currently in a slot
    const currentSlot = getWeaponSlot(entry.id);
    if (currentSlot !== null) {
      const unequipBtn = document.createElement('button');
      unequipBtn.className = 'weap-picker__unequip-btn';
      unequipBtn.textContent = `Unequip from slot ${currentSlot + 1}`;
      unequipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dispatch({ kind: 'unequip_weapon', weaponId: entry.id });
        dismiss();
      });
      infoSection.appendChild(unequipBtn);
    }
  }

  // ── Card selection ─────────────────────────────────────────────────────────
  function selectEntry(entry: WeaponEntry): void {
    selectedWeaponId = entry.id;
    list.querySelectorAll<HTMLElement>('.weap-picker__card').forEach(el => {
      el.classList.toggle('weap-picker__card--selected', el.dataset.weaponId === entry.id);
    });
    buildInfoSection(entry);
    // Reposition if bottom-anchored and now taller
    const newH = popup.offsetHeight;
    const tTop = parseFloat(popup.style.top);
    if (tTop + newH > vh - MARGIN) {
      popup.style.top = `${Math.max(MARGIN, vh - newH - MARGIN)}px`;
    }
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  let dragGhost: HTMLElement | null = null;
  let dragWeaponId: string | null = null;
  let dragSourceSlot: number | null = null;
  let dragOverCell: HTMLElement | null = null;

  function findWeapCellAt(x: number, y: number): HTMLElement | null {
    // Hide ghost so elementsFromPoint can see through it
    if (dragGhost) dragGhost.style.display = 'none';
    const els = document.elementsFromPoint(x, y);
    if (dragGhost) dragGhost.style.display = '';
    for (const el of els) {
      if (el instanceof HTMLElement && el.dataset.weapSlotIdx !== undefined) return el;
    }
    return null;
  }

  function clearDragHighlight(): void {
    dragOverCell?.classList.remove('weap-slot-drop-target');
    dragOverCell = null;
  }

  function onDragMove(e: PointerEvent): void {
    if (!dragGhost) return;
    dragGhost.style.left = `${e.clientX - 20}px`;
    dragGhost.style.top  = `${e.clientY - 20}px`;
    const cell = findWeapCellAt(e.clientX, e.clientY);
    if (cell !== dragOverCell) {
      clearDragHighlight();
      dragOverCell = cell;
      cell?.classList.add('weap-slot-drop-target');
    }
  }

  function onDragEnd(e: PointerEvent): void {
    const cell = findWeapCellAt(e.clientX, e.clientY);
    if (cell && dragWeaponId) {
      const targetSlot = parseInt(cell.dataset.weapSlotIdx ?? '-1', 10);
      if (targetSlot >= 0) {
        if (dragSourceSlot !== null && dragSourceSlot !== targetSlot) {
          dispatch({ kind: 'swap_weapon_slots', slotA: dragSourceSlot, slotB: targetSlot });
        } else if (dragSourceSlot === null) {
          dispatch({ kind: 'equip_weapon_to_slot', weaponId: dragWeaponId, slotIndex: targetSlot });
        }
        dismiss();
        return;
      }
    }
    cleanupDrag();
  }

  function cleanupDrag(): void {
    dragGhost?.remove();
    dragGhost = null;
    dragWeaponId = null;
    dragSourceSlot = null;
    clearDragHighlight();
    document.removeEventListener('pointermove', onDragMove);
    document.removeEventListener('pointerup', onDragEnd);
  }

  function startDrag(e: PointerEvent, entry: WeaponEntry): void {
    dragWeaponId  = entry.id;
    dragSourceSlot = getWeaponSlot(entry.id);

    const ghost = document.createElement('div');
    ghost.className = 'weap-picker__drag-ghost';
    const ic = createItemIconCanvas({
      itemType: 'weapon',
      tierId: entry.tierId,
      composition: entry.composition,
      width: 40,
      height: 40,
      seed: stringToIconSeed(entry.id),
    });
    ghost.appendChild(ic);
    ghost.style.left = `${e.clientX - 20}px`;
    ghost.style.top  = `${e.clientY - 20}px`;
    document.body.appendChild(ghost);
    dragGhost = ghost;

    document.addEventListener('pointermove', onDragMove);
    document.addEventListener('pointerup',   onDragEnd);
  }

  // ── Build weapon cards ─────────────────────────────────────────────────────
  const entries = buildWeaponEntries(rpgSimState);

  for (const entry of entries) {
    const card = document.createElement('div');
    card.className = 'weap-picker__card';
    card.dataset.weaponId = entry.id;

    const inSlot = getWeaponSlot(entry.id);
    if (inSlot !== null) card.classList.add('weap-picker__card--equipped');
    if (entry.id === selectedWeaponId) card.classList.add('weap-picker__card--selected');

    const color = TIER_BY_ID.get(entry.tierId)?.color ?? '#fff';

    // Icon
    const ic = createItemIconCanvas({
      itemType: 'weapon',
      tierId: entry.tierId,
      composition: entry.composition,
      width: 28,
      height: 28,
      seed: stringToIconSeed(entry.id),
    });
    ic.className = 'weap-picker__card-icon';
    card.appendChild(ic);

    // Name (+ slot badge if equipped)
    const nameEl = document.createElement('div');
    nameEl.className = 'weap-picker__card-name';
    nameEl.style.color = color;
    const nameText = document.createElement('span');
    nameText.textContent = entry.name;
    nameEl.appendChild(nameText);
    if (inSlot !== null) {
      const badge = document.createElement('span');
      badge.className = 'weap-picker__slot-badge';
      badge.textContent = `S${inSlot + 1}`;
      nameEl.appendChild(badge);
    }
    card.appendChild(nameEl);

    // Drag support
    let downTs = 0;
    let downX = 0;
    let downY = 0;
    let cardDragging = false;

    card.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      downTs = e.timeStamp;
      downX  = e.clientX;
      downY  = e.clientY;
      cardDragging = false;
    });

    card.addEventListener('pointermove', (e: PointerEvent) => {
      if (cardDragging || dragWeaponId !== null) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) {
        cardDragging = true;
        startDrag(e, entry);
      }
    });

    card.addEventListener('pointerup', (e: PointerEvent) => {
      if (!cardDragging && e.timeStamp - downTs < 400) {
        selectEntry(entry);
      }
      cardDragging = false;
    });

    list.appendChild(card);
  }

  if (entries.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'weap-picker__empty';
    empty.textContent = 'No weapons owned';
    list.appendChild(empty);
  }

  // Auto-show info for the pre-selected weapon
  if (selectedWeaponId) {
    const entry = entries.find(e => e.id === selectedWeaponId);
    if (entry) {
      buildInfoSection(entry);
      list.querySelector<HTMLElement>(`[data-weapon-id="${selectedWeaponId}"]`)
        ?.classList.add('weap-picker__card--selected');
    }
  }

  // ── Highlight the tapped cell's column in the stats panel ─────────────────
  // Adds a subtle ring to the source slot so users see the selection context.
  if (slotIdx !== null && weapSlotCells[slotIdx]) {
    weapSlotCells[slotIdx].classList.add('weap-slot-picker-source');
  }

  // ── Dismiss logic ──────────────────────────────────────────────────────────
  function dismiss(): void {
    popup.remove();
    cleanupDrag();
    if (slotIdx !== null && weapSlotCells[slotIdx]) {
      weapSlotCells[slotIdx].classList.remove('weap-slot-picker-source');
    }
    document.removeEventListener('pointerdown', onOutsideTap, true);
    document.removeEventListener('keydown', onEscape);
  }

  function onOutsideTap(e: PointerEvent): void {
    if (!popup.contains(e.target as Node)) {
      // Stop propagation so the pointerdown doesn't reach the tapped element.
      // This prevents a click on a WEAP cell from immediately re-opening the
      // picker in the same gesture that closed it.
      e.stopPropagation();
      dismiss();
    }
  }

  function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.stopPropagation(); dismiss(); }
  }

  // Delay registration by one frame so the triggering click doesn't immediately dismiss.
  setTimeout(() => {
    document.addEventListener('pointerdown', onOutsideTap, true);
    document.addEventListener('keydown', onEscape);
  }, 0);

  return { dismiss };
}
