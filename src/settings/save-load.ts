/**
 * save-load.ts — localStorage helpers for game save/load.
 *
 * Thin orchestration layer; all heavy lifting is in:
 *   - save-types.ts      (SaveData interface + version constants)
 *   - save-serialize.ts  (serializeGameState)
 *   - save-deserialize.ts (deserializeGameState)
 */

import type { GameState } from '../sim/game-state';
import { type SaveData, SAVE_KEY, SAVE_VERSION } from './save-types';
import { serializeGameState } from './save-serialize';
import { deserializeGameState } from './save-deserialize';

export { serializeGameState } from './save-serialize';
export { deserializeGameState } from './save-deserialize';

// ─── localStorage helpers ───────────────────────────────────────

export function saveGame(state: GameState): boolean {
  try {
    const data = serializeGameState(state);
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function loadGame(): GameState | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    // Accept all versions up to the current SAVE_VERSION (older saves lack some fields; defaults will apply)
    if (typeof data.version !== 'number' || data.version < 1 || data.version > SAVE_VERSION) return null;
    return deserializeGameState(data);
  } catch {
    return null;
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}
