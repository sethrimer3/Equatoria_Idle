import type { GameState } from '../../sim';
import { ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_GROUPS } from '../../data/achievements';
import { getClaimableCount } from '../../sim/achievements';
import { type NumberFormat } from '../../util';
import type { ActionHandler } from '../../input';
import type { AudioSystem } from '../../audio';
import { makePageBreak } from '../ui-helpers';
import { getProgressText } from '../achievements/achievement-progress-text';
import {
  buildAchievementsDom,
  bonusText,
  getAccentColor,
  type CardRefs,
  type GroupRefs,
} from './achievements-panel-dom';
import { createSparkleSystem } from './achievements-panel-sparkle';
import { createGlyphSystem } from './achievements-panel-glyph';

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

  // Forward-declare so setOpenGroup/setOpenSubcategory can close over them
  // before buildAchievementsDom populates the values.
  let cardRefs!: Map<string, CardRefs>;
  let groupRefs!: Map<string, GroupRefs>;

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
  cardRefs = domRefs.cardRefs;
  groupRefs = domRefs.groupRefs;

  setOpenGroup(openMainCategoryId);

  // ── Glyph animation system ────────────────────────────────────
  const glyph = createGlyphSystem({
    getCardRefs: () => cardRefs,
    getFilterShowHidden: () => filterShowHidden,
  });
  const { rebuildGlyphEntries, startGlyphAnimation, stopGlyphAnimation } = glyph;

  // ── Filter application ────────────────────────────────────────
  /**
   * Determines whether a card should be shown based on filter state.
   * Uses the latest unlocked/claimed state stored on the card element.
   */
  function cardIsVisible(refs: CardRefs): boolean {
    const isUnlocked = refs.card.classList.contains('achievement-unlocked') ||
                       refs.card.classList.contains('achievement-earned-unclaimed');
    const isHidden = refs.isHiddenType;

    if (isUnlocked) return filterShowEarned;
    if (isHidden)   return filterShowHidden;
    return filterShowUnearned;
  }

  function applyFilters(): void {
    for (const [, refs] of cardRefs) {
      refs.card.style.display = cardIsVisible(refs) ? '' : 'none';
    }

    // Update subcategory visibility (hide section if no visible cards)
    for (const [, groupRef] of groupRefs) {
      let anyVisibleInGroup = false;

      for (const [, sub] of groupRef.subcategoryRefs) {
        let anyVisibleInSub = false;
        for (const achId of sub.achievementIds) {
          const r = cardRefs.get(achId);
          if (r && r.card.style.display !== 'none') {
            anyVisibleInSub = true;
            break;
          }
        }
        sub.section.style.display = anyVisibleInSub ? '' : 'none';
        if (anyVisibleInSub) anyVisibleInGroup = true;
      }

      // Also check achievements directly in the group (no subcategory)
      for (const achId of groupRef.achievementIds) {
        const r = cardRefs.get(achId);
        if (r && !r.subcategoryId && r.card.style.display !== 'none') {
          anyVisibleInGroup = true;
          break;
        }
      }

      groupRef.emptyMsg.style.display = anyVisibleInGroup ? 'none' : '';
    }

    // Rebuild glyph entries since visibility may have changed
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

    const unclaimedByGroup = new Map<string, number>();
    const claimedByGroup = new Map<string, number>();
    const totalByGroup = new Map<string, number>();
    const claimedBySub = new Map<string, number>();
    const totalBySub = new Map<string, number>();
    const unclaimedBySub = new Map<string, number>();

    let needGlyphRebuild = false;

    for (const def of ACHIEVEMENT_DEFINITIONS) {
      const refs = cardRefs.get(def.id);
      if (!refs) continue;
      const { card, iconEl, nameEl, bonusEl, descEl, progressEl } = refs;

      const isUnlocked = state.achievements.unlockedIds.has(def.id);
      const isClaimed = state.achievements.claimedIds.has(def.id);
      const isEarnedUnclaimed = isUnlocked && !isClaimed;

      // Track previous state to detect transitions (for glyph rebuild)
      const wasLocked = card.classList.contains('achievement-locked');

      card.classList.toggle('achievement-unlocked', isUnlocked && isClaimed);
      card.classList.toggle('achievement-locked', !isUnlocked);
      card.classList.toggle('achievement-earned-unclaimed', isEarnedUnclaimed);

      if (wasLocked && isUnlocked) needGlyphRebuild = true;

      const defBonusText = bonusText(def.bonusKind, def.bonusMultiplier);

      if (isUnlocked) {
        iconEl.textContent = isClaimed ? '🏆' : '✨';

        // Restore normal font if it was previously scrambled
        if (def.isSecret) {
          nameEl.style.fontFamily = "'Poiret One', sans-serif";
          nameEl.style.letterSpacing = '';
          descEl.style.fontFamily = "'Poiret One', sans-serif";
          descEl.style.letterSpacing = '';
          nameEl.style.color = getAccentColor(def.condition, def.displayColor);
        }
        if (def.isHiddenCriteria) {
          progressEl.style.fontFamily = '';
        }

        nameEl.textContent = def.displayName;
        descEl.textContent = def.description;
        bonusEl.textContent = isClaimed ? defBonusText : '✨ Tap to claim!';
        bonusEl.style.color = isClaimed ? '#a0e080' : '#ffd700';
        progressEl.textContent = isClaimed ? '✓ Claimed' : '✨ Earned — tap to claim your bonus!';
      } else {
        iconEl.textContent = '🔒';

        if (def.isSecret) {
          if (filterShowHidden) {
            // Glyph is managed by the glyph interval — just ensure font is set
            nameEl.style.fontFamily = "'BJ Cree', monospace";
            nameEl.style.letterSpacing = '0.05em';
            descEl.style.fontFamily = "'BJ Cree', monospace";
            descEl.style.letterSpacing = '0.05em';
          }
          bonusEl.textContent = '???';
          bonusEl.style.color = '';
          progressEl.textContent = '???';
        } else if (def.isHiddenCriteria) {
          nameEl.textContent = def.displayName;
          descEl.textContent = def.description;
          bonusEl.textContent = defBonusText;
          bonusEl.style.color = '';
          if (filterShowHidden) {
            progressEl.style.fontFamily = "'BJ Cree', monospace";
            // Glyph text managed by interval
          } else {
            progressEl.style.fontFamily = '';
            progressEl.textContent = '??? (criteria hidden)';
          }
        } else {
          nameEl.textContent = def.displayName;
          descEl.textContent = def.description;
          bonusEl.textContent = defBonusText;
          bonusEl.style.color = '';
          progressEl.style.fontFamily = '';
          progressEl.textContent = getProgressText(def.condition, state, numberFormat);
        }
      }

      // Accumulate counts
      totalByGroup.set(def.groupId, (totalByGroup.get(def.groupId) ?? 0) + 1);
      if (def.subcategoryId) {
        totalBySub.set(def.subcategoryId, (totalBySub.get(def.subcategoryId) ?? 0) + 1);
      }
      if (isClaimed) {
        claimedByGroup.set(def.groupId, (claimedByGroup.get(def.groupId) ?? 0) + 1);
        if (def.subcategoryId) {
          claimedBySub.set(def.subcategoryId, (claimedBySub.get(def.subcategoryId) ?? 0) + 1);
        }
      } else if (isEarnedUnclaimed) {
        unclaimedByGroup.set(def.groupId, (unclaimedByGroup.get(def.groupId) ?? 0) + 1);
        if (def.subcategoryId) {
          unclaimedBySub.set(def.subcategoryId, (unclaimedBySub.get(def.subcategoryId) ?? 0) + 1);
        }
      }

      // Sparkle: only if visible, panel open, earned-unclaimed, in open group
      const inOpenGroup = openMainCategoryId === def.groupId;
      const inOpenSub = !def.subcategoryId || openSubcategoryId === def.subcategoryId;
      const cardShouldSparkle = isPanelVisible && isEarnedUnclaimed && inOpenGroup && inOpenSub;
      setSparkleEmitter(card, cardShouldSparkle);
    }

    // Update group header counts and sparkle
    for (const [groupId, refs] of groupRefs) {
      const total = totalByGroup.get(groupId) ?? 0;
      const claimed = claimedByGroup.get(groupId) ?? 0;
      const hasUnclaimed = (unclaimedByGroup.get(groupId) ?? 0) > 0;

      refs.countEl.textContent = `${claimed}/${total}`;
      refs.toggle.classList.toggle('achievement-group-toggle--has-unclaimed', hasUnclaimed);

      setSparkleEmitter(refs.toggle, isPanelVisible && hasUnclaimed);

      // Update subcategory header counts and unclaimed highlight
      for (const [subId, subRef] of refs.subcategoryRefs) {
        const subTotal = totalBySub.get(subId) ?? 0;
        const subClaimed = claimedBySub.get(subId) ?? 0;
        const subHasUnclaimed = (unclaimedBySub.get(subId) ?? 0) > 0;
        subRef.countEl.textContent = `${subClaimed}/${subTotal}`;
        subRef.toggle.classList.toggle('ach-sub-toggle--has-unclaimed', subHasUnclaimed);
        setSparkleEmitter(subRef.toggle, isPanelVisible && subHasUnclaimed);
      }
    }

    // Apply visibility filters (updates card display, subcategory sections, empty msg)
    applyFilters();

    if (needGlyphRebuild) rebuildGlyphEntries();
  }

  // Initial glyph setup
  rebuildGlyphEntries();
  startGlyphAnimation();

  return { element: panel, update, setVisible, destroy };
}
