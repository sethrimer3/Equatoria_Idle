import type { GameState } from '../../sim';
import { ACHIEVEMENT_DEFINITIONS } from '../../data/achievements';
import { TIER_BY_ID } from '../../data/tiers';
import { formatNumberAs, type NumberFormat } from '../../util';
import { getLifetimeMotes } from '../../sim/resources';
import type { ActionHandler } from '../../input';

/**
 * Achievements panel — shows all achievements, their requirements, and bonuses.
 * Locked secret achievements show scrambled BJ Cree characters that animate.
 * Earned-but-unclaimed achievements show a golden sheen and can be clicked to claim.
 */
export interface AchievementsPanel {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
}

// ─── Scrambled text helpers ─────────────────────────────────────

const SCRAMBLE_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*';

function randomChar(): string {
  return SCRAMBLE_CHARS[Math.floor(Math.random() * SCRAMBLE_CHARS.length)];
}

function makeScrambledText(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += randomChar();
  return s;
}

// ─── Reward popup ──────────────────────────────────────────────

function showRewardPopup(card: HTMLElement, bonusText: string): void {
  const existing = card.querySelector('.achievement-reward-popup');
  if (existing) existing.remove();

  const popup = document.createElement('div');
  popup.className = 'achievement-reward-popup';
  popup.textContent = bonusText;
  card.appendChild(popup);

  // Fade out and remove after animation completes
  setTimeout(() => popup.remove(), 2200);
}

// ─── Panel factory ─────────────────────────────────────────────

export function createAchievementsPanel(dispatch: ActionHandler): AchievementsPanel {
  const panel = document.createElement('div');
  panel.className = 'panel achievements-panel';

  const title = document.createElement('h3');
  title.className = 'panel-title';
  title.textContent = 'Achievements';
  panel.appendChild(title);

  const subtitle = document.createElement('p');
  subtitle.className = 'panel-subtitle';
  subtitle.textContent = 'Unlock bonuses by earning motes';
  panel.appendChild(subtitle);

  interface CardRefs {
    card: HTMLElement;
    iconEl: HTMLElement;
    nameEl: HTMLElement;
    bonusEl: HTMLElement;
    descEl: HTMLElement;
    progressEl: HTMLElement;
  }
  const cardRefs: Map<string, CardRefs> = new Map();

  for (const def of ACHIEVEMENT_DEFINITIONS) {
    const tier = TIER_BY_ID.get(def.requiresTierId);

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
    const bonusLabel = def.bonusKind === 'tap_multiplier' ? 'Tap' : 'Loom';
    const bonusPct = Math.round((def.bonusMultiplier - 1) * 100);
    bonusEl.textContent = def.isSecret ? '???' : `+${bonusPct}% ${bonusLabel}`;
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

    // Click to claim earned-but-unclaimed achievements
    card.addEventListener('click', () => {
      const isEarned = card.classList.contains('achievement-earned-unclaimed');
      if (!isEarned) return;
      dispatch({ kind: 'claim_achievement', achievementId: def.id });
      const bonusLabel2 = def.bonusKind === 'tap_multiplier' ? 'Tap' : 'Loom';
      const bonusPct2 = Math.round((def.bonusMultiplier - 1) * 100);
      showRewardPopup(card, `+${bonusPct2}% ${bonusLabel2}!`);
    });

    panel.appendChild(card);
    cardRefs.set(def.id, { card, iconEl, nameEl, bonusEl, descEl, progressEl });
  }

  // Periodically scramble text on locked secret achievements
  setInterval(() => {
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (!def.isSecret) continue;
      const refs = cardRefs.get(def.id);
      if (!refs) continue;
      const { card, nameEl, descEl } = refs;
      // Only scramble if still locked (not yet unlocked)
      if (card.classList.contains('achievement-locked')) {
        nameEl.textContent = makeScrambledText(def.displayName.length);
        descEl.textContent = makeScrambledText(def.description.length);
      }
    }
  }, 600);

  function update(state: GameState, numberFormat: NumberFormat): void {
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

      const bonusLabel = def.bonusKind === 'tap_multiplier' ? 'Tap' : 'Loom';
      const bonusPct = Math.round((def.bonusMultiplier - 1) * 100);

      if (isUnlocked) {
        iconEl.textContent = isClaimed ? '🏆' : '✨';

        if (def.isSecret) {
          nameEl.style.fontFamily = "'Poiret One', sans-serif";
          descEl.style.fontFamily = "'Poiret One', sans-serif";
          nameEl.style.color = TIER_BY_ID.get(def.requiresTierId)?.color ?? '#888';
        }
        nameEl.textContent = def.displayName;
        descEl.textContent = def.description;
        bonusEl.textContent = isClaimed ? `+${bonusPct}% ${bonusLabel}` : '✨ Tap to claim!';
        bonusEl.style.color = isClaimed ? '#a0e080' : '#ffd700';

        const progressText = isClaimed ? '✓ Claimed' : '✨ Earned — tap to claim your bonus!';
        progressEl.textContent = progressText;
      } else {
        iconEl.textContent = def.isSecret ? '🔒' : '🔒';
        if (!def.isSecret) {
          // Normal locked achievement: show real name and progress
          nameEl.textContent = def.displayName;
          descEl.textContent = def.description;
          bonusEl.textContent = `+${bonusPct}% ${bonusLabel}`;
          bonusEl.style.color = '';
          const lifetime = getLifetimeMotes(state.resources, def.requiresTierId);
          progressEl.textContent = `Progress: ${formatNumberAs(lifetime, numberFormat)} / ${formatNumberAs(def.requiresLifetimeMotes, numberFormat)} ${TIER_BY_ID.get(def.requiresTierId)?.displayName ?? ''} motes`;
        } else {
          // Secret locked achievement: scramble is handled by the interval above
          bonusEl.textContent = '???';
          bonusEl.style.color = '';
          progressEl.textContent = '???';
        }
      }
    }
  }

  return { element: panel, update };
}
