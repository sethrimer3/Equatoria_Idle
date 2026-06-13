/**
 * achievement-progress-text.ts — Progress description strings for achievement conditions.
 *
 * Pure formatting utility — no side effects, no DOM dependencies.
 * Used by the achievements panel to show progress toward each condition.
 */

import type { GameState } from '../../sim';
import type { AchievementCondition } from '../../data/achievements/achievement-definitions';
import { TIER_BY_ID, TIERS } from '../../data/tiers';
import { formatNumberAs, type NumberFormat } from '../../util';
import { getLifetimeMotes, getMotes, getEquivalence } from '../../sim/resources';
import { MAX_WEAPON_TIER } from '../../sim/rpg/rpg-state';
import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
import { isTierAliveneable } from '../../sim/aliven';
import { BASE_TAP_VALUE, UPGRADE_TAP_MULTIPLIER } from '../../data/balance';
import { EQUATION_ROLE_BY_TIER } from '../../data/equation';

/**
 * Returns a human-readable progress string for the given achievement condition
 * and current game state.
 */
export function getProgressText(
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
      return `Output: ${formatNumberAs(equiv, numberFormat)} / ${formatNumberAs(condition.amount, numberFormat)}`;
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
