/**
 * balance-forecast-state.ts — Lightweight simulation state model for the balance forecast.
 *
 * Contains:
 *   - SimState interface and SimLoomState interface
 *   - createFreshSimState, cloneSimState, simStateFromGame — lifecycle helpers
 *   - getLoomRateSim, getTotalProductionRateSim — production rate helpers
 *   - simTick — per-step time advance
 *   - simCheckAchievements — unlock side-effect application
 *
 * IMPORTANT: This module never mutates real game state.
 * All exported functions operate on SimState (isolated lightweight model).
 */

import type { TierId } from '../../../data/tiers';
import { TIERS } from '../../../data/tiers';
import { LOOM_BY_TIER, loomProductionRate } from '../../../data/looms';
import { ACHIEVEMENT_DEFINITIONS } from '../../../data/achievements';
import {
  BASE_AUTO_TAP_INTERVAL_MS,
  AUTO_TAP_INTERVAL_REDUCTION_MS,
  MIN_AUTO_TAP_INTERVAL_MS,
  BASE_TAP_VALUE,
  UPGRADE_TAP_MULTIPLIER,
  INITIAL_UNLOCKED_TIER_COUNT,
} from '../../../data/balance';

import type { GameState } from '../../../sim';
import { getMotes, getLifetimeMotes } from '../../../sim/resources';

// ─── Lightweight simulation state (isolated from real game) ───────

interface SimLoomState {
  tierId: TierId;
  level: number;
  isUnlocked: boolean;
  specialPurchased: boolean;
}

export interface SimState {
  timeSeconds: number;
  /** Current mote totals per tier. */
  motes: Map<TierId, number>;
  /** Lifetime motes per tier. */
  lifetimeMotes: Map<TierId, number>;
  looms: Map<TierId, SimLoomState>;
  unlockedTierCount: number;
  isForgeUnlocked: boolean;
  upgradeLevels: Map<string, number>;
  autoTapLevel: number;
  tapMultiplierBonus: number;
  loomMultiplierBonus: number;
  /** Unlocked achievement IDs. */
  unlockedAchievements: Set<string>;
  totalTapCount: number;
  equationSegmentLevels: Map<TierId, number>;
}

export function createFreshSimState(): SimState {
  const motes = new Map<TierId, number>();
  const lifetimeMotes = new Map<TierId, number>();
  const looms = new Map<TierId, SimLoomState>();
  const equationSegmentLevels = new Map<TierId, number>();

  for (const t of TIERS) {
    motes.set(t.id, 0);
    lifetimeMotes.set(t.id, 0);
    equationSegmentLevels.set(t.id, 0);
    looms.set(t.id, {
      tierId: t.id,
      level: t.id === 'sand' ? 1 : 0,
      isUnlocked: t.id === 'sand',
      specialPurchased: false,
    });
  }

  return {
    timeSeconds: 0,
    motes,
    lifetimeMotes,
    looms,
    unlockedTierCount: INITIAL_UNLOCKED_TIER_COUNT,
    isForgeUnlocked: false,
    upgradeLevels: new Map(),
    autoTapLevel: 0,
    tapMultiplierBonus: 1,
    loomMultiplierBonus: 1,
    unlockedAchievements: new Set(),
    totalTapCount: 0,
    equationSegmentLevels,
  };
}

/** Clone a SimState deeply. */
export function cloneSimState(s: SimState): SimState {
  return {
    timeSeconds: s.timeSeconds,
    motes: new Map(s.motes),
    lifetimeMotes: new Map(s.lifetimeMotes),
    looms: new Map([...s.looms.entries()].map(([k, v]) => [k, { ...v }])),
    unlockedTierCount: s.unlockedTierCount,
    isForgeUnlocked: s.isForgeUnlocked,
    upgradeLevels: new Map(s.upgradeLevels),
    autoTapLevel: s.autoTapLevel,
    tapMultiplierBonus: s.tapMultiplierBonus,
    loomMultiplierBonus: s.loomMultiplierBonus,
    unlockedAchievements: new Set(s.unlockedAchievements),
    totalTapCount: s.totalTapCount,
    equationSegmentLevels: new Map(s.equationSegmentLevels),
  };
}

/** Build a SimState snapshot from the real player GameState. */
export function simStateFromGame(game: GameState): SimState {
  const motes = new Map<TierId, number>();
  const lifetimeMotes = new Map<TierId, number>();
  const looms = new Map<TierId, SimLoomState>();
  const equationSegmentLevels = new Map<TierId, number>();

  for (const t of TIERS) {
    motes.set(t.id, getMotes(game.resources, t.id));
    lifetimeMotes.set(t.id, getLifetimeMotes(game.resources, t.id));
    equationSegmentLevels.set(t.id, game.equation.segments.find(s => s.tierId === t.id)?.level ?? 0);
    const loomState = game.looms.looms.find(l => l.tierId === t.id);
    looms.set(t.id, {
      tierId: t.id,
      level: loomState?.level ?? 0,
      isUnlocked: loomState?.isUnlocked ?? false,
      specialPurchased: game.looms.specialPurchased.has(t.id),
    });
  }

  return {
    timeSeconds: 0,
    motes,
    lifetimeMotes,
    looms,
    unlockedTierCount: game.progression.unlockedTierCount,
    isForgeUnlocked: game.equation.isForgeUnlocked,
    upgradeLevels: new Map(game.progression.upgradeLevels),
    autoTapLevel: game.progression.autoTapLevel,
    tapMultiplierBonus: game.achievements.tapMultiplierBonus,
    loomMultiplierBonus: game.achievements.loomMultiplierBonus,
    unlockedAchievements: new Set(game.achievements.unlockedIds),
    totalTapCount: game.equation.totalTapCount,
    equationSegmentLevels,
  };
}

