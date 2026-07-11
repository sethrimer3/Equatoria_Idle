import { describe, expect, it } from 'vitest';
import { TIERS } from '../../../data/tiers';
import { createDefaultInteractionMatrix, createRandomInteractionMatrix, deserializeInteractionMatrix } from '../../../data/particles/interaction-matrix';
import { createGameState } from '../../game-state';
import { ALIVEN_ELIGIBLE_TIER_IDS, createAlivenState, randomizeInteractionMatrix, resetInteractionMatrix, setInteractionMatrixCell } from '../aliven-state';
import { serializeGameState } from '../../../settings/save-serialize';
import { deserializeGameState } from '../../../settings/save-deserialize';

describe('ALIVEN canonical matrix state', () => {
  it('includes every canonical tier, including Fracteryl and Eigenstein, as rows and columns', () => {
    const state = createAlivenState();
    expect([...state.alivenedTierIds]).toEqual(TIERS.map(tier => tier.id));
    expect(ALIVEN_ELIGIBLE_TIER_IDS).toContain('fracteryl');
    expect(ALIVEN_ELIGIBLE_TIER_IDS).toContain('eigenstein');
    expect(state.interactionMatrix).toHaveLength(TIERS.length);
    for (const row of state.interactionMatrix) expect(row).toHaveLength(TIERS.length);
  });

  it('defaults new profiles to locked with Manual mode off', () => {
    const state = createAlivenState();
    expect(state.matrixLocked).toBe(true);
    expect(state.manualModeEnabled).toBe(false);
  });

  it('reset restores defaults and all canonical motes', () => {
    const state = createAlivenState();
    state.alivenedTierIds.clear();
    setInteractionMatrixCell(state, 11, 12, -0.75);
    resetInteractionMatrix(state);
    expect(state.interactionMatrix).toEqual(createDefaultInteractionMatrix());
    expect([...state.alivenedTierIds]).toEqual(ALIVEN_ELIGIBLE_TIER_IDS);
  });

  it('randomizes every directional cell on valid 0.05 increments', () => {
    const state = createAlivenState();
    randomizeInteractionMatrix(state, () => 0.999);
    for (const row of state.interactionMatrix) for (const value of row) {
      expect(value).toBeGreaterThanOrEqual(-0.5);
      expect(value).toBeLessThanOrEqual(0.5);
      expect(Math.round(value * 20)).toBe(value * 20);
    }
    expect(state.interactionMatrix[11][12]).toBe(0.5);
    expect(state.interactionMatrix[12][11]).toBe(0.5);
  });

  it('keeps directional cells independent', () => {
    let index = 0;
    const matrix = createRandomInteractionMatrix(0.5, () => index++ === 1 ? 1 : 0);
    expect(matrix[0][1]).not.toBe(matrix[1][0]);
  });
});

describe('ALIVEN save migration', () => {
  it('round-trips lock, Manual, and customized matrix state', () => {
    const game = createGameState();
    game.aliven.matrixLocked = false;
    game.aliven.manualModeEnabled = true;
    game.aliven.interactionMatrix[11][12] = -0.35;
    const restored = deserializeGameState(serializeGameState(game));
    expect(restored.aliven.matrixLocked).toBe(false);
    expect(restored.aliven.manualModeEnabled).toBe(true);
    expect(restored.aliven.interactionMatrix[11][12]).toBe(-0.35);
  });

  it('migrates an 11x11 legacy matrix without losing custom values', () => {
    const game = createGameState();
    const save = serializeGameState(game);
    const legacy = createDefaultInteractionMatrix().slice(0, 11).flatMap(row => row.slice(0, 11));
    legacy[1] = 0.85;
    save.aliven = { alivenedTierIds: ['sand'], interactionMatrix: legacy };
    const restored = deserializeGameState(save);
    expect(restored.aliven.interactionMatrix[0][1]).toBe(0.85);
    expect(restored.aliven.interactionMatrix[11][12]).toBe(createDefaultInteractionMatrix()[11][12]);
    expect([...restored.aliven.alivenedTierIds]).toEqual(ALIVEN_ELIGIBLE_TIER_IDS);
    expect(restored.aliven.matrixLocked).toBe(true);
    expect(restored.aliven.manualModeEnabled).toBe(false);
  });

  it('falls back safely for malformed matrix data', () => {
    expect(deserializeInteractionMatrix([Number.NaN])).toEqual(createDefaultInteractionMatrix());
    expect(deserializeInteractionMatrix([2, 0, 0, 0])[0][0]).toBe(createDefaultInteractionMatrix()[0][0]);
  });
});
