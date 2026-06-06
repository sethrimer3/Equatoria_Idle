/**
 * achievements-panel-dom.ts — DOM construction helpers for the achievements panel.
 *
 * Extracted from achievements-panel.ts to keep that file focused on state
 * management, animations, and the update loop.
 *
 * Exports:
 *   - Text helpers: bonusText, getAccentColor, makeScrambledText, randomGlyphChar
 *   - Ref types:    CardRefs, SubcategoryRefs, GroupRefs
 *   - buildAchievementsDom — builds all group/subcategory/card DOM elements and
 *     returns { cardRefs, groupRefs } for the panel to use
 */

import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENT_SUBCATEGORIES,
} from '../../data/achievements';
import type { AchievementCondition } from '../../data/achievements/achievement-definitions';
import { TIER_BY_ID } from '../../data/tiers';
import { getMoteIconPath } from '../../render/assets/asset-paths';

// ── Text helpers ──────────────────────────────────────────────────────────────

const GLYPH_CHARS = Array.from(
  { length: 0x1676 - 0x1401 + 1 },
  (_, i) => String.fromCodePoint(0x1401 + i),
).join('');

export function randomGlyphChar(): string {
  return GLYPH_CHARS[Math.floor(Math.random() * GLYPH_CHARS.length)];
}

export function makeScrambledText(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += randomGlyphChar();
  return s;
}

/** Returns a display string like "+50% Tap" for an achievement's bonus. */
export function bonusText(bonusKind: string, bonusMultiplier: number): string {
  if (bonusKind === 'base_atk') return `+${bonusMultiplier} ATK`;
  const label = bonusKind === 'tap_multiplier' ? 'Tap' : 'Loom';
  const pct = Math.round((bonusMultiplier - 1) * 100);
  return `+${pct}% ${label}`;
}

export function getAccentColor(condition: AchievementCondition, displayColor?: string): string {
  if (displayColor) return displayColor;
  if (condition.kind === 'lifetime_motes') {
    return TIER_BY_ID.get(condition.tierId)?.color ?? '#888';
  }
  return '#888';
}

// ── DOM ref types ─────────────────────────────────────────────────────────────

export interface CardRefs {
  card: HTMLElement;
  iconEl: HTMLElement;
  nameEl: HTMLElement;
  bonusEl: HTMLElement;
  descEl: HTMLElement;
  progressEl: HTMLElement;
  groupId: string;
  subcategoryId?: string;
  /** True if this achievement is isSecret or isHiddenCriteria. */
  isHiddenType: boolean;
}

export interface SubcategoryRefs {
  section: HTMLElement;
  toggle: HTMLButtonElement;
  countEl: HTMLElement;
  inner: HTMLElement;
  achievementIds: string[];
}

export interface GroupRefs {
  toggle: HTMLButtonElement;
  countEl: HTMLElement;
  inner: HTMLElement;
  achievementIds: string[];
  subcategoryRefs: Map<string, SubcategoryRefs>;
  /** Element shown when all cards are filtered out. */
  emptyMsg: HTMLElement;
}

// ── DOM callbacks ─────────────────────────────────────────────────────────────

/** Callbacks wired by the panel factory into the built DOM. */
export interface AchievementsDomCallbacks {
  /** Fired when a group header toggle is clicked with the group's ID. */
  onGroupToggle(groupId: string): void;
  /** Fired when a subcategory toggle is clicked with its group and sub IDs. */
  onSubcategoryToggle(groupId: string, subId: string): void;
  /**
   * Fired when an earned-unclaimed card is tapped.
   * @param achievementId - The achievement's canonical ID.
   * @param formattedBonus - Pre-formatted bonus text (e.g. "+50% Tap").
   */
  onCardClaim(achievementId: string, formattedBonus: string): void;
}

// ── DOM builder ───────────────────────────────────────────────────────────────

/**
 * Builds all group accordion sections, subcategory accordions, and achievement
 * cards, appending them into `groupsRoot`. Returns populated ref maps for use
 * by the panel's update and animation logic.
 */
