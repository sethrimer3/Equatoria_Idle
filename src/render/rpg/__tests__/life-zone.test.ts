import { describe, it, expect } from 'vitest';
import {
  LIFE_CELL_SIZE, makeLifeGridBounds, worldToLifeGrid, lifeGridToWorldCenter,
  snapToLifeGridCenter, isLifeGridCoordInBounds, lifeCellKey, parseLifeCellKey,
} from '../life-grid';
import {
  seedLifeColony, stepLifeAutomata, damageLifeCellEntity, advanceLifeCellFades,
  isLifeColonyFullyCleared, killLifeColonyCore, damageLifeCoreEntity,
} from '../life-controller';
import {
  RULE_CONWAY, RULE_MAZECTRIC, RULE_SEEDS, RULE_REPLICATOR, RULE_WALLED_CITIES,
  LIFE_CA_RULES, LIFE_CA_RULES_BY_ID,
} from '../life-ca-rules';
import {
  makeMazeColony, makeSeedsBurstColony, makeReplicatorSigilColony, makeWalledCitiesColony,
  buildLifeGridBoundsForArena,
} from '../life-factories';
import { updateLifeColonies } from '../life-updates';
import type { LifeColonyController } from '../life-types';
import { RPG_ZONE_DEFINITIONS, RPG_ZONE_BY_ID } from '../../../data/rpg/rpg-zone-definitions';
import { getSpawnableEnemyTypesForZone, getZoneWaveDefinition } from '../../../data/rpg/wave-definitions';

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
});
