import type { GameState } from '../../sim';
import {
  ACHIEVEMENT_DEFINITIONS,
  ACHIEVEMENT_GROUPS,
  ACHIEVEMENT_SUBCATEGORIES,
} from '../../data/achievements';
import type { AchievementCondition } from '../../data/achievements/achievement-definitions';
import { TIER_BY_ID, TIERS } from '../../data/tiers';
import { formatNumberAs, type NumberFormat } from '../../util';
import { getLifetimeMotes, getMotes, getEquivalence } from '../../sim/resources';
import { MAX_WEAPON_TIER } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import type { ActionHandler } from '../../input';
import type { AudioSystem } from '../../audio';
import { makePageBreak } from '../ui-helpers';
import { isTierAliveneable } from '../../sim/aliven';
import { BASE_TAP_VALUE, UPGRADE_TAP_MULTIPLIER } from '../../data/balance';
import { EQUATION_ROLE_BY_TIER } from '../../data/equation';
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

// ─── Scrambled text helpers ─────────────────────────────────────

const GLYPH_CHARS = Array.from(
  { length: 0x1676 - 0x1401 + 1 },
  (_, i) => String.fromCodePoint(0x1401 + i),
).join('');

function randomGlyphChar(): string {
  return GLYPH_CHARS[Math.floor(Math.random() * GLYPH_CHARS.length)];
}

function makeScrambledText(length: number): string {
  let s = '';
  for (let i = 0; i < length; i++) s += randomGlyphChar();
  return s;
}

/** Returns a display string like "+50% Tap" for an achievement's bonus. */
function bonusText(bonusKind: string, bonusMultiplier: number): string {
  if (bonusKind === 'base_atk') return `+${bonusMultiplier} ATK`;
  const label = bonusKind === 'tap_multiplier' ? 'Tap' : 'Loom';
  const pct = Math.round((bonusMultiplier - 1) * 100);
  return `+${pct}% ${label}`;
}

function getAccentColor(condition: AchievementCondition, displayColor?: string): string {
  if (displayColor) return displayColor;
  if (condition.kind === 'lifetime_motes') {
    return TIER_BY_ID.get(condition.tierId)?.color ?? '#888';
  }
  return '#888';
}

