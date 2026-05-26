/**
 * rpg-procedural-fish-draw.ts — Canvas rendering for the 8 fish creature types
 * and fish-related projectiles/hazards.
 *
 * Fish share a common silhouette renderer (drawProceduralFishSilhouette) which
 * handles a segmented-spine traveling-wave animation, pectoral fins, tail shape,
 * and glow.  Per-species draw functions layer species-specific details on top.
 *
 * Animation model
 * ───────────────
 * A chain of N spine segments runs from head (t=0) to tail (t=1).  Each frame,
 * a traveling wave is applied to the y-coordinate of each segment:
 *
 *   cy = sin(animPhase * freq − t * waveTravel) * amplitude * pow(t, ampPower)
 *
 * The amplitude grows from near-zero at the head to full amplitude at the tail,
 * matching how real fish swim.  Normals are computed from centred differences,
 * and left/right edge arrays are built from (cx ± nx*r, cy ± ny*r).
 * The body silhouette is a smooth midpoint-bezier path over those edge arrays.
 * Fins and tail attach to the spine at anatomically correct positions and inherit
 * the local spine direction, so fins always sweep toward the tail.
 *
 * Extracted from rpg-procedural-draw.ts to keep that file manageable.
 */

import type {
  SandFishEnemy, QuartzFishEnemy, RubyFishEnemy, SunstoneFishEnemy,
  EmeraldFishEnemy, SapphireFishEnemy, AmethystFishEnemy, DiamondFishEnemy,
  FishMine, FishSpike, FishBolt, FishDecoy,
} from './rpg-procedural-types';
import {
  SANDFISH_SIZE, SANDFISH_COLOR, SANDFISH_GLOW,
  QUARTZFISH_SIZE, QUARTZFISH_COLOR, QUARTZFISH_GLOW,
  RUBYFISH_SIZE, RUBYFISH_COLOR, RUBYFISH_GLOW,
  SUNSTONEFISH_SIZE, SUNSTONEFISH_COLOR, SUNSTONEFISH_GLOW,
  EMERALDFISH_SIZE, EMERALDFISH_MINI_SIZE, EMERALDFISH_COLOR, EMERALDFISH_GLOW,
  SAPPHIREFISH_SIZE, SAPPHIREFISH_COLOR, SAPPHIREFISH_GLOW,
  AMETHYSTFISH_SIZE, AMETHYSTFISH_COLOR, AMETHYSTFISH_GLOW,
  DIAMONDFISH_SIZE, DIAMONDFISH_COLOR, DIAMONDFISH_GLOW,
} from './rpg-procedural-constants';

