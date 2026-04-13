/** Actions that can be dispatched from input. */
export type GameAction =
  | { kind: 'tap'; xScreen: number; yScreen: number }
  | { kind: 'purchase_upgrade'; upgradeId: string }
  | { kind: 'unlock_next_tier' }
  | { kind: 'unlock_equation_forge' }
  | { kind: 'upgrade_loom'; tierId: string }
  | { kind: 'aliven_mote'; tierId: string }
  | { kind: 'claim_achievement'; achievementId: string }
  | { kind: 'set_active_tab'; tabId: TabId }
  | { kind: 'save_game' }
  | { kind: 'reset_game' }
  | { kind: 'set_interaction_matrix_cell'; row: number; col: number; value: number }
  | { kind: 'reset_interaction_matrix' };

export type TabId = 'equation' | 'looms' | 'resources' | 'achievements' | 'settings';

export type ActionHandler = (action: GameAction) => void;

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
    dispatch({ kind: 'tap', xScreen: e.clientX, yScreen: e.clientY });
  };

  tapTarget.addEventListener('pointerdown', onPointerDown, { passive: false });

  // Cleanup
  return () => {
    tapTarget.removeEventListener('pointerdown', onPointerDown);
  };
}
