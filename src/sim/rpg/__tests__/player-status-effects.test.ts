/**
 * player-status-effects.test.ts — Tests for the player-side status effect system.
 *
 * Covers:
 *   1. Status Resistance skill reduces duration
 *   2. Rank 3 reaches 40% floor
 *   3. Duration clamped to minimum
 *   4. Reapplying refreshes duration and maximises magnitude
 *   5. Burning and poison tick HP
 *   6. Movement multipliers clamp correctly
 *   7. timeWarped returns expected cadence multiplier
 *   8. Statuses expire and are removed
 *   9. clearPlayerStatuses removes all statuses
 *  10. hasPlayerStatus / getActivePlayerStatuses query helpers
 */

import { describe, it, expect } from 'vitest';
import {
  applyPlayerStatus,
  clearPlayerStatuses,
  tickPlayerStatuses,
  getPlayerMovementStatusMultiplier,
  getPlayerAttackSpeedStatusMultiplier,
  getActivePlayerStatuses,
  hasPlayerStatus,
  BURN_DPS_PER_MAG,
  POISON_DPS_PER_MAG,
  FROZEN_MOVEMENT_MULT,
  SLOWED_MOVEMENT_MULT,
  TIMEWARP_CADENCE_MULT,
  STATUS_MIN_DURATION_MS,
  STATUS_RESISTANCE_MIN_MULT,
  STATUS_RESISTANCE_PER_RANK,
  type PlayerStatusParams,
} from '../player-status-effects';
import { PLAYER_FROZEN_COOLDOWN_MS } from '../../../data/rpg/status-balance';
import type { RpgSimState } from '../rpg-state';

// ── Minimal sim-state factory ──────────────────────────────────────────────────

function makeSim(resistanceRank = 0): Pick<RpgSimState, 'activePlayerStatuses' | 'rpgUpgradeLevels'> {
  const upgradeLevels = new Map<string, number>();
  if (resistanceRank > 0) upgradeLevels.set('status_resistance', resistanceRank);
  return {
    activePlayerStatuses: [],
    rpgUpgradeLevels: upgradeLevels,
  };
}

function makeStats(hp = 100, maxHp = 100) {
  return { hp, maxHp };
}

// ── Status param helpers ───────────────────────────────────────────────────────

