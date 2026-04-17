export interface AchievementGroup {
  readonly id: string;
  readonly name: string;
  readonly icon: string;
}

export const ACHIEVEMENT_GROUPS: readonly AchievementGroup[] = [
  { id: 'earthen', name: 'Earthen Motes', icon: '🪨' },
  { id: 'blazing', name: 'Blazing Motes', icon: '🔥' },
  { id: 'golden', name: 'Golden Motes', icon: '✨' },
  { id: 'celestial', name: 'Celestial Motes', icon: '💎' },
  { id: 'secret', name: 'Secret Achievements', icon: '❓' },
] as const;

export const ACHIEVEMENT_GROUP_BY_ID: ReadonlyMap<string, AchievementGroup> = new Map(
  ACHIEVEMENT_GROUPS.map(group => [group.id, group]),
);
