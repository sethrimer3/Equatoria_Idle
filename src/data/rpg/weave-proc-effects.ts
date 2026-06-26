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
import { getEchoT1ProcChancePct } from './weave-rolling';
import type { WeaveNamedEffectId, WeaveNamedEffectTier } from './weave-types';

/** Maximum number of stacked attacks Quickened Stitch T3 can accumulate before forced release. */
export const QUICKENED_STITCH_MAX_STACKS = 5;

/** Radius (px) within which Echo T1 looks for a nearby target. */
export const ECHO_NEARBY_RADIUS = 200;

/** Maximum chain depth for Echo T3. */
export const ECHO_MAX_CHAIN_DEPTH = 3;

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
      recordEquipmentProcEvent({
        timeMs: performance.now(),
        kind: 'weave_buff_start',
        sourceName: def.displayName,
        summary: `${formatActiveWeaveBuffStat(statKey, effect.value)} for ${(def.durationMs / 1000).toFixed(1)}s`,
      });
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
        recordEquipmentProcEvent({
          timeMs: performance.now(),
          kind: 'weave_proc',
          sourceName: def.displayName,
          summary: `enemy +${effect.value.toFixed(1)}% dmg taken for ${(def.durationMs / 1000).toFixed(1)}s`,
        });
      } else if (def.durationMs > 0) {
        // Temp buff proc (e.g. weave_swiftstrike, weave_ember_surge): add or refresh.
        const statKey = HIT_BUFF_STAT_MAP[effect.id as WeaveProcEffectId];
        if (!statKey) continue; // unknown buff stat — skip gracefully
        upsertActiveWeaveBuff(state, effect.id, statKey, effect.value, def.durationMs);
        recordEquipmentProcEvent({
          timeMs: performance.now(),
          kind: 'weave_buff_start',
          sourceName: def.displayName,
          summary: `${formatActiveWeaveBuffStat(statKey, effect.value)} for ${(def.durationMs / 1000).toFixed(1)}s`,
        });
      } else {
        // Instant damage proc (e.g. weave_echo_strike): no buff, apply bonus damage.
        const bonus = finalDmg * (effect.value / 100);
        applyBonusDmg(bonus);
        recordEquipmentProcEvent({
          timeMs: performance.now(),
          kind: 'weave_proc',
          sourceName: def.displayName,
          summary: `+${bonus.toFixed(1)} bonus dmg (${effect.value.toFixed(1)}% of ${finalDmg.toFixed(1)})`,
        });
      }

      triggered.push(effect.id);
    }
  }

  return triggered;
}

// ─── Named effect tier helpers ────────────────────────────────────────────────

/**
 * Collects all applied named effect tier entries from currently-equipped weaves.
 * Returns only tiers where isApplied === true.
 */
export function getEquippedNamedEffectTiers(state: RpgSimState): WeaveNamedEffectTier[] {
  const { equippedWeaveSlots, craftedWeaves } = state;
  const weaveById = new Map(craftedWeaves.map(w => [w.id, w]));
  const result: WeaveNamedEffectTier[] = [];
  for (const slotId of equippedWeaveSlots) {
    if (!slotId) continue;
    const weave = weaveById.get(slotId);
    if (!weave) continue;
    for (const net of weave.namedEffectTiers ?? []) {
      if (net.isApplied) result.push(net);
    }
  }
  return result;
}

/**
 * Returns the first matching named effect tier entry from equipped weaves, or null.
 */
export function getNamedEffectTier(
  state: RpgSimState,
  effectId: WeaveNamedEffectId,
  tier: 1 | 2 | 3,
): WeaveNamedEffectTier | null {
  for (const net of getEquippedNamedEffectTiers(state)) {
    if (net.effectId === effectId && net.tier === tier) return net;
  }
  return null;
}

/**
 * Returns the summed magnitude across all matching named effect tier entries from equipped weaves.
 */
export function getTotalNamedEffectMagnitude(
  state: RpgSimState,
  effectId: WeaveNamedEffectId,
  tier: 1 | 2 | 3,
): number {
  let total = 0;
  for (const net of getEquippedNamedEffectTiers(state)) {
    if (net.effectId === effectId && net.tier === tier) total += net.magnitude;
  }
  return total;
}

// ─── Named effect proc triggers (player damaged) ──────────────────────────────

