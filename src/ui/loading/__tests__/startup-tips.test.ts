import { describe, expect, it } from 'vitest';
import { selectStartupTip, type StartupTip, type StartupTipDeckState } from '../startup-tips';

const tips: StartupTip[] = [
  { id: 'a', text: 'A' }, { id: 'b', text: 'B' }, { id: 'c', text: 'C' },
];
const rng = () => 0;

describe('persistent startup tip deck', () => {
  it('shows every tip before repeating and avoids a cycle-boundary repeat', () => {
    const state: StartupTipDeckState = { order: [], cursor: 0 };
    const firstCycle = [0, 1, 2].map(() => selectStartupTip(state, tips, rng)!.id);
    expect(new Set(firstCycle)).toEqual(new Set(['a', 'b', 'c']));
    expect(selectStartupTip(state, tips, rng)!.id).not.toBe(firstCycle[2]);
  });

  it('survives reload without consuming twice unless selection is invoked again', () => {
    const state: StartupTipDeckState = { order: [], cursor: 0 };
    selectStartupTip(state, tips, rng);
    const restored = JSON.parse(JSON.stringify(state)) as StartupTipDeckState;
    expect(restored.cursor).toBe(1);
    selectStartupTip(restored, tips, rng);
    expect(restored.cursor).toBe(1); // reconciled remainder becomes the new deck origin
    expect(restored.lastShownId).not.toBe(state.lastShownId);
  });

  it('reconciles added, removed, corrupt, and obsolete IDs', () => {
    const state: StartupTipDeckState = { order: ['gone', 'a'], cursor: 0 };
    const shown: string[] = [];
    for (let i = 0; i < 3; i++) shown.push(selectStartupTip(state, tips, rng)!.id);
    expect(new Set(shown)).toEqual(new Set(['a', 'b', 'c']));
  });

  it('keeps separate profiles independent and an unselected profile unconsumed', () => {
    const one: StartupTipDeckState = { order: [], cursor: 0 };
    const two: StartupTipDeckState = { order: [], cursor: 0 };
    selectStartupTip(one, tips, rng);
    expect(two).toEqual({ order: [], cursor: 0 });
  });

  it('handles an empty catalog', () => {
    expect(selectStartupTip({ order: ['bad'], cursor: 99 }, [], rng)).toBeNull();
  });
});
