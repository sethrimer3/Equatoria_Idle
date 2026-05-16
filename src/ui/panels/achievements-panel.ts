import type { GameState } from '../../sim';
import { ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_GROUPS } from '../../data/achievements';
import { getClaimableCount } from '../../sim/achievements';
import { type NumberFormat } from '../../util';
import type { ActionHandler } from '../../input';
import type { AudioSystem } from '../../audio';
import { makePageBreak } from '../ui-helpers';
import {
  buildAchievementsDom,
} from './achievements-panel-dom';
import { createSparkleSystem } from './achievements-panel-sparkle';
import { createGlyphSystem } from './achievements-panel-glyph';
import {
  applyAchievementFilters,
  updateAchievementCardsAndGroupHeaders,
} from './achievements-panel-update';

/**
 * Achievements panel — grouped accordion cards with filter bar, nested
 * subcategories (RPG group), per-character glyph animation, and claim
 * interactions.
 */
export interface AchievementsPanel {
  element: HTMLElement;
  update(state: GameState, numberFormat: NumberFormat): void;
  setVisible(isVisible: boolean): void;
  /** Cancel all timers. Call when the panel is removed from the DOM. */
  destroy(): void;
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

  const titleEl = document.createElement('h3');
  titleEl.className = 'panel-title';
  titleEl.textContent = 'Achievements';
  panel.appendChild(titleEl);

  const subtitleEl = document.createElement('p');
  subtitleEl.className = 'panel-subtitle';
  subtitleEl.textContent = 'Tap glowing achievements to claim bonuses';
  panel.appendChild(subtitleEl);

  // ── Filter bar ────────────────────────────────────────────────
  let filterShowEarned = true;
  let filterShowUnearned = true;
  let filterShowHidden = false;

  const filterBar = document.createElement('div');
  filterBar.className = 'ach-filter-bar';

  function makeFilterCheckbox(label: string, checked: boolean, onChange: (v: boolean) => void): HTMLLabelElement {
    const lbl = document.createElement('label');
    lbl.className = 'ach-filter-label';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.className = 'ach-filter-checkbox';
    cb.checked = checked;
    cb.addEventListener('change', (e) => {
      e.stopPropagation();
      onChange(cb.checked);
      applyFilters();
    });
    lbl.appendChild(cb);
    lbl.appendChild(document.createTextNode(' ' + label));
    return lbl;
  }

  filterBar.appendChild(makeFilterCheckbox('Show earned',   filterShowEarned,   v => { filterShowEarned   = v; }));
  filterBar.appendChild(makeFilterCheckbox('Show unearned', filterShowUnearned, v => { filterShowUnearned  = v; }));
  filterBar.appendChild(makeFilterCheckbox('Show hidden',   filterShowHidden,   v => { filterShowHidden    = v; rebuildGlyphEntries(); }));
  panel.appendChild(filterBar);

  // ── Claim All button ──────────────────────────────────────────
  const claimAllRow = document.createElement('div');
  claimAllRow.className = 'ach-claim-all-row';

  const claimAllBtn = document.createElement('button');
  claimAllBtn.type = 'button';
  claimAllBtn.className = 'ach-claim-all-btn';
  claimAllBtn.textContent = '✨ Claim All';
  claimAllBtn.disabled = true;
  claimAllBtn.addEventListener('click', () => {
    dispatch({ kind: 'claim_all_achievements' });
    audioSystem?.onAchievementClaimed();
    enqueueReward('All bonuses claimed!');
  });

  const claimAllCount = document.createElement('span');
  claimAllCount.className = 'ach-claim-all-count';
  claimAllCount.textContent = '';

  claimAllRow.appendChild(claimAllBtn);
  claimAllRow.appendChild(claimAllCount);
  panel.appendChild(claimAllRow);

  const groupsRoot = document.createElement('div');
  groupsRoot.className = 'achievement-groups';
  panel.appendChild(groupsRoot);

  panel.appendChild(makePageBreak('small'));

  // ── Golden reward queue ───────────────────────────────────────
  const existingContainer = document.querySelector<HTMLElement>('.golden-text-container');
  const createdContainer = !existingContainer;
  const goldenTextContainer = existingContainer ?? document.createElement('div');
  if (createdContainer) {
    goldenTextContainer.className = 'golden-text-container';
    document.body.appendChild(goldenTextContainer);
  }

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

  // ── Sparkle system ─────────────────────────────────────────────
  const { setSparkleEmitter, stopAllSparkles } = createSparkleSystem();

