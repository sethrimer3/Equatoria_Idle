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

// ─── Sprite configuration ────────────────────────────────────────

/** Base path for tab icon sprites. */
const ICON_BASE = 'ASSETS/SPRITES/menuElements/icons';

/** Number of animation frames for the upgrades tab. */
const UPGRADES_ANIM_FRAME_COUNT = 36;

/** Duration (ms) to animate from frame 0 to frame 35. */
const UPGRADES_ANIM_DURATION_MS = 400;

/** Animation speed in frames per millisecond. */
const UPGRADES_ANIM_SPEED = UPGRADES_ANIM_FRAME_COUNT / UPGRADES_ANIM_DURATION_MS;

/** Sprite paths for a non-animated tab icon. */
interface StaticTabSprites {
  kind: 'static';
  normal: string;
  hover: string;
  selected: string;
}

/** Sprite paths for an animated tab icon (upgrades tab). */
interface AnimatedTabSprites {
  kind: 'animated';
  /** Frame paths in ascending order (index 0 = normal, last = selected). */
  frames: readonly string[];
}

type TabSprites = StaticTabSprites | AnimatedTabSprites;

const UPGRADES_FRAMES: readonly string[] = Array.from(
  { length: UPGRADES_ANIM_FRAME_COUNT },
  (_, i) => `${ICON_BASE}/upgradesTab/upgradesTabAnimation/upgradesTabAnimation_frame_ (${i + 1}).png`,
);

const TAB_SPRITES: Record<TabId, TabSprites> = {
  equation: {
    kind: 'static',
    normal:   `${ICON_BASE}/equationTab/equationTab_icon.png`,
    hover:    `${ICON_BASE}/equationTab/equationTab_icon_hover.png`,
    selected: `${ICON_BASE}/equationTab/equationTab_icon_selected.png`,
  },
  resources: {
    kind: 'animated',
    frames: UPGRADES_FRAMES,
  },
  rpg: {
    kind: 'static',
    normal:   `${ICON_BASE}/rpgTab/rpgTab_icon.png`,
    hover:    `${ICON_BASE}/rpgTab/rpgTab_icon_hover.png`,
    selected: `${ICON_BASE}/rpgTab/rpgTab_icon_selected.png`,
  },
  achievements: {
    kind: 'static',
    normal:   `${ICON_BASE}/achievementsTab/achievementsTab_icon.png`,
    hover:    `${ICON_BASE}/achievementsTab/achievementsTab_icon_hover.png`,
    selected: `${ICON_BASE}/achievementsTab/achievementsTab_icon_selected.png`,
  },
  settings: {
    kind: 'static',
    normal:   `${ICON_BASE}/settingsTab/settingsTab_icon.png`,
    hover:    `${ICON_BASE}/settingsTab/settingsTab_icon_hover.png`,
    selected: `${ICON_BASE}/settingsTab/settingsTab_icon_selected.png`,
  },
};

// ─── Tab definitions ─────────────────────────────────────────────

interface TabDef {
  id: TabId;
  label: string;
}

const TABS: TabDef[] = [
  { id: 'equation',     label: 'Equation'     },
  { id: 'resources',    label: 'Upgrades'     },
  { id: 'rpg',          label: 'RPG'          },
  { id: 'achievements', label: 'Achievements' },
  { id: 'settings',     label: 'Settings'     },
];

// ─── Upgrades animation state ────────────────────────────────────

/**
 * Manages the bidirectional frame animation for the upgrades tab icon.
 * frameProgress ranges 0.0 (= frame 1, normal) to UPGRADES_ANIM_FRAME_COUNT−1 (= last frame, selected).
 */
interface UpgradesAnimState {
  frameProgress: number;
  targetProgress: number;
  /** Most recently displayed frame index (0-based), used to skip unnecessary src updates. */
  currentFrameIdx: number;
  rafId: number | null;
  lastTimestampMs: number;
  imgEl: HTMLImageElement;
  isHovered: boolean;
  isActive: boolean;
}

function createUpgradesAnimState(imgEl: HTMLImageElement): UpgradesAnimState {
  return {
    frameProgress: 0,
    targetProgress: 0,
    currentFrameIdx: 0,
    rafId: null,
    lastTimestampMs: 0,
    imgEl,
    isHovered: false,
    isActive: false,
  };
}

function upgradesAnimSetTarget(anim: UpgradesAnimState): void {
  const target = (anim.isHovered || anim.isActive) ? UPGRADES_ANIM_FRAME_COUNT - 1 : 0;
  if (target === anim.targetProgress) return;
  anim.targetProgress = target;
  upgradesAnimStart(anim);
}

