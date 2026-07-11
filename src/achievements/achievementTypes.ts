/**
 * achievementTypes.ts — types for the platform achievement sync framework.
 *
 * This is distinct from src/sim/achievements (the in-game bonus achievement
 * system). This framework only tracks progress toward external platform
 * achievements (Steam, Google Play, ...) and queues syncs to whichever
 * adapter is active. It never affects gameplay bonuses.
 */

export enum AchievementType {
  Standard = 'standard',
  Incremental = 'incremental',
}

export enum AchievementRarity {
  Common = 'common',
  Rare = 'rare',
  Hidden = 'hidden',
}

export interface AchievementDef {
  /** Stable internal id, used everywhere in game code. Never renamed once shipped. */
  id: string;
  type: AchievementType;
  rarity: AchievementRarity;
  name: string;
  description: string;
  /** Target count for Incremental achievements. Unused for Standard. */
  targetCount?: number;
  /** Platform-specific id mappings, filled in later once registered on each store. */
  platformIds: {
    steam?: string;
    googlePlay?: string;
  };
}

/**
 * A platform adapter mirrors unlock/progress state to an external achievement
 * service (Steam, Google Play, ...). All methods must resolve/return quickly
 * and must never throw — adapters guard their own availability.
 */
export interface AchievementPlatformAdapter {
  readonly name: string;
  /** Whether the underlying platform SDK is present and ready to receive calls. */
  isReady(): boolean;
  unlock(def: AchievementDef): Promise<void>;
  setProgress(def: AchievementDef, current: number, target: number): Promise<void>;
}
