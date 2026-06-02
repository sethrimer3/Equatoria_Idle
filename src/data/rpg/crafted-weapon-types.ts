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
}
