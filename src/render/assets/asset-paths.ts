/**
 * Centralized asset path definitions.
 * All sprite and animation paths are defined here as the single source of truth.
 */

import type { TierId } from '../../data/tiers';

/** Base path for all assets (served from public/). */
const BASE = 'assets';

// ── Gem Icons ──────────────────────────────────────────────────

/** Maps tier IDs to their raw gem icon filenames. */
const GEM_ICON_MAP: Record<TierId, string> = {
  sand: 'sand',
  quartz: 'quartz',
  ruby: 'ruby',
  sunstone: 'sunstone',
  citrine: 'citrine',
  emerald: 'emerald',
  sapphire: 'sapphire',
  iolite: 'iolite',
  amethyst: 'amethyst',
  diamond: 'diamond',
  nullstone: 'nullstone',
};

export function getGemIconPath(tierId: TierId): string {
  return `${BASE}/sprites/gemIcons/${GEM_ICON_MAP[tierId]}.webp`;
}

// ── Refined Gem Icons ──────────────────────────────────────────

const REFINED_GEM_MAP: Record<TierId, string> = {
  sand: 'sandLens',
  quartz: 'quartzLens',
  ruby: 'rubyLens',
  sunstone: 'sunstoneLens',
  citrine: 'citrineLens',
  emerald: 'emeraldLens',
  sapphire: 'sapphireLens',
  iolite: 'ioliteLens',
  amethyst: 'amethystLens',
  diamond: 'diamondLens',
  nullstone: 'nullstoneLens',
};

export function getRefinedGemPath(tierId: TierId): string {
  return `${BASE}/sprites/refinedGems/${REFINED_GEM_MAP[tierId]}.webp`;
}

// ── Generator Sprites ──────────────────────────────────────────

/** Maps tier unlock order (0-based) to generator sprite index (1-based). */
export function getGeneratorSpritePath(unlockOrder: number): string {
  return `${BASE}/sprites/generators/tier${unlockOrder + 1}.webp`;
}

// ── Forge Sprites ──────────────────────────────────────────────

export const FORGE_SPRITE_PATH = `${BASE}/sprites/equationForge/forge.png`;
export const FORGE_SPRITE_ALT_PATH = `${BASE}/sprites/equationForge/forge2.png`;

// ── Logo ───────────────────────────────────────────────────────

export const LOGO_PATH = `${BASE}/sprites/logo/gravy_thyme_logo.webp`;
export const LOGO_ALT_PATH = `${BASE}/sprites/logo/gravy_thyme_logo_alt.webp`;

// ── Background Animation ───────────────────────────────────────

export const BG_ANIMATION_FRAME_COUNT = 2402;
export const BG_ANIMATION_FPS = 24;

export function getBgAnimationFramePath(frameIndex: number): string {
  const padded = String(frameIndex).padStart(5, '0');
  return `${BASE}/animations/menuBackground_animation/menuBackground_animation_${padded}.webp`;
}
