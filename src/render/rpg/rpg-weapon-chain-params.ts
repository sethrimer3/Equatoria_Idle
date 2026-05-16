/**
 * rpg-weapon-chain-params.ts — Quartz chain whip physics constants and dev-tuning API.
 *
 * Extracted from rpg-weapon-constants.ts so that file stays focused on
 * per-weapon visual/projectile constants. This module owns the mutable
 * physics parameters that can be adjusted at runtime via dev tools.
 *
 * All exports are re-exported from rpg-weapon-constants.ts for backward compat.
 */

// ── Quartz chain whip constants ────────────────────────────────
export const CHAIN_NODES           =  30;
export const CHAIN_NODE_COLOR      = '#a0d8ef';
export const CHAIN_NODE_GLOW       = '#c8eeff';
export const CHAIN_LINE_COLOR      = '#88c8e8';

// ── Tunable physics parameters (mutable so dev tools can adjust at runtime) ──
/** Visual half-width of each polygon link (perpendicular to chain direction). */
export let CHAIN_MIN_RADIUS      =   1.5;
/** Visual half-width of tip link (farthest from player, slightly wider). */
export let CHAIN_MAX_RADIUS      =   3.5;
export let CHAIN_LASH_MS         = 420;   // ms for tip to lash toward target (longer for 30-node chain)
export let CHAIN_RETRACT_MS      = 480;   // ms in retracting phase before returning to idle
/** Damage ticks per I-frame interval (ms). */
export let CHAIN_HIT_CD_MS       =  62.5;
// ── Softbody whip physics constants ──
/** Rest spacing (px) between adjacent nodes.
 *  29 segments × 3px = 87px natural length — slightly longer than weapon range (75px)
 *  for a natural droop when idle. */
export let CHAIN_REST_LENGTH     =   3;
/** Spring stiffness between adjacent nodes. */
export let CHAIN_SPRING_K        =   0.55;
/** Anchor spring pulling node 0 toward the player (idle). */
export let CHAIN_ANCHOR_K        =   0.70;
/** Anchor spring during retract phase (stronger pull). */
export let CHAIN_RETRACT_ANCHOR_K = 2.5;
/** Base linear velocity damping coefficient per simulation dt.
 *  Tuned to be 10× stronger than the prior chain damping. */
export let CHAIN_DAMPING_COEFF   =   0.20;
/** Additional linear damping gain per px/dt of node speed. */
export let CHAIN_DAMPING_SPEED_SCALE = 0.12;
/** Initial speed given to nodes when a lash is triggered (px/dt).
 *  Applied with a cascade: inner nodes get a smaller impulse, outer nodes get more. */
export let CHAIN_LASH_SPEED      =  14;
/** Inertia of node 0 (closest to player, most responsive). */
export let CHAIN_MIN_INERTIA     =   0.6;
/** Inertia of tip node (farthest, least responsive / most momentum). */
export let CHAIN_MAX_INERTIA     =   3.0;
/**
 * Visual gap ratio: each polygon link is rendered at this fraction of
 * CHAIN_REST_LENGTH so there is always a small gap between adjacent links.
 */
export let CHAIN_LINK_GAP_RATIO  =   0.55;

// ── Chain whip dev-tuning API ──────────────────────────────────────────────────

export type ChainWhipParamKey =
  | 'CHAIN_MIN_RADIUS' | 'CHAIN_MAX_RADIUS'
  | 'CHAIN_LASH_MS' | 'CHAIN_RETRACT_MS' | 'CHAIN_HIT_CD_MS'
  | 'CHAIN_REST_LENGTH' | 'CHAIN_SPRING_K' | 'CHAIN_ANCHOR_K'
  | 'CHAIN_RETRACT_ANCHOR_K' | 'CHAIN_DAMPING_COEFF' | 'CHAIN_DAMPING_SPEED_SCALE'
  | 'CHAIN_LASH_SPEED' | 'CHAIN_MIN_INERTIA' | 'CHAIN_MAX_INERTIA'
  | 'CHAIN_LINK_GAP_RATIO';

export interface ChainWhipParams {
  CHAIN_MIN_RADIUS: number;
  CHAIN_MAX_RADIUS: number;
  CHAIN_LASH_MS: number;
  CHAIN_RETRACT_MS: number;
  CHAIN_HIT_CD_MS: number;
  CHAIN_REST_LENGTH: number;
  CHAIN_SPRING_K: number;
  CHAIN_ANCHOR_K: number;
  CHAIN_RETRACT_ANCHOR_K: number;
  CHAIN_DAMPING_COEFF: number;
  CHAIN_DAMPING_SPEED_SCALE: number;
  CHAIN_LASH_SPEED: number;
  CHAIN_MIN_INERTIA: number;
  CHAIN_MAX_INERTIA: number;
  CHAIN_LINK_GAP_RATIO: number;
}

