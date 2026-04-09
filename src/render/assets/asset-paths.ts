/**
 * Centralized asset path definitions.
 * All sprite and animation paths are defined here as the single source of truth.
 */

import type { TierId } from '../../data/tiers';

/** Base path for all assets in the repository root. */
const BASE = 'ASSETS';

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
  return `${BASE}/SPRITES/gemIcons/${GEM_ICON_MAP[tierId]}.webp`;
}

// ── Refined Gem Icons ──────────────────────────────────────────

const REFINED_GEM_MAP: Record<TierId, string> = {
  sand: 'refinedSand',
  quartz: 'refinedQuartz',
  ruby: 'refinedRuby',
  sunstone: 'refinedSunstone',
  citrine: 'refinedCitrine',
  emerald: 'refinedEmerald',
  sapphire: 'refinedSapphire',
  iolite: 'refinedIolite',
  amethyst: 'refinedAmethyst',
  diamond: 'refinedDiamond',
  nullstone: 'refinedNullstone',
};

export function getRefinedGemPath(tierId: TierId): string {
  return `${BASE}/SPRITES/refinedGems/${REFINED_GEM_MAP[tierId]}.webp`;
}

/**
 * Legacy fallback path currently aliases to the same file set in ASSETS.
 * Keep this helper to preserve onerror fallback call sites.
 */
export function getRefinedGemFallbackPath(tierId: TierId): string {
  return getRefinedGemPath(tierId);
}

// ── Generator Sprites ──────────────────────────────────────────

/** Maps tier unlock order (0-based) to generator sprite index (1-based). */
export function getGeneratorSpritePath(unlockOrder: number): string {
  return `${BASE}/SPRITES/generators/tier${unlockOrder + 1}.webp`;
}

// ── Forge Sprites ──────────────────────────────────────────────

export const FORGE_SPRITE_PATH = `${BASE}/SPRITES/equationForge/forge.webp`;
export const FORGE_SPRITE_ALT_PATH = `${BASE}/SPRITES/equationForge/forge2.webp`;
export const FORGE_SPRITE_LEGACY_PATH = `${BASE}/SPRITES/equationForge/ORIGINAL-forge.png`;
export const FORGE_SPRITE_ALT_LEGACY_PATH = FORGE_SPRITE_ALT_PATH;

// ── Logo ───────────────────────────────────────────────────────

export const LOGO_PATH = `${BASE}/SPRITES/logo/gravy_thyme_logo.webp`;
export const LOGO_ALT_PATH = `${BASE}/SPRITES/logo/gravy_thyme_logo_alt.webp`;

// ── Background Animation ───────────────────────────────────────

export const BG_ANIMATION_FRAME_COUNT = 2402;
export const BG_ANIMATION_FPS = 24;

export function getBgAnimationFramePath(frameIndex: number): string {
  const padded = String(frameIndex).padStart(5, '0');
  return `${BASE}/ANIMATIONS/menuBackground_animation/menuBackground_animation_${padded}.webp`;
}
