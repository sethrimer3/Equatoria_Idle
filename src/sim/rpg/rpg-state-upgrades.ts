/**
 * rpg-state-upgrades.ts — Wave boost, RPG upgrade, and boss helper functions.
 *
 * Extracted from rpg-state.ts. All functions here operate on the RpgSimState
 * upgrade/progression fields without depending on XP logic or weapon scaling.
 *
 * Re-exported from rpg-state.ts for backward compatibility.
 */

import type { RpgSimState } from './rpg-state';

export const TOGGLEABLE_SKILL_NODE_IDS = new Set<string>(['acceleration', 'dash']);

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
 * Returns true when a purchased skill node's effect should currently run.
 * Non-toggleable nodes are enabled whenever purchased.
 */
export function isSkillNodeEffectEnabled(state: RpgSimState, nodeId: string): boolean {
  if (!isSkillNodeUnlocked(state, nodeId)) return false;
  return !TOGGLEABLE_SKILL_NODE_IDS.has(nodeId) || !state.disabledSkillNodeIds.has(nodeId);
}

/** Returns the purchased rank, or 0 when a toggleable skill has been disabled. */
export function getEnabledSkillNodeRank(state: RpgSimState, nodeId: string): number {
  return isSkillNodeEffectEnabled(state, nodeId) ? getSkillNodeRank(state, nodeId) : 0;
}

/**
 * Damage multiplier for the Speed Upgrade's contact-damage effect.
 * Each level adds 10% of recent non-contact player DPS, capped by max level at 100%.
 */
export function getRpgContactDamageMultiplier(state: RpgSimState): number {
  const level = getRpgUpgradeLevel(state, 'speed');
  return Math.min(1, level * 0.1);
}

/** Returns the player level required to unlock a given weapon slot (0-indexed). */
export function getLevelRequiredForSlot(slotIndex: number): number {
  return slotIndex * 25;
}

/**
 * Returns the maximum number of weapons that can be equipped simultaneously.
 * Base: 1 slot. +1 per Extra Weapon Slot skill rank (max 5 total).
 * Old saves are migrated in save-deserialize so their extra_weapon_slot rank
 * already covers any slots they earned via level — no level fallback needed here.
 */
export function getMaxEquippedWeapons(state: RpgSimState): number {
  const slotUpgrades = getRpgUpgradeLevel(state, 'extra_weapon_slot');
  return Math.min(5, 1 + slotUpgrades);
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
 * Returns true when the boss with the given ID has been unlocked.
 * The Sand Warden (bossId 0) unlocks at wave 50; all others unlock at bossId*100.
 */
export function isBossUnlocked(bossId: number, highestWaveReached: number): boolean {
  if (bossId === 0) return highestWaveReached >= 50;
  return highestWaveReached >= bossId * 100;
}
