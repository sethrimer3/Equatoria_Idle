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
import { applyLensStatus, incrementRiftScarredStacks } from './enemy-status-effects';

export interface ApplyLensStatusesResult {
  appliedAny: boolean;
  blockedByImmunity: boolean;
  affinityFeedback?: 'IMMUNE' | 'RESIST' | 'WEAK!';
}

/**
 * Apply all Tier 1 lens statuses to `enemy`, respecting affinities and
 * boss/elite overrides. Returns affinity feedback info for callers to render.
 *
 * Rift-Scarred stacks are not incremented when the target is immune to Rift-Scarred.
 */
export function applyTier1LensStatusesToEnemy(args: {
  enemy: object;
  lens: CraftedLensData;
  weaponId: string;
  hitDamage: number;
  enemyTypeId: string;
  /** Optional bonus scaling in percent. statusPowerPct=50 → magnitude/durationMs × 1.5. */
  statusPowerPct?: number;
}): ApplyLensStatusesResult {
  const { enemy, lens, weaponId, hitDamage, enemyTypeId, statusPowerPct } = args;
  const powerMult = 1 + (statusPowerPct ?? 0) / 100;
  const params = buildAllTier1StatusParams(lens, weaponId, hitDamage).map(p =>
    powerMult === 1 ? p : { ...p, magnitude: p.magnitude * powerMult, durationMs: p.durationMs * powerMult },
  );
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

    let scaled = mult === 1 ? p : { ...p, durationMs: p.durationMs * mult, magnitude: p.magnitude * mult };
    if (isBossElite) {
      if (scaled.key === 'riftScarred') {
        scaled = { ...scaled, riftScarredStackCap: ENEMY_RIFT_STACK_CAP_BOSS };
      } else if (scaled.key === 'fractalWound') {
        scaled = { ...scaled, fractalTickCount: ENEMY_FRAC_TICKS_BOSS };
      }
    }

    applyLensStatus(enemy, scaled);
    appliedAny = true;

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
