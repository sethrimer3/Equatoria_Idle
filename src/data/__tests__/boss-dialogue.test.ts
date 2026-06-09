import { describe, expect, it } from 'vitest';
import { BOSS_DIALOGUE, getBossDialogueKey } from '../boss-dialogue';

describe('boss dialogue data', () => {
  it('uses stable boss-specific keys', () => {
    expect(getBossDialogueKey(1)).toBe('boss_1');
    expect(BOSS_DIALOGUE.bosses[getBossDialogueKey(1)]?.name).toBe('The First Axiom');
  });

  it('provides safe generic fallbacks for major lifecycle events', () => {
    expect(BOSS_DIALOGUE.defaults.BOSS_SPAWNED?.length).toBeGreaterThan(0);
    expect(BOSS_DIALOGUE.defaults.PHASE_CHANGED?.length).toBeGreaterThan(0);
    expect(BOSS_DIALOGUE.defaults.BOSS_DEFEATED?.length).toBeGreaterThan(0);
  });
});