  // ── UI accordion state ────────────────────────────────────────
  let openMainCategoryId: string | null = ACHIEVEMENT_GROUPS[0]?.id ?? null;
  let openSubcategoryId: string | null = null;
  let isPanelVisible = false;

  function setOpenGroup(nextId: string | null): void {
    openMainCategoryId = nextId;
    openSubcategoryId = null;

    for (const [groupId, refs] of groupRefs) {
      const isExpanded = groupId === openMainCategoryId;
      refs.toggle.setAttribute('aria-expanded', String(isExpanded));
      refs.toggle.classList.toggle('achievement-group-toggle--expanded', isExpanded);
      refs.inner.parentElement!.classList.toggle('achievement-group-content--expanded', isExpanded);

      if (!isExpanded) {
        for (const sub of refs.subcategoryRefs.values()) {
          sub.toggle.setAttribute('aria-expanded', 'false');
          sub.toggle.classList.remove('ach-sub-toggle--expanded');
          sub.inner.parentElement!.classList.remove('ach-sub-content--expanded');
          for (const achId of sub.achievementIds) {
            const r = cardRefs.get(achId);
            if (r) setSparkleEmitter(r.card, false);
          }
        }
      }
    }
  }

  function setOpenSubcategory(groupId: string, nextSubId: string | null): void {
    openSubcategoryId = nextSubId;
    const groupRef = groupRefs.get(groupId);
    if (!groupRef) return;
    for (const [subId, sub] of groupRef.subcategoryRefs) {
      const isExpanded = subId === openSubcategoryId;
      sub.toggle.setAttribute('aria-expanded', String(isExpanded));
      sub.toggle.classList.toggle('ach-sub-toggle--expanded', isExpanded);
      sub.inner.parentElement!.classList.toggle('ach-sub-content--expanded', isExpanded);
      if (!isExpanded) {
        for (const achId of sub.achievementIds) {
          const r = cardRefs.get(achId);
          if (r) setSparkleEmitter(r.card, false);
        }
      }
    }
  }

  // ── Build DOM ─────────────────────────────────────────────────
  const domRefs = buildAchievementsDom(groupsRoot, {
    onGroupToggle(groupId) {
      setOpenGroup(openMainCategoryId === groupId ? null : groupId);
    },
    onSubcategoryToggle(groupId, subId) {
      setOpenSubcategory(groupId, openSubcategoryId === subId ? null : subId);
    },
    onCardClaim(achievementId, formattedBonus) {
      dispatch({ kind: 'claim_achievement', achievementId });
      audioSystem?.onAchievementClaimed();
      enqueueReward(`${formattedBonus}!`);
    },
  });
  const { cardRefs, groupRefs } = domRefs;

  setOpenGroup(openMainCategoryId);

  // ── Glyph animation system ────────────────────────────────────
  const glyph = createGlyphSystem({
    getCardRefs: () => cardRefs,
    getFilterShowHidden: () => filterShowHidden,
  });
  const { rebuildGlyphEntries, startGlyphAnimation, stopGlyphAnimation } = glyph;

  // ── Filter application ────────────────────────────────────────
  function applyFilters(): void {
    applyAchievementFilters(cardRefs, groupRefs, {
      showEarned: filterShowEarned,
      showUnearned: filterShowUnearned,
      showHidden: filterShowHidden,
    });
    rebuildGlyphEntries();
  }

  // ── Main update ───────────────────────────────────────────────
  function setVisible(visible: boolean): void {
    isPanelVisible = visible;
    if (visible) return;
    stopAllSparkles();
  }

  function destroy(): void {
    stopGlyphAnimation();
    stopAllSparkles();
    if (createdContainer) goldenTextContainer.remove();
  }

  function update(state: GameState, numberFormat: NumberFormat): void {
    // Update Claim All button using shared helper
    const totalClaimable = getClaimableCount(state.achievements);
    claimAllBtn.disabled = totalClaimable === 0;
    claimAllBtn.classList.toggle('ach-claim-all-btn--active', totalClaimable > 0);
    claimAllCount.textContent = totalClaimable > 0 ? `${totalClaimable} ready` : '';

    const { needGlyphRebuild } = updateAchievementCardsAndGroupHeaders({
      state,
      numberFormat,
      cardRefs,
      groupRefs,
      isPanelVisible,
      openMainCategoryId,
      openSubcategoryId,
      filterShowHidden,
      setSparkleEmitter,
    });

    // Apply visibility filters (updates card display, subcategory sections, empty msg)
    applyFilters();

    if (needGlyphRebuild) rebuildGlyphEntries();
  }

  // Initial glyph setup
  rebuildGlyphEntries();
  startGlyphAnimation();

  return { element: panel, update, setVisible, destroy };
}
