/**
 * session-telemetry.ts — Lightweight dev-only session telemetry counters.
 *
 * Tracks counters for forge economy, loom economy, Aliven RPG events, and
 * optional performance hints. Designed to be called at gameplay call sites
 * (not inferred from UI), and displayed only when Developer Mode is on.
 *
 * All state is transient for the current browser session and is never persisted.
 * All functions are cheap (counter increments or Map lookups) with no per-frame
 * allocations.
 *
 * Exported helper functions:
 *   recordForgeCrunch(totalMass)       — one completed forge crunch
 *   recordForgeSacrifice(tier, mass, upgrades) — sacrifice mass and upgrades per tier
 *   recordLoomCapture(inputTier, mass, outputTier, motes) — one loom capture event
 *   recordLoomEfficiencyUpgrade()      — one efficiency upgrade purchased
 *   recordLoomPassiveMotes(tier, motes) — passive mote production per tier per tick
 *   recordAlivenSpawn(variantId, newGroupCount) — one Aliven group spawned
 *   recordAlivenKill(variantId)        — one Aliven group defeated
 *   recordAlivenCapSkip()              — spawn attempt skipped due to group cap
 *   recordPlayerDamageFromContact(atk) — raw ATK from contact/AoE
 *   recordPlayerDamageFromBullet(atk)  — raw ATK from spitter bullet
 *   recordAlivenBulletFired(variantId) — one spitter bullet fired
 *   resetSessionTelemetry()            — clear all counters
 *   getSessionTelemetrySnapshot()      — deep-copy snapshot for display
 *   getAvgSacrificePerCrunch()         — derived: total mass / completed crunches
 */

// ─── Data structures ───────────────────────────────────────────────────────

export interface ForgeTelemetry {
  /** Total forge crunches completed this session. */
  crunchesCompleted: number;
  /** Crunches where no particles were captured (zero-mass sacrifice). */
  crunchesWithZeroParticles: number;
  /** Total mass sacrificed to the forge per input tier ID. */
  sacrificedMassByTier: Record<string, number>;
  /** Equation upgrades gained from sacrifice per tier ID. */
  equationUpgradesFromSacrificeByTier: Record<string, number>;
}

export interface LoomTelemetry {
  /** Number of particle capture events per input tier ID. */
  capturesByInputTier: Record<string, number>;
  /** Total captured mass per input tier ID. */
  capturedMassByInputTier: Record<string, number>;
  /** Total output motes produced via capture per output tier ID. */
  outputMotesProducedByTier: Record<string, number>;
  /** Loom conversion efficiency upgrades purchased this session. */
  efficiencyUpgradesPurchased: number;
  /** Passive mote production (non-sand only) accumulated this session per tier ID. */
  passiveMotesProduced: Record<string, number>;
}

export interface AlivenTelemetry {
  /** Aliven groups spawned per variant ID. */
  spawnedByVariant: Record<string, number>;
  /** Aliven groups fully defeated per variant ID. */
  killedByVariant: Record<string, number>;
  /** Spawn attempts skipped because the active-group cap was reached. */
  capSkips: number;
  /** Maximum simultaneous active Aliven group count observed this session. */
  peakActiveGroups: number;
  /** Raw ATK total from Aliven contact damage (physical touch + pulser AoE). */
  playerDamageFromContact: number;
  /** Raw ATK total from Aliven spitter bullets. */
  playerDamageFromBullets: number;
  /** Spitter bullets fired per variant ID. */
  bulletsFiredByVariant: Record<string, number>;
}

export interface SessionTelemetry {
  forge: ForgeTelemetry;
  loom: LoomTelemetry;
  aliven: AlivenTelemetry;
}

// ─── Internal state ────────────────────────────────────────────────────────

function _emptyForge(): ForgeTelemetry {
  return {
    crunchesCompleted: 0,
    crunchesWithZeroParticles: 0,
    sacrificedMassByTier: {},
    equationUpgradesFromSacrificeByTier: {},
  };
}

function _emptyLoom(): LoomTelemetry {
  return {
    capturesByInputTier: {},
    capturedMassByInputTier: {},
    outputMotesProducedByTier: {},
    efficiencyUpgradesPurchased: 0,
    passiveMotesProduced: {},
  };
}

function _emptyAliven(): AlivenTelemetry {
  return {
    spawnedByVariant: {},
    killedByVariant: {},
    capSkips: 0,
    peakActiveGroups: 0,
    playerDamageFromContact: 0,
    playerDamageFromBullets: 0,
    bulletsFiredByVariant: {},
  };
}

let _telemetry: SessionTelemetry = {
  forge:  _emptyForge(),
  loom:   _emptyLoom(),
  aliven: _emptyAliven(),
};

// ─── Internal helper ──────────────────────────────────────────────────────

/** Increment a string-keyed counter in a plain Record by `amount` (default 1). */
function _inc(map: Record<string, number>, key: string, amount = 1): void {
  map[key] = (map[key] ?? 0) + amount;
}

// ─── Reset / snapshot ─────────────────────────────────────────────────────

/** Clear all session telemetry counters. */
export function resetSessionTelemetry(): void {
  _telemetry = {
    forge:  _emptyForge(),
    loom:   _emptyLoom(),
    aliven: _emptyAliven(),
  };
}

