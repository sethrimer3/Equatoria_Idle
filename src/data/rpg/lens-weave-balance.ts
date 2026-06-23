/**
 * lens-weave-balance.ts — Centralized tuning constants for lens and weave systems.
 *
 * Only values that are actively tuned during balance/playtest passes live here.
 * Constants that are purely architectural (enum counts, type limits) stay local.
 */

// ── Lens Tier 2 (On-Hit Cascade) ─────────────────────────────────────────────

/** Squared radius within which T2 secondary hits search for targets (200 px). */
export const LENS_T2_RANGE_PX = 200;
export const LENS_T2_RANGE_SQ = LENS_T2_RANGE_PX * LENS_T2_RANGE_PX;

/** Proc chance = clamp(magnitude × this, MIN, MAX). */
export const LENS_T2_PROC_MAGNITUDE_FACTOR = 0.012;
export const LENS_T2_PROC_CHANCE_MIN = 0.05;
export const LENS_T2_PROC_CHANCE_MAX = 0.35;

/** Secondary damage fraction = clamp(magnitude × this, MIN, MAX). */
export const LENS_T2_DMG_MAGNITUDE_FACTOR = 0.012;
export const LENS_T2_DMG_FRACTION_MIN = 0.10;
export const LENS_T2_DMG_FRACTION_MAX = 0.45;

/** Cap on secondary hits spawned per effect per trigger. */
export const LENS_T2_MAX_HITS_PER_EFFECT = 8;
/** Cap on total spawns across all T2 effects for a single weapon hit. */
export const LENS_T2_MAX_TOTAL_SPAWNS = 12;

/**
 * Minimum ms between procs of the same T2 effect on the same weapon.
 * Prevents visual spam and runaway DPS from fast multi-hit attacks.
 * Exported so the debug overlay can display remaining cooldown.
 */
export const LENS_T2_PROC_COOLDOWN_MS = 800;

// ── Lens Tier 3 (Death-Triggered & Stacking) ──────────────────────────────────

/** Squared radius within which T3 effects search for nearby targets (250 px). */
export const LENS_T3_RANGE_PX = 250;
export const LENS_T3_RANGE_SQ = LENS_T3_RANGE_PX * LENS_T3_RANGE_PX;

/** Damage multiplier range for T3 secondary hits (fraction of triggering hit). */
export const LENS_T3_DMG_FRACTION_MIN = 0.10;
export const LENS_T3_DMG_FRACTION_MAX = 0.45;

/** Citrine T3: chance to detonate on enemy death. */
export const LENS_T3_CITRINE_DETONATE_CHANCE = 0.60;

/** Emerald T3: max concurrent bloom zones. */
export const LENS_T3_EMERALD_MAX_ZONES = 6;
/** Emerald T3: bloom zone lifetime ms. */
export const LENS_T3_EMERALD_ZONE_DURATION_MS = 3000;
/** Emerald T3: bloom zone tick interval ms. */
export const LENS_T3_EMERALD_ZONE_TICK_MS = 900;

/** Nullstone T3: max concurrent event-horizon zones. */
export const LENS_T3_NULLSTONE_MAX_ZONES = 3;
/** Nullstone T3: event-horizon zone lifetime ms. */
export const LENS_T3_NULLSTONE_ZONE_DURATION_MS = 1800;
/** Nullstone T3: pull tick interval ms. */
export const LENS_T3_NULLSTONE_ZONE_TICK_MS = 600;

/** Sapphire T3: chills required before triggering a freeze. */
export const LENS_T3_SAPPHIRE_FREEZE_CHILL_THRESHOLD = 8;
/** Sapphire T3: freeze duration ms (normal enemy / elite). */
export const LENS_T3_SAPPHIRE_FREEZE_DURATION_NORMAL_MS = 900;
export const LENS_T3_SAPPHIRE_FREEZE_DURATION_ELITE_MS = 400;

/** Fracteryl T3: max repeats of Infinite Descent re-application. */
export const LENS_T3_FRACTERYL_MAX_REPEATS = 2;
/** Fracteryl T3: magnitude decay per repeat (multiplicative). */
export const LENS_T3_FRACTERYL_MAG_DECAY = 0.55;

/** Eigenstein T3: number of accumulated rift instability hits before burst. */
export const LENS_T3_EIGENSTEIN_BURST_THRESHOLD = 6;

// ── Weave Proc Effects ────────────────────────────────────────────────────────

/**
 * Maximum number of simultaneously active weave buffs.
 * Currently unenforced (each effectId is naturally de-duplicated by upsertActiveWeaveBuff).
 * Exposed for tuning visibility.
 */
export const WEAVE_MAX_ACTIVE_BUFFS_PER_EFFECT = 1; // one per effectId via upsert

// ── Equipment Drop Rates ──────────────────────────────────────────────────────
// Primary source of truth is EQUIPMENT_REWARD_DROP_RATES in equipment-rewards.ts.
// Listed here only for cross-reference in the debug overlay.

export const EQUIPMENT_DROP_RATE_REFERENCE = {
  normalLens:    0.012,
  normalWeave:   0.0015,
  eliteLens:     0.18,
  eliteWeave:    0.045,
  bossLens:      1.0,
  bossWeave:     0.65,
  milestoneLens: 1.0,
  milestoneWeave: 0.35,
} as const;
