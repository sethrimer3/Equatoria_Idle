/**
 * achievementRegistry.ts — central registry of platform-facing achievement stubs.
 *
 * Internal IDs here are stable and independent from src/sim/achievements ids.
 * Platform ids are placeholders until each store's achievement is created.
 */

import { AchievementDef, AchievementRarity, AchievementType } from './achievementTypes';

export const ACHIEVEMENT_REGISTRY: AchievementDef[] = [
  // ── Standard ──────────────────────────────────────────────────
  {
    id: 'FIRST_BLOOD',
    type: AchievementType.Standard,
    rarity: AchievementRarity.Common,
    name: 'First Blood',
    description: 'Defeat your first enemy.',
    platformIds: { steam: 'ACH_FIRST_BLOOD', googlePlay: 'TODO_FIRST_BLOOD' },
  },
  {
    id: 'BOSS_SLAYER',
    type: AchievementType.Standard,
    rarity: AchievementRarity.Common,
    name: 'Boss Slayer',
    description: 'Defeat your first boss.',
    platformIds: { steam: 'ACH_BOSS_SLAYER', googlePlay: 'TODO_BOSS_SLAYER' },
  },
  {
    id: 'MOTE_AWAKENED',
    type: AchievementType.Standard,
    rarity: AchievementRarity.Common,
    name: 'Mote Awakened',
    description: 'Forge your first weapon from motes.',
    platformIds: { steam: 'ACH_MOTE_AWAKENED', googlePlay: 'TODO_MOTE_AWAKENED' },
  },
  {
    id: 'SKILL_UNLOCKED',
    type: AchievementType.Standard,
    rarity: AchievementRarity.Common,
    name: 'Skill Unlocked',
    description: 'Spend your first skill point.',
    platformIds: { steam: 'ACH_SKILL_UNLOCKED', googlePlay: 'TODO_SKILL_UNLOCKED' },
  },
  {
    id: 'ZONE_EXPLORER',
    type: AchievementType.Standard,
    rarity: AchievementRarity.Common,
    name: 'Zone Explorer',
    description: 'Enter a zone beyond the starting area.',
    platformIds: { steam: 'ACH_ZONE_EXPLORER', googlePlay: 'TODO_ZONE_EXPLORER' },
  },
  {
    id: 'LIFE_DISCOVERED',
    type: AchievementType.Standard,
    rarity: AchievementRarity.Rare,
    name: 'Life Discovered',
    description: 'Discover the secret Life zone.',
    platformIds: { steam: 'ACH_LIFE_DISCOVERED', googlePlay: 'TODO_LIFE_DISCOVERED' },
  },

  // ── Incremental ───────────────────────────────────────────────
  {
    id: 'ENEMY_COUNT_100',
    type: AchievementType.Incremental,
    rarity: AchievementRarity.Common,
    name: 'Hundredfold',
    description: 'Defeat 100 enemies.',
    targetCount: 100,
    platformIds: { steam: 'ACH_ENEMY_COUNT_100', googlePlay: 'TODO_ENEMY_COUNT_100' },
  },
  {
    id: 'ENEMY_COUNT_1000',
    type: AchievementType.Incremental,
    rarity: AchievementRarity.Rare,
    name: 'Thousandfold',
    description: 'Defeat 1000 enemies.',
    targetCount: 1000,
    platformIds: { steam: 'ACH_ENEMY_COUNT_1000', googlePlay: 'TODO_ENEMY_COUNT_1000' },
  },
  {
    id: 'MOTE_COUNT_50',
    type: AchievementType.Incremental,
    rarity: AchievementRarity.Common,
    name: 'Prolific Forger',
    description: 'Forge 50 motes into equipment.',
    targetCount: 50,
    platformIds: { steam: 'ACH_MOTE_COUNT_50', googlePlay: 'TODO_MOTE_COUNT_50' },
  },
  {
    id: 'BOSS_COUNT_10',
    type: AchievementType.Incremental,
    rarity: AchievementRarity.Rare,
    name: 'Boss Hunter',
    description: 'Defeat 10 bosses.',
    targetCount: 10,
    platformIds: { steam: 'ACH_BOSS_COUNT_10', googlePlay: 'TODO_BOSS_COUNT_10' },
  },

  // ── Hidden ────────────────────────────────────────────────────
  {
    id: 'GLASS_CANNON',
    type: AchievementType.Standard,
    rarity: AchievementRarity.Hidden,
    name: '???',
    description: 'Clear a wave with a single weapon equipped.',
    platformIds: { steam: 'ACH_GLASS_CANNON', googlePlay: 'TODO_GLASS_CANNON' },
  },
  {
    id: 'NEAR_DEATH_CLEAR',
    type: AchievementType.Standard,
    rarity: AchievementRarity.Hidden,
    name: '???',
    description: 'Clear a wave with 1 HP remaining.',
    platformIds: { steam: 'ACH_NEAR_DEATH_CLEAR', googlePlay: 'TODO_NEAR_DEATH_CLEAR' },
  },
];

export const ACHIEVEMENT_REGISTRY_BY_ID: Map<string, AchievementDef> = new Map(
  ACHIEVEMENT_REGISTRY.map(def => [def.id, def]),
);
