export interface AchievementGroup {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
}

export const ACHIEVEMENT_GROUPS: readonly AchievementGroup[] = [
  { id: 'motes',    name: 'Motes',    icon: '✨' },
  { id: 'equation', name: 'Equation', icon: '∑' },
  { id: 'rpg',      name: 'RPG',      icon: '⚔️' },
  { id: 'secret',   name: 'Secret Achievements', icon: '❓' },
] as const;

export const ACHIEVEMENT_GROUP_BY_ID: ReadonlyMap<string, AchievementGroup> = new Map(
  ACHIEVEMENT_GROUPS.map(group => [group.id, group]),
);
