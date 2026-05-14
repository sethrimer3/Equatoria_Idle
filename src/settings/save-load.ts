import type { GameState, PendingMoteEntry } from '../sim/game-state';
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
const SAVE_VERSION = 22;

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
    /** v10–v13 compat: single equipped weapon id. Absent in v14+. */
    equippedWeaponId?: string | null;
    /** v14+: set of all equipped weapon ids. Absent in older saves. */
    equippedWeaponIds?: string[];
    /** v20+: slot-index → weapon-id mapping for boxes 7–11. Absent in older saves. */
    equippedWeaponSlots?: Array<[number, string]>;
    /** v11+: accumulated XP. Absent in older saves (defaults to 0). */
    xp?: number;
    /** v12+: per-weapon tier levels. Absent in older saves. */
    weaponTiersByWeaponId?: Record<string, number>;
    /** v12+: RPG upgrade levels. Absent in older saves. */
    rpgUpgradeLevels?: Record<string, number>;
    /** v15+: respawn checkpoint wave. Absent in older saves (defaults to 0). */
    respawnWave?: number;
    /** v16+: per-boss highest speed completion (bossId→speedPct). Absent in older saves. */
    bossCompletions?: Record<string, number>;
    /** v16+: boss fight speed setting (10–100). Absent in older saves (defaults to 100). */
    bossSpeedPct?: number;
    /** v17–v18 compat: single stat XP is wired to. Absent in v19+. */
    xpAllocatedStat?: 'atk' | 'def' | 'luck' | 'hp' | null;
    /** v19+: all stats XP is wired to (up to 3). Absent in older saves. */
    xpAllocatedStats?: string[];
    /** v17+: XP accumulated while wired to ATK. Absent in older saves (defaults to 0). */
    xpAllocatedToAtk?: number;
    /** v17+: XP accumulated while wired to DEF. Absent in older saves (defaults to 0). */
    xpAllocatedToDef?: number;
    /** v18+: XP accumulated while wired to LUCK. Absent in older saves (defaults to 0). */
    xpAllocatedToLuck?: number;
    /** v18+: XP accumulated while wired to HP. Absent in older saves (defaults to 0). */
    xpAllocatedToHp?: number;
    /** v21+: per-type kill counters. Absent in older saves. */
    lifetimeKillsByType?: Record<string, number>;
    /** v21+: elite kill count. Absent in older saves. */
    lifetimeEliteKills?: number;
    /** v21+: aliven group kill count. Absent in older saves. */
    lifetimeAlivenKills?: number;
    /** v21+: lucky motes collected lifetime. Absent in older saves. */
    lifetimeLuckyMotesCollected?: number;
    /** v21+: late-tier enemy kills. Absent in older saves. */
    lifetimeLateEnemyKills?: number;
    /** v21+: total survival time in ms. Absent in older saves. */
    totalRpgSurvivalMs?: number;
    /** v21+: total waves completed lifetime. Absent in older saves. */
    totalWavesCompleted?: number;
    /** v21+: best damage-free wave streak ever. Absent in older saves. */
    bestDamageFreeWaveStreak?: number;
    /** v21+: boss defeated with 1 weapon. Absent in older saves. */
    bossDefeated1Weapon?: boolean;
    /** v22+: secret achievement flag IDs. Absent in older saves. */
    secretAchievementFlags?: string[];
  };
  elapsedMs: number;
  /** v13+: pending idle-mote drip queue. Absent in older saves (defaults to []). */
  pendingIdleMotes?: Array<{ tierId: string; sizeIndex: number; count: number }>;
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
      equippedWeaponIds: Array.from(state.rpg.equippedWeaponIds),
      equippedWeaponSlots: Array.from(state.rpg.equippedWeaponSlots.entries()),
      xp: state.rpg.xp,
      weaponTiersByWeaponId: Object.fromEntries(state.rpg.weaponTiersByWeaponId),
      rpgUpgradeLevels: Object.fromEntries(state.rpg.rpgUpgradeLevels),
      respawnWave: state.rpg.respawnWave,
      bossCompletions: Object.fromEntries(state.rpg.bossCompletions),
      bossSpeedPct: state.rpg.bossSpeedPct,
      xpAllocatedStats: Array.from(state.rpg.xpAllocatedStats),
      xpAllocatedToAtk: state.rpg.xpAllocatedToAtk,
      xpAllocatedToDef: state.rpg.xpAllocatedToDef,
      xpAllocatedToLuck: state.rpg.xpAllocatedToLuck,
      xpAllocatedToHp: state.rpg.xpAllocatedToHp,
      lifetimeKillsByType: Object.fromEntries(state.rpg.lifetimeKillsByType),
      lifetimeEliteKills: state.rpg.lifetimeEliteKills,
      lifetimeAlivenKills: state.rpg.lifetimeAlivenKills,
      lifetimeLuckyMotesCollected: state.rpg.lifetimeLuckyMotesCollected,
      lifetimeLateEnemyKills: state.rpg.lifetimeLateEnemyKills,
      totalRpgSurvivalMs: state.rpg.totalRpgSurvivalMs,
      totalWavesCompleted: state.rpg.totalWavesCompleted,
      bestDamageFreeWaveStreak: state.rpg.bestDamageFreeWaveStreak,
      bossDefeated1Weapon: state.rpg.bossDefeated1Weapon,
      secretAchievementFlags: Array.from(state.rpg.secretAchievementFlags),
    },
    elapsedMs: state.elapsedMs,
    pendingIdleMotes: state.pendingIdleMotes.map(e => ({
      tierId: e.tierId,
      sizeIndex: e.sizeIndex,
      count: e.count,
    })),
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
    // v14+: equippedWeaponIds set; v10–v13 compat: migrate from equippedWeaponId
    if (data.rpg.equippedWeaponIds) {
      for (const id of data.rpg.equippedWeaponIds) {
        state.rpg.equippedWeaponIds.add(id);
      }
    } else if (data.rpg.equippedWeaponId) {
      state.rpg.equippedWeaponIds.add(data.rpg.equippedWeaponId);
    }
    // v20+: explicit slot assignment; older saves derive slots from equippedWeaponIds order
    if (data.rpg.equippedWeaponSlots && data.rpg.equippedWeaponSlots.length > 0) {
      for (const [slot, wid] of data.rpg.equippedWeaponSlots) {
        state.rpg.equippedWeaponSlots.set(slot, wid);
      }
    } else {
      // Migrate pre-v20 saves: assign equipped weapons to slots 0, 1, 2… in order
      let migrateSlot = 0;
      for (const id of state.rpg.equippedWeaponIds) {
        state.rpg.equippedWeaponSlots.set(migrateSlot++, id);
      }
    }
    // v11+: accumulated XP
    state.rpg.xp = data.rpg.xp ?? 0;
    // v12+: weapon tiers (default tier 1 for already-purchased weapons without saved tiers)
    if (data.rpg.weaponTiersByWeaponId) {
      for (const [weaponId, tier] of Object.entries(data.rpg.weaponTiersByWeaponId)) {
        state.rpg.weaponTiersByWeaponId.set(weaponId, tier);
      }
    } else {
      // Migrate pre-v12 saves: give all purchased weapons tier 1
      for (const weaponId of state.rpg.purchasedWeaponIds) {
        state.rpg.weaponTiersByWeaponId.set(weaponId, 1);
      }
    }
    // v12+: RPG upgrade levels
    if (data.rpg.rpgUpgradeLevels) {
      for (const [upgradeId, level] of Object.entries(data.rpg.rpgUpgradeLevels)) {
        state.rpg.rpgUpgradeLevels.set(upgradeId, level);
      }
    }
    // v15+: respawn checkpoint wave
    state.rpg.respawnWave = data.rpg.respawnWave ?? 0;
    // v16+: boss completions and speed
    if (data.rpg.bossCompletions) {
      for (const [idStr, speedPct] of Object.entries(data.rpg.bossCompletions)) {
        state.rpg.bossCompletions.set(parseInt(idStr, 10), speedPct);
      }
    }
    state.rpg.bossSpeedPct = data.rpg.bossSpeedPct ?? 100;
    // v19+: XP multi-wire stats; v17–v18 compat: migrate single xpAllocatedStat
    if (data.rpg.xpAllocatedStats) {
      const validStats = new Set(['atk', 'def', 'luck', 'hp']);
      state.rpg.xpAllocatedStats = (data.rpg.xpAllocatedStats as string[])
        .filter(s => validStats.has(s)) as Array<'atk' | 'def' | 'luck' | 'hp'>;
    } else if (data.rpg.xpAllocatedStat) {
      state.rpg.xpAllocatedStats = [data.rpg.xpAllocatedStat];
    } else {
      state.rpg.xpAllocatedStats = [];
    }
    state.rpg.xpAllocatedToAtk = data.rpg.xpAllocatedToAtk ?? 0;
    state.rpg.xpAllocatedToDef = data.rpg.xpAllocatedToDef ?? 0;
    // v18+: luck and HP XP allocation pools
    state.rpg.xpAllocatedToLuck = data.rpg.xpAllocatedToLuck ?? 0;
    state.rpg.xpAllocatedToHp = data.rpg.xpAllocatedToHp ?? 0;
    // v21+: achievement tracking counters
    if (data.rpg.lifetimeKillsByType) {
      for (const [k, v] of Object.entries(data.rpg.lifetimeKillsByType)) {
        state.rpg.lifetimeKillsByType.set(k, v);
      }
    }
    state.rpg.lifetimeEliteKills = data.rpg.lifetimeEliteKills ?? 0;
    state.rpg.lifetimeAlivenKills = data.rpg.lifetimeAlivenKills ?? 0;
    state.rpg.lifetimeLuckyMotesCollected = data.rpg.lifetimeLuckyMotesCollected ?? 0;
    state.rpg.lifetimeLateEnemyKills = data.rpg.lifetimeLateEnemyKills ?? 0;
    state.rpg.totalRpgSurvivalMs = data.rpg.totalRpgSurvivalMs ?? 0;
    state.rpg.totalWavesCompleted = data.rpg.totalWavesCompleted ?? 0;
    state.rpg.bestDamageFreeWaveStreak = data.rpg.bestDamageFreeWaveStreak ?? 0;
    state.rpg.bossDefeated1Weapon = data.rpg.bossDefeated1Weapon ?? false;
    // v22+: secret achievement flags
    if (data.rpg.secretAchievementFlags) {
      for (const flag of data.rpg.secretAchievementFlags) {
        state.rpg.secretAchievementFlags.add(flag);
      }
    }
  }

  // v13+: pending idle-mote drip queue (absent in older saves → empty array)
  if (data.pendingIdleMotes && data.pendingIdleMotes.length > 0) {
    for (const entry of data.pendingIdleMotes) {
      if (entry.count > 0) {
        state.pendingIdleMotes.push({
          tierId: entry.tierId as TierId,
          sizeIndex: entry.sizeIndex,
          count: entry.count,
        } satisfies PendingMoteEntry);
      }
    }
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
