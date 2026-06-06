/**
 * impetus-particle-life.ts — Wave-specific particle-life interaction matrix for
 * the Impetus RPG zone.
 *
 * Each wave, a profile-biased N×N asymmetric interaction matrix is generated for
 * the aliven variant types present in that wave's spawn list.  The matrix drives:
 *
 *   1. Cross-group physics forces applied each frame via applyParticleLifeForces().
 *   2. A faint background overlay drawn via drawImpetusParticleLifeMatrix() that
 *      fades in diagonally at wave start and fades out the same way before vanishing.
 *
 * Behavior profiles replace the old full-random matrix:
 *   balanced, small_clusters, large_clusters, gliders, quiescence, chains, snakes
 * Each profile has its own template (matrix fill strategy) and physics constants
 * (protectedRadius, influenceRadius, forceScale, friction, maxVelocity).
 *
 * Profile physics are exposed via getActiveAlivenFriction() / getActiveAlivenMaxVelocity()
 * so rpg-aliven-updates.ts can use them inside tickMovement.
 */

import type { AlivenParticleGroup } from '../rpg-aliven-types';

// ── Animation timings ─────────────────────────────────────────────────────────

/** Delay between successive diagonals appearing (ms). */
const CELL_STAGGER_MS = 72;
/** Duration of each cell's individual fade-in or fade-out (ms). */
const CELL_FADE_MS    = 270;
/** Time the matrix is fully visible after all cells have faded in (ms). */
const HOLD_MS         = 2800;

// ── Base physics constants ─────────────────────────────────────────────────────

/** Short-range repulsion peak strength per ms — scaled by profile innerScale. */
const BASE_INNER_STRENGTH = 0.00024;
/** Outer zone force peak strength per ms — scaled by profile outerScale. */
const BASE_OUTER_STRENGTH = 0.00011;
/** Extra px added to influenceRadius for group-level centroid broadphase. */
const BROADPHASE_SLACK    = 40;

// ── Fallback physics (used when no Impetus matrix is active) ───────────────────

const FALLBACK_FRICTION     = 0.985;
const FALLBACK_MAX_VELOCITY = 0.18;

// ── Behavior profile system ────────────────────────────────────────────────────

type ProfileId =
  | 'balanced'
  | 'small_clusters'
  | 'large_clusters'
  | 'gliders'
  | 'quiescence'
  | 'chains'
  | 'snakes';

type TemplateKind =
  | 'random_soft'
  | 'symmetric_soft'
  | 'chains'
  | 'chains_2'
  | 'chains_3'
  | 'snakes'
  | 'clusters';

interface ProfileParams {
  /** Short human-readable name shown in the dev overlay and matrix header. */
  displayName: string;
  /** How the matrix entries are generated. */
  templateKind: TemplateKind;
  /** Mean coefficient for off-diagonal entries (before noise). */
  baseCoeff: number;
  /** Half-width of per-entry noise (±coeffNoise). */
  coeffNoise: number;
  /** Hard clamp applied after adding noise. */
  coeffMin: number;
  coeffMax: number;
  /** Extra bias applied to diagonal (self-interaction) entries. */
  selfBias: number;
  /** Inner repulsion zone radius (px) — particles closer than this are always repelled. */
  protectedRadius: number;
  /** Outer interaction range (px) — force is zero beyond this distance. */
  influenceRadius: number;
  /** Multiplier on BASE_OUTER_STRENGTH. */
  outerScale: number;
  /** Multiplier on BASE_INNER_STRENGTH. */
  innerScale: number;
  /** Per-frame velocity multiplier (< 1 = friction/damping). */
  friction: number;
  /** Maximum particle speed cap (px/ms). */
  maxVelocity: number;
}