function burning(overrides: Partial<PlayerStatusParams> = {}): PlayerStatusParams {
  return { key: 'burning', durationMs: 3000, magnitude: 10, tickEveryMs: 1000, ...overrides };
}
function poisoned(overrides: Partial<PlayerStatusParams> = {}): PlayerStatusParams {
  return { key: 'poisoned', durationMs: 5000, magnitude: 10, tickEveryMs: 1000, ...overrides };
}
function chilled(overrides: Partial<PlayerStatusParams> = {}): PlayerStatusParams {
  return { key: 'chilled', durationMs: 2500, magnitude: 10, ...overrides };
}
function frozen(overrides: Partial<PlayerStatusParams> = {}): PlayerStatusParams {
  return { key: 'frozen', durationMs: 1200, magnitude: 10, ...overrides };
}
function slowed(overrides: Partial<PlayerStatusParams> = {}): PlayerStatusParams {
  return { key: 'slowed', durationMs: 2000, magnitude: 10, ...overrides };
}
function timeWarped(overrides: Partial<PlayerStatusParams> = {}): PlayerStatusParams {
  return { key: 'timeWarped', durationMs: 3500, magnitude: 10, ...overrides };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('player-status-effects — 1. Status Resistance reduces duration', () => {
  it('rank 0 leaves duration unchanged', () => {
    const sim = makeSim(0) as RpgSimState;
    applyPlayerStatus(sim, burning({ durationMs: 3000 }));
    const s = getActivePlayerStatuses(sim).find(x => x.key === 'burning');
    expect(s).toBeDefined();
    expect(s!.durationMs).toBeCloseTo(3000, 0);
  });

  it('rank 1 reduces duration by one step', () => {
    const sim = makeSim(1) as RpgSimState;
    applyPlayerStatus(sim, burning({ durationMs: 3000 }));
    const s = getActivePlayerStatuses(sim).find(x => x.key === 'burning')!;
    const expected = 3000 * (1 - STATUS_RESISTANCE_PER_RANK * 1);
    expect(s.durationMs).toBeCloseTo(expected, 0);
  });

  it('rank 2 reduces duration by two steps', () => {
    const sim = makeSim(2) as RpgSimState;
    applyPlayerStatus(sim, burning({ durationMs: 3000 }));
    const s = getActivePlayerStatuses(sim).find(x => x.key === 'burning')!;
    const expected = 3000 * (1 - STATUS_RESISTANCE_PER_RANK * 2);
    expect(s.durationMs).toBeCloseTo(expected, 0);
  });
});

describe('player-status-effects — 2. Rank 3 reaches 40% floor', () => {
  it('rank 3 applies 40% duration (STATUS_RESISTANCE_MIN_MULT)', () => {
    const sim = makeSim(3) as RpgSimState;
    applyPlayerStatus(sim, burning({ durationMs: 3000 }));
    const s = getActivePlayerStatuses(sim).find(x => x.key === 'burning')!;
    expect(s.durationMs).toBeCloseTo(3000 * STATUS_RESISTANCE_MIN_MULT, 0);
  });

  it('rank above 3 does not go below 40%', () => {
    const sim = makeSim(10) as RpgSimState;
    applyPlayerStatus(sim, burning({ durationMs: 3000 }));
    const s = getActivePlayerStatuses(sim).find(x => x.key === 'burning')!;
    expect(s.durationMs).toBeGreaterThanOrEqual(3000 * STATUS_RESISTANCE_MIN_MULT - 1);
  });
});

describe('player-status-effects — 3. Duration clamped to minimum', () => {
  it('very short base duration is clamped to STATUS_MIN_DURATION_MS', () => {
    const sim = makeSim(3) as RpgSimState;
    applyPlayerStatus(sim, burning({ durationMs: 100 }));
    const s = getActivePlayerStatuses(sim).find(x => x.key === 'burning')!;
    expect(s.durationMs).toBeGreaterThanOrEqual(STATUS_MIN_DURATION_MS);
  });
});

describe('player-status-effects — 4. Reapplying refreshes duration and maxes magnitude', () => {
  it('reapplying extends remainingMs', () => {
    const sim = makeSim() as RpgSimState;
    const stats = makeStats();
    applyPlayerStatus(sim, burning());
    // Consume half the duration
    tickPlayerStatuses(sim, stats, 1500);
    const before = getActivePlayerStatuses(sim).find(x => x.key === 'burning')!.remainingMs;
    expect(before).toBeLessThan(3000);
    // Reapply — should refresh to full
    applyPlayerStatus(sim, burning());
    const after = getActivePlayerStatuses(sim).find(x => x.key === 'burning')!.remainingMs;
    expect(after).toBeGreaterThan(before);
  });

  it('reapplying does not create duplicate entries', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, burning());
    applyPlayerStatus(sim, burning());
    applyPlayerStatus(sim, burning());
    expect(getActivePlayerStatuses(sim).filter(s => s.key === 'burning')).toHaveLength(1);
  });

  it('reapplying with higher magnitude raises magnitude', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, burning({ magnitude: 5 }));
    applyPlayerStatus(sim, burning({ magnitude: 15 }));
    const s = getActivePlayerStatuses(sim).find(x => x.key === 'burning')!;
    expect(s.magnitude).toBe(15);
  });
});

describe('player-status-effects — 5. DoT ticking', () => {
  it('burning ticks deal BURN_DPS_PER_MAG * magnitude damage per tick', () => {
    const sim = makeSim() as RpgSimState;
    const stats = makeStats(100);
    applyPlayerStatus(sim, burning({ magnitude: 10, tickEveryMs: 1000 }));
    tickPlayerStatuses(sim, stats, 1100);
    const expected = 10 * BURN_DPS_PER_MAG * (1000 / 1000);
    expect(100 - stats.hp).toBeCloseTo(expected, 1);
  });

  it('poison ticks deal POISON_DPS_PER_MAG * magnitude damage per tick', () => {
    const sim = makeSim() as RpgSimState;
    const stats = makeStats(100);
    applyPlayerStatus(sim, poisoned({ magnitude: 10, tickEveryMs: 1000 }));
    tickPlayerStatuses(sim, stats, 1100);
    const expected = 10 * POISON_DPS_PER_MAG * (1000 / 1000);
    expect(100 - stats.hp).toBeCloseTo(expected, 1);
  });

  it('burning DPS is greater than poison DPS per tick at equal magnitude', () => {
    expect(BURN_DPS_PER_MAG).toBeGreaterThan(POISON_DPS_PER_MAG);
  });

  it('onDotTick callback fires with correct key and damage', () => {
    const sim = makeSim() as RpgSimState;
    const stats = makeStats(100);
    applyPlayerStatus(sim, burning({ magnitude: 10, tickEveryMs: 1000 }));
    const ticks: { key: string; dmg: number }[] = [];
    tickPlayerStatuses(sim, stats, 1100, (key, dmg) => ticks.push({ key, dmg }));
    expect(ticks).toHaveLength(1);
    expect(ticks[0]!.key).toBe('burning');
    expect(ticks[0]!.dmg).toBeGreaterThan(0);
  });

  it('DoT does not tick below 0 HP', () => {
    const sim = makeSim() as RpgSimState;
    const stats = makeStats(1);
    applyPlayerStatus(sim, burning({ magnitude: 100, tickEveryMs: 1000 }));
    tickPlayerStatuses(sim, stats, 5000);
    expect(stats.hp).toBeGreaterThanOrEqual(0);
  });
});

