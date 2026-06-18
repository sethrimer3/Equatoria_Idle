/**
 * enemy-status-combos.ts — Status combo trigger engine.
 *
 * Pure logic: checks enemy status state, enforces per-enemy/per-combo cooldowns,
 * computes scaled damage, and returns ComboResult records.
 * Has no rendering or visual dependencies — callers apply effects.
 *
 * Public API:
 *   evaluateStatusCombosOnStatusApplied(args) — call after applyLensStatus
 *   evaluateShatterCombo(args)                — call on every direct weapon hit
 */

import { hasStatus, removeStatus, getTotalRiftScarredStacks } from './enemy-status-effects';
import { getComboById } from '../../data/rpg/status-combo-definitions';
import type { EnemyStatusKey } from './enemy-status-effects';

// ── Result type ────────────────────────────────────────────────────────────────

export interface ComboResult {
  comboId: string;
  label: string;
  color: string;
  primaryEnemy: object;
  /** Enemy type ID for logging/affinity purposes (e.g. 'ruby', 'boss', 'other'). */
  enemyTypeId: string;
  x: number;
  y: number;
  /** Damage to deal to the primary target (already scaled for boss/elite). */
  primaryDamage: number;
  /** Damage to deal to nearby enemies (0 = no AoE component). */
  aoeDamage: number;
  /** Radius in px for the AoE component (0 if aoeDamage = 0). */
  aoeRadius: number;
  /** The trigger kind that caused this combo (for logging/dev). */
  triggerKind: ComboTriggerKind;
}

// ── Trigger kind ───────────────────────────────────────────────────────────────

export type ComboTriggerKind =
  | 'statusApplied'
  | 'directHit'
  | 'aoeHit'
  | 'craftedNullstone'
  | 'craftedFracteryl';

// ── Per-enemy cooldown registry ────────────────────────────────────────────────

const _cooldowns = new WeakMap<object, Map<string, number>>();

function _isOnCooldown(enemy: object, comboId: string, nowMs: number, cooldownMs: number): boolean {
  const map = _cooldowns.get(enemy);
  if (!map) return false;
  const last = map.get(comboId);
  if (last === undefined) return false;
  return nowMs - last < cooldownMs;
}

function _setCooldown(enemy: object, comboId: string, nowMs: number): void {
  let map = _cooldowns.get(enemy);
  if (!map) { map = new Map(); _cooldowns.set(enemy, map); }
  map.set(comboId, nowMs);
}

// ── Re-entrancy guard ──────────────────────────────────────────────────────────

let _inEval = false;

// ── Damage scaling ─────────────────────────────────────────────────────────────

