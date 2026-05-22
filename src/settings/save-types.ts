/**
 * save-types.ts — SaveData interface and save format constants.
 *
 * Extracted from save-load.ts to keep that file focused on localStorage I/O.
 * Imported by save-serialize.ts, save-deserialize.ts, and save-load.ts.
 */

// ─── Save format ────────────────────────────────────────────────

export const SAVE_KEY = 'equatoria_save';
export const SAVE_VERSION = 24;

export interface SaveData {
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
    looms: Array<{
      tierId: string;
      level: number;
      isUnlocked: boolean;
      /** v23+: loom conversion progress (small-mote equivalents accumulated). */
      conversionProgress?: number;
      /** v23+: loom conversion efficiency upgrade level. */
      conversionEfficiencyLevel?: number;
    }>;
    specialLoomPurchased?: string[];
  };
  /** v23+: forge heat-tap state. Absent in older saves. */
  forge?: {
    heatTapCount: number;
    sacrificeProgressByTierId: Record<string, number>;
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
    /** v24+: XP stored in Box 2 reservoir. Absent in older saves (defaults to 0). */
    xpReservoir?: number;
    /** v24+: multiplier box states [Box3, Box4, Box5]. Absent in older saves (defaults to level 1, 0 progress). */
    multiplierBoxes?: Array<{ level: number; progressXp: number }>;
    /** v25+: whether the sand blade default melee is enabled. Absent in older saves (defaults to true). */
    sandBladeEnabled?: boolean;
  };
  elapsedMs: number;
  /** v13+: pending idle-mote drip queue. Absent in older saves (defaults to []). */
  pendingIdleMotes?: Array<{ tierId: string; sizeIndex: number; count: number }>;
}
