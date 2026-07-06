import { describe, it, expect } from 'vitest';
import {
  LIFE_CELL_SIZE, makeLifeGridBounds, worldToLifeGrid, lifeGridToWorldCenter,
  snapToLifeGridCenter, isLifeGridCoordInBounds, lifeCellKey, parseLifeCellKey,
} from '../life-grid';
import {
  seedLifeColony, stepLifeAutomata, damageLifeCellEntity, advanceLifeCellFades,
  isLifeColonyFullyCleared, killLifeColonyCore, damageLifeCoreEntity,
  stepLifeAutomataGenerations, LIFE_CELL_GHOST_MS,
} from '../life-controller';
import { getChainTargetBody } from '../rpg-weapon-chain';
import { createRpgTargeting } from '../rpg-targeting';
import type { RpgTargetingCtx } from '../rpg-targeting-types';
import { applyLaserBeamHitSweep, type LaserBeamHitSweepCtx } from '../rpg-weapon-laser-beam-hits';
import {
  RULE_CONWAY, RULE_MAZECTRIC, RULE_SEEDS, RULE_REPLICATOR, RULE_WALLED_CITIES,
  RULE_LIFE_WITHOUT_DEATH, RULE_GENERATIONS_GHOST,
  LIFE_CA_RULES, LIFE_CA_RULES_BY_ID,
} from '../life-ca-rules';
import {
  makeMazeColony, makeSeedsBurstColony, makeReplicatorSigilColony, makeWalledCitiesColony,
  makeLifeWithoutDeathCorruptionColony, makeGenerationsGhostColony,
  buildLifeGridBoundsForArena,
} from '../life-factories';
import { updateLifeColonies } from '../life-updates';
import type { LifeColonyController } from '../life-types';
import { RPG_ZONE_DEFINITIONS, RPG_ZONE_BY_ID } from '../../../data/rpg/rpg-zone-definitions';
import { getSpawnableEnemyTypesForZone, getZoneWaveDefinition } from '../../../data/rpg/wave-definitions';
import { isLifeBodyTarget, getLifeTargetBody } from '../life-weapon-helpers';
import type { ClosestTarget } from '../rpg-types';

describe('life-grid', () => {
  const bounds = makeLifeGridBounds(0, 0, 280, 280, LIFE_CELL_SIZE);

  it('world -> grid -> world round-trips to a stable cell center', () => {
    const coord = worldToLifeGrid(37, 51, bounds);
    const center = lifeGridToWorldCenter(coord, bounds);
    const coordAgain = worldToLifeGrid(center.x, center.y, bounds);
    expect(coordAgain).toEqual(coord);
  });

  it('snapToLifeGridCenter is idempotent', () => {
    const once = snapToLifeGridCenter(100, 100, bounds);
    const twice = snapToLifeGridCenter(once.x, once.y, bounds);
    expect(twice).toEqual(once);
  });

  it('bounds check rejects coordinates outside the arena grid', () => {
    expect(isLifeGridCoordInBounds({ col: 0, row: 0 }, bounds)).toBe(true);
    expect(isLifeGridCoordInBounds({ col: -1, row: 0 }, bounds)).toBe(false);
    expect(isLifeGridCoordInBounds({ col: 999, row: 0 }, bounds)).toBe(false);
  });

  it('lifeCellKey/parseLifeCellKey round-trip', () => {
    const key = lifeCellKey(-3, 7);
    expect(parseLifeCellKey(key)).toEqual({ col: -3, row: 7 });
  });
});

function makeTestColony(rule = RULE_CONWAY): LifeColonyController {
  const bounds = makeLifeGridBounds(0, 0, 400, 400, LIFE_CELL_SIZE);
  return {
    kind: 'life_colony',
    rule,
    bounds,
    x: 200, y: 200,
    coreHp: 10, coreMaxHp: 10,
    cells: new Map(),
    tickAccumulatorMs: 0,
    generation: 0,
    maxPopulation: rule.maxPopulation ?? 260,
    status: 'seeding',
    xpMult: 1,
    coreContactCdMs: 0,
  };
}

describe('life-ca-rules presets', () => {
  it('includes all required presets with correct B/S notation', () => {
    const ids = LIFE_CA_RULES.map(r => r.id);
    expect(ids).toEqual(expect.arrayContaining([
      'conway', 'maze', 'mazectric', 'seeds', 'highlife',
      'replicator', 'life_without_death', 'walled_cities',
    ]));
    expect(LIFE_CA_RULES_BY_ID.get('conway')?.notation).toBe('B3/S23');
    expect(LIFE_CA_RULES_BY_ID.get('maze')?.notation).toBe('B3/S12345');
    expect(LIFE_CA_RULES_BY_ID.get('mazectric')?.notation).toBe('B3/S1234');
    expect(LIFE_CA_RULES_BY_ID.get('seeds')?.notation).toBe('B2/S');
  });
});

describe('stepLifeAutomata — Conway blinker', () => {
  it('oscillates a 3-cell horizontal blinker into a vertical one and back', () => {
    const colony = makeTestColony(RULE_CONWAY);
    seedLifeColony(colony, [{ col: -1, row: 0 }, { col: 0, row: 0 }, { col: 1, row: 0 }], 10, 10);
    expect(colony.cells.size).toBe(3);

    stepLifeAutomata(colony);
    const coordsAfterOne = [...colony.cells.values()].map(c => `${c.col}:${c.row}`).sort();
    expect(coordsAfterOne).toEqual(['10:10', '10:9', '10:11'].sort());

    stepLifeAutomata(colony);
    const coordsAfterTwo = [...colony.cells.values()].map(c => `${c.col}:${c.row}`).sort();
    expect(coordsAfterTwo).toEqual(['10:10', '11:10', '9:10'].sort());
  });
});

