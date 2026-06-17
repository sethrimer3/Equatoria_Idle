/**
 * status-balance.ts — Central balance constants for the RPG status system.
 *
 * Both enemy-status-effects.ts and player-status-effects.ts import from here.
 * Change status tuning here; do not sprinkle magic numbers in apply/tick paths.
 *
 * Design intent:
 *   Burning        — short, high-pressure burst DoT
 *   Poison         — longer, lower DPS sustained attrition
 *   Chilled        — moderate slow, useful but not oppressive
 *   Frozen         — rare/brief/strong; intentionally short to avoid stun-lock
 *   Slowed         — readable movement penalty, not a death sentence
 *   Time-Warped    — tempo disruption, subtle but noticeable
 *   Gravitized     — positional control without breaking pathing
 *   Fractal Wound  — burst/decay identity; tick count is reduced on bosses
 *   Rift-Scarred   — rewards repeated hits; hard stack cap, lower cap on bosses
 *   Vulnerability  — useful but not multiplicative enough to dominate every build
 *   Bosses         — broadly resistant, never fully immune by default
 */

// ── Enemy DoT rates ───────────────────────────────────────────────────────────

/** Burning is burst attrition — higher DPS, shorter duration. */
export const ENEMY_BURN_DPS       = 0.50;   // damage/sec/mag
/** Poison is sustained attrition — lower DPS, longer duration. */
export const ENEMY_POISON_DPS     = 0.30;   // damage/sec/mag

// ── Enemy vulnerability rates ─────────────────────────────────────────────────

export const ENEMY_VULN_RATE      = 0.015;  // % dmg increase per magnitude unit
export const ENEMY_ECHO_RATE      = 0.015;  // echo fraction per magnitude unit
export const ENEMY_RIFT_RATE      = 0.003;  // bonus damage per magnitude per stack

// ── Enemy slow rates ──────────────────────────────────────────────────────────

export const ENEMY_CHILL_RATE     = 0.020;  // % slow per magnitude unit (Chilled)
export const ENEMY_WARP_RATE      = 0.012;  // % slow per magnitude unit (Time-Warped)
export const ENEMY_GRAV_RATE      = 0.010;  // % slow per magnitude unit (Gravitized)

// ── Enemy status caps ─────────────────────────────────────────────────────────

export const ENEMY_VULN_CAP           = 0.50;  // 50% max vulnerability increase
export const ENEMY_CHILL_CAP          = 0.60;  // 60% max Chilled slow
export const ENEMY_WARP_CAP           = 0.40;  // 40% max Time-Warped slow
export const ENEMY_GRAV_CAP           = 0.40;  // 40% max Gravitized slow
export const ENEMY_TOTAL_SLOW_CAP     = 0.80;  // 80% combined slow cap across all sources
export const ENEMY_MIN_SPEED          = 0.20;  // 20% minimum enemy speed (cannot fully stop)
export const ENEMY_ECHO_CAP           = 0.40;  // 40% max echo fraction
export const ENEMY_RIFT_CAP_PER_STACK = 0.05;  // 5% max bonus per Rift-Scarred stack

// ── Frozen ────────────────────────────────────────────────────────────────────

/** Frozen nearly immobilises the enemy. Duration is intentionally brief. */
export const ENEMY_FROZEN_SPEED       = 0.02;  // 98% slow — effectively stopped

// ── Rift-Scarred stack caps ───────────────────────────────────────────────────

/** Normal enemy stack cap. Rewards sustained eigenstein damage. */
export const ENEMY_RIFT_STACK_CAP      = 20;
/** Bosses have a lower cap so rift-scarred builds remain viable but not dominant. */
export const ENEMY_RIFT_STACK_CAP_BOSS = 10;

// ── Fractal Wound ─────────────────────────────────────────────────────────────

/** Fractal Wound ticks 4 times on normal enemies (burst/decay identity). */
export const ENEMY_FRAC_TICKS          = 4;
/** Reduced to 2 ticks on bosses/elites to limit burst without removing the effect. */
export const ENEMY_FRAC_TICKS_BOSS     = 2;
export const ENEMY_FRAC_DECAY          = 0.70;  // 70% damage decay per tick
export const ENEMY_FRAC_MAX_CONCURRENT = 2;     // max simultaneous Fractal Wounds per enemy

// ── Affinity multipliers ──────────────────────────────────────────────────────

export const AFFINITY_WEAK      = 1.25;  // weak: +25% duration/magnitude
export const AFFINITY_NEUTRAL   = 1.00;  // neutral: unchanged
export const AFFINITY_RESISTANT = 0.60;  // resistant: -40% duration/magnitude
export const AFFINITY_IMMUNE    = 0;     // immune: status does not apply

// ── Player DoT rates ──────────────────────────────────────────────────────────

/** Burning is burst attrition — higher DPS, shorter. */
export const PLAYER_BURN_DPS_PER_MAG     = 0.4;
/** Poison is sustained attrition — lower DPS, longer. */
export const PLAYER_POISON_DPS_PER_MAG   = 0.2;

// ── Player movement multipliers ───────────────────────────────────────────────

/** Frozen is intentionally short to avoid stun-lock; 70% slow while active. */
export const PLAYER_FROZEN_MOVEMENT      = 0.30;  // 70% slow
export const PLAYER_SLOWED_MOVEMENT      = 0.55;  // 45% slow
export const PLAYER_CHILLED_MAX_SLOW     = 0.35;  // 35% max slow from Chilled
export const PLAYER_CHILLED_MIN_SPEED    = 0.65;  // 65% minimum speed while chilled
export const PLAYER_SPEED_FLOOR          = 0.25;  // global speed floor across all statuses

// ── Player attack cadence ─────────────────────────────────────────────────────

export const PLAYER_TIMEWARP_CADENCE     = 0.75;  // 25% attack cadence reduction

// ── Player frozen cooldown ────────────────────────────────────────────────────

/**
 * After Frozen expires the player cannot be frozen again for this many ms.
 * Prevents sapphire-type enemies from chaining rapid chill → freeze cycles.
 */
export const PLAYER_FROZEN_COOLDOWN_MS   = 3000;

// ── Status Resistance skill ───────────────────────────────────────────────────

/** 20% duration reduction per rank; hard floor at 40% (rank 3). */
export const STATUS_RESIST_PER_RANK      = 0.2;
export const STATUS_RESIST_MIN_MULT      = 0.4;
/** Minimum effective duration after resistance to prevent instant-clear exploits. */
export const STATUS_MIN_DURATION_MS      = 300;
