/**
 * rpg-weapon-tick.ts — Per-frame weapon system update dispatch.
 *
 * Extracted from rpg-render.ts to keep that file focused on orchestration.
 * Handles:
 *   - Calling each active weapon system's per-frame update function
 *   - Per-weapon auto-attack timer countdown and attack dispatch
 *   - Sand blade default melee (active unless Diamond Blade is equipped)
 *
 * Sand Blade behaviour:
 *   The Sand Blade is the player's permanent default melee weapon.  It runs
 *   whenever Diamond Blade (diamond_bastion) is NOT in the effective equipped
 *   set.  Equipping Ruby Laser, Chain Whip, or any other non-diamond weapon
 *   does NOT suppress the Sand Blade — those weapons coexist with it.
 *   When Diamond Blade IS equipped it takes over the melee slot entirely and
 *   the Sand Blade is suppressed.
 */

import { resolveWeaponDefinition } from '../../data/rpg/crafted-weapon-helpers';
import {
  PLAYER_BASE_COOLDOWN_MS,
  BASE_ATTACK_TIMER_KEY,
  DIAMOND_BLADE_ID,
} from './rpg-constants';
import { getScaledWeaponCooldown } from '../../sim/rpg/rpg-state';
import type { RpgSimState } from '../../sim/rpg/rpg-state';
import { spawnSandSwingPixels, updateSandDriftPixels } from './rpg-weapon-draw-sword';
import { getSwordLength } from './rpg-helpers';
import type { RpgWeaponHandle } from './rpg-weapon-systems';
import type { SwordComboPhase } from './rpg-types';

// ── Context interface ─────────────────────────────────────────────────────────

/**
 * All state needed by `tickWeaponSystems` to run one frame of weapon updates
 * and attack dispatch.
 */
export interface WeaponTickCtx {
  /** The weapon system handle produced by createRpgWeaponSystems. */
  readonly weaponSystems: RpgWeaponHandle;
  /** Stats-panel DPS tracker — wraps callbacks to attribute damage. */
  readonly statsPanel: { withDamageSource: (id: string | null, fn: () => void) => void };
  /** Simulation state providing weapon tier look-up. */
  readonly rpgSimState: Pick<RpgSimState, 'weaponTiersByWeaponId' | 'sandBladeEnabled'>;
  /** Per-weapon countdown timers (ms until next auto-attack). Mutated in-place. */
  readonly weaponAttackTimers: Map<string, number>;
  /** Player mote position — used to anchor sand-drift pixel spawns. */
  readonly mote: { x: number; y: number };
  /** Returns the set of currently equipped weapon IDs (may be a boss override). */
  getEffectiveEquippedIds(): Set<string>;
  /** Returns the ID of the first equipped weapon with the given effect kind, or null. */
  findEquippedWeaponIdByEffect(kind: string): string | null;
  /** Returns the SPD multiplier for the given weapon (>= 1). Used to divide cooldown. */
  getWeaponSpdMultiplier(weaponId: string): number;
  /** Fire one auto-attack with the given weapon. */
  performWeaponAttack(weaponId: string): void;
  /** Remove enemies whose HP dropped to zero since the last removal pass. */
  removeDeadEnemies(): void;
  /** Re-check whether the wave is complete after combat. */
  checkWaveCompletion(): void;
  /** Returns the sand blade combo phase from the previous frame. */
  getPrevSandBladePhase(): SwordComboPhase;
  /** Stores the sand blade combo phase to compare on the next frame. */
  setPrevSandBladePhase(phase: SwordComboPhase): void;
}

// ── Main tick function ────────────────────────────────────────────────────────

/**
 * Runs one frame of weapon system updates and auto-attack timers.
 *
 * Call order mirrors the original inline sequence in rpg-render.ts:
 *   1. Weapon effect system updates (sand, chainWhip, vortex, etc.)
 *   2. Per-weapon auto-attack timer countdown → performWeaponAttack when ready
 *   3. Sand blade default melee when Diamond Blade is not equipped
 */
