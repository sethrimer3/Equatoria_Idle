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

import type { CraftedWeaveData, WeaveTierEffect, WeaveEffectRoll } from '../../data/rpg/weave-types';
import { getWeaveEffectDef } from '../../data/rpg/weave-passive-effects';
import type { WeaveSlotsPanel } from './weave-slots';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { ActionHandler } from '../../input';
import { TIER_BY_ID } from '../../data/tiers';
import { createMoteIconCanvas, ingredientsToComposition } from '../../render/assets/item-icon-renderer';
import { getEquippedWeaveModifiers } from '../../data/rpg/equipment-modifiers';
import {
  getWeaveHighestRarity, getDismantleDust, getRefineCost,
  MAX_REFINEMENT_LEVEL, REFINEMENT_RESOURCE_NAME,
} from '../../data/rpg/item-refinement';
import { getWeaveEquipComparison, getRefinementLabel, getRefinementMultiplierLabel } from '../../data/rpg/equip-helpers';

export interface WeaveInventoryPanel {
  element: HTMLElement;
  update(craftedWeaves: readonly CraftedWeaveData[], equippedSlots: (string | null)[], rpgState?: RpgSimState): void;
}

export function createWeaveInventoryPanel(slotsPanel: WeaveSlotsPanel, dispatch?: ActionHandler): WeaveInventoryPanel {
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
  let localOrder: string[] = [];
  let currentRpgState: RpgSimState | undefined;

  // ── Resonance Dust header ──────────────────────────────────────────────
  const dustHeader = document.createElement('div');
  dustHeader.className = 'weave-inventory__dust-header';
  dustHeader.style.cssText = 'display:flex;align-items:center;gap:6px;padding:4px 0 8px;font-size:0.8em;color:#e6c850;';
  const dustIcon = document.createElement('span');
  dustIcon.textContent = '✦';
  const dustLabel = document.createElement('span');
  dustLabel.className = 'weave-inventory__dust-label';
  dustLabel.textContent = `${REFINEMENT_RESOURCE_NAME}: 0`;
  dustHeader.appendChild(dustIcon);
  dustHeader.appendChild(dustLabel);
  element.insertBefore(dustHeader, emptyMsg);

  // ── Drag state ─────────────────────────────────────────────────────────

  let dragGhost: HTMLElement | null = null;
  let draggingWeaveId: string | null = null;
  let activeDragPointerId = -1;
  let lastDragOverCardId: string | null = null;

  function getCardIdAtPoint(x: number, y: number): string | null {
    const cards = list.querySelectorAll<HTMLElement>('.weave-card[data-weave-id]');
    for (const card of Array.from(cards)) {
      const r = card.getBoundingClientRect();
      if (x >= r.left && x <= r.right && y >= r.top && y <= r.bottom) {
        return card.dataset.weaveId ?? null;
      }
    }
    return null;
  }

  function clearCardHighlight(): void {
    list.querySelectorAll('.weave-card--drag-over')
      .forEach(el => el.classList.remove('weave-card--drag-over'));
    lastDragOverCardId = null;
  }

  function cleanupDrag(): void {
    dragGhost?.remove();
    dragGhost = null;
    draggingWeaveId = null;
    activeDragPointerId = -1;
    clearCardHighlight();
    slotsPanel.setDragActive(null);
  }

  function onDocPointerMove(e: PointerEvent): void {
    if (e.pointerId !== activeDragPointerId) return;
    if (dragGhost) {
      dragGhost.style.left = `${e.clientX - 60}px`;
      dragGhost.style.top = `${e.clientY - 20}px`;
    }
    // Highlight card drop target
    const targetId = getCardIdAtPoint(e.clientX, e.clientY);
    const isValidTarget = targetId !== null && targetId !== draggingWeaveId;
    const newHighlight = isValidTarget ? targetId : null;
    if (lastDragOverCardId !== newHighlight) {
      clearCardHighlight();
      if (isValidTarget && targetId) {
        list.querySelector<HTMLElement>(`[data-weave-id="${targetId}"]`)
          ?.classList.add('weave-card--drag-over');
        lastDragOverCardId = targetId;
      }
    }
  }

  function onDocPointerUp(e: PointerEvent): void {
    if (e.pointerId !== activeDragPointerId) return;
    // Card-to-card swap
    const targetId = getCardIdAtPoint(e.clientX, e.clientY);
    if (targetId && targetId !== draggingWeaveId && draggingWeaveId) {
      const fromIdx = localOrder.indexOf(draggingWeaveId);
      const toIdx = localOrder.indexOf(targetId);
      if (fromIdx !== -1 && toIdx !== -1) {
        localOrder[fromIdx] = targetId;
        localOrder[toIdx] = draggingWeaveId;
        render();
      }
    }
    cleanupDrag();
    document.removeEventListener('pointermove', onDocPointerMove);
    document.removeEventListener('pointerup', onDocPointerUp);
  }

  // ── Rarity colors (mirrors lens-inventory) ────────────────────────────
  const RARITY_COLOR: Record<string, string> = {
    Common: '#aaa',
    Uncommon: '#5f5',
    Rare: '#55f',
    Epic: '#c5f',
    Legendary: '#fa0',
    Mythic: '#f55',
  };

  const RARITY_RANK: Record<string, number> = {
    Mythic: 6,
    Legendary: 5,
    Epic: 4,
    Rare: 3,
    Uncommon: 2,
    Common: 1,
  };

  function getWeaveSortScore(weave: CraftedWeaveData): number {
    const highestRarity = Math.max(
      0,
      ...weave.affixes.map(affix => RARITY_RANK[affix.rarity] ?? 0),
      ...weave.tierEffects.map(effect => RARITY_RANK[effect.rarity] ?? 0),
    );
    return highestRarity * 100 + Math.log10(weave.totalWeightedMoteValue + 1);
  }

  // ── Weave tier effect row (STUB display) ──────────────────────────────

  function buildTierEffectRow(effect: WeaveTierEffect): HTMLElement {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.78em;margin:2px 0;';

    const rarityColor = RARITY_COLOR[effect.rarity] ?? '#aaa';
    const tierColor = TIER_BY_ID.get(effect.tierId)?.color ?? '#aaa';

    // "T1" / "T2" / "T3" badge
    const tierNumChip = document.createElement('span');
    tierNumChip.style.cssText = 'background:rgba(255,255,255,0.12);color:#ddd;font-size:0.68em;padding:0 4px;border-radius:2px;font-weight:700;white-space:nowrap;';
    tierNumChip.textContent = `T${effect.effectTier}`;
    row.appendChild(tierNumChip);

    // Mote tier color chip
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

    // All weave tier effects are stubs — show clearly
    const stubNote = document.createElement('span');
    stubNote.style.cssText = 'color:#888;font-size:0.72em;font-style:italic;';
    stubNote.title = effect.description;
    stubNote.textContent = '[STUB]';
    row.appendChild(stubNote);

    return row;
  }

  // ── Passive effect row ─────────────────────────────────────────────────

  function buildEffectRow(effect: WeaveEffectRoll): HTMLElement | null {
    const def = getWeavePassiveEffectDef(effect.id);
    if (!def) return null;

    const row = document.createElement('div');
    row.style.cssText = 'display:flex;align-items:center;gap:6px;font-size:0.78em;margin:2px 0;';

    const nameEl = document.createElement('span');
    nameEl.style.color = '#c8e8ff';
    nameEl.style.fontWeight = '600';
    nameEl.textContent = `${def.displayName}:`;
    row.appendChild(nameEl);

    const descEl = document.createElement('span');
    descEl.style.color = '#aad4ff';
    descEl.textContent = def.description(effect.value);
    row.appendChild(descEl);

    return row;
  }

  // ── Card builder ───────────────────────────────────────────────────────

  function buildWeaveCard(weave: CraftedWeaveData): HTMLElement {
    const card = document.createElement('div');
    card.className = 'weave-card';
    card.dataset.weaveId = weave.id;
    if (equippedIds.has(weave.id)) {
      card.classList.add('weave-card--equipped');
    }
    card.title = weave.affixes.map(a => `${a.label} +${a.value.toFixed(1)}${a.unit} [${a.rarity}]`).join('\n') || 'Unknown Item';

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

    const previewMods = getEquippedWeaveModifiers([weave.id], [weave]);
    const previewParts = [
      previewMods.weaponDamagePct > 0 ? `+${previewMods.weaponDamagePct.toFixed(1)}% DMG` : '',
      previewMods.cooldownPct > 0 ? `-${previewMods.cooldownPct.toFixed(1)}% CD` : '',
      previewMods.critChancePct > 0 ? `+${previewMods.critChancePct.toFixed(1)}% CRIT` : '',
      previewMods.critDamagePct > 0 ? `+${previewMods.critDamagePct.toFixed(1)}% CRIT DMG` : '',
      previewMods.statusChancePct > 0 ? `+${previewMods.statusChancePct.toFixed(1)}% STATUS` : '',
      previewMods.playerDefensePct > 0 ? `+${previewMods.playerDefensePct.toFixed(1)}% DEF` : '',
    ].filter(Boolean);
    if (previewParts.length > 0) {
      const preview = document.createElement('div');
      preview.className = 'weave-card__preview';
      preview.textContent = previewParts.join(' / ');
      card.appendChild(preview);
    }

    // Animated mote icon — same moteIcons sprite used by the loom orbital buttons
    {
      const comp = ingredientsToComposition(weave.ingredients);
      const domTierId = comp[0]?.tierId ?? 'sand';
      const domColor = TIER_BY_ID.get(domTierId)?.color ?? '#aaa';
      const iconCanvas = createMoteIconCanvas(domTierId, 36, 36);
      iconCanvas.style.cssText =
        'display:block;margin:4px 0;image-rendering:pixelated;' +
        'filter:drop-shadow(0 0 1px rgba(255,255,255,0.85)) drop-shadow(0 0 4px ' + domColor + '88);';
      card.appendChild(iconCanvas);
    }

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

    // Tier effects section (STUB)
    if (weave.tierEffects.length > 0) {
      const tierEffectsHeader = document.createElement('div');
      tierEffectsHeader.style.cssText = 'font-size:0.7em;color:#666;margin:4px 0 2px;letter-spacing:0.05em;';
      tierEffectsHeader.textContent = 'TIER EFFECTS (STUB)';
      card.appendChild(tierEffectsHeader);

      for (const effect of weave.tierEffects) {
        card.appendChild(buildTierEffectRow(effect));
      }
    }

    // ── Passive effects section ───────────────────────────────────────────
    const activeEffects = (weave.effects ?? []).filter(e => getWeavePassiveEffectDef(e.id) !== null);
    if (activeEffects.length > 0) {
      const effectsHeader = document.createElement('div');
      effectsHeader.style.cssText = 'font-size:0.7em;color:#6699bb;margin:4px 0 2px;letter-spacing:0.05em;text-transform:uppercase;';
      effectsHeader.textContent = 'Effects';
      card.appendChild(effectsHeader);

      for (const effect of activeEffects) {
        const row = buildEffectRow(effect);
        if (row) card.appendChild(row);
      }
    }

    // ── Refinement row ────────────────────────────────────────────────────
    const refLevel = weave.refinementLevel ?? 0;
    const refineRow = document.createElement('div');
    refineRow.style.cssText = 'display:flex;align-items:center;gap:6px;margin:4px 0 2px;';

    const refLabel = document.createElement('span');
    refLabel.style.cssText = 'font-size:0.72em;color:#e6c850;font-weight:700;';
    refLabel.textContent = `${getRefinementLabel(refLevel)} ${getRefinementMultiplierLabel(refLevel)}`;
    refineRow.appendChild(refLabel);

    if (refLevel < MAX_REFINEMENT_LEVEL && dispatch) {
      const rarity = getWeaveHighestRarity(weave);
      const cost = getRefineCost(rarity, refLevel + 1);
      const canAfford = (currentRpgState?.resonanceDust ?? 0) >= cost;
      const refineBtn = document.createElement('button');
      refineBtn.className = 'weave-card__action-btn';
      refineBtn.style.cssText =
        `font-size:0.68em;padding:1px 6px;border-radius:3px;border:1px solid;cursor:pointer;background:none;` +
        (canAfford
          ? 'color:#e6c850;border-color:rgba(230,200,80,0.4);'
          : 'color:#666;border-color:#333;cursor:not-allowed;');
      refineBtn.textContent = `Refine (${cost} Dust)`;
      refineBtn.disabled = !canAfford;
      refineBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        dispatch({ kind: 'refine_weave', weaveId: weave.id });
      });
      refineRow.appendChild(refineBtn);
    } else if (refLevel >= MAX_REFINEMENT_LEVEL) {
      const maxEl = document.createElement('span');
      maxEl.style.cssText = 'font-size:0.68em;color:#666;font-style:italic;';
      maxEl.textContent = '(max)';
      refineRow.appendChild(maxEl);
    }
    card.appendChild(refineRow);

    // ── Stat comparison preview ───────────────────────────────────────────
    if (currentRpgState) {
      const comparisons = getWeaveEquipComparison(currentRpgState, weave);
      const relevantComps = comparisons.filter(c => Math.abs(c.delta) > 0.05);
      if (relevantComps.length > 0) {
        const compRow = document.createElement('div');
        compRow.style.cssText = 'display:flex;gap:4px;flex-wrap:wrap;margin:2px 0;';
        for (const c of relevantComps) {
          const chip = document.createElement('span');
          chip.style.cssText =
            `font-size:0.65em;padding:1px 4px;border-radius:3px;white-space:nowrap;` +
            (c.better ? 'color:#5f5;background:rgba(80,200,80,0.1);' :
             c.worse  ? 'color:#f88;background:rgba(200,80,80,0.1);' : 'color:#aaa;');
          const sign = c.delta > 0 ? '+' : '';
          chip.textContent = `${c.label} ${sign}${c.delta.toFixed(1)}`;
          compRow.appendChild(chip);
        }
        card.appendChild(compRow);
      }
    }

    // ── Dismantle action ─────────────────────────────────────────────────
    if (dispatch) {
      const isEquipped = equippedIds.has(weave.id);
      const dismantleRow = document.createElement('div');
      dismantleRow.style.cssText = 'margin-top:4px;';
      const rarity = getWeaveHighestRarity(weave);
      const dustYield = getDismantleDust(rarity);
      const dismantleBtn = document.createElement('button');
      dismantleBtn.style.cssText =
        `font-size:0.68em;padding:1px 6px;border-radius:3px;border:1px solid rgba(200,100,60,0.4);` +
        `background:none;color:#e08060;cursor:pointer;` +
        (isEquipped ? 'opacity:0.45;' : '');
      dismantleBtn.textContent = isEquipped
        ? `Dismantle (+${dustYield} Dust) — unequip first`
        : `Dismantle (+${dustYield} Dust)`;
      dismantleBtn.disabled = isEquipped;
      dismantleBtn.title = isEquipped ? 'Unequip this weave before dismantling.' : '';
      dismantleBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        showWeaveDismantleConfirm(weave, dustYield, dispatch);
      });
      dismantleRow.appendChild(dismantleBtn);
      card.appendChild(dismantleRow);
    }

    // ── Reforge preview ───────────────────────────────────────────────────
    const reforgeNote = document.createElement('div');
    reforgeNote.style.cssText = 'font-size:0.65em;color:#444;margin-top:3px;font-style:italic;';
    reforgeNote.title = 'Reforging will reroll secondary stats — coming later.';
    reforgeNote.textContent = 'Reforge: coming later';
    card.appendChild(reforgeNote);

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

  function showWeaveDismantleConfirm(weave: CraftedWeaveData, dustYield: number, dispatchFn: ActionHandler): void {
    const overlay = document.createElement('div');
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.75);' +
      'display:flex;align-items:center;justify-content:center;z-index:10001;';

    const box = document.createElement('div');
    box.style.cssText =
      'background:#160e22;border:1px solid rgba(200,100,60,0.5);border-radius:8px;' +
      'padding:18px;max-width:340px;width:90%;';

    const title = document.createElement('div');
    title.style.cssText = 'color:#e08060;font-weight:700;margin-bottom:10px;';
    title.textContent = `Dismantle "${weave.name}"?`;
    box.appendChild(title);

    const msg = document.createElement('div');
    msg.style.cssText = 'color:#aaa;font-size:0.86em;margin-bottom:14px;line-height:1.5;';
    msg.textContent = `This weave will be permanently destroyed. You will receive ${dustYield} ${REFINEMENT_RESOURCE_NAME}.`;
    box.appendChild(msg);

    const btnRow = document.createElement('div');
    btnRow.style.cssText = 'display:flex;gap:8px;';

    const confirmBtn = document.createElement('button');
    confirmBtn.className = 'weave-card__action-btn';
    confirmBtn.style.cssText =
      'flex:1;padding:6px 10px;border-radius:4px;border:1px solid rgba(200,100,60,0.6);' +
      'background:rgba(200,100,60,0.2);color:#e08060;cursor:pointer;';
    confirmBtn.textContent = `Dismantle (+${dustYield} Dust)`;
    confirmBtn.addEventListener('click', () => {
      overlay.remove();
      dispatchFn({ kind: 'dismantle_weave', weaveId: weave.id });
    });

    const cancelBtn = document.createElement('button');
    cancelBtn.style.cssText =
      'flex:1;padding:6px 10px;border-radius:4px;border:1px solid #444;background:none;color:#aaa;cursor:pointer;';
    cancelBtn.textContent = 'Cancel';
    cancelBtn.addEventListener('click', () => overlay.remove());

    btnRow.appendChild(confirmBtn);
    btnRow.appendChild(cancelBtn);
    box.appendChild(btnRow);
    overlay.appendChild(box);
    overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.remove(); });
    document.body.appendChild(overlay);
  }

  function render(): void {
    list.innerHTML = '';
    const isEmpty = currentWeaves.length === 0;
    emptyMsg.style.display = isEmpty ? '' : 'none';

    const weaveById = new Map(currentWeaves.map(w => [w.id, w]));
    for (const id of localOrder) {
      const weave = weaveById.get(id);
      if (weave) list.appendChild(buildWeaveCard(weave));
    }
  }

  function update(craftedWeaves: readonly CraftedWeaveData[], equippedSlots: (string | null)[], rpgState?: RpgSimState): void {
    currentWeaves = craftedWeaves;
    equippedIds = new Set(equippedSlots.filter((id): id is string => id !== null));
    currentRpgState = rpgState;
    dustLabel.textContent = `${REFINEMENT_RESOURCE_NAME}: ${rpgState?.resonanceDust ?? 0}`;

    // Sync localOrder: remove deleted, append new sorted by equipped status, rarity, then power.
    const existingIds = new Set(craftedWeaves.map(w => w.id));
    localOrder = localOrder.filter(id => existingIds.has(id));
    const orderSet = new Set(localOrder);
    const sortedNewWeaves = [...craftedWeaves].sort((a, b) => {
      const equippedDelta = Number(equippedIds.has(b.id)) - Number(equippedIds.has(a.id));
      return equippedDelta || getWeaveSortScore(b) - getWeaveSortScore(a) || a.name.localeCompare(b.name);
    });
    for (const weave of sortedNewWeaves) {
      if (!orderSet.has(weave.id)) localOrder.push(weave.id);
    }

    render();
  }

  return { element, update };
}
