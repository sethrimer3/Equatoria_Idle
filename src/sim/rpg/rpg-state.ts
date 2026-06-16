/**
 * rpg-state.ts — Persistent RPG simulation state.
 *
 * Lives in GameState so highest-wave tracking survives sessions and the wave
 * progression boost is automatically applied to loom production via simTick.
 *
 * Split modules (all re-exported here for backward compatibility):
 *   - rpg-state-xp.ts      — XP and luck computation functions
 *   - rpg-state-upgrades.ts — Wave boost, RPG upgrade, and boss helpers
 */

import type { RpgZoneId } from '../../data/rpg/rpg-zone-definitions';
import type { CraftedWeaponData } from '../../data/rpg/crafted-weapon-types';
import type { CraftedWeaveData } from '../../data/rpg/weave-types';
import type { CraftedLensData } from '../../data/rpg/lens-types';
export type { RpgZoneId };

// ─── Constants ────────────────────────────────────────────────────

/** Base player ATK used as the multiplier baseline. */
export const PLAYER_BASE_ATK = 10;

/** Maximum tier level any weapon can reach. */
export const MAX_WEAPON_TIER = 7;

/** Minimum boss speed percentage. */
export const MIN_BOSS_SPEED_PCT = 10;
/** Maximum boss speed percentage. */
export const MAX_BOSS_SPEED_PCT = 100;
/** Step increment for boss speed selector. */
export const BOSS_SPEED_STEP = 10;
/** Total number of bosses in the game (each unlocks at wave N*100). */
export const TOTAL_BOSS_COUNT = 10;

// ─── Types ────────────────────────────────────────────────────────

/** Valid subzone IDs for the Horizon zone. */
export type HorizonSubzoneId = 'zenith' | 'nadir' | 'true';

