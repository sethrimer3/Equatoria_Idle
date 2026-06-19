/**
 * Centralized asset path definitions.
 * All sprite and animation paths are defined here as the single source of truth.
 */

import type { TierId } from '../../data/tiers';
import type { EnemyStatusKey } from '../../sim/rpg/enemy-status-effects';
import type { EnemyCatalogEntry } from '../../ui/panels/rpg-enemies-catalog-types';

/** Base path for all assets in the repository root. */
const BASE = 'ASSETS';

// ── Mote Icons ─────────────────────────────────────────────────
// Small per-tier gem sprites used in the idle reward overlay,
// achievements tab, equation upgrades panel, and anywhere a tier
// needs a quick visual indicator.
// Folder: ASSETS/SPRITES/moteIcons/

const MOTE_ICON_MAP: Record<TierId, string> = {
  sand:       'sand',
  quartz:     'quartz',
  ruby:       'ruby',
  sunstone:   'sunstone',
  citrine:    'citrine',
  emerald:    'emerald',
  sapphire:   'sapphire',
  iolite:     'iolite',
  amethyst:   'amethyst',
  diamond:    'diamond',
  nullstone:  'nullstone',
  fracteryl:  'fracteryl',
  eigenstein: 'eigenstein',
};

export function getMoteIconPath(tierId: TierId): string {
  return `${BASE}/SPRITES/moteIcons/${MOTE_ICON_MAP[tierId]}.webp`;
}

/**
 * @deprecated Renamed to getMoteIconPath. Kept for call-site compatibility
 * until all usages are migrated.
 */
export function getGemIconPath(tierId: TierId): string {
  return getMoteIconPath(tierId);
}

// ── Refined Mote Icons ─────────────────────────────────────────
// Sprites shown for refined crystals in the crafting UI, inventory
// chips, and resource panel.
// Folder: ASSETS/SPRITES/refinedMotes/

const REFINED_MOTE_MAP: Record<TierId, string> = {
  sand:       'refinedSand',
  quartz:     'refinedQuartz',
  ruby:       'refinedRuby',
  sunstone:   'refinedSunstone',
  citrine:    'refinedCitrine',
  emerald:    'refinedEmerald',
  sapphire:   'refinedSapphire',
  iolite:     'refinedIolite',
  amethyst:   'refinedAmethyst',
  diamond:    'refinedDiamond',
  nullstone:  'refinedNullstone',
  fracteryl:  'refinedFracteryl',
  eigenstein: 'refinedEigenstein',
};

export function getRefinedGemPath(tierId: TierId): string {
  return `${BASE}/SPRITES/refinedMotes/${REFINED_MOTE_MAP[tierId]}.webp`;
}

/**
 * Legacy fallback path — aliases to the primary path.
 * Kept to preserve onerror fallback call sites.
 */
export function getRefinedGemFallbackPath(tierId: TierId): string {
  return getRefinedGemPath(tierId);
}

// ── Status Effect Icons ─────────────────────────────────────────
// Tiny icons rendered above enemy health bars while a status is active.
// One icon per tier — the tier associated with the lens effect that
// applied the status.
// Folder: ASSETS/SPRITES/statusEffectIcons/

/** Maps each EnemyStatusKey to the tier whose icon represents it. */
const STATUS_EFFECT_TIER: Record<EnemyStatusKey, TierId> = {
  abraded:      'sand',
  refracted:    'quartz',
  burning:      'ruby',
  radiant:      'sunstone',
  poisoned:     'emerald',
  chilled:      'sapphire',
  timeWarped:   'iolite',
  echoMarked:   'amethyst',
  cracked:      'diamond',
  gravitized:   'nullstone',
  fractalWound: 'fracteryl',
  riftScarred:  'eigenstein',
  frozen:       'sapphire',   // shares sapphire (cold / freeze)
};

export function getStatusEffectIconPath(key: EnemyStatusKey): string {
  const tierId = STATUS_EFFECT_TIER[key];
  return `${BASE}/SPRITES/statusEffectIcons/${tierId}.webp`;
}

// ── Generator Sprites ──────────────────────────────────────────

/** Maps tier unlock order (0-based) to generator sprite index (1-based). */
export function getGeneratorSpritePath(unlockOrder: number): string {
  return `${BASE}/SPRITES/generators/tier${unlockOrder + 1}.webp`;
}

// ── Forge Sprites ──────────────────────────────────────────────

export const FORGE_SPRITE_PATH = `${BASE}/SPRITES/equationForge/forge.webp`;
export const FORGE_SPRITE_ALT_PATH = `${BASE}/SPRITES/equationForge/forge2.webp`;
export const FORGE_COLD_SPRITE_PATH = `${BASE}/SPRITES/equationForge/forge_cold.webp`;
export const FORGE_COLD_SPRITE_ALT_PATH = `${BASE}/SPRITES/equationForge/forge2_cold.webp`;
export const FORGE_SPRITE_LEGACY_PATH = `${BASE}/SPRITES/equationForge/ORIGINAL-forge.png`;
export const FORGE_SPRITE_ALT_LEGACY_PATH = FORGE_SPRITE_ALT_PATH;

