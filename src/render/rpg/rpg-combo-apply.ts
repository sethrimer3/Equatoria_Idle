/**
 * rpg-combo-apply.ts — Render-layer: apply combo results (damage + visuals).
 *
 * Imported by rpg-player-attack-single.ts and rpg-player-attack-aoe.ts.
 * Keeps visual/damage-application code out of the pure combo engine.
 */

import type { RpgPlayerAttackCtx } from './rpg-player-attack';
import type { ComboResult } from '../../sim/rpg/enemy-status-combos';
import { recordComboEvent } from '../../dev/rpg-combat-event-log';
import { AOE_ELITE_FAMILY_KEY, AOE_FAMILY_ROSTER } from './rpg-encounter-collections';

type MinEnemy = { x: number; y: number; hp: number; maxHp: number };

/**
 * Iterate the canonical AoE family roster from ctx and deal combo AoE damage
 * to those within radius of (cx, cy), skipping the primary enemy (already hit).
 * Returns total damage actually dealt across all hit enemies.
 */
function _applyAoeDmg(
  ctx: RpgPlayerAttackCtx,
  cx: number, cy: number, radius: number,
  dmg: number, skipEnemy: object, color: string,
): number {
  if (dmg <= 0 || radius <= 0) return 0;
  const rSq = radius * radius;
  let totalDealt = 0;

  const hit = (e: { x: number; y: number; hp: number; maxHp: number }): void => {
    if ((e as object) === skipEnemy || e.hp <= 0) return;
    const dx = e.x - cx, dy = e.y - cy;
    if (dx * dx + dy * dy <= rSq) {
      const before = e.hp;
      e.hp = Math.max(0, e.hp - dmg);
      const dealt = before - e.hp;
      totalDealt += dealt;
      ctx.spawnHitVisualsAt(e.x, e.y, e.maxHp, dealt, color);
    }
  };

  for (const { key } of AOE_FAMILY_ROSTER) {
    for (const e of ctx[key]) hit(e);
  }
  for (const e of ctx[AOE_ELITE_FAMILY_KEY]) hit(e);

  return totalDealt;
}

/**
 * Apply an array of combo results: deal primary damage, spawn feedback text,
 * apply AoE damage, and record into rpgSimState counters.
 */
export function applyComboResults(
  ctx: RpgPlayerAttackCtx,
  results: ComboResult[],
): void {
  if (results.length === 0) return;
  const state = ctx.rpgSimState;

  for (const r of results) {
    const e = r.primaryEnemy as MinEnemy;

    // Primary damage
    if (r.primaryDamage > 0 && e.hp > 0) {
      e.hp = Math.max(0, e.hp - r.primaryDamage);
      ctx.spawnDamageNumber(
        r.x, r.y, 0, -0.7,
        r.label,
        r.primaryDamage / Math.max(e.maxHp, 1),
        r.color,
      );
    }

    // AoE damage to nearby enemies
    let aoeDmgActual = 0;
    if (r.aoeDamage > 0) {
      aoeDmgActual = _applyAoeDmg(ctx, r.x, r.y, r.aoeRadius, r.aoeDamage, r.primaryEnemy, r.color);
    }

    // Combo burst visual effect
    ctx.spawnComboEffect(r.x, r.y, r.comboId, r.color);

    // Achievement counters (ephemeral, not saved)
    const primaryActual = r.primaryDamage > 0 && (r.primaryEnemy as MinEnemy).hp >= 0
      ? r.primaryDamage
      : 0;
    state.statusCombosTriggered += 1;
    state.statusComboDamageDealt += primaryActual + aoeDmgActual;

    // Dev event log (cheap ring buffer, safe to always call)
    recordComboEvent({
      timeMs: performance.now(),
      comboId: r.comboId,
      comboLabel: r.label,
      enemyTypeId: r.enemyTypeId,
      primaryDamage: primaryActual,
      aoeDamage: aoeDmgActual,
      triggerKind: r.triggerKind,
    });
  }
}