function _scale(base: number, bossM: number, eliteM: number, typeId: string): number {
  if (typeId === 'boss') return base * bossM;
  if (typeId.startsWith('elite_')) return base * eliteM;
  return base;
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function _consumeStatuses(enemy: object, statuses: readonly EnemyStatusKey[]): void {
  for (const s of statuses) removeStatus(enemy, s);
}

// ── evaluateStatusCombosOnStatusApplied ───────────────────────────────────────

/**
 * Check all status combos (Steam Burst, Toxic Rupture, Gravity Collapse,
 * Rift Detonation) after a status is applied to an enemy.
 * Shatter is NOT checked here — use evaluateShatterCombo on direct hits.
 * Gravity Collapse only fires from aoeHit, craftedNullstone, or craftedFracteryl.
 */
export function evaluateStatusCombosOnStatusApplied(args: {
  enemy: object;
  enemyTypeId: string;
  x: number;
  y: number;
  baseDamage: number;
  nowMs: number;
  triggerKind?: ComboTriggerKind;
}): ComboResult[] {
  if (_inEval) return [];
  const { enemy, enemyTypeId, x, y, baseDamage, nowMs, triggerKind = 'statusApplied' } = args;

  _inEval = true;
  const results: ComboResult[] = [];

  try {
    // ── Steam Burst (burning + chilled) ─────────────────────────────────────
    const steam = getComboById('steamBurst')!;
    if (
      hasStatus(enemy, 'burning') &&
      hasStatus(enemy, 'chilled') &&
      !_isOnCooldown(enemy, steam.id, nowMs, steam.cooldownMs)
    ) {
      _consumeStatuses(enemy, steam.consumeStatuses);
      const rawPrimary = _scale(baseDamage * 0.50, steam.bossMultiplier, steam.eliteMultiplier, enemyTypeId);
      const rawAoe     = _scale(baseDamage * 0.25, steam.bossMultiplier, steam.eliteMultiplier, enemyTypeId);
      _setCooldown(enemy, steam.id, nowMs);
      results.push({
        comboId: steam.id, label: steam.feedbackLabel, color: steam.feedbackColor,
        primaryEnemy: enemy, enemyTypeId, x, y,
        primaryDamage: rawPrimary, aoeDamage: rawAoe, aoeRadius: 80, triggerKind,
      });
    }

    // ── Toxic Rupture (poisoned + cracked) ──────────────────────────────────
    const rupture = getComboById('toxicRupture')!;
    if (
      hasStatus(enemy, 'poisoned') &&
      hasStatus(enemy, 'cracked') &&
      !_isOnCooldown(enemy, rupture.id, nowMs, rupture.cooldownMs)
    ) {
      const raw = _scale(baseDamage * 0.80, rupture.bossMultiplier, rupture.eliteMultiplier, enemyTypeId);
      if (raw > 0) {
        _consumeStatuses(enemy, rupture.consumeStatuses);
        _setCooldown(enemy, rupture.id, nowMs);
        results.push({
          comboId: rupture.id, label: rupture.feedbackLabel, color: rupture.feedbackColor,
          primaryEnemy: enemy, enemyTypeId, x, y,
          primaryDamage: raw, aoeDamage: 0, aoeRadius: 0, triggerKind,
        });
      }
    }

    // ── Gravity Collapse (gravitized) — AoE / crafted triggers only ──────────
    const gravity = getComboById('gravityCollapse')!;
    const gravityAllowed =
      triggerKind === 'aoeHit' ||
      triggerKind === 'craftedNullstone' ||
      triggerKind === 'craftedFracteryl';
    if (
      gravityAllowed &&
      hasStatus(enemy, 'gravitized') &&
      !_isOnCooldown(enemy, gravity.id, nowMs, gravity.cooldownMs)
    ) {
      const rawPrimary = _scale(baseDamage * 0.30, gravity.bossMultiplier, gravity.eliteMultiplier, enemyTypeId);
      const rawAoe     = _scale(baseDamage * 0.18, gravity.bossMultiplier, gravity.eliteMultiplier, enemyTypeId);
      if (rawPrimary > 0 || rawAoe > 0) {
        _consumeStatuses(enemy, gravity.consumeStatuses);
        _setCooldown(enemy, gravity.id, nowMs);
        results.push({
          comboId: gravity.id, label: gravity.feedbackLabel, color: gravity.feedbackColor,
          primaryEnemy: enemy, enemyTypeId, x, y,
          primaryDamage: rawPrimary, aoeDamage: rawAoe, aoeRadius: 100, triggerKind,
        });
      }
    }

    // ── Rift Detonation (riftScarred, stack threshold) ───────────────────────
    const rift = getComboById('riftDetonation')!;
    const riftThreshold = rift.riftStackThreshold ?? 8;
    if (
      hasStatus(enemy, 'riftScarred') &&
      getTotalRiftScarredStacks(enemy) >= riftThreshold &&
      !_isOnCooldown(enemy, rift.id, nowMs, rift.cooldownMs)
    ) {
      const stacks = getTotalRiftScarredStacks(enemy);
      const raw = _scale(baseDamage * stacks * 0.15, rift.bossMultiplier, rift.eliteMultiplier, enemyTypeId);
      if (raw > 0) {
        _consumeStatuses(enemy, rift.consumeStatuses);
        _setCooldown(enemy, rift.id, nowMs);
        results.push({
          comboId: rift.id, label: rift.feedbackLabel, color: rift.feedbackColor,
          primaryEnemy: enemy, enemyTypeId, x, y,
          primaryDamage: raw, aoeDamage: 0, aoeRadius: 0, triggerKind,
        });
      }
    }
  } finally {
    _inEval = false;
  }

  return results;
}

// ── evaluateShatterCombo ──────────────────────────────────────────────────────

/**
 * Check for the Shatter combo on a direct weapon hit.
 * Triggers when the target is Frozen and hit damage is ≥ 1.
 * Removes the Frozen status on trigger.
 */
export function evaluateShatterCombo(args: {
  enemy: object;
  enemyTypeId: string;
  x: number;
  y: number;
  hitDamage: number;
  nowMs: number;
}): ComboResult | null {
  if (_inEval) return null;
  const { enemy, enemyTypeId, x, y, hitDamage, nowMs } = args;

  const shatter = getComboById('shatter')!;

  if (!hasStatus(enemy, 'frozen')) return null;
  if (hitDamage < 1) return null;
  if (_isOnCooldown(enemy, shatter.id, nowMs, shatter.cooldownMs)) return null;

  _inEval = true;
  try {
    _consumeStatuses(enemy, shatter.consumeStatuses);
    const raw = _scale(hitDamage * 1.0, shatter.bossMultiplier, shatter.eliteMultiplier, enemyTypeId);
    if (raw <= 0) return null;
    _setCooldown(enemy, shatter.id, nowMs);
    return {
      comboId: shatter.id, label: shatter.feedbackLabel, color: shatter.feedbackColor,
      primaryEnemy: enemy, x, y,
      primaryDamage: raw, aoeDamage: 0, aoeRadius: 0,
    };
  } finally {
    _inEval = false;
  }
}
