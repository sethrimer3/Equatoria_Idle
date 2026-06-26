/**
 * enemy-status-application.ts — Shared helper for applying Tier 1 lens statuses
 * to an enemy with full affinity scaling and boss/elite overrides.
 *
 * Used by both single-target and AoE attack handlers so the logic is not
 * duplicated. Render-free: returns affinity feedback info without spawning visuals.
 */

import type { CraftedLensData } from '../../data/rpg/lens-types';
import { buildAllTier1StatusParams } from '../../data/rpg/lens-status-effects';
import { getEnemyStatusAffinityMultiplier, isBossOrEliteType } from '../../data/rpg/enemy-status-affinities';
import { ENEMY_RIFT_STACK_CAP_BOSS, ENEMY_FRAC_TICKS_BOSS } from '../../data/rpg/status-balance';
import { applyLensStatus, incrementRiftScarredStacks, hasStatus } from './enemy-status-effects';

// Flag guard: prevents recursive ember overload triggers within the same status application
let _emberOverloadActive = false;

export interface ApplyLensStatusesResult {
  appliedAny: boolean;
  blockedByImmunity: boolean;
  affinityFeedback?: 'IMMUNE' | 'RESIST' | 'WEAK!';
}

/**
 * Apply all Tier 1 lens statuses to `enemy`, respecting affinities and
 * boss/elite overrides. Returns affinity feedback info for callers to render.
 *
 * @param statusPowerPct  Optional bonus from equipped weaves/lenses (statusChancePct field).
 *                        Scales the magnitude and duration of every applied status by
 *                        (1 + statusPowerPct/100). Conservative cap at 75% per clampCombatModifiers.
 *
 * Rift-Scarred stacks are not incremented when the target is immune to Rift-Scarred.
 */
export function applyTier1LensStatusesToEnemy(args: {
  enemy: object;
  lens: CraftedLensData;
  weaponId: string;
  hitDamage: number;
  enemyTypeId: string;
  statusPowerPct?: number;
  /** Ember Surge T1: multiplier applied to durationMs (1.0 = no bonus). */
  emberDurationMult?: number;
  /** Ember Surge T2: multiplier applied to magnitude (1.0 = no bonus). */
  emberPotencyMult?: number;
  /** Ember Surge T3: % chance to overload a status that's already active. */
  emberOverloadChancePct?: number;
}): ApplyLensStatusesResult {
  const { enemy, lens, weaponId, hitDamage, enemyTypeId, statusPowerPct,
          emberDurationMult = 1, emberPotencyMult = 1, emberOverloadChancePct = 0 } = args;
  const statusPowerMult = statusPowerPct && statusPowerPct > 0 ? 1 + statusPowerPct / 100 : 1;
  const params = buildAllTier1StatusParams(lens, weaponId, hitDamage);
  const isBossElite = isBossOrEliteType(enemyTypeId);

  let appliedAny = false;
  let blockedByImmunity = false;
  let affinityFeedback: ApplyLensStatusesResult['affinityFeedback'];
  let feedbackShown = false;

  for (const p of params) {
    const mult = getEnemyStatusAffinityMultiplier(enemyTypeId, p.key);
    if (mult === 0) {
      blockedByImmunity = true;
      if (!feedbackShown) {
        affinityFeedback = 'IMMUNE';
        feedbackShown = true;
      }
      continue;
    }

    const affinityAndPower = mult * statusPowerMult;
    let scaled = affinityAndPower === 1 ? p : { ...p, durationMs: p.durationMs * affinityAndPower, magnitude: p.magnitude * affinityAndPower };
    // Ember Surge T1/T2: duration and potency bonuses
    if (emberDurationMult > 1) scaled = { ...scaled, durationMs: scaled.durationMs * emberDurationMult };
    if (emberPotencyMult > 1)  scaled = { ...scaled, magnitude:  scaled.magnitude  * emberPotencyMult };
    if (isBossElite) {
      if (scaled.key === 'riftScarred') {
        scaled = { ...scaled, riftScarredStackCap: ENEMY_RIFT_STACK_CAP_BOSS };
      } else if (scaled.key === 'fractalWound') {
        scaled = { ...scaled, fractalTickCount: ENEMY_FRAC_TICKS_BOSS };
      }
    }

    // Ember Surge T3: overload a status that's already active (refresh + 50% bonus)
    const canOverload = emberOverloadChancePct > 0 && !_emberOverloadActive && hasStatus(enemy, p.key);
    applyLensStatus(enemy, scaled);
    appliedAny = true;
    if (canOverload && Math.random() * 100 < emberOverloadChancePct) {
      _emberOverloadActive = true;
      try {
        applyLensStatus(enemy, { ...scaled, durationMs: scaled.durationMs * 1.5, magnitude: scaled.magnitude * 1.5 });
      } finally {
        _emberOverloadActive = false;
      }
    }

    if (!feedbackShown && mult !== 1) {
      affinityFeedback = mult > 1 ? 'WEAK!' : 'RESIST';
      feedbackShown = true;
    }
  }

  // Increment Rift-Scarred stacks only when the lens has an eigenstein effect
  // AND the target is not immune to Rift-Scarred.
  const hasRiftEffect = lens.effects.some(e => e.effectTier === 1 && e.tierId === 'eigenstein');
  if (hasRiftEffect) {
    const riftMult = getEnemyStatusAffinityMultiplier(enemyTypeId, 'riftScarred');
    if (riftMult !== 0) incrementRiftScarredStacks(enemy, lens.id);
  }

  return { appliedAny, blockedByImmunity, affinityFeedback };
}