// ── Low-graphics flag ──────────────────────────────────────────────────────────
let isLowGraphicsMode = false;
export function setFishDrawLowGraphics(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Shared draw helpers ────────────────────────────────────────────────────────
function applyGlow(ctx: CanvasRenderingContext2D, color: string, blur: number): void {
  if (isLowGraphicsMode) return;
  ctx.shadowBlur  = blur;
  ctx.shadowColor = color;
}
function clearGlow(ctx: CanvasRenderingContext2D): void {
  ctx.shadowBlur = 0;
}

/** HP-bar fraction 0–1. */
function hpFrac(e: { hp: number; maxHp: number }): number {
  return e.maxHp > 0 ? Math.max(0, e.hp / e.maxHp) : 0;
}

/** Draw a small hit-flash overlay (white circle, fades quickly). */
function drawHitFlash(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, flashMs: number,
): void {
  if (flashMs <= 0 || isLowGraphicsMode) return;
  ctx.save();
  ctx.globalAlpha = Math.min(flashMs / 80, 1) * 0.7;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath(); ctx.arc(x, y, r * 1.2, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
}

/** Draw an HP bar 2 px tall below the enemy. */
function drawHpBar(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, r: number, frac: number,
): void {
  const w = r * 2.5, h = 2, bx = x - w / 2, by = y + r + 2;
  ctx.fillStyle = '#333';
  ctx.fillRect(bx, by, w, h);
  ctx.fillStyle = frac > 0.5 ? '#44ff44' : frac > 0.25 ? '#ffaa00' : '#ff3333';
  ctx.fillRect(bx, by, w * frac, h);
}

// ── Fish visual-profile system ─────────────────────────────────────────────────

/**
 * Visual and animation parameters for one fish species.
 * All width/length values are expressed as multipliers of the species' `size`
 * constant so that they scale correctly regardless of base size.
 */
interface FishVisualProfile {
  // ── Body shape ──────────────────────────────────────────────────────────────
  /** Total spine length multiplier; 1.0 = standard, 1.3 = eel-like. */
  bodyLength: number;
  /** Head half-width as fraction of size. */
  headWidth: number;
  /** Widest body half-width as fraction of size. */
  bodyWidth: number;
  /** Tail-peduncle half-width as fraction of size (narrow). */
  tailWidth: number;
  /** Spine t-value [0,1] where body is widest (0 = head, 1 = tail). */
  bodyPeakT: number;
  /** Number of spine segments; valid range 6–12. */
  segmentCount: number;

  // ── Swim animation ──────────────────────────────────────────────────────────
  /** Wave frequency in rad/s (animPhase increments in seconds). */
  swimFrequency: number;
  /** Base amplitude of the traveling wave as fraction of size. */
  swimAmplitude: number;
  /** Spatial frequency of the wave along the spine (higher = more curvature). */
  waveTravel: number;
  /** Extra amplitude boost factor applied to the last 25 % of the spine. */
  tailAmplMult: number;
  /** Power-curve exponent controlling how quickly amplitude rises toward tail. */
  amplitudePower: number;

  // ── Tail ────────────────────────────────────────────────────────────────────
  tailShape: 'forked' | 'roundedFan' | 'pointed' | 'crescent';
  /** How far the tail projects beyond the last spine segment, as fraction of size. */
  tailLength: number;
  /** Half-spread of tail lobes as fraction of size. */
  tailSpread: number;

  // ── Fins ────────────────────────────────────────────────────────────────────
  finShape: 'shortTriangle' | 'rounded' | 'longSwept';
  /** Outward reach of the pectoral fin as fraction of size. */
  pectoralLength: number;
  /** Backward sweep of the pectoral fin tip as fraction of size. */
  pectoralSweep: number;
  /** Dorsal-fin height as fraction of size; 0 = none. */
  dorsalFinLength: number;
}

// ── Per-species visual profiles ────────────────────────────────────────────────

/** SandFish — minnow/dart archetype: narrow, fast, forked tail. */
const SANDFISH_PROFILE: FishVisualProfile = {
  bodyLength: 1.00, headWidth: 0.20, bodyWidth: 0.43, tailWidth: 0.10,
  bodyPeakT: 0.36, segmentCount: 7,
  swimFrequency: 4.0, swimAmplitude: 0.30, waveTravel: 6.2,
  tailAmplMult: 2.0, amplitudePower: 1.8,
  tailShape: 'forked', tailLength: 0.55, tailSpread: 0.22,
  finShape: 'shortTriangle', pectoralLength: 0.28, pectoralSweep: 0.32,
  dorsalFinLength: 0,
};

/** QuartzFish — deep-body archetype: wide, slow, rounded fan tail, shield-bearer. */
const QUARTZFISH_PROFILE: FishVisualProfile = {
  bodyLength: 0.90, headWidth: 0.30, bodyWidth: 0.65, tailWidth: 0.14,
  bodyPeakT: 0.40, segmentCount: 7,
  swimFrequency: 2.0, swimAmplitude: 0.27, waveTravel: 4.5,
  tailAmplMult: 1.7, amplitudePower: 2.0,
  tailShape: 'roundedFan', tailLength: 0.50, tailSpread: 0.35,
  finShape: 'rounded', pectoralLength: 0.32, pectoralSweep: 0.28,
  dorsalFinLength: 0,
};

/** RubyFish — sharp predatory archetype: angular, medium-fast, pointed tail, dasher. */
const RUBYFISH_PROFILE: FishVisualProfile = {
  bodyLength: 1.08, headWidth: 0.22, bodyWidth: 0.50, tailWidth: 0.11,
  bodyPeakT: 0.38, segmentCount: 8,
  swimFrequency: 3.2, swimAmplitude: 0.33, waveTravel: 5.5,
  tailAmplMult: 1.9, amplitudePower: 1.6,
  tailShape: 'pointed', tailLength: 0.58, tailSpread: 0.14,
  finShape: 'longSwept', pectoralLength: 0.32, pectoralSweep: 0.42,
  dorsalFinLength: 0,
};

/** SunstoneFish — deep-body reef archetype: widest, slowest, fan tail, mine-layer. */
const SUNSTONEFISH_PROFILE: FishVisualProfile = {
  bodyLength: 0.88, headWidth: 0.32, bodyWidth: 0.70, tailWidth: 0.16,
  bodyPeakT: 0.42, segmentCount: 7,
  swimFrequency: 1.8, swimAmplitude: 0.25, waveTravel: 4.0,
  tailAmplMult: 1.6, amplitudePower: 2.2,
  tailShape: 'roundedFan', tailLength: 0.52, tailSpread: 0.38,
  finShape: 'rounded', pectoralLength: 0.35, pectoralSweep: 0.25,
  dorsalFinLength: 0,
};

/** EmeraldFish — teardrop/compact archetype: mid-speed, forked tail, splitter. */
const EMERALDFISH_PROFILE: FishVisualProfile = {
  bodyLength: 0.95, headWidth: 0.26, bodyWidth: 0.52, tailWidth: 0.11,
  bodyPeakT: 0.38, segmentCount: 7,
  swimFrequency: 2.8, swimAmplitude: 0.32, waveTravel: 5.5,
  tailAmplMult: 1.8, amplitudePower: 1.7,
  tailShape: 'forked', tailLength: 0.52, tailSpread: 0.24,
  finShape: 'shortTriangle', pectoralLength: 0.28, pectoralSweep: 0.30,
  dorsalFinLength: 0,
};

/** SapphireFish — eel-like archetype: long thin body, ribbon wave, bolt-shooter. */
const SAPPHIREFISH_PROFILE: FishVisualProfile = {
  bodyLength: 1.30, headWidth: 0.16, bodyWidth: 0.35, tailWidth: 0.07,
  bodyPeakT: 0.30, segmentCount: 10,
  swimFrequency: 3.2, swimAmplitude: 0.40, waveTravel: 8.0,
  tailAmplMult: 1.5, amplitudePower: 1.2,
  tailShape: 'pointed', tailLength: 0.45, tailSpread: 0.12,
  finShape: 'shortTriangle', pectoralLength: 0.20, pectoralSweep: 0.22,
  dorsalFinLength: 0,
};

/** AmethystFish — round-small archetype: compact, gentle bob, teleporter. */
const AMETHYSTFISH_PROFILE: FishVisualProfile = {
  bodyLength: 0.88, headWidth: 0.30, bodyWidth: 0.60, tailWidth: 0.14,
  bodyPeakT: 0.38, segmentCount: 7,
  swimFrequency: 2.2, swimAmplitude: 0.25, waveTravel: 4.5,
  tailAmplMult: 1.6, amplitudePower: 1.9,
  tailShape: 'roundedFan', tailLength: 0.46, tailSpread: 0.30,
  finShape: 'rounded', pectoralLength: 0.28, pectoralSweep: 0.24,
  dorsalFinLength: 0,
};

/** DiamondFish — large predatory archetype: crescent tail, swept fins, armor plating. */
const DIAMONDFISH_PROFILE: FishVisualProfile = {
  bodyLength: 1.15, headWidth: 0.25, bodyWidth: 0.54, tailWidth: 0.12,
  bodyPeakT: 0.36, segmentCount: 8,
  swimFrequency: 2.6, swimAmplitude: 0.29, waveTravel: 5.2,
  tailAmplMult: 2.0, amplitudePower: 1.8,
  tailShape: 'crescent', tailLength: 0.60, tailSpread: 0.28,
  finShape: 'longSwept', pectoralLength: 0.34, pectoralSweep: 0.44,
  dorsalFinLength: 0,
};

// ── Spine segment and pre-allocated buffers ────────────────────────────────────

/** One point along the procedural fish spine. */
interface SpineSegment {
  cx: number;   // center x in local space (fish faces +X)
  cy: number;   // center y (wave-displaced)
  r:  number;   // body half-width at this segment
  nx: number;   // spine normal x (90° CCW from head→tail tangent)
  ny: number;   // spine normal y
}

const _MAX_SEGS = 12;
const _segs: SpineSegment[] = Array.from({ length: _MAX_SEGS }, () => (
  { cx: 0, cy: 0, r: 0, nx: 0, ny: 1 }
));
// Left and right body-edge arrays (in local fish space)
const _topX = new Float32Array(_MAX_SEGS);  // top edge x  (normal direction)
const _topY = new Float32Array(_MAX_SEGS);  // top edge y
const _botX = new Float32Array(_MAX_SEGS);  // bottom edge x (anti-normal)
const _botY = new Float32Array(_MAX_SEGS);  // bottom edge y

// ── Spine helpers ──────────────────────────────────────────────────────────────

/**
 * Smoothstep body half-width at spine position t [0,1].
 * Interpolates headWidth → bodyWidth → tailWidth using a smooth S-curve.
 */
function getBodyHalfWidth(t: number, p: FishVisualProfile): number {
  if (t <= p.bodyPeakT) {
    const u = p.bodyPeakT > 0 ? t / p.bodyPeakT : 1;
    const s = u * u * (3 - 2 * u);
    return p.headWidth + (p.bodyWidth - p.headWidth) * s;
  }
  const u = p.bodyPeakT < 1 ? (t - p.bodyPeakT) / (1 - p.bodyPeakT) : 1;
  const s = u * u * (3 - 2 * u);
  return p.bodyWidth + (p.tailWidth - p.bodyWidth) * s;
}

/**
 * Build the spine for a fish drawn in local space (fish faces +X).
 * Writes N segments into the pre-allocated _segs, _topX/Y, _botX/Y arrays.
 *
 * @param s        base size constant for this species
 * @param phase    current animPhase (in seconds)
 * @param p        visual profile
 * @param N        number of segments (from p.segmentCount)
 * @param ampScale amplitude scale factor (e.g. 0.2 during ruby dash)
 * @param overrideFreq  optional frequency override (e.g. fast-twitch mini)
 */
function buildFishSpine(
  s: number,
  phase: number,
  p: FishVisualProfile,
  N: number,
  ampScale: number,
  overrideFreq?: number,
): void {
  const xHead = s * 0.95;
  const xTail = -(s * 0.90 * p.bodyLength);
  const freq  = overrideFreq ?? p.swimFrequency;
  const wavePhase = phase * freq;

  for (let i = 0; i < N; i++) {
    const t  = i / (N - 1);                         // 0 = head, 1 = tail
    const cx = xHead + (xTail - xHead) * t;

    // Traveling-wave y displacement: amplitude grows from 0 at head to peak at tail
    const baseAmp  = s * p.swimAmplitude * ampScale * Math.pow(t, p.amplitudePower);
    const tailMult = t > 0.75 ? 1 + ((t - 0.75) / 0.25) * (p.tailAmplMult - 1) : 1;
    const cy = Math.sin(wavePhase - t * p.waveTravel) * baseAmp * tailMult;

    _segs[i].cx = cx;
    _segs[i].cy = cy;
    _segs[i].r  = s * getBodyHalfWidth(t, p);
  }

  // Compute normals via centred differences (one-sided at end points)
  for (let i = 0; i < N; i++) {
    let dx: number, dy: number;
    if (i === 0) {
      dx = _segs[1].cx - _segs[0].cx;
      dy = _segs[1].cy - _segs[0].cy;
    } else if (i === N - 1) {
      dx = _segs[N - 1].cx - _segs[N - 2].cx;
      dy = _segs[N - 1].cy - _segs[N - 2].cy;
    } else {
      dx = _segs[i + 1].cx - _segs[i - 1].cx;
      dy = _segs[i + 1].cy - _segs[i - 1].cy;
    }
    const len = Math.sqrt(dx * dx + dy * dy) || 1;
    // 90° CCW from (dx,dy): (-dy, dx)
    _segs[i].nx = -dy / len;
    _segs[i].ny =  dx / len;
  }

  // Build left/right body-edge arrays
  for (let i = 0; i < N; i++) {
    const seg  = _segs[i];
    _topX[i] = seg.cx + seg.nx * seg.r;
    _topY[i] = seg.cy + seg.ny * seg.r;
    _botX[i] = seg.cx - seg.nx * seg.r;
    _botY[i] = seg.cy - seg.ny * seg.r;
  }
}

// ── Path helpers ───────────────────────────────────────────────────────────────

/**
 * Append a smooth midpoint-bezier curve through the pre-computed edge array.
 * The canvas path must already be positioned at xs[from], ys[from].
 * Draws from index `from` to index `to`; `to` may be greater or less than `from`.
 */
function appendSmoothEdge(
  ctx: CanvasRenderingContext2D,
  xs: Float32Array,
  ys: Float32Array,
  from: number,
  to: number,
): void {
  const n    = Math.abs(to - from);
  const step = from < to ? 1 : -1;
  if (n === 0) return;
  if (n === 1) { ctx.lineTo(xs[to], ys[to]); return; }

  // Advance to midpoint of first segment, then use midpoint-bezier for interior,
  // and lineTo the final endpoint.
  ctx.lineTo((xs[from] + xs[from + step]) * 0.5, (ys[from] + ys[from + step]) * 0.5);
  const last = to - step;
  for (let i = from + step; i !== last; i += step) {
    ctx.quadraticCurveTo(xs[i], ys[i],
      (xs[i] + xs[i + step]) * 0.5, (ys[i] + ys[i + step]) * 0.5);
  }
  ctx.quadraticCurveTo(xs[last], ys[last], xs[to], ys[to]);
}

/**
 * Append the tail shape for the current profile.
 * The canvas path must already be at _topX[N-1], _topY[N-1].
 * After returning, the path ends at _botX[N-1], _botY[N-1].
 */
function appendTailSection(
  ctx: CanvasRenderingContext2D,
  N: number,
  s: number,
  p: FishVisualProfile,
): void {
  const seg = _segs[N - 1];

  // Spine tangent at tail (head→tail direction): rotate normal 90° CW = (ny, -nx)
  const tdx = seg.ny;    // x component of head→tail direction
  const tdy = -seg.nx;   // y component

  // Spine normal (perpendicular, "top" side)
  const tnx = seg.nx;
  const tny = seg.ny;

  const tLen = s * p.tailLength;
  const tSpd = s * p.tailSpread;

  // Tail-base edge points
  const bTX = _topX[N - 1];
  const bTY = _topY[N - 1];
  const bBX = _botX[N - 1];
  const bBY = _botY[N - 1];

  // Apex = center of where tail lobes extend to
  const apX = seg.cx + tdx * tLen;
  const apY = seg.cy + tdy * tLen;

  switch (p.tailShape) {
    case 'forked': {
      // Two lobes with a notch between them
      const uTipX = apX + tnx * tSpd;
      const uTipY = apY + tny * tSpd;
      const lTipX = apX - tnx * tSpd;
      const lTipY = apY - tny * tSpd;
      const nX = seg.cx + tdx * (tLen * 0.52);
      const nY = seg.cy + tdy * (tLen * 0.52);

      // Top edge → upper lobe
      ctx.bezierCurveTo(
        bTX + tdx * tLen * 0.45, bTY + tdy * tLen * 0.45,
        uTipX - tdx * tLen * 0.12, uTipY - tdy * tLen * 0.12,
        uTipX, uTipY,
      );
      // Upper lobe → notch (concave)
      ctx.bezierCurveTo(
        uTipX + tdx * tLen * 0.08, uTipY + tdy * tLen * 0.08,
        nX + tnx * tSpd * 0.25, nY + tny * tSpd * 0.25,
        nX, nY,
      );
      // Notch → lower lobe
      ctx.bezierCurveTo(
        nX - tnx * tSpd * 0.25, nY - tny * tSpd * 0.25,
        lTipX + tdx * tLen * 0.08, lTipY + tdy * tLen * 0.08,
        lTipX, lTipY,
      );
      // Lower lobe → bottom edge
      ctx.bezierCurveTo(
        lTipX - tdx * tLen * 0.12, lTipY - tdy * tLen * 0.12,
        bBX + tdx * tLen * 0.45, bBY + tdy * tLen * 0.45,
        bBX, bBY,
      );
      break;
    }

    case 'roundedFan': {
      // Wide rounded fan; three arcs — upper, mid (bulge), lower
      const fanTX = apX + tnx * tSpd;        // upper fan tip
      const fanTY = apY + tny * tSpd;
      const fanBX = apX - tnx * tSpd;        // lower fan tip
      const fanBY = apY - tny * tSpd;

      ctx.bezierCurveTo(
        bTX + tdx * tLen * 0.55, bTY + tdy * tLen * 0.55,
        fanTX - tdx * tLen * 0.08, fanTY - tdy * tLen * 0.08,
        fanTX, fanTY,
      );
      // Fan arc from top lobe to bottom lobe (bulges outward in tail direction)
      ctx.bezierCurveTo(
        fanTX + tdx * tLen * 0.22, fanTY + tdy * tLen * 0.22,
        fanBX + tdx * tLen * 0.22, fanBY + tdy * tLen * 0.22,
        fanBX, fanBY,
      );
      ctx.bezierCurveTo(
        fanBX - tdx * tLen * 0.08, fanBY - tdy * tLen * 0.08,
        bBX + tdx * tLen * 0.55, bBY + tdy * tLen * 0.55,
        bBX, bBY,
      );
      break;
    }

    case 'pointed': {
      // Single narrow point at the apex
      ctx.bezierCurveTo(
        bTX + tdx * tLen * 0.50, bTY + tdy * tLen * 0.50,
        apX + tnx * tSpd * 0.40, apY + tny * tSpd * 0.40,
        apX, apY,
      );
      ctx.bezierCurveTo(
        apX - tnx * tSpd * 0.40, apY - tny * tSpd * 0.40,
        bBX + tdx * tLen * 0.50, bBY + tdy * tLen * 0.50,
        bBX, bBY,
      );
      break;
    }

    case 'crescent': {
      // Swept crescent: tips extend further in the tail direction than the center
      const uCX = apX + tnx * tSpd + tdx * tLen * 0.22;
      const uCY = apY + tny * tSpd + tdy * tLen * 0.22;
      const lCX = apX - tnx * tSpd + tdx * tLen * 0.22;
      const lCY = apY - tny * tSpd + tdy * tLen * 0.22;
      const midX = seg.cx + tdx * tLen * 0.38;
      const midY = seg.cy + tdy * tLen * 0.38;

      ctx.bezierCurveTo(
        bTX + tdx * tLen * 0.32, bTY + tdy * tLen * 0.32,
        uCX - tdx * tLen * 0.18, uCY - tdy * tLen * 0.18,
        uCX, uCY,
      );
      ctx.bezierCurveTo(
        uCX + tdx * tLen * 0.12, uCY + tdy * tLen * 0.12,
        midX + tnx * tSpd * 0.18, midY + tny * tSpd * 0.18,
        midX, midY,
      );
      ctx.bezierCurveTo(
        midX - tnx * tSpd * 0.18, midY - tny * tSpd * 0.18,
        lCX + tdx * tLen * 0.12, lCY + tdy * tLen * 0.12,
        lCX, lCY,
      );
      ctx.bezierCurveTo(
        lCX - tdx * tLen * 0.18, lCY - tdy * tLen * 0.18,
        bBX + tdx * tLen * 0.32, bBY + tdy * tLen * 0.32,
        bBX, bBY,
      );
      break;
    }
  }
}

// ── Fin rendering ──────────────────────────────────────────────────────────────

/**
 * Draw two pectoral fins attached to the front third of the spine.
 *
 * Fin tip = finBase + outwardNormal * pectoralLength + spineForward * pectoralSweep
 *
 * Since spineForward points head→tail (i.e. toward -X for a fish facing +X), the
 * tip always sweeps toward the tail regardless of the fish's swimAngle.
 */
function drawFishPectoralFins(
  ctx: CanvasRenderingContext2D,
  N: number,
  s: number,
  p: FishVisualProfile,
  bodyColor: string,
): void {
  const finI = Math.max(1, Math.round(0.25 * (N - 1)));
  const seg  = _segs[finI];

  // Spine tangent at fin attachment (head→tail): (seg.ny, -seg.nx)
  const tx = seg.ny;
  const ty = -seg.nx;

  const pLen   = s * p.pectoralLength;
  const pSweep = s * p.pectoralSweep;
  const hw     = s * 0.11;    // half-width of fin base along the spine

  // Top fin base (on the normal/top edge)
  const tBX = _topX[finI];
  const tBY = _topY[finI];
  // Bottom fin base (on the anti-normal/bottom edge)
  const bBX = _botX[finI];
  const bBY = _botY[finI];

  // Fin tips: base + outward-normal * pLen + spineForward * pSweep
  const tTipX = tBX + seg.nx * pLen + tx * pSweep;
  const tTipY = tBY + seg.ny * pLen + ty * pSweep;
  const bTipX = bBX - seg.nx * pLen + tx * pSweep;
  const bTipY = bBY - seg.ny * pLen + ty * pSweep;

  ctx.save();
  ctx.fillStyle   = bodyColor;
  ctx.globalAlpha *= 0.65;

  switch (p.finShape) {
    case 'shortTriangle': {
      // Simple leaf / triangular fin
      ctx.beginPath();
      ctx.moveTo(tBX + tx * hw, tBY + ty * hw);
      ctx.lineTo(tTipX, tTipY);
      ctx.lineTo(tBX - tx * hw, tBY - ty * hw);
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(bBX + tx * hw, bBY + ty * hw);
      ctx.lineTo(bTipX, bTipY);
      ctx.lineTo(bBX - tx * hw, bBY - ty * hw);
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'rounded': {
      // Rounded oval fin using quadratic beziers
      ctx.beginPath();
      ctx.moveTo(tBX + tx * hw, tBY + ty * hw);
      ctx.quadraticCurveTo(
        tBX + seg.nx * pLen * 0.65 + tx * (pSweep * 0.25 - hw * 0.4),
        tBY + seg.ny * pLen * 0.65 + ty * (pSweep * 0.25 - hw * 0.4),
        tTipX, tTipY,
      );
      ctx.quadraticCurveTo(
        tBX + seg.nx * pLen * 0.45 + tx * (pSweep * 0.85 + hw * 0.4),
        tBY + seg.ny * pLen * 0.45 + ty * (pSweep * 0.85 + hw * 0.4),
        tBX - tx * hw, tBY - ty * hw,
      );
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(bBX + tx * hw, bBY + ty * hw);
      ctx.quadraticCurveTo(
        bBX - seg.nx * pLen * 0.65 + tx * (pSweep * 0.25 - hw * 0.4),
        bBY - seg.ny * pLen * 0.65 + ty * (pSweep * 0.25 - hw * 0.4),
        bTipX, bTipY,
      );
      ctx.quadraticCurveTo(
        bBX - seg.nx * pLen * 0.45 + tx * (pSweep * 0.85 + hw * 0.4),
        bBY - seg.ny * pLen * 0.45 + ty * (pSweep * 0.85 + hw * 0.4),
        bBX - tx * hw, bBY - ty * hw,
      );
      ctx.closePath();
      ctx.fill();
      break;
    }
    case 'longSwept': {
      // Long swept fin using cubic beziers — slender and angled toward tail
      ctx.beginPath();
      ctx.moveTo(tBX + tx * hw * 0.7, tBY + ty * hw * 0.7);
      ctx.bezierCurveTo(
        tBX + seg.nx * pLen * 0.42 + tx * pSweep * 0.08,
        tBY + seg.ny * pLen * 0.42 + ty * pSweep * 0.08,
        tTipX + seg.nx * pLen * 0.18 - tx * pSweep * 0.2,
        tTipY + seg.ny * pLen * 0.18 - ty * pSweep * 0.2,
        tTipX, tTipY,
      );
      ctx.bezierCurveTo(
        tTipX + tx * pSweep * 0.28, tTipY + ty * pSweep * 0.28,
        tBX + seg.nx * pLen * 0.28 + tx * pSweep * 0.72,
        tBY + seg.ny * pLen * 0.28 + ty * pSweep * 0.72,
        tBX - tx * hw * 0.7, tBY - ty * hw * 0.7,
      );
      ctx.closePath();
      ctx.fill();

      ctx.beginPath();
      ctx.moveTo(bBX + tx * hw * 0.7, bBY + ty * hw * 0.7);
      ctx.bezierCurveTo(
        bBX - seg.nx * pLen * 0.42 + tx * pSweep * 0.08,
        bBY - seg.ny * pLen * 0.42 + ty * pSweep * 0.08,
        bTipX - seg.nx * pLen * 0.18 - tx * pSweep * 0.2,
        bTipY - seg.ny * pLen * 0.18 - ty * pSweep * 0.2,
        bTipX, bTipY,
      );
      ctx.bezierCurveTo(
        bTipX + tx * pSweep * 0.28, bTipY + ty * pSweep * 0.28,
        bBX - seg.nx * pLen * 0.28 + tx * pSweep * 0.72,
        bBY - seg.ny * pLen * 0.28 + ty * pSweep * 0.72,
        bBX - tx * hw * 0.7, bBY - ty * hw * 0.7,
      );
      ctx.closePath();
      ctx.fill();
      break;
    }
  }

  ctx.restore();
}

/**
 * Draw subtle internal crystal-facet lines across the body.
 * Skipped entirely in low-graphics mode.  Uses segment positions for accuracy
 * during bending rather than the old flat-body bend function.
 */
function drawFishFacets(ctx: CanvasRenderingContext2D, N: number, s: number): void {
  ctx.save();
  ctx.strokeStyle = '#ffffff';
  ctx.lineWidth   = Math.max(0.5, s * 0.08);
  ctx.globalAlpha = 0.18;
  ctx.lineCap     = 'round';

  const hI  = Math.min(1, N - 1);
  const mI  = Math.round((N - 1) * 0.42);
  const mtI = Math.round((N - 1) * 0.62);

  ctx.beginPath();
  ctx.moveTo(_topX[hI], _topY[hI]);
  ctx.lineTo(_botX[mI], _botY[mI]);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(_botX[hI], _botY[hI]);
  ctx.lineTo(_topX[mtI], _topY[mtI]);
  ctx.stroke();

  ctx.restore();
}

// ── Core silhouette renderer ───────────────────────────────────────────────────

/** Options forwarded to the fish silhouette renderer. */
interface FishDrawOpts {
  /** Overall opacity [0–1]; undefined = fully opaque. */
  alpha?: number;
  /** When true, draw white diamond-armor facets inside the body. */
  diamond?: boolean;
  /** When true, reduce swim-bend amplitude (ruby dash: body straightens). */
  rubyDash?: boolean;
  /** When true, increase tail-beat frequency (mini emerald fish). */
  fastTwitch?: boolean;
}

/**
 * Draw a single fish in local space, then rotate by swimAngle.
 *
 * The fish faces +X in local space.  buildFishSpine() populates the pre-allocated
 * segment buffers with the traveling-wave deformation; pectoral fins are drawn
 * before the body (body overlaps their roots), and the tail section is appended
 * at the end of the body bezier path.
 */
function drawProceduralFishSilhouette(
  ctx: CanvasRenderingContext2D,
  x: number, y: number,
  size: number,
  swimAngle: number,
  animPhase: number,
  bodyColor: string,
  glowColor: string,
  profile: FishVisualProfile,
  opts?: FishDrawOpts,
): void {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(swimAngle);
  if (opts?.alpha !== undefined && opts.alpha < 1) ctx.globalAlpha = opts.alpha;

  const s = size;
  const N = profile.segmentCount;

  // Amplitude scale: straighten body during dash or light armour glow
  let ampScale = 1.0;
  if (opts?.rubyDash) ampScale = 0.18;
  if (opts?.diamond)  ampScale = 0.72;

  // Optional frequency override (mini emerald fast-twitch)
  const overrideFreq = opts?.fastTwitch ? profile.swimFrequency * 1.45 : undefined;

  buildFishSpine(s, animPhase, profile, N, ampScale, overrideFreq);

  // ── Pectoral fins (drawn first; body overlaps their roots) ──────────────────
  drawFishPectoralFins(ctx, N, s, profile, bodyColor);

  // ── Body silhouette ─────────────────────────────────────────────────────────
  applyGlow(ctx, glowColor, s + 4);
  ctx.fillStyle = bodyColor;
  ctx.beginPath();

  // Nose tip: head-segment center offset forward by one nose-length
  // Head "forward" direction is opposite to head→tail, i.e. = (-seg.ny, seg.nx)
  const hd = _segs[0];
  const noseTipX = hd.cx + (-hd.ny) * s * 0.14;
  const noseTipY = hd.cy + ( hd.nx) * s * 0.14;

  ctx.moveTo(noseTipX, noseTipY);

  // Nose cap → top edge of head segment (quadratic arc)
  ctx.quadraticCurveTo(
    hd.cx + hd.nx * hd.r * 1.1, hd.cy + hd.ny * hd.r * 1.1,
    _topX[0], _topY[0],
  );

  // Smooth top body edge: head → tail
  appendSmoothEdge(ctx, _topX, _topY, 0, N - 1);

  // Tail shape
  appendTailSection(ctx, N, s, profile);

  // Smooth bottom body edge: tail → head
  appendSmoothEdge(ctx, _botX, _botY, N - 1, 0);

  // Close back to nose tip via bottom nose-cap arc
  ctx.quadraticCurveTo(
    hd.cx - hd.nx * hd.r * 1.1, hd.cy - hd.ny * hd.r * 1.1,
    noseTipX, noseTipY,
  );

  ctx.closePath();
  ctx.fill();
  clearGlow(ctx);

  // ── Crystal facets (detail pass) ────────────────────────────────────────────
  if (!isLowGraphicsMode) {
    drawFishFacets(ctx, N, s);
  }

  // ── Diamond armor overlay ────────────────────────────────────────────────────
  if (opts?.diamond) {
    ctx.save();
    ctx.strokeStyle = '#ddfbff';
    ctx.lineWidth   = Math.max(0.7, s * 0.10);
    ctx.globalAlpha = 0.55;
    ctx.lineCap     = 'round';

    const midI  = Math.round((N - 1) * 0.45);
    const tailI = Math.round((N - 1) * 0.75);

    ctx.beginPath();
    ctx.moveTo(_topX[midI], _topY[midI]);
    ctx.lineTo(_botX[tailI], _botY[tailI]);
    ctx.stroke();

    const ms = _segs[midI];
    ctx.beginPath();
    ctx.moveTo(ms.cx, ms.cy - ms.r * 0.48);
    ctx.lineTo(ms.cx, ms.cy + ms.r * 0.48);
    ctx.stroke();

    ctx.restore();
  }

  ctx.restore();
}

// ── Per-species draw functions (public API) ────────────────────────────────────

export function drawSandFishEnemies(canvas: CanvasRenderingContext2D, enemies: SandFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, SANDFISH_SIZE, e.swimAngle, e.animPhase,
      SANDFISH_COLOR, SANDFISH_GLOW, SANDFISH_PROFILE);
    drawHitFlash(canvas, e.x, e.y, SANDFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SANDFISH_SIZE, hpFrac(e));
  }
}

export function drawQuartzFishEnemies(canvas: CanvasRenderingContext2D, enemies: QuartzFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, QUARTZFISH_SIZE, e.swimAngle, e.animPhase,
      QUARTZFISH_COLOR, QUARTZFISH_GLOW, QUARTZFISH_PROFILE);
    if (!e.shieldBroken && e.shieldHp > 0) {
      canvas.save();
      canvas.strokeStyle  = QUARTZFISH_GLOW;
      canvas.globalAlpha  = 0.6;
      canvas.lineWidth    = 1.5;
      canvas.beginPath();
      canvas.arc(e.x, e.y, QUARTZFISH_SIZE + 4, 0, Math.PI * 2);
      canvas.stroke();
      canvas.restore();
    }
    drawHitFlash(canvas, e.x, e.y, QUARTZFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, QUARTZFISH_SIZE, hpFrac(e));
  }
}

