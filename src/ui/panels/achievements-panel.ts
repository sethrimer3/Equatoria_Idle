import type { GameState } from '../../sim';
import { ACHIEVEMENT_DEFINITIONS, ACHIEVEMENT_GROUPS } from '../../data/achievements';
import { getClaimableCount } from '../../sim/achievements';
import { type NumberFormat } from '../../util';
import type { ActionHandler } from '../../input';
import type { AudioSystem } from '../../audio';
import { makePageBreak } from '../ui-helpers';
import { getProgressText } from '../achievements/achievement-progress-text';
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
  SPARKLE_SIZE,
  SPARKLE_VERTICAL_BIAS_Y,
  randomInRange,
} from '../achievements/sparkle-shared';
import {
  buildAchievementsDom,
  bonusText,
  getAccentColor,
  randomGlyphChar,
  type CardRefs,
  type GroupRefs,
} from './achievements-panel-dom';

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

// ─── Per-character glyph animation state ────────────────────────

interface GlyphEntry {
  /** Element whose textContent is updated with scrambled text. */
  el: HTMLElement;
  /** Length of the original text (number of characters to scramble). */
  len: number;
  /** Current scrambled characters, one per position. */
  chars: string[];
  /** Frames until next character mutation. Randomised per-entry for variety. */
  frameCountdown: number;
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
  const sparkleEmitters: Map<HTMLElement, SparkleEmitter> = new Map();

  function createSparkle(host: HTMLElement): void {
    const sparkle = document.createElement('span');
    sparkle.className = 'achievement-sparkle';
    sparkle.style.width = `${SPARKLE_SIZE}px`;
    sparkle.style.height = `${SPARKLE_SIZE}px`;
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
    if (existing.timeoutId !== null) window.clearTimeout(existing.timeoutId);
    sparkleEmitters.delete(host);
    host.classList.remove('achievement-sparkle-host');
    for (const sparkle of host.querySelectorAll('.achievement-sparkle')) sparkle.remove();
  }

  function stopAllSparkles(): void {
    for (const host of sparkleEmitters.keys()) setSparkleEmitter(host, false);
  }

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

  // ── Per-character glyph animation ─────────────────────────────
  /**
   * Active glyph entries: only achievements that are visible (show-hidden=on,
   * not yet earned) and have hidden content.
   */
  const glyphEntries: GlyphEntry[] = [];

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function buildGlyphEntry(el: HTMLElement, length: number): GlyphEntry {
    const chars = Array.from({ length }, () => randomGlyphChar());
    el.textContent = chars.join('');
    // Stagger initial countdown so entries don't all fire on the same frame
    const frameCountdown = 1 + Math.floor(Math.random() * 5);
    return { el, len: length, chars, frameCountdown };
  }

  function rebuildGlyphEntries(): void {
    glyphEntries.length = 0;
    if (!filterShowHidden) return;
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (!def.isSecret && !def.isHiddenCriteria) continue;
      const refs = cardRefs.get(def.id);
      if (!refs) continue;
      // Only animate cards that are currently visible and showing glyph content
      if (!cardIsVisible(refs)) continue;
      const isUnlocked = refs.card.classList.contains('achievement-unlocked') ||
                         refs.card.classList.contains('achievement-earned-unclaimed');
      if (isUnlocked) continue;
      if (def.isSecret) {
        glyphEntries.push(buildGlyphEntry(refs.nameEl, def.displayName.length));
        glyphEntries.push(buildGlyphEntry(refs.descEl, def.description.length));
      }
      if (def.isHiddenCriteria) {
        glyphEntries.push(buildGlyphEntry(refs.progressEl, 12));
      }
    }
    startGlyphAnimation();
  }

  /** RAF handle for the glyph animation loop. */
  let glyphRafId: number | null = null;
  let glyphAnimating = false;

  function glyphFrame(): void {
    if (glyphEntries.length === 0) {
      glyphAnimating = false;
      glyphRafId = null;
      return;
    }
    // Under reduced-motion, update very slowly (one change every ~3 seconds)
    const skipProbability = prefersReducedMotion ? 0.98 : 0;
    for (const entry of glyphEntries) {
      if (prefersReducedMotion && Math.random() < skipProbability) continue;
      entry.frameCountdown--;
      if (entry.frameCountdown <= 0) {
        // Mutate exactly one random character
        const idx = Math.floor(Math.random() * entry.len);
        entry.chars[idx] = randomGlyphChar();
        entry.el.textContent = entry.chars.join('');
        // Reset countdown to 1–5 frames for this entry
        entry.frameCountdown = 1 + Math.floor(Math.random() * 5);
      }
    }
    glyphRafId = requestAnimationFrame(glyphFrame);
  }

  function startGlyphAnimation(): void {
    if (glyphAnimating || glyphEntries.length === 0) return;
    glyphAnimating = true;
    glyphRafId = requestAnimationFrame(glyphFrame);
  }

  function stopGlyphAnimation(): void {
    if (glyphRafId !== null) cancelAnimationFrame(glyphRafId);
    glyphRafId = null;
    glyphAnimating = false;
  }

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
