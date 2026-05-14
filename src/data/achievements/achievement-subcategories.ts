/**
 * Subcategory definitions for the RPG achievement group.
 * Subcategories allow the RPG accordion to be further sub-divided,
 * preventing the list from becoming unmanageably long.
 */

export interface AchievementSubcategory {
  readonly id: string;
  readonly groupId: string;
  readonly name: string;
  readonly icon: string;
}

/**
 * Ordered list of RPG subcategories.
 * Only the 'rpg' group uses subcategories; other groups display achievements
 * directly in their accordion content.
 */
export const ACHIEVEMENT_SUBCATEGORIES: readonly AchievementSubcategory[] = [
  { id: 'rpg_wave_progression', groupId: 'rpg', name: 'Wave Progression',   icon: '🌊' },
  { id: 'rpg_bosses',           groupId: 'rpg', name: 'Bosses',              icon: '💀' },
  { id: 'rpg_xp_stats',        groupId: 'rpg', name: 'XP & Stats',          icon: '📈' },
  { id: 'rpg_weapons_purchased',groupId: 'rpg', name: 'Weapons Purchased',   icon: '🛒' },
  { id: 'rpg_weapon_upgrades',  groupId: 'rpg', name: 'Weapon Upgrades',     icon: '⬆️' },
  { id: 'rpg_rpg_upgrades',     groupId: 'rpg', name: 'RPG Upgrades',        icon: '🔧' },
  { id: 'rpg_regular_enemies',  groupId: 'rpg', name: 'Regular Enemies',     icon: '👾' },
  { id: 'rpg_elite_enemies',    groupId: 'rpg', name: 'Elite Enemies',       icon: '⭐' },
  { id: 'rpg_aliven_enemies',   groupId: 'rpg', name: 'Aliven Enemies',      icon: '🫧' },
  { id: 'rpg_lucky_motes',      groupId: 'rpg', name: 'Lucky Motes',         icon: '🍀' },
  { id: 'rpg_challenge',        groupId: 'rpg', name: 'Challenge',           icon: '🏅' },
] as const;

export const ACHIEVEMENT_SUBCATEGORY_BY_ID: ReadonlyMap<string, AchievementSubcategory> = new Map(
  ACHIEVEMENT_SUBCATEGORIES.map(sub => [sub.id, sub]),
);
