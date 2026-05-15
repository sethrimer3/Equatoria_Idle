export type { AchievementBonusKind, AchievementCondition, AchievementDefinition } from './achievement-definition-types';
import type { AchievementDefinition } from './achievement-definition-types';
import { MOTES_ACHIEVEMENTS } from './achievement-definitions-motes';
import { EQUATION_ACHIEVEMENTS } from './achievement-definitions-equation';
import { RPG_ACHIEVEMENTS, RPG_NUMBERED_ACHIEVEMENTS } from './achievement-definitions-rpg';
import { SECRET_ACHIEVEMENTS } from './achievement-definitions-secret';

// ─── Combined list ────────────────────────────────────────────────

export const ACHIEVEMENT_DEFINITIONS: readonly AchievementDefinition[] = [
  ...MOTES_ACHIEVEMENTS,
  ...EQUATION_ACHIEVEMENTS,
  ...RPG_ACHIEVEMENTS,
  ...RPG_NUMBERED_ACHIEVEMENTS,
  ...SECRET_ACHIEVEMENTS,
];

/** Quick lookup by achievement id. */
export const ACHIEVEMENT_BY_ID: ReadonlyMap<string, AchievementDefinition> = new Map(
  ACHIEVEMENT_DEFINITIONS.map(a => [a.id, a]),
);
