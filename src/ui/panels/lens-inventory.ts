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
import { ingredientsToComposition } from '../../render/assets/item-icon-renderer';
import { getMoteIconPath } from '../../render/assets/asset-paths';

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

  // Mote icon (equation-render style)
  {
    const comp = ingredientsToComposition(lens.ingredients);
    const domTierId = comp[0]?.tierId ?? 'sand';
    const domColorLens = TIER_BY_ID.get(domTierId)?.color ?? '#aaa';
    const icon = document.createElement('img');
    icon.src = getMoteIconPath(domTierId);
    icon.alt = '';
    icon.className = 'gem-icon';
    icon.style.cssText =
      'display:block;width:32px;height:32px;margin:4px 0;object-fit:contain;' +
      'image-rendering:pixelated;filter:drop-shadow(0 0 4px ' + domColorLens + '88);';
    card.appendChild(icon);
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

  if (rpgState.craftedLenses.length === 0) {
    const empty = document.createElement('div');
    empty.style.cssText = 'color:#888;font-size:0.85em;text-align:center;padding:12px;';
    empty.textContent = 'No lenses crafted yet. Select mote types above and craft a lens.';
    container.appendChild(empty);
    return container;
  }

  // TODO: add sort buttons (sort by type / tier / power / rarity)

  for (const lens of rpgState.craftedLenses) {
    container.appendChild(buildLensCard(lens, rpgState, dispatch, container));
  }

  return container;
}
