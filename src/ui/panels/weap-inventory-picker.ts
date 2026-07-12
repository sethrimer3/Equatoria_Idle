/**
 * weap-inventory-picker.ts — Full-screen INVENTORY grid overlay for the WEAP column.
 *
 * Opened by tapping the "Weap" header or any WEAP data cell in the RPG stats panel.
 * Shows all owned weapons as large square grid slots with gold borders and sprite previews.
 * Supports tap-to-select + slot-button equip and drag-and-drop onto WEAP cells.
 *
 * Reuse guide: the component is column-agnostic in structure; ATK/SPD/RNG/PRC
 * columns can instantiate similar pickers with their own item lists and actions.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getMaxEquippedWeapons } from '../../sim/rpg/rpg-state';
import { resolveWeaponDefinition, formatCraftedWeaponModifier } from '../../data/rpg/crafted-weapon-helpers';
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

  // Always include all crafted weapons directly — their IDs are UUIDs that may
  // not resolve through resolveWeaponDefinition before syncCraftedWeapons runs.
  for (const crafted of rpgSimState.craftedWeapons) {
    entries.push({
      id: crafted.id,
      name: crafted.name,
      tierId: crafted.dominantTierId,
      composition: crafted.composition.map(e => ({ tierId: e.tierId as TierId, share: e.share })),
      craftedData: crafted,
    });
  }

  // Then include standard purchased weapons that are not crafted.
  for (const weaponId of rpgSimState.purchasedWeaponIds) {
    if (craftedById.has(weaponId)) continue;
    const def = resolveWeaponDefinition(weaponId);
    if (!def) continue;
    entries.push({
      id: weaponId,
      name: def.name,
      tierId: def.costTierId as TierId,
      composition: [{ tierId: def.costTierId as TierId, share: 1 }],
      craftedData: null,
    });
  }

  return entries;
}

// ── Public interface ───────────────────────────────────────────────────────

export interface WeapInventoryPickerOpts {
  /** The DOM element that was tapped — used to highlight the source WEAP cell. */
  anchor: HTMLElement;
  /** Which weapon-row slot was tapped (0–4), or null when the header was tapped. */
  slotIdx: number | null;
  rpgSimState: RpgSimState;
  dispatch: ActionHandler;
  /** The WEAP column cell elements for drag-drop target detection. */
  weapSlotCells: HTMLElement[];
}

const GRID_COLS = 4;
const ICON_PX   = 44; // weapon icon canvas size in px
const MIN_SLOTS = 8;  // minimum visible slots (fills grid with empty boxes)

