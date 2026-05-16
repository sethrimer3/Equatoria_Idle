import { WEAPON_BY_ID } from '../../data/rpg/weapon-definitions';
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
    const wd = WEAPON_BY_ID.get(weaponId);
    if (wd?.stats.effect?.kind === effectKind) return weaponId;
  }
  return null;
}

export function clampEnemyToBounds(
  enemy: { x: number; y: number; vx: number; vy: number },
  widthPx: number,
  heightPx: number,
): void {
  const half = 2.5; // Conservative margin that works for all enemy sizes
  if (enemy.x < half)             { enemy.x = half;             enemy.vx = Math.abs(enemy.vx) * 0.5; }
  if (enemy.x > widthPx - half)   { enemy.x = widthPx - half;   enemy.vx = -Math.abs(enemy.vx) * 0.5; }
  if (enemy.y < half)             { enemy.y = half;             enemy.vy = Math.abs(enemy.vy) * 0.5; }
  if (enemy.y > heightPx - half)  { enemy.y = heightPx - half;  enemy.vy = -Math.abs(enemy.vy) * 0.5; }
}
