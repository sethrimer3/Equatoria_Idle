/**
 * Subcategory definitions for the Motes, Equation, and RPG achievement groups.
 * Subcategories allow large groups to be further sub-divided, preventing the
 * list from becoming unmanageably long.
 */

export interface AchievementSubcategory {
  readonly id: string;
  readonly groupId: string;
  readonly name: string;
  readonly icon: string;
}

export const ACHIEVEMENT_SUBCATEGORIES: readonly AchievementSubcategory[] = [
  // ── Motes subcategories ──────────────────────────────────────────
  { id: 'motes_first',      groupId: 'motes', name: 'First Motes',          icon: '✨' },
  { id: 'motes_sand',       groupId: 'motes', name: 'Sand Milestones',       icon: '🟡' },
  { id: 'motes_quartz',     groupId: 'motes', name: 'Quartz Milestones',     icon: '⬜' },
  { id: 'motes_ruby',       groupId: 'motes', name: 'Ruby Milestones',       icon: '🔴' },
  { id: 'motes_sunstone',   groupId: 'motes', name: 'Sunstone Milestones',   icon: '🟠' },
  { id: 'motes_citrine',    groupId: 'motes', name: 'Citrine Milestones',    icon: '🌕' },
  { id: 'motes_emerald',    groupId: 'motes', name: 'Emerald Milestones',    icon: '🟢' },
  { id: 'motes_sapphire',   groupId: 'motes', name: 'Sapphire Milestones',   icon: '🔵' },
  { id: 'motes_iolite',     groupId: 'motes', name: 'Iolite Milestones',     icon: '🟣' },
  { id: 'motes_amethyst',   groupId: 'motes', name: 'Amethyst Milestones',   icon: '💜' },
  { id: 'motes_diamond',    groupId: 'motes', name: 'Diamond Milestones',    icon: '💎' },
  { id: 'motes_nullstone',  groupId: 'motes', name: 'Nullstone Milestones',  icon: '🌑' },
  { id: 'motes_fracteryl',  groupId: 'motes', name: 'Fracteryl Milestones',  icon: '🔮' },
  { id: 'motes_eigenstein', groupId: 'motes', name: 'Eigenstein Milestones', icon: '🌋' },
  { id: 'motes_cross_tier', groupId: 'motes', name: 'Cross-Tier Milestones', icon: '🌈' },
  { id: 'motes_size',       groupId: 'motes', name: 'Mote Size Milestones',  icon: '📦' },
  { id: 'motes_aliven',     groupId: 'motes', name: 'Aliven Mote Milestones',icon: '💫' },
  // ── Equation subcategories ───────────────────────────────────────
  { id: 'eq_forge_unlock',  groupId: 'equation', name: 'Forge Unlocks',               icon: '🔥' },
  { id: 'eq_taps',          groupId: 'equation', name: 'Equation Taps',               icon: '👆' },
  { id: 'eq_tier_unlocks',  groupId: 'equation', name: 'Equation Tier Unlocks',       icon: '🔓' },
  { id: 'eq_upgrade_levels',groupId: 'equation', name: 'Equation Upgrade Levels',     icon: '⬆️' },
  { id: 'eq_per_tier',      groupId: 'equation', name: 'Per-Tier Equation Mastery',   icon: '🏆' },
  { id: 'eq_structured',    groupId: 'equation', name: 'Structured Equation Milestones', icon: '📐' },
  { id: 'eq_output',        groupId: 'equation', name: 'Output Milestones',           icon: '📊' },
  { id: 'eq_tap_gain',      groupId: 'equation', name: 'Tap Gain Milestones',         icon: '💎' },
  { id: 'eq_long_term',     groupId: 'equation', name: 'Long-Term Equation Progression', icon: '🌟' },
  // ── RPG subcategories ────────────────────────────────────────────
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

