import type { TierId } from '../data/tiers';
import { TIERS } from '../data/tiers';
import { createCraftedWeaponDefinition, getForgeCapacity, registerCraftedWeapons } from '../data/rpg/crafted-weapon-helpers';
import { createCraftedWeave } from '../data/rpg/weave-rolling';
import { createCraftedLens } from '../data/rpg/lens-rolling';
import { getRpgUpgradeLevel } from './rpg';
import type { CraftedWeaponIngredient } from '../data/rpg/crafted-weapon-types';
import type { SizeIndex } from '../data/particles/size-tiers';
import { MERGE_THRESHOLD } from '../data/particles/size-tiers';
import {
  INITIAL_UNLOCKED_TIER_COUNT,
  tierUnlockCost,
  PARTICLES_PER_TAP,
  EQUATION_FORGE_COST,
} from '../data/balance';
import { UPGRADE_BY_ID } from '../data/upgrades';
import {
  createEquationState,
  incrementTapCount,
  computeTapGains,
  applyEquationUpgrade,
  unlockTier as unlockEquationTier,
  unlockForge,
  type EquationState,
} from './equation';
import {
  createResourceState,
  addMotes,
  getMotes,
  spendMotes,
  getTotalMotes,
  type ResourceState,
} from './resources';
import {
  createProgressionState,
  purchaseUpgrade,
  getUpgradeCost,
  getAutoTapIntervalMs,
  type ProgressionState,
} from './progression';
import {
  createForgeCrunchState,
  REFINED_CRYSTAL_THRESHOLD,
  tapForgeHeat,
  startForgeWarmup,
  tickForgeHeatTimeout,
  type ForgeCrunchState,
} from './forge';
import {
  createLoomState,
  tickLooms,
  upgradeLoom,
  unlockLoom,
  getLoom,
  getLoomCost,
  purchaseSpecialLoom,
  applyLoomCapture,
  tryUpgradeLoomEfficiency,
  getLoomForInputTier,
  type LoomState,
} from './looms';
import {
  createAchievementState,
  checkAndUnlockAchievements,
  type AchievementState,
} from './achievements';
import {
  createAlivenState,
  tryAliven,
  type AlivenState,
} from './aliven';
import {
  createRpgSimState,
  getWaveBoostMultiplier,
  type RpgSimState,
} from './rpg';
import {
  recordForgeCrunch,
  recordForgeSacrifice,
  recordLoomCapture,
  recordLoomEfficiencyUpgrade,
  recordLoomPassiveMotes,
} from '../dev/session-telemetry';

// ─── Pending idle mote queue ────────────────────────────────────

/**
 * A single entry in the pending idle-mote drip queue.
 * Each entry represents a batch of motes of the same tier and size
 * waiting to be added to resources one-by-one (one per simTick frame).
 */
export interface PendingMoteEntry {
  tierId: TierId;
  /** Size index in base-MERGE_THRESHOLD representation (0 = 1×1, 1 = 2×2, …). */
  sizeIndex: SizeIndex;
  /** Remaining motes of this size to add. Decremented by 1 per frame. */
  count: number;
}

/** Value of one pending mote at a given sizeIndex (MERGE_THRESHOLD ^ sizeIndex). */
export function pendingMoteValue(sizeIndex: SizeIndex): number {
  return Math.pow(MERGE_THRESHOLD, sizeIndex);
}

// ─── Aggregate game state ───────────────────────────────────────

export interface GameState {
  equation: EquationState;
  resources: ResourceState;
  progression: ProgressionState;
  forge: ForgeCrunchState;
  looms: LoomState;
  achievements: AchievementState;
  aliven: AlivenState;
  rpg: RpgSimState;
  lastAutoTapMs: number;
  lastSaveMs: number;
  elapsedMs: number;
  /** Idle motes queued for frame-by-frame drip-addition to resources. */
  pendingIdleMotes: PendingMoteEntry[];
}

