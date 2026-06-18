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
import {
  applyLensStatus, hasStatus, incrementRiftScarredStacks,
} from './enemy-status-effects';

export interface ApplyLensStatusesResult {
  appliedAny: boolean;
  blockedByImmunity: boolean;
  affinityFeedback?: 'IMMUNE' | 'RESIST' | 'WEAK!';
}

/**
 * Apply all Tier 1 lens statuses to `enemy`, respecting affinities and
 * boss/elite overrides. Returns affinity feedback info for callers to render.
 */
export function applyTier1LensStatusesToEnemy(args: {
  enemy: object;
  lens: CraftedLensData;
  weaponId: string;
  hitDamage: number;
  enemyTypeId: string;
}): ApplyLensStatusesResult {
  const { enemy, lens, weaponId, hitDamage, enemyTypeId } = args;
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

    // Rift-Scarred immune check: skip stack increment if immune
    if (p.key === 'riftScarred' && mult === 0) continue;

    let scaled = mult === 1 ? p : { ...p, durationMs: p.durationMs * mult, magnitude: p.magnitude * mult };
    if (isBossElite) {
      if (scaled.key === 'riftScarred') {
        scaled = { ...scaled, riftScarredStackCap: ENEMY_RIFT_STACK_CAP_BOSS };
      } else if (scaled.key === 'fractalWound') {
        scaled = { ...scaled, fractalTickCount: ENEMY_FRAC_TICKS_BOSS };
      }
    }

    const hadRiftBefore = scaled.key === 'riftScarred' ? hasStatus(enemy, 'riftScarred') : false;
    applyLensStatus(enemy, scaled);
    appliedAny = true;

    // Increment Rift-Scarred stacks only when it actually applied (not blocked by immunity)
    if (scaled.key === 'riftScarred') {
      // Check if the rift effect source is eigenstein lens (Rift-Scarred comes from eigenstein tier)
      const hasEigensteinEffect = lens.effects.some(e => e.effectTier === 1 && e.tierId === 'eigenstein');
      if (hasEigensteinEffect) {
        // Only increment if riftScarred was successfully applied (mult != 0)
        if (mult !== 0) incrementRiftScarredStacks(enemy, lens.id);
      }
      void hadRiftBefore; // acknowledged
    }

    if (!feedbackShown && mult !== 1) {
      affinityFeedback = mult > 1 ? 'WEAK!' : 'RESIST';
      feedbackShown = true;
    }
  }

  // Handle eigenstein rift stack increment for non-riftScarred param paths
  // (original code checked lens.effects separately; replicate that here for lenses
  // whose rift-scarred param key may differ)
  const hasRiftEffect = lens.effects.some(e => e.effectTier === 1 && e.tierId === 'eigenstein');
  const hasRiftScarredParam = params.some(p => p.key === 'riftScarred');
  if (hasRiftEffect && !hasRiftScarredParam) {
    // eigenstein lens but no riftScarred param built — still increment stacks if not immune
    const mult = getEnemyStatusAffinityMultiplier(enemyTypeId, 'riftScarred');
    if (mult !== 0) incrementRiftScarredStacks(enemy, lens.id);
  }

  return { appliedAny, blockedByImmunity, affinityFeedback };
}
