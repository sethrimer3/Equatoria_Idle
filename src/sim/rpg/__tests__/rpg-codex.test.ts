import { describe, expect, it } from 'vitest';
import { getCodexBonusPercent, getCodexMultiplier, getNextVisibleCodexMilestone } from '../rpg-codex';

describe('RPG codex mastery', () => {
  it('applies the visible milestone bonuses', () => {
    expect(getCodexBonusPercent(9)).toBe(0);
    expect(getCodexBonusPercent(10)).toBe(25);
    expect(getCodexBonusPercent(100)).toBe(100);
    expect(getCodexBonusPercent(1_000)).toBe(1_000);
    expect(getCodexBonusPercent(10_000)).toBe(10_000);
  });

  it('applies but does not reveal the secret million-kill tier', () => {
    expect(getCodexMultiplier(1_000_000)).toBe(10_001);
    expect(getNextVisibleCodexMilestone(10_000)).toBeNull();
  });
});