const PROFILES: Record<ProfileId, ProfileParams> = {
  balanced: {
    displayName: 'Balanced',
    templateKind: 'random_soft',
    baseCoeff: 0, coeffNoise: 0.12, coeffMin: -0.25, coeffMax: 0.25,
    selfBias: -0.05,
    protectedRadius: 14, influenceRadius: 90,
    outerScale: 1.0, innerScale: 1.0,
    friction: 0.986, maxVelocity: 0.18,
  },
  small_clusters: {
    displayName: 'SmallClusters',
    templateKind: 'clusters',
    baseCoeff: 0, coeffNoise: 0.06, coeffMin: -0.20, coeffMax: 0.25,
    selfBias: 0.15,
    protectedRadius: 10, influenceRadius: 70,
    outerScale: 0.85, innerScale: 0.9,
    friction: 0.983, maxVelocity: 0.20,
  },
  large_clusters: {
    displayName: 'LargeClusters',
    templateKind: 'clusters',
    baseCoeff: 0.05, coeffNoise: 0.08, coeffMin: -0.15, coeffMax: 0.30,
    selfBias: 0.18,
    protectedRadius: 16, influenceRadius: 120,
    outerScale: 1.1, innerScale: 1.1,
    friction: 0.989, maxVelocity: 0.14,
  },
  gliders: {
    displayName: 'Gliders',
    templateKind: 'random_soft',
    baseCoeff: 0, coeffNoise: 0.15, coeffMin: -0.30, coeffMax: 0.30,
    selfBias: -0.08,
    protectedRadius: 12, influenceRadius: 80,
    outerScale: 0.95, innerScale: 1.0,
    friction: 0.978, maxVelocity: 0.22,
  },
  quiescence: {
    displayName: 'Quiescence',
    templateKind: 'symmetric_soft',
    baseCoeff: 0, coeffNoise: 0.06, coeffMin: -0.12, coeffMax: 0.12,
    selfBias: -0.03,
    protectedRadius: 18, influenceRadius: 100,
    outerScale: 0.65, innerScale: 0.8,
    friction: 0.992, maxVelocity: 0.11,
  },
  chains: {
    displayName: 'Chains',
    templateKind: 'chains',
    baseCoeff: 0, coeffNoise: 0.05, coeffMin: -0.25, coeffMax: 0.30,
    selfBias: 0.0,
    protectedRadius: 14, influenceRadius: 95,
    outerScale: 1.0, innerScale: 1.0,
    friction: 0.985, maxVelocity: 0.18,
  },
  snakes: {
    displayName: 'Snakes',
    templateKind: 'snakes',
    baseCoeff: 0, coeffNoise: 0.05, coeffMin: -0.15, coeffMax: 0.30,
    selfBias: 0.0,
    protectedRadius: 12, influenceRadius: 85,
    outerScale: 1.05, innerScale: 1.0,
    friction: 0.981, maxVelocity: 0.20,
  },
};

/** Deterministic per-wave profile selection — same wave number always gives the same profile. */
const _PROFILE_ORDER: ProfileId[] = [
  'balanced', 'small_clusters', 'chains', 'snakes', 'large_clusters', 'gliders', 'quiescence',
];

function _selectProfile(waveNumber: number): ProfileId {
  return _PROFILE_ORDER[(waveNumber - 1) % _PROFILE_ORDER.length];
}

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
  /** N×N matrix: matrix[srcIdx][tgtIdx] ∈ [coeffMin, coeffMax]. */
  matrix: number[][];
  /** Elapsed ms since init (advanced by tickParticleLifeMatrix). */
  elapsedMs: number;
  /** Pre-computed total animation duration (ms). */
  totalDurationMs: number;
  /** Number of diagonals = 2*(N-1), cached for drawing. */
  lastDiag: number;
  /** When the fade-in animation completes (ms). */
  fadeInEndMs: number;
  /** When the hold phase ends (ms). */
  holdEndMs: number;
  /** True once elapsedMs has passed totalDurationMs. */
  done: boolean;

  /** Active behavior profile for this wave. */
  profileId: ProfileId;
  /** Profile display name (shown in matrix overlay and dev line). */
  profileName: string;

  // Per-profile physics (used by applyParticleLifeForces and exposed for tickMovement)
  protectedRadius: number;
  influenceRadius: number;
  maxDistSq: number;        // influenceRadius²
  broadphaseSq: number;     // (influenceRadius + BROADPHASE_SLACK)²
  outerStrength: number;    // BASE_OUTER_STRENGTH * outerScale
  innerStrength: number;    // BASE_INNER_STRENGTH * innerScale
  plRMin: number;           // protectedRadius / influenceRadius
  plRMid: number;           // 0.5 * (plRMin + 1)
  plRHalf: number;          // 1 - plRMid
  friction: number;
  maxVelocity: number;
}

let _state: ImpetusParticleLifeState | null = null;

// ── Telemetry (written by applyParticleLifeForces each frame) ─────────────────

let _telPairChecks  = 0;
let _telLastMs      = 0;
let _telCoeffMin    = 0;
let _telCoeffMax    = 0;
let _telCoeffMean   = 0;
let _telProfileName = '-';