export function drawRubyFishEnemies(canvas: CanvasRenderingContext2D, enemies: RubyFishEnemy[]): void {
  for (const e of enemies) {
    const alpha    = e.dashState === 'windup' ? 0.65 : 1;
    const rubyDash = e.dashState === 'dash';
    drawProceduralFishSilhouette(canvas, e.x, e.y, RUBYFISH_SIZE, e.swimAngle, e.animPhase,
      RUBYFISH_COLOR, RUBYFISH_GLOW, RUBYFISH_PROFILE, { alpha, rubyDash });
    drawHitFlash(canvas, e.x, e.y, RUBYFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, RUBYFISH_SIZE, hpFrac(e));
  }
}

export function drawSunstoneFishEnemies(canvas: CanvasRenderingContext2D, enemies: SunstoneFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, SUNSTONEFISH_SIZE, e.swimAngle, e.animPhase,
      SUNSTONEFISH_COLOR, SUNSTONEFISH_GLOW, SUNSTONEFISH_PROFILE);
    drawHitFlash(canvas, e.x, e.y, SUNSTONEFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SUNSTONEFISH_SIZE, hpFrac(e));
  }
}

export function drawEmeraldFishEnemies(canvas: CanvasRenderingContext2D, enemies: EmeraldFishEnemy[]): void {
  for (const e of enemies) {
    const size = e.isMini ? EMERALDFISH_MINI_SIZE : EMERALDFISH_SIZE;
    drawProceduralFishSilhouette(canvas, e.x, e.y, size, e.swimAngle, e.animPhase,
      EMERALDFISH_COLOR, EMERALDFISH_GLOW, EMERALDFISH_PROFILE,
      { alpha: e.isMini ? 0.9 : 1, fastTwitch: e.isMini });
    drawHitFlash(canvas, e.x, e.y, size, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, size, hpFrac(e));
  }
}

