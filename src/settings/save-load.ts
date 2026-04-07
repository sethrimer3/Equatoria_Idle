import type { GameState } from '../sim/game-state';
import type { TierId } from '../data/tiers';
import { createGameState } from '../sim/game-state';

// ─── Save format ────────────────────────────────────────────────

const SAVE_KEY = 'equatoria_save';
const SAVE_VERSION = 2;

interface SaveData {
  version: number;
  timestamp: number;
  equation: {
    segments: Array<{ tierId: string; level: number; isUnlocked: boolean }>;
    totalTapCount: number;
    isForgeUnlocked: boolean;
  };
  resources: {
    moteTotals: Record<string, number>;
    lifetimeMotes: Record<string, number>;
  };
  progression: {
    upgradeLevels: Record<string, number>;
    unlockedTierCount: number;
    autoTapLevel: number;
    globalMultiplier: number;
  };
  looms: {
    looms: Array<{ tierId: string; level: number; isUnlocked: boolean }>;
  };
  elapsedMs: number;
}

// ─── Serialize ──────────────────────────────────────────────────

export function serializeGameState(state: GameState): SaveData {
  const moteTotals: Record<string, number> = {};
  const lifetimeMotes: Record<string, number> = {};
  for (const [k, v] of state.resources.moteTotals) moteTotals[k] = v;
  for (const [k, v] of state.resources.lifetimeMotes) lifetimeMotes[k] = v;

  const upgradeLevels: Record<string, number> = {};
  for (const [k, v] of state.progression.upgradeLevels) upgradeLevels[k] = v;

  return {
    version: SAVE_VERSION,
    timestamp: Date.now(),
    equation: {
      segments: state.equation.segments.map(s => ({
        tierId: s.tierId,
        level: s.level,
        isUnlocked: s.isUnlocked,
      })),
      totalTapCount: state.equation.totalTapCount,
      isForgeUnlocked: state.equation.isForgeUnlocked,
    },
    resources: { moteTotals, lifetimeMotes },
    progression: {
      upgradeLevels,
      unlockedTierCount: state.progression.unlockedTierCount,
      autoTapLevel: state.progression.autoTapLevel,
      globalMultiplier: state.progression.globalMultiplier,
    },
    looms: {
      looms: state.looms.looms.map(l => ({
        tierId: l.tierId,
        level: l.level,
        isUnlocked: l.isUnlocked,
      })),
    },
    elapsedMs: state.elapsedMs,
  };
}

// ─── Deserialize ────────────────────────────────────────────────

export function deserializeGameState(data: SaveData): GameState {
  const state = createGameState();

  // Equation
  for (const saved of data.equation.segments) {
    const seg = state.equation.segments.find(s => s.tierId === saved.tierId);
    if (seg) {
      seg.level = saved.level;
      seg.isUnlocked = saved.isUnlocked;
    }
  }
  state.equation.totalTapCount = data.equation.totalTapCount;
  state.equation.isForgeUnlocked = data.equation.isForgeUnlocked ?? false;

  // Resources
  for (const [key, val] of Object.entries(data.resources.moteTotals)) {
    state.resources.moteTotals.set(key as TierId, val);
  }
  for (const [key, val] of Object.entries(data.resources.lifetimeMotes)) {
    state.resources.lifetimeMotes.set(key as TierId, val);
  }

  // Progression
  for (const [key, val] of Object.entries(data.progression.upgradeLevels)) {
    state.progression.upgradeLevels.set(key, val);
  }
  state.progression.unlockedTierCount = data.progression.unlockedTierCount;
  state.progression.autoTapLevel = data.progression.autoTapLevel;
  state.progression.globalMultiplier = data.progression.globalMultiplier;

  // Looms
  if (data.looms?.looms) {
    for (const saved of data.looms.looms) {
      const loom = state.looms.looms.find(l => l.tierId === saved.tierId);
      if (loom) {
        loom.level = saved.level;
        loom.isUnlocked = saved.isUnlocked;
      }
    }
  }

  state.elapsedMs = data.elapsedMs;

  return state;
}

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
    // Accept version 1 or 2 (v1 just won't have looms/forge data)
    if (data.version !== SAVE_VERSION && data.version !== 1) return null;
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
