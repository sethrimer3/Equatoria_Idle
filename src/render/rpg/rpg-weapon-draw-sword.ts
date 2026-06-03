/**
 * rpg-weapon-draw-sword.ts — Canvas draw functions for sword and sand blade visual effects.
 *
 * Extracted from rpg-weapon-draw.ts to keep that file focused on chain-whip
 * and vortex drawing.  Each function is a pure draw call: it takes an explicit
 * `ctx: CanvasRenderingContext2D` plus the state it needs.
 *
 * Sections:
 *   - drawSwordCombos     — diamond sword prismatic shards + swipe arcs + beam effects
 *   - drawSandBladeCombo  — starter sand blade (sand-colored shards + polygon trails)
 *
 * Sand drift pixels (2×2 px per swing) are in rpg-weapon-sand-drift.ts.
 */

import type { SwordComboState } from './rpg-types';
import {
  SWORD_PRISMATIC_COLORS, SWORD_SHARD_COUNT, SWORD_SHARD_SHAPES,
  SWORD_COMBO_SPIN_MS, SWORD_COMBO_SPIN_TURNS,
  SAND_BLADE_COLORS,
  EIGENSTEIN_SHARD_COUNT, EIGENSTEIN_BLADE_LENGTH_MULT, EIGENSTEIN_STABLE_SHARDS,
  EIGENSTEIN_OSCILLATION_AMP, EIGENSTEIN_OSCILLATION_FREQ, EIGENSTEIN_OSCILLATION_PHASE,
  EIGENSTEIN_BLADE_COLORS, EIGENSTEIN_HILT_COLOR, EIGENSTEIN_HILT_GLOW,
} from './rpg-weapon-constants';
import { getSwordLength, getShardDistances, getShardStyle } from './rpg-helpers';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for sword/sand draw functions (skips glow effects). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Diamond sword crescent constants ─────────────────────────────────────────
// Crescent arc profile: rises steeply to peak at 15% of the arc, then tapers
// slowly toward the back — creating a wider-front, thinner-back comet shape.
const DIAMOND_COMET_SEGS        = 20;
const DIAMOND_COMET_MIN_WIDTH   = 0.5;
const DIAMOND_COMET_MAX_WIDTH   = 7.0;
const DIAMOND_COMET_WIDTH_RANGE = DIAMOND_COMET_MAX_WIDTH - DIAMOND_COMET_MIN_WIDTH;

/** Width at normalized arc position t [0,1]: thin → quick peak at t=0.15 → slow taper. */
function _diamondCometWidth(t: number): number {
  return t < 0.15
    ? DIAMOND_COMET_MIN_WIDTH + DIAMOND_COMET_WIDTH_RANGE * (t / 0.15)
    : DIAMOND_COMET_MAX_WIDTH - DIAMOND_COMET_WIDTH_RANGE * ((t - 0.15) / 0.85);
}

// ── Diamond sword combos ──────────────────────────────────────────────────────

/**
 * Draws all active diamond sword combo states — prismatic shards, swipe arcs,
 * and prismatic beam effects.
 *
 * @param comboStates  Map from weaponId to SwordComboState.
 * @param mote         Player position (x, y).
 * @param weaponTiers  Map from weaponId to equipped tier (used for blade length).
 */