export function createGameState(): GameState {
  return {
    equation: createEquationState(INITIAL_UNLOCKED_TIER_COUNT),
    resources: createResourceState(),
    progression: createProgressionState(INITIAL_UNLOCKED_TIER_COUNT),
    forge: createForgeCrunchState(),
    looms: createLoomState(),
    achievements: createAchievementState(),
    aliven: createAlivenState(),
    rpg: createRpgSimState(),
    lastAutoTapMs: 0,
    lastSaveMs: 0,
    elapsedMs: 0,
    pendingIdleMotes: [],
  };
}

// ─── Actions (called by input/UI layer) ─────────────────────────

export interface TapResult {
  gains: Map<TierId, number>;
  particleCount: number;
}

/** Player taps the equation. Returns what was earned. Only works if forge is unlocked. */
export function tapEquation(state: GameState): TapResult {
  if (!state.equation.isForgeUnlocked) {
    return { gains: new Map(), particleCount: 0 };
  }
  incrementTapCount(state.equation);
  const tapMultiplierWithBonuses = state.progression.globalMultiplier * state.achievements.tapMultiplierBonus;
  const gains = computeTapGains(state.equation, tapMultiplierWithBonuses);
  for (const [tierId, amount] of gains) {
    addMotes(state.resources, tierId, amount);
  }
  return { gains, particleCount: PARTICLES_PER_TAP };
}

/** Try to purchase an upgrade. Returns true if successful. */
export function tryPurchaseUpgrade(state: GameState, upgradeId: string, bypassCost = false): boolean {
  const def = UPGRADE_BY_ID.get(upgradeId);
  if (!def) return false;

  // Determine which resource to spend
  const costTierId: TierId = def.tierId ?? 'sand'; // global upgrades cost sand motes
  const cost = getUpgradeCost(state.progression, upgradeId);
  if (cost === null) return false;
  if (!bypassCost && getMotes(state.resources, costTierId) < cost) return false;

  // Deduct cost (only when not bypassing) and apply upgrade
  if (!bypassCost) {
    spendMotes(state.resources, costTierId, cost);
  }
  purchaseUpgrade(state.progression, upgradeId);

  // For tap_value upgrades, also update equation state
  if (def.effectKind === 'tap_value' && def.tierId) {
    applyEquationUpgrade(state.equation, def.tierId);
  }

  return true;
}

/** Try to unlock the next tier. */
export function tryUnlockNextTier(state: GameState, bypassCost = false): boolean {
  const nextIndex = state.progression.unlockedTierCount;
  if (nextIndex >= TIERS.length) return false;

  const tier = TIERS[nextIndex];
  if (!tier || tier.isSecret) return false;

  const cost = tierUnlockCost(nextIndex);
  // Pay with the previous tier's motes
  const payTierId = TIERS[nextIndex - 1]?.id ?? 'sand';
  if (!bypassCost && getMotes(state.resources, payTierId) < cost) return false;

  if (!bypassCost) {
    spendMotes(state.resources, payTierId, cost);
  }
  unlockEquationTier(state.equation, tier.id);
  unlockLoom(state.looms, tier.id);
  state.progression.unlockedTierCount = nextIndex + 1;
  return true;
}

/** Try to unlock the Equation Forge using Sand motes. */
export function tryUnlockEquationForge(state: GameState, bypassCost = false): boolean {
  if (state.equation.isForgeUnlocked) return false;
  if (!bypassCost && getMotes(state.resources, 'sand') < EQUATION_FORGE_COST) return false;
  if (!bypassCost) {
    spendMotes(state.resources, 'sand', EQUATION_FORGE_COST);
  }
  unlockForge(state.equation);
  return true;
}

/** Try to upgrade a Loom. Returns true if successful. */
export function tryUpgradeLoom(state: GameState, tierId: TierId, bypassCost = false): boolean {
  const loom = getLoom(state.looms, tierId);
  if (!loom || !loom.isUnlocked) return false;

  const cost = getLoomCost(tierId, loom.level);
  if (cost === null) return false;
  if (!bypassCost && getMotes(state.resources, tierId) < cost) return false;

  if (!bypassCost) {
    spendMotes(state.resources, tierId, cost);
  }
  upgradeLoom(state.looms, tierId);
  return true;
}

