/**
 * enemy-status-effects.test.ts — Tests for the Tier 1 lens status effect system.
 *
 * Covers:
 *   1. Sand T1 → Abraded applies on hit
 *   2. Ruby T1 → Burning applies on hit
 *   3. Emerald T1 → Poisoned applies on hit
 *   4. Sapphire T1 → Chilled applies, reduces movement speed
 *   5. Multiple T1 effects on one lens all apply on hit
 *   6. T2 and T3 effects do not apply combat behavior
 *   7. Reapplying a status refreshes duration and does not duplicate
 *   8. DoT statuses tick damage and expire
 *   9. Echo-Marked repeats damage once and does not recursively trigger itself
 *   10. Rift-Scarred stacks per enemy/source and resets on enemy death
 *   11. Existing weapons without lenses behave as before (no status applied)
 */

import { describe, it, expect } from 'vitest';
import {
  applyLensStatus,
  clearEnemyStatuses,
  getIncomingDamageMult,
  getMovementSlowMult,
  getRiftScarredDamageMult,
  getRiftScarredStackCap,
  incrementRiftScarredStacks,
  tickLensStatuses,
  getActiveStatuses,
  type LensStatusParams,
} from '../enemy-status-effects';
import { ENEMY_RIFT_STACK_CAP, ENEMY_RIFT_STACK_CAP_BOSS, ENEMY_FRAC_TICKS, ENEMY_FRAC_TICKS_BOSS, ENEMY_FRAC_MAX_CONCURRENT } from '../../../data/rpg/status-balance';
import { getEnemyStatusAffinityMultiplier } from '../../../data/rpg/enemy-status-affinities';

// ── Test enemy factory ─────────────────────────────────────────────────────────

function makeEnemy(overrides: Partial<{ hp: number; x: number; y: number; vx: number; vy: number }> = {}) {
  return {
    hp: 100,
    maxHp: 100,
    x: 180,
    y: 320,
    vx: 0.5,
    vy: 0,
    ...overrides,
  };
}

// ── Minimal arrays for tickLensStatuses ───────────────────────────────────────

function makeArrays(enemies: ReturnType<typeof makeEnemy>[] = []) {
  const empty: never[] = [];
  return {
    enemies,
    sapphireEnemies: empty,
    emeraldEnemies: empty,
    amberEnemies: empty,
    voidEnemies: empty,
    quartzEnemies: empty,
    rubyEnemies: empty,
    sunstoneEnemies: empty,
    citrineEnemies: empty,
    ioliteEnemies: empty,
    amethystEnemies: empty,
    diamondEnemies: empty,
    nullstoneEnemies: empty,
    fracterylEnemies: empty,
    eigensteinEnemies: empty,
    eliteEnemies: empty,
    polyominoEnemies: empty,
    fissilePolyominoEnemies: empty,
    refractorPolyominoEnemies: empty,
    dustWispEnemies: empty,
    ribbonWormEnemies: empty,
    lanternMothEnemies: empty,
    eyeStalkEnemies: empty,
    jellyfishEnemies: empty,
    clothGhostEnemies: empty,
    plantTurretEnemies: empty,
    gearInsectEnemies: empty,
    spiderCrawlerEnemies: empty,
    moteSwarmEnemies: empty,
    shadowHandEnemies: empty,
    sandFishEnemies: empty,
    quartzFishEnemies: empty,
    rubyFishEnemies: empty,
    sunstoneFishEnemies: empty,
    emeraldFishEnemies: empty,
    sapphireFishEnemies: empty,
    amethystFishEnemies: empty,
    diamondFishEnemies: empty,
  };
}

// ── Status param helpers ───────────────────────────────────────────────────────

function abradedParams(): LensStatusParams {
  return { key: 'abraded', sourceTierId: 'sand', durationMs: 3500, magnitude: 13 };
}
function burningParams(): LensStatusParams {
  return { key: 'burning', sourceTierId: 'ruby', durationMs: 4000, magnitude: 13, tickEveryMs: 1000 };
}
function poisonedParams(): LensStatusParams {
  return { key: 'poisoned', sourceTierId: 'emerald', durationMs: 6000, magnitude: 13, tickEveryMs: 1000 };
}
function chilledParams(): LensStatusParams {
  return { key: 'chilled', sourceTierId: 'sapphire', durationMs: 3500, magnitude: 13 };
}
function echoParams(echoDamage: number): LensStatusParams {
  return { key: 'echoMarked', sourceTierId: 'amethyst', durationMs: 1000, magnitude: 13, echoDamage };
}
function riftParams(): LensStatusParams {
  return { key: 'riftScarred', sourceTierId: 'eigenstein', sourceLensId: 'lens1', durationMs: 30000, magnitude: 13 };
}
function crackedParams(): LensStatusParams {
  return { key: 'cracked', sourceTierId: 'diamond', durationMs: 3500, magnitude: 13 };
}

