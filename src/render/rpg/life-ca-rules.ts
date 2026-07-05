/**
 * life-ca-rules.ts — Cellular-automata rule presets for the Life zone.
 *
 * Each rule is expressed in standard B(irth)/S(urvival) notation: a cell is
 * born if its dead neighbor count is in `birth`, and an alive cell survives
 * if its alive neighbor count is in `survive`. All rules here use the 8-cell
 * Moore neighborhood (see LIFE_MOORE_NEIGHBOR_OFFSETS in life-grid.ts).
 *
 * Only Conway and Maze/Mazectric are wired to an actual enemy today (see
 * life-factories.ts); the rest are data-only presets for future colonies.
 */

export interface CellularAutomataRule {
  id: string;
  name: string;
  /** B/S notation string, e.g. 'B3/S23', for display/debugging. */
  notation: string;
  /** Neighbor counts (0-8) that cause a dead cell to become alive. */
  birth: readonly number[];
  /** Neighbor counts (0-8) that let an alive cell remain alive. */
  survive: readonly number[];
  /** Number of cell states for Generations-style rules. 2 = classic binary (dead/alive). */
  stateCount?: number;
  /** Ms between automata steps. Overridable per-controller; this is just a sane default. */
  tickIntervalMs?: number;
  /** Hard cap on live cells for colonies using this rule, before controller-level caps apply. */
  maxPopulation?: number;
  /** How to treat cells beyond the arena-bounded grid. 'dead' = neighbors outside bounds count as dead. */
  edgeBehavior?: 'dead' | 'wrap';
}

// B3/S23 — the original: birth on 3 neighbors, survive on 2 or 3.
export const RULE_CONWAY: CellularAutomataRule = {
  id: 'conway', name: 'Conway', notation: 'B3/S23',
  birth: [3], survive: [2, 3],
  tickIntervalMs: 500, maxPopulation: 220, edgeBehavior: 'dead',
};

// B3/S12345 — mazes: birth on 3, survives on 1-5 (dense corridor-like growth).
export const RULE_MAZE: CellularAutomataRule = {
  id: 'maze', name: 'Maze', notation: 'B3/S12345',
  birth: [3], survive: [1, 2, 3, 4, 5],
  tickIntervalMs: 650, maxPopulation: 260, edgeBehavior: 'dead',
};

// B3/S1234 — mazectric: thinner corridors than Maze.
export const RULE_MAZECTRIC: CellularAutomataRule = {
  id: 'mazectric', name: 'Mazectric', notation: 'B3/S1234',
  birth: [3], survive: [1, 2, 3, 4],
  tickIntervalMs: 650, maxPopulation: 260, edgeBehavior: 'dead',
};

// B2/S — seeds: birth on 2, nothing ever survives (every live cell dies next step).
export const RULE_SEEDS: CellularAutomataRule = {
  id: 'seeds', name: 'Seeds', notation: 'B2/S',
  birth: [2], survive: [],
  tickIntervalMs: 400, maxPopulation: 180, edgeBehavior: 'dead',
};

// B36/S23 — HighLife: Conway plus birth on 6 (produces self-replicators).
export const RULE_HIGHLIFE: CellularAutomataRule = {
  id: 'highlife', name: 'HighLife', notation: 'B36/S23',
  birth: [3, 6], survive: [2, 3],
  tickIntervalMs: 500, maxPopulation: 220, edgeBehavior: 'dead',
};

// B1357/S1357 — replicator: every cell (birth or survival) follows odd counts.
export const RULE_REPLICATOR: CellularAutomataRule = {
  id: 'replicator', name: 'Replicator', notation: 'B1357/S1357',
  birth: [1, 3, 5, 7], survive: [1, 3, 5, 7],
  tickIntervalMs: 500, maxPopulation: 200, edgeBehavior: 'dead',
};

// B3/S012345678 — Life without Death: birth on 3, alive cells never die.
export const RULE_LIFE_WITHOUT_DEATH: CellularAutomataRule = {
  id: 'life_without_death', name: 'Life Without Death', notation: 'B3/S012345678',
  birth: [3], survive: [0, 1, 2, 3, 4, 5, 6, 7, 8],
  tickIntervalMs: 650, maxPopulation: 240, edgeBehavior: 'dead',
};

// B45678/S2345 — walled cities: dense birth threshold, moderate survival.
export const RULE_WALLED_CITIES: CellularAutomataRule = {
  id: 'walled_cities', name: 'Walled Cities', notation: 'B45678/S2345',
  birth: [4, 5, 6, 7, 8], survive: [2, 3, 4, 5],
  tickIntervalMs: 600, maxPopulation: 240, edgeBehavior: 'dead',
};

/**
 * Placeholder for a future Generations-style rule (e.g. Brian's Brain / Star
 * Wars). Generations rules add a "dying" state chain after survival ends
 * (stateCount > 2); not yet consumed by the controller, but reserved so
 * future work can add multi-state cells without a data-shape migration.
 */
export const RULE_GENERATIONS_PLACEHOLDER: CellularAutomataRule = {
  id: 'generations_placeholder', name: 'Generations (reserved)', notation: 'B2/S345678',
  birth: [2], survive: [3, 4, 5, 6, 7, 8],
  stateCount: 3, tickIntervalMs: 500, maxPopulation: 200, edgeBehavior: 'dead',
};

export const LIFE_CA_RULES: readonly CellularAutomataRule[] = [
  RULE_CONWAY,
  RULE_MAZE,
  RULE_MAZECTRIC,
  RULE_SEEDS,
  RULE_HIGHLIFE,
  RULE_REPLICATOR,
  RULE_LIFE_WITHOUT_DEATH,
  RULE_WALLED_CITIES,
  RULE_GENERATIONS_PLACEHOLDER,
];

export const LIFE_CA_RULES_BY_ID: ReadonlyMap<string, CellularAutomataRule> = new Map(
  LIFE_CA_RULES.map(r => [r.id, r]),
);