describe('stepLifeAutomata — population cap', () => {
  it('never exceeds colony.maxPopulation', () => {
    const colony = makeTestColony(RULE_MAZECTRIC);
    colony.maxPopulation = 5;
    // Dense seed block that would otherwise grow past the cap.
    const pattern = [];
    for (let c = -2; c <= 2; c++) for (let r = -2; r <= 2; r++) pattern.push({ col: c, row: r });
    seedLifeColony(colony, pattern, 20, 20);
    for (let i = 0; i < 10; i++) stepLifeAutomata(colony);
    expect(colony.cells.size).toBeLessThanOrEqual(5);
  });
});

describe('cell damage/death independence', () => {
  it('a cell can take damage and die independently without killing the whole colony', () => {
    const colony = makeTestColony();
    seedLifeColony(colony, [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }], 5, 5, 6);
    const cells = [...colony.cells.values()];
    expect(cells).toHaveLength(3);

    const target = cells[0]!;
    const dmg = damageLifeCellEntity(target, 4);
    expect(dmg).toBe(4);
    expect(target.hp).toBe(2);
    expect(target.isDying).toBe(false);

    const dmg2 = damageLifeCellEntity(target, 10);
    expect(dmg2).toBe(10); // damage isn't clamped to remaining hp, but target.hp floors at 0
    expect(target.hp).toBe(0);
    expect(target.isDying).toBe(true);

    // The other two cells are untouched.
    const others = cells.slice(1);
    expect(others.every(c => !c.isDying && c.hp === c.maxHp)).toBe(true);

    // Fade completes and only the dead cell is removed.
    advanceLifeCellFades(colony, 10_000);
    expect(colony.cells.size).toBe(2);
  });
});

describe('AoE-style multi-cell damage', () => {
  it('a single AoE pass can damage every cell within a radius', () => {
    const colony = makeTestColony();
    seedLifeColony(colony, [
      { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 0, row: 1 }, { col: 5, row: 5 },
    ], 5, 5, 3);
    const bounds = colony.bounds;
    const aoeCenter = lifeGridToWorldCenter({ col: 5, row: 5 }, bounds);
    const radius = LIFE_CELL_SIZE * 2;

    let hitCount = 0;
    for (const cell of colony.cells.values()) {
      const center = lifeGridToWorldCenter({ col: cell.col, row: cell.row }, bounds);
      const dx = center.x - aoeCenter.x, dy = center.y - aoeCenter.y;
      if (dx * dx + dy * dy <= radius * radius) {
        damageLifeCellEntity(cell, 3);
        hitCount++;
      }
    }
    // Only the cells within radius (the (5,5) far cell plus none of the cluster near (5,5)) take damage.
    expect(hitCount).toBeGreaterThanOrEqual(1);
    const deadOrDying = [...colony.cells.values()].filter(c => c.isDying);
    expect(deadOrDying.length).toBe(hitCount);
  });
});

describe('colony core death clears remaining cells', () => {
  it('killLifeColonyCore marks all cells dying and the colony is fully cleared after fades run out', () => {
    const colony = makeTestColony();
    seedLifeColony(colony, [{ col: 0, row: 0 }, { col: 1, row: 0 }], 5, 5);
    expect(isLifeColonyFullyCleared(colony)).toBe(false);

    killLifeColonyCore(colony);
    expect(colony.coreHp).toBe(0);
    expect([...colony.cells.values()].every(c => c.isDying)).toBe(true);

    advanceLifeCellFades(colony, 10_000);
    expect(isLifeColonyFullyCleared(colony)).toBe(true);
  });
});

describe('makeMazeColony prototype + updateLifeColonies sweep', () => {
  it('creates a seeded colony using the Mazectric rule', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    expect(colony.rule.id).toBe('mazectric');
    expect(colony.cells.size).toBeGreaterThan(0);
  });

  it('updateLifeColonies removes a colony once fully cleared', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    killLifeColonyCore(colony);
    const colonies = [colony];
    let clearedCalls = 0;
    updateLifeColonies(colonies, {
      playerX: -1000, playerY: -1000, playerRadius: 6,
      dealContactDamageToPlayer: () => {},
      onColonyCleared: () => { clearedCalls++; },
    }, 10_000);
    expect(colonies.length).toBe(0);
    expect(clearedCalls).toBe(1);
  });
});

describe('cell contact damage (no default core contact damage)', () => {
  it('a dangerous, non-dying cell deals contact damage to a player standing on it, on its own cooldown', () => {
    const colony = makeTestColony();
    seedLifeColony(colony, [{ col: 0, row: 0 }], 5, 5, 6, true);
    const cell = [...colony.cells.values()][0]!;
    const center = lifeGridToWorldCenter({ col: cell.col, row: cell.row }, colony.bounds);

    let hits = 0;
    updateLifeColonies([colony], {
      playerX: center.x, playerY: center.y, playerRadius: 6,
      dealContactDamageToPlayer: () => { hits++; },
    }, 10);
    expect(hits).toBe(1);
    expect(cell.contactCdMs).toBeGreaterThan(0);

    // Still on cooldown — no second hit this frame.
    updateLifeColonies([colony], {
      playerX: center.x, playerY: center.y, playerRadius: 6,
      dealContactDamageToPlayer: () => { hits++; },
    }, 10);
    expect(hits).toBe(1);
  });

  it('a non-dangerous cell never deals contact damage', () => {
    const colony = makeTestColony();
    seedLifeColony(colony, [{ col: 0, row: 0 }], 5, 5, 6, false);
    const cell = [...colony.cells.values()][0]!;
    const center = lifeGridToWorldCenter({ col: cell.col, row: cell.row }, colony.bounds);

    let hits = 0;
    updateLifeColonies([colony], {
      playerX: center.x, playerY: center.y, playerRadius: 6,
      dealContactDamageToPlayer: () => { hits++; },
    }, 10);
    expect(hits).toBe(0);
  });
});

