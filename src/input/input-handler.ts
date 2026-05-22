/** Actions that can be dispatched from input. */
export type GameAction =
  | { kind: 'tap'; xScreen: number; yScreen: number; isTouchInput: boolean }
  | { kind: 'purchase_upgrade'; upgradeId: string }
  | { kind: 'unlock_next_tier' }
  | { kind: 'unlock_equation_forge' }
  | { kind: 'upgrade_loom'; tierId: string }
  | { kind: 'upgrade_special_loom'; tierId: string }
  | { kind: 'aliven_mote'; tierId: string }
  | { kind: 'claim_achievement'; achievementId: string }
  | { kind: 'claim_all_achievements' }
  | { kind: 'set_active_tab'; tabId: TabId }
  | { kind: 'save_game' }
  | { kind: 'reset_game' }
  | { kind: 'set_interaction_matrix_cell'; row: number; col: number; value: number }
  | { kind: 'reset_interaction_matrix' }
  | { kind: 'purchase_weapon'; weaponId: string }
  | { kind: 'equip_weapon'; weaponId: string }
  | { kind: 'equip_weapon_to_slot'; weaponId: string; slotIndex: number }
  | { kind: 'unequip_weapon'; weaponId: string }
  | { kind: 'upgrade_weapon_tier'; weaponId: string }
  | { kind: 'purchase_rpg_upgrade'; upgradeId: string }
  | { kind: 'set_respawn_wave'; wave: number }
  | { kind: 'dev_jump_wave'; wave: number }
  | { kind: 'respawn_now' }
  | { kind: 'start_boss_fight'; bossId: number }
  | { kind: 'set_boss_speed'; pct: number }
  | { kind: 'set_invincibility_mode'; enabled: boolean }
  | { kind: 'upgrade_loom_efficiency'; tierId: string }
  | { kind: 'toggle_sand_blade' };

export type TabId = 'equation' | 'resources' | 'rpg' | 'achievements' | 'settings';

export type ActionHandler = (action: GameAction) => void;

/** Maximum ms between two taps to qualify as a double-tap. */
export const DOUBLE_TAP_MAX_MS = 350;
/** Maximum canvas-space distance (px) between two taps to qualify as a double-tap. */
export const DOUBLE_TAP_MAX_PX = 40;

/**
 * Sets up touch and mouse event listeners on the game canvas area.
 * Translates raw input into GameActions.
 */
export function setupInputListeners(
  tapTarget: HTMLElement,
  dispatch: ActionHandler,
): () => void {
  const onPointerDown = (e: PointerEvent) => {
    e.preventDefault();
    dispatch({ kind: 'tap', xScreen: e.clientX, yScreen: e.clientY, isTouchInput: e.pointerType === 'touch' });
  };

  tapTarget.addEventListener('pointerdown', onPointerDown, { passive: false });

  // Cleanup
  return () => {
    tapTarget.removeEventListener('pointerdown', onPointerDown);
  };
}
