/**
 * rpg-state.ts — Persistent RPG simulation state.
 *
 * Lives in GameState so highest-wave tracking survives sessions and the wave
 * progression boost is automatically applied to loom production via simTick.
 */

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

export interface RpgSimState {
  /** Highest wave number the player has cleared during this run. */
  highestWaveReached: number;
  /** Wave to restart at on death (a multiple of 10 that has been unlocked). 0 = start from wave 1. */
  respawnWave: number;
  /** Weapon IDs the player has purchased. */
  purchasedWeaponIds: Set<string>;
  /**
   * Set of currently equipped weapon IDs.
   * Maximum size = getMaxEquippedWeapons(state).
   */
  equippedWeaponIds: Set<string>;
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
   * The stat the player has permanently wired their XP source to.
   * null = not yet chosen. Once set, it cannot be changed.
   * When wired, all newly-earned XP flows only into that stat's XP pool;
   * the other allocatable stat loses its XP bonus.
   */
  xpAllocatedStat: 'atk' | 'def' | null;
  /**
   * Cumulative XP that has flowed into ATK while wired to ATK.
   * Used to drive the ATK XP bonus when xpAllocatedStat === 'atk'.
   */
  xpAllocatedToAtk: number;
  /**
   * Cumulative XP that has flowed into DEF while wired to DEF.
   * Used to drive the DEF XP bonus when xpAllocatedStat === 'def'.
   */
  xpAllocatedToDef: number;
}

// ─── Factory ─────────────────────────────────────────────────────

export function createRpgSimState(): RpgSimState {
  return {
    highestWaveReached: 0,
    respawnWave: 0,
    purchasedWeaponIds: new Set(),
    equippedWeaponIds: new Set(),
    xp: 0,
    weaponTiersByWeaponId: new Map(),
    rpgUpgradeLevels: new Map(),
    bossCompletions: new Map(),
    bossSpeedPct: 100,
    xpAllocatedStat: null,
    xpAllocatedToAtk: 0,
    xpAllocatedToDef: 0,
  };
}

// ─── Wave boost ───────────────────────────────────────────────────

/**
 * Returns the multiplicative loom production bonus from wave progression.
 * Formula: 1 + (highestWaveReached ^ 1.2) / 100
 *
 * Examples:
 *   Wave  5 → ~1.069  (+6.9%)
 *   Wave 10 → ~1.158  (+15.8%)
 *   Wave 20 → ~1.364  (+36.4%)
 */
export function getWaveBoostMultiplier(state: RpgSimState): number {
  if (state.highestWaveReached <= 0) return 1;
  return 1 + Math.pow(state.highestWaveReached, 1.2) / 100;
}

/**
 * Returns the wave loom boost formatted as a signed percentage string,
 * e.g. "+6.9%" or "+0.0%".
 */
export function formatWaveBoostPercent(state: RpgSimState): string {
  if (state.highestWaveReached <= 0) return '+0.0%';
  const pct = Math.pow(state.highestWaveReached, 1.2);
  return `+${pct.toFixed(1)}%`;
}

// ─── XP system ───────────────────────────────────────────────────

/**
 * XP awarded for killing one enemy on `waveNumber`.
 *
 * The formula grows super-linearly so higher-wave enemies are
 * dramatically more rewarding:
 *   Wave  1 →    1 XP/kill
 *   Wave  5 →   19 XP/kill
 *   Wave 10 →   63 XP/kill
 *   Wave 20 →  212 XP/kill
 *   Wave 50 → 1 174 XP/kill
 */
export function getXpPerKill(waveNumber: number): number {
  return Math.ceil(Math.pow(Math.max(1, waveNumber), 1.8));
}

/** Multiplier applied to base enemy HP, ATK, DEF for a given wave. */
export function getWaveStatScale(waveNumber: number): number {
  return Math.max(1, Math.pow(Math.max(1, waveNumber), 0.65));
}

/**
 * Flat ATK bonus from accumulated XP.
 *
 * Formula: floor(log10(xp + 1) × 5)
 *   xp =      0 →  0 ATK
 *   xp =     10 →  5 ATK
 *   xp =    100 → 10 ATK
 *   xp =  1 000 → 15 ATK
 *   xp = 10 000 → 20 ATK
 *
 * The logarithmic curve creates early satisfaction while requiring
 * exponentially more XP (i.e., higher-wave kills) for each +5 step.
 */
export function getXpAtkBonus(xp: number): number {
  return Math.floor(Math.log10(xp + 1) * 5);
}

/**
 * Flat DEF bonus from accumulated XP (half of the ATK bonus).
 *
 * Formula: floor(log10(xp + 1) × 2)
 */
export function getXpDefBonus(xp: number): number {
  return Math.floor(Math.log10(xp + 1) * 2);
}

