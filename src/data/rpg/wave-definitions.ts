/**
 * wave-definitions.ts — Data definitions for RPG wave-based enemy spawning.
 *
 * Waves are pre-defined for the first several waves; higher waves are generated
 * procedurally so new wave data can be added without touching renderer logic.
 * New enemy types are supported by registering a new `enemyTypeId` and
 * handling it in the RPG renderer.
 *
 * Enemy types (in difficulty order):
 *  'laser'    — red dash-striker, low HP, first appears wave 1
 *  'sapphire' — blue shielded missile-launcher, appears wave 6+
 *  'emerald'  — green blink-striker, teleports to player, appears wave 9+
 *  'amber'    — orange fan-gunner, fires 3 homing shards in a spread, appears wave 12+
 *  'void'     — purple slow bruiser, constantly pursues with contact damage, appears wave 15+
 */

// ─── Types ────────────────────────────────────────────────────────

/** A single spawn group within a wave. */
export interface WaveSpawn {
  /** Registry key used to instantiate the correct enemy variant. */
  enemyTypeId: string;
  /** How many enemies in this group. */
  count: number;
  /** Milliseconds between each successive spawn in the group. */
  spawnDelay: number;
}

/** Full specification for one wave. */
export interface WaveDefinition {
  waveNumber: number;
  spawns: WaveSpawn[];
}

// ─── Pre-defined waves ────────────────────────────────────────────

/** Hand-authored wave definitions. */
export const WAVE_DEFINITIONS: WaveDefinition[] = [
  { waveNumber:  1, spawns: [{ enemyTypeId: 'laser',    count: 1, spawnDelay:    0 }] },
  { waveNumber:  2, spawns: [{ enemyTypeId: 'laser',    count: 2, spawnDelay:  800 }] },
  { waveNumber:  3, spawns: [{ enemyTypeId: 'laser',    count: 2, spawnDelay:  600 }] },
  { waveNumber:  4, spawns: [{ enemyTypeId: 'laser',    count: 3, spawnDelay:  700 }] },
  { waveNumber:  5, spawns: [{ enemyTypeId: 'laser',    count: 3, spawnDelay:  500 }] },
  {
    waveNumber: 6,
    spawns: [
      { enemyTypeId: 'laser',    count: 2, spawnDelay: 700 },
      { enemyTypeId: 'sapphire', count: 1, spawnDelay: 900 },
    ],
  },
  {
    waveNumber: 7,
    spawns: [
      { enemyTypeId: 'laser',    count: 3, spawnDelay: 600 },
      { enemyTypeId: 'sapphire', count: 1, spawnDelay: 900 },
    ],
  },
  {
    waveNumber: 8,
    spawns: [
      { enemyTypeId: 'laser',    count: 3, spawnDelay: 600 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 1200 },
    ],
  },
  // Wave 9: emerald introduced — blink-striker adds a new threat on top of existing mix
  {
    waveNumber: 9,
    spawns: [
      { enemyTypeId: 'laser',    count: 3, spawnDelay: 500 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 1100 },
      { enemyTypeId: 'emerald',  count: 1, spawnDelay: 1300 },
    ],
  },
  {
    waveNumber: 10,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 500 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 1000 },
      { enemyTypeId: 'emerald',  count: 1, spawnDelay: 1200 },
    ],
  },
  {
    waveNumber: 11,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 500 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 1000 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 1100 },
    ],
  },
  // Wave 12: amber introduced — fan-gunner raises projectile pressure
  {
    waveNumber: 12,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 500 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 1000 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 1100 },
      { enemyTypeId: 'amber',    count: 1, spawnDelay: 1400 },
    ],
  },
  {
    waveNumber: 13,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 480 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 950 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 1000 },
      { enemyTypeId: 'amber',    count: 1, spawnDelay: 1300 },
    ],
  },
  {
    waveNumber: 14,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 460 },
      { enemyTypeId: 'sapphire', count: 3, spawnDelay: 900 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 950 },
      { enemyTypeId: 'amber',    count: 2, spawnDelay: 1200 },
    ],
  },
  // Wave 15: void introduced — slow high-HP bruiser escalates endgame threat
  {
    waveNumber: 15,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 450 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 900 },
      { enemyTypeId: 'emerald',  count: 3, spawnDelay: 900 },
      { enemyTypeId: 'amber',    count: 1, spawnDelay: 1100 },
      { enemyTypeId: 'void',     count: 1, spawnDelay: 1800 },
    ],
  },
  {
    waveNumber: 16,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 430 },
      { enemyTypeId: 'sapphire', count: 3, spawnDelay: 900 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 880 },
      { enemyTypeId: 'amber',    count: 2, spawnDelay: 1100 },
      { enemyTypeId: 'void',     count: 1, spawnDelay: 1700 },
    ],
  },
  {
    waveNumber: 17,
    spawns: [
      { enemyTypeId: 'laser',    count: 5, spawnDelay: 420 },
      { enemyTypeId: 'sapphire', count: 3, spawnDelay: 880 },
      { enemyTypeId: 'emerald',  count: 3, spawnDelay: 860 },
      { enemyTypeId: 'amber',    count: 2, spawnDelay: 1100 },
      { enemyTypeId: 'void',     count: 1, spawnDelay: 1600 },
    ],
  },
  {
    waveNumber: 18,
    spawns: [
      { enemyTypeId: 'laser',    count: 5, spawnDelay: 400 },
      { enemyTypeId: 'sapphire', count: 3, spawnDelay: 860 },
      { enemyTypeId: 'emerald',  count: 3, spawnDelay: 840 },
      { enemyTypeId: 'amber',    count: 2, spawnDelay: 1050 },
      { enemyTypeId: 'void',     count: 2, spawnDelay: 1600 },
    ],
  },
  {
    waveNumber: 19,
    spawns: [
      { enemyTypeId: 'laser',    count: 5, spawnDelay: 380 },
      { enemyTypeId: 'sapphire', count: 3, spawnDelay: 840 },
      { enemyTypeId: 'emerald',  count: 3, spawnDelay: 820 },
      { enemyTypeId: 'amber',    count: 3, spawnDelay: 1000 },
      { enemyTypeId: 'void',     count: 2, spawnDelay: 1500 },
    ],
  },
  {
    waveNumber: 20,
    spawns: [
      { enemyTypeId: 'laser',    count: 6, spawnDelay: 360 },
      { enemyTypeId: 'sapphire', count: 4, spawnDelay: 820 },
      { enemyTypeId: 'emerald',  count: 4, spawnDelay: 800 },
      { enemyTypeId: 'amber',    count: 3, spawnDelay: 950 },
      { enemyTypeId: 'void',     count: 2, spawnDelay: 1400 },
    ],
  },
];

