/**
 * horizon-pentagon-constants.ts — Tuning constants for the Horizon pentagon mirror enemy.
 *
 * All magic numbers live here so they can be adjusted without hunting through
 * update/draw code.
 */

// ── Body ─────────────────────────────────────────────────────────────────────
export const PENTAGON_HP_INIT      = 5000;
export const PENTAGON_ATK_INIT     =  60;
export const PENTAGON_DEF_INIT     =  30;
export const PENTAGON_RADIUS       =  14;  // polygon circumradius in px
export const PENTAGON_COLOR        = '#6699ff';
export const PENTAGON_GLOW         = '#99bbff';
export const PENTAGON_PATROL_SPEED =   0.38;
export const PENTAGON_PATROL_TURN_MS = 3200;
export const PENTAGON_PATROL_DAMPING = 0.962;
export const PENTAGON_XP_MULT      =  25;

// ── Shadow visuals ───────────────────────────────────────────────────────────
export const SHADOW_ALPHA          =  0.28;
export const SHADOW_COLOR          = '#1a2266';
export const SHADOW_GLOW           = '#223388';

// ── Swap system ──────────────────────────────────────────────────────────────
// Brief swap-cooldown prevents rapid multi-hit from swapping every frame.
export const SWAP_CD_MS            =  600;

// ── Mirror lines ─────────────────────────────────────────────────────────────
// Y-fraction (0–1) of the arena height at which mirror lines sit.
// Two lines → two shadow clones. Adjust to taste.
export const MIRROR_LINE_FRACTIONS: readonly number[] = [0.33, 0.67];

// ── Fluid explosion colours for death ────────────────────────────────────────
export const FLUID_PENTAGON_R =  88;
export const FLUID_PENTAGON_G = 136;
export const FLUID_PENTAGON_B = 255;

// ── Attack A: homing missile ─────────────────────────────────────────────────
export const MISSILE_CD_BASE_MS    = 6000;
export const MISSILE_CD_JITTER_MS  = 2000;
export const MISSILE_HP            =   50;
export const MISSILE_ATK           =   55;  // explosion-hit damage
export const MISSILE_SPEED         =    0.85;
export const MISSILE_SEEK_STR      =    0.011;
export const MISSILE_MAX_SPEED     =    1.7;
export const MISSILE_EXPLODE_RADIUS =  28;   // px
export const MISSILE_SIZE          =    4.5;
export const MISSILE_LIFE_MS       = 56000;
export const MISSILE_TRAIL_CAP     =   24;
export const MISSILE_COLOR         = '#ff99cc';
export const MISSILE_GLOW          = '#ffbbdd';
export const MISSILE_EXPLODE_FLASH_MS = 180; // brief flash ring before explosion

// ── Attack B: charge-up laser ────────────────────────────────────────────────
export const LASER_CD_BASE_MS      = 9500;
export const LASER_CD_JITTER_MS    = 3000;
export const LASER_CHARGE_MS       = 2200; // warning-line phase
export const LASER_FIRE_MS         =  700; // bright beam phase
export const LASER_ATK_DPS         =   40; // damage per second during fire
export const LASER_HITBOX_PX       =    6; // perpendicular distance to player for a hit
export const LASER_WARNING_COLOR   = 'rgba(150,180,255,0.35)';
export const LASER_FIRE_COLOR      = '#aaddff';
export const LASER_GLOW_COLOR      = '#ccecff';
export const LASER_TRACK_SPEED_RAD = 0.00045; // radians/ms of slow target tracking during charge

// ── Attack C: gatling scatter ────────────────────────────────────────────────
export const GATLING_CD_BASE_MS    = 3800;
export const GATLING_CD_JITTER_MS  = 1500;
export const GATLING_COUNT         =    5;
export const GATLING_SPREAD_RAD    =    0.32;
export const GATLING_ATK           =   16;
export const GATLING_SPEED         =    1.15;
export const GATLING_LIFE_MS       = 10400;
export const GATLING_SIZE          =    2.5;
export const GATLING_COLOR         = '#8899ee';
export const GATLING_GLOW          = '#aabbff';

// ── Puff particles (emitted on swap) ─────────────────────────────────────────
export const PUFF_COUNT            =  11;
export const PUFF_SPEED_MAX        =   1.8;
export const PUFF_LIFE_MS          =  480;
export const PUFF_SIZE             =    3;
export const PUFF_COLOR            = '#8899ff';

// ── Attack weight table ───────────────────────────────────────────────────────
// Weights: missile, laser, gatling (must sum to anything; normalized internally).
export const ATTACK_WEIGHT_MISSILE  = 3;
export const ATTACK_WEIGHT_LASER    = 1;
export const ATTACK_WEIGHT_GATLING  = 5;
