import { afterEach, describe, expect, it, vi } from 'vitest';
import { getEnemyBarkKey, getEnemyBarkLine } from '../enemy-barks';
import { classifyEnemyStatusAffinity } from '../../render/rpg/rpg-enemy-barks';

afterEach(() => vi.restoreAllMocks());

describe('enemy bark resolution', () => {
  it('resolves starter and elite enemy keys', () => {
    expect(getEnemyBarkKey({ kind: 'laser' })).toBe('laser');
    expect(getEnemyBarkKey({ kind: 'sapphire' })).toBe('sapphire');
    expect(getEnemyBarkKey({ kind: 'elite', tier: 'sunstone' })).toBe('elite_sunstone');
  });

  it('uses custom starter and elite dialogue', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(getEnemyBarkLine({ kind: 'laser' }, 'TOOK_MAJOR_DAMAGE')).toBe('Beam interrupted!');
    expect(getEnemyBarkLine({ kind: 'elite', tier: 'nullstone' }, 'KILLED_PLAYER')).toBe('All paths end here.');
  });

  it('falls back safely for unknown enemies', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    expect(getEnemyBarkLine({ kind: 'unknown' }, 'TOOK_MAJOR_DAMAGE')).toBe('That hurt!');
  });

  it('classifies status affinity conservatively', () => {
    expect(classifyEnemyStatusAffinity(
      { kind: 'ruby', x: 0, y: 0, hp: 1, maxHp: 1 },
      'burning',
    )).toBe('neutral');
  });
});
