/**
 * rpg-state-upgrades.ts — Wave boost, RPG upgrade, and boss helper functions.
 *
 * Extracted from rpg-state.ts. All functions here operate on the RpgSimState
 * upgrade/progression fields without depending on XP logic or weapon scaling.
 *
 * Re-exported from rpg-state.ts for backward compatibility.
 */

import type { RpgSimState } from './rpg-state';

// ─── Wave boost ───────────────────────────────────────────────────

/**
 * Returns the multiplicative loom production bonus from wave progression.
 * Formula: 1 + (highestWaveReached ^ 1.2) / 100
 *
 * Examples:
 *   Wave  5 → ~1.069  (+6.9%)
 *   Wave 10 → ~1.158  (+15.8%)
 *   Wave 20 → ~1.364  (+36.4%)
 */
export function getWaveBoostMultiplier(state: RpgSimState): number {
  if (state.highestWaveReached <= 0) return 1;
  return 1 + Math.pow(state.highestWaveReached, 1.2) / 100;
}

/**
 * Returns the wave loom boost formatted as a signed percentage string,
 * e.g. "+6.9%" or "+0.0%".
 */
export function formatWaveBoostPercent(state: RpgSimState): string {
  if (state.highestWaveReached <= 0) return '+0.0%';
  const pct = Math.pow(state.highestWaveReached, 1.2);
  return `+${pct.toFixed(1)}%`;
}

// ─── RPG upgrade helpers ──────────────────────────────────────────

/** Returns the current level of an RPG upgrade (defaults to 0 if not purchased). */
export function getRpgUpgradeLevel(state: RpgSimState, upgradeId: string): number {
  return state.rpgUpgradeLevels.get(upgradeId) ?? 0;
}

/** Returns the purchased rank of a skill tree node (alias for getRpgUpgradeLevel). */
export function getSkillNodeRank(state: RpgSimState, nodeId: string): number {
  return state.rpgUpgradeLevels.get(nodeId) ?? 0;
}

/** Returns true when a skill tree node has been purchased at least once. */
export function isSkillNodeUnlocked(state: RpgSimState, nodeId: string): boolean {
  return getSkillNodeRank(state, nodeId) >= 1;
}

/**
 * Speed multiplier from the speed upgrade.
 * Each level adds 10% to base speed.
 */
export function getRpgSpeedMultiplier(state: RpgSimState): number {
  const level = getRpgUpgradeLevel(state, 'speed');
  return 1 + level * 0.1;
}

/** Returns the player level required to unlock a given weapon slot (0-indexed). */
export function getLevelRequiredForSlot(slotIndex: number): number {
  return slotIndex * 25;
}

/**
 * Returns the maximum number of weapons that can be equipped simultaneously.
 * Base: 1 slot. One additional slot unlocks every 25 player levels (max 5).
 */
export function getMaxEquippedWeapons(state: RpgSimState): number {
  return Math.min(5, Math.floor(state.playerLevel / 25) + 1);
}

// ─── Boss helpers ─────────────────────────────────────────────────

/**
 * Returns the XP multiplier for a boss fight at the given speed %.
 * Formula: speedPct / 10  (100% → 10x, 60% → 6x, 10% → 1x).
 */
export function getBossXpMultiplier(speedPct: number): number {
  return speedPct / 10;
}

/**
 * Returns true when the boss with the given 1-based ID has been unlocked.
 * Boss N is unlocked once the player has reached wave N*100.
 */
export function isBossUnlocked(bossId: number, highestWaveReached: number): boolean {
  return highestWaveReached >= bossId * 100;
}
