import type { TierId } from '../tiers';
import type { CraftedWeaponIngredient } from './crafted-weapon-types';

export type ItemSourceType = 'normal' | 'elite' | 'boss' | 'milestone' | 'dev';

export type LensRarity = 'Common' | 'Uncommon' | 'Rare' | 'Epic' | 'Legendary' | 'Mythic';

export type LensEffectTier = 1 | 2 | 3;

export interface LensEffect {
  tierId: TierId;
  effectTier: LensEffectTier;
  /** Stable identifier e.g. "sand_t1", "ruby_t3". */
  key: string;
  /** Display name e.g. "Abraded", "Sand Spray", "Sandstorm Cascade". */
  name: string;
  /** Human-readable description of what this effect does in combat. */
  description: string;
  /** Numeric magnitude derived from mote investment via sqrt-log scaling. */
  magnitude: number;
  /** Quality roll [0,1] used for rarity classification only. */
  quality: number;
  rarity: LensRarity;
  /** True when the effect is active in combat. All T1/T2/T3 effects are implemented and applied. */
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
  /** Refinement level 0–3. 0 = unrefined (default, identical to pre-refinement behavior). Absent in old items = 0. */
  refinementLevel?: number;
  /** Source zone where this item dropped. Absent on pre-metadata items — treat as unknown. */
  sourceZone?: string;
  /** Wave number at drop time. Absent on pre-metadata items — treat as 0. */
  sourceWave?: number;
  /** How this item was obtained. Absent on pre-metadata items — treat as 'normal'. */
  sourceType?: ItemSourceType;
}
