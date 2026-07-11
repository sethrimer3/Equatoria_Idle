import { describe, expect, it } from 'vitest';
import { createGameState } from '../../sim/game-state';
import { serializeGameState } from '../save-serialize';
import { deserializeGameState } from '../save-deserialize';
import { createDefaultSettings } from '../settings-state';

describe('startup tip persistence', () => {
  it('round-trips the per-profile deck', () => {
    const state = createGameState();
    state.startupTips = { order: ['a', 'b'], cursor: 1, lastShownId: 'a' };
    expect(deserializeGameState(serializeGameState(state)).startupTips).toEqual(state.startupTips);
  });

  it('defaults legacy profiles and new settings safely', () => {
    const save = serializeGameState(createGameState());
    delete save.startupTips;
    expect(deserializeGameState(save).startupTips).toEqual({ order: [], cursor: 0 });
    expect(createDefaultSettings().showTipOnStartup).toBe(true);
  });
});
