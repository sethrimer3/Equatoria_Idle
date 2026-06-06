/**
 * impetus-particle-life.ts — Wave-specific particle-life interaction matrix for
 * the Impetus RPG zone.
 *
 * Each wave, a randomized N×N asymmetric interaction matrix is generated for the
 * aliven variant types present in that wave's spawn list. The matrix drives:
 *
 *   1. Cross-group physics forces applied each frame via applyParticleLifeForces().
 *   2. A faint background overlay drawn via drawImpetusParticleLifeMatrix() that
 *      fades in diagonally at wave start and fades out the same way before vanishing.
 *
 * The module holds a single piece of mutable state (_state) representing the
 * current wave's matrix. initParticleLifeMatrix() replaces it each wave; null
 * means no matrix is active (non-Impetus zones, or pre-first-wave).
 */

import type { AlivenParticleGroup } from '../rpg-aliven-types';

// ── Animation timings ─────────────────────────────────────────────────────────

/** Delay between successive diagonals appearing (ms). */
const CELL_STAGGER_MS = 72;
/** Duration of each cell's individual fade-in or fade-out (ms). */
const CELL_FADE_MS    = 270;
/** Time the matrix is fully visible after all cells have faded in (ms). */
const HOLD_MS         = 2800;

// ── Physics constants ──────────────────────────────────────────────────────────

/** Maximum distance for cross-group particle interaction (px). */
const INFLUENCE_RADIUS    = 90;
/** Inner short-range radius — always repels, regardless of coefficient (px). */
const INNER_RADIUS        = 12;
/** Short-range repulsion strength per ms. */
const INNER_STRENGTH      = 0.00024;
/** Outer zone force scale per ms (coefficient multiplied in). */
const OUTER_STRENGTH      = 0.00011;

// ── Matrix value range ────────────────────────────────────────────────────────

const MIN_COEFF = -0.40;
const MAX_COEFF =  0.40;

// ── Variant display metadata ──────────────────────────────────────────────────

/** Short label and accent color for each aliven variant ID. */
const VARIANT_META: Record<string, { label: string; color: string }> = {
  aliven_spark_cluster:   { label: 'Spa', color: '#7ab4ff' },
  aliven_shard_bloom:     { label: 'Sha', color: '#44ee88' },
  aliven_pulse_swarm:     { label: 'Pul', color: '#f0d060' },
  aliven_ember_ring:      { label: 'Emb', color: '#ff8c3c' },
  aliven_void_splinters:  { label: 'Voi', color: '#9966bb' },
  aliven_healer_nodes:    { label: 'Hea', color: '#cc88ee' },
  aliven_orbit_bloom:     { label: 'Orb', color: '#ff5050' },
  aliven_quartz_ghost:    { label: 'Gho', color: '#d8e8f0' },
  aliven_iolite_prism:    { label: 'Iol', color: '#6464b4' },
  aliven_fracteryl_storm: { label: 'Fra', color: '#cc44ff' },
};

// ── State ──────────────────────────────────────────────────────────────────────

interface ImpetusParticleLifeState {
  /** Ordered variant IDs for this wave (rows = src, cols = tgt). */
  variants: string[];
  /** N×N matrix: matrix[srcIdx][tgtIdx] in [MIN_COEFF, MAX_COEFF]. */
  matrix: number[][];
  /** Elapsed ms since init (advanced by tickParticleLifeMatrix). */
  elapsedMs: number;
  /** Pre-computed total animation duration (ms). */
  totalDurationMs: number;
  /** Number of diagonals = 2*(N-1), cached for drawing. */
  lastDiag: number;
  /** Elapsed hold start time = (lastDiag * CELL_STAGGER_MS + CELL_FADE_MS). */
  fadeInEndMs: number;
  /** When the hold phase ends. */
  holdEndMs: number;
  /** True once elapsedMs has passed totalDurationMs. */
  done: boolean;
}

let _state: ImpetusParticleLifeState | null = null;

// ── Public: interaction coefficient ──────────────────────────────────────────

/**
 * Returns how strongly variant srcId is attracted to tgtId this wave.
 * Positive = attraction, negative = repulsion. Returns 0 when no matrix is active.
 */