/**
 * Trigger options for named effect player-damaged procs.
 *
 * @param isReflected - Set true when the damage itself is a reflection (Guard T2 anti-recursion).
 */
export interface NamedEffectDamagedOpts {
  /** Raw attack value before DEF (used for Ward T3 highest-damage tracking). */
  rawAtkValue: number;
  /** Post-mitigation damage amount actually absorbed/dealt. */
  finalDmg: number;
  /** When true, Guard T2 reflection is suppressed (prevents infinite recursion). */
  isReflected?: boolean;
  rng?: () => number;
}

/**
 * Result of processing named effect player-damaged procs.
 */
export interface NamedEffectDamagedResult {
  /** Amount of damage absorbed by the Reactive Ward T1 shield proc (0 if no proc). */
  wardShieldConverted: number;
  /** Damage to reflect back (Guard T2); caller must apply to attacker. 0 if no reflection. */
  reflectedDmg: number;
  /** True if Guard T3 fully blocked the hit (caller should negate the damage). */
  guardBlocked: boolean;
}

/**
 * Processes named effect tier procs triggered when the player takes damage.
 * Must be called BEFORE reducing player HP (results inform how much HP to reduce).
 *
 * Handles:
 *   Guard T3  — cappedChance% full block
 *   Ward T1   — cappedChance% shield conversion (increases playerShieldHp)
 *   Guard T2  — post-mitigation reflection (NOT recursive when isReflected=true)
 *   Ward T3   — on ward proc: replenish shield
 *
 * Returns NamedEffectDamagedResult; caller applies the block/shield/reflection.
 */
export function processNamedEffectPlayerDamagedProcs(
  state: RpgSimState,
  opts: NamedEffectDamagedOpts,
): NamedEffectDamagedResult {
  const result: NamedEffectDamagedResult = { wardShieldConverted: 0, reflectedDmg: 0, guardBlocked: false };
  const rng = opts.rng ?? Math.random;
  const { rawAtkValue, finalDmg, isReflected } = opts;

  if (finalDmg <= 0) return result;

  // Track highest incoming damage for Ward T3 replenishment
  if (rawAtkValue > state.wardHighestIncomingDamage) {
    state.wardHighestIncomingDamage = rawAtkValue;
  }

  const nets = getEquippedNamedEffectTiers(state);

  // Guard T3: capped block chance — full block if proc fires
  for (const net of nets) {
    if (net.effectId === 'guard' && net.tier === 3) {
      if (rng() * 100 < net.magnitude) {
        result.guardBlocked = true;
        return result; // no further processing needed
      }
    }
  }

  // Ward T1: convert incoming damage to shield
  for (const net of nets) {
    if (net.effectId === 'ward' && net.tier === 1) {
      if (rng() * 100 < net.magnitude) {
        // Ward T2 multiplier
        let shieldMult = 1.0;
        for (const net2 of nets) {
          if (net2.effectId === 'ward' && net2.tier === 2) {
            shieldMult = net2.magnitude; // stored as the actual multiplier value
            break;
          }
        }
        const baseShield = finalDmg * shieldMult;

        // Ward T3 replenishment on top
        let replenishment = 0;
        for (const net3 of nets) {
          if (net3.effectId === 'ward' && net3.tier === 3) {
            replenishment = (net3.magnitude / 100) * state.wardHighestIncomingDamage;
            break;
          }
        }
        const shieldAdded = baseShield + replenishment;
        state.playerShieldHp += shieldAdded;
        result.wardShieldConverted = finalDmg; // original damage is fully converted
        return result; // shield conversion negates the HP hit; reflection not applied on converted damage
      }
    }
  }

  // Guard T2: reflect post-mitigation damage (not when isReflected — anti-recursion)
  if (!isReflected) {
    for (const net of nets) {
      if (net.effectId === 'guard' && net.tier === 2) {
        result.reflectedDmg += finalDmg * (net.magnitude / 100);
      }
    }
  }

  return result;
}

// ─── Named effect proc triggers (player hit enemy) ───────────────────────────

/**
 * Trigger options for named effect hit-enemy procs.
 */
