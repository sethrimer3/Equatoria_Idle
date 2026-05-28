/**
 * rpg-zone-definitions.ts — Data-driven zone definitions for the RPG tab.
 *
 * Five named zones are available.  Each zone owns:
 *   - a display name and short description
 *   - an ordered enemy-pool list (ids match wave-definitions.ts / rpg-factories)
 *   - optional subzone definitions (Horizon only in this pass)
 *   - terrain and visual profile hints (used by future zone rendering work)
 *
 * Zone ordering reflects the intended unlock / progression sequence, but the
 * implementation is intentionally data-driven so the order can be adjusted
 * later without touching spawn or render code.
 */

// ─── Types ────────────────────────────────────────────────────────

export type RpgZoneId =
  | 'euhedral'
  | 'impetus'
  | 'caustics'
  | 'verdure'
  | 'horizon';

export interface RpgSubzoneDefinition {
  id: string;
  displayName: string;
  shortDescription: string;
}

export interface RpgZoneDefinition {
  id: RpgZoneId;
  displayName: string;
  shortDescription: string;
  /** Optional sub-zones (Horizon only in this pass). */
  subzones?: RpgSubzoneDefinition[];
  /**
   * Enemy type IDs whose primary home is this zone.
   * These are the id strings used in wave-definitions.ts and rpg-factories.ts.
   */
  enemyIds: string[];
  /** Hint for terrain generation; interpreted by future zone-rendering work. */
  terrainProfile?: string;
  /** Hint for background and visual effects; interpreted by future zone-rendering work. */
  visualProfile?: string;
}

// ─── Zone definitions ─────────────────────────────────────────────

export const RPG_ZONE_DEFINITIONS: RpgZoneDefinition[] = [
  {
    id: 'euhedral',
    displayName: 'Euhedral',
    shortDescription: 'Crystalline ridges, mineral terrain, and the foundational enemy roster.',
    terrainProfile: 'crystalline',
    visualProfile: 'mineral',
    enemyIds: [
      // Standard enemies
      'laser',
      'quartz',
      'sapphire',
      'emerald',
      'ruby',
      'amber',
      'void',
      'sunstone',
      'citrine',
      'iolite',
      'amethyst',
      'diamond',
      'nullstone',
      'fracteryl',
      'eigenstein',
      // Elite enemies
      'elite_quartz',
      'elite_ruby',
      'elite_sunstone',
      'elite_citrine',
      'elite_iolite',
      'elite_amethyst',
      'elite_diamond',
      'elite_nullstone',
      // Stardust: rare prismatic cloud enemy — crystalline theme fits Euhedral.
      'stardust',
    ],
  },
  {
    id: 'impetus',
    displayName: 'Impetus',
    shortDescription: 'Space, momentum, gravity, asteroids, and living particles.',
    terrainProfile: 'asteroids',
    visualProfile: 'space',
    enemyIds: [
      // Aliven swarm variants
      'aliven_spark_cluster',
      'aliven_shard_bloom',
      'aliven_pulse_swarm',
      'aliven_ember_ring',
      'aliven_void_splinters',
      'aliven_healer_nodes',
      'aliven_orbit_bloom',
      'aliven_quartz_ghost',
      'aliven_iolite_prism',
      'aliven_fracteryl_storm',
      // Additional Impetus enemies
      'proc_dustwisp',
      'proc_moteswarm',
      'proc_shadowhand',
    ],
  },
  {
    id: 'caustics',
    displayName: 'Caustics',
    shortDescription: 'Underwater ridges, fish, jellyfish, and water-light effects.',
    terrainProfile: 'seafloor',
    visualProfile: 'underwater',
    enemyIds: [
      'proc_sandfish',
      'proc_quartzfish',
      'proc_rubyfish',
      'proc_sunstonefish',
      'proc_emeraldfish',
      'proc_sapphirefish',
      'proc_amethystfish',
      'proc_diamondfish',
      'proc_jellyfish',
    ],
  },
  {
    id: 'verdure',
    displayName: 'Verdure',
    shortDescription: 'Procedural plants, vines, insects, ghosts, and living growth.',
    terrainProfile: 'overgrowth',
    visualProfile: 'bioluminescent',
    enemyIds: [
      'proc_ribbonworm',
      'proc_lanternmoth',
      'proc_plantturret',
      'proc_gearinsect',
      'proc_spidercrawler',
      'proc_clothghost',
      'proc_eyestalk',
      'verdure_polyomino',
      'verdure_polyomino_fissile',
      'verdure_polyomino_refractor',
    ],
  },
  {
    id: 'horizon',
    displayName: 'Horizon',
    shortDescription: 'Special capstone zone with Zenith, Nadir, and True subzones.',
    terrainProfile: 'horizon',
    visualProfile: 'transcendent',
    subzones: [
      {
        id: 'zenith',
        displayName: 'Zenith',
        shortDescription: 'High, bright, radiant — upward forces and expanding rings.',
      },
      {
        id: 'nadir',
        displayName: 'Nadir',
        shortDescription: 'Deep, heavy, inverted — inward pull and compression fields.',
      },
      {
        id: 'true',
        displayName: 'True',
        shortDescription: 'Equilibrium — a horizon boundary that transforms everything crossing it.',
      },
    ],
    enemyIds: [],
  },
];

/** Lookup map from zone id to zone definition. */
export const RPG_ZONE_BY_ID: ReadonlyMap<RpgZoneId, RpgZoneDefinition> = new Map(
  RPG_ZONE_DEFINITIONS.map(z => [z.id, z]),
);

/** Returns the display name for a zone id, falling back to the raw id if unknown. */
export function getRpgZoneDisplayName(zoneId: RpgZoneId): string {
  return RPG_ZONE_BY_ID.get(zoneId)?.displayName ?? zoneId;
}

/** All zone ids in progression order. */
export const RPG_ZONE_IDS: readonly RpgZoneId[] = RPG_ZONE_DEFINITIONS.map(z => z.id);

// ─── Terrain / visual profile helpers ────────────────────────────

/**
 * Returns the terrain and visual profile for the given zone.
 *
 * Future zone-rendering work should call this helper (rather than
 * hard-coding zone ids) to route terrain and background generation:
 *
 *   const { terrainProfile, visualProfile } = getRpgZoneTerrainProfile(activeZoneId);
 *   // dispatch terrain generator by terrainProfile ('crystalline', 'asteroids', etc.)
 *
 * Current values:
 *   euhedral  → terrainProfile: 'crystalline',   visualProfile: 'mineral'
 *   impetus   → terrainProfile: 'asteroids',     visualProfile: 'space'
 *   caustics  → terrainProfile: 'seafloor',      visualProfile: 'underwater'
 *   verdure   → terrainProfile: 'overgrowth',    visualProfile: 'bioluminescent'
 *   horizon   → terrainProfile: 'horizon',       visualProfile: 'transcendent'
 */
export function getRpgZoneTerrainProfile(zoneId: RpgZoneId): {
  terrainProfile: string | undefined;
  visualProfile: string | undefined;
} {
  const def = RPG_ZONE_BY_ID.get(zoneId);
  return {
    terrainProfile: def?.terrainProfile,
    visualProfile:  def?.visualProfile,
  };
}
