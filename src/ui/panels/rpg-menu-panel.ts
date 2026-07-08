/**
 * rpg-menu-panel.ts — Tabbed RPG menu panel (outer shell).
 *
 * Displayed as an overlay over the RPG container when the player taps the
 * Menu button.  Contains three tabs; each tab's content is owned by a
 * dedicated sub-pane module:
 *   1. Menu     — rpg-menu-tab.ts     (Auto Move toggle + respawn checkpoint)
 *   2. Upgrades — rpg-upgrades-tab.ts (RPG-specific upgrade purchases)
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
import type { RpgRackPosition, RpgVerticalPosition } from './rpg-menu-tab';
import { createRpgSkillTreeTabPane } from './rpg-skill-tree-tab';
import type { RpgSkillTreeTabPane } from './rpg-skill-tree-tab';
import { createRpgEnemiesTabPane } from './rpg-enemies-tab';
import type { RpgEnemiesTabPane } from './rpg-enemies-tab';
import { createRpgStatusGlossaryTabPane } from './rpg-status-glossary-tab';
import type { RpgStatusGlossaryTabPane } from './rpg-status-glossary-tab';
import { makePageBreak } from '../ui-helpers';

// ─── Types ────────────────────────────────────────────────────────

// ─── Types ────────────────────────────────────────────────────────

type RpgMenuTab = 'menu' | 'upgrades' | 'enemies' | 'status';

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
  /** Show the menu overlay directly on the enemy codex tab. */
  openEnemiesTab(): void;
  /** Show the menu overlay directly on the Skill Tree tab. */
  openSkillTreeTab(): void;
  isVisible: boolean;
  /** Whether auto-move is currently enabled (session-only, not persisted). */
  isAutoMoveEnabled: boolean;
  /** Set auto-move through the same session state used by the menu checkbox. */
  setAutoMoveEnabled(enabled: boolean): void;
  /** Sync the persisted RPG rack position into the menu tab. */
  setRpgRackPosition(position: RpgRackPosition): void;
  setRpgMenuButtonPosition(position: RpgVerticalPosition): void;
  setRpgZonePosition(position: RpgVerticalPosition): void;
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
  rackElement: HTMLElement,
  rackHome: HTMLElement,
  onRpgRackPositionChange: (position: RpgRackPosition) => void = () => undefined,
  onRpgMenuButtonPositionChange: (position: RpgVerticalPosition) => void = () => undefined,
  onRpgZonePositionChange: (position: RpgVerticalPosition) => void = () => undefined,
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
    { id: 'upgrades', label: 'Skill Tree' },
    { id: 'enemies',  label: 'Enemies' },
    { id: 'status',   label: 'Statuses' },
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
    rackElement,
    (position) => { onRpgRackPositionChange(position); },
    (position) => { onRpgMenuButtonPositionChange(position); },
    (position) => { onRpgZonePositionChange(position); },
  );
  const skillTreePane: RpgSkillTreeTabPane = createRpgSkillTreeTabPane(dispatch);
  const enemiesTabPane: RpgEnemiesTabPane = createRpgEnemiesTabPane(dispatch);
  const statusGlossaryPane: RpgStatusGlossaryTabPane = createRpgStatusGlossaryTabPane();

  // All pane elements live in the content area; we show/hide per active tab.
  const content = document.createElement('div');
  content.className = 'rpg-menu__content';
  menuTabPane.element.prepend(makePageBreak('large'));
  enemiesTabPane.element.prepend(makePageBreak('large'));
  statusGlossaryPane.element.prepend(makePageBreak('large'));
  content.appendChild(menuTabPane.element);
  content.appendChild(skillTreePane.element);
  content.appendChild(enemiesTabPane.element);
  content.appendChild(statusGlossaryPane.element);
  element.appendChild(content);

  // ── Internal state ────────────────────────────────────────────
  let isVisible = false;
  let lastRpgState: RpgSimState | null = null;
  let lastResources: ResourceState | null = null;
  let lastFormat: NumberFormat = 'letters';
  let lastIsDevMode = false;
  let lastRpgRackPosition: RpgRackPosition = 'bottom';
  let lastRpgMenuButtonPosition: RpgVerticalPosition = 'top';
  let lastRpgZonePosition: RpgVerticalPosition = 'top';
  let lastTopographicTerrainDebugEnabled = false;
  let lastSharpTopographyShadows = true;

  function updateTabHighlight(): void {
    for (const [id, btn] of tabBtns) {
      btn.classList.toggle('rpg-menu__tab--active', id === activeTab);
    }
  }

  // ── Tab visibility helpers ────────────────────────────────────

  function showActivePane(): void {
    const isSkillTree = activeTab === 'upgrades';
    menuTabPane.element.style.display        = activeTab === 'menu'    ? '' : 'none';
    skillTreePane.element.style.display      = isSkillTree             ? '' : 'none';
    enemiesTabPane.element.style.display     = activeTab === 'enemies' ? '' : 'none';
    statusGlossaryPane.element.style.display = activeTab === 'status'  ? '' : 'none';
    content.classList.toggle('rpg-menu__content--canvas-fill', isSkillTree);
    if (isSkillTree) {
      skillTreePane.startLoop();
    } else {
      skillTreePane.stopLoop();
    }
  }

  function renderActiveTab(): void {
    if (!lastRpgState || !lastResources) return;
    showActivePane();
    switch (activeTab) {
      case 'menu':
        menuTabPane.update(
          lastRpgState,
          lastIsDevMode,
          lastRpgRackPosition,
          lastRpgMenuButtonPosition,
          lastRpgZonePosition,
          lastTopographicTerrainDebugEnabled,
          lastSharpTopographyShadows,
        );
        break;
      case 'upgrades':
        skillTreePane.update(lastRpgState, lastResources, lastFormat, lastIsDevMode);
        break;
      case 'enemies':
        enemiesTabPane.update(lastRpgState, lastIsDevMode);
        break;
      case 'status':
        // Static content — no update needed
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
      if (!visible) {
        rackElement.classList.remove('rpg-rack-in-menu');
        rackHome.appendChild(rackElement);
        skillTreePane.stopLoop();
      }
      element.style.display = visible ? 'flex' : 'none';
      panel.isVisible = visible;
      if (visible) renderActiveTab();
    },

    openEnemiesTab(): void {
      activeTab = 'enemies';
      updateTabHighlight();
      panel.setVisible(true);
    },

    openSkillTreeTab(): void {
      activeTab = 'upgrades';
      updateTabHighlight();
      panel.setVisible(true);
    },

    setRpgRackPosition(position: RpgRackPosition): void {
      lastRpgRackPosition = position;
      menuTabPane.setRpgRackPosition(position);
    },
    setAutoMoveEnabled(enabled: boolean): void {
      panel.isAutoMoveEnabled = enabled;
      menuTabPane.setAutoMoveEnabled(enabled);
    },
    setRpgMenuButtonPosition(position: RpgVerticalPosition): void {
      lastRpgMenuButtonPosition = position;
      menuTabPane.setRpgMenuButtonPosition(position);
    },
    setRpgZonePosition(position: RpgVerticalPosition): void {
      lastRpgZonePosition = position;
      menuTabPane.setRpgZonePosition(position);
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
