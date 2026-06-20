/**
 * weave-effects-registry.ts — Central registry for all weave effect definitions.
 *
 * Both passive (always-on stat bonuses) and proc (triggered on game events)
 * effects are defined here. UI, rolling code, and runtime hooks all read from
 * this module. Effects are looked up by id at runtime; no display strings are
 * hardcoded elsewhere.
 *
 * Metadata fields on each effect:
 *   role    — combat role used by UI grouping and future query helpers.
 *   flavors — mote tier IDs that are thematically aligned with this effect.
 *             Rolling logic gives flavored effects higher weight when the weave
 *             contains matching ingredient tiers.
 *   minRarity — lowest rarity at which this effect can be rolled (default: 'Uncommon').
 *   weight    — base selection weight relative to other effects (default: 1.0).
 */

import type { TierId } from '../tiers';
import type { WeaveRarity } from './weave-types';

// ─── Shared metadata types ────────────────────────────────────────────────────

export type WeaveEffectRole = 'offense' | 'defense' | 'utility';

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
   *   affixes produce at equivalent investment.
   */
  readonly baseMaxValue: number;
  /** Combat role for UI grouping and pool filtering. */
  readonly role: WeaveEffectRole;
  /**
   * Mote tiers that are thematically aligned with this effect.
   * Rolling code multiplies this effect's weight by FLAVOR_MATCH_MULTIPLIER
   * when the weave contains any matching ingredient tier.
   */
  readonly flavors: readonly TierId[];
  /** Minimum rarity for this effect to be eligible for rolling. Default: 'Uncommon'. */
  readonly minRarity?: WeaveRarity;
  /** Base selection weight (default 1.0). */
  readonly weight?: number;
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
    role: 'offense',
    flavors: ['citrine', 'ruby', 'diamond'],
  },
  weave_quickness: {
    id: 'weave_quickness',
    displayName: 'Quickened Stitch',
    description: (v) => `-${v.toFixed(1)}% attack cooldown`,
    category: 'passive',
    statKey: 'cooldownPct',
    // Sand affixes feed cooldownPct with ×0.25 scaling from a baseMaxValue of 18–20.
    // weave_quickness adds directly (no ×0.25 pass-through), so baseMaxValue is
    // set to 3.0 so Uncommon output = 3.0×0.45 = 1.35% — below the affix equivalent.
    baseMaxValue: 3.0,
    role: 'offense',
    flavors: ['sand', 'quartz'],
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
    role: 'defense',
    flavors: ['diamond'],
  },
} as const;

export const ALL_WEAVE_PASSIVE_EFFECT_IDS: readonly WeavePassiveEffectId[] = [
  'weave_focus',
  'weave_quickness',
  'weave_guard',
];

/** Returns the def for a given passive id, or null if the id is unknown/invalid. */
export function getWeavePassiveEffectDef(id: string): WeavePassiveEffectDef | null {
  return (WEAVE_PASSIVE_EFFECT_REGISTRY as Record<string, WeavePassiveEffectDef>)[id] ?? null;
}

// ─── Proc effects ─────────────────────────────────────────────────────────────

export type WeaveProcTrigger = 'playerDamaged' | 'playerHitEnemy';
export type WeaveProcEffectId = 'weave_reactive_ward' | 'weave_echo_strike' | 'weave_swiftstrike' | 'weave_ember_surge' | 'weave_aegis_flash' | 'weave_lingering_hex';

export interface WeaveProcEffectDef {
  readonly id: WeaveProcEffectId;
  readonly displayName: string;
  readonly description: (value: number) => string;
  readonly category: 'proc';
  readonly trigger: WeaveProcTrigger;
  /** Percent chance [0–100] to proc on the trigger event. */
  readonly baseChancePct: number;
  /** How long the buff lasts in milliseconds. */
  readonly durationMs: number;
  /**
   * Maximum value at powerScale = 1.0 and Mythic rarity.
   * Actual value = baseMaxValue × powerScale × rarityMult.
   */
  readonly baseMaxValue: number;
  /** Combat role for UI grouping and pool filtering. */
  readonly role: WeaveEffectRole;
  /** Mote tiers thematically aligned with this proc. */
  readonly flavors: readonly TierId[];
  /** Minimum rarity for this effect to be eligible for rolling. Default: 'Uncommon'. */
  readonly minRarity?: WeaveRarity;
  /** Base selection weight (default 1.0). */
  readonly weight?: number;
}