export function buildAchievementsDom(
  groupsRoot: HTMLElement,
  callbacks: AchievementsDomCallbacks,
): { cardRefs: Map<string, CardRefs>; groupRefs: Map<string, GroupRefs> } {
  const cardRefs: Map<string, CardRefs> = new Map();
  const groupRefs: Map<string, GroupRefs> = new Map();

  for (const group of ACHIEVEMENT_GROUPS) {
    const groupEl = document.createElement('section');
    groupEl.className = 'achievement-group';

    const toggle = document.createElement('button');
    toggle.className = 'achievement-group-toggle';
    toggle.type = 'button';
    toggle.setAttribute('aria-expanded', 'false');

    const left = document.createElement('span');
    left.className = 'achievement-group-toggle-left';
    const iconSpan = document.createElement('span');
    iconSpan.className = 'achievement-group-icon';
    iconSpan.textContent = group.icon;
    const labelSpan = document.createElement('span');
    labelSpan.className = 'achievement-group-label';
    labelSpan.textContent = group.name;
    left.appendChild(iconSpan);
    left.appendChild(labelSpan);

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
    toggle.addEventListener('click', () => callbacks.onGroupToggle(group.id));

    // Content wrapper — CSS grid accordion (no max-height limit)
    const contentWrapper = document.createElement('div');
    contentWrapper.className = 'achievement-group-content';

    const inner = document.createElement('div');
    inner.className = 'achievement-group-inner';
    contentWrapper.appendChild(inner);

    // Empty message (shown when all cards are filtered out)
    const emptyMsg = document.createElement('div');
    emptyMsg.className = 'ach-empty-msg';
    emptyMsg.textContent = 'No achievements match the current filters.';
    emptyMsg.style.display = 'none';
    inner.appendChild(emptyMsg);

    groupEl.appendChild(toggle);
    groupEl.appendChild(contentWrapper);
    groupsRoot.appendChild(groupEl);

    const subcategoryRefs: Map<string, SubcategoryRefs> = new Map();
    const allGroupAchievementIds: string[] = [];

    // Subcategories within this group
    const groupSubcategories = ACHIEVEMENT_SUBCATEGORIES.filter(sub => sub.groupId === group.id);

    if (groupSubcategories.length > 0) {
      // Build subcategory accordions
      for (const sub of groupSubcategories) {
        const subAchievements = ACHIEVEMENT_DEFINITIONS.filter(
          d => d.groupId === group.id && d.subcategoryId === sub.id,
        );
        if (subAchievements.length === 0) continue;

        const subEl = document.createElement('section');
        subEl.className = 'ach-sub-group';

        const subToggle = document.createElement('button');
        subToggle.className = 'ach-sub-toggle';
        subToggle.type = 'button';
        subToggle.setAttribute('aria-expanded', 'false');

        const subLeft = document.createElement('span');
        subLeft.className = 'ach-sub-toggle-left';
        const subIcon = sub.moteIconTierId
          ? document.createElement('img')
          : document.createElement('span');
        subIcon.className = 'ach-sub-icon';
        if (sub.moteIconTierId) {
          subIcon.setAttribute('src', getMoteIconPath(sub.moteIconTierId));
          subIcon.setAttribute('alt', '');
          subIcon.setAttribute('aria-hidden', 'true');
        } else {
          subIcon.textContent = sub.icon;
        }
        const subLabel = document.createElement('span');
        subLabel.className = 'ach-sub-label';
        subLabel.textContent = sub.name;
        subLeft.appendChild(subIcon);
        subLeft.appendChild(subLabel);

        const subRight = document.createElement('span');
        subRight.className = 'ach-sub-toggle-right';
        const subCount = document.createElement('span');
        subCount.className = 'ach-sub-count';
        subCount.textContent = '0/0';
        const subChevron = document.createElement('span');
        subChevron.className = 'ach-sub-chevron';
        subChevron.textContent = '▾';
        subRight.appendChild(subCount);
        subRight.appendChild(subChevron);

        subToggle.appendChild(subLeft);
        subToggle.appendChild(subRight);
        subToggle.addEventListener('click', () => callbacks.onSubcategoryToggle(group.id, sub.id));

        const subContent = document.createElement('div');
        subContent.className = 'ach-sub-content';
        const subInner = document.createElement('div');
        subInner.className = 'ach-sub-inner';
        subContent.appendChild(subInner);

        subEl.appendChild(subToggle);
        subEl.appendChild(subContent);
        inner.appendChild(subEl);

        const subAchIds: string[] = [];
        for (const def of subAchievements) {
          subAchIds.push(def.id);
          allGroupAchievementIds.push(def.id);
          appendCard(def, subInner, cardRefs, callbacks);
        }

        subcategoryRefs.set(sub.id, {
          section: subEl,
          toggle: subToggle,
          countEl: subCount,
          inner: subInner,
          achievementIds: subAchIds,
        });
      }

      // Achievements in this group without a subcategoryId (fallback)
      const unsortedAchievements = ACHIEVEMENT_DEFINITIONS.filter(
        d => d.groupId === group.id && !d.subcategoryId,
      );
      for (const def of unsortedAchievements) {
        allGroupAchievementIds.push(def.id);
        appendCard(def, inner, cardRefs, callbacks);
      }
    } else {
      // No subcategories — add cards directly to inner
      for (const def of ACHIEVEMENT_DEFINITIONS) {
        if (def.groupId !== group.id) continue;
        allGroupAchievementIds.push(def.id);
        appendCard(def, inner, cardRefs, callbacks);
      }
    }

    groupRefs.set(group.id, {
      toggle,
      countEl,
      inner,
      achievementIds: allGroupAchievementIds,
      subcategoryRefs,
      emptyMsg,
    });
  }

  return { cardRefs, groupRefs };
}

