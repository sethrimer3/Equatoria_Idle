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

// Representative sample of Euhedral waves covering both hand-authored (1-25)
// and procedural (26+) generation, including elite-aliven-wave multiples of 10.
const EUHEDRAL_SAMPLE_WAVES = [
  ...Array.from({ length: 25 }, (_, i) => i + 1), // 1-25 hand-authored
  26, 30, 40, 50, 65, 80, 99,
];

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

  it('Euhedral pool contains zero Impetus enemies (proc and Aliven alike)', () => {
    const pool = new Set(getSpawnableEnemyTypesForZone('euhedral'));
    const leaked = [...IMPETUS_IDS].filter(id => pool.has(id));
    expect(leaked).toEqual([]);
  });

  it('Euhedral pool contains zero Aliven IDs regardless of Impetus zone definition', () => {
    const pool = new Set(getSpawnableEnemyTypesForZone('euhedral'));
    const leaked = [...pool].filter(id => id.startsWith('aliven_'));
    expect(leaked).toEqual([]);
  });

  it('Euhedral pool is strictly crystal enemies + elites + stardust + boss', () => {
    const pool = new Set(getSpawnableEnemyTypesForZone('euhedral'));
    const disallowed = [...pool].filter(
      id => id !== 'stardust' && id !== 'boss' && !id.startsWith('elite_') &&
        !['laser', 'quartz', 'sapphire', 'emerald', 'ruby', 'amber', 'void',
          'sunstone', 'citrine', 'iolite', 'amethyst', 'diamond', 'nullstone',
          'fracteryl', 'eigenstein'].includes(id),
    );
    expect(disallowed).toEqual([]);
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

  it('never spawns any Impetus enemy (proc and Aliven alike)', () => {
    const ids = collectSpawnIds('euhedral', EUHEDRAL_SAMPLE_WAVES);
    const leaked = [...ids].filter(id => IMPETUS_IDS.has(id));
    expect(leaked).toEqual([]);
  });

  it('never spawns Aliven enemies in hand-authored waves (1-25)', () => {
    const ids = collectSpawnIds('euhedral', Array.from({ length: 25 }, (_, i) => i + 1));
    const leaked = [...ids].filter(id => id.startsWith('aliven_'));
    expect(leaked).toEqual([]);
  });

  it('never spawns Aliven enemies in procedural waves (26+)', () => {
    const ids = collectSpawnIds('euhedral', [26, 30, 40, 50, 65, 80, 99]);
    const leaked = [...ids].filter(id => id.startsWith('aliven_'));
    expect(leaked).toEqual([]);
  });
});

describe('Impetus wave generator still spawns Aliven enemies', () => {
  it('spawns normal and elite Aliven enemies correctly', () => {
    const ids = collectSpawnIds('impetus', [2, 4, 5, 8, 10, 20, 30, 50]);
    const alivenIds = [...ids].filter(id => id.startsWith('aliven_'));
    expect(alivenIds.length).toBeGreaterThan(0);
    const eliteAlivenIds = alivenIds.filter(id => id.startsWith('aliven_elite_'));
    expect(eliteAlivenIds.length).toBeGreaterThan(0);
    // Every Aliven ID produced must be a recognized Impetus enemy or its elite form.
    for (const id of alivenIds) {
      const baseId = id.replace('aliven_elite_', 'aliven_');
      expect(IMPETUS_IDS.has(baseId)).toBe(true);
    }
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