export function drawSapphireFishEnemies(canvas: CanvasRenderingContext2D, enemies: SapphireFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, SAPPHIREFISH_SIZE, e.swimAngle, e.animPhase,
      SAPPHIREFISH_COLOR, SAPPHIREFISH_GLOW, SAPPHIREFISH_PROFILE);
    drawHitFlash(canvas, e.x, e.y, SAPPHIREFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, SAPPHIREFISH_SIZE, hpFrac(e));
  }
}

export function drawAmethystFishEnemies(canvas: CanvasRenderingContext2D, enemies: AmethystFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, AMETHYSTFISH_SIZE, e.swimAngle, e.animPhase,
      AMETHYSTFISH_COLOR, AMETHYSTFISH_GLOW, AMETHYSTFISH_PROFILE);
    drawHitFlash(canvas, e.x, e.y, AMETHYSTFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, AMETHYSTFISH_SIZE, hpFrac(e));
  }
}

export function drawDiamondFishEnemies(canvas: CanvasRenderingContext2D, enemies: DiamondFishEnemy[]): void {
  for (const e of enemies) {
    drawProceduralFishSilhouette(canvas, e.x, e.y, DIAMONDFISH_SIZE, e.swimAngle, e.animPhase,
      DIAMONDFISH_COLOR, DIAMONDFISH_GLOW, DIAMONDFISH_PROFILE, { diamond: e.armorActive });
    if (e.armorActive) {
      canvas.save();
      canvas.strokeStyle  = DIAMONDFISH_GLOW;
      canvas.globalAlpha  = 0.75;
      canvas.lineWidth    = 2;
      canvas.beginPath();
      canvas.arc(e.x, e.y, DIAMONDFISH_SIZE + 3, 0, Math.PI * 2);
      canvas.stroke();
      canvas.restore();
    }
    drawHitFlash(canvas, e.x, e.y, DIAMONDFISH_SIZE, e.hitFlashMs);
    drawHpBar(canvas, e.x, e.y, DIAMONDFISH_SIZE, hpFrac(e));
  }
}

