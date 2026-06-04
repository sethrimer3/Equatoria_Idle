/**
 * weave-inventory.ts — Scrollable inventory of crafted weaves.
 *
 * Supports:
 * - Tap/click to show stats popup
 * - Pointer-based drag to weave slots (desktop + mobile)
 * - Colored tier chips per affix
 * - Rarity label per affix
 * - "not yet applied" indicator for stored-only effects
 */

import type { CraftedWeaveData } from '../../data/rpg/weave-types';
import type { WeaveSlotsPanel } from './weave-slots';
import { TIER_BY_ID } from '../../data/tiers';

export interface WeaveInventoryPanel {
  element: HTMLElement;
  update(craftedWeaves: readonly CraftedWeaveData[], equippedSlots: (string | null)[]): void;
}

export function createWeaveInventoryPanel(slotsPanel: WeaveSlotsPanel): WeaveInventoryPanel {
  const element = document.createElement('div');
  element.className = 'weave-inventory';

  const emptyMsg = document.createElement('div');
  emptyMsg.className = 'weave-inventory__empty';
  emptyMsg.textContent = 'No weaves crafted yet. Switch to Weave mode and craft one.';
  element.appendChild(emptyMsg);

  const list = document.createElement('div');
  list.className = 'weave-inventory__list';
  element.appendChild(list);

  let currentWeaves: readonly CraftedWeaveData[] = [];
  let equippedIds: Set<string> = new Set();

  // ── Drag state ─────────────────────────────────────────────────────────

  let dragGhost: HTMLElement | null = null;
  let draggingWeaveId: string | null = null;
  let activeDragPointerId = -1;

  function cleanupDrag(): void {
    dragGhost?.remove();
    dragGhost = null;
    draggingWeaveId = null;
    activeDragPointerId = -1;
    slotsPanel.setDragActive(null);
  }

  function onDocPointerMove(e: PointerEvent): void {
    if (e.pointerId !== activeDragPointerId) return;
    if (dragGhost) {
      dragGhost.style.left = `${e.clientX - 60}px`;
      dragGhost.style.top = `${e.clientY - 20}px`;
    }
  }

  function onDocPointerUp(e: PointerEvent): void {
    if (e.pointerId !== activeDragPointerId) return;
    cleanupDrag();
    document.removeEventListener('pointermove', onDocPointerMove);
    document.removeEventListener('pointerup', onDocPointerUp);
  }

  // ── Card builder ───────────────────────────────────────────────────────

  function buildWeaveCard(weave: CraftedWeaveData): HTMLElement {
    const card = document.createElement('div');
    card.className = 'weave-card';
    card.dataset.weaveId = weave.id;
    if (equippedIds.has(weave.id)) {
      card.classList.add('weave-card--equipped');
    }

    const header = document.createElement('div');
    header.className = 'weave-card__header';

    const nameEl = document.createElement('span');
    nameEl.className = 'weave-card__name';
    // Color by highest-tier affix
    const topAffix = weave.affixes[0];
    if (topAffix) {
      const tier = TIER_BY_ID.get(topAffix.tierId);
      nameEl.style.color = tier?.color ?? '#fff';
    }
    nameEl.textContent = weave.name;
    header.appendChild(nameEl);

    if (equippedIds.has(weave.id)) {
      const badge = document.createElement('span');
      badge.className = 'weave-card__equipped-badge';
      badge.textContent = 'equipped';
      header.appendChild(badge);
    }

    card.appendChild(header);

    // Affix rows
    for (const affix of weave.affixes) {
      const tier = TIER_BY_ID.get(affix.tierId);
      const row = document.createElement('div');
      row.className = 'weave-card__affix-row';

      const chip = document.createElement('span');
      chip.className = 'weave-card__tier-chip';
      chip.style.background = tier?.color ?? '#555';
      chip.textContent = tier?.displayName ?? affix.tierId;
      row.appendChild(chip);

      const statEl = document.createElement('span');
      statEl.className = 'weave-card__stat';
      statEl.textContent = `${affix.label} +${affix.value.toFixed(1)}${affix.unit}`;
      row.appendChild(statEl);

      const rarityEl = document.createElement('span');
      rarityEl.className = `weave-card__rarity weave-card__rarity--${affix.rarity.toLowerCase()}`;
      rarityEl.textContent = affix.rarity;
      row.appendChild(rarityEl);

      if (!affix.applied) {
        const storedEl = document.createElement('span');
        storedEl.className = 'weave-card__stored';
        storedEl.title = 'This bonus is stored but not yet applied to gameplay';
        storedEl.textContent = '(stored)';
        row.appendChild(storedEl);
      }

      card.appendChild(row);
    }

    // Drag interaction (pointer events — works on mobile)
    let downTs = 0;
    let downX = 0, downY = 0;
    let thisDragging = false;

    card.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      downTs = e.timeStamp;
      downX = e.clientX;
      downY = e.clientY;
      thisDragging = false;
      e.stopPropagation();
    });

    card.addEventListener('pointermove', (e: PointerEvent) => {
      if (thisDragging || draggingWeaveId) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) {
        thisDragging = true;
        draggingWeaveId = weave.id;
        activeDragPointerId = e.pointerId;
        slotsPanel.setDragActive(weave.id);

        const ghost = document.createElement('div');
        ghost.className = 'weave-drag-ghost';
        ghost.textContent = weave.name;
        ghost.style.left = `${e.clientX - 60}px`;
        ghost.style.top = `${e.clientY - 20}px`;
        document.body.appendChild(ghost);
        dragGhost = ghost;

        document.addEventListener('pointermove', onDocPointerMove);
        document.addEventListener('pointerup', onDocPointerUp);
      }
    });

    card.addEventListener('pointerup', (e: PointerEvent) => {
      if (!thisDragging && e.timeStamp - downTs < 400) {
        // Tap — nothing extra needed; slot panel popup handles equipped weaves
      }
      thisDragging = false;
    });

    return card;
  }

  function render(): void {
    list.innerHTML = '';
    const isEmpty = currentWeaves.length === 0;
    emptyMsg.style.display = isEmpty ? '' : 'none';

    for (const weave of currentWeaves) {
      list.appendChild(buildWeaveCard(weave));
    }
  }

  function update(craftedWeaves: readonly CraftedWeaveData[], equippedSlots: (string | null)[]): void {
    currentWeaves = craftedWeaves;
    equippedIds = new Set(equippedSlots.filter((id): id is string => id !== null));
    render();
  }

  return { element, update };
}
