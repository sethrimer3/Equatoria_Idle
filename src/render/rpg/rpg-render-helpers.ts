import { resolveWeaponDefinition } from '../../data/rpg/crafted-weapon-helpers';
import {
  getLuckPercent,
  getEffectiveXpLuckBonus,
  type RpgSimState,
} from '../../sim/rpg/rpg-state';

export function createCachedLuckPercentGetter(rpgSimState: RpgSimState): () => number {
  let cachedLuckXp = -1;
  let cachedLuckPct = 0;
  return () => {
    if (rpgSimState.xp !== cachedLuckXp) {
      cachedLuckXp = rpgSimState.xp;
      cachedLuckPct = getLuckPercent(rpgSimState.xp) + getEffectiveXpLuckBonus(rpgSimState);
    }
    return cachedLuckPct;
  };
}

export function findEquippedWeaponIdByEffect(
  effectKind: string,
  equippedWeaponIds: Iterable<string>,
): string | null {
  for (const weaponId of equippedWeaponIds) {
    const wd = resolveWeaponDefinition(weaponId);
    if (wd?.stats.effect?.kind === effectKind) return weaponId;
  }
  return null;
}

/**
 * Clamps an enemy entity within viewport world bounds, reversing and damping
 * velocity on each axis that hit an edge.
 *
 * All four parameters are *world-space* coordinates (not CSS pixels):
 *   left/top are the world coords of the viewport top-left corner (may be < 0
 *   when the canvas is wider/taller than the 360×640 safe core).
 *   right/bottom are the world coords of the viewport bottom-right corner.
 */
export function clampEnemyToBounds(
  enemy: { x: number; y: number; vx: number; vy: number },
  left: number,
  top: number,
  right: number,
  bottom: number,
): void {
  const half = 2.5; // Conservative margin that works for all enemy sizes
  if (enemy.x < left + half)    { enemy.x = left + half;    enemy.vx =  Math.abs(enemy.vx) * 0.5; }
  if (enemy.x > right - half)   { enemy.x = right - half;   enemy.vx = -Math.abs(enemy.vx) * 0.5; }
  if (enemy.y < top + half)     { enemy.y = top + half;     enemy.vy =  Math.abs(enemy.vy) * 0.5; }
  if (enemy.y > bottom - half)  { enemy.y = bottom - half;  enemy.vy = -Math.abs(enemy.vy) * 0.5; }
}