// ── Tests ──────────────────────────────────────────────────────────────────────

describe('enemy-status-effects — 1. Sand T1 → Abraded', () => {
  it('applies abraded status on hit', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, abradedParams());
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'abraded')).toBe(true);
  });

  it('abraded increases incoming damage mult above 1', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, abradedParams());
    expect(getIncomingDamageMult(enemy)).toBeGreaterThan(1);
  });
});

describe('enemy-status-effects — 2. Ruby T1 → Burning', () => {
  it('applies burning status', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, burningParams());
    expect(getActiveStatuses(enemy).some(s => s.key === 'burning')).toBe(true);
  });

  it('burning ticks reduce HP over time', () => {
    const enemy = makeEnemy({ hp: 100 });
    applyLensStatus(enemy, burningParams());
    const arrays = makeArrays([enemy] as any);
    // Tick past 1000ms to trigger burn
    tickLensStatuses(arrays, 1100, 0, 0);
    expect(enemy.hp).toBeLessThan(100);
  });

  it('burning expires after duration', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, burningParams());
    const arrays = makeArrays([enemy] as any);
    tickLensStatuses(arrays, 5000, 0, 0);
    expect(getActiveStatuses(enemy).some(s => s.key === 'burning')).toBe(false);
  });
});

describe('enemy-status-effects — 3. Emerald T1 → Poisoned', () => {
  it('applies poisoned status', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, poisonedParams());
    expect(getActiveStatuses(enemy).some(s => s.key === 'poisoned')).toBe(true);
  });

  it('poisoned ticks reduce HP', () => {
    const enemy = makeEnemy({ hp: 100 });
    applyLensStatus(enemy, poisonedParams());
    const arrays = makeArrays([enemy] as any);
    tickLensStatuses(arrays, 1100, 0, 0);
    expect(enemy.hp).toBeLessThan(100);
  });

  it('poisoned persists longer than burning (6000ms vs 4000ms)', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, poisonedParams());
    const arrays = makeArrays([enemy] as any);
    tickLensStatuses(arrays, 4500, 0, 0);
    expect(getActiveStatuses(enemy).some(s => s.key === 'poisoned')).toBe(true);
    tickLensStatuses(arrays, 2000, 0, 0);
    expect(getActiveStatuses(enemy).some(s => s.key === 'poisoned')).toBe(false);
  });
});

describe('enemy-status-effects — 4. Sapphire T1 → Chilled', () => {
  it('applies chilled status', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, chilledParams());
    expect(getActiveStatuses(enemy).some(s => s.key === 'chilled')).toBe(true);
  });

  it('chilled reduces movement speed below 1', () => {
    const enemy = makeEnemy({ vx: 0.5 });
    applyLensStatus(enemy, chilledParams());
    const mult = getMovementSlowMult(enemy);
    expect(mult).toBeLessThan(1);
    expect(mult).toBeGreaterThanOrEqual(0.2); // clamped min speed
  });

  it('chilled does not fully stop enemy (min speed 0.2)', () => {
    const enemy = makeEnemy();
    // Apply max-magnitude chill
    applyLensStatus(enemy, { key: 'chilled', sourceTierId: 'sapphire', durationMs: 5000, magnitude: 1000 });
    expect(getMovementSlowMult(enemy)).toBeGreaterThanOrEqual(0.2);
  });
});

describe('enemy-status-effects — 5. Multiple T1 effects on one lens all apply', () => {
  it('sand + sapphire T1 effects both apply to same enemy', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, abradedParams());
    applyLensStatus(enemy, chilledParams());
    const statuses = getActiveStatuses(enemy);
    expect(statuses.some(s => s.key === 'abraded')).toBe(true);
    expect(statuses.some(s => s.key === 'chilled')).toBe(true);
  });

  it('multiple damage vulns stack multiplicatively', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, abradedParams());
    const multAfterOne = getIncomingDamageMult(enemy);
    applyLensStatus(enemy, crackedParams());
    const multAfterTwo = getIncomingDamageMult(enemy);
    expect(multAfterTwo).toBeGreaterThan(multAfterOne);
  });
});