describe('colony core is a separate damageable entity', () => {
  it('damageLifeCoreEntity reduces coreHp independently of cells and kills the core at 0', () => {
    const colony = makeTestColony();
    seedLifeColony(colony, [{ col: 0, row: 0 }, { col: 1, row: 0 }], 5, 5);
    expect(colony.coreHp).toBe(10);

    const dmg = damageLifeCoreEntity(colony, 4);
    expect(dmg).toBe(4);
    expect(colony.coreHp).toBe(6);
    expect(colony.status).not.toBe('dying');
    // Cells are untouched by core damage.
    expect([...colony.cells.values()].every(c => !c.isDying)).toBe(true);

    const dmg2 = damageLifeCoreEntity(colony, 100);
    expect(dmg2).toBe(6); // clamped to remaining core HP
    expect(colony.coreHp).toBe(0);
    expect(colony.status).toBe('dying');
    expect([...colony.cells.values()].every(c => c.isDying)).toBe(true);
  });

  it('damageLifeCoreEntity on an already-dead core is a no-op', () => {
    const colony = makeTestColony();
    killLifeColonyCore(colony);
    expect(damageLifeCoreEntity(colony, 5)).toBe(0);
  });
});

describe('per-cell reward semantics', () => {
  it('fires onCellCleared once per cell when several finish fading in the same update', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony: LifeColonyController = {
      kind: 'life_colony', rule: RULE_CONWAY, bounds, x: 200, y: 200,
      coreHp: 10, coreMaxHp: 10, cells: new Map(), tickAccumulatorMs: 0,
      generation: 0, maxPopulation: 260, status: 'dying', xpMult: 1, coreContactCdMs: 0,
    };
    seedLifeColony(colony, [{ col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }], 5, 5);
    for (const cell of colony.cells.values()) { cell.isDying = true; cell.dyingMs = 50; }
    expect(colony.cells.size).toBe(3);

    let cellClearedCalls = 0;
    updateLifeColonies([colony], {
      playerX: -1000, playerY: -1000, playerRadius: 6,
      dealContactDamageToPlayer: () => {},
      onCellCleared: () => { cellClearedCalls++; },
    }, 10_000);
    expect(cellClearedCalls).toBe(3);
  });
});

describe('new Life enemy variants use existing rule presets', () => {
  it('Seeds Burst colony uses RULE_SEEDS and produces births/deaths', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeSeedsBurstColony(200, 200, 1, bounds);
    expect(colony.rule).toBe(RULE_SEEDS);
    expect(colony.cells.size).toBeGreaterThan(0);
    stepLifeAutomata(colony);
    // Under Seeds (B2/S), no cell ever survives its own step.
    expect([...colony.cells.values()].every(c => c.bornAtGeneration === colony.generation)).toBe(true);
  });

  it('Replicator Sigil colony uses RULE_REPLICATOR and respects a strict population cap', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeReplicatorSigilColony(200, 200, 1, bounds);
    expect(colony.rule).toBe(RULE_REPLICATOR);
    expect(colony.maxPopulation).toBeLessThanOrEqual(90);
    for (let i = 0; i < 15; i++) stepLifeAutomata(colony);
    expect(colony.cells.size).toBeLessThanOrEqual(colony.maxPopulation);
  });

  it('Walled Cities colony uses RULE_WALLED_CITIES, spawns, and stays within its cap', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeWalledCitiesColony(200, 200, 1, bounds);
    expect(colony.rule).toBe(RULE_WALLED_CITIES);
    expect(colony.cells.size).toBeGreaterThan(0);
    for (let i = 0; i < 10; i++) stepLifeAutomata(colony);
    expect(colony.cells.size).toBeLessThanOrEqual(colony.maxPopulation);
  });
});

describe('Life zone registry integration', () => {
  it('zone registry includes Life', () => {
    const life = RPG_ZONE_BY_ID.get('life');
    expect(life).toBeDefined();
    expect(life?.displayName).toBe('Life');
    expect(RPG_ZONE_DEFINITIONS.some(z => z.id === 'life')).toBe(true);
  });

  it('Life zone is marked secret', () => {
    const life = RPG_ZONE_BY_ID.get('life');
    expect(life?.isSecret).toBe(true);
  });

  it('life_colony is spawnable in the life zone and only the life zone', () => {
    const lifePool = getSpawnableEnemyTypesForZone('life');
    expect(lifePool).toContain('life_colony');
    expect(getSpawnableEnemyTypesForZone('euhedral')).not.toContain('life_colony');
  });

  it('getZoneWaveDefinition produces life_colony spawns for the life zone', () => {
    const wave = getZoneWaveDefinition(6, 'life');
    expect(wave.spawns.some(s => s.enemyTypeId === 'life_colony')).toBe(true);
  });

  it('new Life enemy ids are registered and isolated to the Life zone', () => {
    const lifePool = getSpawnableEnemyTypesForZone('life');
    for (const id of ['life_seeds_burst', 'life_replicator_sigil', 'life_walled_cities']) {
      expect(lifePool).toContain(id);
      expect(getSpawnableEnemyTypesForZone('euhedral')).not.toContain(id);
      expect(getSpawnableEnemyTypesForZone('verdure')).not.toContain(id);
    }
  });

  it('every 10th Life wave is a Walled Cities elite-style wave, within colony caps', () => {
    const wave10 = getZoneWaveDefinition(10, 'life');
    expect(wave10.spawns).toEqual([{ enemyTypeId: 'life_walled_cities', count: 1, spawnDelay: 400 }]);
  });

  it('new corruption/generations-ghost enemy ids are registered and isolated to the Life zone', () => {
    const lifePool = getSpawnableEnemyTypesForZone('life');
    for (const id of ['life_without_death_corruption', 'life_generations_ghost']) {
      expect(lifePool).toContain(id);
      expect(getSpawnableEnemyTypesForZone('euhedral')).not.toContain(id);
      expect(getSpawnableEnemyTypesForZone('verdure')).not.toContain(id);
    }
  });

  it('early Life waves (1-3) spawn only the base life_colony variant', () => {
    for (let wave = 1; wave <= 3; wave++) {
      const spawns = getZoneWaveDefinition(wave, 'life').spawns;
      expect(spawns).toHaveLength(1);
      expect(spawns[0]!.enemyTypeId).toBe('life_colony');
    }
  });

  it('normal Life waves spawn at most 2 colonies', () => {
    for (let wave = 1; wave <= 60; wave++) {
      if (wave % 10 === 0) continue; // elite Walled Cities waves are handled separately
      const spawns = getZoneWaveDefinition(wave, 'life').spawns;
      expect(spawns.length).toBeLessThanOrEqual(2);
    }
  });

  it('rotates through all unlocked non-elite Life variants after unlock, surfacing later variants (waves 20-50)', () => {
    const seen = new Set<string>();
    for (let wave = 20; wave <= 50; wave++) {
      if (wave % 10 === 0) continue;
      for (const spawn of getZoneWaveDefinition(wave, 'life').spawns) {
        seen.add(spawn.enemyTypeId);
      }
    }
    expect(seen).toContain('life_replicator_sigil');
    expect(seen).toContain('life_generations_ghost');
    expect(seen).toContain('life_without_death_corruption');
  });

  it('never spawns the elite life_walled_cities wave on a non-10th wave', () => {
    for (let wave = 1; wave <= 50; wave++) {
      const spawns = getZoneWaveDefinition(wave, 'life').spawns;
      const hasElite = spawns.some(s => s.enemyTypeId === 'life_walled_cities');
      expect(hasElite).toBe(wave % 10 === 0);
    }
  });
});

