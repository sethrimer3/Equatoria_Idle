/**
 * enemy-catalog-coverage.test.ts — Validates that every enemy type that can
 * appear during gameplay has a corresponding bestiary catalog entry.
 *
 * Sources checked:
 *  - Hand-authored WAVE_DEFINITIONS (early waves 1–25)
 *  - Procedural generator standard enemy IDs (STANDARD_WAVE_ENEMY_IDS)
 *  - Procedural generator creature IDs (PROCEDURAL_WAVE_ENEMY_IDS)
 *  - Elite variants (ELITE_WAVE_ENEMY_IDS)
 *  - Aliven particle group variants (ALIVEN_VARIANTS)
 *
 * Intentional exclusions (not expected in ENEMY_CATALOG):
 *  - 'boss' — boss entries live in BOSS_DESCRIPTIONS, not ENEMY_CATALOG
 */

import { describe, it, expect } from 'vitest';
import { WAVE_DEFINITIONS, PROCEDURAL_WAVE_ENEMY_IDS, STANDARD_WAVE_ENEMY_IDS, ELITE_WAVE_ENEMY_IDS } from '../../../data/rpg/wave-definitions';
import { ENEMY_CATALOG } from '../../../ui/panels/rpg-enemies-catalog';
import { ALIVEN_VARIANTS } from '../rpg-aliven-constants';

/** Enemy type IDs that are intentionally absent from ENEMY_CATALOG. */
const KNOWN_EXCLUSIONS = new Set<string>([
  'boss', // Boss entries live in BOSS_DESCRIPTIONS
]);

describe('Enemy catalog coverage', () => {
  const catalogIds = new Set(ENEMY_CATALOG.map(e => e.id));

  it('ENEMY_CATALOG has no duplicate IDs', () => {
    const seen = new Set<string>();
    const duplicates: string[] = [];
    for (const entry of ENEMY_CATALOG) {
      if (seen.has(entry.id)) duplicates.push(entry.id);
      seen.add(entry.id);
    }
    expect(duplicates).toEqual([]);
  });

  it('all enemy types in hand-authored WAVE_DEFINITIONS have catalog entries', () => {
    const missing: string[] = [];
    for (const wave of WAVE_DEFINITIONS) {
      for (const spawn of wave.spawns) {
        const id = spawn.enemyTypeId;
        if (!KNOWN_EXCLUSIONS.has(id) && !catalogIds.has(id)) {
          missing.push(`wave ${wave.waveNumber}: '${id}'`);
        }
      }
    }
    expect(missing).toEqual([]);
  });

  it('all standard wave enemy IDs have catalog entries', () => {
    const missing = STANDARD_WAVE_ENEMY_IDS
      .filter(id => !KNOWN_EXCLUSIONS.has(id) && !catalogIds.has(id));
    expect(missing).toEqual([]);
  });

  it('all procedural wave enemy IDs have catalog entries', () => {
    const missing = PROCEDURAL_WAVE_ENEMY_IDS
      .filter(id => !KNOWN_EXCLUSIONS.has(id) && !catalogIds.has(id));
    expect(missing).toEqual([]);
  });

  it('all elite wave enemy IDs have catalog entries', () => {
    const missing = ELITE_WAVE_ENEMY_IDS
      .filter(id => !KNOWN_EXCLUSIONS.has(id) && !catalogIds.has(id));
    expect(missing).toEqual([]);
  });

  it('all aliven variant IDs have catalog entries', () => {
    const missing = (ALIVEN_VARIANTS as readonly string[])
      .filter(id => !KNOWN_EXCLUSIONS.has(id) && !catalogIds.has(id));
    expect(missing).toEqual([]);
  });
});
