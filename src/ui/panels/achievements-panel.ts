import type { GameState } from '../../sim';
import { ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_GROUPS } from '../../data/achievements';
import { TIER_BY_ID } from '../../data/tiers';
import { formatNumberAs, type NumberFormat } from '../../util';
import { getLifetimeMotes } from '../../sim/resources';
import type { ActionHandler } from '../../input';
import type { AudioSystem } from '../../audio';

/**
 * Achievements panel — grouped accordion cards with claim interactions.
 * Locked secret achievements show scrambled BJ Cree characters that animate.
 */
export interface AchievementsPanel {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
  setVisible(isVisible: boolean): void;
  /** Cancel all timers. Call when the panel is removed from the DOM. */
  destroy(): void;
}

interface SparkleEmitter {
  timeoutId: number | null;
}

const SPARKLE_MIN_DURATION_MS = 3000;
const SPARKLE_MAX_DURATION_MS = 5000;
const SPARKLE_MIN_DELAY_MS = 1400;
const SPARKLE_MAX_DELAY_MS = 2600;
const INITIAL_SPARKLE_DELAY_MS = 1000;
const SPARKLE_SIZE = 6;
const SPARKLE_DRIFT_X_RANGE = 32;
const SPARKLE_DRIFT_Y_RANGE = 26;
const SPARKLE_SCALE_MIN = 0.6;
const SPARKLE_SCALE_MAX = 1.3;

// ─── Scrambled text helpers ─────────────────────────────────────

const UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_CHARS = Array.from(
  { length: 0x1676 - 0x1401 + 1 },
  (_, i) => String.fromCodePoint(0x1401 + i),
).join('');

function randomInRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function randomChar(): string {
  return UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_CHARS[
    Math.floor(Math.random() * UNIFIED_CANADIAN_ABORIGINAL_SYLLABICS_CHARS.length)
  ];
}

function makeScrambledText(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += randomChar();
  return s;
}

/** Returns a display string like "+50% Tap" for an achievement's bonus. */
function bonusText(bonusKind: string, bonusMultiplier: number): string {
  const label = bonusKind === 'tap_multiplier' ? 'Tap' : 'Loom';
  const pct = Math.round((bonusMultiplier - 1) * 100);
  return `+${pct}% ${label}`;
}

export function hasUnclaimedAchievements(state: GameState): boolean {
  for (const def of ACHIEVEMENT_DEFINITIONS) {
    if (state.achievements.unlockedIds.has(def.id) && !state.achievements.claimedIds.has(def.id)) {
      return true;
    }
  }
  return false;
}

// ─── Panel factory ─────────────────────────────────────────────

