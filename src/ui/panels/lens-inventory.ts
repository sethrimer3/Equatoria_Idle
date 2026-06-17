/**
 * lens-inventory.ts — Lens inventory panel.
 *
 * Renders crafted lenses with attach-to-weapon flow.
 * Attach flow: click "Attach" → pick weapon → confirm if replacing existing lens.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { CraftedLensData, LensEffect } from '../../data/rpg/lens-types';
import type { CraftedWeaponData } from '../../data/rpg/crafted-weapon-types';
import { TIER_BY_ID } from '../../data/tiers';
import type { ActionHandler } from '../../input';
import { createMoteIconCanvas, ingredientsToComposition } from '../../render/assets/item-icon-renderer';
import { TIER1_STATUS_MAP } from '../../data/rpg/lens-status-effects';
import { ENEMY_STATUS_DEFS } from '../../data/rpg/status-effect-definitions';

// ─── Rarity colors ────────────────────────────────────────────────

const RARITY_COLOR: Record<string, string> = {
  Common:    '#aaa',
  Uncommon:  '#5f5',
  Rare:      '#55f',
  Epic:      '#c5f',
  Legendary: '#fa0',
  Mythic:    '#f55',
};

// ─── Lens card ────────────────────────────────────────────────────

function buildLensCard(
  lens: CraftedLensData,
  rpgState: RpgSimState,
  dispatch: ActionHandler,
  container: HTMLElement,
): HTMLElement {
  const card = document.createElement('div');
  card.className = 'weapon-store__card';

  // Name row with ingredient tier colors
  const nameRow = document.createElement('div');
  nameRow.className = 'weapon-store__card-name';
  // Dominant ingredient tier color
  const dominantTier = lens.ingredients.reduce((best, cur) =>
    cur.refinedCount > best.refinedCount ? cur : best, lens.ingredients[0] ?? { tierId: 'sand', refinedCount: 0 },
  );
  const dominantColor = TIER_BY_ID.get(dominantTier.tierId)?.color ?? '#aaa';
  nameRow.style.color = dominantColor;
  nameRow.textContent = lens.name;

  const typeBadge = document.createElement('span');
  typeBadge.className = 'weapon-tier-badge';
  typeBadge.style.color = dominantColor;
  typeBadge.style.borderColor = dominantColor + '88';
  typeBadge.textContent = 'Lens';
  nameRow.appendChild(typeBadge);
  card.appendChild(nameRow);

  // Ingredient tier chips
  const ingRow = document.createElement('div');
  ingRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin:4px 0;';
  for (const ing of lens.ingredients) {
    const tier = TIER_BY_ID.get(ing.tierId);
    const chip = document.createElement('span');
    chip.style.cssText = `background:${tier?.color ?? '#555'};color:#000;font-size:0.7em;padding:1px 5px;border-radius:3px;font-weight:600;`;
    chip.textContent = `${tier?.displayName ?? ing.tierId} ×${ing.refinedCount}`;
    ingRow.appendChild(chip);
  }
  card.appendChild(ingRow);

  // Mote symbol icon — same moteIcons sprite used by the loom orbital buttons
  {
    const comp = ingredientsToComposition(lens.ingredients);
    const domTierId = comp[0]?.tierId ?? 'sand';
    const domColorLens = TIER_BY_ID.get(domTierId)?.color ?? '#aaa';
    const iconCanvas = createMoteIconCanvas(domTierId, 36, 36);
    iconCanvas.style.cssText =
      'display:block;margin:4px 0;image-rendering:pixelated;' +
      'filter:drop-shadow(0 0 1px rgba(255,255,255,0.85)) drop-shadow(0 0 4px ' + domColorLens + '88);';
    card.appendChild(iconCanvas);
  }

  // Total mote-weight
  const powerRow = document.createElement('div');
  powerRow.style.cssText = 'font-size:0.72em;color:#aaa;margin:2px 0;';
  powerRow.textContent = `${lens.totalWeightedMoteValue.toLocaleString()} mote-wt`;
  card.appendChild(powerRow);

  // Effects list
  for (const effect of lens.effects) {
    const effRow = buildEffectRow(effect);
    card.appendChild(effRow);
  }

  // Attach button
  const attachBtn = document.createElement('button');
  attachBtn.className = 'weapon-store__btn';
  attachBtn.style.cssText = 'margin-top:6px;background:rgba(80,200,120,0.12);border-color:rgba(80,200,120,0.4);color:#50c878;';
  attachBtn.textContent = 'Attach to Weapon';
  attachBtn.addEventListener('click', () => {
    showWeaponPicker(lens, rpgState, dispatch, container);
  });
  card.appendChild(attachBtn);

  return card;
}

function buildEffectRow(effect: LensEffect): HTMLElement {
  const row = document.createElement('div');
  row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.78em;margin:2px 0;';

  const rarityColor = RARITY_COLOR[effect.rarity] ?? '#aaa';
  const tierColor = TIER_BY_ID.get(effect.tierId)?.color ?? '#aaa';

  // "T1" / "T2" / "T3" tier badge
  const tierNumChip = document.createElement('span');
  tierNumChip.style.cssText = 'background:rgba(255,255,255,0.12);color:#ddd;font-size:0.68em;padding:0 4px;border-radius:2px;font-weight:700;white-space:nowrap;';
  tierNumChip.textContent = `T${effect.effectTier}`;
  row.appendChild(tierNumChip);

  // Tier color chip
  const tierChip = document.createElement('span');
  tierChip.style.cssText = `background:${tierColor};color:#000;font-size:0.68em;padding:0 3px;border-radius:2px;font-weight:600;white-space:nowrap;`;
  tierChip.textContent = TIER_BY_ID.get(effect.tierId)?.displayName ?? effect.tierId;
  row.appendChild(tierChip);

  const rarityBadge = document.createElement('span');
  rarityBadge.style.cssText = `color:${rarityColor};font-size:0.75em;font-weight:700;white-space:nowrap;`;
  rarityBadge.textContent = effect.rarity;
  row.appendChild(rarityBadge);

  const nameEl = document.createElement('span');
  nameEl.style.color = '#ccc';
  nameEl.textContent = `${effect.name}  ×${effect.magnitude.toFixed(1)}`;
  row.appendChild(nameEl);

  // T1 effects — show the status key as a colored chip
  if (effect.effectTier === 1) {
    const statusKey = TIER1_STATUS_MAP[effect.tierId];
    if (statusKey) {
      const def = ENEMY_STATUS_DEFS[statusKey];
      if (def) {
        const statusChip = document.createElement('span');
        statusChip.style.cssText =
          `font-size:0.72em;padding:0 4px;border-radius:3px;` +
          `border:1px solid ${def.color}66;color:${def.color};white-space:nowrap;`;
        statusChip.textContent = def.name;
        statusChip.title = def.description;
        row.appendChild(statusChip);
      }
    }
  }

  if (!effect.isApplied) {
    const note = document.createElement('span');
    note.style.cssText = 'color:#666;font-size:0.72em;font-style:italic;';
    note.textContent = '(not yet applied)';
    row.appendChild(note);
  }

  return row;
}

// ─── Weapon picker overlay ────────────────────────────────────────

function showWeaponPicker(
  lens: CraftedLensData,
  rpgState: RpgSimState,
  dispatch: ActionHandler,
  container: HTMLElement,
): void {
  // Remove any existing picker
  container.querySelector('.lens-weapon-picker')?.remove();

  const picker = document.createElement('div');
  picker.className = 'lens-weapon-picker';
  picker.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.7);' +
    'display:flex;align-items:center;justify-content:center;z-index:9999;';

  const box = document.createElement('div');
  box.style.cssText =
    'background:#1a1128;border:1px solid rgba(80,200,120,0.4);border-radius:8px;' +
    'padding:16px;max-width:400px;width:90%;max-height:80vh;overflow-y:auto;';

  const title = document.createElement('div');
  title.style.cssText = 'color:#50c878;font-weight:700;font-size:0.95em;margin-bottom:10px;';
  title.textContent = `Attach "${lens.name}" to which weapon?`;
  box.appendChild(title);

  if (rpgState.craftedWeapons.length === 0) {
    const none = document.createElement('div');
    none.style.cssText = 'color:#888;font-size:0.85em;margin:8px 0;';
    none.textContent = 'No crafted weapons. Craft a weapon first.';
    box.appendChild(none);
  }

  for (const weapon of rpgState.craftedWeapons) {
    const weaponBtn = buildWeaponPickerBtn(weapon, lens, rpgState, dispatch, picker);
    box.appendChild(weaponBtn);
  }

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'weapon-store__btn';
  cancelBtn.style.cssText = 'margin-top:10px;width:100%;';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => picker.remove());
  box.appendChild(cancelBtn);

  picker.appendChild(box);
  // Clicking backdrop closes
  picker.addEventListener('click', (e) => { if (e.target === picker) picker.remove(); });
  // Append to body so it overlays everything
  document.body.appendChild(picker);
}

function buildWeaponPickerBtn(
  weapon: CraftedWeaponData,
  lens: CraftedLensData,
  rpgState: RpgSimState,
  dispatch: ActionHandler,
  pickerOverlay: HTMLElement,
): HTMLElement {
  const btn = document.createElement('div');
  btn.style.cssText =
    'background:rgba(255,255,255,0.05);border:1px solid rgba(255,255,255,0.15);border-radius:5px;' +
    'padding:8px 10px;margin-bottom:6px;cursor:pointer;transition:background 0.15s;';

  const hasExistingLens = weapon.attachedLens != null;
  const domColor = TIER_BY_ID.get(weapon.dominantTierId)?.color ?? '#aaa';

  const nameEl = document.createElement('div');
  nameEl.style.cssText = `color:${domColor};font-weight:600;font-size:0.88em;`;
  nameEl.textContent = weapon.name;
  btn.appendChild(nameEl);

  const lensStatusEl = document.createElement('div');
  lensStatusEl.style.cssText = 'font-size:0.75em;margin-top:2px;';
  if (hasExistingLens) {
    lensStatusEl.style.color = '#f88';
    lensStatusEl.textContent = `Lens: ${weapon.attachedLens!.name} (will be destroyed)`;
  } else {
    lensStatusEl.style.color = '#5f5';
    lensStatusEl.textContent = 'Lens: Empty';
  }
  btn.appendChild(lensStatusEl);

  btn.addEventListener('mouseenter', () => { btn.style.background = 'rgba(255,255,255,0.10)'; });
  btn.addEventListener('mouseleave', () => { btn.style.background = 'rgba(255,255,255,0.05)'; });

  btn.addEventListener('click', () => {
    pickerOverlay.remove();
    if (hasExistingLens) {
      showReplaceConfirmation(lens, weapon, rpgState, dispatch);
    } else {
      dispatch({ kind: 'attach_lens_to_weapon', lensId: lens.id, weaponId: weapon.id });
    }
  });

  return btn;
}

function showReplaceConfirmation(
  newLens: CraftedLensData,
  weapon: CraftedWeaponData,
  _rpgState: RpgSimState,
  dispatch: ActionHandler,
): void {
  const overlay = document.createElement('div');
  overlay.style.cssText =
    'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.8);' +
    'display:flex;align-items:center;justify-content:center;z-index:10000;';

  const box = document.createElement('div');
  box.style.cssText =
    'background:#1a0a0a;border:2px solid rgba(255,80,80,0.5);border-radius:8px;' +
    'padding:20px;max-width:380px;width:90%;';

  const title = document.createElement('div');
  title.style.cssText = 'color:#f88;font-weight:700;font-size:1em;margin-bottom:12px;';
  title.textContent = 'Replace Lens — This Cannot Be Undone';
  box.appendChild(title);

  const msg = document.createElement('div');
  msg.style.cssText = 'color:#ccc;font-size:0.87em;margin-bottom:14px;line-height:1.5;';
  const oldName = weapon.attachedLens!.name;
  msg.innerHTML =
    `The lens <strong style="color:#f88">${oldName}</strong> attached to <strong style="color:#aaa">${weapon.name}</strong> ` +
    `will be <strong style="color:#f88">permanently destroyed</strong> and replaced with ` +
    `<strong style="color:#5f5">${newLens.name}</strong>.<br><br>` +
    `Lenses cannot be recovered once destroyed.`;
  box.appendChild(msg);

  const btnRow = document.createElement('div');
  btnRow.style.cssText = 'display:flex;gap:8px;';

  const confirmBtn = document.createElement('button');
  confirmBtn.className = 'weapon-store__btn';
  confirmBtn.style.cssText = 'flex:1;background:rgba(200,50,50,0.2);border-color:rgba(200,50,50,0.6);color:#f88;';
  confirmBtn.textContent = 'Destroy old lens & attach new one';
  confirmBtn.addEventListener('click', () => {
    overlay.remove();
    dispatch({ kind: 'attach_lens_to_weapon', lensId: newLens.id, weaponId: weapon.id });
  });

  const cancelBtn = document.createElement('button');
  cancelBtn.className = 'weapon-store__btn';
  cancelBtn.style.cssText = 'flex:1;';
  cancelBtn.textContent = 'Cancel';
  cancelBtn.addEventListener('click', () => overlay.remove());

  btnRow.appendChild(confirmBtn);
  btnRow.appendChild(cancelBtn);
  box.appendChild(btnRow);

  overlay.appendChild(box);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
  document.body.appendChild(overlay);
}

// ─── Public builder ───────────────────────────────────────────────

export function buildLensInventorySection(rpgState: RpgSimState, dispatch: ActionHandler): HTMLElement {
  const container = document.createElement('div');
  container.className = 'lens-inventory';

  const lenses = rpgState.craftedLenses;

  if (lenses.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#888;font-size:0.85em;text-align:center;padding:12px;';
    empty.textContent = 'No lenses crafted yet. Select mote types above and craft a lens.';
    container.appendChild(empty);
    return container;
  }

  // ── Local drag-and-drop ordering ──────────────────────────────────────────

  const lensByIdMap = new Map(lenses.map(l => [l.id, l]));
  let localOrder: string[] = lenses.map(l => l.id);

  let draggingLensId: string | null = null;
  let activeDragPointerId = -1;
  let dragGhost: HTMLElement | null = null;
  let lastDragOverLensId: string | null = null;

  function getLensCardAtPoint(x: number, y: number): string | null {
    const cards = container.querySelectorAll<HTMLElement>('.lens-card[data-lens-id]');
    for (const card of Array.from(cards)) {
      const r = card.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return card.dataset.lensId ?? null;
      }
    }
    return null;
  }

  function clearLensHighlight(): void {
    container.querySelectorAll('.crafting-card--drag-over')
      .forEach(el => el.classList.remove('crafting-card--drag-over'));
    lastDragOverLensId = null;
  }

  function cleanupLensDrag(): void {
    dragGhost?.remove();
    dragGhost = null;
    draggingLensId = null;
    activeDragPointerId = -1;
    clearLensHighlight();
  }

  function onDocLensPointerMove(e: PointerEvent): void {
    if (e.pointerId !== activeDragPointerId) return;
    if (dragGhost) {
      dragGhost.style.left = `${e.clientX - 60}px`;
      dragGhost.style.top = `${e.clientY - 20}px`;
    }
    const targetId = getLensCardAtPoint(e.clientX, e.clientY);
    const isValidTarget = targetId !== null && targetId !== draggingLensId;
    const newHighlight = isValidTarget ? targetId : null;
    if (lastDragOverLensId !== newHighlight) {
      clearLensHighlight();
      if (isValidTarget && targetId) {
        container.querySelector<HTMLElement>(`[data-lens-id="${targetId}"]`)
          ?.classList.add('crafting-card--drag-over');
        lastDragOverLensId = targetId;
      }
    }
  }

  function onDocLensPointerUp(e: PointerEvent): void {
    if (e.pointerId !== activeDragPointerId) return;
    const targetId = getLensCardAtPoint(e.clientX, e.clientY);
    if (targetId && targetId !== draggingLensId && draggingLensId) {
      const fromIdx = localOrder.indexOf(draggingLensId);
      const toIdx = localOrder.indexOf(targetId);
      if (fromIdx !== -1 && toIdx !== -1) {
        localOrder[fromIdx] = targetId;
        localOrder[toIdx] = draggingLensId;
        renderCards();
      }
    }
    cleanupLensDrag();
    document.removeEventListener('pointermove', onDocLensPointerMove);
    document.removeEventListener('pointerup', onDocLensPointerUp);
  }

  function addLensDrag(card: HTMLElement, lensId: string): void {
    card.dataset.lensId = lensId;
    card.style.cursor = 'grab';
    card.style.touchAction = 'none';
    card.style.userSelect = 'none';

    let downX = 0, downY = 0;
    let thisDragging = false;

    card.addEventListener('pointerdown', (e: PointerEvent) => {
      if (e.button !== 0) return;
      downX = e.clientX;
      downY = e.clientY;
      thisDragging = false;
    });

    card.addEventListener('pointermove', (e: PointerEvent) => {
      if (thisDragging || draggingLensId) return;
      if (Math.hypot(e.clientX - downX, e.clientY - downY) > 8) {
        thisDragging = true;
        draggingLensId = lensId;
        activeDragPointerId = e.pointerId;
        card.setPointerCapture(e.pointerId);

        const ghost = document.createElement('div');
        ghost.style.cssText =
          'position:fixed;pointer-events:none;z-index:10000;opacity:0.88;' +
          'background:rgba(6,4,22,0.95);border:1px solid rgba(200,180,255,0.5);' +
          'border-radius:4px;padding:4px 12px;font-size:0.8em;color:#c8b4ff;';
        ghost.textContent = lensByIdMap.get(lensId)?.name ?? lensId;
        ghost.style.left = `${e.clientX - 60}px`;
        ghost.style.top = `${e.clientY - 20}px`;
        document.body.appendChild(ghost);
        dragGhost = ghost;

        document.addEventListener('pointermove', onDocLensPointerMove);
        document.addEventListener('pointerup', onDocLensPointerUp);
      }
    });

    card.addEventListener('pointerup', () => { thisDragging = false; });
    card.addEventListener('pointerleave', () => {
      if (!thisDragging) return;
    });
  }

  function renderCards(): void {
    container.innerHTML = '';
    for (const id of localOrder) {
      const lens = lensByIdMap.get(id);
      if (!lens) continue;
      const card = buildLensCard(lens, rpgState, dispatch, container);
      card.classList.add('lens-card');
      addLensDrag(card, id);
      container.appendChild(card);
    }
  }

  renderCards();
  return container;
}
