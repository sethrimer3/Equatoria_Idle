/**
 * rpg-upgrades-tab.ts — Upgrades sub-tab for the RPG overlay panel.
 *
 * Renders the "Upgrades" sub-tab content:
 *   • Per-upgrade purchase cards (level / max level, cost, buy button)
 *
 * Extracted from rpg-menu-panel.ts to keep each sub-tab in its own module.
 */

import { RPG_UPGRADE_DEFINITIONS } from '../../data/rpg/rpg-upgrade-definitions';
import type { RpgUpgradeDefinition } from '../../data/rpg/rpg-upgrade-definitions';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgUpgradeLevel } from '../../sim/rpg/rpg-state';
import type { ResourceState } from '../../sim/resources';
import { getMotes } from '../../sim/resources';
import type { ActionHandler } from '../../input';
import { formatNumberAs } from '../../util';
import type { NumberFormat } from '../../util';
import { makePageBreak } from '../ui-helpers';

// ─── Types ─────────────────────────────────────────────────────────

export interface RpgUpgradesTabPane {
  element: HTMLElement;
  update(rpgState: RpgSimState, resources: ResourceState, numberFormat: NumberFormat, isDevMode: boolean): void;
}

// ─── Factory ───────────────────────────────────────────────────────

export function createRpgUpgradesTabPane(dispatch: ActionHandler): RpgUpgradesTabPane {
  const element = document.createElement('div');

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
      btn.textContent = upgradeDef.maxLevel === 1
        ? (canAfford ? 'Unlock' : 'Need motes')
        : (canAfford ? 'Upgrade' : 'Need motes');
      btn.disabled = !canAfford;
      btn.addEventListener('click', () => dispatch({ kind: 'purchase_rpg_upgrade', upgradeId: upgradeDef.id }));
      card.appendChild(btn);
    }

    return card;
  }

  function update(
    rpgState: RpgSimState,
    resources: ResourceState,
    numberFormat: NumberFormat,
    isDevMode: boolean,
  ): void {
    element.innerHTML = '';
    const list = document.createElement('div');
    list.className = 'rpg-upgrade__list';
    for (const upgradeDef of RPG_UPGRADE_DEFINITIONS) {
      list.appendChild(buildUpgradeCard(upgradeDef, rpgState, resources, numberFormat, isDevMode));
    }
    element.appendChild(list);
    element.appendChild(makePageBreak('small'));
  }

  return { element, update };
}
