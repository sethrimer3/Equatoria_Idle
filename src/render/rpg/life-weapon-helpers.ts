/**
 * life-weapon-helpers.ts — Small, dependency-light helpers shared by weapon
 * systems that need to recognize Life-zone cells among generic
 * `ClosestTarget` body targets.
 *
 * Life cells are the enemies. `life_core` only exists as a target kind for a
 * possible future core-bearing variant (no shipped Life field ever emits one
 * — see LifeColonyController in life-types.ts) but these helpers still
 * recognize it so that mechanism keeps working if it's ever wired up.
 *
 * Several weapon modes (chain whip, emerald missiles, nullstone vortex,
 * orbit projectiles, etc.) filter `collectEnemyBodyTargets()` results down to
 * a specific subset of `TargetKind`s before applying per-target damage or
 * cooldowns. Historically those filters only recognized `proc_*` and
 * `verdure_*` kinds, silently skipping `life_cell`/`life_core` targets even
 * though `collectEnemyBodyTargets` already emits them. These helpers give
 * every such filter a single, consistent way to opt Life targets in.
 */

import type { ClosestTarget } from './rpg-types';

/** True when a ClosestTarget is an individual Life-zone cell (the enemy), or — only for a future core-bearing variant — a colony core. */
export function isLifeBodyTarget(target: ClosestTarget): boolean {
  return target.kind === 'life_cell' || target.kind === 'life_core';
}

/**
 * Resolves a Life-zone ClosestTarget to a stable object identity (for
 * per-target hit-cooldown maps, which key off object reference) plus a
 * `maxHp` for damage-number scaling. Returns null for non-Life targets.
 */
export function getLifeTargetBody(target: ClosestTarget): { ref: object; maxHp: number } | null {
  if (target.lifeCell) return { ref: target.lifeCell, maxHp: target.lifeCell.maxHp };
  if (target.lifeCoreColony) return { ref: target.lifeCoreColony, maxHp: target.lifeCoreColony.coreMaxHp };
  return null;
}