// ─── Procedural generator ─────────────────────────────────────────

/**
 * Returns the WaveDefinition for the given wave number.
 * Waves beyond WAVE_DEFINITIONS are generated procedurally, scaling
 * enemy count and tightening spawn delay as the wave number grows.
 */
export function getWaveDefinition(waveNumber: number): WaveDefinition {
  const predefined = WAVE_DEFINITIONS.find(w => w.waveNumber === waveNumber);
  if (predefined) return predefined;

  // Procedural: count grows slowly; delay tightens as waves increase.
  const laserCount    = Math.min(2 + Math.floor(waveNumber * 0.4), 9);
  const sapphireCount = Math.min(1 + Math.floor((waveNumber -  5) * 0.25), 5);
  const emeraldCount  = Math.min(1 + Math.floor((waveNumber -  8) * 0.22), 5);
  const amberCount    = Math.min(1 + Math.floor((waveNumber - 11) * 0.18), 4);
  const voidCount     = Math.min(1 + Math.floor((waveNumber - 14) * 0.12), 3);
  const delay = Math.max(130, 600 - waveNumber * 18);
  const spawns: WaveSpawn[] = [
    { enemyTypeId: 'laser',    count: laserCount,    spawnDelay: delay },
    { enemyTypeId: 'sapphire', count: sapphireCount, spawnDelay: delay + 400 },
    { enemyTypeId: 'emerald',  count: emeraldCount,  spawnDelay: delay + 350 },
  ];
  if (waveNumber >= 12) spawns.push({ enemyTypeId: 'amber', count: amberCount, spawnDelay: delay + 600 });
  if (waveNumber >= 15) spawns.push({ enemyTypeId: 'void',  count: voidCount,  spawnDelay: delay + 900 });
  return { waveNumber, spawns };
}
