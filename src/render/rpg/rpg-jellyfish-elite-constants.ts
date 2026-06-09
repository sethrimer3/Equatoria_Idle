/**
 * rpg-jellyfish-elite-constants.ts — Per-variant stats and visual constants
 * for the four elite jellyfish enemy types.
 */

// ── Shared visual identity ────────────────────────────────────────────────────
export const ELITE_JELLYFISH_COLOR       = '#78d8ff';
export const ELITE_JELLYFISH_GLOW        = '#b0eeff';
export const ELITE_JELLYFISH_INNER_COLOR = '#c0f0ff';

/** Base bell radius (px). Scales slightly per variant. */
export const ELITE_JELLYFISH_BASE_SIZE = 11;

/** Contact collision radius used for both head and tentacle segment checks (px). */
export const ELITE_JELLYFISH_CONTACT_RADIUS = 5;

/** Fluid explosion RGB when an elite jellyfish dies. */
export const FLUID_ELITE_JELLYFISH_R = 120;
export const FLUID_ELITE_JELLYFISH_G = 216;
export const FLUID_ELITE_JELLYFISH_B = 255;

// ── Basic Jellyfish ───────────────────────────────────────────────────────────
export const BASIC_JELLYFISH_HP_INIT      = 200;
export const BASIC_JELLYFISH_ATK_INIT     =  20;
export const BASIC_JELLYFISH_DEF_INIT     =   6;
export const BASIC_JELLYFISH_XP_MULT      = 4.0;
export const BASIC_JELLYFISH_SIZE         =  11;
export const BASIC_JELLYFISH_TAIL_COUNT   =   3;
export const BASIC_JELLYFISH_SEGS_PER_TAIL =  5;
export const BASIC_JELLYFISH_SEG_MAX_LEN  =   7;
export const BASIC_JELLYFISH_SEG_DAMPING  = 0.82;
export const BASIC_JELLYFISH_PULSE_FORCE  = 0.80;
export const BASIC_JELLYFISH_PULSE_CD_MS  = 1800;
export const BASIC_JELLYFISH_PULSE_DUR_MS =  300;
export const BASIC_JELLYFISH_DRIFT_DRAG   = 0.962;

// ── Longtail Jellyfish ────────────────────────────────────────────────────────
export const LONGTAIL_JELLYFISH_HP_INIT      = 220;
export const LONGTAIL_JELLYFISH_ATK_INIT     =  18;
export const LONGTAIL_JELLYFISH_DEF_INIT     =   7;
export const LONGTAIL_JELLYFISH_XP_MULT      = 5.0;
export const LONGTAIL_JELLYFISH_SIZE         =  11;
export const LONGTAIL_JELLYFISH_TAIL_COUNT   =   4;
export const LONGTAIL_JELLYFISH_SEGS_PER_TAIL = 10;
export const LONGTAIL_JELLYFISH_SEG_MAX_LEN  =   8;
export const LONGTAIL_JELLYFISH_SEG_DAMPING  = 0.88;
export const LONGTAIL_JELLYFISH_PULSE_FORCE  = 0.50;
export const LONGTAIL_JELLYFISH_PULSE_CD_MS  = 2500;
export const LONGTAIL_JELLYFISH_PULSE_DUR_MS =  500;
export const LONGTAIL_JELLYFISH_DRIFT_DRAG   = 0.978;

// ── Whiplash Jellyfish ────────────────────────────────────────────────────────
export const WHIPLASH_JELLYFISH_HP_INIT      = 180;
export const WHIPLASH_JELLYFISH_ATK_INIT     =  25;
export const WHIPLASH_JELLYFISH_DEF_INIT     =   5;
export const WHIPLASH_JELLYFISH_XP_MULT      = 4.5;
export const WHIPLASH_JELLYFISH_SIZE         =  11;
export const WHIPLASH_JELLYFISH_TAIL_COUNT   =   3;
export const WHIPLASH_JELLYFISH_SEGS_PER_TAIL =  8;
export const WHIPLASH_JELLYFISH_SEG_MAX_LEN  =   8;
export const WHIPLASH_JELLYFISH_SEG_DAMPING  = 0.75;
export const WHIPLASH_JELLYFISH_PULSE_FORCE  = 2.00;
export const WHIPLASH_JELLYFISH_PULSE_CD_MS  = 3000;
export const WHIPLASH_JELLYFISH_PULSE_DUR_MS =  180;
export const WHIPLASH_JELLYFISH_DRIFT_DRAG   = 0.950;
export const WHIPLASH_JELLYFISH_BURST_CD_MS  = 4000;

// ── Encircling Jellyfish ──────────────────────────────────────────────────────
export const ENCIRCLING_JELLYFISH_HP_INIT      = 280;
export const ENCIRCLING_JELLYFISH_ATK_INIT     =  16;
export const ENCIRCLING_JELLYFISH_DEF_INIT     =   9;
export const ENCIRCLING_JELLYFISH_XP_MULT      = 6.0;
export const ENCIRCLING_JELLYFISH_SIZE         =  12;
export const ENCIRCLING_JELLYFISH_TAIL_COUNT   =   5;
export const ENCIRCLING_JELLYFISH_SEGS_PER_TAIL = 12;
export const ENCIRCLING_JELLYFISH_SEG_MAX_LEN  =   7;
export const ENCIRCLING_JELLYFISH_SEG_DAMPING  = 0.85;
export const ENCIRCLING_JELLYFISH_PULSE_FORCE  = 0.60;
export const ENCIRCLING_JELLYFISH_PULSE_CD_MS  = 2000;
export const ENCIRCLING_JELLYFISH_PULSE_DUR_MS =  400;
export const ENCIRCLING_JELLYFISH_DRIFT_DRAG   = 0.970;

/** Orbit radius for the encircling AI (px). */
export const ENCIRCLING_ORBIT_RADIUS = 90;
/** Angular speed (rad/s) for the encircling orbit. */
export const ENCIRCLING_ORBIT_SPEED  = 0.85;

/** Flank offset distance for the longtail AI (px, perpendicular to player-chase axis). */
export const LONGTAIL_FLANK_DIST = 70;
