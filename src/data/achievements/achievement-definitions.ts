import type { TierId } from '../tiers';

/**
 * What kind of bonus an achievement grants.
 * - tap_multiplier: multiplies all tap mote gains
 * - loom_multiplier: multiplies all loom production rates
 */
export type AchievementBonusKind = 'tap_multiplier' | 'loom_multiplier';

/** Single achievement definition — read-only data. */
export interface AchievementDefinition {
  readonly id: string;
  readonly displayName: string;
  readonly description: string;
  /** The tier whose lifetime motes are checked for the unlock requirement. */
  readonly requiresTierId: TierId;
  /** Minimum lifetime motes of requiresTierId needed. */
  readonly requiresLifetimeMotes: number;
  readonly bonusKind: AchievementBonusKind;
  /** Multiplicative bonus value (e.g. 1.05 = +5%). */
  readonly bonusMultiplier: number;
}

/**
 * One achievement for each of the first 9 tiers (sand through amethyst).
 * The last two tiers (diamond, nullstone) are intentionally excluded.
 */
export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  {
    id: 'first_grain',
    displayName: 'First Grain',
    description: 'Earn your first Sand mote.',
    requiresTierId: 'sand',
    requiresLifetimeMotes: 1,
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.05,
  },
  {
    id: 'crystal_clear',
    displayName: 'Crystal Clear',
    description: 'Earn your first Quartz mote.',
    requiresTierId: 'quartz',
    requiresLifetimeMotes: 1,
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.05,
  },
  {
    id: 'fire_starter',
    displayName: 'Fire Starter',
    description: 'Earn your first Ruby mote.',
    requiresTierId: 'ruby',
    requiresLifetimeMotes: 1,
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.10,
  },
  {
    id: 'solar_flare',
    displayName: 'Solar Flare',
    description: 'Earn your first Sunstone mote.',
    requiresTierId: 'sunstone',
    requiresLifetimeMotes: 1,
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.10,
  },
  {
    id: 'golden_ratio',
    displayName: 'Golden Ratio',
    description: 'Earn your first Citrine mote.',
    requiresTierId: 'citrine',
    requiresLifetimeMotes: 1,
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.15,
  },
  {
    id: 'verdant_growth',
    displayName: 'Verdant Growth',
    description: 'Earn your first Emerald mote.',
    requiresTierId: 'emerald',
    requiresLifetimeMotes: 1,
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.15,
  },
  {
    id: 'ocean_depths',
    displayName: 'Ocean Depths',
    description: 'Earn your first Sapphire mote.',
    requiresTierId: 'sapphire',
    requiresLifetimeMotes: 1,
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.25,
  },
  {
    id: 'violet_veil',
    displayName: 'Violet Veil',
    description: 'Earn your first Iolite mote.',
    requiresTierId: 'iolite',
    requiresLifetimeMotes: 1,
    bonusKind: 'loom_multiplier',
    bonusMultiplier: 1.25,
  },
  {
    id: 'twilight_crown',
    displayName: 'Twilight Crown',
    description: 'Earn your first Amethyst mote.',
    requiresTierId: 'amethyst',
    requiresLifetimeMotes: 1,
    bonusKind: 'tap_multiplier',
    bonusMultiplier: 1.50,
  },
] as const;

/** Quick lookup by achievement id. */
export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDefinition> = new Map(
  ACHIEVEMENT_DEFINITIONS.map(a => [a.id, a]),
);
