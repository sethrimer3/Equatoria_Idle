/**
 * rpg-enemy-updates-adv.ts — Re-export barrel for advanced enemy update functions.
 *
 * Implementation is split into two focused files:
 *   - rpg-enemy-updates-adv-early.ts — Iolite, Amethyst, Diamond, Nullstone (wave 40–70)
 *   - rpg-enemy-updates-adv-late.ts  — Fracteryl, Eigenstein, Teleport particles
 */

export {
  updateIoliteEnemies,
  updateAmethystEnemies, updateAmethystShards,
  updateDiamondEnemies, updateDiamondShards,
  updateNullstoneEnemies, updateVoidTendrils,
} from './rpg-enemy-updates-adv-early';

export {
  updateFracterylEnemies,
  updateEigensteinEnemies, updateEigensteinBeams,
  updateTeleportParticles,
} from './rpg-enemy-updates-adv-late';