export function drawSwordCombos(
  ctx: CanvasRenderingContext2D,
  comboStates: Map<string, SwordComboState>,
  mote: { x: number; y: number },
  weaponTiers: Map<string, number>,
): void {
  for (const [weaponId, state] of comboStates) {
    const tier = weaponTiers.get(weaponId) ?? 1;
    const nowMs = Date.now();
    if (state.isEigensteinBlade) {
      drawEigensteinBlade(ctx, state, mote, tier, nowMs);
      continue;
    }
    const baseSwordLength = getSwordLength(tier);
    const isSpinCombo = state.phase === 'spin_combo';
    const swordLength = baseSwordLength;
    const dists = getShardDistances(swordLength);

    ctx.save();

    // ── D. Spin combo ring: draw a glowing 360° arc for each rotation tick ──
    if (isSpinCombo) {
      const spinT = Math.min(1, state.phaseMs / SWORD_COMBO_SPIN_MS);
      const ringAlpha = 0.55 + 0.4 * Math.abs(Math.sin(spinT * Math.PI * SWORD_COMBO_SPIN_TURNS));
      const numArcs = SWORD_PRISMATIC_COLORS.length;
      ctx.lineWidth = 3;
      for (let ci = 0; ci < numArcs; ci++) {
        const segStart = (ci / numArcs) * Math.PI * 2 + state.spinComboAngle;
        const segEnd   = segStart + (Math.PI * 2) / numArcs;
        ctx.globalAlpha = ringAlpha * 0.8;
        ctx.strokeStyle = SWORD_PRISMATIC_COLORS[ci];
        if (!isLowGraphicsMode) {
          ctx.shadowBlur  = 14; ctx.shadowColor = SWORD_PRISMATIC_COLORS[ci];
        }
        ctx.beginPath();
        ctx.arc(mote.x, mote.y, swordLength, segStart, segEnd);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.lineWidth = 1;
    }

    // ── A. Draw prismatic polygon shards ──────────────────────
    for (let i = 0; i < SWORD_SHARD_COUNT; i++) {
      const sx = mote.x + Math.cos(state.shardAngles[i]) * dists[i];
      const sy = mote.y + Math.sin(state.shardAngles[i]) * dists[i];
      const colorIdx = (i + Math.floor(nowMs / 60)) % SWORD_PRISMATIC_COLORS.length;
      const color = SWORD_PRISMATIC_COLORS[colorIdx];
      const { shapeIdx, radius } = getShardStyle(i);
      const verts = SWORD_SHARD_SHAPES[shapeIdx];
      const scaledRadius = isSpinCombo ? radius * 1.5 : radius;
      // Rotate the shard polygon to align with the blade angle.
      const cosA = Math.cos(state.shardAngles[i]);
      const sinA = Math.sin(state.shardAngles[i]);

      const shardAlpha = isSpinCombo ? 1.0 : (state.phase === 'swing' ? 1.0 : 0.85);
      ctx.globalAlpha = shardAlpha;
      ctx.fillStyle = color;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = (isSpinCombo ? 12 : 5) + (state.phase === 'swing' ? 4 : 0);
        ctx.shadowColor = color;
      }
      ctx.beginPath();
      for (let v = 0; v < verts.length; v++) {
        const [cu, su] = verts[v];
        const vx = sx + (cu * cosA - su * sinA) * scaledRadius;
        const vy = sy + (cu * sinA + su * cosA) * scaledRadius;
        if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // White core highlight for each shard.
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath(); ctx.arc(sx, sy, scaledRadius * 0.3, 0, Math.PI * 2); ctx.fill();
    }

    // ── B. Draw disconnected swipe-arc visuals (prismatic crescent) ────────────
    // Each crescent arc varies in lineWidth: thin at the leading edge, rising
    // quickly to a wide peak (~15% through), then slowly tapering to thin at
    // the trailing end — a wider-front comet profile.
    for (const fx of state.swipeEffects) {
      const elapsed   = fx.maxTimerMs - fx.timerMs;
      const lifeRatio = elapsed / fx.maxTimerMs;
      const baseAlpha = (1 - lifeRatio) * 0.9;
      const arcSpan   = fx.arcEnd - fx.arcStart;
      ctx.globalAlpha = baseAlpha;
      ctx.lineCap     = 'round';
      for (let seg = 0; seg < DIAMOND_COMET_SEGS; seg++) {
        const t0       = seg       / DIAMOND_COMET_SEGS;
        const t1       = (seg + 1) / DIAMOND_COMET_SEGS;
        const segW     = (_diamondCometWidth(t0) + _diamondCometWidth(t1)) * 0.5;
        const colorIdx = Math.floor(t0 * SWORD_PRISMATIC_COLORS.length) % SWORD_PRISMATIC_COLORS.length;
        const color    = SWORD_PRISMATIC_COLORS[colorIdx];
        ctx.lineWidth  = segW;
        ctx.strokeStyle = color;
        if (!isLowGraphicsMode) {
          ctx.shadowBlur = segW * 2; ctx.shadowColor = color;
        }
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.swordLength, fx.arcStart + arcSpan * t0, fx.arcStart + arcSpan * t1);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.lineCap = 'butt';
    }

    // ── C. Draw prismatic beam effects ─────────────────────────
    for (const beam of state.beamEffects) {
      const prog = beam.progress;
      if (prog >= 2) continue;

      let drawTailX: number, drawTailY: number;
      let drawTipX:  number, drawTipY:  number;
      let alpha: number;

      if (prog < 1) {
        drawTailX = beam.tailX;
        drawTailY = beam.tailY;
        drawTipX  = beam.tailX + (beam.tipX - beam.tailX) * prog;
        drawTipY  = beam.tailY + (beam.tipY - beam.tailY) * prog;
        alpha = 0.95;
      } else {
        const fadeT = prog - 1;
        drawTailX = beam.tailX + (beam.tipX - beam.tailX) * fadeT;
        drawTailY = beam.tailY + (beam.tipY - beam.tailY) * fadeT;
        drawTipX  = beam.tipX;
        drawTipY  = beam.tipY;
        alpha = 1 - fadeT * 0.9;
      }

      const bdx = drawTipX - drawTailX, bdy = drawTipY - drawTailY;
      const len = Math.sqrt(bdx * bdx + bdy * bdy);
      if (len < 0.1) continue;
      const nx = bdx / len, ny = bdy / len;
      const bpx = -ny, bpy = nx;

      const halfWidth = 1.0;
      const bcx = (drawTailX + drawTipX) * 0.5;
      const bcy = (drawTailY + drawTipY) * 0.5;

      const colorIdx3 = Math.floor(nowMs / 50) % SWORD_PRISMATIC_COLORS.length;
      const bColor = SWORD_PRISMATIC_COLORS[colorIdx3];

      ctx.globalAlpha = alpha;
      ctx.fillStyle = bColor;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = 10; ctx.shadowColor = bColor;
      }
      ctx.beginPath();
      ctx.moveTo(drawTailX, drawTailY);
      ctx.lineTo(bcx + bpx * halfWidth, bcy + bpy * halfWidth);
      ctx.lineTo(drawTipX, drawTipY);
      ctx.lineTo(bcx - bpx * halfWidth, bcy - bpy * halfWidth);
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.globalAlpha = alpha * 0.5;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.moveTo(drawTailX, drawTailY);
      ctx.lineTo(bcx + bpx * halfWidth * 0.4, bcy + bpy * halfWidth * 0.4);
      ctx.lineTo(drawTipX, drawTipY);
      ctx.lineTo(bcx - bpx * halfWidth * 0.4, bcy - bpy * halfWidth * 0.4);
      ctx.closePath();
      ctx.fill();
    }

    ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.lineWidth = 1;
    ctx.restore();
  }
}

