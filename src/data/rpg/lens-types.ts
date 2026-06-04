import type { TierId } from '../tiers';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';

export type LensRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export type LensEffectTier = 1 | 2 | 3;

export interface LensEffect {
  tierId: TierId;
  effectTier: LensEffectTier;
  /** Stable identifier e.g. "sand_t1", "ruby_t3". */
  key: string;
  /** Display name including STUB suffix e.g. "Abraded STUB". */
  name: string;
  /** Always "STUB: effect behavior not implemented yet." */
  description: string;
  /** Numeric magnitude derived from mote investment via sqrt-log scaling. */
  magnitude: number;
  /** Quality roll [0,1] used for rarity classification only. */
  quality: number;
  rarity: LensRarity;
  /** True for Tier 1 effects (active combat integration). False for Tier 2/3 (STUB). */
  isApplied: boolean;
}

export interface CraftedLensData {
  id: string;
  type: 'lens';
  name: string;
  ingredients: CraftedWeaponIngredient[];
  totalWeightedMoteValue: number;
  forgeCraftLevel: number;
  effects: LensEffect[];
}
