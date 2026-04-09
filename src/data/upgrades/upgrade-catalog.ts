import type { UpgradeDefinition } from './upgrade-types';
import { TIERS, type TierId } from '../tiers';
import { EQUATION_ROLE_BY_TIER, type EquationOperator } from '../equation';
import {
  BASE_UPGRADE_COST,
  UPGRADE_COST_SCALE_FACTOR,
} from '../balance';

// ─── Planned equation-part upgrades ─────────────────────────────

function operatorLabel(operator: EquationOperator): string {
  switch (operator) {
    case 'passive_time':
      return 'Passive Term';
    case 'manual_input':
      return 'Manual Term';
    case 'addition':
      return 'Addition';
    case 'multiplication':
      return 'Multiplier';
    case 'exponentiation':
      return 'Exponent';
    case 'summation':
      return 'Summation';
    case 'product':
      return 'Product';
    case 'factorial':
      return 'Factorial';
    case 'integration':
      return 'Integration';
    case 'recursion':
      return 'Recursion';
    default:
      return 'Foundation';
  }
}

function makeEquationPartUpgrade(tierId: TierId, displayName: string, baseCost: number): UpgradeDefinition {
  const role = EQUATION_ROLE_BY_TIER.get(tierId);
  const partName = role ? operatorLabel(role.operator) : 'Equation Part';
  const description = role
    ? `${role.roleDescription}. Increase ${displayName}'s ${partName.toLowerCase()} strength`
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