// ── Card builder (private) ────────────────────────────────────────────────────

function appendCard(
  def: (typeof ACHIEVEMENT_DEFINITIONS)[number],
  container: HTMLElement,
  cardRefs: Map<string, CardRefs>,
  callbacks: AchievementsDomCallbacks,
): void {
  const accentColor = getAccentColor(def.condition, def.displayColor);
  const isHiddenType = !!(def.isSecret || def.isHiddenCriteria);

  const card = document.createElement('div');
  card.className = 'achievement-card';
  card.style.borderLeftColor = accentColor;

  const header = document.createElement('div');
  header.className = 'achievement-header';

  const iconEl = document.createElement('span');
  iconEl.className = 'achievement-icon';
  iconEl.textContent = '🏆';
  header.appendChild(iconEl);

  const nameEl = document.createElement('span');
  nameEl.className = 'achievement-name';
  nameEl.style.color = accentColor;
  // Secret achievements start with scrambled name; hidden-criteria show real name
  if (def.isSecret) {
    nameEl.textContent = makeScrambledText(def.displayName.length);
    nameEl.style.fontFamily = "'BJ Cree', monospace";
    nameEl.style.letterSpacing = '0.05em';
  } else {
    nameEl.textContent = def.displayName;
  }
  header.appendChild(nameEl);

  const bonusEl = document.createElement('span');
  bonusEl.className = 'achievement-bonus';
  bonusEl.textContent = def.isSecret ? '???' : bonusText(def.bonusKind, def.bonusMultiplier);
  header.appendChild(bonusEl);

  card.appendChild(header);

  const descEl = document.createElement('p');
  descEl.className = 'achievement-desc';
  if (def.isSecret) {
    descEl.textContent = makeScrambledText(def.description.length);
    descEl.style.fontFamily = "'BJ Cree', monospace";
    descEl.style.letterSpacing = '0.05em';
  } else {
    descEl.textContent = def.description;
  }
  card.appendChild(descEl);

  const progressEl = document.createElement('div');
  progressEl.className = 'achievement-progress';
  if (def.isHiddenCriteria) {
    progressEl.textContent = makeScrambledText(12);
    progressEl.style.fontFamily = "'BJ Cree', monospace";
  }
  card.appendChild(progressEl);

  card.addEventListener('click', () => {
    if (!card.classList.contains('achievement-earned-unclaimed')) return;
    callbacks.onCardClaim(def.id, bonusText(def.bonusKind, def.bonusMultiplier));
  });

  container.appendChild(card);
  cardRefs.set(def.id, {
    card,
    iconEl,
    nameEl,
    bonusEl,
    descEl,
    progressEl,
    groupId: def.groupId,
    subcategoryId: def.subcategoryId,
    isHiddenType,
  });
}
