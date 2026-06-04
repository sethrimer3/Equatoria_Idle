/**
 * lens-status-effects.ts — Helpers that translate Tier 1 LensEffects into
 * combat status parameters for enemy-status-effects.ts.
 *
 * Tier 2 and Tier 3 effects are intentionally ignored — they remain STUB.
 */

import type { TierId } from '../tiers';
import type { LensEffect, CraftedLensData } from './lens-types';
import type { EnemyStatusKey, LensStatusParams } from '../../sim/rpg/enemy-status-effects';

// ── Tier 1 status map ─────────────────────────────────────────────────────────

/** Maps lens tier → enemy status key for Tier 1 effects. */
export const TIER1_STATUS_MAP: Partial<Record<TierId, EnemyStatusKey>> = {
  sand:       'abraded',
  quartz:     'refracted',
  ruby:       'burning',
  citrine:    'radiant',
  emerald:    'poisoned',
  sapphire:   'chilled',
  iolite:     'timeWarped',
  amethyst:   'echoMarked',
  diamond:    'cracked',
  nullstone:  'gravitized',
  fracteryl:  'fractalWound',
  eigenstein: 'riftScarred',
};

// ── Duration helpers ──────────────────────────────────────────────────────────

export function getStatusDurationMs(tierId: TierId): number {
  switch (tierId) {
    case 'ruby':       return 4000;   // Burning
    case 'emerald':    return 6000;   // Poisoned (longer)
    case 'fracteryl':  return 3600;   // Fractal Wound (4 ticks × 600ms + buffer)
    case 'eigenstein': return 30000;  // Rift-Scarred (long, resets on enemy death)
    case 'amethyst':   return 1000;   // Echo-Marked (just the echo window)
    default:           return 3500;   // Generic vulnerability/slow
  }
}

/** Tick interval in ms for DoT statuses. */
export function getStatusTickMs(tierId: TierId): number | undefined {
  switch (tierId) {
    case 'ruby':      return 1000;  // Burning ticks every 1s
    case 'emerald':   return 1000;  // Poisoned ticks every 1s
    case 'fracteryl': return 600;   // Fractal Wound ticks every 600ms
    default:          return undefined;
  }
}

// ── Status params builder ─────────────────────────────────────────────────────

/**
 * Converts a Tier 1 LensEffect into LensStatusParams ready for applyLensStatus().
 * Returns null for non-Tier-1 effects or unrecognised tiers (e.g. sunstone).
 *
 * @param effect     The lens effect to convert.
 * @param lens       The parent lens (provides id).
 * @param weaponId   The weapon the lens is attached to.
 * @param hitDamage  The base weapon damage of the triggering hit (used for echo calc).
 */
export function buildStatusParams(
  effect: LensEffect,
  lens: CraftedLensData,
  weaponId: string,
  hitDamage: number,
): LensStatusParams | null {
  if (effect.effectTier !== 1) return null;
  const key = TIER1_STATUS_MAP[effect.tierId];
  if (!key) return null;

  const tierId = effect.tierId;
  const durationMs = getStatusDurationMs(tierId);
  const tickEveryMs = getStatusTickMs(tierId);

  const base: LensStatusParams = {
    key,
    sourceTierId: tierId,
    sourceLensId: lens.id,
    sourceWeaponId: weaponId,
    durationMs,
    magnitude: effect.magnitude,
    tickEveryMs,
  };

  if (key === 'echoMarked') {
    const echoPct = Math.min(0.40, effect.magnitude * 0.015);
    base.echoDamage = Math.max(0, hitDamage * echoPct);
  }

  if (key === 'fractalWound') {
    base.fractalInitialDamage = Math.max(0, effect.magnitude * 0.5);
  }

  return base;
}

/**
 * Returns all Tier 1 status params for an attached lens, ready to apply.
 * Tier 2 and Tier 3 effects are silently skipped.
 */
export function buildAllTier1StatusParams(
  lens: CraftedLensData,
  weaponId: string,
  hitDamage: number,
): LensStatusParams[] {
  const result: LensStatusParams[] = [];
  for (const effect of lens.effects) {
    const p = buildStatusParams(effect, lens, weaponId, hitDamage);
    if (p) result.push(p);
  }
  return result;
}