/**
 * Returns particle-life performance and profile metrics from the most recent frame.
 * Wire into the dev overlay to monitor impact and verify profile selection.
 */
export function getParticleLifeTelemetry(): {
  pairChecks: number;
  frameMs: number;
  profileName: string;
  coeffMin: number;
  coeffMax: number;
  coeffMean: number;
} {
  return {
    pairChecks:  _telPairChecks,
    frameMs:     _telLastMs,
    profileName: _telProfileName,
    coeffMin:    _telCoeffMin,
    coeffMax:    _telCoeffMax,
    coeffMean:   _telCoeffMean,
  };
}

// ── Active physics exports (read by tickMovement in rpg-aliven-updates.ts) ────

let _activeFriction    = FALLBACK_FRICTION;
let _activeMaxVelocity = FALLBACK_MAX_VELOCITY;

/** Per-profile friction for the current wave.  Falls back to 0.985 outside Impetus. */
export function getActiveAlivenFriction(): number    { return _activeFriction; }
/** Per-profile velocity cap for the current wave.  Falls back to 0.18 outside Impetus. */
export function getActiveAlivenMaxVelocity(): number { return _activeMaxVelocity; }

function _resetActivePhysics(): void {
  _activeFriction    = FALLBACK_FRICTION;
  _activeMaxVelocity = FALLBACK_MAX_VELOCITY;
  _telProfileName    = '-';
  _telCoeffMin = _telCoeffMax = _telCoeffMean = 0;
}

// ── Public: interaction coefficient ──────────────────────────────────────────

/**
 * Returns how strongly variant srcId is attracted to tgtId this wave.
 * Positive = attraction, negative = repulsion.  Returns 0 when no matrix is active.
 */
export function getAlivenInteractionCoeff(srcVariantId: string, tgtVariantId: string): number {
  if (!_state) return 0;
  const si = _state.variants.indexOf(srcVariantId);
  const ti = _state.variants.indexOf(tgtVariantId);
  if (si < 0 || ti < 0) return 0;
  return _state.matrix[si][ti];
}

// ── Matrix template builders ──────────────────────────────────────────────────

function _clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function _roundCoeff(v: number): number {
  return Math.round(v / 0.05) * 0.05;
}

function _buildMatrix(N: number, params: ProfileParams): number[][] {
  const { templateKind, baseCoeff, coeffNoise, coeffMin, coeffMax, selfBias } = params;
  const noise = () => (Math.random() * 2 - 1) * coeffNoise;

  const m: number[][] = Array.from({ length: N }, () => new Array<number>(N).fill(0));

  switch (templateKind) {
    case 'random_soft': {
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          const base = i === j ? selfBias : baseCoeff;
          m[i][j] = _roundCoeff(_clamp(base + noise(), coeffMin, coeffMax));
        }
      }
      break;
    }

    case 'symmetric_soft': {
      // Fill diagonal and upper triangle, then mirror lower triangle.
      for (let i = 0; i < N; i++) {
        m[i][i] = _roundCoeff(_clamp(selfBias + noise(), coeffMin, coeffMax));
        for (let j = i + 1; j < N; j++) {
          const val = _roundCoeff(_clamp(baseCoeff + noise(), coeffMin, coeffMax));
          m[i][j] = val;
          m[j][i] = val;
        }
      }
      break;
    }

    case 'chains': {
      // Self-attract + next-type attract + non-neighbor repel.
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          let base: number;
          if      (i === j)                base = 0.22;
          else if (j === (i + 1) % N)      base = 0.18;
          else                             base = -0.15;
          m[i][j] = _roundCoeff(_clamp(base + noise(), coeffMin, coeffMax));
        }
      }
      break;
    }

    case 'chains_2': {
      // Self-attract + weak next-type attract + non-neighbor repel.
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          let base: number;
          if      (i === j)                base = 0.22;
          else if (j === (i + 1) % N)      base = 0.08;
          else                             base = -0.15;
          m[i][j] = _roundCoeff(_clamp(base + noise(), coeffMin, coeffMax));
        }
      }
      break;
    }

    case 'chains_3': {
      // Self-attract + weak next-type attract + non-neighbor neutral.
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          let base: number;
          if      (i === j)                base = 0.22;
          else if (j === (i + 1) % N)      base = 0.08;
          else                             base = 0;
          m[i][j] = _roundCoeff(_clamp(base + noise(), coeffMin, coeffMax));
        }
      }
      break;
    }

    case 'snakes': {
      // Directed asymmetric pull: type i is strongly attracted toward type (i+1)%N.
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          let base: number;
          if      (i === j)                base = 0.12;
          else if (j === (i + 1) % N)      base = 0.22;  // forward pull
          else if (i === (j + 1) % N)      base = 0.04;  // weak reverse pull
          else                             base = 0;
          m[i][j] = _roundCoeff(_clamp(base + noise(), coeffMin, coeffMax));
        }
      }
      break;
    }

    case 'clusters': {
      // Self-cohesion + mild cross-type repulsion/neutral.
      for (let i = 0; i < N; i++) {
        for (let j = 0; j < N; j++) {
          if (i === j) {
            m[i][j] = _roundCoeff(_clamp(0.20 + selfBias + noise(), coeffMin, coeffMax));
          } else {
            m[i][j] = _roundCoeff(_clamp(-0.10 + baseCoeff + noise(), coeffMin, coeffMax));
          }
        }
      }
      break;
    }
  }

  return m;
}

