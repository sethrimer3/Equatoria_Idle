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
    description: 'Wears down the target\'s surface, increasing damage taken. Diamond enemies are especially vulnerable to abrasion.',
    target: 'enemy', sourceTier: 'Sand',
  },
  refracted: {
    key: 'refracted', name: 'Refracted', label: 'RFR', color: '#c8e0ff',
    description: 'Scatters incoming light through the target, amplifying all lens-based damage.',
    target: 'enemy', sourceTier: 'Quartz',
  },
  burning: {
    key: 'burning', name: 'Burning', label: 'BRN', color: '#ff5533',
    description: 'Short burst of fire damage over time. Ruby enemies ignore it; emerald and sapphire enemies take extra damage.',
    target: 'both', sourceTier: 'Ruby',
  },
  radiant: {
    key: 'radiant', name: 'Radiant', label: 'RAD', color: '#ffe066',
    description: 'Floods the target with radiant light, amplifying all incoming damage. Especially effective against iolite and eigenstein enemies.',
    target: 'enemy', sourceTier: 'Citrine',
  },
  poisoned: {
    key: 'poisoned', name: 'Poisoned', label: 'PSN', color: '#66dd44',
    description: 'Slower than burning but lasts longer — sustained attrition. Emerald enemies resist poison; ruby enemies are vulnerable.',
    target: 'both', sourceTier: 'Emerald',
  },
  chilled: {
    key: 'chilled', name: 'Chilled', label: 'CHL', color: '#55ccff',
    description: 'Slows enemy movement. Sapphire enemies are immune. Repeated chills from sapphire lens can escalate to Frozen.',
    target: 'both', sourceTier: 'Sapphire',
  },
  timeWarped: {
    key: 'timeWarped', name: 'Time Warped', label: 'TWP', color: '#9966cc',
    description: 'Distorts the target\'s temporal flow, reducing move speed. Iolite enemies resist it; nullstone enemies are unexpectedly vulnerable.',
    target: 'both', sourceTier: 'Iolite',
  },
  echoMarked: {
    key: 'echoMarked', name: 'Echo Marked', label: 'ECH', color: '#cc88ff',
    description: 'Tags the target with resonance. The next hit triggers a delayed echo burst of bonus damage. Amethyst enemies amplify the echo.',
    target: 'enemy', sourceTier: 'Amethyst',
  },
  cracked: {
    key: 'cracked', name: 'Cracked', label: 'CRK', color: '#aaccff',
    description: 'Fractures the target\'s armor, massively increasing lens damage vulnerability. Fracteryl enemies are particularly susceptible.',
    target: 'enemy', sourceTier: 'Diamond',
  },
  gravitized: {
    key: 'gravitized', name: 'Gravitized', label: 'GRV', color: '#666688',
    description: 'Warps local gravity, slowing the target and pulling it toward you. Nullstone enemies resist this; iolite enemies are unexpectedly fragile to it.',
    target: 'enemy', sourceTier: 'Nullstone',
  },
  fractalWound: {
    key: 'fractalWound', name: 'Fractal Wound', label: 'FRC', color: '#ff44aa',
    description: 'Opens recursive dimensional wounds that tick with decaying damage. Boss and elite variants sustain fewer ticks. Fracteryl enemies resist it.',
    target: 'enemy', sourceTier: 'Fracteryl',
  },
  riftScarred: {
    key: 'riftScarred', name: 'Rift Scarred', label: 'RFT', color: '#44ffee',
    description: 'Accumulates quantum scars per hit, multiplying eigenstein damage. Stack cap is lower on bosses. Radiant light amplifies eigenstein damage further.',
    target: 'enemy', sourceTier: 'Eigenstein',
  },
  frozen: {
    key: 'frozen', name: 'Frozen', label: 'FRZ', color: '#aaeeff',
    description: 'Halts enemy movement entirely and makes them take bonus damage. Brief by design — bosses cannot be freeze-locked. Sapphire enemies resist it.',
    target: 'both', sourceTier: 'Sapphire',
  },
};

// ── Player status definitions (applied TO the player by enemies) ───────────────

export const PLAYER_STATUS_DEFS: Record<PlayerStatusKey, StatusEffectDef> = {
  burning: {
    key: 'burning', name: 'Burning', label: 'BRN', color: '#ff5533',
    description: 'You\'re on fire — rapid damage over a short window. Inflicted by ruby enemies. Status Resistance reduces duration.',
    target: 'player',
  },
  poisoned: {
    key: 'poisoned', name: 'Poisoned', label: 'PSN', color: '#66dd44',
    description: 'Toxin drains your health slowly over a longer duration. Inflicted by emerald enemies. Deals less per tick than burning.',
    target: 'player',
  },
  chilled: {
    key: 'chilled', name: 'Chilled', label: 'CHL', color: '#55ccff',
    description: 'Cold slows your movement. Inflicted by sapphire enemies. If you\'re hit again while chilled, you may freeze briefly.',
    target: 'player',
  },
  frozen: {
    key: 'frozen', name: 'Frozen', label: 'FRZ', color: '#aaeeff',
    description: 'You\'re frozen in place — movement nearly stopped. Brief duration and a cooldown prevents repeated freeze-lock.',
    target: 'player',
  },
  slowed: {
    key: 'slowed', name: 'Slowed', label: 'SLW', color: '#888888',
    description: 'Void tendrils from nullstone enemies slow your movement. Manageable, but dangerous if combined with other crowd-control.',
    target: 'player',
  },
  timeWarped: {
    key: 'timeWarped', name: 'Time Warped', label: 'TWP', color: '#9966cc',
    description: 'Iolite enemies warp your temporal flow, slowing attack cadence. Move freely but strike less often.',
    target: 'player',
  },
};