export function showWeapInventoryPicker(opts: WeapInventoryPickerOpts): { dismiss: () => void } {
  const { slotIdx, rpgSimState, dispatch, weapSlotCells } = opts;

  // Pre-select the weapon already in the tapped slot (if any)
  let selectedWeaponId: string | null =
    slotIdx !== null ? (rpgSimState.equippedWeaponSlots.get(slotIdx) ?? null) : null;
  let isDismissed = false;
  let escapeListenerTimer: ReturnType<typeof setTimeout> | null = null;

  function getWeaponSlot(weaponId: string): number | null {
    for (const [s, wid] of rpgSimState.equippedWeaponSlots) {
      if (wid === weaponId) return s;
    }
    return null;
  }

  function formatStatSummary(entry: WeaponEntry): string {
    const stats = entry.craftedData?.definition.stats ?? resolveWeaponDefinition(entry.id)?.stats;
    if (!stats) return '';
    const spdText = stats.cooldownMs < 1000
      ? `${stats.cooldownMs}ms`
      : `${(stats.cooldownMs / 1000).toFixed(1)}s`;
    const rngText = stats.range >= INFINITE_RANGE ? '∞' : String(stats.range);
    return `ATK:${stats.damage}  SPD:${spdText}  RNG:${rngText}`;
  }

  // ── Build full-screen overlay ──────────────────────────────────────────────
  const overlay = document.createElement('div');
  overlay.className = 'weap-inv-overlay';

  const panel = document.createElement('div');
  panel.className = 'weap-inv-panel';
  overlay.appendChild(panel);

  // Header
  const header = document.createElement('div');
  header.className = 'weap-inv-header';
  const title = document.createElement('span');
  title.className = 'weap-inv-title';
  title.textContent = 'INVENTORY';
  const closeBtn = document.createElement('button');
  closeBtn.className = 'weap-inv-close';
  closeBtn.textContent = '×';
  closeBtn.addEventListener('click', dismiss);
  header.appendChild(title);
  header.appendChild(closeBtn);
  panel.appendChild(header);

  // Grid
  const grid = document.createElement('div');
  grid.className = 'weap-inv-grid';
  panel.appendChild(grid);

  // Info panel — hidden until an item is selected
  const infoSection = document.createElement('div');
  infoSection.className = 'weap-inv-info';
  infoSection.hidden = true;
  panel.appendChild(infoSection);

  document.body.appendChild(overlay);

  // ── Info section builder ───────────────────────────────────────────────────
  function buildInfoSection(entry: WeaponEntry): void {
    infoSection.innerHTML = '';
    infoSection.hidden = false;

    const def = entry.craftedData?.definition ?? resolveWeaponDefinition(entry.id);
    const color = TIER_BY_ID.get(entry.tierId)?.color ?? '#fff';

    // Name row
    const nameEl = document.createElement('div');
    nameEl.className = 'weap-inv-info-name';
    nameEl.style.color = color;
    const nameText = document.createElement('span');
    nameText.textContent = entry.name;
    nameEl.appendChild(nameText);
    if (entry.craftedData) {
      const badge = document.createElement('span');
      badge.className = 'weap-inv-forge-badge';
      badge.style.color = color;
      badge.style.borderColor = color + '88';
      badge.textContent = 'Forged';
      nameEl.appendChild(badge);
    }
    infoSection.appendChild(nameEl);

    const statsEl = document.createElement('div');
    statsEl.className = 'weap-inv-info-stats';
    statsEl.textContent = formatStatSummary(entry);
    infoSection.appendChild(statsEl);

    if (entry.craftedData) {
      const compEl = document.createElement('div');
      compEl.className = 'weap-inv-info-comp';
      compEl.textContent = formatCraftedWeaponModifier(entry.craftedData);
      infoSection.appendChild(compEl);
    }

    if (def?.description) {
      const descEl = document.createElement('div');
      descEl.className = 'weap-inv-info-desc';
      descEl.textContent = def.description.length > 100
        ? def.description.slice(0, 100) + '…'
        : def.description;
      infoSection.appendChild(descEl);
    }

    // Slot selector
    const maxSlots = getMaxEquippedWeapons(rpgSimState);
    const slotsLabel = document.createElement('div');
    slotsLabel.className = 'weap-inv-slots-label';
    slotsLabel.textContent = 'Equip to slot:';
    infoSection.appendChild(slotsLabel);

    const slotRow = document.createElement('div');
    slotRow.className = 'weap-inv-slot-row';

    for (let s = 0; s < maxSlots; s++) {
      const occupant = rpgSimState.equippedWeaponSlots.get(s);
      const btn = document.createElement('button');
      btn.className = 'weap-inv-slot-btn';

      if (occupant === entry.id) {
        btn.classList.add('weap-inv-slot-btn--current');
        btn.title = 'Already in this slot';
        btn.disabled = true;
      } else if (occupant) {
        btn.classList.add('weap-inv-slot-btn--occupied');
        const occName = entries.find(e => e.id === occupant)?.name
          ?? resolveWeaponDefinition(occupant)?.name
          ?? occupant;
        btn.title = `Swap with ${occName}`;
      } else {
        btn.classList.add('weap-inv-slot-btn--empty');
        btn.title = 'Empty slot';
      }

      if (s === slotIdx) btn.classList.add('weap-inv-slot-btn--target');
      btn.textContent = String(s + 1);

      if (!btn.disabled) {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          const sourceSlot = getWeaponSlot(entry.id);
          if (sourceSlot !== null && occupant) {
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
      unequipBtn.className = 'weap-inv-unequip-btn';
      unequipBtn.textContent = `Unequip from slot ${currentSlot + 1}`;
      unequipBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dispatch({ kind: 'unequip_weapon', weaponId: entry.id });
        dismiss();
      });
      infoSection.appendChild(unequipBtn);
    }
  }

  // ── Grid slot selection ────────────────────────────────────────────────────
  function selectEntry(entry: WeaponEntry): void {
    selectedWeaponId = entry.id;
    grid.querySelectorAll<HTMLElement>('.weap-inv-slot').forEach(el => {
      el.classList.toggle('weap-inv-slot--selected', el.dataset.weaponId === entry.id);
    });
    buildInfoSection(entry);
  }

  // ── Drag-and-drop ──────────────────────────────────────────────────────────
  let dragGhost: HTMLElement | null = null;
  let dragWeaponId: string | null = null;
  let dragSourceSlot: number | null = null;
  let dragOverCell: HTMLElement | null = null;

  function findWeapCellAt(x: number, y: number): HTMLElement | null {
    // elementsFromPoint returns all elements at the point regardless of visual
    // occlusion, so WEAP cells behind the overlay are still reachable.
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
    ghost.className = 'weap-inv-drag-ghost';
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

  // ── Build inventory grid ───────────────────────────────────────────────────
  const entries = buildWeaponEntries(rpgSimState);

  // Always show at least MIN_SLOTS, padded to a full GRID_COLS row.
  const minCount   = Math.max(entries.length, MIN_SLOTS);
  const totalSlots = Math.ceil(minCount / GRID_COLS) * GRID_COLS;

  for (let i = 0; i < totalSlots; i++) {
    const entry = entries[i] ?? null;
    const slot  = document.createElement('div');
    slot.className = 'weap-inv-slot';

    if (entry) {
      slot.dataset.weaponId = entry.id;

      const inSlot = getWeaponSlot(entry.id);
      if (inSlot !== null) slot.classList.add('weap-inv-slot--occupied');
      if (entry.id === selectedWeaponId) slot.classList.add('weap-inv-slot--selected');

      const color = TIER_BY_ID.get(entry.tierId)?.color ?? '#fff';

      // Icon canvas
      const ic = createItemIconCanvas({
        itemType: 'weapon',
        tierId: entry.tierId,
        composition: entry.composition,
        width: ICON_PX,
        height: ICON_PX,
        seed: stringToIconSeed(entry.id),
      });
      ic.className = 'weap-inv-slot__icon';
      ic.style.filter = `drop-shadow(0 0 5px ${color}55)`;
      slot.appendChild(ic);

      // Weapon name
      const nameEl = document.createElement('div');
      nameEl.className = 'weap-inv-slot__name';
      nameEl.style.color = color;
      nameEl.textContent = entry.name;
      slot.appendChild(nameEl);

      // Equipped-slot badge (top-right corner)
      if (inSlot !== null) {
        const badge = document.createElement('div');
        badge.className = 'weap-inv-slot__equip-badge';
        badge.textContent = `S${inSlot + 1}`;
        slot.appendChild(badge);
      }

      // Forged indicator (top-left corner)
      if (entry.craftedData) {
        const forgeBadge = document.createElement('div');
        forgeBadge.className = 'weap-inv-slot__forge-badge';
        forgeBadge.style.borderColor = color + '88';
        forgeBadge.style.color = color;
        forgeBadge.textContent = '⚒';
        slot.appendChild(forgeBadge);
      }

      // Drag + tap support
      let downTs = 0;
      let downX  = 0;
      let downY  = 0;
      let slotDragging = false;

      slot.addEventListener('pointerdown', (e: PointerEvent) => {
        if (e.button !== 0) return;
        downTs = e.timeStamp;
        downX  = e.clientX;
        downY  = e.clientY;
        slotDragging = false;
      });

      slot.addEventListener('pointermove', (e: PointerEvent) => {
        if (slotDragging || dragWeaponId !== null) return;
        if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) {
          slotDragging = true;
          startDrag(e, entry);
        }
      });

      slot.addEventListener('pointerup', (e: PointerEvent) => {
        if (!slotDragging && e.timeStamp - downTs < 400) {
          selectEntry(entry);
        }
        slotDragging = false;
      });
    } else {
      // Empty placeholder — stays visible as a gold-bordered box
      slot.classList.add('weap-inv-slot--placeholder');
    }

    grid.appendChild(slot);
  }

  if (entries.length === 0) {
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'weap-inv-empty';
    emptyMsg.textContent = 'No weapons owned';
    grid.appendChild(emptyMsg);
  }

  // Auto-show info for the pre-selected weapon
  if (selectedWeaponId) {
    const entry = entries.find(e => e.id === selectedWeaponId);
    if (entry) buildInfoSection(entry);
  }

  // Highlight the tapped WEAP cell in the stats panel
  if (slotIdx !== null && weapSlotCells[slotIdx]) {
    weapSlotCells[slotIdx].classList.add('weap-slot-picker-source');
  }

  // ── Dismiss logic ──────────────────────────────────────────────────────────
  function dismiss(): void {
    if (isDismissed) return;
    isDismissed = true;
    overlay.remove();
    cleanupDrag();
    if (slotIdx !== null && weapSlotCells[slotIdx]) {
      weapSlotCells[slotIdx].classList.remove('weap-slot-picker-source');
    }
    if (escapeListenerTimer !== null) clearTimeout(escapeListenerTimer);
    escapeListenerTimer = null;
    document.removeEventListener('keydown', onEscape);
  }

  // Click on the dark backdrop (overlay itself, not the panel) dismisses
  overlay.addEventListener('pointerdown', (e: PointerEvent) => {
    if (e.target === overlay) dismiss();
  });

  function onEscape(e: KeyboardEvent): void {
    if (e.key === 'Escape') { e.stopPropagation(); dismiss(); }
  }

  // Delay by one frame so the triggering tap doesn't immediately dismiss
  escapeListenerTimer = setTimeout(() => {
    escapeListenerTimer = null;
    if (!isDismissed) document.addEventListener('keydown', onEscape);
  }, 0);

  return { dismiss };
}
