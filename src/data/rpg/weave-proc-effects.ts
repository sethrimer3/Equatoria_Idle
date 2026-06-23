/**
 * weave-proc-effects.ts — Runtime helpers for weave proc buff triggering and ticking.
 *
 * tryTriggerPlayerDamagedWeaveEffects: call from onPlayerDamaged (dmg > 0).
 * tryTriggerPlayerHitEnemyWeaveEffects: call after a real weapon hit (dmg > 0).
 * tickActiveWeaveBuffs: call each frame before runRpgUpdate.
 * getTotalActiveWeaveBuffPct: call to sum any stat's active buff contributions.
 * getTotalActiveWeaveBuffDefPct: compat wrapper for playerDefensePct.
 * getTotalActiveWeaveBuffCooldownPct: helper for cooldown reduction from active buffs.
 * getTotalActiveWeaveBuffWeaponDamagePct: helper for weapon damage bonus from active buffs.
 */

import type { RpgSimState, ActiveWeaveBuff, ActiveWeaveBuffStat } from '../../sim/rpg/rpg-state';
import { WEAVE_PROC_EFFECT_REGISTRY, getWeaveEffectDef } from './weave-effects-registry';
import type { WeaveProcEffectId } from './weave-effects-registry';
import { recordEquipmentProcEvent } from '../../dev/equipment-proc-log';

/**
 * Maps each buff-granting playerHitEnemy proc effectId to the stat it modifies.
 * Instant procs (durationMs === 0, e.g. weave_echo_strike) are not listed here —
 * they call applyBonusDmg directly and never create an ActiveWeaveBuff.
 */
const HIT_BUFF_STAT_MAP: Readonly<Partial<Record<WeaveProcEffectId, ActiveWeaveBuffStat>>> = {
  weave_swiftstrike: 'cooldownPct',
  weave_ember_surge: 'weaponDamagePct',
} as const;

/**
 * Set of playerHitEnemy proc effectIds that apply a debuff to the HIT ENEMY
 * rather than granting a buff to the player. These call applyEnemyDebuff instead
 * of upsertActiveWeaveBuff, and intentionally do NOT interact with lens combos.
 */
const HIT_ENEMY_DEBUFF_IDS: ReadonlySet<WeaveProcEffectId> = new Set([
  'weave_lingering_hex',
]);

/**
 * Maps each buff-granting playerDamaged proc effectId to the stat it modifies.
 * Add new defensive on-hit procs here without touching the trigger loop.
 */
const DAMAGE_BUFF_STAT_MAP: Readonly<Partial<Record<WeaveProcEffectId, ActiveWeaveBuffStat>>> = {
  weave_reactive_ward: 'playerDefensePct',
  weave_aegis_flash: 'playerDefensePct',
} as const;

// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Adds or refreshes an active weave buff for a given effectId.
 * - If no existing buff for the effectId: pushes a new entry.
 * - If an existing buff exists: refreshes duration and keeps the stronger valuePct.
 * Never creates duplicate entries for the same effectId.
 */
export function upsertActiveWeaveBuff(
  state: RpgSimState,
  effectId: string,
  statKey: ActiveWeaveBuffStat,
  valuePct: number,
  durationMs: number,
): void {
  const existing = state.activeWeaveBuffs.find(b => b.effectId === effectId);
  if (existing) {
    existing.remainingMs = durationMs;
    if (valuePct > existing.valuePct) existing.valuePct = valuePct;
  } else {
    const buff: ActiveWeaveBuff = { effectId, statKey, valuePct, remainingMs: durationMs };
    state.activeWeaveBuffs.push(buff);
  }
}

/**
 * Formats a single active weave buff's stat contribution as a short string.
 * - `playerDefensePct` → `+12.0% DEF`
 * - `cooldownPct`      → `-5.5% cooldown`
 * - `weaponDamagePct`  → `+8.0% weapon damage`
 */
export function formatActiveWeaveBuffStat(statKey: ActiveWeaveBuffStat, valuePct: number): string {
  switch (statKey) {
    case 'cooldownPct':      return `-${valuePct.toFixed(1)}% cooldown`;
    case 'weaponDamagePct':  return `+${valuePct.toFixed(1)}% weapon damage`;
    case 'playerDefensePct': return `+${valuePct.toFixed(1)}% DEF`;
  }
}

/**
 * Returns the display name for an active buff's effectId, with a safe fallback.
 */
export function getActiveWeaveBuffDisplayName(effectId: string): string {
  return getWeaveEffectDef(effectId)?.displayName ?? 'Unknown Weave Effect';
}

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

      const statKey = DAMAGE_BUFF_STAT_MAP[effect.id as WeaveProcEffectId];
      if (!statKey) continue; // unknown buff stat — skip gracefully
      upsertActiveWeaveBuff(state, effect.id, statKey, effect.value, def.durationMs);
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
 * @param state            - Current rpg sim state.
 * @param finalDmg         - Actual damage dealt by the triggering hit (post-DEF).
 * @param applyBonusDmg    - Called with computed bonus HP damage; caller must reduce enemy HP.
 * @param applyEnemyDebuff - Optional: called with (valuePct, durationMs) to debuff the hit enemy.
 *                           Provided by the caller as a closure that captures the target entity.
 *                           If omitted, enemy-debuff procs are silently skipped.
 * @param rng              - RNG function (default Math.random, injectable for tests).
 */
export function tryTriggerPlayerHitEnemyWeaveEffects(
  state: RpgSimState,
  finalDmg: number,
  applyBonusDmg: (bonus: number) => void,
  applyEnemyDebuff?: (valuePct: number, durationMs: number) => void,
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

      if (HIT_ENEMY_DEBUFF_IDS.has(effect.id as WeaveProcEffectId)) {
        // Enemy debuff proc (e.g. weave_lingering_hex): debuff the hit enemy, no player buff.
        applyEnemyDebuff?.(effect.value, def.durationMs);
      } else if (def.durationMs > 0) {
        // Temp buff proc (e.g. weave_swiftstrike, weave_ember_surge): add or refresh.
        // Same effectId: refresh duration and keep the stronger valuePct.
        // This prevents unlimited stacking from a single source while allowing
        // natural refresh on repeated procs within the same combat.
        const statKey = HIT_BUFF_STAT_MAP[effect.id as WeaveProcEffectId];
        if (!statKey) continue; // unknown buff stat — skip gracefully
        upsertActiveWeaveBuff(state, effect.id, statKey, effect.value, def.durationMs);
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
