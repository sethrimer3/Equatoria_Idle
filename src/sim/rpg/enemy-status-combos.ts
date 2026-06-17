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

// ── Result type ────────────────────────────────────────────────────────────────

export interface ComboResult {
  comboId: string;
  label: string;
  color: string;
  primaryEnemy: object;
  x: number;
  y: number;
  /** Damage to deal to the primary target (already scaled for boss/elite). */
  primaryDamage: number;
  /** Damage to deal to nearby enemies (0 = no AoE component). */
  aoeDamage: number;
  /** Radius in px for the AoE component (0 if aoeDamage = 0). */
  aoeRadius: number;
}

// ── Per-enemy cooldown registry ────────────────────────────────────────────────

const _cooldowns = new WeakMap<object, Map<string, number>>();

function _isOnCooldown(enemy: object, comboId: string, nowMs: number, cooldownMs: number): boolean {
  const last = _cooldowns.get(enemy)?.get(comboId) ?? 0;
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

// ── evaluateStatusCombosOnStatusApplied ───────────────────────────────────────

/**
 * Check all status combos (Steam Burst, Toxic Rupture, Gravity Collapse,
 * Rift Detonation) after a status is applied to an enemy.
 * Shatter is NOT checked here — use evaluateShatterCombo on direct hits.
 */
export function evaluateStatusCombosOnStatusApplied(args: {
  enemy: object;
  enemyTypeId: string;
  x: number;
  y: number;
  baseDamage: number;
  nowMs: number;
}): ComboResult[] {
  if (_inEval) return [];
  const { enemy, enemyTypeId, x, y, baseDamage, nowMs } = args;

  _inEval = true;
  const results: ComboResult[] = [];

  try {
    // ── Steam Burst (burning + chilled) ─────────────────────────────────────
    if (
      hasStatus(enemy, 'burning') &&
      hasStatus(enemy, 'chilled') &&
      !_isOnCooldown(enemy, 'steamBurst', nowMs, 3000)
    ) {
      removeStatus(enemy, 'chilled');
      const rawPrimary = _scale(baseDamage * 0.50, 0.30, 0.60, enemyTypeId);
      const rawAoe     = _scale(baseDamage * 0.25, 0.30, 0.60, enemyTypeId);
      _setCooldown(enemy, 'steamBurst', nowMs);
      results.push({
        comboId: 'steamBurst', label: 'STEAM', color: '#b8eeff',
        primaryEnemy: enemy, x, y,
        primaryDamage: rawPrimary, aoeDamage: rawAoe, aoeRadius: 80,
      });
    }

    // ── Toxic Rupture (poisoned + cracked) ──────────────────────────────────
    if (
      hasStatus(enemy, 'poisoned') &&
      hasStatus(enemy, 'cracked') &&
      !_isOnCooldown(enemy, 'toxicRupture', nowMs, 2500)
    ) {
      const raw = _scale(baseDamage * 0.80, 0.35, 0.65, enemyTypeId);
      if (raw > 0) {
        _setCooldown(enemy, 'toxicRupture', nowMs);
        results.push({
          comboId: 'toxicRupture', label: 'RUPTURE', color: '#66dd44',
          primaryEnemy: enemy, x, y,
          primaryDamage: raw, aoeDamage: 0, aoeRadius: 0,
        });
      }
    }

    // ── Gravity Collapse (gravitized) ────────────────────────────────────────
    if (
      hasStatus(enemy, 'gravitized') &&
      !_isOnCooldown(enemy, 'gravityCollapse', nowMs, 4000)
    ) {
      const rawPrimary = _scale(baseDamage * 0.30, 0.00, 0.40, enemyTypeId);
      const rawAoe     = _scale(baseDamage * 0.18, 0.00, 0.40, enemyTypeId);
      // Skip boss entirely (bossMultiplier = 0 → rawPrimary = 0)
      if (rawPrimary > 0 || rawAoe > 0) {
        _setCooldown(enemy, 'gravityCollapse', nowMs);
        results.push({
          comboId: 'gravityCollapse', label: 'COLLAPSE', color: '#8855cc',
          primaryEnemy: enemy, x, y,
          primaryDamage: rawPrimary, aoeDamage: rawAoe, aoeRadius: 100,
        });
      }
    }

    // ── Rift Detonation (riftScarred, stack threshold) ───────────────────────
    if (
      hasStatus(enemy, 'riftScarred') &&
      getTotalRiftScarredStacks(enemy) >= 8 &&
      !_isOnCooldown(enemy, 'riftDetonation', nowMs, 5000)
    ) {
      const stacks = getTotalRiftScarredStacks(enemy);
      const raw = _scale(baseDamage * stacks * 0.15, 0.25, 0.50, enemyTypeId);
      if (raw > 0) {
        _setCooldown(enemy, 'riftDetonation', nowMs);
        results.push({
          comboId: 'riftDetonation', label: 'RIFT', color: '#44ffee',
          primaryEnemy: enemy, x, y,
          primaryDamage: raw, aoeDamage: 0, aoeRadius: 0,
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

  if (!hasStatus(enemy, 'frozen')) return null;
  if (hitDamage < 1) return null;
  if (_isOnCooldown(enemy, 'shatter', nowMs, 2000)) return null;

  _inEval = true;
  try {
    removeStatus(enemy, 'frozen');
    const raw = _scale(hitDamage * 1.0, 0.40, 0.70, enemyTypeId);
    if (raw <= 0) return null;
    _setCooldown(enemy, 'shatter', nowMs);
    return {
      comboId: 'shatter', label: 'SHATTER', color: '#aaeeff',
      primaryEnemy: enemy, x, y,
      primaryDamage: raw, aoeDamage: 0, aoeRadius: 0,
    };
  } finally {
    _inEval = false;
  }
}
