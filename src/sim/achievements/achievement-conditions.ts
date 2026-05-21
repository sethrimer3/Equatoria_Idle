/**
 * achievement-conditions.ts — Condition evaluator for the achievement system.
 *
 * Contains `isConditionMet`, the large switch-dispatch that decides whether a
 * single `AchievementCondition` is satisfied by the current game state.
 * Extracted from `achievement-state.ts` to keep that file focused on state
 * management, bonus computation, and the claim/unlock API.
 */

import type { AchievementCondition } from '../../data/achievements/achievement-definitions';
import type { ResourceState } from '../resources';
import { getLifetimeMotes, getMotes, getEquivalence } from '../resources';
import type { EquationState } from '../equation';
import type { RpgSimState } from '../rpg';
import { MAX_WEAPON_TIER, TOTAL_BOSS_COUNT } from '../rpg/rpg-state';
import type { AlivenState } from '../aliven';
import { isTierAliveneable } from '../aliven';
import { TIERS } from '../../data/tiers';
import { BASE_TAP_VALUE, UPGRADE_TAP_MULTIPLIER } from '../../data/balance';
import { EQUATION_ROLE_BY_TIER } from '../../data/equation';

/**
 * The canonical ordered list of "base" tiers used for cross-tier mote
 * achievements (sand through nullstone, inclusive).
 *
 * Fracteryl and Eigenstein are intentionally excluded — they have their
 * own separate achievement categories.  Adding a tier here will tighten
 * the "all tiers" achievement requirements for every affected condition.
 */
export const ALL_BASE_TIER_IDS = [
  'sand',
  'quartz',
  'ruby',
  'sunstone',
  'citrine',
  'emerald',
  'sapphire',
  'iolite',
  'amethyst',
  'diamond',
  'nullstone',
] as const;

/**
 * Returns true if the given condition is satisfied by the current game state.
 *
 * @param globalTapMultiplier - Combined tap multiplier (progression × achievement bonuses).
 *   Used for equation_tap_gain_total conditions. Defaults to 1 if omitted.
 */
