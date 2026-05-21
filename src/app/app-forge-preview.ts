/**
 * app-forge-preview.ts — Real-time equation upgrade preview for the forge warm-up.
 *
 * During the forge warm-up, this module computes what the equation would look
 * like *if all eligible particles currently inside the forge influence radius
 * were sacrificed right now*.  The resulting EquationTermView[] is passed to
 * the HUD overlay every frame so the player can see the projected upgrade.
 *
 * Separation of concerns
 * ─────────────────────
 * - This file lives in the app layer because it straddles the render layer
 *   (needs EquatoriaParticle positions) and the sim layer (reads equation /
 *   forge state, reuses the sacrifice logic).  The sim layer itself must not
 *   import render types, so this bridge lives here.
 * - It NEVER mutates authoritative state; all changes are made on a shallow copy.
 */

import type { EquatoriaParticle } from '../render/particles/particle-types';
import type { EquationState } from '../sim/equation';
import { buildEquationView, type EquationTermView } from '../sim/equation';
import type { ForgeCrunchState } from '../sim/forge/forge-state';
import { MEDIUM_SIZE_INDEX } from '../data/particles/size-tiers';
import { getSizeSmallEquivalent } from '../data/particles/size-tiers';
import { MAX_FORGE_ATTRACTION_DISTANCE } from '../data/particles/particle-config';

/** Must match the THRESHOLD in applyForgeSacrifice (game-state.ts). */
const SACRIFICE_THRESHOLD = 2_000;

/**
 * Compute what the equation would look like if the eligible particles currently
 * inside the forge's influence radius were sacrificed.
 *
 * Returns a preview EquationTermView[] when the forge is warming up or active
 * and at least one upgrade would result, or null otherwise.
 *
 * This function is deliberately pure — it never modifies the passed state objects.
 */
export function computeForgePreviewTerms(
  particles: readonly EquatoriaParticle[],
  equationState: EquationState,
  forgeState: ForgeCrunchState,
  forgeX: number,
  forgeY: number,
): EquationTermView[] | null {
  if (!forgeState.isWarmingUp && !forgeState.isActive) return null;

  const influenceRadius = MAX_FORGE_ATTRACTION_DISTANCE;
  const radiusSq = influenceRadius * influenceRadius;

  // Collect sacrifice mass by tier from eligible particles in the influence radius
  const sacrifices = new Map<string, number>();
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (p.sizeIndex < MEDIUM_SIZE_INDEX || p.isMerging) continue;
    const dx = forgeX - p.x;
    const dy = forgeY - p.y;
    if (dx * dx + dy * dy > radiusSq) continue;
    const equiv = getSizeSmallEquivalent(p.sizeIndex);
    sacrifices.set(p.tierId, (sacrifices.get(p.tierId) ?? 0) + equiv);
  }

  // Shallow-copy equation segments (only the level field matters for preview)
  const previewSegments = equationState.segments.map(s => ({ ...s }));
  const previewEq: EquationState = {
    segments: previewSegments,
    totalTapCount: equationState.totalTapCount,
    isForgeUnlocked: equationState.isForgeUnlocked,
  };

  // Apply sacrifices to the preview state using the same threshold as the real sacrifice
  let anyUpgrade = false;
  for (const [tierId, mass] of sacrifices) {
    const prev = forgeState.sacrificeProgressByTierId.get(tierId) ?? 0;
    let total = prev + mass;
    const seg = previewSegments.find(s => s.tierId === tierId);
    if (!seg || !seg.isUnlocked) continue;
    while (total >= SACRIFICE_THRESHOLD) {
      total -= SACRIFICE_THRESHOLD;
      seg.level += 1;
      anyUpgrade = true;
    }
  }

  // Only show the preview if at least one upgrade would occur
  if (!anyUpgrade) return null;

  return buildEquationView(previewEq);
}
