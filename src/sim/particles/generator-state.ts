import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';
import { SCENE_ZOOM_SCALE } from '../../data/particles/particle-config';

/** Fixed generator layout radius in canvas pixels (also used for 12th/13th tier distance). */
export const GENERATOR_RADIUS_PX = 160 * SCENE_ZOOM_SCALE;

/** Total generator slots in the circular layout (tiers 1–11). */
const TOTAL_GENERATOR_SLOTS = 11;

/** Angular spacing between adjacent generator slots (radians). */
const ANGLE_STEP = (Math.PI * 2) / TOTAL_GENERATOR_SLOTS;

/** Tier placed directly above the forge (12th tier, unlockOrder 11). */
const SPECIAL_ABOVE_TIER: TierId = TIERS[11].id;
/** Tier placed directly below the forge (13th tier, unlockOrder 12). */
const SPECIAL_BELOW_TIER: TierId = TIERS[12].id;

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

  // Half-distance used for the special 12th/13th tier generators
  const innerRadius = GENERATOR_RADIUS_PX / 2;

  // Tiers 1–11 go in the ring; fracteryl and eigenstein get special positions
  let ringIndex = 0;
  state.generators = unlockedList.map((tier) => {
    if (tier.id === SPECIAL_ABOVE_TIER) {
      return {
        tierId: tier.id,
        x: equationCenterX,
        y: equationCenterY - innerRadius,
        range: spawnerGravityRadius,
        tierIndex: tier.unlockOrder,
      };
    }
    if (tier.id === SPECIAL_BELOW_TIER) {
      return {
        tierId: tier.id,
        x: equationCenterX,
        y: equationCenterY + innerRadius,
        range: spawnerGravityRadius,
        tierIndex: tier.unlockOrder,
      };
    }
    // Start at 270° (12 o'clock = -π/2) and space evenly using fixed 11-slot layout
    const angle = -Math.PI / 2 + ringIndex * ANGLE_STEP;
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
