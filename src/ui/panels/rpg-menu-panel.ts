/**
 * rpg-menu-panel.ts — Tabbed RPG menu panel.
 *
 * Displayed as an overlay over the RPG container when the player taps the
 * Menu button.  Contains three tabs:
 *   1. Menu     — Auto Move toggle and other session settings
 *   2. Weapons  — Weapon purchase/equip list with tier display
 *   3. Upgrades — RPG-specific upgrade purchases
 */

import { WEAPON_DEFINITIONS } from '../../data/rpg/weapon-definitions';
import type { WeaponDefinition } from '../../data/rpg/weapon-definitions';
import { RPG_UPGRADE_DEFINITIONS } from '../../data/rpg/rpg-upgrade-definitions';
import type { RpgUpgradeDefinition } from '../../data/rpg/rpg-upgrade-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgUpgradeLevel, getWeaponTierUpgradeCost, getMaxEquippedWeapons, MAX_WEAPON_TIER } from '../../sim/rpg/rpg-state';
import type { ResourceState } from '../../sim/resources';
import { getMotes } from '../../sim/resources';
import type { ActionHandler } from '../../input';
import { formatNumberAs } from '../../util';
import type { NumberFormat } from '../../util';

// ─── Types ────────────────────────────────────────────────────────

type RpgMenuTab = 'menu' | 'weapons' | 'upgrades';

export interface RpgMenuPanel {
  /** Root element — append to #app root, above the tab bar. */
  element: HTMLElement;
  /** Re-render all tabs from current state. */
  update(
    rpgState: RpgSimState,
    resources: ResourceState,
    numberFormat: NumberFormat,
    isDevMode?: boolean,
  ): void;
  /** Show or hide the menu overlay. */
  setVisible(visible: boolean): void;
  isVisible: boolean;
  /** Whether auto-move is currently enabled (session-only, not persisted). */
  isAutoMoveEnabled: boolean;
}

// ─── Helpers ─────────────────────────────────────────────────────

