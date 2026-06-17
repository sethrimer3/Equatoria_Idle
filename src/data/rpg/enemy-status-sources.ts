/**
 * enemy-status-sources.ts — Which enemy types inflict which player statuses.
 *
 * Used in the Enemy Codex to show "Inflicts: burning, chilled" on each entry.
 */

import type { PlayerStatusKey } from '../../sim/rpg/player-status-effects';

/** Maps enemy catalog ID → list of player statuses that enemy can inflict. */
export const ENEMY_STATUS_SOURCES: Record<string, readonly PlayerStatusKey[]> = {
  ruby:            ['burning'],
  rubyFish:        ['burning'],
  elite_ruby:      ['burning'],

  emerald:         ['poisoned'],
  emeraldFish:     ['poisoned'],
  elite_emerald:   ['poisoned'],

  sapphire:        ['chilled', 'frozen'],
  sapphireFish:    ['chilled', 'frozen'],
  elite_sapphire:  ['chilled', 'frozen'],

  iolite:          ['timeWarped'],
  elite_iolite:    ['timeWarped'],

  nullstone:       ['slowed'],
  elite_nullstone: ['slowed'],

  // Bosses draw from multiple sources
  boss:            ['burning', 'poisoned', 'chilled', 'timeWarped'],
};