export interface RpgSimState {
  /** Highest wave number the player has cleared during this run. */
  highestWaveReached: number;
  /**
   * The zone the player is currently fighting in.
   * Defaults to 'euhedral'.
   */
  activeZoneId: RpgZoneId;
  /**
   * Active subzone within the current zone.
   * Only meaningful for zones that have subzones (currently 'horizon').
   * Defaults to 'zenith'.
   */
  activeSubzoneId: HorizonSubzoneId;
  /**
   * Highest zone-local wave reached per zone.
   * The zone-local wave equals the current wave counter (currentWave) within
   * the active zone — it resets to 0 when the player switches zones.
   */
  highestWaveReachedByZone: Record<RpgZoneId, number>;
  /**
   * Current wave counter per zone.
   * Saved so the player resumes from the same wave after a reload.
   * Distinct from highestWaveReachedByZone — this is the in-progress wave,
   * not the personal best.
   */
  currentWaveByZone: Record<RpgZoneId, number>;
  /** Wave to restart at on death (a multiple of 10 that has been unlocked). 0 = start from wave 1. */
  respawnWave: number;
  /** Weapon IDs the player has purchased or crafted. */
  purchasedWeaponIds: Set<string>;
  /** Crafted forged weapons created from refined crystals. */
  craftedWeapons: CraftedWeaponData[];
  /** Crafted weaves created from refined crystals. */
  craftedWeaves: CraftedWeaveData[];
  /** Crafted lenses in the player's inventory (not yet attached to a weapon). */
  craftedLenses: CraftedLensData[];
  /**
   * 6-element array of equipped weave IDs (or null for empty).
   * Index 0–5 correspond to the six weave slots in the UI.
   * Slots beyond getUnlockedWeaveSlotCount(forgeLevel) are locked and cannot hold weaves.
   */
  equippedWeaveSlots: (string | null)[];
  /** Refined crystal inventory available for forging crafted weapons. */
  refinedCrystalsByTierId: Map<string, number | bigint>;
  /**
   * Set of currently equipped weapon IDs.
   * Maximum size = getMaxEquippedWeapons(state).
   */
  equippedWeaponIds: Set<string>;
  /**
   * Maps a slot index (0–4) to the weapon ID equipped in that slot.
   * Slot indices correspond to stat-panel boxes 7–11.
   * Kept in sync with equippedWeaponIds.
   */
  equippedWeaponSlots: Map<number, string>;
  /**
   * Accumulated XP across all sessions.  Persisted in save data.
   * Higher-wave enemies award exponentially more XP, incentivising
   * the player to push into harder content.
   */
  xp: number;
  /**
   * Per-weapon current tier (1-based, capped at MAX_WEAPON_TIER).
   * Key = weaponId, value = tier number (≥ 1).
   */
  weaponTiersByWeaponId: Map<string, number>;
  /**
   * Per-RPG-upgrade purchase level.
   * Key = upgradeId (from RPG_UPGRADE_DEFINITIONS), value = current level (≥ 0).
   */
  rpgUpgradeLevels: Map<string, number>;
  /**
   * Per-boss highest speed percentage at which the boss was defeated (10–100).
   * Key = bossId (1-based); value = highest speed % completed (0 = never beaten).
   */
  bossCompletions: Map<number, number>;
  /**
   * Boss fight speed setting (10–100, in steps of 10).
   * Lower speed = easier dodging but lower XP multiplier.
   */
  bossSpeedPct: number;
  /**
   * XP stored in Box 2 (the reservoir).  Newly-earned XP accumulates here
   * first; it drains into the connected multiplier box each frame while a
   * Box 2 → modifier wire is active.  Starts at 0 for new / migrated saves.
   */
  xpReservoir: number;
  /**
   * Multiplier boxes (index 0 = Box 3 / Roman numeral I,
   *                   index 1 = Box 4 / Roman numeral II,
   *                   index 2 = Box 5 / Roman numeral III).
   * Each box tracks its current level (1-based) and XP progress toward the
   * next level.  Boxed weapons wired to these boxes have their stats
   * multiplied by the box's level.
   *
   * XP cost: costToNextLevel = 50 × 5^(currentLevel − 1)
   *   level 1 → 2:    50 XP
   *   level 2 → 3:   250 XP
   *   level 3 → 4: 1 250 XP
   */
  multiplierBoxes: [
    { level: number; progressXp: number },
    { level: number; progressXp: number },
    { level: number; progressXp: number },
  ];
  /**
   * The set of stats the player has wired their XP source to (up to 3).
   * Empty array = not yet wired. When multiple stats are wired, XP is
   * split evenly among them (each receives amount/n per earn event).
   */
  xpAllocatedStats: Array<'atk' | 'def' | 'luck' | 'hp'>;
  /**
   * LEGACY — The cumulative XP that has flowed into ATK while wired to ATK.
   * This value is still accumulated and used to drive the ATK XP bonus, but
   * the per-stat allocation display in the stats panel has been removed.
   */
  xpAllocatedToAtk: number;
  /**
   * LEGACY — The cumulative XP that has flowed into DEF while wired to DEF.
   * This value is still accumulated and used to drive the DEF XP bonus, but
   * the per-stat allocation display in the stats panel has been removed.
   */
  xpAllocatedToDef: number;
  /**
   * LEGACY — The cumulative XP that has flowed into LUCK while wired to LUCK.
   * This value is still accumulated and used to compute the extended luck bonus,
   * but the per-stat allocation display in the stats panel has been removed.
   */
  xpAllocatedToLuck: number;
  /**
   * LEGACY — The cumulative XP that has flowed into HP while wired to HP.
   * This value is still accumulated and used to compute the bonus max-HP,
   * but the per-stat allocation display in the stats panel has been removed.
   */
  xpAllocatedToHp: number;
  // ── Achievement tracking counters ─────────────────────────────
  /** Lifetime kill count per enemy type-id string (e.g. 'laser', 'quartz', 'elite_quartz'). */
  lifetimeKillsByType: Map<string, number>;
  /** Total lifetime elite enemy kills (all tiers combined). */
  lifetimeEliteKills: number;
  /** Total lifetime aliven groups defeated. */
  lifetimeAlivenKills: number;
  /** Lifetime lucky mote drops collected. */
  lifetimeLuckyMotesCollected: number;
  /** Lifetime kills of late-tier enemies (diamond, nullstone, fracteryl, eigenstein). */
  lifetimeLateEnemyKills: number;
  /** Total cumulative RPG survival time in milliseconds. */
  totalRpgSurvivalMs: number;
  /** Current consecutive wave-clear streak (resets on death). */
  consecutiveWaveStreak: number;
  /** Best consecutive damage-free waves cleared (resets on taking damage; peak is stored separately). */
  damageFreeWaveStreak: number;
  /** Best damage-free wave streak ever achieved across all runs. */
  bestDamageFreeWaveStreak: number;
  /** Total lifetime waves completed. */
  totalWavesCompleted: number;
  /** Whether the player took damage in the current wave (reset each wave). */
  tookDamageThisWave: boolean;
  /** Boss defeated while only 1 weapon was equipped. */
  bossDefeated1Weapon: boolean;
  /**
   * Persistent set of secret achievement condition flags.
   * Gameplay systems set string IDs here; achievement definitions reference
   * them via { kind: 'secret_flag', flagId: '...' } conditions.
   */
  secretAchievementFlags: Set<string>;
  /**
   * Timestamps (nowMs) of recent lucky mote collections, capped at 20.
   * Used to check timing-based lucky mote achievements.
   */
  luckyMoteCollectedTimestampsMs: number[];
  /**
   * Accumulated milliseconds the player has spent at ≤10% max HP this run.
   * Resets on death. Used for the "survived_60s_low_hp" secret flag.
   */
  lowHpAccumulatedMs: number;
  /**
   * Whether the player changed equipped weapons during the current inter-wave
   * delay. Reset to false at the start of each new wave.
   */
  equipChangedDuringInterwave: boolean;
  /**
   * Whether the sand blade (default melee) is enabled.
   * When disabled, the sand blade will not auto-attack and auto-move will not
   * treat it as an available weapon. Useful when the player wants to stay
   * at range using only ranged weapons.
   * Defaults to true.
   */
  sandBladeEnabled: boolean;
  /**
   * Set of enemy type IDs the player has explicitly encountered (spawned during
   * a wave). Used by the bestiary to show only truly seen enemies.
   * Empty for old saves — bestiary falls back to highestWaveReached in that case.
   */
  encounteredEnemyTypes: Set<string>;
  /** v29+: Player character level. Starts at 1. Increases as the XP wire drains into Box 1. */
  playerLevel: number;
  /** v29+: Current XP progress toward the next player level. */
  playerXp: number;
  /** v29+: XP required to advance to the next player level. Recomputed from playerLevel. */
  playerXpToNextLevel: number;
  /** v34+: Unspent skill points. Earned one per player level-up. Spent in the Skill Tree. */
  unspentSkillPoints: number;
  /** v34+: Whether the one-time skill point migration (level → points) has already run. */
  skillPointMigrationDone: boolean;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgSimState(): RpgSimState {
  return {
    highestWaveReached: 0,
    activeZoneId: 'euhedral',
    activeSubzoneId: 'zenith',
    highestWaveReachedByZone: {
      euhedral: 0,
      impetus:  0,
      caustics: 0,
      verdure:  0,
      horizon:  0,
    },
    currentWaveByZone: {
      euhedral: 0,
      impetus:  0,
      caustics: 0,
      verdure:  0,
      horizon:  0,
    },
    respawnWave: 0,
    purchasedWeaponIds: new Set(),
    craftedWeapons: [],
    craftedWeaves: [],
    craftedLenses: [],
    equippedWeaveSlots: [null, null, null, null, null, null],
    refinedCrystalsByTierId: new Map(),
    equippedWeaponIds: new Set(),
    equippedWeaponSlots: new Map(),
    xp: 0,
    weaponTiersByWeaponId: new Map(),
    rpgUpgradeLevels: new Map(),
    bossCompletions: new Map(),
    bossSpeedPct: 100,
    xpAllocatedStats: [],
    xpAllocatedToAtk: 0,
    xpAllocatedToDef: 0,
    xpAllocatedToLuck: 0,
    xpAllocatedToHp: 0,
    xpReservoir: 0,
    multiplierBoxes: [
      { level: 1, progressXp: 0 },
      { level: 1, progressXp: 0 },
      { level: 1, progressXp: 0 },
    ],
    lifetimeKillsByType: new Map(),
    lifetimeEliteKills: 0,
    lifetimeAlivenKills: 0,
    lifetimeLuckyMotesCollected: 0,
    lifetimeLateEnemyKills: 0,
    totalRpgSurvivalMs: 0,
    consecutiveWaveStreak: 0,
    damageFreeWaveStreak: 0,
    bestDamageFreeWaveStreak: 0,
    totalWavesCompleted: 0,
    tookDamageThisWave: false,
    bossDefeated1Weapon: false,
    secretAchievementFlags: new Set(),
    luckyMoteCollectedTimestampsMs: [],
    lowHpAccumulatedMs: 0,
    equipChangedDuringInterwave: false,
    sandBladeEnabled: true,
    encounteredEnemyTypes: new Set(),
    playerLevel: 1,
    playerXp: 0,
    playerXpToNextLevel: 25, // getPlayerXpToNextLevel(1) = Math.floor(25 * 1^1.35) = 25
    unspentSkillPoints: 0,
    skillPointMigrationDone: false,
  };
}

// ─── Weapon scaling helpers ───────────────────────────────────────
// Kept here (not in rpg-state-upgrades.ts) to avoid a circular value
// dependency on PLAYER_BASE_ATK.

/**
 * Returns the mote cost to upgrade a weapon from its current tier to the next tier.
 *
 * Formula: currentTier² × baseCost
 *
 * Examples (for a weapon with baseCost 100):
 *   Tier 1 → Tier 2:  100  (1² × 100)
 *   Tier 2 → Tier 3:  400  (2² × 100)
 *   Tier 3 → Tier 4:  900  (3² × 100)
 */
export function getWeaponTierUpgradeCost(baseCost: number, currentTier: number): number {
  return Math.pow(currentTier, 2) * baseCost;
}

/**
 * Returns the effective damage for a weapon at a given tier, multiplied by
 * the player's ATK multiplier.
 *
 * Formula: baseDamage × tier × (playerAtk / PLAYER_BASE_ATK)
 *
 * Examples (baseDamage=10, PLAYER_BASE_ATK=10):
 *   Tier 1, playerAtk=10 → 10   (1× base, no XP bonus)
 *   Tier 3, playerAtk=20 → 60   (3× tier, 2× ATK)
 *   Tier 7, playerAtk=15 → 105  (7× tier, 1.5× ATK)
 */
export function getScaledWeaponDamage(baseDamage: number, tier: number, playerAtk: number): number {
  return baseDamage * tier * (playerAtk / PLAYER_BASE_ATK);
}

/**
 * Returns the cooldown (ms) for a weapon at a given tier.
 * Each tier reduces the cooldown by 15%.
 *
 * Formula: baseCooldownMs × 0.85^(tier-1)
 */
export function getScaledWeaponCooldown(baseCooldownMs: number, tier: number): number {
  return baseCooldownMs * Math.pow(0.85, tier - 1);
}

// ─── Re-exports for backward compatibility ────────────────────────
export {
  getXpPerKill, getWaveStatScale,
  getXpAtkBonus, getXpDefBonus,
  getLuckPercent, formatLuckPercent, formatXp,
  addXpWithAllocation,
  getEffectiveXpAtkBonus, getEffectiveXpDefBonus,
  getEffectiveXpLuckBonus, getEffectiveXpHpBonus,
  PLAYER_ATK_PER_LEVEL, PLAYER_DEF_PER_LEVEL, PLAYER_HP_PER_LEVEL,
  getPlayerXpToNextLevel, getPlayerLevelAtkBonus, getPlayerLevelDefBonus,
  getPlayerLevelHpBonus, tickPlayerXpProgress,
} from './rpg-state-xp';

export {
  getWaveBoostMultiplier, formatWaveBoostPercent,
  getRpgUpgradeLevel, getRpgSpeedMultiplier, getMaxEquippedWeapons, getLevelRequiredForSlot,
  getBossXpMultiplier, isBossUnlocked,
} from './rpg-state-upgrades';