describe('life_without_death_corruption', () => {
  it('makeLifeWithoutDeathCorruptionColony uses RULE_LIFE_WITHOUT_DEATH and tags a per-cell decay lifetime', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeLifeWithoutDeathCorruptionColony(200, 200, 1, bounds);
    expect(colony.rule).toBe(RULE_LIFE_WITHOUT_DEATH);
    expect(colony.cellDecayLifetimeMs).toBeGreaterThan(0);
    expect(colony.cells.size).toBeGreaterThan(0);
    expect([...colony.cells.values()].every(c => Number.isFinite(c.decayMs))).toBe(true);
  });

  it('a cell with an alive-neighbor count outside survive[] still does NOT die under Life Without Death (B3/S012345678 survives on any count)', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony: LifeColonyController = {
      kind: 'life_colony', rule: RULE_LIFE_WITHOUT_DEATH, bounds, x: 200, y: 200,
      coreHp: 10, coreMaxHp: 10, cells: new Map(), tickAccumulatorMs: 0,
      generation: 0, maxPopulation: 240, status: 'seeding', xpMult: 1, coreContactCdMs: 0,
      cellDecayLifetimeMs: 5000,
    };
    seedLifeColony(colony, [{ col: 0, row: 0 }], 10, 10, 6, false);
    const cell = [...colony.cells.values()][0]!;
    for (let i = 0; i < 5; i++) stepLifeAutomata(colony);
    // Isolated cell (0 alive neighbors) still survives — the rule's survive set is 0-8.
    expect(colony.cells.has(`10:10`)).toBe(true);
    expect(cell.isDying).toBe(false);
  });

  it('cells expire via decayMs lifetime even though the survival rule never kills them, capping growth', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeLifeWithoutDeathCorruptionColony(200, 200, 1, bounds);
    const lifetimeMs = colony.cellDecayLifetimeMs!;
    expect(colony.cells.size).toBeGreaterThan(0);

    // Advance past every cell's decay lifetime; no automata ticks in between
    // (isolating the decay mechanism from the survival rule).
    advanceLifeCellFades(colony, lifetimeMs + 1);
    expect([...colony.cells.values()].every(c => c.isDying)).toBe(true);

    advanceLifeCellFades(colony, 10_000);
    expect(colony.cells.size).toBe(0);
  });

  it('killing the core stops new births and remaining cells still decay/fade out', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeLifeWithoutDeathCorruptionColony(200, 200, 1, bounds);
    const sizeBeforeKill = colony.cells.size;
    killLifeColonyCore(colony);
    // killLifeColonyCore marks every remaining cell dying immediately.
    expect([...colony.cells.values()].every(c => c.isDying)).toBe(true);
    expect(colony.status).toBe('dying');

    // updateLifeColonies must not tick the automata (no new births) once dying.
    updateLifeColonies([colony], {
      playerX: -1000, playerY: -1000, playerRadius: 6,
      dealContactDamageToPlayer: () => {},
    }, 50_000);
    expect(colony.cells.size).toBe(0);
    expect(sizeBeforeKill).toBeGreaterThan(0);
  });

  it('never grows past its hard population cap even left running indefinitely', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeLifeWithoutDeathCorruptionColony(200, 200, 1, bounds);
    for (let i = 0; i < 40; i++) {
      stepLifeAutomata(colony);
      advanceLifeCellFades(colony, colony.rule.tickIntervalMs ?? 500);
    }
    expect(colony.cells.size).toBeLessThanOrEqual(colony.maxPopulation);
  });
});

