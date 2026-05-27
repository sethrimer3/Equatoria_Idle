/**
 * rpg-health-bar.ts - Shared RPG enemy health-bar visibility rules.
 */

export const ENEMY_HEALTH_BAR_VISIBLE_THRESHOLD = 0.9995;

export function enemyHealthFraction(e: { hp: number; maxHp: number }): number {
  return e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;
}

export function shouldDrawEnemyHealthBar(e: { hp: number; maxHp: number }): boolean {
  return enemyHealthFraction(e) < ENEMY_HEALTH_BAR_VISIBLE_THRESHOLD;
}
