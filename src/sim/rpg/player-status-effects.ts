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

// ── Status Resistance skill ────────────────────────────────────────────────────

/**
 * Returns the duration multiplier from the Status Resistance skill.
 * Rank 0 → 1.0 (full duration), Rank 3 → 0.4 (60% reduction).
 */
export function getPlayerStatusDurationMultiplier(sim: RpgSimState): number {
  const rank = getSkillNodeRank(sim, 'status_resistance');
  return Math.max(0.4, 1 - 0.2 * rank);
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
  const effectiveDuration = Math.max(300, params.durationMs * resistMult);
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

// ── DoT damage constants ───────────────────────────────────────────────────────

// Burn: ~0.4 damage per magnitude per second per tick.
// Poison: ~0.2 damage per magnitude per second per tick.
// With typical magnitude 10 and 1000ms ticks:
//   Burn = 4 dmg/tick, Poison = 2 dmg/tick — noticeable but not lethal solo.
const BURN_DPS_PER_MAG   = 0.4;
const POISON_DPS_PER_MAG = 0.2;

// ── Per-frame tick ─────────────────────────────────────────────────────────────

export function tickPlayerStatuses(
  sim: RpgSimState,
  playerStats: { hp: number; maxHp: number },
  deltaMs: number,
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

  if (list.some(s => s.key === 'frozen')) return 0.30;

  let mult = 1;
  for (const s of list) {
    if (s.key === 'chilled') {
      const slow = Math.min(0.35, s.magnitude * 0.006);
      mult *= Math.max(0.65, 1 - slow);
    } else if (s.key === 'slowed') {
      mult *= 0.55;
    }
  }
  return Math.max(0.25, mult);
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
