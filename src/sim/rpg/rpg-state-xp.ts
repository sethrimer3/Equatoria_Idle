/**
 * rpg-state-xp.ts — XP and luck computation functions.
 *
 * Extracted from rpg-state.ts. All functions here are pure utilities that
 * operate on numeric XP values or on the RpgSimState XP allocation fields.
 *
 * Re-exported from rpg-state.ts for backward compatibility.
 */

import type { RpgSimState } from './rpg-state';

// ─── Per-kill XP and scaling ──────────────────────────────────────

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

// ─── Raw XP bonuses ───────────────────────────────────────────────

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
 * Formats the luck percentage for display (e.g. "34.5%" or "134.5%").
 * Accepts the full effective luck value (which may exceed 100).
 */
export function formatLuckPercent(effectiveLuck: number): string {
  return effectiveLuck.toFixed(1) + '%';
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
 * XP cost to advance a multiplier box from `currentLevel` to `currentLevel + 1`.
 *
 * Formula: 50 × 5^(currentLevel − 1)
 *   level 1 → 2:     50 XP
 *   level 2 → 3:    250 XP
 *   level 3 → 4:  1 250 XP
 *   level 4 → 5:  6 250 XP
 *   …
 */
export function getMultiplierXpCost(currentLevel: number): number {
  return 50 * Math.pow(5, Math.max(0, currentLevel - 1));
}

// ─── Player level constants ───────────────────────────────────────

/** ATK added to player base stats per level above 1. */
export const PLAYER_ATK_PER_LEVEL = 1;
/** DEF added to player base stats per level above 1. */
export const PLAYER_DEF_PER_LEVEL = 0.5;
/** Max HP added to player base stats per level above 1. */
export const PLAYER_HP_PER_LEVEL = 8;

// ─── Player level helpers ────────────────────────────────────────

/**
 * XP required to advance from `level` to `level + 1`.
 *
 * Formula: floor(25 × level^1.35)
 *   Level  1 →    25 XP
 *   Level  5 →   147 XP
 *   Level 10 →   355 XP
 *   Level 20 →   856 XP
 *   Level 50 → 2 750 XP
 */
export function getPlayerXpToNextLevel(level: number): number {
  return Math.floor(25 * Math.pow(level, 1.35));
}

/** Flat ATK bonus from player levels (0 at level 1). */
export function getPlayerLevelAtkBonus(level: number): number {
  return (level - 1) * PLAYER_ATK_PER_LEVEL;
}

/** Flat DEF bonus from player levels (0 at level 1). */
export function getPlayerLevelDefBonus(level: number): number {
  return (level - 1) * PLAYER_DEF_PER_LEVEL;
}

/** Flat max-HP bonus from player levels (0 at level 1). */
export function getPlayerLevelHpBonus(level: number): number {
  return (level - 1) * PLAYER_HP_PER_LEVEL;
}

/**
 * Adds `amount` XP to the player's level progress, handling multiple level-ups
 * and overflow XP.  Returns the number of levels gained this tick.
 *
 * Called from the stats panel each frame while Box 2 is wired to Box 1.
 * Level is capped at 9999 to prevent infinite loops with very large amounts.
 */
export function tickPlayerXpProgress(state: RpgSimState, amount: number): number {
  let levelsGained = 0;
  let remaining = amount;
  while (remaining > 0 && state.playerLevel < 9999) {
    const space = state.playerXpToNextLevel - state.playerXp;
    if (remaining >= space) {
      state.playerLevel++;
      state.playerXp = 0;
      state.playerXpToNextLevel = getPlayerXpToNextLevel(state.playerLevel);
      remaining -= space;
      levelsGained++;
    } else {
      state.playerXp += remaining;
      remaining = 0;
    }
  }
  return levelsGained;
}

/**
 * Advances `multiplierBoxes[modIdx]` by `amount` XP, levelling up as needed.
 * Overflow XP is applied to subsequent levels while wire is active.
 * The level is capped at 100 to prevent infinite loops with very large amounts.
 */
export function tickMultiplierXpProgress(state: RpgSimState, modIdx: number, amount: number): void {
  if (modIdx < 0 || modIdx >= state.multiplierBoxes.length) return;
  let remaining = amount;
  const box = state.multiplierBoxes[modIdx];
  // Cap at level 100 to prevent infinite loops.
  while (remaining > 0 && box.level < 100) {
    const cost = getMultiplierXpCost(box.level);
    const space = cost - box.progressXp;
    if (remaining >= space) {
      box.level++;
      box.progressXp = 0;
      remaining -= space;
    } else {
      box.progressXp += remaining;
      remaining = 0;
    }
  }
}



/**
 * Adds `amount` XP to the total and — if a stat is wired — also increments
 * the per-stat allocation counter.  Call this instead of `state.xp += amount`
 * everywhere XP is earned to keep all three counters in sync.
 */
export function addXpWithAllocation(state: RpgSimState, amount: number): void {
  state.xp += amount;
  // XP also enters the reservoir (Box 2) so it can be drained into multiplier boxes.
  state.xpReservoir += amount;
  const n = state.xpAllocatedStats.length;
  if (n === 0) return;
  const share = amount / n;
  for (const stat of state.xpAllocatedStats) {
    if (stat === 'atk')       state.xpAllocatedToAtk  += share;
    else if (stat === 'def')  state.xpAllocatedToDef  += share;
    else if (stat === 'luck') state.xpAllocatedToLuck += share;
    else if (stat === 'hp')   state.xpAllocatedToHp   += share;
  }
}

// ─── Effective XP bonuses (allocation-aware) ──────────────────────

/**
 * Returns the effective ATK XP bonus given the current allocation state.
 *
 * - If wired to ATK: uses the dedicated `xpAllocatedToAtk` pool so growth is
 *   tracked per-stat but the bonus formula is identical to the global one.
 * - If wired to DEF: ATK no longer receives an XP bonus (returns 0).
 * - If not wired yet: falls back to the global `xp` total (legacy behaviour).
 */
export function getEffectiveXpAtkBonus(state: RpgSimState): number {
  const stats = state.xpAllocatedStats;
  if (stats.length === 0) return getXpAtkBonus(state.xp); // legacy: not wired yet
  if (!stats.includes('atk')) return 0; // wired to other stats only
  return getXpAtkBonus(state.xpAllocatedToAtk);
}

/**
 * Returns the effective DEF XP bonus given the current allocation state.
 *
 * - If wired to DEF: uses the dedicated `xpAllocatedToDef` pool.
 * - If wired to ATK/LUCK/HP: DEF no longer receives an XP bonus (returns 0).
 * - If not wired yet: falls back to the global `xp` total (legacy behaviour).
 */
export function getEffectiveXpDefBonus(state: RpgSimState): number {
  const stats = state.xpAllocatedStats;
  if (stats.length === 0) return getXpDefBonus(state.xp); // legacy: not wired yet
  if (!stats.includes('def')) return 0; // wired to other stats only
  return getXpDefBonus(state.xpAllocatedToDef);
}

/**
 * Returns the effective luck bonus from XP allocation.
 *
 * When wired to LUCK, the XP pool extends the base luck percentage
 * (from getLuckPercent) beyond 100%.  The result can exceed 100 — values
 * above 100% mean the player has a chance at double-drop motes on each kill.
 *
 * Formula: base luck + extra derived from xpAllocatedToLuck via the same
 * log10 curve shifted so that 0 allocation = 0 extra.
 */
export function getEffectiveXpLuckBonus(state: RpgSimState): number {
  if (!state.xpAllocatedStats.includes('luck')) return 0;
  if (state.xpAllocatedToLuck <= 0) return 0;
  // Same log10 curve as getLuckPercent but applied to the dedicated luck pool.
  const LUCK_LOG_DIVISOR = 9;
  return (Math.log10(state.xpAllocatedToLuck + 1) / LUCK_LOG_DIVISOR) * 100;
}

/**
 * Returns the bonus max-HP granted by XP allocation to the HP stat.
 *
 * Formula: floor(log10(xp + 1) × 10) — gives roughly +10 maxHp per
 * decade of XP accumulated while wired to HP.
 */
export function getEffectiveXpHpBonus(state: RpgSimState): number {
  if (!state.xpAllocatedStats.includes('hp')) return 0;
  if (state.xpAllocatedToHp <= 0) return 0;
  return Math.floor(Math.log10(state.xpAllocatedToHp + 1) * 10);
}
