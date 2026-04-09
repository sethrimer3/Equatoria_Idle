import type { TabId, ActionHandler } from '../../input';

/**
 * Creates and manages the bottom tab bar.
 * Returns the tab bar element and a method to update active state.
 */
export interface TabBar {
  element: HTMLElement;
  setActiveTab(tabId: TabId): void;
}

interface TabDef {
  id: TabId;
  label: string;
  icon: string;
}

const TABS: TabDef[] = [
  { id: 'equation',     label: 'Equation',     icon: 'ƒ' },
  { id: 'resources',    label: 'Upgrades',     icon: '⬆' },
  { id: 'looms',        label: 'Looms',        icon: '⚙' },
  { id: 'achievements', label: 'Achievements', icon: '🏆' },
  { id: 'settings',     label: 'Settings',     icon: '☰' },
];

export function createTabBar(dispatch: ActionHandler): TabBar {
  const bar = document.createElement('nav');
  bar.className = 'tab-bar';

  const buttons: Map<TabId, HTMLButtonElement> = new Map();

  for (const tab of TABS) {
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset['tabId'] = tab.id;
    btn.innerHTML = `<span class="tab-icon">${tab.icon}</span><span class="tab-label">${tab.label}</span>`;
    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'set_active_tab', tabId: tab.id });
    });
    bar.appendChild(btn);
    buttons.set(tab.id, btn);
  }

  return {
    element: bar,
    setActiveTab(tabId: TabId) {
      for (const [id, btn] of buttons) {
        btn.classList.toggle('active', id === tabId);
      }
    },
  };
}