/**
 * Return a deep-copy snapshot of the current telemetry state for UI display.
 * Uses JSON round-trip to keep the implementation simple; call rate should
 * be low (only when the Settings dev panel refreshes).
 */
export function getSessionTelemetrySnapshot(): SessionTelemetry {
  return JSON.parse(JSON.stringify(_telemetry)) as SessionTelemetry;
}

// ─── Forge telemetry ──────────────────────────────────────────────────────

/**
 * Record one completed forge crunch.
 * @param totalMass  Sum of all mass across all tiers sacrificed in this crunch.
 *                   Pass 0 (or negative) to flag it as a zero-particle crunch.
 */
export function recordForgeCrunch(totalMass: number): void {
  _telemetry.forge.crunchesCompleted++;
  if (totalMass <= 0) {
    _telemetry.forge.crunchesWithZeroParticles++;
  }
}

/**
 * Record sacrifice mass and equation upgrades gained for one tier in a crunch.
 * Call once per tier present in the sacrifice map.
 * @param tierId         The tier ID that was sacrificed.
 * @param mass           Raw mass sacrificed for this tier.
 * @param upgradesGained Number of equation upgrades produced from this sacrifice.
 */
export function recordForgeSacrifice(tierId: string, mass: number, upgradesGained: number): void {
  _inc(_telemetry.forge.sacrificedMassByTier, tierId, mass);
  if (upgradesGained > 0) {
    _inc(_telemetry.forge.equationUpgradesFromSacrificeByTier, tierId, upgradesGained);
  }
}

// ─── Loom telemetry ───────────────────────────────────────────────────────

/**
 * Record one particle capture event for a loom.
 * @param inputTierId  The tier of the captured particle (loom input).
 * @param mass         Mass of the captured particle.
 * @param outputTierId The tier of the loom that received the capture (output mote tier).
 * @param motesProduced Number of output motes produced from this capture (may be 0).
 */
export function recordLoomCapture(
  inputTierId: string,
  mass: number,
  outputTierId: string,
  motesProduced: number,
): void {
  _inc(_telemetry.loom.capturesByInputTier, inputTierId);
  _inc(_telemetry.loom.capturedMassByInputTier, inputTierId, mass);
  if (motesProduced > 0) {
    _inc(_telemetry.loom.outputMotesProducedByTier, outputTierId, motesProduced);
  }
}

/** Record one loom conversion efficiency upgrade purchase. */
export function recordLoomEfficiencyUpgrade(): void {
  _telemetry.loom.efficiencyUpgradesPurchased++;
}

/**
 * Record passive mote production for a non-sand loom (called from sim tick).
 * Only accumulates when motes > 0 to skip zero-production ticks.
 */
export function recordLoomPassiveMotes(tierId: string, motes: number): void {
  if (motes > 0) {
    _inc(_telemetry.loom.passiveMotesProduced, tierId, motes);
  }
}

// ─── Aliven telemetry ─────────────────────────────────────────────────────

/**
 * Record one Aliven group spawned.
 * @param variantId       The Aliven variant ID of the spawned group.
 * @param currentGroupCount  Active group count AFTER this group was added.
 */
export function recordAlivenSpawn(variantId: string, currentGroupCount: number): void {
  _inc(_telemetry.aliven.spawnedByVariant, variantId);
  if (currentGroupCount > _telemetry.aliven.peakActiveGroups) {
    _telemetry.aliven.peakActiveGroups = currentGroupCount;
  }
}

/**
 * Record one Aliven group defeated (all particles dead).
 * @param variantId  The Aliven variant ID of the defeated group.
 */
export function recordAlivenKill(variantId: string): void {
  _inc(_telemetry.aliven.killedByVariant, variantId);
}

/** Record one Aliven spawn attempt that was skipped due to the group cap. */
export function recordAlivenCapSkip(): void {
  _telemetry.aliven.capSkips++;
}

/**
 * Record raw ATK from an Aliven contact or AoE hit on the player.
 * Note: records raw ATK before defence reduction; actual HP loss may be lower.
 */
export function recordPlayerDamageFromContact(atk: number): void {
  _telemetry.aliven.playerDamageFromContact += atk;
}

/**
 * Record raw ATK from an Aliven spitter bullet hitting the player.
 * Note: records raw ATK before defence reduction.
 */
export function recordPlayerDamageFromBullet(atk: number): void {
  _telemetry.aliven.playerDamageFromBullets += atk;
}

/**
 * Record one spitter bullet fired.
 * @param variantId  The Aliven variant ID of the group that fired the bullet.
 */
export function recordAlivenBulletFired(variantId: string): void {
  _inc(_telemetry.aliven.bulletsFiredByVariant, variantId);
}

// ─── Derived metrics ──────────────────────────────────────────────────────

/**
 * Returns the average total mass sacrificed per completed forge crunch.
 * Returns 0 if no crunches have been recorded yet.
 */
export function getAvgSacrificePerCrunch(): number {
  if (_telemetry.forge.crunchesCompleted === 0) return 0;
  const total = Object.values(_telemetry.forge.sacrificedMassByTier)
    .reduce((a, b) => a + b, 0);
  return total / _telemetry.forge.crunchesCompleted;
}
