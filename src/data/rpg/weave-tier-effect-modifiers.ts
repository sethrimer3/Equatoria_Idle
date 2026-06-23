/**
 * weave-tier-effect-modifiers.ts — Stat contributions from weave tier effects.
 *
 * Each (tierId, effectTier) pair maps to one or more combat modifier fields
 * via a scaling factor: contribution = magnitude × factor × refineMult.
 * Values are accumulated into EquipmentCombatModifiers by getEquippedWeaveModifiers
 * and are subject to the same clamp limits as affixes.
 *
 * Scale factors are intentionally conservative — weave tier effects are a
 * secondary layer on top of affixes and passive/proc effects, not a primary source.
 */

import type { TierId } from '../tiers';
import type { WeaveTierEffectTier } from './weave-types';

// ─── Target shape ─────────────────────────────────────────────────────────────

/** Minimal interface matching EquipmentCombatModifiers — avoids circular import. */
export interface WeaveTierModTarget {
  weaponDamagePct: number;
  cooldownPct: number;
  projectileSpeedPct: number;
  critChancePct: number;
  critDamagePct: number;
  statusChancePct: number;
  playerDefensePct: number;
}

type StatKey = keyof WeaveTierModTarget;

// ─── Scale factor table ───────────────────────────────────────────────────────

const WEAVE_TIER_EFFECT_SCALE: Record<
  WeaveTierEffectTier,
  Partial<Record<TierId, Partial<Record<StatKey, number>>>>
> = {
  1: {
    sand:       { cooldownPct: 0.04 },
    quartz:     { projectileSpeedPct: 0.05 },
    ruby:       { critChancePct: 0.04 },
    citrine:    { weaponDamagePct: 0.04 },
    emerald:    { statusChancePct: 0.04 },
    sapphire:   { playerDefensePct: 0.05 },
    iolite:     { cooldownPct: 0.03 },
    amethyst:   { critDamagePct: 0.05 },
    diamond:    { playerDefensePct: 0.08 },
    nullstone:  { statusChancePct: 0.04 },
    fracteryl:  { critDamagePct: 0.04 },
    eigenstein: { weaponDamagePct: 0.04 },
  },
  2: {
    sand:       { cooldownPct: 0.07 },
    quartz:     { projectileSpeedPct: 0.09 },
    ruby:       { critChancePct: 0.07, critDamagePct: 0.03 },
    citrine:    { weaponDamagePct: 0.07 },
    emerald:    { statusChancePct: 0.07 },
    sapphire:   { playerDefensePct: 0.09 },
    iolite:     { cooldownPct: 0.06 },
    amethyst:   { critDamagePct: 0.09 },
    diamond:    { playerDefensePct: 0.14 },
    nullstone:  { statusChancePct: 0.07 },
    fracteryl:  { critDamagePct: 0.07 },
    eigenstein: { weaponDamagePct: 0.07 },
  },
  3: {
    sand:       { cooldownPct: 0.11 },
    quartz:     { projectileSpeedPct: 0.14 },
    ruby:       { critChancePct: 0.10, critDamagePct: 0.06 },
    citrine:    { weaponDamagePct: 0.11 },
    emerald:    { statusChancePct: 0.11 },
    sapphire:   { playerDefensePct: 0.14 },
    iolite:     { cooldownPct: 0.09 },
    amethyst:   { critDamagePct: 0.14 },
    diamond:    { playerDefensePct: 0.22 },
    nullstone:  { statusChancePct: 0.11 },
    fracteryl:  { critDamagePct: 0.11 },
    eigenstein: { weaponDamagePct: 0.11 },
  },
};

// ─── Application ──────────────────────────────────────────────────────────────

/**
 * Applies a weave tier effect's stat contribution to the target modifier object.
 * No-op when isApplied is false or when no scale entry exists for this combination.
 *
 * @param target     Modifier object to accumulate into (mutated in place).
 * @param tierId     Mote tier of the weave ingredient.
 * @param effectTier 1, 2, or 3.
 * @param magnitude  Rolled magnitude from WeaveTierEffect.
 * @param isApplied  Only applies when true.
 * @param refineMult Stat multiplier from weave refinement level (default 1.0).
 */
export function applyWeaveTierEffectToMods(
  target: WeaveTierModTarget,
  tierId: TierId,
  effectTier: WeaveTierEffectTier,
  magnitude: number,
  isApplied: boolean,
  refineMult = 1.0,
): void {
  if (!isApplied) return;
  const entry = WEAVE_TIER_EFFECT_SCALE[effectTier]?.[tierId];
  if (!entry) return;
  const keys = Object.keys(entry) as StatKey[];
  for (const key of keys) {
    const factor = entry[key];
    if (!factor) continue;
    target[key] += magnitude * factor * refineMult;
  }
}

// ─── UI formatting ────────────────────────────────────────────────────────────

const STAT_LABEL: Record<StatKey, (v: number) => string> = {
  weaponDamagePct:    (v) => `+${v.toFixed(1)}% DMG`,
  cooldownPct:        (v) => `-${v.toFixed(1)}% CD`,
  projectileSpeedPct: (v) => `+${v.toFixed(1)}% Proj Spd`,
  critChancePct:      (v) => `+${v.toFixed(1)}% CRIT`,
  critDamagePct:      (v) => `+${v.toFixed(1)}% CRIT DMG`,
  statusChancePct:    (v) => `+${v.toFixed(1)}% Status Pwr`,
  playerDefensePct:   (v) => `+${v.toFixed(1)}% DEF`,
};

/**
 * Returns a compact human-readable summary of what a tier effect contributes.
 * Examples: "-0.4% CD", "+0.8% DEF", "+0.7% CRIT / +0.3% CRIT DMG".
 * Returns an empty string for unimplemented tier/effectTier combinations.
 */
export function formatWeaveTierEffectContribution(
  tierId: TierId,
  effectTier: WeaveTierEffectTier,
  magnitude: number,
): string {
  const entry = WEAVE_TIER_EFFECT_SCALE[effectTier]?.[tierId];
  if (!entry) return '';
  const parts: string[] = [];
  const keys = Object.keys(entry) as StatKey[];
  for (const key of keys) {
    const factor = entry[key];
    if (!factor) continue;
    parts.push(STAT_LABEL[key](magnitude * factor));
  }
  return parts.join(' / ');
}
