/**
 * status-effect-definitions.ts — Central encyclopedia for all status effects.
 *
 * Covers both player-received statuses (from enemy attacks) and
 * enemy-applied statuses (from lens Tier 1 effects).
 */

import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';
import type { PlayerStatusKey } from '../../sim/rpg/player-status-effects';

// ── Shared status def ──────────────────────────────────────────────────────────

export interface StatusEffectDef {
  key: EnemyStatusKey | PlayerStatusKey;
  name: string;
  label: string;       // 3-char abbreviated label
  color: string;       // hex color for UI chips
  description: string; // 1-2 sentence player-facing description
  /** 'enemy' = applied to enemies by lenses; 'player' = applied to player by enemies; 'both' = shared */
  target: 'enemy' | 'player' | 'both';
  /** Crystal tier that sources this effect (for enemy-applied statuses) */
  sourceTier?: string;
}

// ── Enemy status definitions (applied TO enemies by lens Tier 1) ───────────────

export const ENEMY_STATUS_DEFS: Record<EnemyStatusKey, StatusEffectDef> = {
  abraded: {
    key: 'abraded', name: 'Abraded', label: 'ABR', color: '#d4a042',
    description: 'Reduces the target\'s defense, causing it to take increased damage from all sources.',
    target: 'enemy', sourceTier: 'Sand',
  },
  refracted: {
    key: 'refracted', name: 'Refracted', label: 'RFR', color: '#c8e0ff',
    description: 'Scatters incoming light through the target, amplifying lens-based damage.',
    target: 'enemy', sourceTier: 'Quartz',
  },
  burning: {
    key: 'burning', name: 'Burning', label: 'BRN', color: '#ff5533',
    description: 'Deals fire damage over time. Ruby enemies are immune; emerald and sapphire enemies are extra vulnerable.',
    target: 'both', sourceTier: 'Ruby',
  },
  radiant: {
    key: 'radiant', name: 'Radiant', label: 'RAD', color: '#ffe066',
    description: 'Amplifies all incoming damage by surrounding the target with radiant light.',
    target: 'enemy', sourceTier: 'Citrine',
  },
  poisoned: {
    key: 'poisoned', name: 'Poisoned', label: 'PSN', color: '#66dd44',
    description: 'Deals toxin damage over time. Slower than burning, but longer duration. Emerald enemies resist it.',
    target: 'both', sourceTier: 'Emerald',
  },
  chilled: {
    key: 'chilled', name: 'Chilled', label: 'CHL', color: '#55ccff',
    description: 'Slows enemy movement speed. Sapphire enemies are immune. Stacks with frozen.',
    target: 'both', sourceTier: 'Sapphire',
  },
  timeWarped: {
    key: 'timeWarped', name: 'Time Warped', label: 'TWP', color: '#9966cc',
    description: 'Distorts the target\'s temporal flow, reducing its attack speed and move speed significantly.',
    target: 'both', sourceTier: 'Iolite',
  },
  echoMarked: {
    key: 'echoMarked', name: 'Echo Marked', label: 'ECH', color: '#cc88ff',
    description: 'Tags the target with an echo resonance. The next hit triggers a delayed echo burst of additional damage.',
    target: 'enemy', sourceTier: 'Amethyst',
  },
  cracked: {
    key: 'cracked', name: 'Cracked', label: 'CRK', color: '#aaccff',
    description: 'Fractures the target\'s surface, massively increasing its vulnerability to lens damage.',
    target: 'enemy', sourceTier: 'Diamond',
  },
  gravitized: {
    key: 'gravitized', name: 'Gravitized', label: 'GRV', color: '#666688',
    description: 'Warps local gravity around the target, reducing its movement to a crawl. Nullstone enemies resist this.',
    target: 'enemy', sourceTier: 'Nullstone',
  },
  fractalWound: {
    key: 'fractalWound', name: 'Fractal Wound', label: 'FRC', color: '#ff44aa',
    description: 'Opens recursive dimensional wounds. Each tick deals damage that decays 70% per pulse. Fracteryl enemies resist it.',
    target: 'enemy', sourceTier: 'Fracteryl',
  },
  riftScarred: {
    key: 'riftScarred', name: 'Rift Scarred', label: 'RFT', color: '#44ffee',
    description: 'Accumulates quantum scars that multiply all eigenstein damage on the target. Resets on death.',
    target: 'enemy', sourceTier: 'Eigenstein',
  },
  frozen: {
    key: 'frozen', name: 'Frozen', label: 'FRZ', color: '#aaeeff',
    description: 'Halts enemy movement entirely. Stronger than chilled, but shorter duration. Sapphire enemies resist it.',
    target: 'both', sourceTier: 'Sapphire',
  },
};

// ── Player status definitions (applied TO the player by enemies) ───────────────

export const PLAYER_STATUS_DEFS: Record<PlayerStatusKey, StatusEffectDef> = {
  burning: {
    key: 'burning', name: 'Burning', label: 'BRN', color: '#ff5533',
    description: 'You are on fire, taking continuous damage. Status Resistance reduces duration.',
    target: 'player',
  },
  poisoned: {
    key: 'poisoned', name: 'Poisoned', label: 'PSN', color: '#66dd44',
    description: 'A toxin is draining your health. Deals less damage than burning, but lasts longer.',
    target: 'player',
  },
  chilled: {
    key: 'chilled', name: 'Chilled', label: 'CHL', color: '#55ccff',
    description: 'Cold air slows your movement. The stronger the chill, the greater the penalty.',
    target: 'player',
  },
  frozen: {
    key: 'frozen', name: 'Frozen', label: 'FRZ', color: '#aaeeff',
    description: 'You are frozen in place. Stronger than chilled — movement is nearly stopped.',
    target: 'player',
  },
  slowed: {
    key: 'slowed', name: 'Slowed', label: 'SLW', color: '#888888',
    description: 'Your movement is hindered, reducing travel speed significantly.',
    target: 'player',
  },
  timeWarped: {
    key: 'timeWarped', name: 'Time Warped', label: 'TWP', color: '#9966cc',
    description: 'Temporal distortion slows your attack cadence, reducing how often you strike.',
    target: 'player',
  },
};
