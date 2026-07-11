export {
  MAX_ALIVENEABLE_UNLOCK_ORDER,
  ALIVEN_ELIGIBLE_TIERS,
  ALIVEN_ELIGIBLE_TIER_IDS,
  ALIVEN_COST,
  MATRIX_EDIT_STEP,
  createAlivenState,
  isTierAliveneable,
  isAlivened,
  canAffordAliven,
  getAlivenCount,
  getAlivenedTiersOrdered,
  tryAliven,
  setInteractionMatrixCell,
  resetInteractionMatrix,
  randomizeInteractionMatrix,
} from './aliven-state';
export type { AlivenState } from './aliven-state';