// ── Eigenstein dimensional sword ──────────────────────────────────────────────

/**
 * Eigenstein blade draw: larger than diamond sword, stable hilt/crossguard,
 * constantly shifting blade polygons in inverted neon colors.
 * Also draws rift crack effects spawned on hit.
 */
function drawEigensteinBlade(
  ctx: CanvasRenderingContext2D,
  state: SwordComboState,
  mote: { x: number; y: number },
  tier: number,
  nowMs: number,
): void {
  const swordLength = getSwordLength(tier) * EIGENSTEIN_BLADE_LENGTH_MULT;
  const isSpinCombo = state.phase === 'spin_combo';

  // Blade segment distances — evenly distributed handle→tip.
  const handleDist = 5;
  const dists: number[] = [];
  for (let i = 0; i < EIGENSTEIN_SHARD_COUNT; i++) {
    dists.push(handleDist + (swordLength - handleDist) * (i / (EIGENSTEIN_SHARD_COUNT - 1)));
  }

  ctx.save();

  // ── Spin combo outer ring ───────────────────────────────────────────────────
  if (isSpinCombo) {
    const spinT = Math.min(1, state.phaseMs / SWORD_COMBO_SPIN_MS);
    const ringAlpha = 0.55 + 0.4 * Math.abs(Math.sin(spinT * Math.PI * SWORD_COMBO_SPIN_TURNS));
    ctx.lineWidth = 3.5;
    for (let ci = 0; ci < EIGENSTEIN_BLADE_COLORS.length; ci++) {
      const segStart = (ci / EIGENSTEIN_BLADE_COLORS.length) * Math.PI * 2 + state.spinComboAngle;
      const segEnd   = segStart + (Math.PI * 2) / EIGENSTEIN_BLADE_COLORS.length;
      ctx.globalAlpha = ringAlpha * 0.9;
      ctx.strokeStyle = EIGENSTEIN_BLADE_COLORS[ci] ?? '#cc00ff';
      if (!isLowGraphicsMode) {
        ctx.shadowBlur  = 18; ctx.shadowColor = EIGENSTEIN_BLADE_COLORS[ci] ?? '#cc00ff';
      }
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, swordLength, segStart, segEnd);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.lineWidth = 1;
  }

  // ── Blade shards ─────────────────────────────────────────────────────────────
  for (let i = 0; i < EIGENSTEIN_SHARD_COUNT; i++) {
    const isStable = i < EIGENSTEIN_STABLE_SHARDS;
    // Stable shards track the sword angle directly; blade shards oscillate.
    const baseAngle = state.shardAngles[i] ?? state.swordAngle;
    const oscillation = isStable
      ? 0
      : EIGENSTEIN_OSCILLATION_AMP * Math.sin(
          nowMs * EIGENSTEIN_OSCILLATION_FREQ + i * EIGENSTEIN_OSCILLATION_PHASE,
        );
    const angle = baseAngle + oscillation;

    const sx = mote.x + Math.cos(angle) * dists[i];
    const sy = mote.y + Math.sin(angle) * dists[i];
    const cosA = Math.cos(angle);
    const sinA = Math.sin(angle);

    // Hilt/crossguard shards: dark void fill, neon glow outline.
    if (isStable) {
      const hiltAlpha = isSpinCombo ? 1.0 : (state.phase === 'swing' ? 1.0 : 0.9);
      ctx.globalAlpha = hiltAlpha;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur  = 8; ctx.shadowColor = EIGENSTEIN_HILT_GLOW;
      }
      // Hilt rectangle (index 0-1) or crossguard bar (index 2).
      if (i === 1) {
        // Crossguard — perpendicular thick bar.
        const hw = 5, hh = 1.8;
        ctx.fillStyle = EIGENSTEIN_HILT_COLOR;
        ctx.beginPath();
        const verts: Array<[number, number]> = [[hw, -hh], [-hw, -hh], [-hw, hh], [hw, hh]];
        for (let v = 0; v < verts.length; v++) {
          const [ux, uy] = verts[v];
          const vx = sx + (ux * cosA - uy * sinA);
          const vy = sy + (ux * sinA + uy * cosA);
          if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        // Bright outline.
        ctx.strokeStyle = EIGENSTEIN_HILT_GLOW;
        ctx.lineWidth = 0.8;
        ctx.stroke();
        ctx.lineWidth = 1;
      } else {
        // Handle shards (index 0, 2) — small compact diamond.
        const r = 2.5;
        ctx.fillStyle = EIGENSTEIN_HILT_COLOR;
        ctx.beginPath();
        const pts: Array<[number, number]> = [[0, -r * 1.2], [r * 0.7, 0], [0, r * 1.2], [-r * 0.7, 0]];
        for (let v = 0; v < pts.length; v++) {
          const [ux, uy] = pts[v];
          const vx = sx + (ux * cosA - uy * sinA);
          const vy = sy + (ux * sinA + uy * cosA);
          if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.strokeStyle = EIGENSTEIN_HILT_GLOW;
        ctx.lineWidth = 0.6;
        ctx.stroke();
        ctx.lineWidth = 1;
      }
      ctx.shadowBlur = 0;
    } else {
      // Blade shards — neon inverted colors, flickering geometry.
      const bladeIdx = i - EIGENSTEIN_STABLE_SHARDS;
      const colorIdx = (bladeIdx + Math.floor(nowMs / 55)) % EIGENSTEIN_BLADE_COLORS.length;
      const color = EIGENSTEIN_BLADE_COLORS[colorIdx] ?? '#cc00ff';
      const shardAlpha = isSpinCombo ? 1.0 : (state.phase === 'swing' ? 0.95 : 0.82);
      ctx.globalAlpha = shardAlpha;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur  = 10 + (state.phase === 'swing' ? 6 : 0);
        ctx.shadowColor = color;
      }
      // Polygon shape cycles unpredictably for the "unstable" feel.
      const shapeChoice = (bladeIdx + Math.floor(nowMs / 120 + i * 3.7)) % SWORD_SHARD_SHAPES.length;
      const verts = SWORD_SHARD_SHAPES[shapeChoice];
      // Scale: blade tip shards are slightly larger.
      const baseRadius = 1.6 + (bladeIdx / (EIGENSTEIN_SHARD_COUNT - EIGENSTEIN_STABLE_SHARDS)) * 1.2;
      const scaledRadius = (isSpinCombo ? 1.5 : 1) * baseRadius;
      ctx.fillStyle = color;
      ctx.beginPath();
      for (let v = 0; v < verts.length; v++) {
        const [cu, su] = verts[v];
        const vx = sx + (cu * cosA - su * sinA) * scaledRadius;
        const vy = sy + (cu * sinA + su * cosA) * scaledRadius;
        if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;

      // Dark negative-space core inside each blade shard.
      ctx.globalAlpha = 0.45;
      ctx.fillStyle = '#000018';
      ctx.beginPath();
      ctx.arc(sx, sy, scaledRadius * 0.38, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Swipe arc (eigenstein crescent: dark with neon edges) ─────────────────
  for (const fx of state.swipeEffects) {
    const elapsed   = fx.maxTimerMs - fx.timerMs;
    const lifeRatio = elapsed / fx.maxTimerMs;
    const baseAlpha = (1 - lifeRatio) * 0.85;
    const arcSpan   = fx.arcEnd - fx.arcStart;
    const SEGS = 20;
    ctx.globalAlpha = baseAlpha;
    ctx.lineCap = 'round';
    for (let seg = 0; seg < SEGS; seg++) {
      const t0 = seg / SEGS;
      const segW = 1.5 + 8 * (t0 < 0.15 ? t0 / 0.15 : 1 - (t0 - 0.15) / 0.85);
      const cIdx = Math.floor(t0 * EIGENSTEIN_BLADE_COLORS.length) % EIGENSTEIN_BLADE_COLORS.length;
      const col = EIGENSTEIN_BLADE_COLORS[cIdx] ?? '#cc00ff';
      ctx.lineWidth  = segW;
      ctx.strokeStyle = col;
      if (!isLowGraphicsMode) { ctx.shadowBlur = segW * 2.5; ctx.shadowColor = col; }
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.swordLength, fx.arcStart + arcSpan * t0, fx.arcStart + arcSpan * (t0 + 1 / SEGS));
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.lineCap = 'butt';
  }

  // ── Beam effects (eigenstein: dark beam with neon outline) ───────────────
  for (const beam of state.beamEffects) {
    const prog = beam.progress;
    if (prog >= 2) continue;
    let drawTailX: number, drawTailY: number, drawTipX: number, drawTipY: number, alpha: number;
    if (prog < 1) {
      drawTailX = beam.tailX; drawTailY = beam.tailY;
      drawTipX  = beam.tailX + (beam.tipX - beam.tailX) * prog;
      drawTipY  = beam.tailY + (beam.tipY - beam.tailY) * prog;
      alpha = 0.95;
    } else {
      const fadeT = prog - 1;
      drawTailX = beam.tailX + (beam.tipX - beam.tailX) * fadeT;
      drawTailY = beam.tailY + (beam.tipY - beam.tailY) * fadeT;
      drawTipX  = beam.tipX; drawTipY = beam.tipY;
      alpha = 1 - fadeT * 0.9;
    }
    const bdx = drawTipX - drawTailX, bdy = drawTipY - drawTailY;
    const len = Math.sqrt(bdx * bdx + bdy * bdy);
    if (len < 0.1) continue;
    const nx = bdx / len, ny = bdy / len;
    const bpx = -ny, bpy = nx;
    const halfWidth = 1.2;
    const bcx = (drawTailX + drawTipX) * 0.5;
    const bcy = (drawTailY + drawTipY) * 0.5;
    const bColor = EIGENSTEIN_BLADE_COLORS[Math.floor(nowMs / 50) % EIGENSTEIN_BLADE_COLORS.length] ?? '#cc00ff';
    ctx.globalAlpha = alpha;
    ctx.fillStyle = '#000018';
    if (!isLowGraphicsMode) { ctx.shadowBlur = 10; ctx.shadowColor = bColor; }
    ctx.beginPath();
    ctx.moveTo(drawTailX, drawTailY);
    ctx.lineTo(bcx + bpx * halfWidth * 2, bcy + bpy * halfWidth * 2);
    ctx.lineTo(drawTipX, drawTipY);
    ctx.lineTo(bcx - bpx * halfWidth * 2, bcy - bpy * halfWidth * 2);
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.globalAlpha = alpha * 0.8;
    ctx.fillStyle = bColor;
    ctx.beginPath();
    ctx.moveTo(drawTailX, drawTailY);
    ctx.lineTo(bcx + bpx * halfWidth, bcy + bpy * halfWidth);
    ctx.lineTo(drawTipX, drawTipY);
    ctx.lineTo(bcx - bpx * halfWidth, bcy - bpy * halfWidth);
    ctx.closePath();
    ctx.fill();
  }

  // ── Dimensional rift slash effects ──────────────────────────────────────
  if (state.riftEffects) {
    for (const rift of state.riftEffects) {
      const lifeRatio = rift.timerMs / rift.maxTimerMs;
      const fadeAlpha = lifeRatio < 0.5 ? 1 : 1 - (lifeRatio - 0.5) * 2;
      for (const branch of rift.branches) {
        if (branch.length < 0.5) continue;
        const ex = rift.x + Math.cos(branch.angle) * branch.length;
        const ey = rift.y + Math.sin(branch.angle) * branch.length;
        // Dark void core of the crack.
        ctx.globalAlpha = fadeAlpha * 0.85;
        ctx.strokeStyle = '#000010';
        ctx.lineWidth = 2.5 + rift.intensity * 2;
        if (!isLowGraphicsMode) { ctx.shadowBlur = 0; }
        ctx.beginPath(); ctx.moveTo(rift.x, rift.y); ctx.lineTo(ex, ey); ctx.stroke();
        // Bright neon outline.
        ctx.globalAlpha = fadeAlpha * (0.7 + rift.intensity * 0.3);
        ctx.strokeStyle = branch.color;
        ctx.lineWidth = 0.8;
        if (!isLowGraphicsMode) { ctx.shadowBlur = 6 + rift.intensity * 8; ctx.shadowColor = branch.color; }
        ctx.beginPath(); ctx.moveTo(rift.x, rift.y); ctx.lineTo(ex, ey); ctx.stroke();
        ctx.shadowBlur = 0;
        // Perpendicular tick marks at branch tip (substrate-style).
        if (branch.length > branch.maxLength * 0.6) {
          const perpX = -Math.sin(branch.angle);
          const perpY =  Math.cos(branch.angle);
          const tickLen = 4 + rift.intensity * 5;
          ctx.globalAlpha = fadeAlpha * 0.5;
          ctx.strokeStyle = branch.color;
          ctx.lineWidth = 0.6;
          ctx.beginPath();
          ctx.moveTo(ex - perpX * tickLen, ey - perpY * tickLen);
          ctx.lineTo(ex + perpX * tickLen, ey + perpY * tickLen);
          ctx.stroke();
        }
      }
      // Small negative-space circle at impact origin.
      ctx.globalAlpha = fadeAlpha * (0.3 + rift.intensity * 0.4);
      ctx.fillStyle = '#000010';
      ctx.beginPath();
      ctx.arc(rift.x, rift.y, 3 + rift.intensity * 4, 0, Math.PI * 2);
      ctx.fill();
      if (!isLowGraphicsMode) {
        ctx.shadowBlur  = 12 + rift.intensity * 12;
        ctx.shadowColor = '#cc00ff';
      }
      ctx.globalAlpha = fadeAlpha * (0.4 + rift.intensity * 0.4);
      ctx.strokeStyle = '#cc00ff';
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.arc(rift.x, rift.y, 3 + rift.intensity * 4, 0, Math.PI * 2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
  }

  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.lineWidth = 1;
  ctx.restore();
}

// ── Sand blade combo ──────────────────────────────────────────────────────────

/**
 * Draws the starter sand blade when no weapon is equipped.
 * Visually mirrors the diamond sword but uses warm sand / amber colors,
 * and adds a thin per-polygon sand trail behind each shard during a swing.
 *
 * @param state  The SwordComboState stored under BASE_ATTACK_TIMER_KEY.
 *               Pass `undefined` to skip drawing (e.g. before the first swing).
 * @param mote   Player position.
 */
export function drawSandBladeCombo(
  ctx: CanvasRenderingContext2D,
  state: SwordComboState | undefined,
  mote: { x: number; y: number },
): void {
  if (!state) return;

  const swordLength    = getSwordLength(1);
  const isSpinCombo    = state.phase === 'spin_combo';
  const comboLength    = swordLength;
  const dists          = getShardDistances(comboLength);
  const nowMs          = Date.now();

  ctx.save();

  // ── Spin combo ring (sand-colored) ──
  if (isSpinCombo) {
    const spinT      = Math.min(1, state.phaseMs / SWORD_COMBO_SPIN_MS);
    const ringAlpha  = 0.55 + 0.4 * Math.abs(Math.sin(spinT * Math.PI * SWORD_COMBO_SPIN_TURNS));
    const numArcs    = SAND_BLADE_COLORS.length;
    ctx.lineWidth    = 3;
    for (let ci = 0; ci < numArcs; ci++) {
      const segStart = (ci / numArcs) * Math.PI * 2 + state.spinComboAngle;
      const segEnd   = segStart + (Math.PI * 2) / numArcs;
      ctx.globalAlpha = ringAlpha * 0.7;
      ctx.strokeStyle = SAND_BLADE_COLORS[ci];
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = 12; ctx.shadowColor = SAND_BLADE_COLORS[ci];
      }
      ctx.beginPath();
      ctx.arc(mote.x, mote.y, comboLength, segStart, segEnd);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.lineWidth = 1;
  }

  // ── Prismatic shard polygons + per-polygon sand trail ──
  /** Angular offset per trail ghost during a swing (radians). */
  const TRAIL_ANGLE_STEP = 0.07;
  const TRAIL_STEPS      = 4;

  for (let i = 0; i < SWORD_SHARD_COUNT; i++) {
    const colorIdx     = (i + Math.floor(nowMs / 80)) % SAND_BLADE_COLORS.length;
    const color        = SAND_BLADE_COLORS[colorIdx];
    const { shapeIdx, radius } = getShardStyle(i);
    const verts        = SWORD_SHARD_SHAPES[shapeIdx];
    const scaledRadius = isSpinCombo ? radius * 1.5 : radius;

    // ── Sand trail: ghost copies behind each shard during swing ──
    if (state.phase === 'swing') {
      // "Behind" = opposite swing direction so trail follows the shard.
      const trailSign = state.swingIsRightToLeft ? -1 : 1;
      for (let k = 1; k <= TRAIL_STEPS; k++) {
        const trailAngle = state.shardAngles[i] + trailSign * k * TRAIL_ANGLE_STEP;
        const tsx        = mote.x + Math.cos(trailAngle) * dists[i];
        const tsy        = mote.y + Math.sin(trailAngle) * dists[i];
        const cosT       = Math.cos(trailAngle);
        const sinT       = Math.sin(trailAngle);
        const trailAlpha = (1 - k / (TRAIL_STEPS + 1)) * 0.45;
        ctx.globalAlpha  = trailAlpha;
        ctx.fillStyle    = color;
        ctx.beginPath();
        for (let v = 0; v < verts.length; v++) {
          const [cu, su] = verts[v];
          const vx = tsx + (cu * cosT - su * sinT) * scaledRadius * 0.85;
          const vy = tsy + (cu * sinT + su * cosT) * scaledRadius * 0.85;
          if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
        }
        ctx.closePath();
        ctx.fill();
      }
    }

    // ── Main shard polygon ──
    const sx          = mote.x + Math.cos(state.shardAngles[i]) * dists[i];
    const sy          = mote.y + Math.sin(state.shardAngles[i]) * dists[i];
    const cosA        = Math.cos(state.shardAngles[i]);
    const sinA        = Math.sin(state.shardAngles[i]);
    const shardAlpha  = isSpinCombo ? 1.0 : (state.phase === 'swing' ? 1.0 : 0.85);

    ctx.globalAlpha = shardAlpha;
    ctx.fillStyle   = color;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur  = (isSpinCombo ? 10 : 4) + (state.phase === 'swing' ? 3 : 0);
      ctx.shadowColor = color;
    }
    ctx.beginPath();
    for (let v = 0; v < verts.length; v++) {
      const [cu, su] = verts[v];
      const vx = sx + (cu * cosA - su * sinA) * scaledRadius;
      const vy = sy + (cu * sinA + su * cosA) * scaledRadius;
      if (v === 0) ctx.moveTo(vx, vy); else ctx.lineTo(vx, vy);
    }
    ctx.closePath();
    ctx.fill();
    ctx.shadowBlur = 0;

    // Sandy highlight dot at shard center.
    ctx.globalAlpha = 0.3;
    ctx.fillStyle   = '#fffbe0';
    ctx.beginPath();
    ctx.arc(sx, sy, scaledRadius * 0.3, 0, Math.PI * 2);
    ctx.fill();
  }

  // ── Swipe-arc visuals (sand-colored crescent, comet profile) ──
  //
  // Each crescent arc uses a varying lineWidth that starts thin at arcStart,
  // quickly peaks to thick (~20% through), then slowly tapers back to thin at
  // arcEnd — producing a comet-like appearance.
  const COMET_SEGMENTS  = 20;
  const COMET_MIN_WIDTH = 0.5;
  const COMET_MAX_WIDTH = 5.0;
  const COMET_WID_RANGE = COMET_MAX_WIDTH - COMET_MIN_WIDTH;

  /** Width at normalised arc position t [0,1]: thin → peak at t=0.2 → slow taper to thin. */
  function _cometWidth(t: number): number {
    return t < 0.2
      ? COMET_MIN_WIDTH + COMET_WID_RANGE * (t / 0.2)
      : COMET_MAX_WIDTH - COMET_WID_RANGE * ((t - 0.2) / 0.8);
  }

  for (const fx of state.swipeEffects) {
    const elapsed   = fx.maxTimerMs - fx.timerMs;
    const lifeRatio = elapsed / fx.maxTimerMs;
    const baseAlpha = (1 - lifeRatio) * 0.85;
    const arcSpan   = fx.arcEnd - fx.arcStart;
    ctx.globalAlpha = baseAlpha;
    ctx.lineCap     = 'round';

    for (let seg = 0; seg < COMET_SEGMENTS; seg++) {
      const t0 = seg       / COMET_SEGMENTS;
      const t1 = (seg + 1) / COMET_SEGMENTS;
      // Average of segment endpoints for lineWidth.
      const segW     = (_cometWidth(t0) + _cometWidth(t1)) * 0.5;
      const colorIdx = Math.floor(t0 * SAND_BLADE_COLORS.length) % SAND_BLADE_COLORS.length;
      const color    = SAND_BLADE_COLORS[colorIdx];
      ctx.lineWidth  = segW;
      ctx.strokeStyle = color;
      if (!isLowGraphicsMode) {
        ctx.shadowBlur = segW * 1.5; ctx.shadowColor = color;
      }
      ctx.beginPath();
      ctx.arc(fx.x, fx.y, fx.swordLength, fx.arcStart + arcSpan * t0, fx.arcStart + arcSpan * t1);
      ctx.stroke();
      ctx.shadowBlur = 0;
    }
    ctx.lineCap = 'butt';
  }

  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.lineWidth = 1;
  ctx.restore();
}

// ── Sand drift pixels (canonical source: rpg-weapon-sand-drift.ts) ───────────
export { spawnSandSwingPixels, updateSandDriftPixels, drawSandDriftPixels } from './rpg-weapon-sand-drift';