// ─── Production rate helpers ──────────────────────────────────────

/**
 * Compute loom motes/sec for a given tier in a sim state.
 * Returns 0 if the loom is not unlocked or at level 0.
 */
export function getLoomRateSim(sim: SimState, tierId: TierId): number {
  const loom = sim.looms.get(tierId);
  if (!loom || !loom.isUnlocked || loom.level <= 0) return 0;
  const def = LOOM_BY_TIER.get(tierId);
  if (!def) return 0;
  const specialBonus = loom.specialPurchased ? 2 : 1;
  return loomProductionRate(def, loom.level) * sim.loomMultiplierBonus * specialBonus;
}

/**
 * Compute the auto-tap rate in taps/sec for the given sim state.
 */
function getAutoTapRateSim(sim: SimState): number {
  if (!sim.isForgeUnlocked || sim.autoTapLevel <= 0) return 0;
  const intervalMs = Math.max(
    MIN_AUTO_TAP_INTERVAL_MS,
    BASE_AUTO_TAP_INTERVAL_MS - (sim.autoTapLevel - 1) * AUTO_TAP_INTERVAL_REDUCTION_MS,
  );
  return 1000 / intervalMs;
}

/**
 * Compute per-tier motes/sec from tap production in the sim state.
 * Only contributes if forge is unlocked.
 */
function getTapProductionRateSim(sim: SimState): Map<TierId, number> {
  const rates = new Map<TierId, number>();
  if (!sim.isForgeUnlocked) return rates;
  const autoTapRate = getAutoTapRateSim(sim);
  if (autoTapRate <= 0) return rates;

  for (let i = 1; i < sim.unlockedTierCount; i++) {
    const tier = TIERS[i];
    if (!tier) continue;
    const segLevel = sim.equationSegmentLevels.get(tier.id) ?? 0;
    const tapValue = (BASE_TAP_VALUE + segLevel * UPGRADE_TAP_MULTIPLIER) * sim.tapMultiplierBonus;
    rates.set(tier.id, tapValue * autoTapRate);
  }
  return rates;
}

/**
 * Compute total motes/sec for a tier (loom + tap contributions combined).
 */
export function getTotalProductionRateSim(sim: SimState, tierId: TierId): number {
  const loomRate = getLoomRateSim(sim, tierId);
  const tapRates = getTapProductionRateSim(sim);
  return loomRate + (tapRates.get(tierId) ?? 0);
}

// ─── Simulation step ──────────────────────────────────────────────

/** Advance the sim state by deltaSeconds. */
export function simTick(sim: SimState, deltaSeconds: number): void {
  if (deltaSeconds <= 0) return;

  for (const t of TIERS) {
    const rate = getTotalProductionRateSim(sim, t.id);
    if (rate <= 0) continue;
    const gain = rate * deltaSeconds;
    const cur = sim.motes.get(t.id) ?? 0;
    sim.motes.set(t.id, cur + gain);
    const lifetime = sim.lifetimeMotes.get(t.id) ?? 0;
    sim.lifetimeMotes.set(t.id, lifetime + gain);
  }
  sim.timeSeconds += deltaSeconds;
}

/** Check and apply achievement unlock side effects in the sim. */
export function simCheckAchievements(sim: SimState): void {
  for (const achDef of ACHIEVEMENT_DEFINITIONS) {
    if (sim.unlockedAchievements.has(achDef.id)) continue;
    let met = false;
    switch (achDef.condition.kind) {
      case 'lifetime_motes':
        met = (sim.lifetimeMotes.get(achDef.condition.tierId) ?? 0) >= achDef.condition.amount;
        break;
      case 'forge_unlocked':
        met = sim.isForgeUnlocked;
        break;
      case 'tap_count':
        met = sim.totalTapCount >= achDef.condition.count;
        break;
      case 'equation_tiers':
        met = sim.unlockedTierCount >= achDef.condition.count;
        break;
      default:
        // RPG achievements not simulatable here
        break;
    }
    if (met) {
      sim.unlockedAchievements.add(achDef.id);
      // Apply bonus (assume claimed immediately for simulation simplicity)
      if (achDef.bonusKind === 'tap_multiplier') {
        sim.tapMultiplierBonus *= achDef.bonusMultiplier;
      } else {
        sim.loomMultiplierBonus *= achDef.bonusMultiplier;
      }
    }
  }
}
