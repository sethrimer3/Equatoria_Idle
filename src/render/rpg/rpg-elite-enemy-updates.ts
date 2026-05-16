/**
 * rpg-elite-enemy-updates.ts — Per-frame update dispatcher for all elite polygon enemies.
 *
 * Each elite type (quartz through nullstone) has unique attack behaviors that
 * reuse existing projectile arrays (quartzSpikes, rubyBolts, citrineBolts,
 * amethystShards, diamondShards, voidTendrils).
 *
 * Per-tier update functions are split across two sub-modules:
 *   rpg-elite-enemy-updates-early.ts — Quartz, Ruby, Sunstone, Citrine
 *   rpg-elite-enemy-updates-late.ts  — Iolite, Amethyst, Diamond, Nullstone
 *
 * This file owns the main dispatcher: updateEliteEnemies().
 * Helpers and EliteEnemyCtx live in rpg-elite-enemy-helpers.ts.
 */

import type { EliteEnemy } from './rpg-enemy-types';
import { TARGET_FRAME_MS } from './rpg-constants';
import { type EliteEnemyCtx } from './rpg-elite-enemy-helpers';
import { updateEliteQuartz, updateEliteRuby, updateEliteSunstone, updateEliteCitrine } from './rpg-elite-enemy-updates-early';
import { updateEliteIolite, updateEliteAmethyst, updateEliteDiamond, updateEliteNullstone } from './rpg-elite-enemy-updates-late';

// Re-export EliteEnemyCtx so rpg-render.ts can import it from either file.
export type { EliteEnemyCtx };

// ── Main dispatcher ───────────────────────────────────────────────────────────

export function updateEliteEnemies(
  eliteEnemies: EliteEnemy[],
  ctx: EliteEnemyCtx,
  deltaMs: number,
): void {
  const dt = Math.min(deltaMs / TARGET_FRAME_MS, 3);
  const { mote } = ctx;

  for (const enemy of eliteEnemies) {
    enemy.pulseMs += deltaMs;
    const toPlayerAngle = Math.atan2(mote.y - enemy.y, mote.x - enemy.x);

    switch (enemy.tier) {
      case 'quartz':    updateEliteQuartz   (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'ruby':      updateEliteRuby     (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'sunstone':  updateEliteSunstone (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'citrine':   updateEliteCitrine  (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'iolite':    updateEliteIolite   (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'amethyst':  updateEliteAmethyst (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'diamond':   updateEliteDiamond  (enemy, ctx, dt, deltaMs, toPlayerAngle); break;
      case 'nullstone': updateEliteNullstone(enemy, ctx, dt, deltaMs, toPlayerAngle); break;
    }
  }
}

