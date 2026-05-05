/**
 * rpg-weapons-tab.ts — Weapons sub-tab for the RPG overlay panel.
 *
 * Renders the "Weapons" sub-tab content:
 *   • Equipped slot count indicator
 *   • Per-weapon purchase / equip / unequip / tier-upgrade cards
 *
 * Extracted from rpg-menu-panel.ts to keep each sub-tab in its own module.
 */

import { WEAPON_DEFINITIONS, WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import type { WeaponDefinition } from '../../data/rpg/weapon-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getWeaponTierUpgradeCost, getMaxEquippedWeapons, MAX_WEAPON_TIER } from '../../sim/rpg/rpg-state';
import type { ResourceState } from '../../sim/resources';
import { getMotes } from '../../sim/resources';
import type { ActionHandler } from '../../input';
import { formatNumberAs } from '../../util';
import type { NumberFormat } from '../../util';
import { makePageBreak } from '../ui-helpers';
import {
  getChainWhipParams, setChainWhipParam, resetChainWhipParams,
  CHAIN_WHIP_PARAM_DEFAULTS,
} from '../../render/rpg/rpg-weapon-constants';
import type { ChainWhipParamKey } from '../../render/rpg/rpg-weapon-constants';

// ─── Types ─────────────────────────────────────────────────────────

export interface RpgWeaponsTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState, resources: ResourceState, numberFormat: NumberFormat, isDevMode: boolean): void;
}

// ─── Helpers ───────────────────────────────────────────────────────

function tierColor(tierId: string): string {
  return TIER_BY_ID.get(tierId as import('../../data/tiers').TierId)?.color ?? '#fff172';
}

// ─── Factory ───────────────────────────────────────────────────────

