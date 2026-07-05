/**
 * rpg-player-contact-damage.ts — Speed Upgrade contact damage.
 *
 * The Speed skill deals a percentage of recent non-contact player DPS to enemies
 * touching the player, capped at 10 ticks per second.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { getRpgContactDamageMultiplier } from '../../sim/rpg/rpg-state';
import type { ClosestTarget } from './rpg-types';
import { PLAYER_HIT_RADIUS } from './rpg-constants';

export const SPEED_CONTACT_DAMAGE_SOURCE_ID = 'skill_speed';

const CONTACT_TICK_MS = 100;
const CONTACT_RADIUS_PX = PLAYER_HIT_RADIUS + 8;
const CONTACT_RADIUS_SQ = CONTACT_RADIUS_PX * CONTACT_RADIUS_PX;
const CONTACT_TICKS_PER_SECOND = 1000 / CONTACT_TICK_MS;
const MAX_CATCHUP_TICKS = 3;

export interface PlayerContactDamageState {
  tickAccumulatorMs: number;
}

export interface PlayerContactDamageCtx {
  rpgSimState: RpgSimState;
  getTotalPlayerDps(): number;
  collectEnemyBodyTargets(): ClosestTarget[];
  damageBodyTarget(target: ClosestTarget, rawDamage: number, defPierceRatio: number, bypassShield: boolean): number;
  withDamageSource<T>(sourceId: string, fn: () => T): T;
  spawnHitVisualsAt(tx: number, ty: number, maxHp: number, dmg: number, color: string, sourceColor?: string): void;
  removeDeadEnemies(): void;
  checkWaveCompletion(): void;
}

export function createPlayerContactDamageState(): PlayerContactDamageState {
  return { tickAccumulatorMs: 0 };
}

export function tickPlayerContactDamage(
  ctx: PlayerContactDamageCtx,
  state: PlayerContactDamageState,
  deltaMs: number,
): void {
  const damageMultiplier = getRpgContactDamageMultiplier(ctx.rpgSimState);
  if (damageMultiplier <= 0) {
    state.tickAccumulatorMs = 0;
    return;
  }

  state.tickAccumulatorMs += deltaMs;
  const availableTicks = Math.floor(state.tickAccumulatorMs / CONTACT_TICK_MS);
  if (availableTicks <= 0) return;

  const tickCount = Math.min(availableTicks, MAX_CATCHUP_TICKS);
  state.tickAccumulatorMs -= tickCount * CONTACT_TICK_MS;

  const totalDps = ctx.getTotalPlayerDps();
  const damagePerTick = (totalDps * damageMultiplier) / CONTACT_TICKS_PER_SECOND;
  if (damagePerTick <= 0) return;

  for (let tick = 0; tick < tickCount; tick++) {
    const targets = ctx.collectEnemyBodyTargets();
    let dealtAnyDamage = false;

    ctx.withDamageSource(SPEED_CONTACT_DAMAGE_SOURCE_ID, () => {
      for (const target of targets) {
        if (target.distSq > CONTACT_RADIUS_SQ) continue;
        const dmg = ctx.damageBodyTarget(target, damagePerTick, 1, true);
        if (dmg <= 0) continue;
        dealtAnyDamage = true;
        const maxHp = getTargetMaxHp(target) ?? Math.max(1, dmg);
        ctx.spawnHitVisualsAt(target.x, target.y, maxHp, dmg, '#ffd060', '#40d4e0');
      }
    });

    if (dealtAnyDamage) {
      ctx.removeDeadEnemies();
      ctx.checkWaveCompletion();
    }
  }
}

function getTargetMaxHp(target: ClosestTarget): number | null {
  for (const value of Object.values(target)) {
    if (hasMaxHp(value)) return value.maxHp;
  }
  return null;
}

function hasMaxHp(value: unknown): value is { maxHp: number } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'maxHp' in value &&
    typeof (value as { maxHp?: unknown }).maxHp === 'number'
  );
}
