/**
 * wave-definitions.ts — Data definitions for RPG wave-based enemy spawning.
 *
 * Waves are pre-defined for the first several waves; higher waves are generated
 * procedurally so new wave data can be added without touching renderer logic.
 * New enemy types are supported by registering a new `enemyTypeId` and
 * handling it in the RPG renderer.
 *
 * Enemy types (in difficulty order):
 *  'laser'     — red dash-striker, low HP, first appears wave 1
 *  'quartz'    — white crystal orbiter, appears wave 1+
 *  'sapphire'  — blue shielded missile-launcher, appears wave 6+
 *  'emerald'   — green blink-striker, teleports to player, appears wave 9+
 *  'amber'     — orange fan-gunner, fires 3 homing shards in a spread, appears wave 12+
 *  'void'      — purple slow bruiser, constantly pursues with contact damage, appears wave 15+
 *  'ruby'      — fast red patroller with rapid bolts, appears wave 10+
 *  'sunstone'  — orange orbiter with area pulse, appears wave 20+
 *  'citrine'   — yellow fast patrol + homing bolts, appears wave 30+
 *  'iolite'    — indigo tanky beam-blaster, appears wave 40+
 *  'amethyst'  — purple crystal-shielder ring-burst, appears wave 50+
 *  'diamond'   — phase-shifting shard-shooter, appears wave 60+
 *  'nullstone' — gravity well with void tendrils, appears wave 70+
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
  isBossWave?: boolean;
}

// ─── Pre-defined waves ────────────────────────────────────────────

/** Hand-authored wave definitions for early progression. */
export const WAVE_DEFINITIONS: WaveDefinition[] = [
  {
    waveNumber: 1,
    spawns: [
      { enemyTypeId: 'laser',  count: 1, spawnDelay:   0 },
      { enemyTypeId: 'quartz', count: 1, spawnDelay: 500 },
    ],
  },
  {
    waveNumber: 2,
    spawns: [
      { enemyTypeId: 'laser',  count: 2, spawnDelay: 800 },
      { enemyTypeId: 'quartz', count: 1, spawnDelay: 600 },
    ],
  },
  {
    waveNumber: 3,
    spawns: [
      { enemyTypeId: 'laser',  count: 2, spawnDelay: 600 },
      { enemyTypeId: 'quartz', count: 2, spawnDelay: 700 },
    ],
  },
  {
    waveNumber: 4,
    spawns: [
      { enemyTypeId: 'laser',  count: 3, spawnDelay: 700 },
      { enemyTypeId: 'quartz', count: 2, spawnDelay: 600 },
    ],
  },
  // Wave 5: no boss before wave 100
  {
    waveNumber: 5,
    spawns: [
      { enemyTypeId: 'laser',  count: 2, spawnDelay: 600 },
      { enemyTypeId: 'quartz', count: 1, spawnDelay: 700 },
    ],
  },
  {
    waveNumber: 6,
    spawns: [
      { enemyTypeId: 'laser',    count: 2, spawnDelay: 700 },
      { enemyTypeId: 'quartz',   count: 2, spawnDelay: 600 },
      { enemyTypeId: 'sapphire', count: 1, spawnDelay: 900 },
    ],
  },
  {
    waveNumber: 7,
    spawns: [
      { enemyTypeId: 'laser',    count: 3, spawnDelay: 600 },
      { enemyTypeId: 'quartz',   count: 2, spawnDelay: 550 },
      { enemyTypeId: 'sapphire', count: 1, spawnDelay: 900 },
    ],
  },
  {
    waveNumber: 8,
    spawns: [
      { enemyTypeId: 'laser',    count: 3, spawnDelay: 600 },
      { enemyTypeId: 'quartz',   count: 2, spawnDelay: 500 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 1200 },
    ],
  },
  {
    waveNumber: 9,
    spawns: [
      { enemyTypeId: 'laser',    count: 3, spawnDelay: 500 },
      { enemyTypeId: 'quartz',   count: 2, spawnDelay: 500 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 1100 },
      { enemyTypeId: 'emerald',  count: 1, spawnDelay: 1300 },
    ],
  },
  // Wave 10: no boss before wave 100
  {
    waveNumber: 10,
    spawns: [
      { enemyTypeId: 'laser',    count: 3, spawnDelay: 500 },
      { enemyTypeId: 'quartz',   count: 2, spawnDelay: 480 },
      { enemyTypeId: 'sapphire', count: 1, spawnDelay: 1000 },
    ],
  },
  {
    waveNumber: 11,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 500 },
      { enemyTypeId: 'quartz',   count: 2, spawnDelay: 460 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 1000 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 1100 },
    ],
  },
  {
    waveNumber: 12,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 500 },
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 450 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 1000 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 1100 },
      { enemyTypeId: 'amber',    count: 1, spawnDelay: 1400 },
    ],
  },
  {
    waveNumber: 13,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 480 },
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 430 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 950 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 1000 },
      { enemyTypeId: 'amber',    count: 1, spawnDelay: 1300 },
    ],
  },
  {
    waveNumber: 14,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 460 },
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 420 },
      { enemyTypeId: 'sapphire', count: 3, spawnDelay: 900 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 950 },
      { enemyTypeId: 'amber',    count: 2, spawnDelay: 1200 },
    ],
  },
  // Wave 15: no boss before wave 100
  {
    waveNumber: 15,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 450 },
      { enemyTypeId: 'quartz',   count: 2, spawnDelay: 420 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 900 },
      { enemyTypeId: 'amber',    count: 1, spawnDelay: 1100 },
    ],
  },
  {
    waveNumber: 16,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 430 },
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 400 },
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
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 400 },
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
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 380 },
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
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 360 },
      { enemyTypeId: 'sapphire', count: 3, spawnDelay: 840 },
      { enemyTypeId: 'emerald',  count: 3, spawnDelay: 820 },
      { enemyTypeId: 'amber',    count: 3, spawnDelay: 1000 },
      { enemyTypeId: 'void',     count: 2, spawnDelay: 1500 },
    ],
  },
  // Wave 20: no boss before wave 100
  {
    waveNumber: 20,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 380 },
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 360 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 820 },
      { enemyTypeId: 'amber',    count: 2, spawnDelay: 950 },
      { enemyTypeId: 'void',     count: 1, spawnDelay: 1400 },
    ],
  },
  {
    waveNumber: 21,
    spawns: [
      { enemyTypeId: 'laser',    count: 6, spawnDelay: 360 },
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 340 },
      { enemyTypeId: 'sapphire', count: 4, spawnDelay: 820 },
      { enemyTypeId: 'emerald',  count: 4, spawnDelay: 800 },
      { enemyTypeId: 'amber',    count: 3, spawnDelay: 950 },
      { enemyTypeId: 'void',     count: 2, spawnDelay: 1400 },
    ],
  },
  {
    waveNumber: 22,
    spawns: [
      { enemyTypeId: 'laser',    count: 6, spawnDelay: 340 },
      { enemyTypeId: 'quartz',   count: 4, spawnDelay: 320 },
      { enemyTypeId: 'sapphire', count: 4, spawnDelay: 800 },
      { enemyTypeId: 'emerald',  count: 4, spawnDelay: 780 },
      { enemyTypeId: 'amber',    count: 3, spawnDelay: 920 },
      { enemyTypeId: 'void',     count: 2, spawnDelay: 1350 },
      { enemyTypeId: 'ruby',     count: 2, spawnDelay: 900 },
    ],
  },
  {
    waveNumber: 23,
    spawns: [
      { enemyTypeId: 'laser',    count: 6, spawnDelay: 320 },
      { enemyTypeId: 'quartz',   count: 4, spawnDelay: 300 },
      { enemyTypeId: 'sapphire', count: 4, spawnDelay: 780 },
      { enemyTypeId: 'emerald',  count: 4, spawnDelay: 760 },
      { enemyTypeId: 'amber',    count: 3, spawnDelay: 900 },
      { enemyTypeId: 'void',     count: 3, spawnDelay: 1300 },
      { enemyTypeId: 'ruby',     count: 3, spawnDelay: 880 },
    ],
  },
  {
    waveNumber: 24,
    spawns: [
      { enemyTypeId: 'laser',    count: 7, spawnDelay: 300 },
      { enemyTypeId: 'quartz',   count: 4, spawnDelay: 280 },
      { enemyTypeId: 'sapphire', count: 4, spawnDelay: 760 },
      { enemyTypeId: 'emerald',  count: 5, spawnDelay: 740 },
      { enemyTypeId: 'amber',    count: 4, spawnDelay: 880 },
      { enemyTypeId: 'void',     count: 3, spawnDelay: 1250 },
      { enemyTypeId: 'ruby',     count: 3, spawnDelay: 860 },
    ],
  },
  // Wave 25: no boss before wave 100
  {
    waveNumber: 25,
    spawns: [
      { enemyTypeId: 'laser',    count: 5, spawnDelay: 300 },
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 280 },
      { enemyTypeId: 'emerald',  count: 3, spawnDelay: 740 },
      { enemyTypeId: 'amber',    count: 2, spawnDelay: 880 },
      { enemyTypeId: 'void',     count: 2, spawnDelay: 1250 },
      { enemyTypeId: 'ruby',     count: 2, spawnDelay: 860 },
    ],
  },
];

