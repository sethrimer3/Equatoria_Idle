import type { GameState } from '../sim/game-state';
import type { TierId } from '../data/tiers';
import type { SizeIndex } from '../data/particles/size-tiers';
import { createGameState } from '../sim/game-state';
import { recomputeBonuses } from '../sim/achievements';
import { ACHIEVEMENT_BY_ID } from '../data/achievements';
import { totalToSizeCounts, sizeCountsToTotal } from '../sim/resources';
import {
  serializeInteractionMatrix,
  deserializeInteractionMatrix,
} from '../data/particles/interaction-matrix';

// ─── Save format ────────────────────────────────────────────────

const SAVE_KEY = 'equatoria_save';
const SAVE_VERSION = 10;

interface SaveData {
  version: number;
  timestamp: number;
  equation: {
    segments: Array<{ tierId: string; level: number; isUnlocked: boolean }>;
    totalTapCount: number;
    isForgeUnlocked: boolean;
  };
  resources: {
    /**
     * v7+: per-size mote counts, encoded as base-MERGE_THRESHOLD.
     * Key: tierId; value: { sizeIndex: count }.
     */
    moteSizeCounts?: Record<string, Record<string, number>>;
    /**
     * v1–6 backward compat: flat float totals.
     * Absent in v7+ saves.
     */
    moteTotals?: Record<string, number>;
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
    specialLoomPurchased?: string[];
  };
  achievements: {
    unlockedIds: string[];
    claimedIds: string[];
  };
  aliven: {
    alivenedTierIds: string[];
    /** v8+: flat 169-element array for the 13×13 interaction matrix. Absent in older saves. */
    interactionMatrix?: number[];
  };
  /** v10+: RPG persistent state. Absent in older saves. */
  rpg?: {
    highestWaveReached: number;
    purchasedWeaponIds: string[];
    equippedWeaponId: string | null;
  };
  elapsedMs: number;
}

// ─── Serialize ──────────────────────────────────────────────────

export function serializeGameState(state: GameState): SaveData {
  // Encode per-tier totals as base-MERGE_THRESHOLD size counts.
  const moteSizeCounts: Record<string, Record<string, number>> = {};
  for (const [tierId, total] of state.resources.moteTotals) {
    const counts = totalToSizeCounts(total);
    if (counts.size > 0) {
      const sizeObj: Record<string, number> = {};
      for (const [s, c] of counts) sizeObj[String(s)] = c;
      moteSizeCounts[tierId] = sizeObj;
    }
  }

  const lifetimeMotes: Record<string, number> = {};
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
    resources: { moteSizeCounts, lifetimeMotes },
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
      specialLoomPurchased: Array.from(state.looms.specialPurchased),
    },
    achievements: {
      unlockedIds: Array.from(state.achievements.unlockedIds),
      claimedIds: Array.from(state.achievements.claimedIds),
    },
    aliven: {
      alivenedTierIds: Array.from(state.aliven.alivenedTierIds),
      interactionMatrix: serializeInteractionMatrix(state.aliven.interactionMatrix),
    },
    rpg: {
      highestWaveReached: state.rpg.highestWaveReached,
      purchasedWeaponIds: Array.from(state.rpg.purchasedWeaponIds),
      equippedWeaponId: state.rpg.equippedWeaponId,
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

  // Resources — v7+ uses moteSizeCounts; v1–6 used flat moteTotals
  if (data.resources.moteSizeCounts) {
    for (const [tierId, sizeObj] of Object.entries(data.resources.moteSizeCounts)) {
      const counts = new Map<SizeIndex, number>();
      for (const [s, c] of Object.entries(sizeObj)) {
        counts.set(parseInt(s, 10), c);
      }
      state.resources.moteTotals.set(tierId as TierId, sizeCountsToTotal(counts));
    }
  } else if (data.resources.moteTotals) {
    for (const [key, val] of Object.entries(data.resources.moteTotals)) {
      state.resources.moteTotals.set(key as TierId, val);
    }
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
    if (data.looms.specialLoomPurchased) {
      for (const tierId of data.looms.specialLoomPurchased) {
        state.looms.specialPurchased.add(tierId as import('../data/tiers').TierId);
      }
    }
  }

  // Achievements
  if (data.achievements?.unlockedIds) {
    for (const id of data.achievements.unlockedIds) {
      state.achievements.unlockedIds.add(id);
    }
    // claimedIds — v5+ save. Older saves had no click-to-claim; treat all
    // previously-unlocked achievements as claimed for backward compatibility.
    const savedClaimedIds: string[] | undefined = (data.achievements as { claimedIds?: string[] }).claimedIds;
    if (savedClaimedIds && savedClaimedIds.length > 0) {
      for (const id of savedClaimedIds) {
        state.achievements.claimedIds.add(id);
      }
    } else {
      // Migrate older saves: auto-claim all unlocked non-secret achievements.
      // Secret achievements must always be manually claimed, even on migration.
      for (const id of state.achievements.unlockedIds) {
        const def = ACHIEVEMENT_BY_ID.get(id);
        if (!def?.isSecret) {
          state.achievements.claimedIds.add(id);
        }
      }
    }
    recomputeBonuses(state.achievements);
  }

  state.elapsedMs = data.elapsedMs;

  // Aliven state (v6+; older saves have no alivened tiers)
  if (data.aliven?.alivenedTierIds) {
    for (const id of data.aliven.alivenedTierIds) {
      state.aliven.alivenedTierIds.add(id as TierId);
    }
  }

  // Interaction matrix (v8+; older saves use the default matrix)
  if (data.aliven?.interactionMatrix) {
    const restored = deserializeInteractionMatrix(data.aliven.interactionMatrix);
    for (let i = 0; i < restored.length; i++) {
      for (let j = 0; j < restored[i].length; j++) {
        state.aliven.interactionMatrix[i][j] = restored[i][j];
      }
    }
  }

  // RPG state (v10+; older saves default to no progress)
  if (data.rpg) {
    state.rpg.highestWaveReached = data.rpg.highestWaveReached ?? 0;
    if (data.rpg.purchasedWeaponIds) {
      for (const id of data.rpg.purchasedWeaponIds) {
        state.rpg.purchasedWeaponIds.add(id);
      }
    }
    state.rpg.equippedWeaponId = data.rpg.equippedWeaponId ?? null;
  }

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
    // Accept versions 1–10 (older saves lack some fields; defaults will apply)
    if (![1, 2, 3, 4, 5, 6, 7, 8, 9, 10].includes(data.version)) return null;
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
