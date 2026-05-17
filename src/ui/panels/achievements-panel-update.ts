import type { GameState } from '../../sim';
import type { NumberFormat } from '../../util';
import { ACHIEVEMENT_DEFINITIONS } from '../../data/achievements';
import { getProgressText } from '../achievements/achievement-progress-text';
import {
  bonusText,
  getAccentColor,
  type CardRefs,
  type GroupRefs,
} from './achievements-panel-dom';

export interface AchievementFilterFlags {
  showEarned: boolean;
  showUnearned: boolean;
  showHidden: boolean;
}

export interface AchievementsUpdateParams {
  state: GameState;
  numberFormat: NumberFormat;
  cardRefs: Map<string, CardRefs>;
  groupRefs: Map<string, GroupRefs>;
  isPanelVisible: boolean;
  openMainCategoryId: string | null;
  openSubcategoryId: string | null;
  filterShowHidden: boolean;
  setSparkleEmitter(host: HTMLElement, enabled: boolean): void;
}

export function cardIsVisible(refs: CardRefs, filters: AchievementFilterFlags): boolean {
  const isUnlocked = refs.card.classList.contains('achievement-unlocked') ||
                     refs.card.classList.contains('achievement-earned-unclaimed');
  const isHidden = refs.isHiddenType;

  if (isUnlocked) return filters.showEarned;
  if (isHidden) return filters.showHidden;
  return filters.showUnearned;
}

export function applyAchievementFilters(
  cardRefs: Map<string, CardRefs>,
  groupRefs: Map<string, GroupRefs>,
  filters: AchievementFilterFlags,
): void {
  for (const [, refs] of cardRefs) {
    refs.card.style.display = cardIsVisible(refs, filters) ? '' : 'none';
  }

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

    for (const achId of groupRef.achievementIds) {
      const r = cardRefs.get(achId);
      if (r && !r.subcategoryId && r.card.style.display !== 'none') {
        anyVisibleInGroup = true;
        break;
      }
    }

    groupRef.emptyMsg.style.display = anyVisibleInGroup ? 'none' : '';
  }
}

export function updateAchievementCardsAndGroupHeaders(params: AchievementsUpdateParams): { needGlyphRebuild: boolean } {
  const {
    state,
    numberFormat,
    cardRefs,
    groupRefs,
    isPanelVisible,
    openMainCategoryId,
    openSubcategoryId,
    filterShowHidden,
    setSparkleEmitter,
  } = params;

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

    const wasLocked = card.classList.contains('achievement-locked');

    card.classList.toggle('achievement-unlocked', isUnlocked && isClaimed);
    card.classList.toggle('achievement-locked', !isUnlocked);
    card.classList.toggle('achievement-earned-unclaimed', isEarnedUnclaimed);

    if (wasLocked && isUnlocked) needGlyphRebuild = true;

    const defBonusText = bonusText(def.bonusKind, def.bonusMultiplier);

    if (isUnlocked) {
      iconEl.textContent = isClaimed ? '🏆' : '✨';

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

    const inOpenGroup = openMainCategoryId === def.groupId;
    const inOpenSub = !def.subcategoryId || openSubcategoryId === def.subcategoryId;
    const cardShouldSparkle = isPanelVisible && isEarnedUnclaimed && inOpenGroup && inOpenSub;
    setSparkleEmitter(card, cardShouldSparkle);
  }

  for (const [groupId, refs] of groupRefs) {
    const total = totalByGroup.get(groupId) ?? 0;
    const claimed = claimedByGroup.get(groupId) ?? 0;
    const hasUnclaimed = (unclaimedByGroup.get(groupId) ?? 0) > 0;

    refs.countEl.textContent = `${claimed}/${total}`;
    refs.toggle.classList.toggle('achievement-group-toggle--has-unclaimed', hasUnclaimed);

    setSparkleEmitter(refs.toggle, isPanelVisible && hasUnclaimed);

    for (const [subId, subRef] of refs.subcategoryRefs) {
      const subTotal = totalBySub.get(subId) ?? 0;
      const subClaimed = claimedBySub.get(subId) ?? 0;
      const subHasUnclaimed = (unclaimedBySub.get(subId) ?? 0) > 0;
      subRef.countEl.textContent = `${subClaimed}/${subTotal}`;
      subRef.toggle.classList.toggle('ach-sub-toggle--has-unclaimed', subHasUnclaimed);
      setSparkleEmitter(subRef.toggle, isPanelVisible && subHasUnclaimed);
    }
  }

  return { needGlyphRebuild };
}
