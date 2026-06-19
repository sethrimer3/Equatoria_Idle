/**
 * weave-passive-effects.ts — Central registry for all weave effect definitions.
 *
 * Both passive (always-on stat bonuses) and proc (triggered on game events)
 * effects are defined here. UI and rolling code both read from this module.
 * Effects are looked up by id at runtime; no display strings are hardcoded elsewhere.
 */

// ─── Passive effects ──────────────────────────────────────────────────────────

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
   * Actual rolled value = baseMaxValue × powerScale × rarityMult.
   *
   * IMPORTANT — scaling convention:
   *   Passive effect values are already the final percentage contribution to
   *   the stat. They do NOT go through the per-affix scaling factors used in
   *   addPercentByAffix (e.g. the ×0.25 applied to sand cooldown affixes).
   *   baseMaxValue must therefore be set conservatively relative to what those
   *   affixes produce at equivalent investment. The existing values were chosen
   *   to produce outputs roughly 30–60% of a comparable affix at the same tier.
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
    // citrine_all_loom affix feeds weaponDamagePct with ×0.35 scaling.
    // At powerScale=1, Uncommon: 4.0×0.45 = 1.8% vs affix Uncommon equivalent ~3%.
    baseMaxValue: 4.0,
  },
  weave_quickness: {
    id: 'weave_quickness',
    displayName: 'Quickened Stitch',
    description: (v) => `-${v.toFixed(1)}% attack cooldown`,
    category: 'passive',
    statKey: 'cooldownPct',
    // Sand affixes feed cooldownPct with ×0.25 scaling from a baseMaxValue of 18–20.
    // Effective sand output at powerScale=1, Uncommon quality: ~20×0.40×0.25 = 2%.
    // weave_quickness adds directly (no ×0.25 pass-through), so baseMaxValue is
    // set to 3.0 so Uncommon output = 3.0×0.45 = 1.35% — below the affix equivalent.
    baseMaxValue: 3.0,
  },
  weave_guard: {
    id: 'weave_guard',
    displayName: 'Guard Knot',
    // playerDefensePct multiplies the player's DEF stat (not a flat damage-reduction).
    // rpg-render: playerStats.def = baseDef × (1 + playerDefensePct / 100).
    description: (v) => `+${v.toFixed(1)}% DEF`,
    category: 'passive',
    statKey: 'playerDefensePct',
    // diamond_armor affix adds flat value directly to playerDefensePct (no scaling).
    // 3.5 at Uncommon rarityMult gives 3.5×0.45 = 1.6%, which is modest.
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
