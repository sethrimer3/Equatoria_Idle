import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';
import { SCENE_ZOOM_SCALE } from '../../data/particles/particle-config';

/** Fixed generator layout radius in canvas pixels (also used for 12th/13th tier distance). */
export const GENERATOR_RADIUS_PX = 160 * SCENE_ZOOM_SCALE;

/** Total generator slots in the Sand-through-Diamond outer ring. */
const TOTAL_OUTER_GENERATOR_SLOTS = 10;

/** Angular spacing between adjacent generator slots (radians). */
const OUTER_ANGLE_STEP = (Math.PI * 2) / TOTAL_OUTER_GENERATOR_SLOTS;

/** Late tiers placed equidistantly around the forge on the inner ring. */
const INNER_TRIANGLE_TIERS: readonly TierId[] = ['nullstone', 'fracteryl', 'eigenstein'];
const INNER_TRIANGLE_INDEX = new Map<TierId, number>(
  INNER_TRIANGLE_TIERS.map((tierId, index) => [tierId, index]),
);
const INNER_ANGLE_STEP = (Math.PI * 2) / INNER_TRIANGLE_TIERS.length;

export interface GeneratorInfo {
  readonly tierId: TierId;
  readonly x: number;
  readonly y: number;
  readonly range: number;
  readonly tierIndex: number;
}

export interface GeneratorState {
  generators: GeneratorInfo[];
  forgeX: number;
  forgeY: number;
  fadeIns: Map<TierId, number>;
}

export function createGeneratorState(): GeneratorState {
  return {
    generators: [],
    forgeX: 160,
    forgeY: 160,
    fadeIns: new Map(),
  };
}

export function computeGeneratorPositions(
  state: GeneratorState,
  _canvasWidth: number,
  _canvasHeight: number,
  equationCenterX: number,
  equationCenterY: number,
  unlockedTiers: ReadonlySet<TierId>,
  spawnerGravityRadius: number,
): void {
  state.forgeX = equationCenterX;
  state.forgeY = equationCenterY;

  const unlockedList = TIERS.filter(t => unlockedTiers.has(t.id));

  // Half-distance used for the late-tier inner triangle.
  const innerRadius = GENERATOR_RADIUS_PX / 2;

  // Sand through Diamond use the outer ring; late tiers use the inner triangle.
  let ringIndex = 0;
  state.generators = unlockedList.map((tier) => {
    const innerIndex = INNER_TRIANGLE_INDEX.get(tier.id);
    if (innerIndex !== undefined) {
      const angle = -Math.PI / 2 + innerIndex * INNER_ANGLE_STEP;
      return {
        tierId: tier.id,
        x: equationCenterX + Math.cos(angle) * innerRadius,
        y: equationCenterY + Math.sin(angle) * innerRadius,
        range: spawnerGravityRadius,
        tierIndex: tier.unlockOrder,
      };
    }
    // Start at 270° (12 o'clock = -π/2) and use the fixed ten-slot layout.
    const angle = -Math.PI / 2 + ringIndex * OUTER_ANGLE_STEP;
    ringIndex++;
    return {
      tierId: tier.id,
      x: equationCenterX + Math.cos(angle) * GENERATOR_RADIUS_PX,
      y: equationCenterY + Math.sin(angle) * GENERATOR_RADIUS_PX,
      range: spawnerGravityRadius,
      tierIndex: tier.unlockOrder,
    };
  });
}