export function createRpgWeaponsTabPane(dispatch: ActionHandler): RpgWeaponsTabPane {
  const element = document.createElement('div');

  // ── Slot picker popup ──────────────────────────────────────────
  // Shown when the user clicks "Equip" on a purchased weapon.
  // Overlays the full viewport; user picks which of the 5 stat-panel
  // slots (boxes 7–11) to equip the weapon into.
  const slotPopupOverlay = document.createElement('div');
  slotPopupOverlay.className = 'weapon-slot-popup-overlay';
  slotPopupOverlay.style.display = 'none';

  const slotPopupBox = document.createElement('div');
  slotPopupBox.className = 'weapon-slot-popup-box';

  const slotPopupTitle = document.createElement('div');
  slotPopupTitle.className = 'weapon-slot-popup-title';
  slotPopupBox.appendChild(slotPopupTitle);

  const slotPopupGrid = document.createElement('div');
  slotPopupGrid.className = 'weapon-slot-popup-grid';
  slotPopupBox.appendChild(slotPopupGrid);

  const slotPopupCancel = document.createElement('button');
  slotPopupCancel.className = 'weapon-store__btn weapon-slot-popup-cancel';
  slotPopupCancel.textContent = 'Cancel';
  slotPopupCancel.addEventListener('click', () => { slotPopupOverlay.style.display = 'none'; });
  slotPopupBox.appendChild(slotPopupCancel);

  slotPopupOverlay.appendChild(slotPopupBox);
  // Clicking the dark backdrop also closes the popup
  slotPopupOverlay.addEventListener('click', (e) => {
    if (e.target === slotPopupOverlay) slotPopupOverlay.style.display = 'none';
  });

  // Append to document.body so update()'s innerHTML clear doesn't destroy the overlay.
  // position:fixed ensures it overlays the full viewport regardless of where it lives in the DOM.
  document.body.appendChild(slotPopupOverlay);

  /** Show the slot picker for the given weapon / state snapshot. */
  function showSlotPicker(weaponId: string, _weaponName: string, rpgState: RpgSimState): void {
    const maxSlots = getMaxEquippedWeapons(rpgState);
    slotPopupTitle.textContent = `Equip to which slot?`;
    slotPopupGrid.textContent = '';

    for (let s = 0; s < 5; s++) {
      const btn = document.createElement('button');
      btn.className = 'weapon-store__btn weapon-slot-popup-slot-btn';
      const isLocked = s >= maxSlots;
      const occupant = rpgState.equippedWeaponSlots.get(s);
      const occupantDef = occupant ? WEAPON_BY_ID.get(occupant) : undefined;
      const occupantName = occupantDef ? occupantDef.name : (occupant ?? 'Empty');
      btn.textContent = `Slot ${s + 1}: ${isLocked ? '🔒 Locked' : (occupant ? occupantName : 'Empty')}`;
      btn.disabled = isLocked;
      if (!isLocked) {
        btn.addEventListener('click', () => {
          slotPopupOverlay.style.display = 'none';
          dispatch({ kind: 'equip_weapon_to_slot', weaponId, slotIndex: s });
        });
      }
      slotPopupGrid.appendChild(btn);
    }

    slotPopupOverlay.style.display = 'flex';
  }

  function buildWeaponCard(
    weapon: WeaponDefinition,
    rpgState: RpgSimState,
    resources: ResourceState,
    numberFormat: NumberFormat,
    isDevMode: boolean,
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'weapon-store__card';

    const isPurchased = rpgState.purchasedWeaponIds.has(weapon.id);
    const isEquipped  = rpgState.equippedWeaponIds.has(weapon.id);
    const balance     = getMotes(resources, weapon.costTierId);
    const canAfford   = isDevMode || balance >= weapon.cost;
    const currentTier = rpgState.weaponTiersByWeaponId.get(weapon.id) ?? 1;
    const maxSlots    = getMaxEquippedWeapons(rpgState);
    const canEquipMore = rpgState.equippedWeaponIds.size < maxSlots;

    if (isEquipped) card.classList.add('weapon-store__card--equipped');

    // Name + equipped badge + tier badge row
    const nameRow = document.createElement('div');
    nameRow.className = 'weapon-store__card-name';
    nameRow.textContent = weapon.name;
    if (isPurchased) {
      const tierBadge = document.createElement('span');
      tierBadge.className = 'weapon-tier-badge';
      const color = tierColor(weapon.costTierId);
      tierBadge.style.color = color;
      tierBadge.style.borderColor = color + '88';
      tierBadge.textContent = `Tier ${currentTier}`;
      nameRow.appendChild(tierBadge);
    }
    if (isEquipped) {
      const equippedBadge = document.createElement('span');
      equippedBadge.className = 'weapon-store__equipped-badge';
      equippedBadge.textContent = 'Equipped';
      nameRow.appendChild(equippedBadge);
    }
    card.appendChild(nameRow);

    // Description
    const descEl = document.createElement('div');
    descEl.className = 'weapon-store__card-desc';
    descEl.textContent = weapon.description;
    card.appendChild(descEl);

    // Stats row
    const statsRow = document.createElement('div');
    statsRow.className = 'weapon-store__card-stats';
    const effect = weapon.stats.effect;
    let effectLabel = 'Single target';
    if (effect?.kind === 'multi')    effectLabel = `Hits ${effect.targetCount} targets`;
    if (effect?.kind === 'aoe')      effectLabel = `AoE ${effect.aoeRadius}px`;
    if (effect?.kind === 'piercing') effectLabel = `${Math.round(effect.defPierceRatio * 100)}% DEF pierce`;
    statsRow.innerHTML =
      `<span>+${weapon.stats.damage} ATK</span>` +
      `<span>+${weapon.stats.defBonus} DEF</span>` +
      `<span>${weapon.stats.cooldownMs}ms CD</span>` +
      `<span>${weapon.stats.range}px RNG</span>` +
      `<span>${effectLabel}</span>`;
    card.appendChild(statsRow);

    // Cost row
    const costRow = document.createElement('div');
    costRow.className = 'weapon-store__card-cost';
    if (!isPurchased) {
      const costText = formatNumberAs(weapon.cost, numberFormat);
      costRow.textContent = `Cost: ${costText} ${weapon.costTierId} motes`;
      if (!canAfford) costRow.classList.add('weapon-store__card-cost--cannot-afford');
    }
    card.appendChild(costRow);

    // Action buttons row
    const btnRow = document.createElement('div');
    btnRow.style.display = 'flex';
    btnRow.style.gap = '8px';
    btnRow.style.flexWrap = 'wrap';

    if (!isPurchased) {
      const btn = document.createElement('button');
      btn.className = 'weapon-store__btn';
      btn.textContent = canAfford ? 'Purchase' : 'Need motes';
      btn.disabled = !canAfford;
      btn.addEventListener('click', () => dispatch({ kind: 'purchase_weapon', weaponId: weapon.id }));
      btnRow.appendChild(btn);
    } else {
      if (!isEquipped) {
        const equipBtn = document.createElement('button');
        equipBtn.className = 'weapon-store__btn';
        equipBtn.textContent = canEquipMore ? 'Equip' : `Full (${maxSlots}/${maxSlots})`;
        equipBtn.disabled = !canEquipMore;
        equipBtn.addEventListener('click', () => showSlotPicker(weapon.id, weapon.name, rpgState));
        btnRow.appendChild(equipBtn);
      } else {
        const unequipBtn = document.createElement('button');
        unequipBtn.className = 'weapon-store__btn weapon-store__btn--equipped';
        unequipBtn.textContent = 'Unequip';
        unequipBtn.addEventListener('click', () => dispatch({ kind: 'unequip_weapon', weaponId: weapon.id }));
        btnRow.appendChild(unequipBtn);
      }

      // Tier upgrade button (max tier = MAX_WEAPON_TIER)
      if (currentTier < MAX_WEAPON_TIER) {
        const tierUpgradeCost = getWeaponTierUpgradeCost(weapon.cost, currentTier);
        const canAffordTier = isDevMode || balance >= tierUpgradeCost;
        const tierUpgradeBtn = document.createElement('button');
        tierUpgradeBtn.className = 'weapon-store__btn';
        tierUpgradeBtn.style.background = 'rgba(100,200,255,0.1)';
        tierUpgradeBtn.style.borderColor = 'rgba(100,200,255,0.35)';
        tierUpgradeBtn.style.color = '#64c8ff';
        const tierCostText = formatNumberAs(Math.round(tierUpgradeCost), numberFormat);
        tierUpgradeBtn.textContent = `Tier ${currentTier + 1} (${tierCostText} ${weapon.costTierId})`;
        tierUpgradeBtn.disabled = !canAffordTier;
        tierUpgradeBtn.addEventListener('click', () => dispatch({ kind: 'upgrade_weapon_tier', weaponId: weapon.id }));
        btnRow.appendChild(tierUpgradeBtn);
      } else {
        const maxedEl = document.createElement('span');
        maxedEl.style.color = '#64c8ff';
        maxedEl.style.fontSize = '0.8em';
        maxedEl.style.alignSelf = 'center';
        maxedEl.textContent = `Max Tier (${MAX_WEAPON_TIER})`;
        btnRow.appendChild(maxedEl);
      }
    }

    card.appendChild(btnRow);
    return card;
  }

  function update(
    rpgState: RpgSimState,
    resources: ResourceState,
    numberFormat: NumberFormat,
    isDevMode: boolean,
  ): void {
    element.innerHTML = '';

    // Slot count info
    const slotsInfo = document.createElement('div');
    slotsInfo.style.cssText = 'text-align:center;margin-bottom:8px;color:#fff172;font-size:0.85em;';
    const maxSlots = getMaxEquippedWeapons(rpgState);
    slotsInfo.textContent = `Equipped: ${rpgState.equippedWeaponIds.size} / ${maxSlots} slot${maxSlots !== 1 ? 's' : ''}`;
    element.appendChild(slotsInfo);

    element.appendChild(makePageBreak('small'));

    const list = document.createElement('div');
    list.className = 'weapon-store__list';
    for (const weapon of WEAPON_DEFINITIONS) {
      list.appendChild(buildWeaponCard(weapon, rpgState, resources, numberFormat, isDevMode));
    }
    element.appendChild(list);
    element.appendChild(makePageBreak('small'));

    if (isDevMode) {
      element.appendChild(buildChainWhipDevPanel());
    }
  }

  return { element, update };
}