describe('player-status-effects — 6. Movement multipliers', () => {
  it('no statuses → multiplier is 1', () => {
    const sim = makeSim() as RpgSimState;
    expect(getPlayerMovementStatusMultiplier(sim)).toBe(1);
  });

  it('frozen overrides to FROZEN_MOVEMENT_MULT', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, frozen());
    expect(getPlayerMovementStatusMultiplier(sim)).toBe(FROZEN_MOVEMENT_MULT);
  });

  it('frozen overrides chilled (frozen is stronger)', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, chilled());
    applyPlayerStatus(sim, frozen());
    expect(getPlayerMovementStatusMultiplier(sim)).toBe(FROZEN_MOVEMENT_MULT);
  });

  it('slowed applies SLOWED_MOVEMENT_MULT', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, slowed());
    expect(getPlayerMovementStatusMultiplier(sim)).toBeCloseTo(SLOWED_MOVEMENT_MULT, 5);
  });

  it('chilled at max magnitude does not stop player (clamps to min speed)', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, chilled({ magnitude: 9999 }));
    expect(getPlayerMovementStatusMultiplier(sim)).toBeGreaterThan(0);
  });
});

describe('player-status-effects — 7. timeWarped cadence multiplier', () => {
  it('no statuses → attack speed multiplier is 1', () => {
    const sim = makeSim() as RpgSimState;
    expect(getPlayerAttackSpeedStatusMultiplier(sim)).toBe(1);
  });

  it('timeWarped returns TIMEWARP_CADENCE_MULT', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, timeWarped());
    expect(getPlayerAttackSpeedStatusMultiplier(sim)).toBe(TIMEWARP_CADENCE_MULT);
  });
});

describe('player-status-effects — 8. Statuses expire', () => {
  it('status is removed after durationMs elapses', () => {
    const sim = makeSim() as RpgSimState;
    const stats = makeStats();
    applyPlayerStatus(sim, burning({ durationMs: 1000 }));
    tickPlayerStatuses(sim, stats, 1100);
    expect(hasPlayerStatus(sim, 'burning')).toBe(false);
  });

  it('status is still active just before expiry', () => {
    const sim = makeSim() as RpgSimState;
    const stats = makeStats();
    applyPlayerStatus(sim, burning({ durationMs: 1000 }));
    tickPlayerStatuses(sim, stats, 900);
    expect(hasPlayerStatus(sim, 'burning')).toBe(true);
  });
});

describe('player-status-effects — 9. clearPlayerStatuses', () => {
  it('removes all active statuses at once', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, burning());
    applyPlayerStatus(sim, poisoned());
    applyPlayerStatus(sim, slowed());
    clearPlayerStatuses(sim);
    expect(getActivePlayerStatuses(sim)).toHaveLength(0);
  });
});

describe('player-status-effects — 10. Query helpers', () => {
  it('hasPlayerStatus returns false when absent', () => {
    const sim = makeSim() as RpgSimState;
    expect(hasPlayerStatus(sim, 'burning')).toBe(false);
  });

  it('hasPlayerStatus returns true when present', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, burning());
    expect(hasPlayerStatus(sim, 'burning')).toBe(true);
  });

  it('getActivePlayerStatuses returns readonly list', () => {
    const sim = makeSim() as RpgSimState;
    applyPlayerStatus(sim, burning());
    applyPlayerStatus(sim, chilled());
    const statuses = getActivePlayerStatuses(sim);
    expect(statuses.length).toBe(2);
    expect(statuses.some(s => s.key === 'burning')).toBe(true);
    expect(statuses.some(s => s.key === 'chilled')).toBe(true);
  });
});
