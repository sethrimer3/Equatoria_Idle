import type { TierId } from '../data/tiers';
import { TIERS } from '../data/tiers';
import {
  INITIAL_UNLOCKED_TIER_COUNT,
  tierUnlockCost,
  PARTICLES_PER_TAP,
} from '../data/balance';
import { UPGRADE_BY_ID } from '../data/upgrades';
import {
  createEquationState,
  incrementTapCount,
  computeTapGains,
  applyEquationUpgrade,
  unlockTier as unlockEquationTier,
  type EquationState,
} from './equation';
import {
  createResourceState,
  addMotes,
  getMotes,
  spendMotes,
  getTotalMotes,
  type ResourceState,
} from './resources';
import {
  createProgressionState,
  purchaseUpgrade,
  getUpgradeCost,
  getAutoTapIntervalMs,
  type ProgressionState,
} from './progression';
import { createForgeCrunchState, type ForgeCrunchState } from './forge';

// ─── Aggregate game state ───────────────────────────────────────

export interface GameState {
  equation: EquationState;
  resources: ResourceState;
  progression: ProgressionState;
  forge: ForgeCrunchState;
  lastAutoTapMs: number;
  lastSaveMs: number;
  elapsedMs: number;
}

export function createGameState(): GameState {
  return {
    equation: createEquationState(INITIAL_UNLOCKED_TIER_COUNT),
    resources: createResourceState(),
    progression: createProgressionState(INITIAL_UNLOCKED_TIER_COUNT),
    forge: createForgeCrunchState(),
    lastAutoTapMs: 0,
    lastSaveMs: 0,
    elapsedMs: 0,
  };
}

// ─── Actions (called by input/UI layer) ─────────────────────────

export interface TapResult {
  gains: Map<TierId, number>;
  particleCount: number;
}

/** Player taps the equation. Returns what was earned. */
export function tapEquation(state: GameState): TapResult {
  incrementTapCount(state.equation);
  const gains = computeTapGains(state.equation, state.progression.globalMultiplier);
  for (const [tierId, amount] of gains) {
    addMotes(state.resources, tierId, amount);
  }
  return { gains, particleCount: PARTICLES_PER_TAP };
}

/** Try to purchase an upgrade. Returns true if successful. */
export function tryPurchaseUpgrade(state: GameState, upgradeId: string): boolean {
  const def = UPGRADE_BY_ID.get(upgradeId);
  if (!def) return false;

  // Determine which resource to spend
  const costTierId: TierId = def.tierId ?? 'sand'; // global upgrades cost sand motes
  const cost = getUpgradeCost(state.progression, upgradeId);
  if (cost === null) return false;
  if (getMotes(state.resources, costTierId) < cost) return false;

  // Deduct cost and apply upgrade
  spendMotes(state.resources, costTierId, cost);
  purchaseUpgrade(state.progression, upgradeId);

  // For tap_value upgrades, also update equation state
  if (def.effectKind === 'tap_value' && def.tierId) {
    applyEquationUpgrade(state.equation, def.tierId);
  }

  return true;
}

/** Try to unlock the next tier. */
export function tryUnlockNextTier(state: GameState): boolean {
  const nextIndex = state.progression.unlockedTierCount;
  if (nextIndex >= TIERS.length) return false;

  const tier = TIERS[nextIndex];
  if (!tier || tier.isSecret) return false;

  const cost = tierUnlockCost(nextIndex);
  // Pay with the previous tier's motes
  const payTierId = TIERS[nextIndex - 1]?.id ?? 'sand';
  if (getMotes(state.resources, payTierId) < cost) return false;

  spendMotes(state.resources, payTierId, cost);
  unlockEquationTier(state.equation, tier.id);
  state.progression.unlockedTierCount = nextIndex + 1;
  return true;
}

// ─── Simulation tick ────────────────────────────────────────────

export interface SimTickResult {
  autoTapped: boolean;
  autoTapGains: Map<TierId, number> | null;
}

/** Advance simulation by deltaMs. */
export function simTick(state: GameState, deltaMs: number): SimTickResult {
  state.elapsedMs += deltaMs;

  const result: SimTickResult = { autoTapped: false, autoTapGains: null };

  // Auto-tap
  const autoInterval = getAutoTapIntervalMs(state.progression);
  if (autoInterval > 0) {
    const timeSinceAutoTap = state.elapsedMs - state.lastAutoTapMs;
    if (timeSinceAutoTap >= autoInterval) {
      state.lastAutoTapMs = state.elapsedMs;
      const tapResult = tapEquation(state);
      result.autoTapped = true;
      result.autoTapGains = tapResult.gains;
    }
  }

  return result;
}

/** Quick access helpers. */
export function getScore(state: GameState): number {
  return getTotalMotes(state.resources);
}
