/**
 * weapon-store-panel.ts — RPG weapon purchase UI.
 *
 * Displayed as an overlay over the RPG container when the player taps the
 * shop button.  Reads available weapons from WEAPON_DEFINITIONS data, checks
 * resource state for affordability, and dispatches purchase / equip actions.
 *
 * The panel is intentionally dumb: it reads state on each `update()` call and
 * renders HTML accordingly.  No internal caching avoids stale state issues.
 */

import { WEAPON_DEFINITIONS } from '../../data/rpg/weapon-definitions';
import type { WeaponDefinition } from '../../data/rpg/weapon-definitions';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { ResourceState } from '../../sim/resources';
import { getMotes } from '../../sim/resources';
import type { ActionHandler } from '../../input';
import { formatNumberAs } from '../../util';
import type { NumberFormat } from '../../util';

// ─── Types ────────────────────────────────────────────────────────

export interface WeaponStorePanel {
  /** Root element — append to #app root, above the tab bar. */
  element: HTMLElement;
  /** Re-render weapon list from current state. */
  update(
    rpgState: RpgSimState,
    resources: ResourceState,
    numberFormat: NumberFormat,
    isDevMode?: boolean,
  ): void;
  /** Show or hide the store overlay. */
  setVisible(visible: boolean): void;
  isVisible: boolean;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createWeaponStorePanel(dispatch: ActionHandler): WeaponStorePanel {
  const element = document.createElement('div');
  element.id = 'weapon-store-panel';
  element.style.display = 'none';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'weapon-store__header';

  const title = document.createElement('span');
  title.className = 'weapon-store__title';
  title.textContent = 'Weapon Store';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'weapon-store__close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close weapon store');
  closeBtn.addEventListener('click', () => panel.setVisible(false));

  header.appendChild(title);
  header.appendChild(closeBtn);
  element.appendChild(header);

  // ── Weapon list ──
  const list = document.createElement('div');
  list.className = 'weapon-store__list';
  element.appendChild(list);

  // ── Internal state ────────────────────────────────────────────

  let isVisible = false;
  // Cached last-render inputs to build the card content.
  let lastRpgState: RpgSimState | null = null;
  let lastResources: ResourceState | null = null;
  let lastFormat: NumberFormat = 'letters';
  let lastIsDevMode = false;

  // ── Card builders ─────────────────────────────────────────────

  function buildCard(
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

    if (isEquipped) card.classList.add('weapon-store__card--equipped');

    // Name row
    const nameRow = document.createElement('div');
    nameRow.className = 'weapon-store__card-name';
    nameRow.textContent = weapon.name;
    if (isEquipped) {
      const badge = document.createElement('span');
      badge.className = 'weapon-store__equipped-badge';
      badge.textContent = 'Equipped';
      nameRow.appendChild(badge);
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

    // Action button
    const btn = document.createElement('button');
    btn.className = 'weapon-store__btn';

    if (!isPurchased) {
      btn.textContent = canAfford ? 'Purchase' : 'Need motes';
      btn.disabled = !canAfford;
      btn.addEventListener('click', () => dispatch({ kind: 'purchase_weapon', weaponId: weapon.id }));
    } else if (!isEquipped) {
      btn.textContent = 'Equip';
      btn.addEventListener('click', () => dispatch({ kind: 'equip_weapon', weaponId: weapon.id }));
    } else {
      btn.textContent = 'Equipped';
      btn.disabled = true;
      btn.classList.add('weapon-store__btn--equipped');
    }
    card.appendChild(btn);

    return card;
  }

  function render(): void {
    if (!lastRpgState || !lastResources) return;
    list.innerHTML = '';
    for (const weapon of WEAPON_DEFINITIONS) {
      if (weapon.isTutorialWeapon) continue;
      list.appendChild(buildCard(weapon, lastRpgState, lastResources, lastFormat, lastIsDevMode));
    }
  }

  // ── Public interface ──────────────────────────────────────────

  const panel: WeaponStorePanel = {
    element,

    update(rpgState, resources, numberFormat, isDevMode = false): void {
      lastRpgState  = rpgState;
      lastResources = resources;
      lastFormat    = numberFormat;
      lastIsDevMode = isDevMode;
      if (isVisible) render();
    },

    setVisible(visible: boolean): void {
      isVisible = visible;
      element.style.display = visible ? '' : 'none';
      panel.isVisible = visible;
      if (visible) render();
    },

    isVisible: false,
  };

  return panel;
}
