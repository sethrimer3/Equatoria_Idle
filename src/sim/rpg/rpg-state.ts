/**
 * rpg-state.ts — Persistent RPG simulation state.
 *
 * Lives in GameState so highest-wave tracking survives sessions and the wave
 * progression boost is automatically applied to loom production via simTick.
 */

// ─── Types ────────────────────────────────────────────────────────

export interface RpgSimState {
  /** Highest wave number the player has cleared during this run. */
  highestWaveReached: number;
  /** Weapon IDs the player has purchased. */
  purchasedWeaponIds: Set<string>;
  /** Currently equipped weapon id, or null if no weapon is equipped. */
  equippedWeaponId: string | null;
  /**
   * Accumulated XP across all sessions.  Persisted in save data.
   * Higher-wave enemies award exponentially more XP, incentivising
   * the player to push into harder content.
   */
  xp: number;
  /**
   * Per-weapon current tier (1-based).  Buying a weapon starts it at tier 1.
   * Key = weaponId, value = tier number (≥ 1).
   */
  weaponTiersByWeaponId: Map<string, number>;
  /**
   * Per-RPG-upgrade purchase level.
   * Key = upgradeId (from RPG_UPGRADE_DEFINITIONS), value = current level (≥ 0).
   */
  rpgUpgradeLevels: Map<string, number>;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgSimState(): RpgSimState {
  return {
    highestWaveReached: 0,
    purchasedWeaponIds: new Set(),
    equippedWeaponId: null,
    xp: 0,
    weaponTiersByWeaponId: new Map(),
    rpgUpgradeLevels: new Map(),
  };
}

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

// ─── XP system ───────────────────────────────────────────────────

/**
 * XP awarded for killing one enemy on `waveNumber`.
 *
 * The formula grows super-linearly so higher-wave enemies are
 * dramatically more rewarding:
 *   Wave  1 →    1 XP/kill
 *   Wave  5 →   19 XP/kill
 *   Wave 10 →   63 XP/kill
 *   Wave 20 →  212 XP/kill
 *   Wave 50 → 1 174 XP/kill
 */
export function getXpPerKill(waveNumber: number): number {
  return Math.ceil(Math.pow(Math.max(1, waveNumber), 1.8));
}

/**
 * Flat ATK bonus from accumulated XP.
 *
 * Formula: floor(log10(xp + 1) × 5)
 *   xp =      0 →  0 ATK
 *   xp =     10 →  5 ATK
 *   xp =    100 → 10 ATK
 *   xp =  1 000 → 15 ATK
 *   xp = 10 000 → 20 ATK
 *
 * The logarithmic curve creates early satisfaction while requiring
 * exponentially more XP (i.e., higher-wave kills) for each +5 step.
 */
export function getXpAtkBonus(xp: number): number {
  return Math.floor(Math.log10(xp + 1) * 5);
}

/**
 * Flat DEF bonus from accumulated XP (half of the ATK bonus).
 *
 * Formula: floor(log10(xp + 1) × 2)
 */
export function getXpDefBonus(xp: number): number {
  return Math.floor(Math.log10(xp + 1) * 2);
}

/**
 * Formats a raw XP total for compact display (e.g. "1.2K", "4.5M").
 */
export function formatXp(xp: number): string {
  if (xp < 1_000) return String(Math.floor(xp));
  if (xp < 1_000_000) return (xp / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return (xp / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

// ─── Upgrade helpers ─────────────────────────────────────────────

/** Returns the current level of an RPG upgrade (defaults to 0 if not purchased). */
export function getRpgUpgradeLevel(state: RpgSimState, upgradeId: string): number {
  return state.rpgUpgradeLevels.get(upgradeId) ?? 0;
}

/**
 * Speed multiplier from the speed upgrade.
 * Each level adds 10% to base speed.
 */
export function getRpgSpeedMultiplier(state: RpgSimState): number {
  const level = getRpgUpgradeLevel(state, 'speed');
  return 1 + level * 0.1;
}