// ── Quartz whip physics dev panel ─────────────────────────────────────────────

const CHAIN_PARAM_LABELS: Record<ChainWhipParamKey, string> = {
  CHAIN_MIN_RADIUS:          'Min link radius (px)',
  CHAIN_MAX_RADIUS:          'Max link radius (px)',
  CHAIN_LASH_MS:             'Lash duration (ms)',
  CHAIN_RETRACT_MS:          'Retract duration (ms)',
  CHAIN_HIT_CD_MS:           'Hit cooldown (ms)',
  CHAIN_REST_LENGTH:         'Rest length (px/node)',
  CHAIN_SPRING_K:            'Spring stiffness K',
  CHAIN_ANCHOR_K:            'Anchor spring K (idle)',
  CHAIN_RETRACT_ANCHOR_K:    'Anchor spring K (retract)',
  CHAIN_DAMPING_COEFF:       'Damping coefficient',
  CHAIN_DAMPING_SPEED_SCALE: 'Damping speed scale',
  CHAIN_LASH_SPEED:          'Lash impulse speed (px/dt)',
  CHAIN_MIN_INERTIA:         'Min inertia (node 0)',
  CHAIN_MAX_INERTIA:         'Max inertia (tip node)',
  CHAIN_LINK_GAP_RATIO:      'Link gap ratio',
};

