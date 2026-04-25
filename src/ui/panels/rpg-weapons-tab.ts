/**
 * rpg-weapons-tab.ts — Weapons sub-tab for the RPG overlay panel.
 *
 * Renders the "Weapons" sub-tab content:
 *   • Equipped slot count indicator
 *   • Per-weapon purchase / equip / unequip / tier-upgrade cards
 *
 * Extracted from rpg-menu-panel.ts to keep each sub-tab in its own module.
 */

import { WEAPON_DEFINITIONS } from '../../data/rpg/weapon-definitions';
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
        equipBtn.addEventListener('click', () => dispatch({ kind: 'equip_weapon', weaponId: weapon.id }));
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
  }

  return { element, update };
}