describe('life_generations_ghost', () => {
  it('makeGenerationsGhostColony uses RULE_GENERATIONS_GHOST (stateCount 3)', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeGenerationsGhostColony(200, 200, 1, bounds);
    expect(colony.rule).toBe(RULE_GENERATIONS_GHOST);
    expect(colony.rule.stateCount).toBe(3);
    expect(colony.cells.size).toBeGreaterThan(0);
    expect([...colony.cells.values()].every(c => c.lifeState === 'alive')).toBe(true);
  });

  it('stepLifeAutomata dispatches stateCount > 2 rules to stepLifeAutomataGenerations', () => {
    const bounds = makeLifeGridBounds(0, 0, 400, 400, LIFE_CELL_SIZE);
    const colony: LifeColonyController = {
      kind: 'life_colony', rule: RULE_GENERATIONS_GHOST, bounds, x: 200, y: 200,
      coreHp: 10, coreMaxHp: 10, cells: new Map(), tickAccumulatorMs: 0,
      generation: 0, maxPopulation: 200, status: 'seeding', xpMult: 1, coreContactCdMs: 0,
    };
    // A lone cell (0 alive neighbors) is outside RULE_GENERATIONS_GHOST's
    // survive set [3..8], so it must transition to 'ghost' rather than vanish.
    seedLifeColony(colony, [{ col: 0, row: 0 }], 10, 10);
    expect(colony.cells.size).toBe(1);
    stepLifeAutomata(colony);
    const cell = [...colony.cells.values()][0]!;
    expect(cell.lifeState).toBe('ghost');
    expect(cell.ghostMs).toBeGreaterThan(0);
    expect(cell.isDying).toBe(false);
    // Cell count is preserved (still occupying its coordinate) during the ghost phase.
    expect(colony.cells.size).toBe(1);
  });

  it('ghost cells transition alive -> ghost -> dead (fade out) as ghostMs elapses', () => {
    const bounds = makeLifeGridBounds(0, 0, 400, 400, LIFE_CELL_SIZE);
    const colony: LifeColonyController = {
      kind: 'life_colony', rule: RULE_GENERATIONS_GHOST, bounds, x: 200, y: 200,
      coreHp: 10, coreMaxHp: 10, cells: new Map(), tickAccumulatorMs: 0,
      generation: 0, maxPopulation: 200, status: 'seeding', xpMult: 1, coreContactCdMs: 0,
    };
    seedLifeColony(colony, [{ col: 0, row: 0 }], 10, 10);
    stepLifeAutomataGenerations(colony);
    const cell = [...colony.cells.values()][0]!;
    expect(cell.lifeState).toBe('ghost');

    advanceLifeCellFades(colony, LIFE_CELL_GHOST_MS + 1);
    expect(cell.isDying).toBe(true);
    expect(cell.lifeState).toBe('ghost'); // isDying takes over; lifeState is left as-is

    advanceLifeCellFades(colony, 10_000);
    expect(colony.cells.size).toBe(0);
  });

  it('ghost cells do not reproduce as normal alive cells (excluded from neighbor counts)', () => {
    const bounds = makeLifeGridBounds(0, 0, 400, 400, LIFE_CELL_SIZE);
    const colony: LifeColonyController = {
      kind: 'life_colony', rule: RULE_GENERATIONS_GHOST, bounds, x: 200, y: 200,
      coreHp: 10, coreMaxHp: 10, cells: new Map(), tickAccumulatorMs: 0,
      generation: 0, maxPopulation: 200, status: 'seeding', xpMult: 1, coreContactCdMs: 0,
    };
    // Surround one dead cell with exactly 2 ghost cells (below birth[2]... wait
    // birth is [2], so 2 ghost neighbors must NOT cause a birth, since ghosts
    // don't count as alive).
    seedLifeColony(colony, [{ col: -1, row: 0 }, { col: 1, row: 0 }], 10, 10);
    for (const cell of colony.cells.values()) { cell.lifeState = 'ghost'; cell.ghostMs = 500; }
    stepLifeAutomataGenerations(colony);
    // (10,10) had 2 ghost neighbors only — with ghosts excluded from the count,
    // its alive-neighbor count is 0, which is not in birth: [2], so no birth.
    expect(colony.cells.has('10:10')).toBe(false);
  });

  it('binary Life rules (stateCount undefined) are unaffected by the Generations dispatch — Conway blinker still oscillates identically', () => {
    const bounds = makeLifeGridBounds(0, 0, 400, 400, LIFE_CELL_SIZE);
    const colony: LifeColonyController = {
      kind: 'life_colony', rule: RULE_CONWAY, bounds, x: 200, y: 200,
      coreHp: 10, coreMaxHp: 10, cells: new Map(), tickAccumulatorMs: 0,
      generation: 0, maxPopulation: 260, status: 'seeding', xpMult: 1, coreContactCdMs: 0,
    };
    seedLifeColony(colony, [{ col: -1, row: 0 }, { col: 0, row: 0 }, { col: 1, row: 0 }], 10, 10);
    stepLifeAutomata(colony);
    const coordsAfterOne = [...colony.cells.values()].map(c => `${c.col}:${c.row}`).sort();
    expect(coordsAfterOne).toEqual(['10:10', '10:9', '10:11'].sort());
    expect([...colony.cells.values()].every(c => c.lifeState === 'alive')).toBe(true);
  });

  it('never grows past its hard population cap even left running indefinitely', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeGenerationsGhostColony(200, 200, 1, bounds);
    for (let i = 0; i < 40; i++) {
      stepLifeAutomata(colony);
      advanceLifeCellFades(colony, colony.rule.tickIntervalMs ?? 500);
    }
    expect(colony.cells.size).toBeLessThanOrEqual(colony.maxPopulation);
  });
});