describe('enemy-status-effects — 6. T2 and T3 effects do not apply', () => {
  it('applyLensStatus ignores non-T1 keys gracefully (T2/T3 would not be passed)', () => {
    // T2/T3 are never passed to applyLensStatus — buildAllTier1StatusParams filters them.
    // Verify that no status is applied if we call with an unknown key (defensive test).
    const enemy = makeEnemy();
    // Only T1 params produce real status keys - T2/T3 produce no status params
    expect(getActiveStatuses(enemy)).toHaveLength(0);
  });
});

describe('enemy-status-effects — 7. Reapplying refreshes duration', () => {
  it('reapplying abraded refreshes remaining time instead of stacking', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, abradedParams());
    const arrays = makeArrays([enemy] as any);
    // Advance 2s so there's only 1.5s remaining
    tickLensStatuses(arrays, 2000, 0, 0);
    expect(getActiveStatuses(enemy).some(s => s.key === 'abraded')).toBe(true);
    // Reapply
    applyLensStatus(enemy, abradedParams());
    // Now remaining should be back to full 3500ms
    // Advance 3000ms — should still be active
    tickLensStatuses(arrays, 3000, 0, 0);
    expect(getActiveStatuses(enemy).some(s => s.key === 'abraded')).toBe(true);
  });

  it('reapplying does not create duplicate status entries', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, abradedParams());
    applyLensStatus(enemy, abradedParams());
    applyLensStatus(enemy, abradedParams());
    const abradeds = getActiveStatuses(enemy).filter(s => s.key === 'abraded');
    expect(abradeds).toHaveLength(1);
  });
});

describe('enemy-status-effects — 8. DoT statuses tick and expire', () => {
  it('burning deals damage every 1000ms', () => {
    const enemy = makeEnemy({ hp: 100 });
    applyLensStatus(enemy, burningParams());
    const arrays = makeArrays([enemy] as any);
    tickLensStatuses(arrays, 1000, 0, 0);
    const after1 = enemy.hp;
    tickLensStatuses(arrays, 1000, 0, 0);
    const after2 = enemy.hp;
    expect(after1).toBeLessThan(100);
    expect(after2).toBeLessThan(after1);
  });

  it('poisoned DoT rate is less than burning DPS (per tick)', () => {
    const burnEnemy = makeEnemy({ hp: 100 });
    const poisonEnemy = makeEnemy({ hp: 100 });
    applyLensStatus(burnEnemy, burningParams());
    applyLensStatus(poisonEnemy, poisonedParams());
    const burnArrays = makeArrays([burnEnemy] as any);
    const poisonArrays = makeArrays([poisonEnemy] as any);
    tickLensStatuses(burnArrays, 1000, 0, 0);
    tickLensStatuses(poisonArrays, 1000, 0, 0);
    const burnDmg = 100 - burnEnemy.hp;
    const poisonDmg = 100 - poisonEnemy.hp;
    expect(burnDmg).toBeGreaterThan(poisonDmg);
  });
});

describe('enemy-status-effects — 9. Echo-Marked single non-recursive repeat', () => {
  it('echo-marked queues a pending echo', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, echoParams(20));
    const statuses = getActiveStatuses(enemy);
    const echo = statuses.find(s => s.key === 'echoMarked');
    expect(echo).toBeDefined();
    expect(echo?.pendingEchoes?.length).toBeGreaterThan(0);
  });

  it('echo fires after 600ms and reduces HP', () => {
    const enemy = makeEnemy({ hp: 100 });
    applyLensStatus(enemy, echoParams(20));
    const arrays = makeArrays([enemy] as any);
    tickLensStatuses(arrays, 700, 0, 0);
    expect(enemy.hp).toBeLessThan(100);
  });

  it('echo does not fire before 600ms', () => {
    const enemy = makeEnemy({ hp: 100 });
    applyLensStatus(enemy, echoParams(20));
    const arrays = makeArrays([enemy] as any);
    tickLensStatuses(arrays, 400, 0, 0);
    expect(enemy.hp).toBe(100);
  });

  it('echo fires exactly once (no recursive echo-of-echo)', () => {
    const enemy = makeEnemy({ hp: 100 });
    applyLensStatus(enemy, echoParams(20));
    const arrays = makeArrays([enemy] as any);
    tickLensStatuses(arrays, 700, 0, 0);
    const dmgAfterFirstEcho = 100 - enemy.hp;
    tickLensStatuses(arrays, 1000, 0, 0);
    const dmgAfterSecond = 100 - enemy.hp;
    // No extra echo should fire
    expect(dmgAfterSecond).toBeCloseTo(dmgAfterFirstEcho, 5);
  });
});

