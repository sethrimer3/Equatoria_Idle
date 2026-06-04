/**
 * weave-slots.ts — Row of 6 weave equipment slots at the top of the Forge crafting page.
 *
 * - Always shows all 6 slots.
 * - Locked slots show a lock icon.
 * - Empty unlocked slots show a faint Celtic trinity-knot background.
 * - Equipped weaves show a colored icon derived from affix tiers.
 * - Dragging a weave from inventory highlights valid drop targets.
 * - Clicking/tapping a slot shows a stat panel.
 */

import type { CraftedWeaveData } from '../../data/rpg/weave-types';
import { TIER_BY_ID } from '../../data/tiers';
import type { ActionHandler } from '../../input';
import { TOTAL_WEAVE_SLOTS } from '../../sim/forge/forge-state';

// Inline SVG for the Celtic trinity knot (triquetra) background
const TRIQUETRA_SVG = encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 56 56">` +
  `<g fill="none" stroke="rgba(255,255,255,0.10)" stroke-width="1.5">` +
  `<circle cx="28" cy="18" r="13"/>` +
  `<circle cx="18" cy="38" r="13"/>` +
  `<circle cx="38" cy="38" r="13"/>` +
  `</g></svg>`,
);
const TRIQUETRA_BG = `url("data:image/svg+xml,${TRIQUETRA_SVG}") center/70% no-repeat`;

export interface WeaveSlotsPanel {
  element: HTMLElement;
  update(
    equippedWeaveSlots: (string | null)[],
    craftedWeaves: readonly CraftedWeaveData[],
    unlockedCount: number,
  ): void;
  /** Called by inventory when a drag operation starts. Highlights valid empty slots. */
  setDragActive(weaveId: string | null): void;
}

type PopupDismissHandler = (e: Event) => void;

