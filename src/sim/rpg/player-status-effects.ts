/**
 * player-status-effects.ts — Player-side status effect system for RPG combat.
 *
 * Parallel to enemy-status-effects.ts but operates on RpgSimState directly
 * (no WeakMap needed — there is only one player).
 *
 * Public surface:
 *   getPlayerStatusDurationMultiplier(sim)        — resistance skill multiplier
 *   applyPlayerStatus(sim, params)                — apply / refresh a status
 *   clearPlayerStatuses(sim)                      — call on death / restart
 *   tickPlayerStatuses(sim, playerStats, deltaMs) — per-frame tick
 *   getPlayerMovementStatusMultiplier(sim)         — speed multiplier (0.25–1.0)
 *   getPlayerAttackSpeedStatusMultiplier(sim)      — attack cadence multiplier
 *   getActivePlayerStatuses(sim)                  — query all active statuses
 *   hasPlayerStatus(sim, key)                     — query a single status
 */

import type { RpgSimState } from './rpg-state';
import { getSkillNodeRank } from './rpg-state';

// ── Status key type ────────────────────────────────────────────────────────────

export type PlayerStatusKey =
  | 'burning'
  | 'poisoned'
  | 'chilled'
  | 'frozen'
  | 'slowed'
  | 'timeWarped';

// ── Status record ──────────────────────────────────────────────────────────────

export interface ActivePlayerStatus {
  key: PlayerStatusKey;
  durationMs: number;
  remainingMs: number;
  magnitude: number;
  tickEveryMs?: number;
  tickMs: number;
  source?: string;
}

// ── Balance constants (single source of truth for tuning) ─────────────────────

/** Burning applied by ruby attacks: duration, magnitude, tick interval. */
export const PLAYER_BURNING_DURATION_MS   = 3000;
export const PLAYER_BURNING_MAGNITUDE     = 10;
export const PLAYER_BURNING_TICK_MS       = 1000;

/** Poisoned applied by emerald attacks. */
export const PLAYER_POISONED_DURATION_MS  = 5000;
export const PLAYER_POISONED_MAGNITUDE    = 10;
export const PLAYER_POISONED_TICK_MS      = 1000;

/** Chilled applied by sapphire attacks. */
export const PLAYER_CHILLED_DURATION_MS   = 2500;
export const PLAYER_CHILLED_MAGNITUDE     = 10;
/** Frozen escalates from chilled when sapphire hits a chilled player. */
export const PLAYER_FROZEN_DURATION_MS    = 1200;

/** Slowed applied by nullstone void-tendril hits. */
export const PLAYER_SLOWED_DURATION_MS    = 2000;

/** Time-Warped applied by iolite beam hits. */
export const PLAYER_TIMEWARP_DURATION_MS  = 3500;

/** DoT rates: damage per magnitude per second per tick. */
export const BURN_DPS_PER_MAG             = 0.4;
export const POISON_DPS_PER_MAG           = 0.2;

/** Movement speed multipliers for movement-impairing statuses. */
export const FROZEN_MOVEMENT_MULT         = 0.30;
export const SLOWED_MOVEMENT_MULT         = 0.55;
export const CHILLED_MAX_SLOW_FRAC        = 0.35;
export const CHILLED_MIN_SPEED            = 0.65;
export const STATUS_SPEED_FLOOR           = 0.25;

/** Attack-cadence multiplier while time-warped. */
export const TIMEWARP_CADENCE_MULT        = 0.75;

/** Status Resistance skill: 20% reduction per rank, floor at 40% of full duration. */
export const STATUS_RESISTANCE_PER_RANK   = 0.2;
export const STATUS_RESISTANCE_MIN_MULT   = 0.4;

/** Minimum effective duration after resistance (prevents instant-clear exploits). */
export const STATUS_MIN_DURATION_MS       = 300;

// ── Status Resistance skill ────────────────────────────────────────────────────

/**
 * Returns the duration multiplier from the Status Resistance skill.
 * Rank 0 → 1.0 (full duration), Rank 3 → 0.4 (60% reduction).
 */
export function getPlayerStatusDurationMultiplier(sim: RpgSimState): number {
  const rank = getSkillNodeRank(sim, 'status_resistance');
  return Math.max(STATUS_RESISTANCE_MIN_MULT, 1 - STATUS_RESISTANCE_PER_RANK * rank);
}

// ── Apply / refresh a player status ───────────────────────────────────────────

export interface PlayerStatusParams {
  key: PlayerStatusKey;
  durationMs: number;
  magnitude: number;
  tickEveryMs?: number;
  source?: string;
}