function upgradesAnimStart(anim: UpgradesAnimState): void {
  if (anim.rafId !== null) return; // already ticking
  anim.lastTimestampMs = performance.now();

  function tick(now: number): void {
    const deltaMs = now - anim.lastTimestampMs;
    anim.lastTimestampMs = now;

    const step = UPGRADES_ANIM_SPEED * deltaMs;
    if (anim.targetProgress > anim.frameProgress) {
      anim.frameProgress = Math.min(anim.frameProgress + step, anim.targetProgress);
    } else {
      anim.frameProgress = Math.max(anim.frameProgress - step, anim.targetProgress);
    }

    const frameIdx = Math.round(anim.frameProgress);
    // Only update the DOM if the displayed frame actually changed
    if (frameIdx !== anim.currentFrameIdx) {
      anim.currentFrameIdx = frameIdx;
      anim.imgEl.src = UPGRADES_FRAMES[frameIdx] ?? UPGRADES_FRAMES[0];
    }

    if (Math.abs(anim.frameProgress - anim.targetProgress) < 0.01) {
      anim.frameProgress = anim.targetProgress;
      anim.rafId = null;
    } else {
      anim.rafId = requestAnimationFrame(tick);
    }
  }

  anim.rafId = requestAnimationFrame(tick);
}

// ─── Build tab button ────────────────────────────────────────────

/**
 * Creates the icon container element for a tab.
 * For static tabs: three stacked images managed by CSS classes.
 * For the animated upgrades tab: a single image driven by JS.
 * Returns the container and (if animated) the animation state.
 */
function buildTabIconEl(
  sprites: TabSprites,
): { container: HTMLElement; animState?: UpgradesAnimState } {
  const container = document.createElement('div');
  container.className = 'tab-icon-sprite';

  if (sprites.kind === 'static') {
    const imgNormal = document.createElement('img');
    imgNormal.className = 'tab-icon-img tab-icon-img--normal';
    imgNormal.src = sprites.normal;
    imgNormal.alt = '';

    const imgHover = document.createElement('img');
    imgHover.className = 'tab-icon-img tab-icon-img--hover';
    imgHover.src = sprites.hover;
    imgHover.alt = '';

    const imgSelected = document.createElement('img');
    imgSelected.className = 'tab-icon-img tab-icon-img--selected';
    imgSelected.src = sprites.selected;
    imgSelected.alt = '';

    container.appendChild(imgNormal);
    container.appendChild(imgHover);
    container.appendChild(imgSelected);

    return { container };
  }

  // Animated (upgrades tab)
  const imgEl = document.createElement('img');
  imgEl.className = 'tab-icon-img tab-icon-img--animated';
  imgEl.src = sprites.frames[0] ?? '';
  imgEl.alt = '';
  container.appendChild(imgEl);

  // Preload animation frames asynchronously after the current task completes
  // so the initial render is not delayed.
  setTimeout(() => {
    for (const frameSrc of sprites.frames) {
      const preload = new Image();
      preload.src = frameSrc;
    }
  }, 0);

  const animState = createUpgradesAnimState(imgEl);
  return { container, animState };
}

// ─── Main factory ────────────────────────────────────────────────

export function createTabBar(dispatch: ActionHandler): TabBar {
  const bar = document.createElement('nav');
  bar.className = 'tab-bar';

  const buttons: Map<TabId, HTMLButtonElement> = new Map();
  let upgradesAnim: UpgradesAnimState | null = null;

  for (const tab of TABS) {
    const sprites = TAB_SPRITES[tab.id];
    const btn = document.createElement('button');
    btn.className = 'tab-btn';
    btn.dataset['tabId'] = tab.id;

    const { container, animState } = buildTabIconEl(sprites);
    btn.appendChild(container);

    const labelEl = document.createElement('span');
    labelEl.className = 'tab-label';
    labelEl.textContent = tab.label;
    btn.appendChild(labelEl);

    btn.addEventListener('pointerdown', (e) => {
      e.stopPropagation();
      dispatch({ kind: 'set_active_tab', tabId: tab.id });
    });

    if (animState) {
      upgradesAnim = animState;

      btn.addEventListener('pointerenter', () => {
        animState.isHovered = true;
        upgradesAnimSetTarget(animState);
      });
      btn.addEventListener('pointerleave', () => {
        animState.isHovered = false;
        upgradesAnimSetTarget(animState);
      });
    }

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
        const wasActive = btn.classList.contains('active');
        const nowActive = id === tabId;
        btn.classList.toggle('active', nowActive);

        // Drive upgrades animation when the tab's active state changes
        if (id === 'resources' && upgradesAnim && wasActive !== nowActive) {
          upgradesAnim.isActive = nowActive;
          upgradesAnimSetTarget(upgradesAnim);
        }
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