/** Try to purchase the special Resonance upgrade for a Loom tier. Returns true if successful. */
export function tryPurchaseSpecialLoom(state: GameState, tierId: TierId, bypassCost = false): boolean {
  return purchaseSpecialLoom(state.looms, state.resources, tierId, bypassCost);
}

/** Try to aliven a mote type. Returns true if successful. */
export function tryAlivenMote(state: GameState, tierId: TierId, bypassCost = false): boolean {
  return tryAliven(state.aliven, state.resources, tierId, bypassCost);
}

/** Try to upgrade a loom's conversion efficiency. Returns true if successful. */
export function tryUpgradeLoomEfficiencyAction(state: GameState, tierId: TierId, bypassCost = false): boolean {
  const result = tryUpgradeLoomEfficiency(state.looms, state.resources, tierId, bypassCost);
  if (result) recordLoomEfficiencyUpgrade();
  return result;
}

// ─── Heat-tap forge system ───────────────────────────────────────

/**
 * Register one player tap on the equation forge (heat tap).
 * After three taps, starts the 9-second warm-up sequence.
 * Returns true if a warm-up was started.
 */
export function tapEquationForge(state: GameState, heatTapNowMs: number, warmupNowMs = heatTapNowMs): boolean {
  if (!state.equation.isForgeUnlocked) return false;
  const warmupTriggered = tapForgeHeat(state.forge, heatTapNowMs);
  if (warmupTriggered) {
    startForgeWarmup(state.forge, warmupNowMs);
    return true;
  }
  return false;
}

/**
 * Process a loom particle capture: adds mass to the loom's conversion progress
 * and produces output motes when threshold is reached.
 */
export function processLoomCapture(state: GameState, inputTierId: TierId, mass: number): void {
  const motesProduced = applyLoomCapture(state.looms, state.resources, inputTierId, mass);
  const outputTierId = getLoomForInputTier(inputTierId) ?? inputTierId;
  recordLoomCapture(inputTierId, mass, outputTierId, motesProduced);
}

/**
 * Apply sacrifice totals from a completed forge crunch.
 * Each 10,000 small-mote equivalents of a given tier produces one equation upgrade for that tier.
 */
/** Returns a map of { tierId → refined crystals gained } for this crunch (may be empty). */
export function applyForgeSacrifice(state: GameState, sacrifices: Map<string, number>): Map<string, number> {
  const THRESHOLD = 2_000; // 2000 ≈ 20 medium-particle captures — playtestable baseline
  const crystalsGained = new Map<string, number>();

  // Telemetry: total mass to detect zero-particle crunches
  let totalMass = 0;
  for (const mass of sacrifices.values()) totalMass += mass;
  recordForgeCrunch(totalMass);

  for (const [tierId, mass] of sacrifices) {
    const prev = state.forge.sacrificeProgressByTierId.get(tierId) ?? 0;
    const upgradesGained = Math.floor((prev + mass) / THRESHOLD);
    recordForgeSacrifice(tierId, mass, upgradesGained);

    let total = prev + mass;
    while (total >= THRESHOLD) {
      total -= THRESHOLD;
      applyEquationUpgrade(state.equation, tierId as TierId);
    }
    state.forge.sacrificeProgressByTierId.set(tierId, total);

    let refinedTotal = (state.forge.refinedProgressByTierId.get(tierId) ?? 0) + mass;
    const refinedCrystalsGained = Math.floor(refinedTotal / REFINED_CRYSTAL_THRESHOLD);
    if (refinedCrystalsGained > 0) {
      const currentCrystals = state.rpg.refinedCrystalsByTierId.get(tierId) ?? 0;
      state.rpg.refinedCrystalsByTierId.set(tierId, currentCrystals + refinedCrystalsGained);
      refinedTotal -= refinedCrystalsGained * REFINED_CRYSTAL_THRESHOLD;
      crystalsGained.set(tierId, refinedCrystalsGained);
    }
    state.forge.refinedProgressByTierId.set(tierId, refinedTotal);
  }
  return crystalsGained;
}