export function getAlivenInteractionCoeff(srcVariantId: string, tgtVariantId: string): number {
  if (!_state || _state.done) return 0;
  const si = _state.variants.indexOf(srcVariantId);
  const ti = _state.variants.indexOf(tgtVariantId);
  if (si < 0 || ti < 0) return 0;
  return _state.matrix[si][ti];
}

// ── Public: init ──────────────────────────────────────────────────────────────

/**
 * Generate a new randomized interaction matrix for the given aliven variant IDs.
 * Only IDs present in VARIANT_META are included; unknown IDs are silently dropped.
 * Call once at the start of each Impetus wave (from rpg-wave-manager.ts).
 */
export function initParticleLifeMatrix(alivenVariantIds: string[]): void {
  // Deduplicate and filter to known variants
  const seen = new Set<string>();
  const variants: string[] = [];
  for (const id of alivenVariantIds) {
    if (id in VARIANT_META && !seen.has(id)) {
      seen.add(id);
      variants.push(id);
    }
  }
  if (variants.length === 0) {
    _state = null;
    return;
  }

  const N = variants.length;
  const matrix: number[][] = [];
  for (let i = 0; i < N; i++) {
    matrix[i] = [];
    for (let j = 0; j < N; j++) {
      // Round to nearest 0.05 for clean display values
      const raw = MIN_COEFF + Math.random() * (MAX_COEFF - MIN_COEFF);
      matrix[i][j] = Math.round(raw / 0.05) * 0.05;
    }
  }

  const lastDiag       = 2 * (N - 1);
  const fadeInEndMs    = lastDiag * CELL_STAGGER_MS + CELL_FADE_MS;
  const holdEndMs      = fadeInEndMs + HOLD_MS;
  const totalDurationMs = holdEndMs + lastDiag * CELL_STAGGER_MS + CELL_FADE_MS;

  _state = {
    variants,
    matrix,
    elapsedMs: 0,
    totalDurationMs,
    lastDiag,
    fadeInEndMs,
    holdEndMs,
    done: false,
  };
}

// ── Public: tick ──────────────────────────────────────────────────────────────

/** Advance the animation clock. Call once per frame from rpg-render-update.ts. */
export function tickParticleLifeMatrix(deltaMs: number): void {
  if (!_state || _state.done) return;
  _state.elapsedMs += deltaMs;
  if (_state.elapsedMs >= _state.totalDurationMs) {
    _state.done = true;
  }
}

// ── Public: physics ───────────────────────────────────────────────────────────

/**
 * Apply particle-life cross-group forces to all alive aliven particles.
 *
 * For each ordered pair of groups (A, B) where A ≠ B:
 *   matrix[A.variantIdx][B.variantIdx] drives attraction/repulsion from each B
 *   particle onto each A particle.  Positive = A is attracted toward B.
 *
 * The inner zone (< INNER_RADIUS) always repels regardless of coefficient so
 * particles don't pile up on each other.
 *
 * Safe to call unconditionally — exits immediately when no Impetus matrix is active.
 */
export function applyParticleLifeForces(groups: AlivenParticleGroup[], deltaMs: number): void {
  if (!_state || groups.length < 2) return;

  const { variants, matrix } = _state;
  const maxDistSq  = INFLUENCE_RADIUS * INFLUENCE_RADIUS;
  const innerDistSq = INNER_RADIUS * INNER_RADIUS;

  for (let ai = 0; ai < groups.length; ai++) {
    const gA = groups[ai];
    if (gA.aliveCount === 0) continue;
    const siA = variants.indexOf(gA.variantId);
    if (siA < 0) continue;

    for (let bi = 0; bi < groups.length; bi++) {
      if (ai === bi) continue;
      const gB = groups[bi];
      if (gB.aliveCount === 0) continue;
      const siB = variants.indexOf(gB.variantId);
      if (siB < 0) continue;

      const coeff = matrix[siA][siB];

      for (const pA of gA.particles) {
        if (!pA.isAlive) continue;
        for (const pB of gB.particles) {
          if (!pB.isAlive) continue;
          const dx = pB.x - pA.x;
          const dy = pB.y - pA.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > maxDistSq || distSq < 0.0001) continue;
          const dist = Math.sqrt(distSq);
          const nx = dx / dist;
          const ny = dy / dist;

          let force: number;
          if (distSq < innerDistSq) {
            // Short-range: always repel to prevent collapse
            force = -INNER_STRENGTH * (1.0 - dist / INNER_RADIUS);
          } else {
            // Outer zone: blend from coefficient at inner edge to zero at outer edge
            const t = (dist - INNER_RADIUS) / (INFLUENCE_RADIUS - INNER_RADIUS);
            force = coeff * OUTER_STRENGTH * (1.0 - t);
          }

          pA.vx += nx * force * deltaMs;
          pA.vy += ny * force * deltaMs;
        }
      }
    }
  }
}

