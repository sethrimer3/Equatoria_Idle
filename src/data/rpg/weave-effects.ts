/**
 * weave-effects.ts — Aggregate passive effects from all equipped weaves.
 *
 * Only effects marked applied:true in weave-definitions.ts actually influence
 * gameplay. Others are rolled/stored/displayed but the stat line will note
 * "not yet applied" for anything not integrated.
 *
 * Caps per the design spec:
 *   upgrade cost reduction:       max 50%
 *   achievement requirement reduction: max 35%
 *   crafting rarity bonus:        max 30%
 *   RPG damage/defense bonuses:   max 100% (unless balance suggests lower)
 */

import type { CraftedWeaveData } from './weave-types';

export interface AggregatedWeaveEffects {
  /** Additive loom output multiplier bonus (e.g., 0.15 = +15%). Applied. */
  loomOutputBonus: number;
  /** Total upgrade cost reduction fraction. Capped at 0.50. Not yet applied. */
  upgradeCostReductionFrac: number;
  /** Total achievement requirement reduction fraction. Capped at 0.35. Not yet applied. */
  achievementReductionFrac: number;
  /** Total crafting rarity bonus fraction. Capped at 0.30. Not yet applied. */
  craftingRarityBonusFrac: number;
  /** Total RPG armor bonus (flat). Not yet applied. */
  rpgArmorBonus: number;
  /** Total RPG armor ignore fraction. Capped at 1.0. Not yet applied. */
  rpgArmorIgnoreFrac: number;
}

export const EMPTY_WEAVE_EFFECTS: AggregatedWeaveEffects = {
  loomOutputBonus: 0,
  upgradeCostReductionFrac: 0,
  achievementReductionFrac: 0,
  craftingRarityBonusFrac: 0,
  rpgArmorBonus: 0,
  rpgArmorIgnoreFrac: 0,
};

/**
 * Aggregates passive effects from all equipped weaves.
 * @param equippedWeaves Array of weaves currently in slots (nulls skipped).
 */
export function aggregateEquippedWeaveEffects(
  equippedWeaves: (CraftedWeaveData | null)[],
): AggregatedWeaveEffects {
  let loomOutputBonus = 0;
  let upgradeCostReductionFrac = 0;
  let achievementReductionFrac = 0;
  let craftingRarityBonusFrac = 0;
  let rpgArmorBonus = 0;
  let rpgArmorIgnoreFrac = 0;

  for (const weave of equippedWeaves) {
    if (!weave) continue;
    for (const affix of weave.affixes) {
      const v = affix.value / 100; // affixes store % values, convert to fraction
      switch (affix.affixId) {
        case 'citrine_all_loom':
          loomOutputBonus += v;
          break;
        case 'diamond_upgrade_cost':
        case 'nullstone_upgrade_cost':
          upgradeCostReductionFrac += v;
          break;
        case 'citrine_achievement_reduce':
        case 'nullstone_achievement_reduce':
          achievementReductionFrac += v;
          break;
        case 'sapphire_rare_affix_chance':
          craftingRarityBonusFrac += v;
          break;
        case 'diamond_armor':
          rpgArmorBonus += affix.value; // flat pts, not /%
          break;
        case 'diamond_armor_ignore':
          rpgArmorIgnoreFrac += v;
          break;
        default:
          // TODO: integrate remaining affix IDs as their respective systems are built
          break;
      }
    }
  }

  return {
    loomOutputBonus,
    upgradeCostReductionFrac: Math.min(0.50, upgradeCostReductionFrac),
    achievementReductionFrac: Math.min(0.35, achievementReductionFrac),
    craftingRarityBonusFrac: Math.min(0.30, craftingRarityBonusFrac),
    rpgArmorBonus,
    rpgArmorIgnoreFrac: Math.min(1.0, rpgArmorIgnoreFrac),
  };
}