export function craftWeapon(
  state: GameState,
  ingredients: CraftedWeaponIngredient[],
  bypassCost = false,
): boolean {
  // Derive forge craft level from the RPG upgrade so it's always in sync.
  const forgeCraftLevel = getRpgUpgradeLevel(state.rpg, 'forge_craft_level') + 1;
  const normalizedIngredients = ingredients
    .map((ingredient) => ({
      tierId: ingredient.tierId,
      refinedCount: Math.max(0, Math.floor(ingredient.refinedCount)),
    }))
    .filter((ingredient) => ingredient.refinedCount > 0);
  if (normalizedIngredients.length === 0) return false;
  if (normalizedIngredients.length > getForgeCapacity(forgeCraftLevel)) return false;

  for (const ingredient of normalizedIngredients) {
    const available = state.rpg.refinedCrystalsByTierId.get(ingredient.tierId) ?? 0;
    if (!bypassCost && available < ingredient.refinedCount) return false;
  }

  if (!bypassCost) {
    for (const ingredient of normalizedIngredients) {
      const available = state.rpg.refinedCrystalsByTierId.get(ingredient.tierId) ?? 0;
      state.rpg.refinedCrystalsByTierId.set(ingredient.tierId, available - ingredient.refinedCount);
    }
  }

  let nextIndex = state.rpg.craftedWeapons.length + 1;
  let weaponId = `crafted_weapon_${nextIndex}`;
  while (state.rpg.purchasedWeaponIds.has(weaponId)) {
    nextIndex++;
    weaponId = `crafted_weapon_${nextIndex}`;
  }

  const craftedWeapon = createCraftedWeaponDefinition(weaponId, normalizedIngredients, forgeCraftLevel);
  state.rpg.craftedWeapons.push(craftedWeapon);
  state.rpg.purchasedWeaponIds.add(craftedWeapon.id);
  state.rpg.weaponTiersByWeaponId.set(craftedWeapon.id, 1);
  registerCraftedWeapons([craftedWeapon]);
  return true;
}

export function craftWeave(
  state: GameState,
  ingredients: CraftedWeaponIngredient[],
  bypassCost = false,
): boolean {
  const forgeCraftLevel = getRpgUpgradeLevel(state.rpg, 'forge_craft_level') + 1;
  const normalizedIngredients = ingredients
    .map(i => ({ tierId: i.tierId, refinedCount: Math.max(0, Math.floor(i.refinedCount)) }))
    .filter(i => i.refinedCount > 0);
  if (normalizedIngredients.length === 0) return false;

  for (const ingredient of normalizedIngredients) {
    const available = state.rpg.refinedCrystalsByTierId.get(ingredient.tierId) ?? 0;
    if (!bypassCost && available < ingredient.refinedCount) return false;
  }

  if (!bypassCost) {
    for (const ingredient of normalizedIngredients) {
      const available = state.rpg.refinedCrystalsByTierId.get(ingredient.tierId) ?? 0;
      state.rpg.refinedCrystalsByTierId.set(ingredient.tierId, available - ingredient.refinedCount);
    }
  }

  let nextIndex = state.rpg.craftedWeaves.length + 1;
  let weaveId = `crafted_weave_${nextIndex}`;
  const existingIds = new Set(state.rpg.craftedWeaves.map(w => w.id));
  while (existingIds.has(weaveId)) {
    nextIndex++;
    weaveId = `crafted_weave_${nextIndex}`;
  }

  const weave = createCraftedWeave(weaveId, normalizedIngredients, forgeCraftLevel);
  state.rpg.craftedWeaves.push(weave);
  return true;
}

