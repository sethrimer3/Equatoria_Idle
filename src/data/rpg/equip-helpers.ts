/**
 * equip-helpers.ts — Pure helpers for lens/weave equip validation and comparison.
 *
 * No DOM or render code. Safe to call from tests, sim, and UI layers.
 */

import type { RpgSimState } from '../../sim/rpg/rpg-state';
import type { CraftedLensData } from './lens-types';
import type { CraftedWeaveData } from './weave-types';
import { getUnlockedWeaveSlotCount } from '../../sim/forge/forge-state';
import { getEquippedLensModifiers, getEquippedWeaveModifiers } from './equipment-modifiers';
import type { EquipmentCombatModifiers } from './equipment-modifiers';
import { REFINEMENT_STAT_MULTIPLIER, MAX_REFINEMENT_LEVEL } from './item-refinement';

// ─── Lens helpers ─────────────────────────────────────────────────

export function canEquipLens(lens: CraftedLensData | undefined | null): boolean {
  return lens != null && lens.type === 'lens';
}

/** Returns the lens attached to a weapon, or null if none/unknown. */
export function getAttachedLens(rpgState: RpgSimState, weaponId: string): CraftedLensData | null {
  return rpgState.craftedWeapons.find(w => w.id === weaponId)?.attachedLens ?? null;
}

// ─── Weave helpers ────────────────────────────────────────────────

export function canEquipWeave(
  weave: CraftedWeaveData | undefined | null,
  slotIndex: number,
  forgeLevel: number,
): boolean {
  if (!weave) return false;
  const unlockedSlots = getUnlockedWeaveSlotCount(forgeLevel);
  return slotIndex >= 0 && slotIndex < unlockedSlots;
}

/** Returns the weave equipped in a given slot, or null. */
export function getEquippedWeaveForSlot(rpgState: RpgSimState, slotIndex: number): CraftedWeaveData | null {
  const id = rpgState.equippedWeaveSlots[slotIndex] ?? null;
  if (!id) return null;
  return rpgState.craftedWeaves.find(w => w.id === id) ?? null;
}

/** Returns 'equipped', 'not-equipped', or 'unknown' for a weave. */
export function getWeaveEquipState(
  rpgState: RpgSimState,
  weaveId: string,
): 'equipped' | 'not-equipped' {
  return rpgState.equippedWeaveSlots.includes(weaveId) ? 'equipped' : 'not-equipped';
}

// ─── Comparison ───────────────────────────────────────────────────

export interface StatComparison {
  label: string;
  current: number;
  candidate: number;
  delta: number;
  better: boolean;
  worse: boolean;
}

const COMBAT_MOD_LABELS: Array<[keyof EquipmentCombatModifiers, string]> = [
  ['weaponDamagePct', 'DMG %'],
  ['cooldownPct', 'CDR %'],
  ['critChancePct', 'Crit %'],
  ['critDamagePct', 'Crit DMG %'],
  ['statusChancePct', 'Status %'],
  ['playerDefensePct', 'DEF %'],
  ['projectileSpeedPct', 'Proj Spd %'],
];

function buildComparisons(
  current: EquipmentCombatModifiers,
  candidate: EquipmentCombatModifiers,
): StatComparison[] {
  return COMBAT_MOD_LABELS.map(([key, label]) => {
    const cur = current[key];
    const can = candidate[key];
    const delta = can - cur;
    return { label, current: cur, candidate: can, delta, better: delta > 0.01, worse: delta < -0.01 };
  }).filter(c => c.current > 0.01 || c.candidate > 0.01);
}

/** Compare a candidate lens vs the lens currently attached to a given weapon. */
export function getLensEquipComparison(
  rpgState: RpgSimState,
  candidateLens: CraftedLensData,
  weaponId: string,
): StatComparison[] {
  const hitDamage = 1;
  const current = getEquippedLensModifiers(
    rpgState.craftedWeapons.find(w => w.id === weaponId)?.attachedLens ?? null,
    weaponId, hitDamage,
  );
  const candidate = getEquippedLensModifiers(candidateLens, weaponId, hitDamage);
  return buildComparisons(current, candidate);
}

/** Compare a candidate weave vs the combined modifiers of all currently equipped weaves. */
export function getWeaveEquipComparison(
  rpgState: RpgSimState,
  candidateWeave: CraftedWeaveData,
): StatComparison[] {
  const current = getEquippedWeaveModifiers(rpgState.equippedWeaveSlots, rpgState.craftedWeaves);
  const candidate = getEquippedWeaveModifiers([candidateWeave.id], [candidateWeave]);
  return buildComparisons(current, candidate);
}

// ─── Refinement display helpers ───────────────────────────────────

export function getRefinementLabel(level: number): string {
  return level > 0 ? `+${level}` : '+0';
}

export function getRefinementMultiplierLabel(level: number): string {
  const pct = Math.round((REFINEMENT_STAT_MULTIPLIER[Math.min(level, MAX_REFINEMENT_LEVEL)] - 1) * 100);
  return pct > 0 ? `+${pct}% stats` : 'unrefined';
}