export function tickWeaponSystems(ctx: WeaponTickCtx, deltaMs: number): void {
  const { weaponSystems, statsPanel } = ctx;
  const equippedIds = ctx.getEffectiveEquippedIds();

  // ── Weapon effect system updates ─────────────────────────────────────────────
  statsPanel.withDamageSource(ctx.findEquippedWeaponIdByEffect('gatling'), () => weaponSystems.updateSandProjectiles(deltaMs));

  for (const weaponId of equippedIds) {
    const wd = resolveWeaponDefinition(weaponId);
    if (wd?.stats.effect?.kind === 'chainWhip') {
      statsPanel.withDamageSource(weaponId, () => weaponSystems.updateChainWhip(weaponId, deltaMs));
    }
  }

  for (const weaponId of equippedIds) {
    const wd = resolveWeaponDefinition(weaponId);
    if (wd?.stats.effect?.kind === 'vortex') {
      statsPanel.withDamageSource(weaponId, () => weaponSystems.updateVortexWeapon(weaponId, deltaMs));
    }
    if (wd?.stats.effect?.kind === 'swordCombo') {
      statsPanel.withDamageSource(weaponId, () => weaponSystems.updateSwordCombo(weaponId, deltaMs));
    }
  }

  statsPanel.withDamageSource(ctx.findEquippedWeaponIdByEffect('vortex'), () => weaponSystems.updateVortexes(deltaMs));
  statsPanel.withDamageSource(ctx.findEquippedWeaponIdByEffect('poisonBolt'), () => {
    weaponSystems.updatePoisonBolts(deltaMs);
    weaponSystems.updatePoisonDebuffs(deltaMs);
  });
  statsPanel.withDamageSource(ctx.findEquippedWeaponIdByEffect('emeraldMissile'), () => {
    weaponSystems.updateEmeraldPlayerMissiles(deltaMs);
    weaponSystems.updateEmeraldSubMissiles(deltaMs);
  });
  weaponSystems.updateEmeraldSwirlParticles(deltaMs);
  statsPanel.withDamageSource(ctx.findEquippedWeaponIdByEffect('sunstoneMine'), () => weaponSystems.updateSunstoneMines(deltaMs));
  weaponSystems.updateLaserBeamEffect(deltaMs);
  statsPanel.withDamageSource(ctx.findEquippedWeaponIdByEffect('fracterylSpear'), () => {
    weaponSystems.updateFracterylSpears(deltaMs);
    weaponSystems.updateFracterylBlooms(deltaMs);
  });

  // ── Companion ship systems ────────────────────────────────────────────────────
  weaponSystems.updateSapphireShips(deltaMs);
  weaponSystems.updateSapphireLasers(deltaMs);
  weaponSystems.updateAmethystShips(deltaMs);
  weaponSystems.updateAmethystLasers(deltaMs);

  ctx.removeDeadEnemies();
  ctx.checkWaveCompletion();

  // ── Per-weapon auto-attack timer countdown ────────────────────────────────────
  for (const weaponId of equippedIds) {
    const weaponDef = resolveWeaponDefinition(weaponId);
    // Weapons that manage their own timing — skip the generic cooldown here.
    if (weaponDef?.stats.effect?.kind === 'chainWhip'    ||
        weaponDef?.stats.effect?.kind === 'vortex'       ||
        weaponDef?.stats.effect?.kind === 'swordCombo'   ||
        weaponDef?.stats.effect?.kind === 'sapphireShip' ||
        weaponDef?.stats.effect?.kind === 'amethystShip') continue;

    const tier = ctx.rpgSimState.weaponTiersByWeaponId.get(weaponId) ?? 1;
    const spdMult = ctx.getWeaponSpdMultiplier(weaponId);
    const baseCooldownMs = weaponDef
      ? getScaledWeaponCooldown(weaponDef.stats.cooldownMs, tier)
      : PLAYER_BASE_COOLDOWN_MS;
    const cooldownMs = baseCooldownMs / Math.max(1, spdMult);

    const current = ctx.weaponAttackTimers.get(weaponId) ?? 0;
    const next = current - deltaMs;
    if (next <= 0) {
      ctx.weaponAttackTimers.set(weaponId, cooldownMs);
      statsPanel.withDamageSource(weaponId, () => ctx.performWeaponAttack(weaponId));
      ctx.removeDeadEnemies();
      ctx.checkWaveCompletion();
    } else {
      ctx.weaponAttackTimers.set(weaponId, next);
    }
  }

  // ── Sand blade default melee (active unless Diamond Blade is equipped or disabled) ──
  // Sand Blade is always the default melee weapon.  It is suppressed when either:
  //   (a) diamond_bastion is equipped — Diamond Sword takes over the melee slot entirely, OR
  //   (b) rpgSimState.sandBladeEnabled is false — player explicitly disabled it (e.g., to
  //       stay at ranged distance using only ranged weapons).
  if (!equippedIds.has(DIAMOND_BLADE_ID) && ctx.rpgSimState.sandBladeEnabled) {
    weaponSystems.updateSandBlade(deltaMs);
    const sandState = weaponSystems.swordComboStates.get(BASE_ATTACK_TIMER_KEY);
    if (sandState) {
      if (sandState.phase === 'swing' && ctx.getPrevSandBladePhase() !== 'swing') {
        spawnSandSwingPixels(ctx.mote.x, ctx.mote.y, sandState.swipeArcStart, sandState.swipeArcEnd, getSwordLength(1));
      }
      ctx.setPrevSandBladePhase(sandState.phase);
    }
    updateSandDriftPixels(deltaMs);
  }
}