/** Default values for all tunable chain whip physics parameters. */
export const CHAIN_WHIP_PARAM_DEFAULTS: Readonly<ChainWhipParams> = {
  CHAIN_MIN_RADIUS:         1.5,
  CHAIN_MAX_RADIUS:         3.5,
  CHAIN_LASH_MS:          420,
  CHAIN_RETRACT_MS:       480,
  CHAIN_HIT_CD_MS:         62.5,
  CHAIN_REST_LENGTH:        3,
  CHAIN_SPRING_K:           0.55,
  CHAIN_ANCHOR_K:           0.70,
  CHAIN_RETRACT_ANCHOR_K:   2.5,
  CHAIN_DAMPING_COEFF:      0.20,
  CHAIN_DAMPING_SPEED_SCALE: 0.12,
  CHAIN_LASH_SPEED:        14,
  CHAIN_MIN_INERTIA:        0.6,
  CHAIN_MAX_INERTIA:        3.0,
  CHAIN_LINK_GAP_RATIO:     0.55,
};

/** Returns a snapshot of the current tunable chain whip physics values. */
export function getChainWhipParams(): ChainWhipParams {
  return {
    CHAIN_MIN_RADIUS,
    CHAIN_MAX_RADIUS,
    CHAIN_LASH_MS,
    CHAIN_RETRACT_MS,
    CHAIN_HIT_CD_MS,
    CHAIN_REST_LENGTH,
    CHAIN_SPRING_K,
    CHAIN_ANCHOR_K,
    CHAIN_RETRACT_ANCHOR_K,
    CHAIN_DAMPING_COEFF,
    CHAIN_DAMPING_SPEED_SCALE,
    CHAIN_LASH_SPEED,
    CHAIN_MIN_INERTIA,
    CHAIN_MAX_INERTIA,
    CHAIN_LINK_GAP_RATIO,
  };
}

/** Sets a single tunable chain whip physics parameter by key. */
export function setChainWhipParam(key: ChainWhipParamKey, value: number): void {
  switch (key) {
    case 'CHAIN_MIN_RADIUS':          CHAIN_MIN_RADIUS = value; break;
    case 'CHAIN_MAX_RADIUS':          CHAIN_MAX_RADIUS = value; break;
    case 'CHAIN_LASH_MS':             CHAIN_LASH_MS = value; break;
    case 'CHAIN_RETRACT_MS':          CHAIN_RETRACT_MS = value; break;
    case 'CHAIN_HIT_CD_MS':           CHAIN_HIT_CD_MS = value; break;
    case 'CHAIN_REST_LENGTH':         CHAIN_REST_LENGTH = value; break;
    case 'CHAIN_SPRING_K':            CHAIN_SPRING_K = value; break;
    case 'CHAIN_ANCHOR_K':            CHAIN_ANCHOR_K = value; break;
    case 'CHAIN_RETRACT_ANCHOR_K':    CHAIN_RETRACT_ANCHOR_K = value; break;
    case 'CHAIN_DAMPING_COEFF':       CHAIN_DAMPING_COEFF = value; break;
    case 'CHAIN_DAMPING_SPEED_SCALE': CHAIN_DAMPING_SPEED_SCALE = value; break;
    case 'CHAIN_LASH_SPEED':          CHAIN_LASH_SPEED = value; break;
    case 'CHAIN_MIN_INERTIA':         CHAIN_MIN_INERTIA = value; break;
    case 'CHAIN_MAX_INERTIA':         CHAIN_MAX_INERTIA = value; break;
    case 'CHAIN_LINK_GAP_RATIO':      CHAIN_LINK_GAP_RATIO = value; break;
  }
}

/** Resets all tunable chain whip physics parameters to their default values. */
export function resetChainWhipParams(): void {
  CHAIN_MIN_RADIUS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_MIN_RADIUS;
  CHAIN_MAX_RADIUS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_MAX_RADIUS;
  CHAIN_LASH_MS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_LASH_MS;
  CHAIN_RETRACT_MS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_RETRACT_MS;
  CHAIN_HIT_CD_MS = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_HIT_CD_MS;
  CHAIN_REST_LENGTH = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_REST_LENGTH;
  CHAIN_SPRING_K = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_SPRING_K;
  CHAIN_ANCHOR_K = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_ANCHOR_K;
  CHAIN_RETRACT_ANCHOR_K = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_RETRACT_ANCHOR_K;
  CHAIN_DAMPING_COEFF = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_DAMPING_COEFF;
  CHAIN_DAMPING_SPEED_SCALE = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_DAMPING_SPEED_SCALE;
  CHAIN_LASH_SPEED = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_LASH_SPEED;
  CHAIN_MIN_INERTIA = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_MIN_INERTIA;
  CHAIN_MAX_INERTIA = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_MAX_INERTIA;
  CHAIN_LINK_GAP_RATIO = CHAIN_WHIP_PARAM_DEFAULTS.CHAIN_LINK_GAP_RATIO;
}
