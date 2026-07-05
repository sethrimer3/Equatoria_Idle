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
}
