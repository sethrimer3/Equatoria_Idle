/**
 * weave-proc-effects.ts — Runtime helpers for weave proc buff triggering and ticking.
 *
 * tryTriggerPlayerDamagedWeaveEffects: call from onPlayerDamaged (dmg > 0).
 * tryTriggerPlayerHitEnemyWeaveEffects: call after a real weapon hit (dmg > 0).
 * tickActiveWeaveBuffs: call each frame before runRpgUpdate.
 * getTotalActiveWeaveBuffPct: call to sum any stat's active buff contributions.
 * getTotalActiveWeaveBuffDefPct: compat wrapper for playerDefensePct.
 * getTotalActiveWeaveBuffCooldownPct: helper for cooldown reduction from active buffs.
 */

import type { RpgSimState, ActiveWeaveBuff } from '../../sim/rpg/rpg-state';
import type { ActiveWeaveBuffStat } from '../../sim/rpg/rpg-state';
import { WEAVE_PROC_EFFECT_REGISTRY } from './weave-effects-registry';

// ─── Trigger ──────────────────────────────────────────────────────────────────

/**
 * Checks each equipped weave for proc effects triggered by playerDamaged.
 * Rolls each eligible effect independently and pushes buffs into state.
 *
 * Returns the ids of newly triggered effects (empty array = nothing triggered).
 * Caller should re-apply stats if non-empty, and can use the ids to spawn VFX.
 */
export function tryTriggerPlayerDamagedWeaveEffects(
  state: RpgSimState,
  rng: () => number = Math.random,
): string[] {
  const { equippedWeaveSlots, craftedWeaves } = state;
  const weaveById = new Map(craftedWeaves.map(w => [w.id, w]));
  const triggered: string[] = [];

  for (const slotId of equippedWeaveSlots) {
    if (!slotId) continue;
    const weave = weaveById.get(slotId);
    if (!weave) continue;

    for (const effect of weave.effects ?? []) {
      const def = WEAVE_PROC_EFFECT_REGISTRY[effect.id as keyof typeof WEAVE_PROC_EFFECT_REGISTRY];
      if (!def || def.trigger !== 'playerDamaged') continue;
      if (rng() * 100 >= def.baseChancePct) continue;

      // Reactive Ward is a defense buff; refresh or add.
      const existing = state.activeWeaveBuffs.find(b => b.effectId === effect.id);
      if (existing) {
        existing.remainingMs = def.durationMs;
      } else {
        const buff: ActiveWeaveBuff = {
          effectId: effect.id,
          statKey: 'playerDefensePct',
          valuePct: effect.value,
          remainingMs: def.durationMs,
        };
        state.activeWeaveBuffs.push(buff);
      }
      triggered.push(effect.id);
    }
  }

  return triggered;
}

// ─── playerHitEnemy proc trigger ─────────────────────────────────────────────

/**
 * Checks equipped weaves for `playerHitEnemy` proc effects.
 * Handles two kinds:
 *   - Instant damage procs (weave_echo_strike): calls applyBonusDmg callback.
 *   - Temp buff procs (weave_swiftstrike): adds or refreshes an active buff.
 *
 * Multiple Swiftstrike weaves roll independently. If the same effectId is
 * already in activeWeaveBuffs, duration is refreshed and value kept at the
 * stronger of the existing vs new value. This prevents unlimited buff stacking
 * from a single source while allowing natural refresh on repeated procs.
 *
 * @param state          - Current rpg sim state.
 * @param finalDmg       - Actual damage dealt by the triggering hit (post-DEF).
 * @param applyBonusDmg  - Called with computed bonus HP damage; caller must reduce enemy HP.
 * @param rng            - RNG function (default Math.random, injectable for tests).
 */
export function tryTriggerPlayerHitEnemyWeaveEffects(
  state: RpgSimState,
  finalDmg: number,
  applyBonusDmg: (bonus: number) => void,
  rng: () => number = Math.random,
): string[] {
  if (finalDmg <= 0) return [];

  const { equippedWeaveSlots, craftedWeaves } = state;
  const weaveById = new Map(craftedWeaves.map(w => [w.id, w]));
  const triggered: string[] = [];

  for (const slotId of equippedWeaveSlots) {
    if (!slotId) continue;
    const weave = weaveById.get(slotId);
    if (!weave) continue;

    for (const effect of weave.effects ?? []) {
      const def = WEAVE_PROC_EFFECT_REGISTRY[effect.id as keyof typeof WEAVE_PROC_EFFECT_REGISTRY];
      if (!def || def.trigger !== 'playerHitEnemy') continue;
      if (rng() * 100 >= def.baseChancePct) continue;

      if (def.durationMs > 0) {
        // Temp buff proc (e.g. weave_swiftstrike): add or refresh active buff.
        // Same effectId: refresh duration, keep the stronger value.
        const existing = state.activeWeaveBuffs.find(b => b.effectId === effect.id);
        if (existing) {
          existing.remainingMs = def.durationMs;
          if (effect.value > existing.valuePct) existing.valuePct = effect.value;
        } else {
          const buff: ActiveWeaveBuff = {
            effectId: effect.id,
            statKey: 'cooldownPct',
            valuePct: effect.value,
            remainingMs: def.durationMs,
          };
          state.activeWeaveBuffs.push(buff);
        }
      } else {
        // Instant damage proc (e.g. weave_echo_strike): no buff, apply bonus damage.
        const bonus = finalDmg * (effect.value / 100);
        applyBonusDmg(bonus);
      }

      triggered.push(effect.id);
    }
  }

  return triggered;
}

// ─── Tick ─────────────────────────────────────────────────────────────────────

/**
 * Decrements buff durations by deltaMs. Removes expired buffs.
 * Returns true if any buff expired (caller should re-apply stats).
 */
export function tickActiveWeaveBuffs(state: RpgSimState, deltaMs: number): boolean {
  const before = state.activeWeaveBuffs.length;
  state.activeWeaveBuffs = state.activeWeaveBuffs
    .map(b => ({ ...b, remainingMs: b.remainingMs - deltaMs }))
    .filter(b => b.remainingMs > 0);
  return state.activeWeaveBuffs.length < before;
}

// ─── Stat aggregation ─────────────────────────────────────────────────────────

/** Returns the total percent contribution from all active weave buffs for the given stat. */
export function getTotalActiveWeaveBuffPct(state: RpgSimState, statKey: ActiveWeaveBuffStat): number {
  return state.activeWeaveBuffs
    .filter(b => b.statKey === statKey)
    .reduce((sum, b) => sum + b.valuePct, 0);
}

/** Returns the total DEF% bonus from all currently active weave buffs. */
export function getTotalActiveWeaveBuffDefPct(state: RpgSimState): number {
  return getTotalActiveWeaveBuffPct(state, 'playerDefensePct');
}

/** Returns the total cooldown reduction % from all currently active weave buffs. */
export function getTotalActiveWeaveBuffCooldownPct(state: RpgSimState): number {
  return getTotalActiveWeaveBuffPct(state, 'cooldownPct');
}

/** Returns the total weapon damage % bonus from all currently active weave buffs. */
export function getTotalActiveWeaveBuffWeaponDamagePct(state: RpgSimState): number {
  return getTotalActiveWeaveBuffPct(state, 'weaponDamagePct');
}
