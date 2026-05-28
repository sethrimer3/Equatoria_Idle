import { describe, it, expect } from 'vitest';
import { getZoneWaveDefinition } from '../../../data/rpg/wave-definitions';

describe('Verdure elite polyomino waves', () => {
  it('uses only polyomino variants on wave multiples of 10', () => {
    const wave = getZoneWaveDefinition(20, 'verdure');
    const ids = wave.spawns.map(s => s.enemyTypeId);
    expect(ids).toEqual([
      'verdure_polyomino',
      'verdure_polyomino_fissile',
      'verdure_polyomino_refractor',
    ]);
  });

  it('keeps normal Verdure procedural pool on non-elite waves', () => {
    const wave = getZoneWaveDefinition(11, 'verdure');
    const ids = wave.spawns.map(s => s.enemyTypeId);
    expect(ids.some(id => id.startsWith('proc_'))).toBe(true);
    expect(ids.includes('verdure_polyomino')).toBe(false);
  });
});
