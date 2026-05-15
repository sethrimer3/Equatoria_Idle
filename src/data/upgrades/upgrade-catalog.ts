import type { UpgradeDefinition } from './upgrade-types';
import { TIERS, type TierId } from '../tiers';
import { EQUATION_ROLE_BY_TIER, type EquationRole } from '../equation';
import {
  BASE_UPGRADE_COST,
  UPGRADE_COST_SCALE_FACTOR,
  BASE_AUTO_TAP_INTERVAL_MS,
  AUTO_TAP_INTERVAL_REDUCTION_MS,
  MIN_AUTO_TAP_INTERVAL_MS,
} from '../balance';

// ─── Planned equation-part upgrades ─────────────────────────────

function roleLabel(role: EquationRole): string {
  switch (role) {
    case 'time_argument':
      return 'Time Scale';
    case 'base_value':
      return 'Base Value';
    case 'additive_slot':
      return 'Additive Term';
    case 'multiplier_slot':
      return 'Multiplier';
    case 'exponent_slot':
      return 'Exponent';
    case 'summation_wrap':
      return 'Summation';
    case 'product_wrap':
      return 'Product';
    case 'factorial_wrap':
      return 'Factorial';
    case 'integral_wrap':
      return 'Integration';
    case 'recursion_wrap':
      return 'Recursion';
    default:
      return 'Foundation';
  }
}

function makeEquationPartUpgrade(tierId: TierId, displayName: string, baseCost: number): UpgradeDefinition {
  const tierRole = EQUATION_ROLE_BY_TIER.get(tierId);
  const partName = tierRole ? roleLabel(tierRole.role) : 'Equation Part';
  const description = tierRole
    ? `${tierRole.roleDescription}. Increase ${displayName}'s ${partName.toLowerCase()} strength`
    : `Increase ${displayName}'s equation contribution`;

  return {
    id: `equation_${tierId}`,
    displayName: `${displayName}: ${partName}`,
    description,
    tierId,
    effectKind: 'tap_value',
    maxLevel: 0,  // unlimited
    baseCost,
    costScaleFactor: UPGRADE_COST_SCALE_FACTOR,
    effectPerLevel: 1,
    icon: '∴',
  };
}

/** Per-tier equation-part upgrades (excluding Sand foundation). */
export const EQUATION_PART_UPGRADES: readonly UpgradeDefinition[] = TIERS
  .filter(t => !t.isSecret && t.id !== 'sand')
  .map((t, i) =>
    makeEquationPartUpgrade(t.id, t.displayName, BASE_UPGRADE_COST * Math.pow(5, i)),
  );

// ─── Auto-tap speed upgrades ─────────────────────────────────────

/**
 * Maximum auto-tap levels, derived from the balance constants.
 * Each level reduces the interval by AUTO_TAP_INTERVAL_REDUCTION_MS (400 ms),
 * so (BASE - MIN) / REDUCTION levels reach the hard floor.
 * An extra level is added as the first purchase that enables auto-tap at all.
 */
const AUTO_TAP_MAX_LEVEL = Math.ceil(
  (BASE_AUTO_TAP_INTERVAL_MS - MIN_AUTO_TAP_INTERVAL_MS) / AUTO_TAP_INTERVAL_REDUCTION_MS,
) + 1;   // +1 because level 1 = unlock at base interval; level 2+ = speed upgrades

/** Auto-tap speed upgrade — unlocks auto-tap at level 1, then speeds it up each level. */
export const AUTO_TAP_UPGRADE: UpgradeDefinition = {
  id: 'auto_tap_speed',
  displayName: 'Auto-Tap Speed',
  description: `Unlock automatic equation tapping (level 1), then reduce the interval by ${AUTO_TAP_INTERVAL_REDUCTION_MS} ms per level (minimum ${MIN_AUTO_TAP_INTERVAL_MS} ms).`,
  tierId: 'sand',
  effectKind: 'auto_tap_speed',
  maxLevel: AUTO_TAP_MAX_LEVEL,
  baseCost: 50,              // first level costs 50 sand motes (equals EQUATION_FORGE_COST)
  costScaleFactor: 3,        // triples each level: 50 → 150 → 450 → 1350 …
  effectPerLevel: AUTO_TAP_INTERVAL_REDUCTION_MS,
  icon: '⚙',
};

// ─── All upgrade definitions ────────────────────────────────────

export const ALL_UPGRADES: readonly UpgradeDefinition[] = [
  AUTO_TAP_UPGRADE,
  ...EQUATION_PART_UPGRADES,
];

/** Quick lookup by upgrade id. */
export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDefinition> = new Map(
  ALL_UPGRADES.map(u => [u.id, u]),
);
