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
  | { kind: 'toggle_rpg_skill_node'; upgradeId: string }
  | { kind: 'set_respawn_wave'; wave: number }
  | { kind: 'dev_jump_wave'; wave: number }
  | { kind: 'dev_grant_sample_equipment' }
  | { kind: 'dev_grant_random_lens' }
  | { kind: 'dev_grant_random_weave' }
  | { kind: 'dev_simulate_equipment_rewards' }
  | { kind: 'respawn_now' }
  | { kind: 'start_boss_fight'; bossId: number }
  | { kind: 'set_boss_speed'; pct: number }
  | { kind: 'set_invincibility_mode'; enabled: boolean }
  | { kind: 'set_topographic_terrain_debug'; enabled: boolean }
  | { kind: 'set_rpg_viewport_debug'; enabled: boolean }
  | { kind: 'set_rpg_pathfinding_debug'; enabled: boolean }
  | { kind: 'set_rpg_verdure_wall_debug'; enabled: boolean }
  | { kind: 'set_rpg_nadir_anchor_debug'; enabled: boolean }
  | { kind: 'set_rpg_boss_stage_debug'; enabled: boolean }
  | { kind: 'set_topography_lighting_debug'; enabled: boolean }
  | { kind: 'set_sharp_topography_shadows'; enabled: boolean }
  | { kind: 'set_soft_impetus_asteroid_shadows'; enabled: boolean }
  | { kind: 'set_rpg_pixelated_render'; enabled: boolean }
  | { kind: 'set_rpg_debug_overlay'; enabled: boolean }
  | { kind: 'upgrade_loom_efficiency'; tierId: string }
  | { kind: 'toggle_sand_blade' }
  | { kind: 'craft_weapon'; ingredients: Array<{ tierId: string; refinedCount: number | bigint }> }
  | { kind: 'craft_weave'; ingredients: Array<{ tierId: string; refinedCount: number | bigint }> }
  | { kind: 'craft_lens'; ingredients: Array<{ tierId: string; refinedCount: number | bigint }> }
  | { kind: 'attach_lens_to_weapon'; lensId: string; weaponId: string }
  | { kind: 'equip_weave_to_slot'; weaveId: string; slotIndex: number }
  | { kind: 'unequip_weave'; weaveId: string }
  | { kind: 'move_weave_slot'; fromSlotIndex: number; toSlotIndex: number }
  | { kind: 'swap_weapon_slots'; slotA: number; slotB: number }
  | { kind: 'dismantle_lens'; lensId: string }
  | { kind: 'dismantle_weave'; weaveId: string }
  | { kind: 'refine_lens'; lensId: string }
  | { kind: 'refine_weave'; weaveId: string }
  | { kind: 'dev_grant_resonance_dust'; amount: number }
  | { kind: 'dev_refine_lens_free'; lensId: string }
  | { kind: 'dev_refine_weave_free'; weaveId: string }
  | { kind: 'dev_grant_duplicate_lenses' }
  | { kind: 'dev_grant_duplicate_weaves' };

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