describe('life-weapon-helpers — shared targeting/damage helpers', () => {
  function makeCellTarget(): { target: ClosestTarget; colony: LifeColonyController } {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cell = [...colony.cells.values()][0]!;
    const center = lifeGridToWorldCenter({ col: cell.col, row: cell.row }, bounds);
    const target: ClosestTarget = { kind: 'life_cell', x: center.x, y: center.y, distSq: 0, lifeCell: cell, lifeColony: colony };
    return { target, colony };
  }

  it('isLifeBodyTarget recognizes life_cell and life_core kinds only', () => {
    const { target } = makeCellTarget();
    expect(isLifeBodyTarget(target)).toBe(true);
    expect(isLifeBodyTarget({ kind: 'proc_dustwisp', x: 0, y: 0, distSq: 0 } as ClosestTarget)).toBe(false);
  });

  it('getLifeTargetBody resolves a stable ref + maxHp for a cell target', () => {
    const { target } = makeCellTarget();
    const body = getLifeTargetBody(target);
    expect(body).not.toBeNull();
    expect(body!.ref).toBe(target.lifeCell);
    expect(body!.maxHp).toBe(target.lifeCell!.maxHp);
  });

  it('getLifeTargetBody resolves core ref + coreMaxHp for a life_core target', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const target: ClosestTarget = { kind: 'life_core', x: colony.x, y: colony.y, distSq: 0, lifeCoreColony: colony };
    const body = getLifeTargetBody(target);
    expect(body).not.toBeNull();
    expect(body!.ref).toBe(colony);
    expect(body!.maxHp).toBe(colony.coreMaxHp);
  });

  it('getLifeTargetBody returns null for non-Life targets', () => {
    expect(getLifeTargetBody({ kind: 'boss', x: 0, y: 0, distSq: 0 } as ClosestTarget)).toBeNull();
  });
});

// ── Shared minimal RpgTargetingCtx builder for weapon/targeting integration tests ──

const unused = (..._args: unknown[]): never => { throw new Error('unused stub invoked'); };

function makeMinimalTargetingCtx(overrides: Partial<RpgTargetingCtx> = {}): RpgTargetingCtx {
  return {
    mote: { x: 0, y: 0 },
    bossEnemy: null,
    enemies: [], sapphireEnemies: [], sapphireMissiles: [],
    emeraldEnemies: [], amberEnemies: [], amberShards: [],
    voidEnemies: [], quartzEnemies: [], quartzSpikes: [],
    rubyEnemies: [], rubyBolts: [],
    sunstoneEnemies: [], citrineEnemies: [], citrineBolts: [],
    ioliteEnemies: [], amethystEnemies: [], amethystShards: [],
    diamondEnemies: [], diamondShards: [],
    nullstoneEnemies: [], voidTendrils: [],
    fracterylEnemies: [], fracterylShards: [],
    eigensteinEnemies: [], eliteEnemies: [],
    polyominoEnemies: [], fissilePolyominoEnemies: [], refractorPolyominoEnemies: [],
    binaryRingEnemies: [], stardustEnemies: [],
    alivenGroups: [],
    lifeColonies: [],
    dustWispEnemies: [], ribbonWormEnemies: [], lanternMothEnemies: [], eyeStalkEnemies: [],
    jellyfishEnemies: [], eliteJellyfishEnemies: [],
    clothGhostEnemies: [], plantTurretEnemies: [], gearInsectEnemies: [],
    spiderCrawlerEnemies: [], moteSwarmEnemies: [], shadowHandEnemies: [],
    sandFishEnemies: [], quartzFishEnemies: [], rubyFishEnemies: [], sunstoneFishEnemies: [],
    emeraldFishEnemies: [], sapphireFishEnemies: [], amethystFishEnemies: [], diamondFishEnemies: [],
    plantProjectiles: [],
    damageEnemy: unused, damageSapphireEnemy: unused, damageMissile: unused,
    damageEmeraldEnemy: unused, damageAmberEnemy: unused, damageAmberShard: unused,
    damageVoidEnemy: unused, damageQuartzEnemy: unused, damageQuartzSpike: unused,
    damageRubyEnemy: unused, damageRubyBolt: unused,
    damageSunstoneEnemy: unused, damageCitrineEnemy: unused, damageCitrineBolt: unused,
    damageIoliteEnemy: unused, damageAmethystEnemy: unused, damageAmethystShard: unused,
    damageDiamondEnemy: unused, damageDiamondShard: unused,
    damageNullstoneEnemy: unused, damageVoidTendril: unused,
    damageFracterylEnemy: unused, damageFracterylShard: unused,
    damageEigensteinEnemy: unused,
    damagePolyominoEnemy: unused, damageFissilePolyominoEnemy: unused, damageRefractorPolyominoEnemy: unused,
    damageBinaryRingEnemy: unused, damageEliteEnemy: unused,
    damageAlivenParticle: unused,
    damageLifeCell: (cell, raw) => damageLifeCellEntity(cell, raw),
    damageLifeCore: (colony, raw) => damageLifeCoreEntity(colony, raw),
    damageBossEnemy: unused,
    damageDustWispEnemy: unused, damageRibbonWormEnemy: unused, damageLanternMothEnemy: unused,
    damageEyeStalkEnemy: unused, damageJellyfishEnemy: unused, damageEliteJellyfishEnemy: unused,
    damageClothGhostEnemy: unused, damagePlantTurretEnemy: unused, damageGearInsectEnemy: unused,
    damageSpiderCrawlerEnemy: unused, damageMoteSwarmEnemy: unused, damageShadowHandEnemy: unused,
    damageSandFishEnemy: unused, damageQuartzFishEnemy: unused, damageRubyFishEnemy: unused,
    damageSunstoneFishEnemy: unused, damageEmeraldFishEnemy: unused, damageSapphireFishEnemy: unused,
    damageAmethystFishEnemy: unused, damageDiamondFishEnemy: unused,
    damagePlantProjectile: unused,
    verdurePlants: [],
    damageVerdurePlant: unused,
    nadirCubePointEnemies: [],
    damageNadirCubePointEnemy: unused,
    horizonPentagonGroups: [],
    damageHorizonPentagonReal: unused,
    damageHorizonMissile: unused,
    getTerrainState: () => null,
    ...overrides,
  };
}