const CHAIN_PARAM_ORDER: ChainWhipParamKey[] = [
  'CHAIN_LASH_MS', 'CHAIN_RETRACT_MS', 'CHAIN_HIT_CD_MS',
  'CHAIN_REST_LENGTH', 'CHAIN_SPRING_K', 'CHAIN_ANCHOR_K', 'CHAIN_RETRACT_ANCHOR_K',
  'CHAIN_DAMPING_COEFF', 'CHAIN_DAMPING_SPEED_SCALE',
  'CHAIN_LASH_SPEED', 'CHAIN_MIN_INERTIA', 'CHAIN_MAX_INERTIA',
  'CHAIN_MIN_RADIUS', 'CHAIN_MAX_RADIUS', 'CHAIN_LINK_GAP_RATIO',
];

function buildChainWhipDevPanel(): HTMLElement {
  const panel = document.createElement('div');
  panel.style.cssText = 'margin-top:12px;background:rgba(20,10,30,0.85);border:1px solid rgba(160,216,239,0.35);border-radius:6px;padding:12px;';

  const heading = document.createElement('div');
  heading.style.cssText = 'color:#a0d8ef;font-weight:700;font-size:0.85em;letter-spacing:0.05em;margin-bottom:8px;';
  heading.textContent = '🔧 Quartz Whip Physics (Dev Mode)';
  panel.appendChild(heading);

  const grid = document.createElement('div');
  grid.style.cssText = 'display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;';

  const current = getChainWhipParams();

  for (const key of CHAIN_PARAM_ORDER) {
    const row = document.createElement('div');
    row.style.cssText = 'display:flex;flex-direction:column;gap:2px;';

    const label = document.createElement('label');
    label.style.cssText = 'font-size:0.72em;color:#88b8cc;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;';
    label.textContent = CHAIN_PARAM_LABELS[key];

    const inputRow = document.createElement('div');
    inputRow.style.cssText = 'display:flex;gap:4px;align-items:center;';

    const input = document.createElement('input');
    input.type = 'number';
    input.value = String(current[key]);
    input.step = key.includes('_MS') ? '10' : '0.01';
    input.style.cssText =
      'width:80px;background:rgba(0,0,0,0.5);border:1px solid rgba(160,216,239,0.35);' +
      'border-radius:3px;color:#e0f0ff;font-size:0.8em;padding:2px 4px;';
    input.addEventListener('change', () => {
      const val = parseFloat(input.value);
      if (!isNaN(val)) setChainWhipParam(key, val);
    });

    const dflt = CHAIN_WHIP_PARAM_DEFAULTS[key];
    const resetBtn = document.createElement('button');
    resetBtn.textContent = '↺';
    resetBtn.title = `Reset to default (${dflt})`;
    resetBtn.style.cssText =
      'padding:2px 5px;background:rgba(40,40,60,0.8);border:1px solid rgba(160,216,239,0.25);' +
      'border-radius:3px;color:#a0d8ef;font-size:0.75em;cursor:pointer;touch-action:manipulation;';
    resetBtn.addEventListener('click', () => {
      setChainWhipParam(key, dflt);
      input.value = String(dflt);
    });

    inputRow.appendChild(input);
    inputRow.appendChild(resetBtn);
    row.appendChild(label);
    row.appendChild(inputRow);
    grid.appendChild(row);
  }

  panel.appendChild(grid);

  const resetAllBtn = document.createElement('button');
  resetAllBtn.textContent = '↺ Reset All to Defaults';
  resetAllBtn.style.cssText =
    'margin-top:10px;width:100%;padding:5px;background:rgba(40,20,60,0.8);' +
    'border:1px solid rgba(160,216,239,0.35);border-radius:4px;color:#a0d8ef;' +
    'font-size:0.78em;font-weight:600;cursor:pointer;touch-action:manipulation;';
  resetAllBtn.addEventListener('click', () => {
    resetChainWhipParams();
    // Refresh displayed values in order matching CHAIN_PARAM_ORDER
    const inputs = grid.querySelectorAll('input[type="number"]');
    CHAIN_PARAM_ORDER.forEach((key, i) => {
      (inputs[i] as HTMLInputElement).value = String(CHAIN_WHIP_PARAM_DEFAULTS[key]);
    });
  });
  panel.appendChild(resetAllBtn);

  return panel;
}
