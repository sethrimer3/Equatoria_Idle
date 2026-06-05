/**
 * refined-gem-preload.ts — Fire-and-forget preload for all tier sprite sets.
 *
 * Loads refined mote sprites, mote icons, and status effect icons into the
 * asset-loader cache at startup so they are ready before any canvas draw or
 * DOM element requests them.
 */

import { TIERS } from '../../data/tiers';
import { getRefinedGemPath, getMoteIconPath, getStatusEffectIconPath } from './asset-paths';
import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';
import { loadImage } from './asset-loader';

const ALL_STATUS_KEYS: readonly EnemyStatusKey[] = [
  'abraded', 'refracted', 'burning', 'radiant', 'poisoned', 'chilled',
  'timeWarped', 'echoMarked', 'cracked', 'gravitized', 'fractalWound',
  'riftScarred', 'frozen',
];

function silentLoad(path: string): void {
  loadImage(path).catch(() => { /* graceful: missing sprites are ignored */ });
}

export function preloadRefinedGemSprites(): void {
  for (const tier of TIERS) {
    silentLoad(getRefinedGemPath(tier.id));
    silentLoad(getMoteIconPath(tier.id));
  }
  // Status effect icons are deduplicated by asset-loader cache; some tiers
  // share an icon (e.g. frozen → sapphire) so duplicates are no-ops.
  for (const key of ALL_STATUS_KEYS) {
    silentLoad(getStatusEffectIconPath(key));
  }
}
