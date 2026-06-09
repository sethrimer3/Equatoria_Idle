export const CODEX_VISIBLE_MILESTONES = [10, 100, 1_000, 10_000] as const;
export const CODEX_SECRET_MILESTONE = 1_000_000;

export function getCodexBonusPercent(kills: number): number {
  if (kills >= CODEX_SECRET_MILESTONE) return CODEX_SECRET_MILESTONE;
  if (kills >= 10_000) return 10_000;
  if (kills >= 1_000) return 1_000;
  if (kills >= 100) return 100;
  if (kills >= 10) return 25;
  return 0;
}

export function getCodexMultiplier(kills: number): number {
  return 1 + getCodexBonusPercent(kills) / 100;
}

export function getNextVisibleCodexMilestone(kills: number): number | null {
  return CODEX_VISIBLE_MILESTONES.find(milestone => kills < milestone) ?? null;
}
