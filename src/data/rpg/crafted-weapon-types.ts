import type { TierId } from '../tiers';
import type { WeaponDefinition } from './weapon-definitions';

export interface CraftedWeaponIngredient {
  tierId: TierId;
  refinedCount: number;
}

export interface CraftedWeaponCompositionEntry {
  tierId: TierId;
  weightedValue: number;
  share: number;
}

/**
 * Per-composition modifiers that apply at combat time, derived from the weapon's
 * tier composition. These are not baked into WeaponStats — they are runtime effects
 * looked up via resolveCraftedWeaponModifiers().
 */
export interface CraftedWeaponModifiers {
  /** Sapphire: probability of dealing 2× damage per hit (0–60, capped). */
  critChancePct: number;
  /**
   * Crit damage multiplier (base 2.0, scales slightly with totalWeightedMoteValue, capped at 3.0).
   * The crit system multiplies rawDamage by this value on a critical hit.
   */
  critDamageMultiplier: number;
  /** Diamond: fraction of enemy DEF ignored (0–1). Applied as defPierceRatio for non-piercing effects. */
  armorIgnorePct: number;
  /** Iolite: extra poison damage per tick added on top of the weapon's base effect. */
  poisonBonusDmg: number;
  /** Nullstone: pull radius in px (capped at 80). Non-zero means an on-hit black-hole pull is triggered. */
  nullstonePullRadius: number;
  /** Fracteryl: number of recursive follow-up strikes (capped at 10). Each deals decayed damage. */
  fracterylStrikes: number;
  /** Emerald: extra homing acquisition range in px. */
  emeraldAcquisitionRangePx: number;
  /** Amethyst: number of extra companion ships (capped at 10). */
  amethystShipCount: number;
}

export interface CraftedWeaponData {
  id: string;
  name: string;
  description: string;
  ingredients: CraftedWeaponIngredient[];
  composition: CraftedWeaponCompositionEntry[];
  dominantTierId: TierId;
  secondaryTierId: TierId;
  forgeCraftLevel: number;
  definition: WeaponDefinition;
  modifiers: CraftedWeaponModifiers;
  /** Sum of (refinedCount × tierForgeWeight) across all ingredients. Determines base level. */
  totalWeightedMoteValue: number;
  /** log10-derived level: Math.max(1, floor(log10(totalWeightedMoteValue + 1))). */
  baseLevel: number;
  /** Stat scaling multiplier derived from totalWeightedMoteValue via log10 scaling. */
  baseStatMultiplier: number;
}
