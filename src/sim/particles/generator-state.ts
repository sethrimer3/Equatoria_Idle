import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';

/** Fixed generator layout radius in canvas pixels. */
const GENERATOR_RADIUS_PX = 160;

/** Total generator slots in the circular layout. */
const TOTAL_GENERATOR_SLOTS = 11;

/** Angular spacing between adjacent generator slots (radians). */
const ANGLE_STEP = (Math.PI * 2) / TOTAL_GENERATOR_SLOTS;

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

  state.generators = unlockedList.map((tier, i) => {
    // Start at 270° (12 o'clock = -π/2) and space evenly using fixed 11-slot layout
    const angle = -Math.PI / 2 + i * ANGLE_STEP;
    return {
      tierId: tier.id,
      x: equationCenterX + Math.cos(angle) * GENERATOR_RADIUS_PX,
      y: equationCenterY + Math.sin(angle) * GENERATOR_RADIUS_PX,
      range: spawnerGravityRadius,
      tierIndex: tier.unlockOrder,
    };
  });
}
