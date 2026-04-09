import type { GameState } from '../../sim';
import { ACHIEVEMENT_DEFINITIONS } from '../../data/achievements';
import { TIER_BY_ID } from '../../data/tiers';
import { formatNumberAs, type NumberFormat } from '../../util';
import { getLifetimeMotes } from '../../sim/resources';

/**
 * Achievements panel — shows all achievements, their requirements, and bonuses.
 * Locked achievements are shown with progress; unlocked ones are highlighted.
 */
export interface AchievementsPanel {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
}

export function createAchievementsPanel(): AchievementsPanel {
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

  const cards: Map<string, HTMLElement> = new Map();

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
    nameEl.textContent = def.displayName;
    header.appendChild(nameEl);

    const bonusEl = document.createElement('span');
    bonusEl.className = 'achievement-bonus';
    const bonusLabel = def.bonusKind === 'tap_multiplier' ? 'Tap' : 'Loom';
    const bonusPct = Math.round((def.bonusMultiplier - 1) * 100);
    bonusEl.textContent = `+${bonusPct}% ${bonusLabel}`;
    header.appendChild(bonusEl);

    card.appendChild(header);

    const descEl = document.createElement('p');
    descEl.className = 'achievement-desc';
    descEl.textContent = def.description;
    card.appendChild(descEl);

    const progressEl = document.createElement('div');
    progressEl.className = 'achievement-progress';
    card.appendChild(progressEl);

    panel.appendChild(card);
    cards.set(def.id, card);
  }

  function update(state: GameState, numberFormat: NumberFormat): void {
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      const card = cards.get(def.id);
      if (!card) continue;

      const isUnlocked = state.achievements.unlockedIds.has(def.id);
      card.classList.toggle('achievement-unlocked', isUnlocked);
      card.classList.toggle('achievement-locked', !isUnlocked);

      const iconEl = card.querySelector('.achievement-icon');
      if (iconEl) {
        iconEl.textContent = isUnlocked ? '🏆' : '🔒';
      }

      const progressEl = card.querySelector('.achievement-progress');
      if (progressEl) {
        const lifetime = getLifetimeMotes(state.resources, def.requiresTierId);
        if (isUnlocked) {
          progressEl.textContent = '✓ Unlocked';
        } else {
          progressEl.textContent = `Progress: ${formatNumberAs(lifetime, numberFormat)} / ${formatNumberAs(def.requiresLifetimeMotes, numberFormat)} ${TIER_BY_ID.get(def.requiresTierId)?.displayName ?? ''} motes`;
        }
      }
    }
  }

  return { element: panel, update };
}