export function applyPlayerStatus(sim: RpgSimState, params: PlayerStatusParams): void {
  const resistMult = getPlayerStatusDurationMultiplier(sim);
  const effectiveDuration = Math.max(STATUS_MIN_DURATION_MS, params.durationMs * resistMult);
  const list = sim.activePlayerStatuses;

  // Frozen: only escalate from chilled; otherwise treat like any other status.
  // Refresh if already frozen; add fresh otherwise.
  const existing = list.find(s => s.key === params.key);
  if (existing) {
    existing.remainingMs = Math.max(existing.remainingMs, effectiveDuration);
    existing.magnitude   = Math.max(existing.magnitude, params.magnitude);
  } else {
    list.push({
      key: params.key,
      durationMs: effectiveDuration,
      remainingMs: effectiveDuration,
      magnitude: params.magnitude,
      tickEveryMs: params.tickEveryMs,
      tickMs: 0,
      source: params.source,
    });
  }
}

// ── Clear ──────────────────────────────────────────────────────────────────────

export function clearPlayerStatuses(sim: RpgSimState): void {
  sim.activePlayerStatuses.length = 0;
}

// ── Per-frame tick ─────────────────────────────────────────────────────────────

/**
 * Advances all active player statuses by deltaMs.
 * Handles DoT (burning, poisoned) and expiry.
 * onDotTick fires for each damage tick so the render layer can spawn a number.
 */
export function tickPlayerStatuses(
  sim: RpgSimState,
  playerStats: { hp: number; maxHp: number },
  deltaMs: number,
  onDotTick?: (key: PlayerStatusKey, dmg: number) => void,
): void {
  const list = sim.activePlayerStatuses;
  for (let i = list.length - 1; i >= 0; i--) {
    const s = list[i]!;
    s.remainingMs -= deltaMs;

    // DoT ticking (burning, poisoned)
    if (s.tickEveryMs && s.tickEveryMs > 0 && playerStats.hp > 0) {
      s.tickMs += deltaMs;
      while (s.tickMs >= s.tickEveryMs && playerStats.hp > 0) {
        s.tickMs -= s.tickEveryMs;
        let dmg = 0;
        if (s.key === 'burning') {
          dmg = s.magnitude * BURN_DPS_PER_MAG * (s.tickEveryMs / 1000);
        } else if (s.key === 'poisoned') {
          dmg = s.magnitude * POISON_DPS_PER_MAG * (s.tickEveryMs / 1000);
        }
        if (dmg > 0) {
          playerStats.hp = Math.max(0, playerStats.hp - dmg);
          onDotTick?.(s.key, dmg);
        }
      }
    }

    if (s.remainingMs <= 0) {
      list.splice(i, 1);
    }
  }
}

// ── Movement slow multiplier ───────────────────────────────────────────────────

/**
 * Returns the effective player movement speed multiplier from active statuses.
 * Frozen overrides everything and gives a very strong slow (0.3×).
 * Chilled: up to 35% slow (min 0.65×).
 * Slowed: 45% slow (0.55×).
 * Effects stack multiplicatively.
 */
export function getPlayerMovementStatusMultiplier(sim: RpgSimState): number {
  const list = sim.activePlayerStatuses;
  if (list.length === 0) return 1;

  if (list.some(s => s.key === 'frozen')) return FROZEN_MOVEMENT_MULT;

  let mult = 1;
  for (const s of list) {
    if (s.key === 'chilled') {
      const slow = Math.min(CHILLED_MAX_SLOW_FRAC, s.magnitude * 0.006);
      mult *= Math.max(CHILLED_MIN_SPEED, 1 - slow);
    } else if (s.key === 'slowed') {
      mult *= SLOWED_MOVEMENT_MULT;
    }
  }
  return Math.max(STATUS_SPEED_FLOOR, mult);
}

// ── Attack speed multiplier ────────────────────────────────────────────────────

/**
 * Returns a multiplier for attack cadence recovery from time-warped status.
 * Applied to dash cooldown recovery; weapon attack speed is unaffected for now.
 */
export function getPlayerAttackSpeedStatusMultiplier(sim: RpgSimState): number {
  if (sim.activePlayerStatuses.some(s => s.key === 'timeWarped')) return 0.75;
  return 1;
}

// ── Query helpers ──────────────────────────────────────────────────────────────

export function getActivePlayerStatuses(sim: RpgSimState): readonly ActivePlayerStatus[] {
  return sim.activePlayerStatuses;
}

export function hasPlayerStatus(sim: RpgSimState, key: PlayerStatusKey): boolean {
  return sim.activePlayerStatuses.some(s => s.key === key);
}
