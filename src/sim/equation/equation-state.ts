import type { TierId } from '../../data/tiers';
import { TIERS } from '../../data/tiers';

// ─── Types ──────────────────────────────────────────────────────

/** Per-tier equation segment state. */
export interface TierEquationSegment {
  tierId: TierId;
  level: number;           // upgrade level (0 = base)
  isUnlocked: boolean;
}

/** Full equation state (authoritative). */
export interface EquationState {
  segments: TierEquationSegment[];
  totalTapCount: number;
}

// ─── Factory ────────────────────────────────────────────────────

export function createEquationState(unlockedTierCount: number): EquationState {
  return {
    segments: TIERS.map((t, i) => ({
      tierId: t.id,
      level: 0,
      isUnlocked: i < unlockedTierCount,
    })),
    totalTapCount: 0,
  };
}

// ─── Queries ────────────────────────────────────────────────────

export function getSegment(state: EquationState, tierId: TierId): TierEquationSegment | undefined {
  return state.segments.find(s => s.tierId === tierId);
}

export function getUnlockedSegments(state: EquationState): TierEquationSegment[] {
  return state.segments.filter(s => s.isUnlocked);
}

// ─── Mutations ──────────────────────────────────────────────────

export function applyEquationUpgrade(state: EquationState, tierId: TierId): boolean {
  const seg = getSegment(state, tierId);
  if (!seg || !seg.isUnlocked) return false;
  seg.level += 1;
  return true;
}

export function unlockTier(state: EquationState, tierId: TierId): boolean {
  const seg = getSegment(state, tierId);
  if (!seg || seg.isUnlocked) return false;
  seg.isUnlocked = true;
  return true;
}

export function incrementTapCount(state: EquationState): void {
  state.totalTapCount += 1;
}