export interface NamedEffectHitOpts {
  /** Final damage dealt to the hit enemy. */
  finalDmg: number;
  /** Set true for extra attacks fired by Quickened Stitch T2 (suppresses further extra attacks). */
  isExtraAttack?: boolean;
  /** Set true for echo hits fired by Echo Strike (suppresses further echo chains). */
  isEchoHit?: boolean;
  rng?: () => number;
  /** Fired when a Quickened Stitch T2/T3 extra attack should occur. */
  onExtraAttack?: () => void;
  /**
   * Fired with echo damage amount when Echo T1 procs.
   * Caller is responsible for finding the nearest target and applying the damage.
   * For Echo T3 chain hits, this may be called multiple times.
   */
  onEchoHit?: (echoDmg: number) => void;
}

/**
 * Processes named effect tier procs triggered when the player hits an enemy.
 *
 * Handles:
 *   Quickened Stitch T2 — extra attack (no recursion via isExtraAttack)
 *   Quickened Stitch T3 — attack stack accumulation + release at cap
 *   Echo T1             — echo damage to nearest enemy (no recursion via isEchoHit)
 *   Echo T3             — chain chance for additional echo hits
 */
export function processNamedEffectPlayerHitEnemyProcs(
  state: RpgSimState,
  opts: NamedEffectHitOpts,
): void {
  const rng = opts.rng ?? Math.random;
  const { finalDmg, isExtraAttack, isEchoHit } = opts;
  if (finalDmg <= 0) return;

  const nets = getEquippedNamedEffectTiers(state);

  // Quickened Stitch T2: extra attack (not for already-extra attacks)
  if (!isExtraAttack) {
    for (const net of nets) {
      if (net.effectId === 'quickness' && net.tier === 2) {
        if (rng() * 100 < net.magnitude) {
          opts.onExtraAttack?.();
        }
      }
    }

    // Quickened Stitch T3: stack accumulation
    for (const net of nets) {
      if (net.effectId === 'quickness' && net.tier === 3) {
        const { layers, partialChance } = { layers: Math.floor(net.magnitude / 100), partialChance: net.magnitude % 100 };
        // Use resolveOverflowChance semantics for stack accumulation rate
        let stacksToAdd = layers;
        if (partialChance > 0 && rng() * 100 < partialChance) stacksToAdd++;
        if (stacksToAdd > 0) {
          state.quickenedStitchAttackStacks = Math.min(
            QUICKENED_STITCH_MAX_STACKS,
            state.quickenedStitchAttackStacks + stacksToAdd,
          );
          if (state.quickenedStitchAttackStacks >= QUICKENED_STITCH_MAX_STACKS) {
            // Release as amplified burst
            const burstCount = QUICKENED_STITCH_MAX_STACKS;
            state.quickenedStitchAttackStacks = 0;
            for (let i = 0; i < burstCount; i++) {
              opts.onExtraAttack?.();
            }
          }
        }
        break;
      }
    }
  }

  // Echo T1: echo hit to nearest enemy (not for already-echo hits)
  if (!isEchoHit) {
    for (const net of nets) {
      if (net.effectId === 'echo' && net.tier === 1) {
        const effectMultiplier = net.magnitude / 20.0; // reverse-compute from roll formula
        const procChancePct = getEchoT1ProcChancePct(effectMultiplier);
        if (rng() * 100 < procChancePct) {
          // Echo damage % is stored as magnitude for T1
          let echoDmg = finalDmg * (net.magnitude / 100);

          // Echo T2: multiplier applied to echo damage
          for (const net2 of nets) {
            if (net2.effectId === 'echo' && net2.tier === 2) {
              echoDmg *= net2.magnitude;
              break;
            }
          }

          opts.onEchoHit?.(echoDmg);

          // Echo T3: chain chance for additional hits (bounded, isEchoHit=true on chained hits)
          for (const net3 of nets) {
            if (net3.effectId === 'echo' && net3.tier === 3) {
              // Each chain link rolls independently and each subsequent hit triggers another
              let chainDmg = echoDmg;
              for (let depth = 0; depth < ECHO_MAX_CHAIN_DEPTH; depth++) {
                if (rng() * 100 < net3.magnitude) {
                  opts.onEchoHit?.(chainDmg);
                  chainDmg *= 0.75; // diminishing returns per chain depth
                } else {
                  break;
                }
              }
              break;
            }
          }
        }
        break; // only one echo source per hit
      }
    }
  }
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