/** Five blurred tower-ring sprites ported from Thero Idle TD tower visuals. */
export const FORGE_RING_SPRITE_PATHS = [
  `${BASE}/SPRITES/equationForge/forgeRings/ring_blur (1).png`,
  `${BASE}/SPRITES/equationForge/forgeRings/ring_blur (2).png`,
  `${BASE}/SPRITES/equationForge/forgeRings/ring_blur (3).png`,
  `${BASE}/SPRITES/equationForge/forgeRings/ring_blur (4).png`,
  `${BASE}/SPRITES/equationForge/forgeRings/ring_blur (5).png`,
] as const;

// ── Logo ───────────────────────────────────────────────────────

export const LOGO_PATH = `${BASE}/SPRITES/logo/gravy_thyme_logo.webp`;
export const LOGO_ALT_PATH = `${BASE}/SPRITES/logo/gravy_thyme_logo_alt.webp`;
export const ENEMY_CODEX_ICON_PATH = `${BASE}/SPRITES/menuElements/icons/enemyCodex/enemyCodex.png`;
export const ENEMY_CODEX_GLOW_ICON_PATH = `${BASE}/SPRITES/menuElements/icons/enemyCodex/enemyCodex_glow.png`;
export const ENEMY_CODEX_SHARD_ICON_PATHS = Array.from(
  { length: 8 },
  (_, index) => `${BASE}/SPRITES/menuElements/icons/enemyCodex/codexShard (${index + 1}).png`,
) as readonly string[];
export const ZONE_SELECTION_ICON_PATH = `${BASE}/SPRITES/menuElements/icons/zoneSelection/zoneSelection_icon.png`;
export const ZONE_SELECTION_GLOW_OVERLAY_PATHS = Array.from(
  { length: 5 },
  (_, index) => `${BASE}/SPRITES/menuElements/icons/zoneSelection/glowOverlay (${index + 1}).png`,
) as readonly string[];
export const ZONE_SELECTION_BAR_OVERLAY_PATHS = Array.from(
  { length: 2 },
  (_, index) => `${BASE}/SPRITES/menuElements/icons/zoneSelection/barOverlay (${index + 1}).png`,
) as readonly string[];
export const ZONE_SELECTION_SHEEN_OVERLAY_PATHS = Array.from(
  { length: 22 },
  (_, index) => `${BASE}/SPRITES/menuElements/icons/zoneSelection/sheenOverlay (${index + 1}).png`,
) as readonly string[];
export const ZONE_TAB_ICON_PATHS: Record<string, string> = {
  all:      `${BASE}/SPRITES/menuElements/icons/zones/AllZones.png`,
  euhedral: `${BASE}/SPRITES/menuElements/icons/zones/Euhedral.png`,
  impetus:  `${BASE}/SPRITES/menuElements/icons/zones/Impetus.png`,
  caustics: `${BASE}/SPRITES/menuElements/icons/zones/Caustics.png`,
  verdure:  `${BASE}/SPRITES/menuElements/icons/zones/Verdure.png`,
};

export const SKILL_CODEX_ICON_PATH = `${BASE}/SPRITES/menuElements/icons/skillCodex/skillCodex.png`;
export const SKILL_CODEX_GLOW_ICON_PATH = `${BASE}/SPRITES/menuElements/icons/skillCodex/skillCodex_glow.png`;
export const SKILL_CODEX_SHARD_ICON_PATHS = Array.from(
  { length: 8 },
  (_, index) => `${BASE}/SPRITES/menuElements/icons/skillCodex/codexShard (${index + 1}).png`,
) as readonly string[];

// ── Background Animation ───────────────────────────────────────

export const BG_ANIMATION_FRAME_COUNT = 2402;
export const BG_ANIMATION_FPS = 24;

export function getBgAnimationFramePath(frameIndex: number): string {
  const padded = String(frameIndex).padStart(5, '0');
  return `${BASE}/ANIMATIONS/menuBackground_animation/menuBackground_animation_${padded}.webp`;
}

// ── Enemy Codex Icons ──────────────────────────────────────────
// Dedicated PNG icons displayed as the main image in codex cards.
// Folder: ASSETS/SPRITES/enemyIcons/{Zone}/
// Horizon sub-zones: ASSETS/SPRITES/enemyIcons/{Zenith|Nadir|True}/
// When an entry has no iconFile the codex falls back to fallBack_icon.png.

export const FALLBACK_ENEMY_ICON_PATH = `${BASE}/SPRITES/enemyIcons/fallBack_icon.png`;
export const ENEMY_ICON_FRAME_PATH = `${BASE}/SPRITES/enemyIcons/EnemyIconFrame/Frame.png`;
export const ENEMY_ICON_FRAME_MASK_PATH = `${BASE}/SPRITES/enemyIcons/EnemyIconFrame/FrameMask.png`;

const ENEMY_ICON_ZONE_FOLDER: Record<Exclude<EnemyCatalogEntry['zone'], undefined>, string> = {
  euhedral: 'Euhedral',
  impetus: 'Impetus',
  caustics: 'Caustics',
  verdure: 'Verdure',
  horizon: 'Horizon',
};

export function getEnemyIconPath(entry: EnemyCatalogEntry): string {
  if (!entry.iconFile || !entry.zone) return FALLBACK_ENEMY_ICON_PATH;
  if (entry.zone === 'horizon') {
    if (!entry.horizonSubZone) return FALLBACK_ENEMY_ICON_PATH;
    return `${BASE}/SPRITES/enemyIcons/${entry.horizonSubZone}/${entry.iconFile}`;
  }
  return `${BASE}/SPRITES/enemyIcons/${ENEMY_ICON_ZONE_FOLDER[entry.zone]}/${entry.iconFile}`;
}
