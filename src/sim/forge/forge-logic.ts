import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';
import type { ForgeCrunchState } from './forge-state';
import type { SizeIndex } from '../../data/particles/size-tiers';
import {
  MEDIUM_SIZE_INDEX,
  LARGE_SIZE_INDEX,
  EXTRA_LARGE_SIZE_INDEX,
} from '../../data/particles/size-tiers';
import {
  FORGE_VALID_WAIT_TIME_MS,
  FORGE_CRUNCH_DURATION_MS,
} from '../../data/particles/particle-config';

export interface ForgeParticleInfo {
  readonly tierId: TierId;
  readonly sizeIndex: SizeIndex;
  readonly x: number;
  readonly y: number;
  readonly isMerging: boolean;
}

export interface CrunchOutput {
  readonly outputTierId: TierId;
  readonly outputSizeIndex: SizeIndex;
}

export function getCrunchOutput(tierId: TierId, sizeIndex: SizeIndex): CrunchOutput | null {
  const tierIndex = TIERS.findIndex(t => t.id === tierId);
  if (tierIndex < 0) return null;

  if (sizeIndex === MEDIUM_SIZE_INDEX) {
    const nextIndex = tierIndex + 1;
    if (nextIndex >= TIERS.length) return null;
    return { outputTierId: TIERS[nextIndex].id, outputSizeIndex: 0 };
  }
  if (sizeIndex === LARGE_SIZE_INDEX) {
    const nextIndex = tierIndex + 1;
    if (nextIndex >= TIERS.length) return null;
    return { outputTierId: TIERS[nextIndex].id, outputSizeIndex: 1 };
  }
  // For size 3+ (extra-large and beyond), tier-jump by 2
  if (sizeIndex >= EXTRA_LARGE_SIZE_INDEX) {
    const nextIndex = tierIndex + 2;
    if (nextIndex >= TIERS.length) return null;
    return { outputTierId: TIERS[nextIndex].id, outputSizeIndex: sizeIndex - 1 };
  }
  return null;
}

export function checkForgeCrunch(
  state: ForgeCrunchState,
  particles: readonly ForgeParticleInfo[],
  forgeX: number,
  forgeY: number,
  forgeRadius: number,
  nowMs: number,
): ForgeParticleInfo[] | null {
  if (state.isActive) return null;

  const validParticles = particles.filter(p => {
    if (p.isMerging) return false;
    if (p.sizeIndex < MEDIUM_SIZE_INDEX) return false;
    const output = getCrunchOutput(p.tierId, p.sizeIndex);
    if (!output) return false;
    const dx = p.x - forgeX;
    const dy = p.y - forgeY;
    return Math.sqrt(dx * dx + dy * dy) <= forgeRadius;
  });

  if (validParticles.length > 0) {
    if (state.validParticlesTimerMs === null) {
      state.validParticlesTimerMs = nowMs;
    } else {
      const elapsed = nowMs - state.validParticlesTimerMs;
      if (elapsed >= FORGE_VALID_WAIT_TIME_MS) {
        return validParticles;
      }
    }
  } else {
    state.validParticlesTimerMs = null;
  }
  return null;
}

export function startForgeCrunch(state: ForgeCrunchState, nowMs: number): void {
  state.isActive = true;
  state.startTimeMs = nowMs;
  state.progress = 0;
  state.validParticlesTimerMs = null;
  state.endTimeMs = null;
}

export function updateForgeCrunch(state: ForgeCrunchState, nowMs: number): boolean {
  if (!state.isActive || state.startTimeMs === null) return false;
  state.progress = Math.min((nowMs - state.startTimeMs) / FORGE_CRUNCH_DURATION_MS, 1);
  if (state.progress >= 1) {
    state.isActive = false;
    state.progress = 0;
    state.startTimeMs = null;
    state.endTimeMs = nowMs;
    return true;
  }
  return false;
}

export function getEquationCrunchBonus(equationUpgradeLevelForTier: number): number {
  return Math.min(Math.floor(equationUpgradeLevelForTier / 5), 2);
}
