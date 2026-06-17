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
 *
 * Enemy family identity summary:
 *   Ruby       — immune to Burning; weak to Chilled/Frozen (fire vs ice)
 *   Emerald    — resists Poisoned; weak to Burning (fire beats toxin)
 *   Sapphire   — immune to Chilled; resists Frozen; weak to Burning
 *   Iolite     — resists Time-Warped (temporal entity); weak to Radiant (light disrupts time fields)
 *   Amethyst   — weak to Echo-Marked (resonant structure amplifies echoes)
 *   Diamond    — resists Cracked (hard lattice); weak to Abraded (surface friction cracks the facets)
 *   Nullstone  — resists Gravitized; weak to Time-Warped (gravity fields disrupted by temporal distortion)
 *   Fracteryl  — resists Fractal Wound (already fractal); weak to Cracked (structure can be shattered)
 *   Eigenstein — resists Rift-Scarred (already quantum-scarred); weak to Radiant (light collapses wave functions)
 *   Bosses     — broadly resistant, not immune — status builds remain viable
 *   Elites     — mild resistance; elemental elites resist their own status more
 */

import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';
import {
  AFFINITY_WEAK, AFFINITY_NEUTRAL, AFFINITY_RESISTANT, AFFINITY_IMMUNE,
} from './status-balance';

export type StatusAffinity = 'weak' | 'neutral' | 'resistant' | 'immune';

type EnemyAffinityMap = Partial<Record<EnemyStatusKey, StatusAffinity>>;

// ── Affinity table ─────────────────────────────────────────────────────────────

const AFFINITIES: Record<string, EnemyAffinityMap> = {
  // Ruby — fire enemies. Burning immunity is their defining trait.
  ruby:          { burning: 'immune',     chilled: 'weak',      frozen: 'weak' },
  rubyFish:      { burning: 'immune',     chilled: 'weak',      frozen: 'weak' },
  elite_ruby:    { burning: 'resistant',  chilled: 'weak' },

  // Emerald — toxic enemies. Poison-resistant but fragile to fire.
  emerald:       { poisoned: 'resistant', burning: 'weak' },
  emeraldFish:   { poisoned: 'resistant', burning: 'weak' },
  elite_emerald: { poisoned: 'resistant', burning: 'weak' },

  // Sapphire — ice enemies. Immune to Chilled; fire melts them.
  sapphire:      { chilled: 'immune',     frozen: 'resistant',  burning: 'weak' },
  sapphireFish:  { chilled: 'immune',     frozen: 'resistant',  burning: 'weak' },
  elite_sapphire:{ chilled: 'resistant',  frozen: 'resistant',  burning: 'weak' },

  // Iolite — temporal enemies. Time-Warped rolls off; Radiant light disrupts time fields.
  iolite:        { timeWarped: 'resistant', radiant: 'weak' },
  elite_iolite:  { timeWarped: 'resistant', radiant: 'weak' },

  // Amethyst — resonance enemies. Echo-Marked is amplified by their crystalline structure.
  amethyst:      { echoMarked: 'weak' },
  amethystFish:  { echoMarked: 'weak' },
  elite_amethyst:{ echoMarked: 'weak' },

  // Diamond — faceted armor. Hard to Crack but surface Abrasion exploits micro-fractures.
  diamond:       { cracked: 'resistant',  abraded: 'weak' },
  diamondFish:   { cracked: 'resistant',  abraded: 'weak' },
  elite_diamond: { cracked: 'resistant' },

  // Nullstone — gravity entities. Gravitized barely slows them; temporal disruption weakens their fields.
  nullstone:     { gravitized: 'resistant', timeWarped: 'weak' },
  elite_nullstone:{ gravitized: 'resistant' },

  // Fracteryl — fractal entities. Already recursive, so Fractal Wound is diminished; Cracked tears the pattern.
  fracteryl:     { fractalWound: 'resistant', cracked: 'weak' },

  // Eigenstein — quantum entities. Already quantum-scarred; Radiant light collapses their wave functions.
  eigenstein:    { riftScarred: 'resistant', radiant: 'weak' },

  // Bosses: broadly resistant — status builds remain viable but not dominant.
  // Intentionally no immunities so every build can contribute.
  boss:          {
    burning: 'resistant', poisoned: 'resistant',
    chilled: 'resistant', frozen: 'resistant',
    gravitized: 'resistant', timeWarped: 'resistant',
    fractalWound: 'resistant', riftScarred: 'resistant',
    abraded: 'resistant', cracked: 'resistant',
  },

  // Generic elites: mild resistance to DoTs; elemental elites override this.
  elite: {
    burning: 'resistant', poisoned: 'resistant',
  },
};

// ── Multipliers ────────────────────────────────────────────────────────────────

const AFFINITY_MULTIPLIERS: Record<StatusAffinity, number> = {
  weak:      AFFINITY_WEAK,
  neutral:   AFFINITY_NEUTRAL,
  resistant: AFFINITY_RESISTANT,
  immune:    AFFINITY_IMMUNE,
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

/**
 * Returns true if this enemy type is a boss or elite variant.
 * Used to apply boss/elite-specific stack caps (e.g. Rift-Scarred).
 */
export function isBossOrEliteType(enemyTypeId: string): boolean {
  return enemyTypeId === 'boss' || enemyTypeId.startsWith('elite_');
}