export function createAchievementsPanel(dispatch: ActionHandler, audioSystem?: AudioSystem): AchievementsPanel {
  const panel = document.createElement('div');
  panel.className = 'panel achievements-panel';

  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Achievements';
  panel.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'panel-subtitle';
  subtitle.textContent = 'Tap glowing achievements to claim bonuses';
  panel.appendChild(subtitle);

  const groupsRoot = document.createElement('div');
  groupsRoot.className = 'achievement-groups';
  panel.appendChild(groupsRoot);

  const goldenTextContainer = document.createElement('div');
  goldenTextContainer.className = 'golden-text-container';
  document.body.appendChild(goldenTextContainer);

  const rewardQueue: string[] = [];
  let isRewardShowing = false;

  function showNextReward(): void {
    if (isRewardShowing) return;
    const next = rewardQueue.shift();
    if (!next) return;
    isRewardShowing = true;
    const rewardLine = document.createElement('div');
    rewardLine.className = 'golden-text-reward';
    rewardLine.textContent = next;
    goldenTextContainer.appendChild(rewardLine);
    rewardLine.addEventListener('animationend', () => {
      rewardLine.remove();
      isRewardShowing = false;
      showNextReward();
    }, { once: true });
  }

  function enqueueReward(text: string): void {
    rewardQueue.push(text);
    showNextReward();
  }

  interface CardRefs {
    card: HTMLElement;
    iconEl: HTMLElement;
    nameEl: HTMLElement;
    bonusEl: HTMLElement;
    descEl: HTMLElement;
    progressEl: HTMLElement;
    groupId: string;
  }
  interface GroupRefs {
    toggle: HTMLButtonElement;
    countEl: HTMLElement;
    content: HTMLElement;
    achievementIds: string[];
  }

  const cardRefs: Map<string, CardRefs> = new Map();
  const groupRefs: Map<string, GroupRefs> = new Map();
  const sparkleEmitters: Map<HTMLElement, SparkleEmitter> = new Map();

  let expandedGroupId: string | null = ACHIEVEMENT_GROUPS[0]?.id ?? null;
  let isPanelVisible = false;

  function createSparkle(host: HTMLElement): void {
    const sparkle = document.createElement('span');
    sparkle.className = 'achievement-sparkle';
    sparkle.style.width = `${SPARKLE_SIZE}px`;
    sparkle.style.height = `${SPARKLE_SIZE}px`;
    sparkle.style.left = `${Math.random() * 100}%`;
    sparkle.style.top = `${Math.random() * 100}%`;

    const driftX = randomInRange(-SPARKLE_DRIFT_X_RANGE / 2, SPARKLE_DRIFT_X_RANGE / 2);
    const driftY = randomInRange(-SPARKLE_DRIFT_Y_RANGE / 2, SPARKLE_DRIFT_Y_RANGE / 2) - 8;
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
    const emitter = sparkleEmitters.get(host);
    if (!emitter) return;
    createSparkle(host);
    const delayMs = randomInRange(SPARKLE_MIN_DELAY_MS, SPARKLE_MAX_DELAY_MS);
    emitter.timeoutId = window.setTimeout(() => scheduleSparkles(host), delayMs);
  }

  function setSparkleEmitter(host: HTMLElement, enabled: boolean): void {
    const existing = sparkleEmitters.get(host);
    if (enabled) {
      if (existing) return;
      host.classList.add('achievement-sparkle-host');
      const timeoutId = window.setTimeout(() => scheduleSparkles(host), INITIAL_SPARKLE_DELAY_MS);
      sparkleEmitters.set(host, { timeoutId });
      return;
    }

    if (!existing) return;
    if (existing.timeoutId !== null) {
      window.clearTimeout(existing.timeoutId);
    }
    sparkleEmitters.delete(host);
    host.classList.remove('achievement-sparkle-host');
    for (const sparkle of host.querySelectorAll('.achievement-sparkle')) {
      sparkle.remove();
    }
  }

  function stopAllSparkles(): void {
    for (const host of sparkleEmitters.keys()) {
      setSparkleEmitter(host, false);
    }
  }

  function setExpandedGroup(nextGroupId: string | null): void {
    expandedGroupId = nextGroupId;
    for (const [groupId, refs] of groupRefs) {
      const isExpanded = groupId === expandedGroupId;
      refs.toggle.classList.toggle('achievement-group-toggle--expanded', isExpanded);
      refs.content.classList.toggle('achievement-group-content--expanded', isExpanded);
      refs.content.style.display = isExpanded ? '' : 'none';
      if (!isExpanded) {
        for (const achievementId of refs.achievementIds) {
          const refsForCard = cardRefs.get(achievementId);
          if (refsForCard) setSparkleEmitter(refsForCard.card, false);
        }
      }
    }
  }

  for (const group of ACHIEVEMENT_GROUPS) {
    const groupEl = document.createElement('section');
    groupEl.className = 'achievement-group';

    const toggle = document.createElement('button');
    toggle.className = 'achievement-group-toggle';
    toggle.type = 'button';

    const left = document.createElement('span');
    left.className = 'achievement-group-toggle-left';
    const icon = document.createElement('span');
    icon.className = 'achievement-group-icon';
    icon.textContent = group.icon;
    const label = document.createElement('span');
    label.className = 'achievement-group-label';
    label.textContent = group.name;
    left.appendChild(icon);
    left.appendChild(label);

    const right = document.createElement('span');
    right.className = 'achievement-group-toggle-right';
    const countEl = document.createElement('span');
    countEl.className = 'achievement-group-count';
    countEl.textContent = '0/0';
    const chevron = document.createElement('span');
    chevron.className = 'achievement-group-chevron';
    chevron.textContent = '▾';
    right.appendChild(countEl);
    right.appendChild(chevron);

    toggle.appendChild(left);
    toggle.appendChild(right);

    const content = document.createElement('div');
    content.className = 'achievement-group-content';

    const achievementIds = ACHIEVEMENT_DEFINITIONS
      .filter(def => def.groupId === group.id)
      .map(def => def.id);

    toggle.addEventListener('click', () => {
      const next = expandedGroupId === group.id ? null : group.id;
      setExpandedGroup(next);
    });

    groupEl.appendChild(toggle);
    groupEl.appendChild(content);
    groupsRoot.appendChild(groupEl);
    groupRefs.set(group.id, { toggle, countEl, content, achievementIds });
  }

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const tier = TIER_BY_ID.get(def.requiresTierId);
    const group = groupRefs.get(def.groupId);
    if (!group) continue;

    const card = document.createElement('div');
    card.className = 'achievement-card';
    card.style.borderLeftColor = tier?.color ?? '#888';

    const header = document.createElement('div');
    header.className = 'achievement-header';

    const iconEl = document.createElement('span');
    iconEl.className = 'achievement-icon';
    iconEl.textContent = '🏆';
    header.appendChild(iconEl);

    const nameEl = document.createElement('span');
    nameEl.className = 'achievement-name';
    nameEl.style.color = tier?.color ?? '#888';
    nameEl.textContent = def.isSecret ? makeScrambledText(def.displayName.length) : def.displayName;
    header.appendChild(nameEl);

    const bonusEl = document.createElement('span');
    bonusEl.className = 'achievement-bonus';
    bonusEl.textContent = def.isSecret ? '???' : bonusText(def.bonusKind, def.bonusMultiplier);
    header.appendChild(bonusEl);

    card.appendChild(header);

    const descEl = document.createElement('p');
    descEl.className = 'achievement-desc';
    descEl.textContent = def.isSecret ? makeScrambledText(def.description.length) : def.description;
    if (def.isSecret) {
      descEl.style.fontFamily = "'BJ Cree', monospace";
      descEl.style.letterSpacing = '0.05em';
      nameEl.style.fontFamily = "'BJ Cree', monospace";
    }
    card.appendChild(descEl);

    const progressEl = document.createElement('div');
    progressEl.className = 'achievement-progress';
    card.appendChild(progressEl);

    card.addEventListener('click', () => {
      const isEarned = card.classList.contains('achievement-earned-unclaimed');
      if (!isEarned) return;
      dispatch({ kind: 'claim_achievement', achievementId: def.id });
      audioSystem?.onAchievementClaimed();
      enqueueReward(`${bonusText(def.bonusKind, def.bonusMultiplier)}!`);
    });

    group.content.appendChild(card);
    cardRefs.set(def.id, { card, iconEl, nameEl, bonusEl, descEl, progressEl, groupId: def.groupId });
  }

  setExpandedGroup(expandedGroupId);

  // Periodically scramble text on locked secret achievements
  const scrambleIntervalId = window.setInterval(() => {
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (!def.isSecret) continue;
      const refs = cardRefs.get(def.id);
      if (!refs) continue;
      const { card, nameEl, descEl } = refs;
      if (card.classList.contains('achievement-locked')) {
        nameEl.textContent = makeScrambledText(def.displayName.length);
        descEl.textContent = makeScrambledText(def.description.length);
      }
    }
  }, 600);

  function setVisible(visible: boolean): void {
    isPanelVisible = visible;
    if (visible) return;
    for (const refs of groupRefs.values()) {
      setSparkleEmitter(refs.toggle, false);
    }
    for (const refs of cardRefs.values()) {
      setSparkleEmitter(refs.card, false);
    }
  }

  function destroy(): void {
    window.clearInterval(scrambleIntervalId);
    stopAllSparkles();
    goldenTextContainer.remove();
  }

  function update(state: GameState, numberFormat: NumberFormat): void {
    const unclaimedByGroup = new Map<string, number>();
    const claimedByGroup = new Map<string, number>();
    const totalByGroup = new Map<string, number>();

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      const refs = cardRefs.get(def.id);
      if (!refs) continue;
      const { card, iconEl, nameEl, bonusEl, descEl, progressEl } = refs;

      const isUnlocked = state.achievements.unlockedIds.has(def.id);
      const isClaimed = state.achievements.claimedIds.has(def.id);
      const isEarnedUnclaimed = isUnlocked && !isClaimed;

      card.classList.toggle('achievement-unlocked', isUnlocked && isClaimed);
      card.classList.toggle('achievement-locked', !isUnlocked);
      card.classList.toggle('achievement-earned-unclaimed', isEarnedUnclaimed);

      const defBonusText = bonusText(def.bonusKind, def.bonusMultiplier);

      if (isUnlocked) {
        iconEl.textContent = isClaimed ? '🏆' : '✨';

        if (def.isSecret) {
          nameEl.style.fontFamily = "'Poiret One', sans-serif";
          descEl.style.fontFamily = "'Poiret One', sans-serif";
          descEl.style.letterSpacing = '';
          nameEl.style.color = TIER_BY_ID.get(def.requiresTierId)?.color ?? '#888';
        }
        nameEl.textContent = def.displayName;
        descEl.textContent = def.description;
        bonusEl.textContent = isClaimed ? defBonusText : '✨ Tap to claim!';
        bonusEl.style.color = isClaimed ? '#a0e080' : '#ffd700';

        progressEl.textContent = isClaimed ? '✓ Claimed' : '✨ Earned — tap to claim your bonus!';
      } else {
        iconEl.textContent = '🔒';
        if (!def.isSecret) {
          nameEl.textContent = def.displayName;
          descEl.textContent = def.description;
          bonusEl.textContent = defBonusText;
          bonusEl.style.color = '';
          const lifetime = getLifetimeMotes(state.resources, def.requiresTierId);
          progressEl.textContent = `Progress: ${formatNumberAs(lifetime, numberFormat)} / ${formatNumberAs(def.requiresLifetimeMotes, numberFormat)} ${TIER_BY_ID.get(def.requiresTierId)?.displayName ?? ''} motes`;
        } else {
          bonusEl.textContent = '???';
          bonusEl.style.color = '';
          progressEl.textContent = '???';
        }
      }

      const total = totalByGroup.get(def.groupId) ?? 0;
      totalByGroup.set(def.groupId, total + 1);
      if (isClaimed) {
        claimedByGroup.set(def.groupId, (claimedByGroup.get(def.groupId) ?? 0) + 1);
      } else if (isEarnedUnclaimed) {
        unclaimedByGroup.set(def.groupId, (unclaimedByGroup.get(def.groupId) ?? 0) + 1);
      }

      const cardShouldSparkle = isPanelVisible && isEarnedUnclaimed && expandedGroupId === def.groupId;
      setSparkleEmitter(card, cardShouldSparkle);
    }

    for (const [groupId, refs] of groupRefs) {
      const total = totalByGroup.get(groupId) ?? 0;
      const claimed = claimedByGroup.get(groupId) ?? 0;
      const hasUnclaimed = (unclaimedByGroup.get(groupId) ?? 0) > 0;

      refs.countEl.textContent = `${claimed}/${total}`;
      refs.toggle.classList.toggle('achievement-group-toggle--has-unclaimed', hasUnclaimed);

      const groupShouldSparkle = isPanelVisible && hasUnclaimed;
      setSparkleEmitter(refs.toggle, groupShouldSparkle);
    }
  }

  return { element: panel, update, setVisible, destroy };
}
