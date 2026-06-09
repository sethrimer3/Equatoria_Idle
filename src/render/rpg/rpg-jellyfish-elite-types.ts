/**
 * rpg-jellyfish-elite-types.ts — Types for the four elite jellyfish variants.
 *
 * All four variants share one type discriminated by `variant`.  A single
 * `eliteJellyfishEnemies` array holds all four, keeping integration overhead
 * minimal while allowing per-variant AI / stat / visual differences.
 *
 * Tentacles use Verlet integration + taut-only constraint:
 *   - Segment moves ONLY when the distance to its parent exceeds maxSegLen.
 *   - This produces natural lag on direction changes without snapping.
 */

/** Which of the four elite jellyfish variants this instance is. */
export type JellyfishEliteVariant = 'basic' | 'longtail' | 'whiplash' | 'encircling';

export interface EliteJellyfishEnemy {
  kind: 'proc_jellyfish_elite';
  variant: JellyfishEliteVariant;

  // ── Standard enemy fields ─────────────────────────────────────────────────
  x: number; y: number;
  vx: number; vy: number;
  hp: number; maxHp: number;
  atk: number; def: number;
  animPhase: number;
  hitFlashMs: number;
  contactCdMs: number;

  // ── Bell animation ────────────────────────────────────────────────────────
  bellPhase: number;

  // ── Pulse / drift motion ──────────────────────────────────────────────────
  /** Countdown (ms) until the next thrust pulse fires. */
  pulseCdMs: number;
  /** Remaining duration (ms) of the current active pulse. */
  pulseActiveMs: number;
  /** Force magnitude applied each frame during a pulse. */
  pulseForce: number;
  /** Per-frame drag coefficient applied during drift (0–1, lower = more drag). */
  driftDrag: number;
  /** Maximum orbit angle (radians) for the orbit/encircle AI mode. */
  orbitAngle: number;
  /** Flank sign: +1 = flank left, -1 = flank right. */
  flankSign: number;
  /** Cooldown (ms) for whiplash burst. */
  burstCdMs: number;

  // ── Tentacle data (preallocated, never re-allocated after spawn) ──────────
  tailCount: number;
  segmentsPerTail: number;
  /** Current segment X [tailIdx * segmentsPerTail + segIdx]. */
  segX: Float64Array;
  /** Current segment Y. */
  segY: Float64Array;
  /** Previous segment X (Verlet). */
  segPvX: Float64Array;
  /** Previous segment Y (Verlet). */
  segPvY: Float64Array;
  /** Maximum distance between consecutive segments (px). */
  segMaxLen: number;
  /** Per-frame velocity retention for tentacles (0–1). Higher = more sway. */
  segDamping: number;
}
