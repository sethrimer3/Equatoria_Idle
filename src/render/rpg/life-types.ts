/**
 * life-types.ts — Entity/controller types for the Life zone cellular-automata
 * enemy framework. See life-controller.ts for the stepping algorithm and
 * life-factories.ts for how a colony is spawned into the RPG combat loop.
 */

import type { CellularAutomataRule } from './life-ca-rules';
import type { LifeGridBounds } from './life-grid';

/** One alive cell — an individually damageable combat entity with no health bar. */
export interface LifeCellEntity {
  col: number;
  row: number;
  hp: number;
  maxHp: number;
  /** Never rendered — cells intentionally have no per-entity health bar (many-cell colonies). */
  readonly hideHealthBar: true;
  /** Ms remaining of white hit-flash / crack visual after taking damage. */
  hitFlashMs: number;
  /** Ms remaining of shrink/fade-out animation once hp <= 0 (removed from occupancy once it ends). */
  dyingMs: number;
  /** True once dyingMs has been started (hp <= 0 but still animating out). */
  isDying: boolean;
  /** If true, touching the player deals contact damage on a cooldown. */
  isDangerous: boolean;
  /** Ms until this cell may deal contact damage again. */
  contactCdMs: number;
  /** Generation this cell was born on — used only for fade-in visuals. */
  bornAtGeneration: number;
  /**
   * Ms remaining before this cell expires from old age, independent of the
   * survival rule. `Infinity` (the default for every rule except Life Without
   * Death corruption colonies) means the cell never decays by lifetime and
   * only dies from damage or the CA survival rule. See
   * `life_without_death_corruption` in life-factories.ts — Life Without
   * Death's B3/S012345678 rule never naturally kills a cell, so without this
   * timer a corruption colony would grow forever.
   */
  decayMs: number;
  /**
   * Life-cell state for the limited Generations-style support (Part 4):
   * 'alive' behaves exactly like classic binary Life. 'ghost' is a transitional
   * post-survival state (only reachable on `stateCount > 2` rules) — a ghost
   * cell no longer counts as alive for neighbor counts (so it cannot cause a
   * birth or keep a neighbor alive) and cannot itself revert to alive; it just
   * counts down `ghostMs` and then fades out like a normal death.
   */
  lifeState: 'alive' | 'ghost';
  /** Ms remaining in the 'ghost' transitional state before this cell starts its death-fade. Unused while lifeState === 'alive'. */
  ghostMs: number;
}

export type LifeColonyStatus = 'seeding' | 'alive' | 'dying' | 'dead';

/**
 * Owns one colony/core: tracks occupied cells by grid coordinate, advances
 * the CA rule on a fixed tick interval, and enforces population/arena caps.
 * Multiple colonies may share the same LifeGridBounds (the arena grid is
 * global; each colony just owns a subset of occupied coordinates).
 */
export interface LifeColonyController {
  readonly kind: 'life_colony';
  rule: CellularAutomataRule;
  bounds: LifeGridBounds;
  /** World-space core position (visual anchor + contact-damage source while alive). */
  x: number;
  y: number;
  coreHp: number;
  coreMaxHp: number;
  /** Sparse occupancy map, keyed by lifeCellKey(col, row). */
  cells: Map<string, LifeCellEntity>;
  /** Ms accumulator until the next automata step. */
  tickAccumulatorMs: number;
  /** Current CA generation count (for debug overlay + fade-in staggering). */
  generation: number;
  /** Hard cap on live cells for this colony (<= rule.maxPopulation). */
  maxPopulation: number;
  status: LifeColonyStatus;
  /** XP multiplier granted per cell killed. */
  xpMult: number;
  /** Ms remaining before contact damage may fire again from the core itself. */
  coreContactCdMs: number;
  /**
   * Per-cell lifetime (ms) newly-born cells receive, tunable per colony
   * variant. Only meaningful for colonies whose rule never naturally kills a
   * cell (e.g. RULE_LIFE_WITHOUT_DEATH) — see `life_without_death_corruption`
   * in life-factories.ts. `undefined` (every other colony variant) means new
   * cells get `decayMs: Infinity` — no lifetime-based decay.
   */
  cellDecayLifetimeMs?: number;
}
