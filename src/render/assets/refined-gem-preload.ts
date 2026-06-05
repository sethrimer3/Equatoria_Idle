/**
 * refined-gem-preload.ts — Fire-and-forget preload for all refined gem sprites.
 *
 * Call once at startup so sprites are in cache by the time the crafting page
 * and other UI panels need to draw them to canvas.
 */

import { TIERS } from '../../data/tiers';
import { getRefinedGemPath } from './asset-paths';
import { loadImage } from './asset-loader';

export function preloadRefinedGemSprites(): void {
  for (const tier of TIERS) {
    loadImage(getRefinedGemPath(tier.id)).catch(() => {
      // Silently ignore missing sprites; UI will fall back gracefully
    });
  }
}