function getProgressText(
  condition: AchievementCondition,
  state: GameState,
  numberFormat: NumberFormat,
): string {
  switch (condition.kind) {
    case 'lifetime_motes': {
      const lifetime = getLifetimeMotes(state.resources, condition.tierId);
      const tierName = TIER_BY_ID.get(condition.tierId)?.displayName ?? '';
      return `Progress: ${formatNumberAs(lifetime, numberFormat)} / ${formatNumberAs(condition.amount, numberFormat)} ${tierName} motes`;
    }

    // ── New mote conditions ──────────────────────────────────────

    case 'any_tier_lifetime_motes': {
      let best = 0;
      for (const v of state.resources.lifetimeMotes.values()) {
        if (v > best) best = v;
      }
      return `Best single tier: ${formatNumberAs(best, numberFormat)} / ${formatNumberAs(condition.amount, numberFormat)}`;
    }

    case 'tiers_with_lifetime_motes': {
      let qualified = 0;
      for (const v of state.resources.lifetimeMotes.values()) {
        if (v >= condition.amount) qualified++;
      }
      return `Tiers with ≥${formatNumberAs(condition.amount, numberFormat)} lifetime: ${qualified} / ${condition.count}`;
    }

    case 'all_unlocked_tiers_lifetime_motes': {
      const unlocked = state.equation.segments.filter(s => s.isUnlocked);
      const qualifying = unlocked.filter(s => getLifetimeMotes(state.resources, s.tierId) >= condition.amount);
      return `Tiers qualifying: ${qualifying.length} / ${unlocked.length} (need ≥${formatNumberAs(condition.amount, numberFormat)} each)`;
    }

    case 'specific_tiers_lifetime_motes': {
      const earned = condition.tierIds.filter(id => getLifetimeMotes(state.resources, id) >= 1).length;
      return `Tiers with at least 1 mote: ${earned} / ${condition.tierIds.length}`;
    }

    case 'current_motes_all_unlocked_tiers': {
      const unlocked = state.equation.segments.filter(s => s.isUnlocked);
      const qualifying = unlocked.filter(s => getMotes(state.resources, s.tierId) >= condition.amount);
      return `Tiers qualifying: ${qualifying.length} / ${unlocked.length} (need ≥${formatNumberAs(condition.amount, numberFormat)} current)`;
    }

    case 'lifetime_motes_total': {
      let total = 0;
      for (const v of state.resources.lifetimeMotes.values()) total += v;
      return `Total lifetime motes: ${formatNumberAs(total, numberFormat)} / ${formatNumberAs(condition.amount, numberFormat)}`;
    }

    case 'aliven_count':
      return `Alivened tiers: ${state.aliven.alivenedTierIds.size} / ${condition.count}`;

    case 'aliven_all_possible': {
      const alivenableCount = TIERS.filter(t => isTierAliveneable(t.id)).length;
      return `Alivened tiers: ${state.aliven.alivenedTierIds.size} / ${alivenableCount}`;
    }

    // ── New equation conditions ──────────────────────────────────

    case 'equation_segment_unlocked': {
      const tierName = TIER_BY_ID.get(condition.tierId)?.displayName ?? condition.tierId;
      const seg = state.equation.segments.find(s => s.tierId === condition.tierId);
      return `${tierName} segment: ${seg?.isUnlocked ? 'Unlocked' : 'Not yet unlocked'}`;
    }

    case 'equation_segment_level': {
      const tierName = TIER_BY_ID.get(condition.tierId)?.displayName ?? condition.tierId;
      const seg = state.equation.segments.find(s => s.tierId === condition.tierId);
      const current = seg?.isUnlocked ? seg.level : 0;
      return `${tierName} segment level: ${current} / ${condition.level}`;
    }

    case 'any_equation_segment_level': {
      let best = 0;
      for (const seg of state.equation.segments) {
        if (seg.isUnlocked && seg.level > best) best = seg.level;
      }
      return `Best segment level: ${best} / ${condition.level}`;
    }

    case 'total_equation_upgrade_levels': {
      let total = 0;
      for (const seg of state.equation.segments) total += seg.level;
      return `Total upgrade levels: ${formatNumberAs(total, numberFormat)} / ${formatNumberAs(condition.count, numberFormat)}`;
    }

    case 'all_unlocked_equation_segments_level': {
      const unlocked = state.equation.segments.filter(s => s.isUnlocked);
      const qualifying = unlocked.filter(s => s.level >= condition.level);
      return `Segments at level ${condition.level}+: ${qualifying.length} / ${unlocked.length}`;
    }

    case 'equation_tap_gain_total': {
      const tapMultiplier = state.progression.globalMultiplier * state.achievements.tapMultiplierBonus;
      let total = 0;
      for (const seg of state.equation.segments) {
        if (!seg.isUnlocked) continue;
        const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
        if (role?.role === 'foundation') continue;
        total += (BASE_TAP_VALUE + seg.level * UPGRADE_TAP_MULTIPLIER);
      }
      total *= tapMultiplier;
      return `Tap gain: ${formatNumberAs(total, numberFormat)} / ${formatNumberAs(condition.amount, numberFormat)}`;
    }

    case 'equivalence_reached': {
      const equiv = getEquivalence(state.resources);
      return `Equivalence: ${formatNumberAs(equiv, numberFormat)} / ${formatNumberAs(condition.amount, numberFormat)}`;
    }

    // ── Existing conditions ──────────────────────────────────────

    case 'forge_unlocked':
      return 'Unlock the Equation Forge';
    case 'tap_count': {
      const current = state.equation.totalTapCount;
      return `Taps: ${formatNumberAs(current, numberFormat)} / ${formatNumberAs(condition.count, numberFormat)}`;
    }
    case 'equation_tiers': {
      const current = state.equation.segments.filter(s => s.isUnlocked).length;
      return `Tiers unlocked: ${current} / ${condition.count}`;
    }
    case 'wave_reached': {
      const current = state.rpg.highestWaveReached;
      return `Highest wave: ${current} / ${condition.wave}`;
    }
    case 'weapon_purchased': {
      const weaponName = WEAPON_BY_ID.get(condition.weaponId)?.name ?? condition.weaponId;
      return `Purchase: ${weaponName}`;
    }
    case 'any_weapon_max_tier': {
      let best = 0;
      for (const tier of state.rpg.weaponTiersByWeaponId.values()) {
        if (tier > best) best = tier;
      }
      return `Best weapon tier: ${best} / ${MAX_WEAPON_TIER}`;
    }
    case 'xp_reached': {
      return `XP: ${formatNumberAs(state.rpg.xp, numberFormat)} / ${formatNumberAs(condition.xp, numberFormat)}`;
    }
    case 'boss_defeated': {
      const defeated = Math.floor(state.rpg.highestWaveReached / 100);
      return `Bosses defeated: ${defeated} / ${condition.count}`;
    }
    default:
      return '???';
  }
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

  // ── DOM refs ──────────────────────────────────────────────────
  interface CardRefs {
    card: HTMLElement;
    iconEl: HTMLElement;
    nameEl: HTMLElement;
    bonusEl: HTMLElement;
    descEl: HTMLElement;
    progressEl: HTMLElement;
    groupId: string;
    subcategoryId?: string;
    /** True if this achievement is isSecret or isHiddenCriteria */
    isHiddenType: boolean;
  }

  interface SubcategoryRefs {
    section: HTMLElement;
    toggle: HTMLButtonElement;
    countEl: HTMLElement;
    inner: HTMLElement;
    achievementIds: string[];
  }

  interface GroupRefs {
    toggle: HTMLButtonElement;
    countEl: HTMLElement;
    inner: HTMLElement;
    achievementIds: string[];
    subcategoryRefs: Map<string, SubcategoryRefs>;
    /** Element shown when all cards are filtered out */
    emptyMsg: HTMLElement;
  }

  const cardRefs: Map<string, CardRefs> = new Map();
  const groupRefs: Map<string, GroupRefs> = new Map();

  // ── UI accordion state ────────────────────────────────────────
  let openMainCategoryId: string | null = ACHIEVEMENT_GROUPS[0]?.id ?? null;
  let openSubcategoryId: string | null = null;
  let isPanelVisible = false;

  function setOpenGroup(nextId: string | null): void {
    openMainCategoryId = nextId;
    // When main category changes, collapse subcategory
    openSubcategoryId = null;

    for (const [groupId, refs] of groupRefs) {
      const isExpanded = groupId === openMainCategoryId;
      refs.toggle.setAttribute('aria-expanded', String(isExpanded));
      refs.toggle.classList.toggle('achievement-group-toggle--expanded', isExpanded);
      refs.inner.parentElement!.classList.toggle('achievement-group-content--expanded', isExpanded);

      if (!isExpanded) {
        // Collapse all subcategories in this group
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
    toggle.addEventListener('click', () => {
      const next = openMainCategoryId === group.id ? null : group.id;
      setOpenGroup(next);
    });

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
        const subIcon = document.createElement('span');
        subIcon.textContent = sub.icon;
        subIcon.className = 'ach-sub-icon';
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
        subToggle.addEventListener('click', () => {
          const next = openSubcategoryId === sub.id ? null : sub.id;
          setOpenSubcategory(group.id, next);
        });

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
          appendCard(def, subInner);
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
        appendCard(def, inner);
      }
    } else {
      // No subcategories — add cards directly to inner
      for (const def of ACHIEVEMENT_DEFINITIONS) {
        if (def.groupId !== group.id) continue;
        allGroupAchievementIds.push(def.id);
        appendCard(def, inner);
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

  function appendCard(
    def: (typeof ACHIEVEMENT_DEFINITIONS)[number],
    container: HTMLElement,
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
      dispatch({ kind: 'claim_achievement', achievementId: def.id });
      audioSystem?.onAchievementClaimed();
      enqueueReward(`${bonusText(def.bonusKind, def.bonusMultiplier)}!`);
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
  let glyphRafId = -1;
  let glyphAnimating = false;

  function glyphFrame(): void {
    if (glyphEntries.length === 0) {
      glyphAnimating = false;
      glyphRafId = -1;
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
    if (glyphRafId !== -1) cancelAnimationFrame(glyphRafId);
    glyphRafId = -1;
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
    // Update Claim All button
    let totalClaimable = 0;
    for (const def of ACHIEVEMENT_DEFINITIONS) {
      if (state.achievements.unlockedIds.has(def.id) && !state.achievements.claimedIds.has(def.id)) {
        totalClaimable++;
      }
    }
    claimAllBtn.disabled = totalClaimable === 0;
    claimAllBtn.classList.toggle('ach-claim-all-btn--active', totalClaimable > 0);
    claimAllCount.textContent = totalClaimable > 0 ? `${totalClaimable} ready` : '';

    const unclaimedByGroup = new Map<string, number>();
    const claimedByGroup = new Map<string, number>();
    const totalByGroup = new Map<string, number>();
    const claimedBySub = new Map<string, number>();
    const totalBySub = new Map<string, number>();

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

      // Update subcategory header counts
      for (const [subId, subRef] of refs.subcategoryRefs) {
        const subTotal = totalBySub.get(subId) ?? 0;
        const subClaimed = claimedBySub.get(subId) ?? 0;
        subRef.countEl.textContent = `${subClaimed}/${subTotal}`;
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