// ── Public: init ──────────────────────────────────────────────────────────────

/**
 * Generate a profile-biased interaction matrix for the given aliven variant IDs.
 * Only IDs present in VARIANT_META are included; unknown IDs are silently dropped.
 * waveNumber is used for deterministic profile selection (same wave = same profile).
 * Call once at the start of each Impetus wave (from rpg-wave-manager.ts).
 */
export function initParticleLifeMatrix(alivenVariantIds: string[], waveNumber = 1): void {
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
    _resetActivePhysics();
    return;
  }

  const profileId   = _selectProfile(waveNumber);
  const params      = PROFILES[profileId];
  const N           = variants.length;
  const matrix      = _buildMatrix(N, params);

  // Coefficient stats for dev overlay
  let cMin = Infinity, cMax = -Infinity, cSum = 0;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      const v = matrix[i][j];
      if (v < cMin) cMin = v;
      if (v > cMax) cMax = v;
      cSum += v;
    }
  }
  _telCoeffMin    = cMin;
  _telCoeffMax    = cMax;
  _telCoeffMean   = cSum / (N * N);
  _telProfileName = params.displayName;

  // Precompute per-state physics
  const { protectedRadius, influenceRadius, outerScale, innerScale, friction, maxVelocity } = params;
  const plRMin      = protectedRadius / influenceRadius;
  const plRMid      = 0.5 * (plRMin + 1.0);
  const plRHalf     = 1.0 - plRMid;
  const outerStrength = BASE_OUTER_STRENGTH * outerScale;
  const innerStrength = BASE_INNER_STRENGTH * innerScale;
  const maxDistSq     = influenceRadius * influenceRadius;
  const broadphaseSq  = (influenceRadius + BROADPHASE_SLACK) ** 2;

  // Expose physics for tickMovement
  _activeFriction    = friction;
  _activeMaxVelocity = maxVelocity;

  const lastDiag        = 2 * (N - 1);
  const fadeInEndMs     = lastDiag * CELL_STAGGER_MS + CELL_FADE_MS;
  const holdEndMs       = fadeInEndMs + HOLD_MS;
  const totalDurationMs = holdEndMs + lastDiag * CELL_STAGGER_MS + CELL_FADE_MS;

  _state = {
    variants, matrix, elapsedMs: 0, totalDurationMs,
    lastDiag, fadeInEndMs, holdEndMs, done: false,
    profileId, profileName: params.displayName,
    protectedRadius, influenceRadius, maxDistSq, broadphaseSq,
    outerStrength, innerStrength, plRMin, plRMid, plRHalf,
    friction, maxVelocity,
  };
}

// ── Public: tick ──────────────────────────────────────────────────────────────

/** Advance the animation clock.  Call once per frame from rpg-render-update.ts. */
export function tickParticleLifeMatrix(deltaMs: number): void {
  if (!_state || _state.done) return;
  _state.elapsedMs += deltaMs;
  if (_state.elapsedMs >= _state.totalDurationMs) _state.done = true;
}

// ── Public: physics ───────────────────────────────────────────────────────────

