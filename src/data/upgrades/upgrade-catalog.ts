import type { UpgradeDefinition } from './upgrade-types';
import { TIERS, type TierId } from '../tiers';
import { EQUATION_ROLE_BY_TIER, type EquationRole } from '../equation';
import {
  BASE_UPGRADE_COST,
  UPGRADE_COST_SCALE_FACTOR,
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

// ─── All upgrade definitions ────────────────────────────────────

export const ALL_UPGRADES: readonly UpgradeDefinition[] = EQUATION_PART_UPGRADES;

/** Quick lookup by upgrade id. */
export const UPGRADE_BY_ID: ReadonlyMap<string, UpgradeDefinition> = new Map(
  ALL_UPGRADES.map(u => [u.id, u]),
);