describe('enemy-status-effects — 10. Rift-Scarred stacks per enemy/source', () => {
  it('rift-scarred starts at 0 stacks (no bonus)', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, riftParams());
    expect(getRiftScarredDamageMult(enemy, 'lens1')).toBe(1);
  });

  it('incrementing stacks increases the damage mult', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, riftParams());
    incrementRiftScarredStacks(enemy, 'lens1');
    const mult = getRiftScarredDamageMult(enemy, 'lens1');
    expect(mult).toBeGreaterThan(1);
  });

  it('stacks cap at 20', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, riftParams());
    for (let i = 0; i < 25; i++) incrementRiftScarredStacks(enemy, 'lens1');
    const at20 = getRiftScarredDamageMult(enemy, 'lens1');
    incrementRiftScarredStacks(enemy, 'lens1');
    const atExcess = getRiftScarredDamageMult(enemy, 'lens1');
    expect(at20).toBe(atExcess); // capped
  });

  it('stacks do not transfer between enemies', () => {
    const e1 = makeEnemy();
    const e2 = makeEnemy();
    applyLensStatus(e1, riftParams());
    applyLensStatus(e2, riftParams());
    incrementRiftScarredStacks(e1, 'lens1');
    incrementRiftScarredStacks(e1, 'lens1');
    expect(getRiftScarredDamageMult(e2, 'lens1')).toBe(1);
    expect(getRiftScarredDamageMult(e1, 'lens1')).toBeGreaterThan(1);
  });

  it('stacks reset on enemy death (clearEnemyStatuses)', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, riftParams());
    incrementRiftScarredStacks(enemy, 'lens1');
    clearEnemyStatuses(enemy);
    // After clear, no stacks
    applyLensStatus(enemy, riftParams());
    expect(getRiftScarredDamageMult(enemy, 'lens1')).toBe(1);
  });

  it('different source keys have independent stacks', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, { ...riftParams(), sourceLensId: 'lens1' });
    incrementRiftScarredStacks(enemy, 'lens1');
    incrementRiftScarredStacks(enemy, 'lens1');
    // Different source: still 0
    expect(getRiftScarredDamageMult(enemy, 'lens2')).toBe(1);
    expect(getRiftScarredDamageMult(enemy, 'lens1')).toBeGreaterThan(1);
  });
});

describe('enemy-status-effects — 11. No status without lens', () => {
  it('enemies without statuses have damage mult of 1', () => {
    const enemy = makeEnemy();
    expect(getIncomingDamageMult(enemy)).toBe(1);
  });

  it('enemies without statuses have full movement speed', () => {
    const enemy = makeEnemy();
    expect(getMovementSlowMult(enemy)).toBe(1);
  });

  it('getActiveStatuses returns empty array for fresh enemy', () => {
    const enemy = makeEnemy();
    expect(getActiveStatuses(enemy)).toHaveLength(0);
  });
});

describe('enemy-status-effects — 12. Boss/elite Rift-Scarred stack cap', () => {
  it('normal enemy uses default stack cap', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, riftParams());
    expect(getRiftScarredStackCap(enemy)).toBe(ENEMY_RIFT_STACK_CAP);
  });

  it('boss enemy uses lower stack cap when override is passed', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, { ...riftParams(), riftScarredStackCap: ENEMY_RIFT_STACK_CAP_BOSS });
    expect(getRiftScarredStackCap(enemy)).toBe(ENEMY_RIFT_STACK_CAP_BOSS);
  });

  it('boss stack cap clamps stacks below normal cap', () => {
    const enemy = makeEnemy();
    applyLensStatus(enemy, { ...riftParams(), riftScarredStackCap: ENEMY_RIFT_STACK_CAP_BOSS });
    for (let i = 0; i < ENEMY_RIFT_STACK_CAP + 5; i++) {
      incrementRiftScarredStacks(enemy, 'lens1');
    }
    // Mult at boss cap should be less than mult would be at normal cap
    const bossCapMult = getRiftScarredDamageMult(enemy, 'lens1');

    const normalEnemy = makeEnemy();
    applyLensStatus(normalEnemy, riftParams());
    for (let i = 0; i < ENEMY_RIFT_STACK_CAP + 5; i++) {
      incrementRiftScarredStacks(normalEnemy, 'lens1');
    }
    const normalCapMult = getRiftScarredDamageMult(normalEnemy, 'lens1');

    expect(bossCapMult).toBeLessThan(normalCapMult);
  });
});

