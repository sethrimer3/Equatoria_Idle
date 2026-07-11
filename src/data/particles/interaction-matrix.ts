/**
 * 13×13 Particle Life interaction matrix.
 *
 * Entry `interactionMatrix[a][b]` determines how strongly motes of
 * type **a** affect motes of type **b**.
 *
 *   positive → attraction
 *   negative → repulsion
 *
 * The matrix is intentionally **asymmetric** to produce emergent
 * chasing, orbiting, and layered-cluster behaviour.
 *
 * Type indices 0–12 map to tier unlock order:
 *   0=Sand, 1=Quartz, 2=Ruby, 3=Sunstone, 4=Citrine, 5=Emerald,
 *   6=Sapphire, 7=Iolite, 8=Amethyst, 9=Diamond, 10=Nullstone,
 *   11=Fracteryl, 12=Eigenstein
 *
 * Guidelines for tuning:
 *   - Values in [-1, 1] are safe for default damping/timestep.
 *   - Mutual attraction (a→b > 0 AND b→a > 0) creates tight clusters.
 *   - One-way attraction creates chasing streams.
 *   - Mutual repulsion creates spacing / buffer shells.
 *   - Mixed (a→b > 0, b→a < 0) creates orbiting loops.
 */

import { TIERS } from '../tiers';

/** Number of distinct mote types, derived from the canonical tier registry. */
export const MOTE_TYPE_COUNT = TIERS.length;

/**
 * Default hand-tuned interaction matrix.
 *
 * Design goals for the default set:
 *   - Sand (0) mildly clusters with itself, attracts Quartz
 *   - Warm tones (Ruby/Sunstone/Citrine) form a chasing ring
 *   - Cool tones (Emerald/Sapphire/Iolite) form a counter-ring
 *   - Amethyst orbits between warm and cool clusters
 *   - Diamond repels most, attracting only Nullstone (buffer shell)
 *   - Fracteryl/Eigenstein create exotic spirals with each other
 *
 * Row = source type (who exerts force), Col = target type (who feels it).
 */
export function createDefaultInteractionMatrix(): number[][] {
  // prettier-ignore
  return [
  //          Sand   Qtz    Ruby   Sun    Cit    Emer   Saph   Iol    Ame    Dia    Null   Frac   Eig
  /* Sand  */[ 0.15, 0.30, -0.20,  0.05,  0.00, -0.10,  0.00,  0.00,  0.00, -0.05,  0.00,  0.00,  0.00],
  /* Qtz   */[-0.10, 0.10,  0.25, -0.15,  0.10,  0.00,  0.00,  0.00,  0.05,  0.00,  0.00,  0.00,  0.00],
  /* Ruby  */[ 0.05,-0.20,  0.20,  0.40, -0.30,  0.10, -0.15,  0.00,  0.00,  0.00,  0.00,  0.10, -0.10],
  /* Sun   */[ 0.00, 0.10, -0.25,  0.15,  0.45, -0.20,  0.00,  0.05,  0.00,  0.00,  0.00,  0.00,  0.00],
  /* Cit   */[ 0.00,-0.05,  0.15, -0.30,  0.10,  0.35, -0.10,  0.00,  0.10,  0.00,  0.00,  0.00,  0.00],
  /* Emer  */[ 0.10, 0.00, -0.10,  0.10, -0.25,  0.15,  0.40, -0.20,  0.00,  0.05,  0.00,  0.00,  0.05],
  /* Saph  */[ 0.00, 0.00,  0.05, -0.10,  0.05, -0.30,  0.15,  0.45, -0.15,  0.00,  0.00,  0.00,  0.00],
  /* Iol   */[ 0.00, 0.00,  0.00,  0.00, -0.05,  0.10, -0.25,  0.10,  0.40, -0.10,  0.05,  0.00,  0.00],
  /* Ame   */[ 0.00,-0.05,  0.10,  0.00, -0.10,  0.05,  0.10, -0.30,  0.15,  0.30, -0.20,  0.10,  0.00],
  /* Dia   */[-0.15, 0.00,  0.00,  0.00,  0.00, -0.15,  0.00,  0.10, -0.25,  0.10,  0.50, -0.10,  0.15],
  /* Null  */[ 0.00, 0.00,  0.00,  0.00,  0.00,  0.00,  0.05, -0.10,  0.15, -0.35,  0.20,  0.40, -0.20],
  /* Frac  */[ 0.00, 0.05, -0.10,  0.00,  0.00,  0.00,  0.00,  0.00, -0.05,  0.10, -0.30,  0.25,  0.50],
  /* Eig   */[ 0.00, 0.00,  0.10,  0.00,  0.00, -0.05,  0.00,  0.00,  0.00, -0.10,  0.15, -0.40,  0.20],
  ];
}

/**
 * Deep-clone a matrix so mutations don't affect the source.
 */
export function cloneInteractionMatrix(matrix: number[][]): number[][] {
  const result: number[][] = new Array(MOTE_TYPE_COUNT);
  for (let i = 0; i < MOTE_TYPE_COUNT; i++) {
    result[i] = matrix[i].slice();
  }
  return result;
}

/**
 * Generate a random interaction matrix with values in [-maxStrength, maxStrength].
 * Useful for experimentation and late-game randomization.
 */
export function createRandomInteractionMatrix(maxStrength = 0.5, random: () => number = Math.random): number[][] {
  const matrix: number[][] = new Array(MOTE_TYPE_COUNT);
  for (let i = 0; i < MOTE_TYPE_COUNT; i++) {
    matrix[i] = new Array(MOTE_TYPE_COUNT);
    for (let j = 0; j < MOTE_TYPE_COUNT; j++) {
      const stepCount = Math.round(((random() * 2 - 1) * maxStrength) / 0.05);
      matrix[i][j] = Number((stepCount * 0.05).toFixed(2));
    }
  }
  return matrix;
}

/**
 * Serialize matrix to a flat JSON-safe array for save data.
 */
export function serializeInteractionMatrix(matrix: number[][]): number[] {
  const flat: number[] = new Array(MOTE_TYPE_COUNT * MOTE_TYPE_COUNT);
  for (let i = 0; i < MOTE_TYPE_COUNT; i++) {
    for (let j = 0; j < MOTE_TYPE_COUNT; j++) {
      flat[i * MOTE_TYPE_COUNT + j] = matrix[i][j];
    }
  }
  return flat;
}

/**
 * Deserialize a flat array back into a 13×13 matrix.
 * Returns default matrix if the input is invalid.
 */
export function deserializeInteractionMatrix(flat: number[]): number[][] {
  const matrix = createDefaultInteractionMatrix();
  if (!Array.isArray(flat)) return matrix;
  const savedSide = Math.sqrt(flat.length);
  if (!Number.isInteger(savedSide) || savedSide < 1 || savedSide > MOTE_TYPE_COUNT) return matrix;
  for (let i = 0; i < savedSide; i++) {
    for (let j = 0; j < savedSide; j++) {
      const value = flat[i * savedSide + j];
      if (Number.isFinite(value) && value >= -1 && value <= 1) matrix[i][j] = value;
    }
  }
  return matrix;
}