/** Returns the CSS color string for a given weapon's cost tier. */
function tierColor(tierId: string): string {
  return TIER_BY_ID.get(tierId as import('../../data/tiers').TierId)?.color ?? '#c9a84c';
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgMenuPanel(dispatch: ActionHandler): RpgMenuPanel {
  const element = document.createElement('div');
  element.id = 'rpg-menu-panel';
  element.style.display = 'none';

  // ── Header ──
  const header = document.createElement('div');
  header.className = 'rpg-menu__header';

  const title = document.createElement('span');
  title.className = 'rpg-menu__title';
  title.textContent = '⚔ RPG Menu';

  const closeBtn = document.createElement('button');
  closeBtn.className = 'rpg-menu__close';
  closeBtn.textContent = '✕';
  closeBtn.setAttribute('aria-label', 'Close RPG menu');
  closeBtn.addEventListener('click', () => panel.setVisible(false));

  header.appendChild(title);
  header.appendChild(closeBtn);
  element.appendChild(header);

  // ── Tab bar ──
  const tabBarEl = document.createElement('div');
  tabBarEl.className = 'rpg-menu__tabs';

  let activeTab: RpgMenuTab = 'menu';

  const tabDefs: Array<{ id: RpgMenuTab; label: string }> = [
    { id: 'menu',     label: 'Menu' },
    { id: 'weapons',  label: 'Weapons' },
    { id: 'upgrades', label: 'Upgrades' },
  ];

  const tabBtns: Map<RpgMenuTab, HTMLButtonElement> = new Map();

  for (const def of tabDefs) {
    const btn = document.createElement('button');
    btn.className = 'rpg-menu__tab';
    btn.textContent = def.label;
    btn.addEventListener('click', () => {
      activeTab = def.id;
      updateTabHighlight();
      renderActiveTab();
    });
    tabBtns.set(def.id, btn);
    tabBarEl.appendChild(btn);
  }

  element.appendChild(tabBarEl);

  // ── Content area ──
  const content = document.createElement('div');
  content.className = 'rpg-menu__content';
  element.appendChild(content);

  // ── Internal state ────────────────────────────────────────────
  let isVisible = false;
  let isAutoMoveEnabled = false;
  let lastRpgState: RpgSimState | null = null;
  let lastResources: ResourceState | null = null;
  let lastFormat: NumberFormat = 'letters';
  let lastIsDevMode = false;

  function updateTabHighlight(): void {
    for (const [id, btn] of tabBtns) {
      btn.classList.toggle('rpg-menu__tab--active', id === activeTab);
    }
  }

  // ── Menu tab ──────────────────────────────────────────────────

  function renderMenuTab(): void {
    content.innerHTML = '';

    // Auto Move row
    const row = document.createElement('div');
    row.className = 'rpg-menu__setting-row';

    const labelGroup = document.createElement('div');
    labelGroup.className = 'rpg-menu__setting-label-group';
    const labelEl = document.createElement('span');
    labelEl.className = 'rpg-menu__setting-label';
    labelEl.textContent = 'Auto Move';
    const descEl = document.createElement('span');
    descEl.className = 'rpg-menu__setting-desc';
    descEl.textContent = 'Automatically move toward the nearest enemy. Manual joystick overrides while active.';
    labelGroup.appendChild(labelEl);
    labelGroup.appendChild(descEl);

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.className = 'settings-checkbox';
    checkbox.checked = isAutoMoveEnabled;
    checkbox.addEventListener('change', () => {
      isAutoMoveEnabled = checkbox.checked;
      panel.isAutoMoveEnabled = isAutoMoveEnabled;
    });

    row.appendChild(labelGroup);
    row.appendChild(checkbox);
    content.appendChild(row);
  }

  // ── Weapons tab ───────────────────────────────────────────────

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

  function renderWeaponsTab(): void {
    if (!lastRpgState || !lastResources) return;
    content.innerHTML = '';

    // Slot count info
    const slotsInfo = document.createElement('div');
    slotsInfo.style.cssText = 'text-align:center;margin-bottom:8px;color:#c9a84c;font-size:0.85em;';
    const maxSlots = getMaxEquippedWeapons(lastRpgState);
    slotsInfo.textContent = `Equipped: ${lastRpgState.equippedWeaponIds.size} / ${maxSlots} slot${maxSlots !== 1 ? 's' : ''}`;
    content.appendChild(slotsInfo);

    const list = document.createElement('div');
    list.className = 'weapon-store__list';
    for (const weapon of WEAPON_DEFINITIONS) {
      list.appendChild(buildWeaponCard(weapon, lastRpgState, lastResources, lastFormat, lastIsDevMode));
    }
    content.appendChild(list);
  }

  // ── Upgrades tab ──────────────────────────────────────────────

  function buildUpgradeCard(
    upgradeDef: RpgUpgradeDefinition,
    rpgState: RpgSimState,
    resources: ResourceState,
    numberFormat: NumberFormat,
    isDevMode: boolean,
  ): HTMLElement {
    const card = document.createElement('div');
    card.className = 'rpg-upgrade__card';

    const currentLevel = getRpgUpgradeLevel(rpgState, upgradeDef.id);
    const isMaxed = currentLevel >= upgradeDef.maxLevel;
    if (isMaxed) card.classList.add('rpg-upgrade__card--maxed');

    const nameEl = document.createElement('div');
    nameEl.className = 'rpg-upgrade__name';
    nameEl.textContent = upgradeDef.name;
    card.appendChild(nameEl);

    const descEl = document.createElement('div');
    descEl.className = 'rpg-upgrade__desc';
    descEl.textContent = upgradeDef.description;
    card.appendChild(descEl);

    const levelEl = document.createElement('div');
    levelEl.className = 'rpg-upgrade__level';
    if (upgradeDef.maxLevel === 1) {
      levelEl.textContent = isMaxed ? '✓ Unlocked' : 'Locked';
    } else {
      levelEl.textContent = `Level ${currentLevel} / ${upgradeDef.maxLevel}`;
    }
    card.appendChild(levelEl);

    if (!isMaxed) {
      const balance = getMotes(resources, upgradeDef.costTierId);
      const canAfford = isDevMode || balance >= upgradeDef.costPerLevel;
      const costEl = document.createElement('div');
      costEl.className = 'rpg-upgrade__cost' + (canAfford ? '' : ' rpg-upgrade__cost--cannot-afford');
      costEl.textContent = `Cost: ${formatNumberAs(upgradeDef.costPerLevel, numberFormat)} ${upgradeDef.costTierId} motes`;
      card.appendChild(costEl);

      const btn = document.createElement('button');
      btn.className = 'rpg-upgrade__btn';
      btn.textContent = upgradeDef.maxLevel === 1 ? (canAfford ? 'Unlock' : 'Need motes') : (canAfford ? 'Upgrade' : 'Need motes');
      btn.disabled = !canAfford;
      btn.addEventListener('click', () => dispatch({ kind: 'purchase_rpg_upgrade', upgradeId: upgradeDef.id }));
      card.appendChild(btn);
    }

    return card;
  }

  function renderUpgradesTab(): void {
    if (!lastRpgState || !lastResources) return;
    content.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'rpg-upgrade__list';
    for (const upgradeDef of RPG_UPGRADE_DEFINITIONS) {
      list.appendChild(buildUpgradeCard(upgradeDef, lastRpgState, lastResources, lastFormat, lastIsDevMode));
    }
    content.appendChild(list);
  }

  // ── Dispatcher ────────────────────────────────────────────────

  function renderActiveTab(): void {
    switch (activeTab) {
      case 'menu':     renderMenuTab();     break;
      case 'weapons':  renderWeaponsTab();  break;
      case 'upgrades': renderUpgradesTab(); break;
    }
  }

  // ── Public interface ──────────────────────────────────────────

  updateTabHighlight();

  const panel: RpgMenuPanel = {
    element,

    update(rpgState, resources, numberFormat, isDevMode = false): void {
      lastRpgState  = rpgState;
      lastResources = resources;
      lastFormat    = numberFormat;
      lastIsDevMode = isDevMode;
      if (isVisible) renderActiveTab();
    },

    setVisible(visible: boolean): void {
      isVisible = visible;
      element.style.display = visible ? 'flex' : 'none';
      panel.isVisible = visible;
      if (visible) renderActiveTab();
    },

    isVisible: false,
    isAutoMoveEnabled: false,
  };

  return panel;
}
