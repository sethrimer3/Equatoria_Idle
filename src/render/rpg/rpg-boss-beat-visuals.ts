/**
 * rpg-boss-beat-visuals.ts — Beat-synced visual state for boss fights.
 *
 * Single source of truth for all beat-driven visual parameters.
 * All timing is derived from getBossBeatMs(bossId) — never hardcoded.
 *
 * Consumers (stage draw, attacks draw, debug overlay) call
 * getBossBeatVisualState(bossId, elapsedMs) once per frame and use the
 * returned primitives; they never call performance.now() independently.
 */

import { getBossBeatMs } from '../../data/rpg/boss-bpm';

// ── Tuning constants ──────────────────────────────────────────────────────────

/** Radial vignette pulse strength at the arena level — keep subtle. */
export const BOSS_STAGE_BEAT_PULSE_STRENGTH = 0.12;

/** Radius scale boost for boss projectile visuals on the beat. */
export const BOSS_BULLET_BEAT_PULSE_STRENGTH = 0.18;

/** Extra vignette/ring strength on every 4th beat (bar downbeat). */
export const BOSS_BAR_PULSE_STRENGTH = 0.28;

/** Multiplier applied to all pulse strengths in low-graphics mode. */
export const LOW_GRAPHICS_PULSE_MULTIPLIER = 0.4;

// ── Beat visual state ─────────────────────────────────────────────────────────

export interface BossBeatVisualState {
  /** Milliseconds per beat for this boss — getBossBeatMs(bossId). */
  beatMs: number;
  /** Integer beat counter since fight start. */
  beatIndex: number;
  /** Fractional position within the current beat, range [0, 1). */
  beatPhase: number;
  /** Decay envelope for the current beat: Math.pow(1 - beatPhase, 2.5), range [0, 1]. */
  beatPulse: number;
  /** beatPulse when beatIndex % 4 === 0, else 0. */
  barPulse: number;
  /** True on every 4th beat (bar downbeat). */
  isDownbeat: boolean;
}

/**
 * Returns the current beat visual state for a boss fight.
 *
 * @param bossId    Boss identifier — used only for getBossBeatMs(); unknown IDs
 *                  fall back to 60 BPM via getBossBeatMs so no throw occurs.
 * @param elapsedMs Accumulated fight time in ms (use bossAttackState.elapsedFightMs).
 */
export function getBossBeatVisualState(bossId: number, elapsedMs: number): BossBeatVisualState {
  const beatMs = getBossBeatMs(bossId);
  const beatIndex = Math.floor(elapsedMs / beatMs);
  const beatPhase = (elapsedMs % beatMs) / beatMs;
  const beatPulse = Math.pow(1 - beatPhase, 2.5);
  const isDownbeat = beatIndex % 4 === 0;
  const barPulse = isDownbeat ? beatPulse : 0;
  return { beatMs, beatIndex, beatPhase, beatPulse, barPulse, isDownbeat };
}
