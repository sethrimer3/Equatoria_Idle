/**
 * rpg-weapon-sword.ts — Diamond sword combo weapon system for the RPG tab.
 *
 * Defines the SwordWeaponCtx dependency-injection interface and the
 * SwordWeaponHandle returned to callers.  The full per-frame combo state
 * machine (idle → swing → combo_window → spin_combo), hit detection, and
 * visual helpers live in rpg-weapon-sword-combo.ts to keep file sizes manageable.
 *
 * createSwordWeaponSystem(ctx) is the sole factory exported here.
 */

import type { SwordComboState } from './rpg-types';
import {
  type SwordWeaponCtx,
  updateSwordComboForWeapon,
} from './rpg-weapon-sword-combo';

// Re-export the context type so existing importers stay compatible.
export type { SwordWeaponCtx };

// ── Handle returned to the caller ─────────────────────────────────────────

export interface SwordWeaponHandle {
  readonly swordComboStates: Map<string, SwordComboState>;
  updateSwordCombo: (weaponId: string, deltaMs: number) => void;
  reset: () => void;
}

// ── Factory ───────────────────────────────────────────────────────────────

export function createSwordWeaponSystem(ctx: SwordWeaponCtx): SwordWeaponHandle {
  const swordComboStates: Map<string, SwordComboState> = new Map();
  return {
    get swordComboStates() { return swordComboStates; },
    updateSwordCombo(weaponId: string, deltaMs: number): void {
      updateSwordComboForWeapon(swordComboStates, ctx, weaponId, deltaMs);
    },
    reset(): void {
      swordComboStates.clear();
    },
  };
}