/**
 * Apply particle-life cross-group forces to all alive aliven particles.
 *
 * For each ordered pair of groups (A, B) where A ≠ B:
 *   matrix[A.variantIdx][B.variantIdx] drives attraction/repulsion from each B
 *   particle onto each A particle.  Positive = A is attracted toward B.
 *
 * Force curve — canonical smooth particle-life tent; continuous at both boundaries:
 *   inner zone (d < plRMin): repulsion that decays to 0 at plRMin
 *   outer zone (plRMin ≤ d ≤ 1): tent function, 0 at rMin, peak at rMid, 0 at 1
 *
 * Broadphase: group pairs whose centroids are > broadphaseSq apart are skipped
 * before the O(n²) particle loop.  With the Impetus group cap (≤3 groups,
 * ≤18 particles each), worst-case pair checks are bounded at ~324/frame.
 *
 * Safe to call unconditionally — exits immediately when no Impetus matrix is active.
 */
export function applyParticleLifeForces(groups: AlivenParticleGroup[], deltaMs: number): void {
  if (!_state || groups.length < 2) return;

  const t0 = performance.now();
  let pairChecks = 0;

  const {
    variants, matrix, maxDistSq, broadphaseSq,
    outerStrength, innerStrength, plRMin, plRMid, plRHalf, influenceRadius,
  } = _state;

  // Cache variant indices once — avoids O(V) indexOf in the inner loop.
  const groupVariantIdx = groups.map(g => variants.indexOf(g.variantId));

  for (let ai = 0; ai < groups.length; ai++) {
    const gA = groups[ai];
    if (gA.aliveCount === 0) continue;
    const siA = groupVariantIdx[ai];
    if (siA < 0) continue;

    for (let bi = 0; bi < groups.length; bi++) {
      if (ai === bi) continue;
      const gB = groups[bi];
      if (gB.aliveCount === 0) continue;
      const siB = groupVariantIdx[bi];
      if (siB < 0) continue;

      // Group-level broadphase: skip when centroids are too far apart.
      const cdx = gB.cx - gA.cx, cdy = gB.cy - gA.cy;
      if (cdx * cdx + cdy * cdy > broadphaseSq) continue;

      const coeff = matrix[siA][siB];

      for (const pA of gA.particles) {
        if (!pA.isAlive) continue;
        for (const pB of gB.particles) {
          if (!pB.isAlive) continue;
          const dx = pB.x - pA.x, dy = pB.y - pA.y;
          const distSq = dx * dx + dy * dy;
          if (distSq > maxDistSq || distSq < 0.0001) continue;

          pairChecks++;
          const dist = Math.sqrt(distSq);
          const nx = dx / dist, ny = dy / dist;

          // Canonical smooth particle-life force curve — continuous at d = plRMin.
          const d = dist / influenceRadius;
          let force: number;
          if (d < plRMin) {
            // Inner repulsion: peaks at center, smoothly falls to 0 at plRMin.
            force = -(1.0 - d / plRMin) * innerStrength;
          } else {
            // Outer tent: 0 at plRMin, peak coeff·outerStrength at plRMid, 0 at 1.
            const tent = 1.0 - Math.abs(d - plRMid) / plRHalf;
            force = coeff * tent * outerStrength;
          }

          pA.vx += nx * force * deltaMs;
          pA.vy += ny * force * deltaMs;
        }
      }
    }
  }

  _telPairChecks = pairChecks;
  _telLastMs     = performance.now() - t0;
}

// ── Public: draw ──────────────────────────────────────────────────────────────

/**
 * Draw the particle-life interaction matrix as a faint background overlay.
 * Cells fade in along diagonals (top-left → bottom-right), hold, then fade out.
 * A profile name label appears above the matrix header.
 *
 * Expects canvas2d to already be translated to the viewport origin.
 */
