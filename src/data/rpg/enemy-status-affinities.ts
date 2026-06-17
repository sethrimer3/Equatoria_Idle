/**
 * enemy-status-affinities.ts — Per-enemy resistance/weakness data for player-applied
 * lens statuses.
 *
 * Used in applyLensStatusesOnHit (rpg-player-attack-single.ts) to scale duration
 * and magnitude of statuses applied TO enemies by lens effects.
 * Not used for player-received statuses.
 *
 * Affinity values:
 *   'weak'      — duration/magnitude × 1.25 (extra-susceptible)
 *   'neutral'   — × 1.0
 *   'resistant' — × 0.6
 *   'immune'    — status does not apply
 */

import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';

export type StatusAffinity = 'weak' | 'neutral' | 'resistant' | 'immune';

type EnemyAffinityMap = Partial<Record<EnemyStatusKey, StatusAffinity>>;

// ── Affinity table ─────────────────────────────────────────────────────────────

const AFFINITIES: Record<string, EnemyAffinityMap> = {
  // Ruby enemies: immune to burning (fire-type), weak to chilled/frozen
  ruby:          { burning: 'immune',     chilled: 'weak', frozen: 'weak' },
  rubyFish:      { burning: 'immune',     chilled: 'weak', frozen: 'weak' },
  elite_ruby:    { burning: 'resistant',  chilled: 'weak' },

  // Emerald enemies: resist poison, weak to burning (fire beats toxin)
  emerald:       { poisoned: 'resistant', burning: 'weak' },
  emeraldFish:   { poisoned: 'resistant', burning: 'weak' },
  elite_emerald: { poisoned: 'resistant', burning: 'weak' },

  // Sapphire/ice enemies: immune/resistant to chilled and frozen, weak to burning
  sapphire:      { chilled: 'immune', frozen: 'resistant', burning: 'weak' },
  sapphireFish:  { chilled: 'immune', frozen: 'resistant', burning: 'weak' },
  elite_sapphire:{ chilled: 'resistant', frozen: 'resistant', burning: 'weak' },

  // Nullstone resists gravitized (gravity-type)
  nullstone:     { gravitized: 'resistant' },
  elite_nullstone:{ gravitized: 'resistant' },

  // Fracteryl enemies: resistant to fractal wound (already fractal in nature)
  fracteryl:     { fractalWound: 'resistant' },

  // Eigenstein enemies: resistant to rift-scarred (already quantum-scarred)
  eigenstein:    { riftScarred: 'resistant' },

  // Bosses: broadly resistant, not immune — preserves difficulty
  boss:          {
    burning: 'resistant', poisoned: 'resistant',
    chilled: 'resistant', frozen: 'resistant',
    gravitized: 'resistant', timeWarped: 'resistant',
    fractalWound: 'resistant', riftScarred: 'resistant',
  },

  // Generic elites: mild resistance to DoTs
  elite: {
    burning: 'resistant', poisoned: 'resistant',
  },
};

// ── Multipliers ────────────────────────────────────────────────────────────────

const AFFINITY_MULTIPLIERS: Record<StatusAffinity, number> = {
  weak:      1.25,
  neutral:   1.0,
  resistant: 0.6,
  immune:    0,
};

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Returns the status affinity for a given enemy type and status key.
 * Falls back to 'neutral' if no entry is defined.
 */
export function getEnemyStatusAffinity(
  enemyTypeId: string,
  statusKey: EnemyStatusKey,
): StatusAffinity {
  return AFFINITIES[enemyTypeId]?.[statusKey] ?? 'neutral';
}

/**
 * Returns the duration/magnitude multiplier for a status applied to an enemy.
 * Returns 0 for immune (do not apply).
 */
export function getEnemyStatusAffinityMultiplier(
  enemyTypeId: string,
  statusKey: EnemyStatusKey,
): number {
  const affinity = getEnemyStatusAffinity(enemyTypeId, statusKey);
  return AFFINITY_MULTIPLIERS[affinity];
}
