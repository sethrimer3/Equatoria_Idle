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
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgSimState(): RpgSimState {
  return {
    highestWaveReached: 0,
    purchasedWeaponIds: new Set(),
    equippedWeaponId: null,
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
