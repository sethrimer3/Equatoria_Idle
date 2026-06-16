/**
 * save-types.ts — SaveData interface and save format constants.
 *
 * Extracted from save-load.ts to keep that file focused on localStorage I/O.
 * Imported by save-serialize.ts, save-deserialize.ts, and save-load.ts.
 */

// ─── Save format ────────────────────────────────────────────────

export const SAVE_KEY = 'equatoria_save';
export const SAVE_VERSION = 33;

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
    /** v30+: accumulated refined-crystal progress per tier (small-mote equivalents). */
    refinedProgressByTierId?: Record<string, number>;
    /** v30+: crafting capacity tier for forged weapons. Absent in older saves (defaults to 1). */
    forgeCraftLevel?: number;
    /** Forge upgrade level (1–5). Absent in older saves (defaults to 1). */
    forgeLevel?: number;
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
    /** v25+: set of enemy type IDs the player has explicitly encountered (spawned). Absent in older
    *  saves; bestiary falls back to highestWaveReached-based visibility for empty sets. */
    encounteredEnemyTypes?: string[];
    /** v26+: active zone id (defaults to 'euhedral'). Absent in older saves. */
    activeZoneId?: string;
    /** v28+: active subzone id within the zone (defaults to 'zenith'). Absent in older saves. */
    activeSubzoneId?: string;
    /** v26+: highest zone-local wave reached per zone. Absent in older saves (defaults to 0). */
    highestWaveReachedByZone?: Record<string, number>;
    /** v27+: current wave per zone (resumes after reload). Absent in older saves (defaults to 0). */
    currentWaveByZone?: Record<string, number>;
    /** v29+: player character level. Absent in older saves (defaults to 1). */
    playerLevel?: number;
    /** v29+: player XP toward next level. Absent in older saves (defaults to 0). */
    playerXp?: number;
    /** v29+: XP required to reach next level. Absent in older saves (recomputed from playerLevel). */
    playerXpToNextLevel?: number;
    /** v34+: unspent skill points. Absent in older saves (migrated from playerLevel). */
    unspentSkillPoints?: number;
    /** v34+: whether the one-time skill point migration has already run. */
    skillPointMigrationDone?: boolean;
    /** v30+: crafted weapon definitions (ingredients, composition, stats). Absent in older saves. */
    craftedWeapons?: Array<{
      id: string;
      name: string;
      description: string;
      dominantTierId: string;
      secondaryTierId: string;
      forgeCraftLevel: number;
      ingredients: Array<{ tierId: string; refinedCount: string | number }>;
      composition: Array<{ tierId: string; weightedValue: number; share: number }>;
      definition: {
        id: string;
        name: string;
        description: string;
        costTierId: string;
        cost: number;
        stats: {
          damage: number;
          cooldownMs: number;
          range: number;
          defBonus: number;
          effect?: { kind: string; targetCount?: number; aoeRadius?: number; defPierceRatio?: number };
        };
      };
      /** v32+: attached lens snapshot. Absent on older saves or weapons without a lens. */
      attachedLens?: {
        id: string;
        name: string;
        forgeCraftLevel: number;
        totalWeightedMoteValue: number;
        ingredients: Array<{ tierId: string; refinedCount: string | number }>;
        effects: Array<{
          tierId: string;
          effectTier: number;
          key: string;
          name: string;
          description: string;
          magnitude: number;
          quality: number;
          rarity: string;
          isApplied: boolean;
        }>;
      };
    }>;
    /** v30+: refined crystal inventory per tier. Absent in older saves. */
    refinedCrystalsByTierId?: Record<string, string | number>;
    /** v31+: crafted weave inventory. Absent in older saves. */
    craftedWeaves?: Array<{
      id: string;
      name: string;
      forgeCraftLevel: number;
      totalWeightedMoteValue: number;
      ingredients: Array<{ tierId: string; refinedCount: string | number }>;
      affixes: Array<{
        affixId: string;
        tierId: string;
        label: string;
        quality: number;
        rarity: string;
        value: number;
        unit: string;
        applied: boolean;
      }>;
      /** v33+: tier 1–3 STUB effects rolled at craft time. Absent in older weave saves. */
      tierEffects?: Array<{
        tierId: string;
        effectTier: number;
        key: string;
        name: string;
        description: string;
        magnitude: number;
        quality: number;
        rarity: string;
        isApplied: boolean;
      }>;
    }>;
    /** v31+: equipped weave slot assignments (array of 6 weave IDs or null). Absent in older saves. */
    equippedWeaveSlots?: Array<string | null>;
    /** v32+: crafted lens inventory (unattached lenses). Absent in older saves. */
    craftedLenses?: Array<{
      id: string;
      name: string;
      forgeCraftLevel: number;
      totalWeightedMoteValue: number;
      ingredients: Array<{ tierId: string; refinedCount: string | number }>;
      effects: Array<{
        tierId: string;
        effectTier: number;
        key: string;
        name: string;
        description: string;
        magnitude: number;
        quality: number;
        rarity: string;
        isApplied: boolean;
      }>;
    }>;
  };
  elapsedMs: number;
  /** v13+: pending idle-mote drip queue. Absent in older saves (defaults to []). */
  pendingIdleMotes?: Array<{ tierId: string; sizeIndex: number; count: number }>;
}
