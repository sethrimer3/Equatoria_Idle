/**
 * zone-enemy-isolation.test.ts — Verifies that each zone's wave generator
 * only produces enemy type IDs that belong to that zone, and that
 * getSpawnableEnemyTypesForZone returns the correct pool.
 */

import { describe, it, expect } from 'vitest';
import {
  getZoneWaveDefinition,
  getSpawnableEnemyTypesForZone,
} from '../wave-definitions';
import { RPG_ZONE_DEFINITIONS } from '../rpg-zone-definitions';
import type { RpgZoneId } from '../rpg-zone-definitions';

// ── Verdure enemy IDs (per rpg-zone-definitions.ts) ──────────────────────────

const VERDURE_IDS = new Set(
  RPG_ZONE_DEFINITIONS.find(z => z.id === 'verdure')!.enemyIds,
);

// ── Caustics enemy IDs ────────────────────────────────────────────────────────

const CAUSTICS_IDS = new Set(
  RPG_ZONE_DEFINITIONS.find(z => z.id === 'caustics')!.enemyIds,
);

// ── Impetus enemy IDs ─────────────────────────────────────────────────────────

const IMPETUS_IDS = new Set(
  RPG_ZONE_DEFINITIONS.find(z => z.id === 'impetus')!.enemyIds,
);

// ── Helpers ───────────────────────────────────────────────────────────────────

function collectSpawnIds(zoneId: RpgZoneId, waveNumbers: number[]): Set<string> {
  const ids = new Set<string>();
  for (const wn of waveNumbers) {
    const def = getZoneWaveDefinition(wn, zoneId);
    for (const s of def.spawns) ids.add(s.enemyTypeId);
  }
  return ids;
}

// Representative sample of Euhedral waves covering the procedural generator.
const EUHEDRAL_SAMPLE_WAVES = [1, 5, 10, 15, 20, 25, 30, 40, 50, 60, 70, 80, 90, 99];

describe('getSpawnableEnemyTypesForZone', () => {
  it('Euhedral pool contains zero Verdure enemies', () => {
    const pool = new Set(getSpawnableEnemyTypesForZone('euhedral'));
    const leaked = [...VERDURE_IDS].filter(id => pool.has(id));
    expect(leaked).toEqual([]);
  });

  it('Euhedral pool contains zero Caustics enemies', () => {
    const pool = new Set(getSpawnableEnemyTypesForZone('euhedral'));
    const leaked = [...CAUSTICS_IDS].filter(id => pool.has(id));
    expect(leaked).toEqual([]);
  });

  it('Euhedral pool contains zero Impetus proc enemies', () => {
    const pool = new Set(getSpawnableEnemyTypesForZone('euhedral'));
    // proc_dustwisp / proc_moteswarm / proc_shadowhand are Impetus-only
    const impetusProc = [...IMPETUS_IDS].filter(id => id.startsWith('proc_'));
    const leaked = impetusProc.filter(id => pool.has(id));
    expect(leaked).toEqual([]);
  });

  it('Verdure pool contains zero Euhedral crystal enemies', () => {
    const pool = new Set(getSpawnableEnemyTypesForZone('verdure'));
    const euhedralPool = new Set(getSpawnableEnemyTypesForZone('euhedral'));
    // Crystal enemies (non-proc, non-aliven) should not appear in Verdure
    const leaked = [...euhedralPool]
      .filter(id => id !== 'boss' && !id.startsWith('elite_'))
      .filter(id => pool.has(id));
    expect(leaked).toEqual([]);
  });
});

describe('Euhedral wave generator zone isolation', () => {
  it('never spawns Verdure enemies', () => {
    const ids = collectSpawnIds('euhedral', EUHEDRAL_SAMPLE_WAVES);
    const leaked = [...ids].filter(id => VERDURE_IDS.has(id));
    expect(leaked).toEqual([]);
  });

  it('never spawns Caustics enemies', () => {
    const ids = collectSpawnIds('euhedral', EUHEDRAL_SAMPLE_WAVES);
    const leaked = [...ids].filter(id => CAUSTICS_IDS.has(id));
    expect(leaked).toEqual([]);
  });

  it('never spawns Impetus proc enemies', () => {
    const ids = collectSpawnIds('euhedral', EUHEDRAL_SAMPLE_WAVES);
    const impetusProc = [...IMPETUS_IDS].filter(id => id.startsWith('proc_'));
    const leaked = [...ids].filter(id => impetusProc.includes(id));
    expect(leaked).toEqual([]);
  });
});

describe('Verdure wave generator zone isolation', () => {
  const VERDURE_SAMPLE_WAVES = [1, 5, 10, 11, 15, 20, 25, 30];

  it('never spawns Euhedral crystal enemies', () => {
    const ids = collectSpawnIds('verdure', VERDURE_SAMPLE_WAVES);
    // Standard crystal enemies that only belong to Euhedral
    const crystalIds = ['laser', 'quartz', 'sapphire', 'emerald', 'ruby', 'amber',
      'void', 'sunstone', 'citrine', 'iolite', 'amethyst', 'diamond',
      'nullstone', 'fracteryl', 'eigenstein', 'stardust'];
    const leaked = [...ids].filter(id => crystalIds.includes(id));
    expect(leaked).toEqual([]);
  });

  it('never spawns Caustics fish enemies', () => {
    const ids = collectSpawnIds('verdure', VERDURE_SAMPLE_WAVES);
    const leaked = [...ids].filter(id => CAUSTICS_IDS.has(id));
    expect(leaked).toEqual([]);
  });
});

describe('Caustics wave generator zone isolation', () => {
  const CAUSTICS_SAMPLE_WAVES = [1, 5, 10, 20, 30];

  it('never spawns Verdure enemies', () => {
    const ids = collectSpawnIds('caustics', CAUSTICS_SAMPLE_WAVES);
    const leaked = [...ids].filter(id => VERDURE_IDS.has(id));
    expect(leaked).toEqual([]);
  });
});