export function drawImpetusParticleLifeMatrix(
  canvas2d: CanvasRenderingContext2D,
  widthPx: number,
  heightPx: number,
): void {
  if (!_state || _state.done) return;
  const { variants, matrix, elapsedMs, holdEndMs, profileName } = _state;
  const N = variants.length;
  if (N === 0) return;

  // ── Layout ──────────────────────────────────────────────────────────────────

  const marginX    = 20;
  const rowLabelW  = 44;
  const colLabelH  = 30;
  const profileLabelH = 14;
  const maxCellPx  = 54;
  const availW     = widthPx - 2 * marginX - rowLabelW;
  const cellW      = Math.min(maxCellPx, Math.floor(availW / N));
  const cellH      = cellW;
  const matrixW    = rowLabelW + cellW * N;
  const originX    = Math.floor((widthPx - matrixW) / 2);
  const originY    = Math.floor(heightPx * 0.12) + profileLabelH;

  // ── Cell alpha helper ────────────────────────────────────────────────────────

  function cellAlpha(row: number, col: number): number {
    const diag         = row + col;
    const fadeInStart  = diag * CELL_STAGGER_MS;
    const fadeInEnd    = fadeInStart + CELL_FADE_MS;
    const fadeOutStart = holdEndMs + diag * CELL_STAGGER_MS;
    const fadeOutEnd   = fadeOutStart + CELL_FADE_MS;

    if (elapsedMs < fadeInStart)  return 0;
    if (elapsedMs < fadeInEnd)    return (elapsedMs - fadeInStart) / CELL_FADE_MS;
    if (elapsedMs < fadeOutStart) return 1;
    if (elapsedMs < fadeOutEnd)   return 1 - (elapsedMs - fadeOutStart) / CELL_FADE_MS;
    return 0;
  }

  canvas2d.save();

  // ── Profile name label (above column headers) ─────────────────────────────

  const hdrAlpha = cellAlpha(0, 0);
  if (hdrAlpha > 0.005) {
    canvas2d.globalAlpha  = hdrAlpha * 0.55;
    canvas2d.fillStyle    = '#9090c0';
    canvas2d.font         = 'bold 8px monospace';
    canvas2d.textAlign    = 'left';
    canvas2d.textBaseline = 'top';
    canvas2d.fillText(
      `profile: ${profileName}`,
      originX,
      originY - profileLabelH - 2,
    );
  }

  // ── "src \ tgt" header ───────────────────────────────────────────────────────

  if (hdrAlpha > 0.005) {
    canvas2d.globalAlpha  = hdrAlpha * 0.45;
    canvas2d.fillStyle    = '#7070a0';
    canvas2d.font         = 'bold 8px monospace';
    canvas2d.textAlign    = 'right';
    canvas2d.textBaseline = 'bottom';
    canvas2d.fillText('src \\ tgt', originX + rowLabelW - 3, originY + colLabelH - 3);
  }

  // ── Column headers ────────────────────────────────────────────────────────────

  for (let col = 0; col < N; col++) {
    const a = cellAlpha(0, col);
    if (a <= 0.005) continue;
    const cx   = originX + rowLabelW + col * cellW + cellW / 2;
    const cy   = originY + colLabelH / 2;
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
    const rx   = originX + rowLabelW - 5;
    const ry   = originY + colLabelH + row * cellH + cellH / 2;
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

      const cx      = originX + rowLabelW + col * cellW;
      const cy      = originY + colLabelH + row * cellH;
      const val     = matrix[row][col];
      const absVal  = Math.abs(val);
      const maxCoeff = PROFILES[_state.profileId].coeffMax;
      const intensity = maxCoeff > 0 ? absVal / maxCoeff : 0;

      // Background: green for attraction, red for repulsion
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

      if (row === col) {
        canvas2d.globalAlpha = a * 0.10;
        canvas2d.fillStyle   = '#ffffff';
        canvas2d.fillRect(cx, cy, cellW - 1, cellH - 1);
      }

      const valStr = (val >= 0 ? '+' : '') + val.toFixed(2);
      canvas2d.globalAlpha  = a * 0.75;
      canvas2d.fillStyle    = '#d8d8e8';
      canvas2d.font         = `${Math.max(8, Math.min(11, Math.floor(cellW * 0.20)))}px monospace`;
      canvas2d.textAlign    = 'center';
      canvas2d.textBaseline = 'middle';
      canvas2d.fillText(valStr, cx + cellW / 2, cy + cellH / 2);
    }
  }

  // ── Separator lines ───────────────────────────────────────────────────────────

  const lineAlpha = cellAlpha(0, 0);
  if (lineAlpha > 0.005) {
    canvas2d.globalAlpha = lineAlpha * 0.25;
    canvas2d.strokeStyle = '#6060a0';
    canvas2d.lineWidth   = 0.5;
    canvas2d.beginPath();
    canvas2d.moveTo(originX + rowLabelW, originY + colLabelH);
    canvas2d.lineTo(originX + rowLabelW + cellW * N, originY + colLabelH);
    canvas2d.stroke();
    canvas2d.beginPath();
    canvas2d.moveTo(originX + rowLabelW, originY + colLabelH);
    canvas2d.lineTo(originX + rowLabelW, originY + colLabelH + cellH * N);
    canvas2d.stroke();
  }

  canvas2d.restore();
}