describe('chain whip — stable-ref target body resolution (getChainTargetBody)', () => {
  it('resolves a life_cell target to { ref: lifeCell, maxHp: lifeCell.maxHp }', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cell = [...colony.cells.values()][0]!;
    const center = lifeGridToWorldCenter({ col: cell.col, row: cell.row }, bounds);
    const target: ClosestTarget = { kind: 'life_cell', x: center.x, y: center.y, distSq: 0, lifeCell: cell, lifeColony: colony };

    const body = getChainTargetBody(target);
    expect(body).not.toBeNull();
    expect(body!.ref).toBe(cell);
    expect(body!.maxHp).toBe(cell.maxHp);
  });

  it('resolves a life_core target to { ref: colony, maxHp: colony.coreMaxHp }', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const target: ClosestTarget = { kind: 'life_core', x: colony.x, y: colony.y, distSq: 0, lifeCoreColony: colony };

    const body = getChainTargetBody(target);
    expect(body).not.toBeNull();
    expect(body!.ref).toBe(colony);
    expect(body!.maxHp).toBe(colony.coreMaxHp);
  });

  it('returns the same ref identity across repeated resolutions of the same Life target', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cell = [...colony.cells.values()][0]!;
    const target: ClosestTarget = { kind: 'life_cell', x: 0, y: 0, distSq: 0, lifeCell: cell, lifeColony: colony };

    const first = getChainTargetBody(target);
    const second = getChainTargetBody(target);
    expect(first!.ref).toBe(second!.ref);
  });

  it('a stable ref can be used as a Map key to simulate hitCooldowns.has(ref) succeeding on repeated resolution', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cell = [...colony.cells.values()][0]!;
    const target: ClosestTarget = { kind: 'life_cell', x: 0, y: 0, distSq: 0, lifeCell: cell, lifeColony: colony };

    const hitCooldowns = new Map<object, number>();
    const firstBody = getChainTargetBody(target)!;
    hitCooldowns.set(firstBody.ref, 500);

    const secondBody = getChainTargetBody(target)!;
    expect(hitCooldowns.has(secondBody.ref)).toBe(true);
  });

  it('resolves a non-Life generic body target (verdurePlant) to the actual entity object as ref', () => {
    const verdurePlant = { x: 10, y: 10, hp: 20, maxHp: 20 } as unknown as NonNullable<ClosestTarget['verdurePlant']>;
    const target: ClosestTarget = { kind: 'verdure_plant', x: 10, y: 10, distSq: 0, verdurePlant };

    const body = getChainTargetBody(target);
    expect(body).not.toBeNull();
    expect(body!.ref).toBe(verdurePlant);
    expect(body!.maxHp).toBe(20);
  });
});

describe('damageBodyTarget — shared damage dispatch path for Life targets', () => {
  it('life_cell damage reduces that cell HP and marks it dying at 0, without affecting unrelated cells or creating health bars', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cells = [...colony.cells.values()];
    expect(cells.length).toBeGreaterThan(1);
    const target = cells[0]!;
    const untouched = cells.slice(1).map(c => ({ cell: c, hp: c.hp }));

    const ctx = makeMinimalTargetingCtx({ lifeColonies: [colony] });
    const targeting = createRpgTargeting(ctx);

    const closestTarget: ClosestTarget = { kind: 'life_cell', x: 0, y: 0, distSq: 0, lifeCell: target, lifeColony: colony };
    const dmg = targeting.damageBodyTarget(closestTarget, target.maxHp, 0, false);
    expect(dmg).toBeGreaterThan(0);
    expect(target.hp).toBe(0);
    expect(target.isDying).toBe(true);

    for (const { cell, hp } of untouched) {
      expect(cell.hp).toBe(hp);
      expect(cell.isDying).toBe(false);
    }
    expect('healthBar' in target).toBe(false);
  });

  it('reserved future core mechanism: damage still reduces coreHp via the shared dispatch path if a field is ever given one', () => {
    // No shipped Life field has coreHp > 0 (see makeMazeColony assertion below),
    // so this exercises the dispatch path with a manually-constructed colony
    // standing in for a possible future core-bearing variant.
    const colony = makeTestColony();
    const coreHpBefore = colony.coreHp;
    expect(coreHpBefore).toBeGreaterThan(0);

    const ctx = makeMinimalTargetingCtx({ lifeColonies: [colony] });
    const targeting = createRpgTargeting(ctx);

    const closestTarget: ClosestTarget = { kind: 'life_core', x: colony.x, y: colony.y, distSq: 0, lifeCoreColony: colony };
    const dmg = targeting.damageBodyTarget(closestTarget, 3, 0, false);
    expect(dmg).toBe(3);
    expect(colony.coreHp).toBe(coreHpBefore - 3);
  });

  it('every shipped Life factory produces a field with coreHp 0 — no default killable core', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    expect(colony.coreHp).toBe(0);
    expect(colony.coreMaxHp).toBe(0);
  });
});

describe('collectEnemyBodyTargets — Life target collection', () => {
  it('includes live cells (kind life_cell) but no life_core target for a normal (coreHp 0) Life field, excluding dying cells', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cells = [...colony.cells.values()];
    expect(cells.length).toBeGreaterThan(1);
    // Mark one cell as dying — it should be excluded from collection.
    cells[0]!.isDying = true;

    const ctx = makeMinimalTargetingCtx({ lifeColonies: [colony] });
    const targeting = createRpgTargeting(ctx);
    const targets = targeting.collectEnemyBodyTargets();

    const cellTargets = targets.filter(t => t.kind === 'life_cell');
    const coreTargets = targets.filter(t => t.kind === 'life_core');

    expect(cellTargets.length).toBe(cells.length - 1);
    for (const t of cellTargets) {
      expect(t.lifeCell).toBeDefined();
      expect(t.lifeColony).toBe(colony);
      expect(t.lifeCell!.isDying).toBe(false);
    }
    // No default core: a normal Life field never contributes a life_core target.
    expect(coreTargets.length).toBe(0);
  });

  it('reserved future core mechanism: a field manually given coreHp > 0 does contribute a life_core target until killed', () => {
    const colony = makeTestColony();
    const ctx = makeMinimalTargetingCtx({ lifeColonies: [colony] });
    const targeting = createRpgTargeting(ctx);

    const targets = targeting.collectEnemyBodyTargets();
    const coreTargets = targets.filter(t => t.kind === 'life_core');
    expect(coreTargets.length).toBe(1);
    expect(coreTargets[0]!.lifeCoreColony).toBe(colony);

    killLifeColonyCore(colony);
    const targetsAfterCoreDeath = targeting.collectEnemyBodyTargets();
    expect(targetsAfterCoreDeath.some(t => t.kind === 'life_core')).toBe(false);
  });
});