// ─── Weave loom bonus helper ────────────────────────────────────

import type { CraftedWeaveData } from '../data/rpg/weave-types';

function computeEquippedWeaveLoomBonus(
  equippedSlots: (string | null)[],
  craftedWeaves: CraftedWeaveData[],
): number {
  const weaveById = new Map(craftedWeaves.map(w => [w.id, w]));
  let bonus = 0;
  for (const id of equippedSlots) {
    if (!id) continue;
    const weave = weaveById.get(id);
    if (!weave) continue;
    for (const affix of weave.affixes) {
      if (affix.affixId === 'citrine_all_loom') {
        bonus += affix.value / 100;
      }
    }
  }
  return bonus;
}

// ─── Simulation tick ────────────────────────────────────────────

export interface SimTickResult {
  autoTapped: boolean;
  autoTapGains: Map<TierId, number> | null;
  loomGains: Map<TierId, number>;
  /** Achievement IDs newly unlocked during this tick (empty array if none). */
  newlyUnlockedAchievementIds: readonly string[];
}

/** Advance simulation by deltaMs. */
export function simTick(state: GameState, deltaMs: number): SimTickResult {
  state.elapsedMs += deltaMs;

  // Reset forge heat tap sequence if the player has been idle too long
  tickForgeHeatTimeout(state.forge, state.elapsedMs);

  const result: SimTickResult = { autoTapped: false, autoTapGains: null, loomGains: new Map(), newlyUnlockedAchievementIds: [] };

  // Tick Looms — passive production (with achievement loom bonus × wave boost × weave bonus)
  const waveBoost = getWaveBoostMultiplier(state.rpg);
  // Apply citrine_all_loom weave affixes — the only weave bonus currently integrated.
  const weaveLoomBonus = computeEquippedWeaveLoomBonus(state.rpg.equippedWeaveSlots, state.rpg.craftedWeaves);
  const loomProduction = tickLooms(state.looms, deltaMs, state.achievements.loomMultiplierBonus * waveBoost * (1 + weaveLoomBonus));
  for (const [tierId, amount] of loomProduction) {
    addMotes(state.resources, tierId, amount);
    // Telemetry: record non-sand passive motes (sand is high-frequency, less interesting)
    if (tierId !== 'sand') recordLoomPassiveMotes(tierId, amount);
  }
  result.loomGains = loomProduction;

  // Auto-tap (only if forge is unlocked)
  if (state.equation.isForgeUnlocked) {
    const autoInterval = getAutoTapIntervalMs(state.progression);
    if (autoInterval > 0) {
      const timeSinceAutoTap = state.elapsedMs - state.lastAutoTapMs;
      if (timeSinceAutoTap >= autoInterval) {
        state.lastAutoTapMs = state.elapsedMs;
        const tapResult = tapEquation(state);
        result.autoTapped = true;
        result.autoTapGains = tapResult.gains;
      }
    }
  }

  // Drain one pending idle mote per frame (drip-add from idle reward queue).
  // Queue is ordered: lowest tier first, largest size first within each tier.
  if (state.pendingIdleMotes.length > 0) {
    const entry = state.pendingIdleMotes[0];
    const moteValue = pendingMoteValue(entry.sizeIndex);
    addMotes(state.resources, entry.tierId, moteValue);
    entry.count--;
    if (entry.count <= 0) {
      state.pendingIdleMotes.shift();
    }
  }

  // Check for newly-unlocked achievements
  const globalTapMultiplier = state.progression.globalMultiplier * state.achievements.tapMultiplierBonus;
  result.newlyUnlockedAchievementIds = checkAndUnlockAchievements(
    state.achievements,
    state.resources,
    state.equation,
    state.rpg,
    state.aliven,
    globalTapMultiplier,
  );

  return result;
}

/** Quick access helpers. */
export function getScore(state: GameState): number {
  return getTotalMotes(state.resources);
}