// ── Projectile and hazard draw functions (unchanged) ──────────────────────────

export function drawFishMines(canvas: CanvasRenderingContext2D, mines: FishMine[]): void {
  for (const m of mines) {
    canvas.save();
    applyGlow(canvas, SUNSTONEFISH_GLOW, 6);
    canvas.globalAlpha = m.armedMs > 0 ? 0.75 : 1;
    canvas.fillStyle   = SUNSTONEFISH_COLOR;
    canvas.beginPath();
    canvas.arc(m.x, m.y, 4, 0, Math.PI * 2);
    canvas.fill();
    clearGlow(canvas);
    canvas.restore();
  }
}

export function drawFishSpikes(canvas: CanvasRenderingContext2D, spikes: FishSpike[]): void {
  for (const sp of spikes) {
    canvas.save();
    canvas.translate(sp.x, sp.y);
    canvas.rotate(Math.atan2(sp.vy, sp.vx));
    canvas.fillStyle = SUNSTONEFISH_GLOW;
    canvas.beginPath();
    canvas.moveTo(5, 0);
    canvas.lineTo(-4, -2);
    canvas.lineTo(-4,  2);
    canvas.closePath();
    canvas.fill();
    canvas.restore();
  }
}

export function drawFishBolts(canvas: CanvasRenderingContext2D, bolts: FishBolt[]): void {
  for (const b of bolts) {
    canvas.save();
    applyGlow(canvas, SAPPHIREFISH_GLOW, 6);
    canvas.fillStyle = SAPPHIREFISH_COLOR;
    canvas.beginPath();
    canvas.arc(b.x, b.y, 3, 0, Math.PI * 2);
    canvas.fill();
    clearGlow(canvas);
    canvas.restore();
  }
}

export function drawFishDecoys(canvas: CanvasRenderingContext2D, decoys: FishDecoy[]): void {
  for (const d of decoys) {
    const alpha = Math.max(0, d.lifeMs / 1500) * 0.5;
    drawProceduralFishSilhouette(canvas, d.x, d.y, AMETHYSTFISH_SIZE, d.swimAngle, d.animPhase,
      AMETHYSTFISH_COLOR, AMETHYSTFISH_GLOW, AMETHYSTFISH_PROFILE, { alpha });
  }
}