/**
 * Returns the player's current luck percentage (0–100).
 *
 * Luck is the chance that a killed enemy drops a lucky mote of its type.
 * It rises logarithmically, requiring exponentially more XP per percent
 * gain (roughly 10× more XP for each additional ~11% of luck):
 *
 *   xp =           0 →   0.0%
 *   xp =         100 →  ~22.2%
 *   xp =       1 000 →  ~33.3%
 *   xp =      10 000 →  ~44.4%
 *   xp =     100 000 →  ~55.6%
 *   xp =   1 000 000 →  ~66.7%
 *   xp = 100 000 000 →  ~88.9%
 *   xp = 1 000 000 000 → 100.0%
 */
export function getLuckPercent(xp: number): number {
  if (xp <= 0) return 0;
  const LUCK_LOG_DIVISOR = 9; // log10(1e9) = 9 → 100% at 1 billion XP
  return Math.min(100, (Math.log10(xp + 1) / LUCK_LOG_DIVISOR) * 100);
}

/**
 * Formats the luck percentage for display (e.g. "34.5%").
 */
export function formatLuckPercent(xp: number): string {
  return getLuckPercent(xp).toFixed(1) + '%';
}

/**
 * Formats a raw XP total for compact display (e.g. "1.2K", "4.5M").
 */
export function formatXp(xp: number): string {
  if (xp < 1_000) return String(Math.floor(xp));
  if (xp < 1_000_000) return (xp / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return (xp / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
}

/**
 * Adds `amount` XP to the total and — if a stat is wired — also increments
 * the per-stat allocation counter.  Call this instead of `state.xp += amount`
 * everywhere XP is earned to keep all three counters in sync.
 */
export function addXpWithAllocation(state: RpgSimState, amount: number): void {
  state.xp += amount;
  if (state.xpAllocatedStat === 'atk') {
    state.xpAllocatedToAtk += amount;
  } else if (state.xpAllocatedStat === 'def') {
    state.xpAllocatedToDef += amount;
  }
}

/**
 * Returns the effective ATK XP bonus given the current allocation state.
 *
 * - If wired to ATK: uses the dedicated `xpAllocatedToAtk` pool so growth is
 *   tracked per-stat but the bonus formula is identical to the global one.
 * - If wired to DEF: ATK no longer receives an XP bonus (returns 0).
 * - If not wired yet: falls back to the global `xp` total (legacy behaviour).
 */
export function getEffectiveXpAtkBonus(state: RpgSimState): number {
  if (state.xpAllocatedStat === 'def') return 0;
  if (state.xpAllocatedStat === 'atk') return getXpAtkBonus(state.xpAllocatedToAtk);
  return getXpAtkBonus(state.xp);
}

/**
 * Returns the effective DEF XP bonus given the current allocation state.
 *
 * - If wired to DEF: uses the dedicated `xpAllocatedToDef` pool.
 * - If wired to ATK: DEF no longer receives an XP bonus (returns 0).
 * - If not wired yet: falls back to the global `xp` total (legacy behaviour).
 */
export function getEffectiveXpDefBonus(state: RpgSimState): number {
  if (state.xpAllocatedStat === 'atk') return 0;
  if (state.xpAllocatedStat === 'def') return getXpDefBonus(state.xpAllocatedToDef);
  return getXpDefBonus(state.xp);
}

// ─── Upgrade helpers ─────────────────────────────────────────────

/** Returns the current level of an RPG upgrade (defaults to 0 if not purchased). */
export function getRpgUpgradeLevel(state: RpgSimState, upgradeId: string): number {
  return state.rpgUpgradeLevels.get(upgradeId) ?? 0;
}

/**
 * Speed multiplier from the speed upgrade.
 * Each level adds 10% to base speed.
 */
export function getRpgSpeedMultiplier(state: RpgSimState): number {
  const level = getRpgUpgradeLevel(state, 'speed');
  return 1 + level * 0.1;
}

/**
 * Returns the maximum number of weapons that can be equipped simultaneously.
 * Base: 1. Each `extra_weapon_slot` upgrade level adds 1.
 */
export function getMaxEquippedWeapons(state: RpgSimState): number {
  return 1 + getRpgUpgradeLevel(state, 'extra_weapon_slot');
}

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

/**
 * Returns the XP multiplier for a boss fight at the given speed %.
 * Formula: speedPct / 10  (100% → 10x, 60% → 6x, 10% → 1x).
 */
export function getBossXpMultiplier(speedPct: number): number {
  return speedPct / 10;
}

/**
 * Returns true when the boss with the given 1-based ID has been unlocked.
 * Boss N is unlocked once the player has reached wave N*100.
 */
export function isBossUnlocked(bossId: number, highestWaveReached: number): boolean {
  return highestWaveReached >= bossId * 100;
}
