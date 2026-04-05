import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';
import { GENERATOR_CIRCLE_RADIUS_FRACTION } from '../../data/particles/particle-config';

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
  canvasWidth: number,
  canvasHeight: number,
  equationCenterX: number,
  equationCenterY: number,
  unlockedTiers: ReadonlySet<TierId>,
  spawnerGravityRadius: number,
): void {
  state.forgeX = equationCenterX;
  state.forgeY = equationCenterY;

  const radius = Math.min(canvasWidth, canvasHeight) * GENERATOR_CIRCLE_RADIUS_FRACTION;
  const unlockedList = TIERS.filter(t => unlockedTiers.has(t.id));
  const count = unlockedList.length;

  state.generators = unlockedList.map((tier, i) => {
    const angle = -Math.PI / 2 + (i * Math.PI * 2) / count;
    return {
      tierId: tier.id,
      x: equationCenterX + Math.cos(angle) * radius,
      y: equationCenterY + Math.sin(angle) * radius,
      range: spawnerGravityRadius,
      tierIndex: tier.unlockOrder,
    };
  });
}
