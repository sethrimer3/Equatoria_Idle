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

/** Hand-authored wave definitions. Boss waves every 5th wave. */
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
  // Wave 5: first boss wave — Quartz Sovereign appears after a small escort
  {
    waveNumber: 5,
    isBossWave: true,
    spawns: [
      { enemyTypeId: 'laser',  count: 2, spawnDelay: 600 },
      { enemyTypeId: 'quartz', count: 1, spawnDelay: 700 },
      { enemyTypeId: 'boss',   count: 1, spawnDelay: 2000 },
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
  // Wave 10: second boss wave — Ruby King
  {
    waveNumber: 10,
    isBossWave: true,
    spawns: [
      { enemyTypeId: 'laser',    count: 3, spawnDelay: 500 },
      { enemyTypeId: 'quartz',   count: 2, spawnDelay: 480 },
      { enemyTypeId: 'sapphire', count: 1, spawnDelay: 1000 },
      { enemyTypeId: 'boss',     count: 1, spawnDelay: 2500 },
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
  // Wave 15: third boss wave — Sunstone Herald
  {
    waveNumber: 15,
    isBossWave: true,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 450 },
      { enemyTypeId: 'quartz',   count: 2, spawnDelay: 420 },
      { enemyTypeId: 'emerald',  count: 2, spawnDelay: 900 },
      { enemyTypeId: 'amber',    count: 1, spawnDelay: 1100 },
      { enemyTypeId: 'boss',     count: 1, spawnDelay: 3000 },
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
  // Wave 20: fourth boss wave — Citrine Weaver
  {
    waveNumber: 20,
    isBossWave: true,
    spawns: [
      { enemyTypeId: 'laser',    count: 4, spawnDelay: 380 },
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 360 },
      { enemyTypeId: 'sapphire', count: 2, spawnDelay: 820 },
      { enemyTypeId: 'amber',    count: 2, spawnDelay: 950 },
      { enemyTypeId: 'void',     count: 1, spawnDelay: 1400 },
      { enemyTypeId: 'boss',     count: 1, spawnDelay: 3500 },
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
  // Wave 25: fifth boss wave — Iolite Colossus
  {
    waveNumber: 25,
    isBossWave: true,
    spawns: [
      { enemyTypeId: 'laser',    count: 5, spawnDelay: 300 },
      { enemyTypeId: 'quartz',   count: 3, spawnDelay: 280 },
      { enemyTypeId: 'emerald',  count: 3, spawnDelay: 740 },
      { enemyTypeId: 'amber',    count: 2, spawnDelay: 880 },
      { enemyTypeId: 'void',     count: 2, spawnDelay: 1250 },
      { enemyTypeId: 'ruby',     count: 2, spawnDelay: 860 },
      { enemyTypeId: 'boss',     count: 1, spawnDelay: 4000 },
    ],
  },
];

// ─── Procedural generator ─────────────────────────────────────────

/**
 * Returns the WaveDefinition for the given wave number.
 * Waves beyond WAVE_DEFINITIONS are generated procedurally, scaling
 * enemy count and tightening spawn delay as the wave number grows.
 * Every 5th wave is a boss wave with a smaller escort pack.
 */
export function getWaveDefinition(waveNumber: number): WaveDefinition {
  const predefined = WAVE_DEFINITIONS.find(w => w.waveNumber === waveNumber);
  if (predefined) return predefined;

  // Boss wave every 5 waves — boss with a small escort
  if (waveNumber % 5 === 0) {
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
  const sapphireCount  = Math.min(1 + Math.floor((waveNumber -  5) * 0.25), 5);
  const emeraldCount   = Math.min(1 + Math.floor((waveNumber -  8) * 0.22), 5);
  const amberCount     = Math.min(1 + Math.floor((waveNumber - 11) * 0.18), 4);
  const voidCount      = Math.min(1 + Math.floor((waveNumber - 14) * 0.12), 3);
  const quartzCount    = Math.min(2 + Math.floor(waveNumber * 0.35), 8);
  const rubyCount      = waveNumber >= 10  ? Math.min(1 + Math.floor((waveNumber -  9) * 0.25), 6) : 0;
  const sunstoneCount  = waveNumber >= 20  ? Math.min(1 + Math.floor((waveNumber - 19) * 0.2),  5) : 0;
  const citrineCount   = waveNumber >= 30  ? Math.min(1 + Math.floor((waveNumber - 29) * 0.15), 4) : 0;
  const ioliteCount    = waveNumber >= 40  ? Math.min(1 + Math.floor((waveNumber - 39) * 0.12), 3) : 0;
  const amethystCount  = waveNumber >= 50  ? Math.min(1 + Math.floor((waveNumber - 49) * 0.10), 3) : 0;
  const diamondCount   = waveNumber >= 60  ? Math.min(1 + Math.floor((waveNumber - 59) * 0.06), 2) : 0;
  const nullstoneCount = waveNumber >= 70  ? Math.min(1 + Math.floor((waveNumber - 69) * 0.04), 2) : 0;
  const fracterylCount = waveNumber >= 80  ? Math.min(1 + Math.floor((waveNumber - 79) * 0.03), 2) : 0;
  const eigensteinCount= waveNumber >= 90  ? Math.min(1 + Math.floor((waveNumber - 89) * 0.02), 2) : 0;
  const delay = Math.max(130, 600 - waveNumber * 18);
  const spawns: WaveSpawn[] = [
    { enemyTypeId: 'laser',    count: laserCount,    spawnDelay: delay },
    { enemyTypeId: 'quartz',   count: quartzCount,   spawnDelay: delay },
    { enemyTypeId: 'sapphire', count: sapphireCount, spawnDelay: delay + 400 },
    { enemyTypeId: 'emerald',  count: emeraldCount,  spawnDelay: delay + 350 },
  ];
  if (waveNumber >= 10)  spawns.push({ enemyTypeId: 'ruby',       count: rubyCount,       spawnDelay: delay + 300 });
  if (waveNumber >= 12)  spawns.push({ enemyTypeId: 'amber',      count: amberCount,      spawnDelay: delay + 600 });
  if (waveNumber >= 15)  spawns.push({ enemyTypeId: 'void',       count: voidCount,       spawnDelay: delay + 900 });
  if (waveNumber >= 20)  spawns.push({ enemyTypeId: 'sunstone',   count: sunstoneCount,   spawnDelay: delay + 500 });
  if (waveNumber >= 30)  spawns.push({ enemyTypeId: 'citrine',    count: citrineCount,    spawnDelay: delay + 600 });
  if (waveNumber >= 40)  spawns.push({ enemyTypeId: 'iolite',     count: ioliteCount,     spawnDelay: delay + 800 });
  if (waveNumber >= 50)  spawns.push({ enemyTypeId: 'amethyst',   count: amethystCount,   spawnDelay: delay + 1000 });
  if (waveNumber >= 60)  spawns.push({ enemyTypeId: 'diamond',    count: diamondCount,    spawnDelay: delay + 1200 });
  if (waveNumber >= 70)  spawns.push({ enemyTypeId: 'nullstone',  count: nullstoneCount,  spawnDelay: delay + 1500 });
  if (waveNumber >= 80)  spawns.push({ enemyTypeId: 'fracteryl',  count: fracterylCount,  spawnDelay: delay + 1700 });
  if (waveNumber >= 90)  spawns.push({ enemyTypeId: 'eigenstein', count: eigensteinCount, spawnDelay: delay + 2000 });
  return { waveNumber, spawns };
}
