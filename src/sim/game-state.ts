import type { TierId } from '../data/tiers';
import { TIERS } from '../data/tiers';
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
import { createForgeCrunchState, tapForgeHeat, startEquationForgeCrunch, tickForgeHeatTimeout, type ForgeCrunchState } from './forge';
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
 * When 3 taps are received, starts a forge sacrifice crunch.
 * Returns true if a crunch was started.
 */
export function tapEquationForge(state: GameState, nowMs: number): boolean {
  if (!state.equation.isForgeUnlocked) return false;
  const crunchTriggered = tapForgeHeat(state.forge, nowMs);
  if (crunchTriggered) {
    startEquationForgeCrunch(state.forge, nowMs);
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
export function applyForgeSacrifice(state: GameState, sacrifices: Map<string, number>): void {
  const THRESHOLD = 2_000; // 2000 ≈ 20 medium-particle captures — playtestable baseline

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
  }
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

  // Tick Looms — passive production (with achievement loom bonus × wave boost)
  const waveBoost = getWaveBoostMultiplier(state.rpg);
  const loomProduction = tickLooms(state.looms, deltaMs, state.achievements.loomMultiplierBonus * waveBoost);
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