export function createWeaveSlotsPanel(dispatch: ActionHandler): WeaveSlotsPanel {
  const element = document.createElement('div');
  element.className = 'weave-slots';

  const label = document.createElement('div');
  label.className = 'weave-slots__label';
  label.textContent = 'Weave Slots';
  element.appendChild(label);

  const row = document.createElement('div');
  row.className = 'weave-slots__row';
  element.appendChild(row);

  // ── State ──────────────────────────────────────────────────────────────
  let currentSlots: (string | null)[] = Array(TOTAL_WEAVE_SLOTS).fill(null);
  let currentWeaves: readonly CraftedWeaveData[] = [];
  let currentUnlocked = 2;
  let activeDragWeaveId: string | null = null;

  // ── Popup ──────────────────────────────────────────────────────────────
  let activePopup: HTMLElement | null = null;
  let popupDismiss: PopupDismissHandler | null = null;

  function dismissPopup(): void {
    activePopup?.remove();
    activePopup = null;
    if (popupDismiss) {
      document.removeEventListener('pointerdown', popupDismiss);
      popupDismiss = null;
    }
  }

  function showWeavePopup(weave: CraftedWeaveData, anchor: HTMLElement, slotIndex: number): void {
    dismissPopup();
    const popup = document.createElement('div');
    popup.className = 'weave-popup';

    const dominantTier = weave.affixes[0] ? TIER_BY_ID.get(weave.affixes[0].tierId) : null;
    const nameEl = document.createElement('div');
    nameEl.className = 'weave-popup__name';
    nameEl.style.color = dominantTier?.color ?? '#fff';
    nameEl.textContent = weave.name;
    popup.appendChild(nameEl);

    for (const affix of weave.affixes) {
      const tier = TIER_BY_ID.get(affix.tierId);
      const row = document.createElement('div');
      row.className = 'weave-popup__affix';

      const chip = document.createElement('span');
      chip.className = 'weave-popup__tier-chip';
      chip.style.background = tier?.color ?? '#888';
      chip.textContent = tier?.displayName ?? affix.tierId;
      row.appendChild(chip);

      const stat = document.createElement('span');
      stat.className = 'weave-popup__stat';
      stat.textContent = `${affix.label} +${affix.value.toFixed(1)}${affix.unit}`;
      row.appendChild(stat);

      const rarityEl = document.createElement('span');
      rarityEl.className = `weave-popup__rarity weave-popup__rarity--${affix.rarity.toLowerCase()}`;
      rarityEl.textContent = `[${affix.rarity}]`;
      row.appendChild(rarityEl);

      if (!affix.applied) {
        const notApplied = document.createElement('span');
        notApplied.className = 'weave-popup__not-applied';
        notApplied.textContent = '(stored)';
        row.appendChild(notApplied);
      }

      popup.appendChild(row);
    }

    // Unequip button
    const unequipBtn = document.createElement('button');
    unequipBtn.className = 'weave-popup__unequip-btn';
    unequipBtn.textContent = 'Remove';
    unequipBtn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'unequip_weave', weaveId: weave.id });
      dismissPopup();
    });
    popup.appendChild(unequipBtn);

    document.body.appendChild(popup);
    activePopup = popup;

    const rect = anchor.getBoundingClientRect();
    const popupW = 220;
    let left = rect.right + 8;
    if (left + popupW > window.innerWidth - 8) left = rect.left - popupW - 8;
    if (left < 8) left = 8;
    let top = rect.top;
    const h = popup.offsetHeight || 120;
    if (top + h > window.innerHeight - 8) top = window.innerHeight - h - 8;
    if (top < 8) top = 8;
    popup.style.left = `${left}px`;
    popup.style.top = `${top}px`;

    popupDismiss = (e: Event) => {
      if (activePopup && !activePopup.contains(e.target as Node)) dismissPopup();
    };
    setTimeout(() => {
      if (popupDismiss) document.addEventListener('pointerdown', popupDismiss);
    }, 0);

    // Suppress unused variable warning — slotIndex available for future slot-level UI
    void slotIndex;
  }

  // ── Drag-over tracking ─────────────────────────────────────────────────

  function getSlotAtPoint(x: number, y: number): number {
    const slots = row.querySelectorAll<HTMLElement>('.weave-slot');
    for (let i = 0; i < slots.length; i++) {
      const r = slots[i].getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) return i;
    }
    return -1;
  }

  function clearDropHighlights(): void {
    row.querySelectorAll('.weave-slot--drop-target')
      .forEach(el => el.classList.remove('weave-slot--drop-target'));
  }

  // ── Slot drag-and-drop (slot ↔ slot reordering) ────────────────────────

  let slotDragSourceIdx = -1;
  let slotDragGhost: HTMLElement | null = null;
  let slotDragging = false;
  let slotDragPointerId = -1;

  function cleanupSlotDrag(): void {
    slotDragging = false;
    slotDragSourceIdx = -1;
    slotDragPointerId = -1;
    slotDragGhost?.remove();
    slotDragGhost = null;
    clearDropHighlights();
  }

  function onSlotDocPointerMove(e: PointerEvent): void {
    if (!slotDragging || e.pointerId !== slotDragPointerId) return;
    if (slotDragGhost) {
      slotDragGhost.style.left = `${e.clientX - 26}px`;
      slotDragGhost.style.top = `${e.clientY - 26}px`;
    }
    clearDropHighlights();
    const targetIdx = getSlotAtPoint(e.clientX, e.clientY);
    if (targetIdx !== -1 && targetIdx !== slotDragSourceIdx && targetIdx < currentUnlocked) {
      const slots = row.querySelectorAll<HTMLElement>('.weave-slot');
      slots[targetIdx]?.classList.add('weave-slot--drop-target');
    }
  }

  function onSlotDocPointerUp(e: PointerEvent): void {
    if (!slotDragging || e.pointerId !== slotDragPointerId) return;
    const targetIdx = getSlotAtPoint(e.clientX, e.clientY);
    if (targetIdx !== -1 && targetIdx !== slotDragSourceIdx && targetIdx < currentUnlocked) {
      dispatch({ kind: 'move_weave_slot', fromSlotIndex: slotDragSourceIdx, toSlotIndex: targetIdx });
    }
    cleanupSlotDrag();
    document.removeEventListener('pointermove', onSlotDocPointerMove);
    document.removeEventListener('pointerup', onSlotDocPointerUp);
  }

  // ── Slot builder ───────────────────────────────────────────────────────

  function buildSlotSvg(weave: CraftedWeaveData, size = 38): SVGSVGElement {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg') as SVGSVGElement;
    svg.setAttribute('width', String(size));
    svg.setAttribute('height', String(size));
    svg.setAttribute('viewBox', '0 0 36 36');

    const affixes = weave.affixes;
    const tiers = affixes.map(a => a.tierId);
    if (tiers.length === 0) tiers.push('sand');

    // Multi-segment color fill based on tiers
    const segCount = tiers.length;
    for (let i = 0; i < segCount; i++) {
      const color = TIER_BY_ID.get(tiers[i]!)?.color ?? '#888';
      const startAngle = (i / segCount) * 2 * Math.PI - Math.PI / 2;
      const endAngle = ((i + 1) / segCount) * 2 * Math.PI - Math.PI / 2;
      const r = 14;
      const cx = 18, cy = 18;
      const x1 = cx + r * Math.cos(startAngle);
      const y1 = cy + r * Math.sin(startAngle);
      const x2 = cx + r * Math.cos(endAngle);
      const y2 = cy + r * Math.sin(endAngle);
      const largeArc = segCount === 1 ? 1 : (endAngle - startAngle > Math.PI ? 1 : 0);

      const path = document.createElementNS(ns, 'path');
      const d = segCount === 1
        ? `M ${cx} ${cy} m -${r} 0 a ${r} ${r} 0 1 1 ${2 * r} 0 a ${r} ${r} 0 1 1 ${-2 * r} 0`
        : `M ${cx} ${cy} L ${x1} ${y1} A ${r} ${r} 0 ${largeArc} 1 ${x2} ${y2} Z`;
      path.setAttribute('d', d);
      path.setAttribute('fill', `${color}cc`);
      svg.appendChild(path);
    }

    // Center circle
    const circle = document.createElementNS(ns, 'circle');
    circle.setAttribute('cx', '18');
    circle.setAttribute('cy', '18');
    circle.setAttribute('r', '6');
    circle.setAttribute('fill', 'rgba(0,0,0,0.5)');
    circle.setAttribute('stroke', 'rgba(255,255,255,0.2)');
    circle.setAttribute('stroke-width', '1');
    svg.appendChild(circle);

    return svg;
  }

  function buildSlot(index: number): HTMLElement {
    const isUnlocked = index < currentUnlocked;
    const weaveId = currentSlots[index] ?? null;
    const weave = weaveId ? currentWeaves.find(w => w.id === weaveId) : null;

    const slot = document.createElement('div');
    slot.className = 'weave-slot';
    slot.dataset.slotIndex = String(index);

    if (!isUnlocked) {
      slot.classList.add('weave-slot--locked');
      slot.setAttribute('aria-label', 'Locked weave slot');
      slot.textContent = '🔒';
      return slot;
    }

    if (!weave) {
      // Empty unlocked slot
      slot.classList.add('weave-slot--empty');
      slot.style.backgroundImage = TRIQUETRA_BG.split(' ')[0];
      slot.style.backgroundPosition = 'center';
      slot.style.backgroundSize = '70%';
      slot.style.backgroundRepeat = 'no-repeat';
      slot.setAttribute('aria-label', 'Empty weave slot');
      // Highlight when a drag is active
      if (activeDragWeaveId) {
        slot.classList.add('weave-slot--valid-drop');
      }
      // Accept drops from inventory drag
      slot.addEventListener('pointerup', (e: PointerEvent) => {
        if (activeDragWeaveId) {
          e.stopPropagation();
          dispatch({ kind: 'equip_weave_to_slot', weaveId: activeDragWeaveId, slotIndex: index });
        }
      });
      return slot;
    }

    // Occupied slot
    slot.classList.add('weave-slot--occupied');
    const svg = buildSlotSvg(weave, 38);
    slot.appendChild(svg);

    // Drag: slot-to-slot reorder
    let downTs = 0;
    let downX = 0, downY = 0;
    let thisDragging = false;

    slot.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      downTs = e.timeStamp;
      downX = e.clientX;
      downY = e.clientY;
      thisDragging = false;
    });

    slot.addEventListener('pointermove', (e: PointerEvent) => {
      if (slotDragging && slotDragPointerId !== e.pointerId) return;
      if (thisDragging || slotDragging) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 6) {
        thisDragging = true;
        slotDragging = true;
        slotDragSourceIdx = index;
        slotDragPointerId = e.pointerId;
        dismissPopup();

        const ghost = document.createElement('div');
        ghost.className = 'weave-slot-drag-ghost';
        ghost.appendChild(buildSlotSvg(weave, 52));
        ghost.style.left = `${e.clientX - 26}px`;
        ghost.style.top = `${e.clientY - 26}px`;
        document.body.appendChild(ghost);
        slotDragGhost = ghost;

        document.addEventListener('pointermove', onSlotDocPointerMove);
        document.addEventListener('pointerup', onSlotDocPointerUp);
      }
    });

    slot.addEventListener('pointerup', (e: PointerEvent) => {
      if (!thisDragging && e.timeStamp - downTs < 400) {
        showWeavePopup(weave, slot, index);
      }
      thisDragging = false;
    });

    return slot;
  }

  function render(): void {
    row.innerHTML = '';
    for (let i = 0; i < TOTAL_WEAVE_SLOTS; i++) {
      row.appendChild(buildSlot(i));
    }
  }

  // ── Public interface ───────────────────────────────────────────────────

  function update(
    equippedWeaveSlots: (string | null)[],
    craftedWeaves: readonly CraftedWeaveData[],
    unlockedCount: number,
  ): void {
    currentSlots = equippedWeaveSlots.slice(0, 6);
    currentWeaves = craftedWeaves;
    currentUnlocked = unlockedCount;
    render();
  }

  function setDragActive(weaveId: string | null): void {
    activeDragWeaveId = weaveId;
    // Refresh empty-slot highlight state without full re-render
    row.querySelectorAll<HTMLElement>('.weave-slot--empty').forEach(slotEl => {
      slotEl.classList.toggle('weave-slot--valid-drop', weaveId !== null);
    });
  }

  render();
  return { element, update, setDragActive };
}