export function isConditionMet(
  condition: AchievementCondition,
  resources: ResourceState,
  equation: EquationState,
  rpg: RpgSimState,
  aliven: AlivenState,
  globalTapMultiplier: number,
): boolean {
  switch (condition.kind) {
    case 'lifetime_motes':
      return getLifetimeMotes(resources, condition.tierId) >= condition.amount;

    // ── New mote conditions ──────────────────────────────────────

    case 'any_tier_lifetime_motes': {
      for (const v of resources.lifetimeMotes.values()) {
        if (v >= condition.amount) return true;
      }
      return false;
    }

    case 'tiers_with_lifetime_motes': {
      let qualifiedCount = 0;
      for (const v of resources.lifetimeMotes.values()) {
        if (v >= condition.amount) qualifiedCount++;
      }
      return qualifiedCount >= condition.count;
    }

    case 'all_unlocked_tiers_lifetime_motes': {
      const unlocked = equation.segments.filter(s => s.isUnlocked);
      if (unlocked.length === 0) return false;
      for (const seg of unlocked) {
        if (getLifetimeMotes(resources, seg.tierId) < condition.amount) return false;
      }
      return true;
    }

    case 'all_base_tiers_lifetime_motes': {
      // Requires ALL base tiers (sand through nullstone) to have at least
      // `amount` lifetime motes. Locked or not-yet-created tiers count as failing.
      for (const tierId of ALL_BASE_TIER_IDS) {
        const seg = equation.segments.find(s => s.tierId === tierId);
        if (!seg || !seg.isUnlocked) return false;
        if (getLifetimeMotes(resources, tierId) < condition.amount) return false;
      }
      return true;
    }

    case 'specific_tiers_lifetime_motes': {
      for (const tierId of condition.tierIds) {
        if (getLifetimeMotes(resources, tierId) < 1) return false;
      }
      return true;
    }

    case 'current_motes_all_unlocked_tiers': {
      const unlocked = equation.segments.filter(s => s.isUnlocked);
      if (unlocked.length === 0) return false;
      for (const seg of unlocked) {
        if (getMotes(resources, seg.tierId) < condition.amount) return false;
      }
      return true;
    }

    case 'all_base_tiers_current_motes': {
      // Requires ALL base tiers (sand through nullstone) to currently hold at
      // least `amount` motes. Locked or not-yet-created tiers count as failing.
      for (const tierId of ALL_BASE_TIER_IDS) {
        const seg = equation.segments.find(s => s.tierId === tierId);
        if (!seg || !seg.isUnlocked) return false;
        if (getMotes(resources, tierId) < condition.amount) return false;
      }
      return true;
    }

    case 'lifetime_motes_total': {
      let total = 0;
      for (const v of resources.lifetimeMotes.values()) total += v;
      return total >= condition.amount;
    }

    case 'aliven_count':
      return aliven.alivenedTierIds.size >= condition.count;

    case 'aliven_all_possible': {
      const alivenableCount = TIERS.filter(t => isTierAliveneable(t.id)).length;
      return aliven.alivenedTierIds.size >= alivenableCount;
    }

    // ── New equation conditions ──────────────────────────────────

    case 'equation_segment_unlocked': {
      const seg = equation.segments.find(s => s.tierId === condition.tierId);
      return seg?.isUnlocked ?? false;
    }

    case 'equation_segment_level': {
      const seg = equation.segments.find(s => s.tierId === condition.tierId);
      return seg?.isUnlocked === true && seg.level >= condition.level;
    }

    case 'any_equation_segment_level': {
      for (const seg of equation.segments) {
        if (seg.isUnlocked && seg.level >= condition.level) return true;
      }
      return false;
    }

    case 'total_equation_upgrade_levels': {
      let total = 0;
      for (const seg of equation.segments) total += seg.level;
      return total >= condition.count;
    }

    case 'all_unlocked_equation_segments_level': {
      const unlocked = equation.segments.filter(s => s.isUnlocked);
      if (unlocked.length === 0) return false;
      for (const seg of unlocked) {
        if (seg.level < condition.level) return false;
      }
      return true;
    }

    case 'equation_tap_gain_total': {
      // Compute total tap gain across all unlocked non-foundation segments.
      let total = 0;
      for (const seg of equation.segments) {
        if (!seg.isUnlocked) continue;
        const role = EQUATION_ROLE_BY_TIER.get(seg.tierId);
        if (role?.role === 'foundation') continue;
        total += (BASE_TAP_VALUE + seg.level * UPGRADE_TAP_MULTIPLIER);
      }
      total *= globalTapMultiplier;
      return total >= condition.amount;
    }

    case 'equivalence_reached':
      return equation.isForgeUnlocked && getEquivalence(resources) >= condition.amount;

    // ── Existing conditions ──────────────────────────────────────

    case 'forge_unlocked':
      return equation.isForgeUnlocked;

    case 'tap_count':
      return equation.totalTapCount >= condition.count;

    case 'equation_tiers': {
      const unlockedCount = equation.segments.filter(s => s.isUnlocked).length;
      return unlockedCount >= condition.count;
    }

    case 'wave_reached':
      return rpg.highestWaveReached >= condition.wave;

    case 'weapon_purchased':
      return rpg.purchasedWeaponIds.has(condition.weaponId);

    case 'any_weapon_max_tier': {
      for (const tier of rpg.weaponTiersByWeaponId.values()) {
        if (tier >= MAX_WEAPON_TIER) return true;
      }
      return false;
    }

    case 'xp_reached':
      return rpg.xp >= condition.xp;

    case 'boss_defeated':
      // Bosses occur at every multiple of 100 waves; reaching wave N×100 means N bosses beaten.
      return Math.floor(rpg.highestWaveReached / 100) >= condition.count;

    case 'specific_boss_defeated':
      return (rpg.bossCompletions.get(condition.bossId) ?? 0) > 0;

    case 'specific_boss_at_speed': {
      const best = rpg.bossCompletions.get(condition.bossId) ?? 0;
      return best >= condition.minSpeedPct;
    }

    case 'any_boss_at_speed': {
      for (const speedPct of rpg.bossCompletions.values()) {
        if (speedPct >= condition.minSpeedPct) return true;
      }
      return false;
    }

    case 'all_bosses_at_speed': {
      // Every boss from 1 through TOTAL_BOSS_COUNT must have a recorded completion
      // at or above the speed threshold. A missing entry (boss never beaten) counts as false.
      for (let bossId = 1; bossId <= TOTAL_BOSS_COUNT; bossId++) {
        const speedPct = rpg.bossCompletions.get(bossId) ?? 0;
        if (speedPct < condition.minSpeedPct) return false;
      }
      return true;
    }

    case 'specific_weapon_max_tier':
      return (rpg.weaponTiersByWeaponId.get(condition.weaponId) ?? 0) >= MAX_WEAPON_TIER;

    case 'weapons_at_max_tier': {
      let n = 0;
      for (const tier of rpg.weaponTiersByWeaponId.values()) {
        if (tier >= MAX_WEAPON_TIER) n++;
      }
      return n >= condition.count;
    }

    case 'all_purchased_max_tier': {
      if (rpg.purchasedWeaponIds.size === 0) return false;
      for (const weaponId of rpg.purchasedWeaponIds) {
        if ((rpg.weaponTiersByWeaponId.get(weaponId) ?? 0) < MAX_WEAPON_TIER) return false;
      }
      return true;
    }

    case 'weapons_purchased_count':
      return rpg.purchasedWeaponIds.size >= condition.count;

    case 'equip_weapons_count':
      return rpg.equippedWeaponIds.size >= condition.count;

    case 'rpg_upgrade_level':
      return (rpg.rpgUpgradeLevels.get(condition.upgradeId) ?? 0) >= condition.level;

    case 'rpg_upgrade_any_max': {
      for (const level of rpg.rpgUpgradeLevels.values()) {
        if (level >= condition.maxLevel) return true;
      }
      return false;
    }

    case 'xp_allocated_stat':
      return rpg.xpAllocatedStats.includes(condition.stat);

    case 'xp_allocated_stats_count':
      return rpg.xpAllocatedStats.length >= condition.count;

    case 'xp_to_stat': {
      const map: Record<'atk' | 'def' | 'luck' | 'hp', number> = {
        atk:  rpg.xpAllocatedToAtk,
        def:  rpg.xpAllocatedToDef,
        luck: rpg.xpAllocatedToLuck,
        hp:   rpg.xpAllocatedToHp,
      };
      return map[condition.stat] >= condition.amount;
    }

    case 'total_kills': {
      let total = 0;
      for (const count of rpg.lifetimeKillsByType.values()) total += count;
      return total >= condition.count;
    }

    case 'kills_of_type':
      return (rpg.lifetimeKillsByType.get(condition.typeId) ?? 0) >= condition.count;

    case 'elite_kills_total':
      return rpg.lifetimeEliteKills >= condition.count;

    case 'aliven_kills_total':
      return rpg.lifetimeAlivenKills >= condition.count;

    case 'late_enemy_kills_total':
      return rpg.lifetimeLateEnemyKills >= condition.count;

    case 'lucky_motes_total':
      return rpg.lifetimeLuckyMotesCollected >= condition.count;

    case 'survival_minutes':
      return rpg.totalRpgSurvivalMs >= condition.minutes * 60 * 1000;

    case 'wave_streak':
      return rpg.consecutiveWaveStreak >= condition.count;

    case 'damage_free_streak':
      return rpg.bestDamageFreeWaveStreak >= condition.count;

    case 'waves_completed':
      return rpg.totalWavesCompleted >= condition.count;

    case 'boss_defeated_any_speed_1weapon':
      return rpg.bossDefeated1Weapon;

    case 'kills_all_regular_types': {
      // All 15 regular enemy types that have 100-kill achievements must be killed at least once.
      const ALL_REGULAR_TYPES = [
        'laser', 'quartz', 'sapphire', 'emerald', 'ruby', 'amber', 'void',
        'sunstone', 'citrine', 'iolite', 'amethyst', 'diamond', 'nullstone',
        'fracteryl', 'eigenstein',
      ] as const;
      for (const typeId of ALL_REGULAR_TYPES) {
        if ((rpg.lifetimeKillsByType.get(typeId) ?? 0) < 1) return false;
      }
      return true;
    }

    case 'secret_flag':
      return rpg.secretAchievementFlags.has(condition.flagId);
  }
}