// ── Public: draw ──────────────────────────────────────────────────────────────

/**
 * Draw the particle-life interaction matrix as a faint background overlay.
 * Cells fade in along diagonals (top-left → bottom-right), hold, then fade out.
 *
 * Expects canvas2d to already be translated to the viewport origin
 * (same coordinate space as drawImpetusBackground / drawImpetusFloorEffects).
 */
export function drawImpetusParticleLifeMatrix(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
): void {
  if (!_state || _state.done) return;
  const { variants, matrix, elapsedMs, holdEndMs } = _state;
  const N = variants.length;
  if (N === 0) return;

  // ── Layout ──────────────────────────────────────────────────────────────────

  const marginX    = 20;
  const rowLabelW  = 44;
  const colLabelH  = 30;
  const maxCellPx  = 54;
  const availW     = widthPx - 2 * marginX - rowLabelW;
  const cellW      = Math.min(maxCellPx, Math.floor(availW / N));
  const cellH      = cellW;
  const matrixW    = rowLabelW + cellW * N;
  const originX    = Math.floor((widthPx - matrixW) / 2);
  const originY    = Math.floor(heightPx * 0.12);

  // ── Cell alpha helper ────────────────────────────────────────────────────────

  function cellAlpha(row: number, col: number): number {
    const diag        = row + col;
    const fadeInStart = diag * CELL_STAGGER_MS;
    const fadeInEnd   = fadeInStart + CELL_FADE_MS;
    const fadeOutStart = holdEndMs + diag * CELL_STAGGER_MS;
    const fadeOutEnd  = fadeOutStart + CELL_FADE_MS;

    if (elapsedMs < fadeInStart) return 0;
    if (elapsedMs < fadeInEnd)   return (elapsedMs - fadeInStart) / CELL_FADE_MS;
    if (elapsedMs < holdEndMs)   return 1;
    if (elapsedMs < fadeOutStart) return 1;
    if (elapsedMs < fadeOutEnd)  return 1 - (elapsedMs - fadeOutStart) / CELL_FADE_MS;
    return 0;
  }

  // ── Overall matrix opacity (dims as it fades in, bright at hold, dims at fadeout) ──

  // Use the alpha of the corner cells as the overall envelope so the whole
  // matrix envelope can be set via globalAlpha once per block.
  // (Each cell manages its own alpha internally via repeated globalAlpha sets.)

  canvas2d.save();

  // ── "src \ tgt" header ───────────────────────────────────────────────────────

  const headerAlpha = cellAlpha(0, 0);
  if (headerAlpha > 0.005) {
    canvas2d.globalAlpha = headerAlpha * 0.45;
    canvas2d.fillStyle   = '#7070a0';
    canvas2d.font        = 'bold 8px monospace';
    canvas2d.textAlign   = 'right';
    canvas2d.textBaseline = 'bottom';
    canvas2d.fillText('src \\ tgt', originX + rowLabelW - 3, originY + colLabelH - 3);
  }

  // ── Column headers ────────────────────────────────────────────────────────────

  for (let col = 0; col < N; col++) {
    const a = cellAlpha(0, col);
    if (a <= 0.005) continue;
    const cx = originX + rowLabelW + col * cellW + cellW / 2;
    const cy = originY + colLabelH / 2;
    const meta = VARIANT_META[variants[col]];
    canvas2d.globalAlpha  = a * 0.70;
    canvas2d.fillStyle    = meta?.color ?? '#ffffff';
    canvas2d.font         = 'bold 9px monospace';
    canvas2d.textAlign    = 'center';
    canvas2d.textBaseline = 'middle';
    canvas2d.fillText(meta?.label ?? variants[col].slice(0, 3), cx, cy);
  }

  // ── Row headers ───────────────────────────────────────────────────────────────

  for (let row = 0; row < N; row++) {
    const a = cellAlpha(row, 0);
    if (a <= 0.005) continue;
    const rx = originX + rowLabelW - 5;
    const ry = originY + colLabelH + row * cellH + cellH / 2;
    const meta = VARIANT_META[variants[row]];
    canvas2d.globalAlpha  = a * 0.70;
    canvas2d.fillStyle    = meta?.color ?? '#ffffff';
    canvas2d.font         = 'bold 9px monospace';
    canvas2d.textAlign    = 'right';
    canvas2d.textBaseline = 'middle';
    canvas2d.fillText(meta?.label ?? variants[row].slice(0, 3), rx, ry);
  }

  // ── Matrix cells ──────────────────────────────────────────────────────────────

  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) {
      const a = cellAlpha(row, col);
      if (a <= 0.005) continue;

      const cx  = originX + rowLabelW + col * cellW;
      const cy  = originY + colLabelH + row * cellH;
      const val = matrix[row][col];
      const absVal  = Math.abs(val);
      const intensity = absVal / MAX_COEFF; // 0–1

      // Background fill: green for positive (attraction), red for negative (repulsion)
      let fillR: number, fillG: number, fillB: number;
      if (val > 0.01) {
        fillR = Math.round(8  + intensity * 18);
        fillG = Math.round(45 + intensity * 75);
        fillB = Math.round(8  + intensity * 18);
      } else if (val < -0.01) {
        fillR = Math.round(55 + intensity * 75);
        fillG = 8;
        fillB = 8;
      } else {
        fillR = 8; fillG = 8; fillB = 20;
      }

      canvas2d.globalAlpha = a * 0.28;
      canvas2d.fillStyle   = `rgb(${fillR},${fillG},${fillB})`;
      canvas2d.fillRect(cx, cy, cellW - 1, cellH - 1);

      // Diagonal (self-interaction) gets a subtle white shimmer
      if (row === col) {
        canvas2d.globalAlpha = a * 0.10;
        canvas2d.fillStyle   = '#ffffff';
        canvas2d.fillRect(cx, cy, cellW - 1, cellH - 1);
      }

      // Value text
      const valStr = (val >= 0 ? '+' : '') + val.toFixed(2);
      canvas2d.globalAlpha  = a * 0.75;
      canvas2d.fillStyle    = '#d8d8e8';
      canvas2d.font         = `${Math.max(8, Math.min(11, Math.floor(cellW * 0.20)))}px monospace`;
      canvas2d.textAlign    = 'center';
      canvas2d.textBaseline = 'middle';
      canvas2d.fillText(valStr, cx + cellW / 2, cy + cellH / 2);
    }
  }

  // ── Separator lines between header and body ───────────────────────────────────

  // Horizontal line under column headers
  const lineAlpha = cellAlpha(0, 0);
  if (lineAlpha > 0.005) {
    canvas2d.globalAlpha = lineAlpha * 0.25;
    canvas2d.strokeStyle = '#6060a0';
    canvas2d.lineWidth   = 0.5;
    canvas2d.beginPath();
    canvas2d.moveTo(originX + rowLabelW, originY + colLabelH);
    canvas2d.lineTo(originX + rowLabelW + cellW * N, originY + colLabelH);
    canvas2d.stroke();
    // Vertical line right of row labels
    canvas2d.beginPath();
    canvas2d.moveTo(originX + rowLabelW, originY + colLabelH);
    canvas2d.lineTo(originX + rowLabelW, originY + colLabelH + cellH * N);
    canvas2d.stroke();
  }

  canvas2d.restore();
}