export const WEAVE_PROC_EFFECT_REGISTRY: Readonly<Record<WeaveProcEffectId, WeaveProcEffectDef>> = {
  weave_reactive_ward: {
    id: 'weave_reactive_ward',
    displayName: 'Reactive Ward',
    description: (v) => `10% chance on hit taken: +${v.toFixed(1)}% DEF for 3.0s`,
    category: 'proc',
    trigger: 'playerDamaged',
    baseChancePct: 10,
    durationMs: 3000,
    baseMaxValue: 15,
    role: 'defense',
    flavors: ['diamond', 'sapphire'],
  },
  weave_echo_strike: {
    id: 'weave_echo_strike',
    displayName: 'Echo Strike',
    description: (v) => `10% chance on hit: +${v.toFixed(1)}% bonus damage`,
    category: 'proc',
    trigger: 'playerHitEnemy',
    baseChancePct: 10,
    durationMs: 0, // no buff — instant bonus damage
    // At Uncommon/powerScale≈1: 30×0.45=13.5%; at Mythic/powerScale≈2: 30×1.0×~2=60%.
    // Kept modest — echo bypasses DEF so effective damage amplification is meaningful.
    baseMaxValue: 30,
    role: 'offense',
    flavors: ['amethyst', 'fracteryl', 'eigenstein'],
  },
  weave_swiftstrike: {
    id: 'weave_swiftstrike',
    displayName: 'Swiftstrike',
    description: (v) => `10% chance on hit: -${v.toFixed(1)}% attack cooldown for 2.0s`,
    category: 'proc',
    trigger: 'playerHitEnemy',
    baseChancePct: 10,
    durationMs: 2000,
    // At Uncommon/powerScale≈1: 8×0.45=3.6%; at Mythic/powerScale≈2: 8×1.0×~2=16%.
    // Stacks additively with passive weave_quickness; subject to the same 60% cap.
    baseMaxValue: 8,
    role: 'offense',
    flavors: ['sand', 'quartz'],
    minRarity: 'Uncommon',
    weight: 1.0,
  },
  weave_ember_surge: {
    id: 'weave_ember_surge',
    displayName: 'Ember Surge',
    description: (v) => `10% chance on hit: +${v.toFixed(1)}% weapon damage for 2.5s`,
    category: 'proc',
    trigger: 'playerHitEnemy',
    baseChancePct: 10,
    durationMs: 2500,
    // At Uncommon/powerScale≈1: 10×0.45=4.5%; at Mythic/powerScale≈2: 10×1.0×~2=20%.
    // Stacks additively with passive weave_focus and lens weaponDamagePct; subject to the 100% cap.
    baseMaxValue: 10,
    role: 'offense',
    flavors: ['citrine', 'ruby'],
    minRarity: 'Uncommon',
    weight: 1.0,
  },
  weave_aegis_flash: {
    id: 'weave_aegis_flash',
    displayName: 'Aegis Flash',
    description: (v) => `8% chance when damaged: +${v.toFixed(1)}% DEF for 1.5s`,
    category: 'proc',
    trigger: 'playerDamaged',
    baseChancePct: 8,
    durationMs: 1500,
    // At Uncommon/powerScale≈1: 24×0.45=10.8%; at Mythic/powerScale≈2: 24×1.0×~2=48%.
    // Shorter and stronger than weave_reactive_ward (15, 3000ms) — a burst rather than steady defense.
    baseMaxValue: 24,
    role: 'defense',
    flavors: ['diamond', 'sapphire'],
    minRarity: 'Uncommon',
    weight: 1.0,
  },
  weave_lingering_hex: {
    id: 'weave_lingering_hex',
    displayName: 'Lingering Hex',
    description: (v) => `8% chance on hit: enemy takes +${v.toFixed(1)}% damage for 3.0s`,
    category: 'proc',
    trigger: 'playerHitEnemy',
    baseChancePct: 8,
    durationMs: 3000,
    // At Uncommon/powerScale≈1: 8×0.45=3.6%; at Mythic/powerScale≈2: 8×1.0×~2=16%.
    // Modest value — applies to ALL subsequent hits during the window, making it
    // valuable against tanky enemies while staying balanced for fast-kill encounters.
    baseMaxValue: 8,
    role: 'offense',
    flavors: ['iolite', 'amethyst'],
    minRarity: 'Uncommon',
    weight: 1.0,
  },
} as const;

// ─── Unified effect types ─────────────────────────────────────────────────────

export type WeaveEffectId = WeavePassiveEffectId | WeaveProcEffectId;
export type WeaveEffectDef = WeavePassiveEffectDef | WeaveProcEffectDef;

export const ALL_WEAVE_EFFECT_IDS: readonly WeaveEffectId[] = [
  'weave_focus',
  'weave_quickness',
  'weave_guard',
  'weave_reactive_ward',
  'weave_echo_strike',
  'weave_swiftstrike',
  'weave_ember_surge',
  'weave_aegis_flash',
  'weave_lingering_hex',
];

/** Returns the def for a given id (passive or proc), or null if unknown. */
export function getWeaveEffectDef(id: string): WeaveEffectDef | null {
  return (WEAVE_PASSIVE_EFFECT_REGISTRY as Record<string, WeaveEffectDef>)[id]
    ?? (WEAVE_PROC_EFFECT_REGISTRY as Record<string, WeaveEffectDef>)[id]
    ?? null;
}
