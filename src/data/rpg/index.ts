export { WAVE_DEFINITIONS, getWaveDefinition } from './wave-definitions';
export type { WaveSpawn, WaveDefinition } from './wave-definitions';
export { WEAPON_DEFINITIONS, WEAPON_BY_ID } from './weapon-definitions';
export type { WeaponStats, WeaponDefinition, WeaponEffect } from './weapon-definitions';
export {
  createCraftedWeaponDefinition,
  computeCraftedWeaponComposition,
  formatCraftedWeaponModifier,
  getForgeCapacity,
  normalizeCraftedWeaponIngredients,
  registerCraftedWeapons,
  resolveWeaponDefinition,
} from './crafted-weapon-helpers';
export type {
  CraftedWeaponCompositionEntry,
  CraftedWeaponData,
  CraftedWeaponIngredient,
} from './crafted-weapon-types';
export { RPG_UPGRADE_DEFINITIONS, RPG_UPGRADE_BY_ID } from './rpg-upgrade-definitions';
export type { RpgUpgradeDefinition } from './rpg-upgrade-definitions';
export { RPG_ZONE_DEFINITIONS, RPG_ZONE_BY_ID, RPG_ZONE_IDS, getRpgZoneDisplayName } from './rpg-zone-definitions';
export type { RpgZoneId, RpgZoneDefinition, RpgSubzoneDefinition } from './rpg-zone-definitions';
