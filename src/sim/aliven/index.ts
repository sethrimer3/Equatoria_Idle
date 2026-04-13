export {
  MAX_ALIVENEABLE_UNLOCK_ORDER,
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
} from './aliven-state';
export type { AlivenState } from './aliven-state';
