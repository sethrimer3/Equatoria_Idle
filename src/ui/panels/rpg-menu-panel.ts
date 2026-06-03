/**
 * rpg-menu-panel.ts — Tabbed RPG menu panel (outer shell).
 *
 * Displayed as an overlay over the RPG container when the player taps the
 * Menu button.  Contains three tabs; each tab's content is owned by a
 * dedicated sub-pane module:
 *   1. Menu     — rpg-menu-tab.ts     (Auto Move toggle + respawn checkpoint)
 *   2. Weapons  — rpg-weapons-tab.ts  (weapon purchase / equip / tier-upgrade)
 *   3. Upgrades — rpg-upgrades-tab.ts (RPG-specific upgrade purchases)
 *
 * This file is responsible only for the outer shell, header, tab bar,
 * content area, and routing updates to the active sub-pane.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { ResourceState } from '../../sim/resources';
import type { ActionHandler } from '../../input';
import type { GameAction } from '../../input';
import type { NumberFormat } from '../../util';
import { createRpgMenuTabPane } from './rpg-menu-tab';
import { createRpgWeaponsTabPane } from './rpg-weapons-tab';
import { createRpgUpgradesTabPane } from './rpg-upgrades-tab';
import { createRpgBossesTabPane } from './rpg-bosses-tab';
import type { RpgBossesTabPane } from './rpg-bosses-tab';
import { createRpgEnemiesTabPane } from './rpg-enemies-tab';
import type { RpgEnemiesTabPane } from './rpg-enemies-tab';
import { makePageBreak } from '../ui-helpers';

// ─── Types ────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────

type RpgMenuTab = 'menu' | 'weapons' | 'upgrades' | 'bosses' | 'enemies';

export interface RpgMenuPanel {
  /** Root element — append to #app root, above the tab bar. */
  element: HTMLElement;
  /** Re-render the active sub-tab with fresh state. */
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
  /** Sync the persisted rpgBarAtTop value into the menu tab so the checkbox reflects current state. */
  setRpgBarAtTop(atTop: boolean): void;
  /** Sync the invincibility mode setting into the menu tab so the checkbox reflects current state. */
  setInvincibilityMode(enabled: boolean): void;
  /** Sync the topography debug setting into the menu tab so the checkbox reflects current state. */
  setTopographicTerrainDebugEnabled(enabled: boolean): void;
  /** Sync the sharp topography shadows setting into the menu tab so the checkbox reflects current state. */
  setSharpTopographyShadows(enabled: boolean): void;
  /** Sync an individual developer visual checkbox without a full re-render. */
  setDeveloperVisual(kind: GameAction['kind'], enabled: boolean): void;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgMenuPanel(
  dispatch: ActionHandler,
  onRpgBarAtTopChange: (atTop: boolean) => void = () => undefined,
): RpgMenuPanel {
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
    { id: 'bosses',   label: 'Bosses' },
    { id: 'enemies',  label: 'Enemies' },
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

  // ── Sub-panes ─────────────────────────────────────────────────

  const menuTabPane = createRpgMenuTabPane(
    dispatch,
    (enabled) => { panel.isAutoMoveEnabled = enabled; },
    (atTop) => { onRpgBarAtTopChange(atTop); },
  );
  const weaponsTabPane  = createRpgWeaponsTabPane(dispatch);
  const upgradesTabPane = createRpgUpgradesTabPane(dispatch);
  const bossesTabPane: RpgBossesTabPane = createRpgBossesTabPane(dispatch);
  const enemiesTabPane: RpgEnemiesTabPane = createRpgEnemiesTabPane(dispatch);

  // All pane elements live in the content area; we show/hide per active tab.
  const content = document.createElement('div');
  content.className = 'rpg-menu__content';
  content.appendChild(makePageBreak('large'));
  content.appendChild(menuTabPane.element);
  content.appendChild(weaponsTabPane.element);
  content.appendChild(upgradesTabPane.element);
  content.appendChild(bossesTabPane.element);
  content.appendChild(enemiesTabPane.element);
  element.appendChild(content);

  // ── Internal state ────────────────────────────────────────────
  let isVisible = false;
  let lastRpgState: RpgSimState | null = null;
  let lastResources: ResourceState | null = null;
  let lastFormat: NumberFormat = 'letters';
  let lastIsDevMode = false;
  let lastRpgBarAtTop = false;
  let lastTopographicTerrainDebugEnabled = false;
  let lastSharpTopographyShadows = true;

  function updateTabHighlight(): void {
    for (const [id, btn] of tabBtns) {
      btn.classList.toggle('rpg-menu__tab--active', id === activeTab);
    }
  }

  // ── Tab visibility helpers ────────────────────────────────────

  function showActivePane(): void {
    menuTabPane.element.style.display    = activeTab === 'menu'     ? '' : 'none';
    weaponsTabPane.element.style.display  = activeTab === 'weapons'  ? '' : 'none';
    upgradesTabPane.element.style.display = activeTab === 'upgrades' ? '' : 'none';
    bossesTabPane.element.style.display   = activeTab === 'bosses'   ? '' : 'none';
    enemiesTabPane.element.style.display  = activeTab === 'enemies'  ? '' : 'none';
  }

  function renderActiveTab(): void {
    if (!lastRpgState || !lastResources) return;
    showActivePane();
    switch (activeTab) {
      case 'menu':
        menuTabPane.update(
          lastRpgState,
          lastIsDevMode,
          lastRpgBarAtTop,
          lastTopographicTerrainDebugEnabled,
          lastSharpTopographyShadows,
        );
        break;
      case 'weapons':
        weaponsTabPane.update(lastRpgState, lastResources, lastFormat, lastIsDevMode);
        break;
      case 'forge':
        forgeTabPane.update(lastRpgState, lastIsDevMode);
        break;
      case 'upgrades':
        upgradesTabPane.update(lastRpgState, lastResources, lastFormat, lastIsDevMode);
        break;
      case 'bosses':
        bossesTabPane.update(lastRpgState);
        break;
      case 'enemies':
        enemiesTabPane.update(lastRpgState, lastIsDevMode);
        break;
    }
  }

  // ── Public interface ──────────────────────────────────────────

  updateTabHighlight();
  showActivePane();

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

    setRpgBarAtTop(atTop: boolean): void {
      lastRpgBarAtTop = atTop;
      menuTabPane.setRpgBarAtTop(atTop);
    },

    setInvincibilityMode(enabled: boolean): void {
      menuTabPane.setInvincibilityMode(enabled);
    },

    setTopographicTerrainDebugEnabled(enabled: boolean): void {
      lastTopographicTerrainDebugEnabled = enabled;
      menuTabPane.setTopographicTerrainDebugEnabled(enabled);
    },

    setSharpTopographyShadows(enabled: boolean): void {
      lastSharpTopographyShadows = enabled;
      menuTabPane.setSharpTopographyShadows(enabled);
    },

    setDeveloperVisual(kind: GameAction['kind'], enabled: boolean): void {
      menuTabPane.setDeveloperVisual(kind, enabled);
    },

    isVisible: false,
    isAutoMoveEnabled: false,
  };

  return panel;
}
