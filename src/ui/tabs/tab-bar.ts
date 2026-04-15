import type { TabId, ActionHandler } from '../../input';
import type { GameState } from '../../sim';
import { hasUnclaimedAchievements } from '../panels/achievements-panel';
import {
  INITIAL_SPARKLE_DELAY_MS,
  type SparkleEmitter,
  SPARKLE_DRIFT_X_RANGE,
  SPARKLE_DRIFT_Y_RANGE,
  SPARKLE_MAX_DELAY_MS,
  SPARKLE_MAX_DURATION_MS,
  SPARKLE_MIN_DELAY_MS,
  SPARKLE_MIN_DURATION_MS,
  SPARKLE_SCALE_MAX,
  SPARKLE_SCALE_MIN,
  SPARKLE_VERTICAL_BIAS_Y,
  randomInRange,
} from '../achievements/sparkle-shared';

/**
 * Creates and manages the bottom tab bar.
 * Returns the tab bar element and methods to update active + achievement state.
 */
export interface TabBar {
  element: HTMLElement;
  setActiveTab(tabId: TabId): void;
  updateAchievementIndicator(state: GameState): void;
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

  const achievementButton = buttons.get('achievements') ?? null;
  let sparkleEmitter: SparkleEmitter | null = null;

  function createSparkle(host: HTMLElement): void {
    const sparkle = document.createElement('span');
    sparkle.className = 'achievement-sparkle';
    sparkle.style.width = '6px';
    sparkle.style.height = '6px';
    sparkle.style.left = `${Math.random() * 100}%`;
    sparkle.style.top = `${Math.random() * 100}%`;

    const driftX = randomInRange(-SPARKLE_DRIFT_X_RANGE / 2, SPARKLE_DRIFT_X_RANGE / 2);
    const driftY = randomInRange(-SPARKLE_DRIFT_Y_RANGE / 2, SPARKLE_DRIFT_Y_RANGE / 2) + SPARKLE_VERTICAL_BIAS_Y;
    const scale = randomInRange(SPARKLE_SCALE_MIN, SPARKLE_SCALE_MAX);
    const durationMs = randomInRange(SPARKLE_MIN_DURATION_MS, SPARKLE_MAX_DURATION_MS);

    sparkle.style.setProperty('--sparkle-dx', `${driftX.toFixed(2)}px`);
    sparkle.style.setProperty('--sparkle-dy', `${driftY.toFixed(2)}px`);
    sparkle.style.setProperty('--sparkle-scale', scale.toFixed(3));
    sparkle.style.setProperty('--sparkle-duration', `${durationMs.toFixed(0)}ms`);

    sparkle.addEventListener('animationend', () => sparkle.remove(), { once: true });
    host.appendChild(sparkle);
  }

  function scheduleSparkles(host: HTMLElement): void {
    if (!sparkleEmitter) return;
    createSparkle(host);
    const delayMs = randomInRange(SPARKLE_MIN_DELAY_MS, SPARKLE_MAX_DELAY_MS);
    sparkleEmitter.timeoutId = window.setTimeout(() => scheduleSparkles(host), delayMs);
  }

  function setSparkleEmitter(host: HTMLElement, enabled: boolean): void {
    if (enabled) {
      if (sparkleEmitter) return;
      host.classList.add('achievement-sparkle-host');
      sparkleEmitter = {
        timeoutId: window.setTimeout(() => scheduleSparkles(host), INITIAL_SPARKLE_DELAY_MS),
      };
      return;
    }

    if (!sparkleEmitter) return;
    if (sparkleEmitter.timeoutId !== null) {
      window.clearTimeout(sparkleEmitter.timeoutId);
    }
    sparkleEmitter = null;
    host.classList.remove('achievement-sparkle-host');
    for (const sparkle of host.querySelectorAll('.achievement-sparkle')) {
      sparkle.remove();
    }
  }

  return {
    element: bar,
    setActiveTab(tabId: TabId) {
      for (const [id, btn] of buttons) {
        btn.classList.toggle('active', id === tabId);
      }
    },
    updateAchievementIndicator(state: GameState): void {
      if (!achievementButton) return;
      const shouldShowIndicator = hasUnclaimedAchievements(state);
      achievementButton.classList.toggle('tab-btn--unclaimed-achievements', shouldShowIndicator);
      setSparkleEmitter(achievementButton, shouldShowIndicator);
    },
  };
}