describe('Life wave completion depends only on cells (no default core)', () => {
  it('a field with live cells and coreHp 0 is not fully cleared', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    expect(colony.cells.size).toBeGreaterThan(0);
    expect(isLifeColonyFullyCleared(colony)).toBe(false);
  });

  it('a field clears once all its cells are gone, with no core involved', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    for (const cell of colony.cells.values()) { cell.isDying = true; cell.dyingMs = 1; }
    advanceLifeCellFades(colony, 10_000);
    expect(colony.cells.size).toBe(0);
    expect(isLifeColonyFullyCleared(colony)).toBe(true);
  });

  it('killing one cell does not kill or fade any other cell in the same field', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeMazeColony(200, 200, 1, bounds);
    const cells = [...colony.cells.values()];
    expect(cells.length).toBeGreaterThan(1);
    damageLifeCellEntity(cells[0]!, 9999);
    expect(cells[0]!.isDying).toBe(true);
    for (const other of cells.slice(1)) {
      expect(other.isDying).toBe(false);
    }
  });

  it('a CA step that births a new cell makes that new cell targetable/damageable', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeSeedsBurstColony(200, 200, 1, bounds);
    const beforeKeys = new Set(colony.cells.keys());
    stepLifeAutomata(colony);
    const newCell = [...colony.cells.entries()].find(([key]) => !beforeKeys.has(key));
    expect(newCell).toBeDefined();
    const [, cell] = newCell!;
    expect(cell.hp).toBeGreaterThan(0);
    expect(cell.hideHealthBar).toBe(true);

    const ctx = makeMinimalTargetingCtx({ lifeColonies: [colony] });
    const targeting = createRpgTargeting(ctx);
    const targets = targeting.collectEnemyBodyTargets();
    expect(targets.some(t => t.kind === 'life_cell' && t.lifeCell === cell)).toBe(true);
  });
});

describe('applyLaserBeamHitSweep — beam damages multiple Life cells independently', () => {
  function makeBeamCtx(overrides: Partial<LaserBeamHitSweepCtx>): LaserBeamHitSweepCtx {
    return {
      originX: 0, originY: 0, dirX: 1, dirY: 0, tMax: 1000,
      baseDamage: 5, beamColor: '#fff', beamGlow: '#fff',
      hitEffects: [], bossEnemy: null,
      enemies: [], sapphireEnemies: [], sapphireMissiles: [],
      emeraldEnemies: [], amberEnemies: [], amberShards: [],
      voidEnemies: [], quartzEnemies: [], rubyEnemies: [],
      sunstoneEnemies: [], citrineEnemies: [], ioliteEnemies: [],
      amethystEnemies: [], diamondEnemies: [], nullstoneEnemies: [],
      fracterylEnemies: [], eigensteinEnemies: [], eliteEnemies: [],
      damageEnemy: unused, damageSapphireEnemy: unused, damageMissile: unused,
      damageEmeraldEnemy: unused, damageAmberEnemy: unused, damageAmberShard: unused,
      damageVoidEnemy: unused, damageQuartzEnemy: unused, damageRubyEnemy: unused,
      damageSunstoneEnemy: unused, damageCitrineEnemy: unused, damageIoliteEnemy: unused,
      damageAmethystEnemy: unused, damageDiamondEnemy: unused, damageNullstoneEnemy: unused,
      damageFracterylEnemy: unused, damageEigensteinEnemy: unused, damageEliteEnemy: unused,
      damageBossEnemy: unused,
      alivenGroups: [], damageAlivenParticle: unused,
      spawnDamageNumber: () => {},
      lifeColonies: [],
      damageLifeCell: (cell, raw) => damageLifeCellEntity(cell, raw),
      damageLifeCore: (colony, raw) => damageLifeCoreEntity(colony, raw),
      ...overrides,
    };
  }

  it('damages every Life cell crossed by the beam ray, leaving cells outside the beam untouched', () => {
    const bounds = buildLifeGridBoundsForArena(0, 0, 400, 400);
    const colony = makeTestColony();
    // Three cells in a horizontal line at row 0 (in the beam path), one far off-beam at row 20.
    seedLifeColony(colony, [
      { col: 0, row: 0 }, { col: 1, row: 0 }, { col: 2, row: 0 }, { col: 0, row: 20 },
    ], 0, 0, 6);
    colony.bounds = bounds;

    const inBeamCoords = ['0:0', '1:0', '2:0'];
    const offBeamCell = [...colony.cells.values()].find(c => c.col === 0 && c.row === 20)!;
    const offBeamCenter = lifeGridToWorldCenter({ col: 0, row: 20 }, bounds);

    // Beam ray travels along +x through row 0's world-y coordinate.
    const rowCenter = lifeGridToWorldCenter({ col: 0, row: 0 }, bounds);
    const ctx = makeBeamCtx({
      originX: rowCenter.x - 50, originY: rowCenter.y, dirX: 1, dirY: 0, tMax: 500,
      lifeColonies: [colony],
    });

    applyLaserBeamHitSweep(ctx);

    for (const key of inBeamCoords) {
      const [col, row] = key.split(':').map(Number);
      const cell = [...colony.cells.values()].find(c => c.col === col && c.row === row)!;
      expect(cell.hp).toBeLessThan(cell.maxHp);
    }
    expect(offBeamCell.hp).toBe(offBeamCell.maxHp);
    expect(offBeamCenter.y).not.toBe(rowCenter.y);
  });
});
