/**
 * weave-passive-effects.ts — Central registry for weave passive effect definitions.
 *
 * Effects are looked up by id at runtime. UI reads display names and descriptions
 * from this registry rather than hardcoding strings in the UI layer.
 *
 * Only 'passive' category effects are implemented. Proc/status/visual effects are
 * not part of this module.
 */

/** Stable string union of all implemented passive effect ids. */
export type WeavePassiveEffectId = 'weave_focus' | 'weave_quickness' | 'weave_guard';

export interface WeavePassiveEffectDef {
  readonly id: WeavePassiveEffectId;
  /** Short display name shown in the item card. */
  readonly displayName: string;
  /** Returns a formatted description string for a given rolled value. */
  readonly description: (value: number) => string;
  readonly category: 'passive';
  /**
   * Which EquipmentCombatModifiers key this effect contributes to.
   * Must correspond to a field that already exists in that interface.
   */
  readonly statKey: 'weaponDamagePct' | 'cooldownPct' | 'playerDefensePct';
  /**
   * Maximum value at powerScale = 1.0 (minimal mote investment).
   * Actual rolled value = baseMaxValue × powerScale × quality, capped by
   * the combat modifier clamp applied downstream.
   */
  readonly baseMaxValue: number;
}

export const WEAVE_PASSIVE_EFFECT_REGISTRY: Readonly<Record<WeavePassiveEffectId, WeavePassiveEffectDef>> = {
  weave_focus: {
    id: 'weave_focus',
    displayName: 'Focus Thread',
    description: (v) => `+${v.toFixed(1)}% weapon damage`,
    category: 'passive',
    statKey: 'weaponDamagePct',
    baseMaxValue: 4.0,
  },
  weave_quickness: {
    id: 'weave_quickness',
    displayName: 'Quick Thread',
    description: (v) => `-${v.toFixed(1)}% attack cooldown`,
    category: 'passive',
    statKey: 'cooldownPct',
    baseMaxValue: 3.0,
  },
  weave_guard: {
    id: 'weave_guard',
    displayName: 'Guard Knot',
    description: (v) => `+${v.toFixed(1)}% damage reduction`,
    category: 'passive',
    statKey: 'playerDefensePct',
    baseMaxValue: 3.5,
  },
} as const;

export const ALL_WEAVE_PASSIVE_EFFECT_IDS: readonly WeavePassiveEffectId[] = [
  'weave_focus',
  'weave_quickness',
  'weave_guard',
];

/** Returns the def for a given id, or null if the id is unknown/invalid. */
export function getWeavePassiveEffectDef(id: string): WeavePassiveEffectDef | null {
  return (WEAVE_PASSIVE_EFFECT_REGISTRY as Record<string, WeavePassiveEffectDef>)[id] ?? null;
}