// ─── Procedural generator ─────────────────────────────────────────

/**
 * Returns the WaveDefinition for the given wave number.
 * Waves beyond WAVE_DEFINITIONS are generated procedurally, scaling
 * enemy count and tightening spawn delay as the wave number grows.
 * Boss waves begin at wave 100 and repeat every 100 waves.
 */
export function getWaveDefinition(waveNumber: number): WaveDefinition {
  const predefined = WAVE_DEFINITIONS.find(w => w.waveNumber === waveNumber);
  if (predefined) return predefined;

  // Boss wave every 100 waves — boss with a small escort
  if (waveNumber % 100 === 0) {
    const delay = Math.max(130, 600 - waveNumber * 18);
    const escort: WaveSpawn[] = [];
    const laserCount  = Math.min(2 + Math.floor(waveNumber * 0.15), 6);
    const quartzCount = Math.min(1 + Math.floor(waveNumber * 0.1),  4);
    escort.push({ enemyTypeId: 'laser',  count: laserCount,  spawnDelay: delay });
    escort.push({ enemyTypeId: 'quartz', count: quartzCount, spawnDelay: delay });
    if (waveNumber >= 30) escort.push({ enemyTypeId: 'void',      count: 1, spawnDelay: delay + 900 });
    if (waveNumber >= 40) escort.push({ enemyTypeId: 'diamond',   count: 1, spawnDelay: delay + 1100 });
    if (waveNumber >= 60) escort.push({ enemyTypeId: 'nullstone', count: 1, spawnDelay: delay + 1400 });
    escort.push({ enemyTypeId: 'boss', count: 1, spawnDelay: delay + 2500 });
    return { waveNumber, isBossWave: true, spawns: escort };
  }

  // Procedural: count grows slowly; delay tightens as waves increase.
  const laserCount     = Math.min(2 + Math.floor(waveNumber * 0.4), 9);
  const quartzCount    = Math.min(2 + Math.floor(waveNumber * 0.35), 8);
  const rubyCount      = waveNumber >= 5   ? Math.min(1 + Math.floor((waveNumber -  4) * 0.25), 6) : 0;
  const sunstoneCount  = waveNumber >= 10  ? Math.min(1 + Math.floor((waveNumber -  9) * 0.22), 5) : 0;
  const citrineCount   = waveNumber >= 15  ? Math.min(1 + Math.floor((waveNumber - 14) * 0.18), 5) : 0;
  const amberCount     = waveNumber >= 18  ? Math.min(1 + Math.floor((waveNumber - 17) * 0.15), 4) : 0;
  const emeraldCount   = waveNumber >= 21  ? Math.min(1 + Math.floor((waveNumber - 20) * 0.22), 5) : 0;
  const voidCount      = waveNumber >= 24  ? Math.min(1 + Math.floor((waveNumber - 23) * 0.12), 3) : 0;
  const sapphireCount  = waveNumber >= 27  ? Math.min(1 + Math.floor((waveNumber - 26) * 0.20), 5) : 0;
  const ioliteCount    = waveNumber >= 33  ? Math.min(1 + Math.floor((waveNumber - 32) * 0.14), 4) : 0;
  const amethystCount  = waveNumber >= 42  ? Math.min(1 + Math.floor((waveNumber - 41) * 0.11), 3) : 0;
  const diamondCount   = waveNumber >= 52  ? Math.min(1 + Math.floor((waveNumber - 51) * 0.08), 3) : 0;
  const nullstoneCount = waveNumber >= 63  ? Math.min(1 + Math.floor((waveNumber - 62) * 0.05), 2) : 0;
  const fracterylCount = waveNumber >= 74  ? Math.min(1 + Math.floor((waveNumber - 73) * 0.04), 2) : 0;
  const eigensteinCount= waveNumber >= 85  ? Math.min(1 + Math.floor((waveNumber - 84) * 0.03), 2) : 0;
  const delay = Math.max(130, 600 - waveNumber * 18);
  const spawns: WaveSpawn[] = [
    { enemyTypeId: 'laser',  count: laserCount,  spawnDelay: delay },
    { enemyTypeId: 'quartz', count: quartzCount, spawnDelay: delay },
  ];
  if (waveNumber >= 5)   spawns.push({ enemyTypeId: 'ruby',       count: rubyCount,       spawnDelay: delay + 300 });
  if (waveNumber >= 10)  spawns.push({ enemyTypeId: 'sunstone',   count: sunstoneCount,   spawnDelay: delay + 400 });
  if (waveNumber >= 15)  spawns.push({ enemyTypeId: 'citrine',    count: citrineCount,    spawnDelay: delay + 500 });
  if (waveNumber >= 18)  spawns.push({ enemyTypeId: 'amber',      count: amberCount,      spawnDelay: delay + 600 });
  if (waveNumber >= 21)  spawns.push({ enemyTypeId: 'emerald',    count: emeraldCount,    spawnDelay: delay + 350 });
  if (waveNumber >= 24)  spawns.push({ enemyTypeId: 'void',       count: voidCount,       spawnDelay: delay + 900 });
  if (waveNumber >= 27)  spawns.push({ enemyTypeId: 'sapphire',   count: sapphireCount,   spawnDelay: delay + 400 });
  if (waveNumber >= 33)  spawns.push({ enemyTypeId: 'iolite',     count: ioliteCount,     spawnDelay: delay + 800 });
  if (waveNumber >= 42)  spawns.push({ enemyTypeId: 'amethyst',   count: amethystCount,   spawnDelay: delay + 1000 });
  if (waveNumber >= 52)  spawns.push({ enemyTypeId: 'diamond',    count: diamondCount,    spawnDelay: delay + 1200 });
  if (waveNumber >= 63)  spawns.push({ enemyTypeId: 'nullstone',  count: nullstoneCount,  spawnDelay: delay + 1500 });
  if (waveNumber >= 74)  spawns.push({ enemyTypeId: 'fracteryl',  count: fracterylCount,  spawnDelay: delay + 1700 });
  if (waveNumber >= 85)  spawns.push({ enemyTypeId: 'eigenstein', count: eigensteinCount, spawnDelay: delay + 2000 });

  // Elite spawns: one per wave at the correct tier unlock threshold, then sparse thereafter.
  // Each elite spawns well after the main pack to give it a dramatic entrance.
  // Frequency: approximately one elite per 4–6 waves (seeded by wave number for consistency).
  const eliteSpawnRoll = (waveNumber * 7919 + 3571) % 17; // 0-16; threshold ≤ 3 = ~24% chance
  if (eliteSpawnRoll <= 3) {
    // Pick the highest tier available for this wave
    let eliteTier: string | null = null;
    if (waveNumber >= 63)       eliteTier = 'elite_nullstone';
    else if (waveNumber >= 52)  eliteTier = 'elite_diamond';
    else if (waveNumber >= 42)  eliteTier = 'elite_amethyst';
    else if (waveNumber >= 33)  eliteTier = 'elite_iolite';
    else if (waveNumber >= 15)  eliteTier = 'elite_citrine';
    else if (waveNumber >= 10)  eliteTier = 'elite_sunstone';
    else if (waveNumber >= 5)   eliteTier = 'elite_ruby';
    else if (waveNumber >= 2)   eliteTier = 'elite_quartz';
    if (eliteTier !== null) {
      spawns.push({ enemyTypeId: eliteTier, count: 1, spawnDelay: delay + 2500 });
    }
  }

  return { waveNumber, spawns };
}
