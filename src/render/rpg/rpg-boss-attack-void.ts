import type { BossEnemy } from './rpg-enemy-types';

/** Boss hazards pass through this boss-centered sanctuary without rendering or damaging the player. */
export const BOSS_ATTACK_VOID_RADIUS = 68;

export function isPointInBossAttackVoid(px: number, py: number, bossX: number, bossY: number): boolean {
  const dx = px - bossX;
  const dy = py - bossY;
  return dx * dx + dy * dy <= BOSS_ATTACK_VOID_RADIUS * BOSS_ATTACK_VOID_RADIUS;
}

export function isPlayerInBossAttackVoid(px: number, py: number, boss: BossEnemy | null): boolean {
  return boss !== null && isPointInBossAttackVoid(px, py, boss.x, boss.y);
}

/** Clips the current canvas state so boss hazards are not rendered in the sanctuary. */
export function clipBossAttackVoid(ctx: CanvasRenderingContext2D, boss: BossEnemy | null): void {
  if (!boss) return;
  ctx.beginPath();
  ctx.rect(-1, -1, ctx.canvas.width + 2, ctx.canvas.height + 2);
  ctx.arc(boss.x, boss.y, BOSS_ATTACK_VOID_RADIUS, 0, Math.PI * 2);
  ctx.clip('evenodd');
}
