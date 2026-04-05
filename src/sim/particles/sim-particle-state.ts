import type { TierId } from '../../data/tiers';
import type { SizeIndex } from '../../data/particles/size-tiers';
import { SIZE_SMALL_EQUIVALENTS } from '../../data/particles/size-tiers';

export interface SimParticleState {
  inventory: Map<TierId, number>;
  unlockedTiers: Set<TierId>;
}

export function createSimParticleState(): SimParticleState {
  return {
    inventory: new Map(),
    unlockedTiers: new Set(['red']),
  };
}

export function updateInventory(
  state: SimParticleState,
  particleTiers: readonly { tierId: TierId; sizeIndex: SizeIndex }[],
): void {
  for (const key of state.inventory.keys()) {
    state.inventory.set(key, 0);
  }
  for (const p of particleTiers) {
    const smallEquiv = SIZE_SMALL_EQUIVALENTS[p.sizeIndex] ?? 1;
    const current = state.inventory.get(p.tierId) ?? 0;
    state.inventory.set(p.tierId, current + smallEquiv);
  }
}

export function getInventoryTotal(state: SimParticleState): number {
  let total = 0;
  for (const v of state.inventory.values()) total += v;
  return total;
}
