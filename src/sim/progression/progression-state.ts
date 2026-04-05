import { UPGRADE_BY_ID, upgradeCostAtLevel } from '../../data/upgrades';
import {
  AUTO_TAP_INTERVAL_REDUCTION_MS,
  BASE_AUTO_TAP_INTERVAL_MS,
  MIN_AUTO_TAP_INTERVAL_MS,
} from '../../data/balance';

// ─── Types ──────────────────────────────────────────────────────

/** Tracks upgrade levels the player has purchased. */
export interface ProgressionState {
  upgradeLevels: Map<string, number>;   // upgradeId → level
  unlockedTierCount: number;
  autoTapLevel: number;
  globalMultiplier: number;
}

// ─── Factory ────────────────────────────────────────────────────

export function createProgressionState(initialTierCount: number): ProgressionState {
  return {
    upgradeLevels: new Map(),
    unlockedTierCount: initialTierCount,
    autoTapLevel: 0,
    globalMultiplier: 1,
  };
}

// ─── Queries ────────────────────────────────────────────────────

export function getUpgradeLevel(state: ProgressionState, upgradeId: string): number {
  return state.upgradeLevels.get(upgradeId) ?? 0;
}

export function getUpgradeCost(state: ProgressionState, upgradeId: string): number | null {
  const def = UPGRADE_BY_ID.get(upgradeId);
  if (!def) return null;
  const level = getUpgradeLevel(state, upgradeId);
  if (def.maxLevel > 0 && level >= def.maxLevel) return null; // maxed out
  return upgradeCostAtLevel(def, level);
}

export function canAffordUpgrade(
  state: ProgressionState,
  upgradeId: string,
  availableMotes: number,
): boolean {
  const cost = getUpgradeCost(state, upgradeId);
  if (cost === null) return false;
  return availableMotes >= cost;
}

export function getAutoTapIntervalMs(state: ProgressionState): number {
  if (state.autoTapLevel <= 0) return 0; // not unlocked
  const interval = BASE_AUTO_TAP_INTERVAL_MS - (state.autoTapLevel - 1) * AUTO_TAP_INTERVAL_REDUCTION_MS;
  return Math.max(interval, MIN_AUTO_TAP_INTERVAL_MS);
}

// ─── Mutations ──────────────────────────────────────────────────

/**
 * Purchase an upgrade, returning the cost if successful, or null if not.
 * The caller is responsible for deducting the cost from resources.
 */
export function purchaseUpgrade(state: ProgressionState, upgradeId: string): number | null {
  const def = UPGRADE_BY_ID.get(upgradeId);
  if (!def) return null;
  const level = getUpgradeLevel(state, upgradeId);
  if (def.maxLevel > 0 && level >= def.maxLevel) return null;
  const cost = upgradeCostAtLevel(def, level);

  state.upgradeLevels.set(upgradeId, level + 1);

  // Apply side effects based on upgrade kind
  switch (def.effectKind) {
    case 'auto_tap_speed':
      state.autoTapLevel = level + 1;
      break;
    case 'tap_multiplier':
      state.globalMultiplier = 1 + (level + 1) * def.effectPerLevel;
      break;
    default:
      break;
  }

  return cost;
}
