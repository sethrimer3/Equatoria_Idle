/**
 * wave-definitions.ts — Data definitions for RPG wave-based enemy spawning.
 *
 * Waves are pre-defined for the first several waves; higher waves are generated
 * procedurally so new wave data can be added without touching renderer logic.
 * New enemy types are supported by registering a new `enemyTypeId` and
 * handling it in the RPG renderer.
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
  { waveNumber:  1, spawns: [{ enemyTypeId: 'laser', count: 1, spawnDelay:    0 }] },
  { waveNumber:  2, spawns: [{ enemyTypeId: 'laser', count: 2, spawnDelay:  800 }] },
  { waveNumber:  3, spawns: [{ enemyTypeId: 'laser', count: 2, spawnDelay:  600 }] },
  { waveNumber:  4, spawns: [{ enemyTypeId: 'laser', count: 3, spawnDelay:  700 }] },
  { waveNumber:  5, spawns: [{ enemyTypeId: 'laser', count: 3, spawnDelay:  500 }] },
  { waveNumber:  6, spawns: [{ enemyTypeId: 'laser', count: 4, spawnDelay:  600 }] },
  { waveNumber:  7, spawns: [{ enemyTypeId: 'laser', count: 4, spawnDelay:  500 }] },
  { waveNumber:  8, spawns: [{ enemyTypeId: 'laser', count: 5, spawnDelay:  600 }] },
  { waveNumber:  9, spawns: [{ enemyTypeId: 'laser', count: 5, spawnDelay:  400 }] },
  { waveNumber: 10, spawns: [{ enemyTypeId: 'laser', count: 6, spawnDelay:  500 }] },
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
  const count = Math.min(3 + Math.floor(waveNumber * 0.6), 12);
  const delay = Math.max(150, 600 - waveNumber * 18);
  return {
    waveNumber,
    spawns: [{ enemyTypeId: 'laser', count, spawnDelay: delay }],
  };
}