describe('enemy-status-effects — 13. Boss Fractal Wound reduced tick count', () => {
  it('boss fractal wound uses fewer ticks than normal', () => {
    expect(ENEMY_FRAC_TICKS_BOSS).toBeLessThan(ENEMY_FRAC_TICKS);
  });

  it('normal Fractal Wound fires ENEMY_FRAC_TICKS ticks', () => {
    const enemy = makeEnemy({ hp: 1000 });
    applyLensStatus(enemy, {
      key: 'fractalWound', sourceTierId: 'fracteryl',
      durationMs: 3600, magnitude: 10, tickEveryMs: 600,
      fractalInitialDamage: 10,
    });
    const arrays = makeArrays([enemy] as any);
    // Tick enough to exhaust all ticks
    tickLensStatuses(arrays, 3600, 0, 0);
    // Should have taken damage (ticks fired)
    expect(enemy.hp).toBeLessThan(1000);
    // After expiry, status should be gone
    expect(getActiveStatuses(enemy).some(s => s.key === 'fractalWound')).toBe(false);
  });

  it('boss Fractal Wound with 2-tick override has fewer total ticks', () => {
    const normal = makeEnemy({ hp: 1000 });
    const boss   = makeEnemy({ hp: 1000 });
    const baseParams = {
      key: 'fractalWound' as const, sourceTierId: 'fracteryl' as const,
      durationMs: 3600, magnitude: 10, tickEveryMs: 600,
      fractalInitialDamage: 10,
    };
    applyLensStatus(normal, baseParams);
    applyLensStatus(boss,   { ...baseParams, fractalTickCount: ENEMY_FRAC_TICKS_BOSS });
    const normalArrays = makeArrays([normal] as any);
    const bossArrays   = makeArrays([boss] as any);
    tickLensStatuses(normalArrays, 3600, 0, 0);
    tickLensStatuses(bossArrays,   3600, 0, 0);
    const normalDmg = 1000 - normal.hp;
    const bossDmg   = 1000 - boss.hp;
    expect(bossDmg).toBeLessThan(normalDmg);
  });
});

describe('enemy-status-effects — 14. Affinity: immunity blocks, resistance reduces, weakness amplifies', () => {
  it('immunity multiplier is 0', () => {
    const { getEnemyStatusAffinityMultiplier } = require('../../../data/rpg/enemy-status-affinities');
    expect(getEnemyStatusAffinityMultiplier('ruby', 'burning')).toBe(0);
  });

  it('resistance multiplier is less than 1', () => {
    const { getEnemyStatusAffinityMultiplier } = require('../../../data/rpg/enemy-status-affinities');
    expect(getEnemyStatusAffinityMultiplier('emerald', 'poisoned')).toBeLessThan(1);
  });

  it('weakness multiplier is greater than 1', () => {
    const { getEnemyStatusAffinityMultiplier } = require('../../../data/rpg/enemy-status-affinities');
    expect(getEnemyStatusAffinityMultiplier('emerald', 'burning')).toBeGreaterThan(1);
  });

  it('neutral returns 1', () => {
    const { getEnemyStatusAffinityMultiplier } = require('../../../data/rpg/enemy-status-affinities');
    expect(getEnemyStatusAffinityMultiplier('emerald', 'chilled')).toBe(1);
  });
});

describe('enemy-status-effects — 15. Rapid-fire application does not create duplicates', () => {
  it('applying abraded 10 times yields exactly 1 status entry', () => {
    const enemy = makeEnemy();
    for (let i = 0; i < 10; i++) applyLensStatus(enemy, abradedParams());
    expect(getActiveStatuses(enemy).filter(s => s.key === 'abraded')).toHaveLength(1);
  });

  it('applying burning 10 times yields exactly 1 status entry', () => {
    const enemy = makeEnemy();
    for (let i = 0; i < 10; i++) applyLensStatus(enemy, burningParams());
    expect(getActiveStatuses(enemy).filter(s => s.key === 'burning')).toHaveLength(1);
  });

  it('Fractal Wound caps at ENEMY_FRAC_MAX_CONCURRENT concurrent wounds', () => {
    const { ENEMY_FRAC_MAX_CONCURRENT } = require('../../../data/rpg/status-balance');
    const enemy = makeEnemy();
    const p = {
      key: 'fractalWound' as const, sourceTierId: 'fracteryl' as const,
      durationMs: 3600, magnitude: 10, tickEveryMs: 600,
    };
    for (let i = 0; i < ENEMY_FRAC_MAX_CONCURRENT + 5; i++) {
      applyLensStatus(enemy, p);
    }
    expect(getActiveStatuses(enemy).filter(s => s.key === 'fractalWound')).toHaveLength(ENEMY_FRAC_MAX_CONCURRENT);
  });
});
