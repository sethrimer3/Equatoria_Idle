/**
 * rpg-weapon-draw.ts — Canvas draw functions for player weapon visual effects.
 *
 * Each function is a pure draw call: it takes an explicit
 * `ctx: CanvasRenderingContext2D` plus the state it needs, instead of
 * capturing closure variables from createRpgRender.
 *
 * Extracted from rpg-render.ts to reduce that closure's line count.
 *
 * Sections:
 *   - drawChainWhip           — quartz chain whip node chain
 *   - drawVortexes            — nullstone vortex rings
 *   - drawSwordCombos         — diamond sword prismatic shards + beam effects
 *   - drawSandBladeCombo      — starter sand blade (sand-colored shards + polygon trails)
 *   - Sand drift pixels       — 2×2 sand pixels spawned per swing, drift + fade over 2 s
 */

import type { ChainWhipState, NullstoneVortex, SwordComboState } from './rpg-types';
import {
  CHAIN_LINE_COLOR, CHAIN_NODE_COLOR, CHAIN_NODE_GLOW, CHAIN_NODES,
  VORTEX_COLOR, VORTEX_GLOW,
  SWORD_PRISMATIC_COLORS, SWORD_SHARD_COUNT, SWORD_SHARD_SHAPES,
  SWORD_COMBO_RANGE_MULT, SWORD_COMBO_SPIN_MS, SWORD_COMBO_SPIN_TURNS,
  SAND_BLADE_COLORS,
} from './rpg-constants';
import { chainNodeRadius, getSwordLength, getShardDistances, getShardStyle } from './rpg-helpers';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for RPG weapon draw functions (skips glow effects). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Chain whip ────────────────────────────────────────────────────────────────

/**
 * Draws the quartz chain-whip — node chain lines and graduated node circles.
 * Call only while phase !== 'idle' (or very early in cooldown) to avoid
 * drawing an invisible chain.
 */
export function drawChainWhip(ctx: CanvasRenderingContext2D, ws: ChainWhipState): void {
  if (ws.phase === 'idle' && ws.phaseMs < ws.cooldownMs * 0.1) return;
  ctx.save();
  ctx.lineWidth = 1.5;
  ctx.lineCap   = 'round';
  ctx.lineJoin  = 'round';
  // Draw chain links (lines between nodes)
  ctx.strokeStyle = CHAIN_LINE_COLOR;
  if (!isLowGraphicsMode) {
    ctx.shadowBlur  = 4; ctx.shadowColor = CHAIN_NODE_GLOW;
  }
  ctx.globalAlpha = 0.75;
  ctx.beginPath();
  ctx.moveTo(ws.nodesX[0], ws.nodesY[0]);
  for (let i = 1; i < CHAIN_NODES; i++) ctx.lineTo(ws.nodesX[i], ws.nodesY[i]);
  ctx.stroke();
  ctx.shadowBlur = 0;
  // Draw node circles with graduated sizes
  for (let i = 0; i < CHAIN_NODES; i++) {
    const r = chainNodeRadius(i);
    ctx.globalAlpha = 0.9;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur  = r * 3; ctx.shadowColor = CHAIN_NODE_GLOW;
      ctx.fillStyle   = CHAIN_NODE_GLOW;
      ctx.beginPath();
      ctx.arc(ws.nodesX[i], ws.nodesY[i], r * 1.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
    }
    ctx.fillStyle  = CHAIN_NODE_COLOR;
    ctx.beginPath();
    ctx.arc(ws.nodesX[i], ws.nodesY[i], r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0;
  ctx.restore();
}

// ── Nullstone vortex ──────────────────────────────────────────────────────────

/** Draws all active nullstone vortex rings. No-op when the array is empty. */
export function drawVortexes(ctx: CanvasRenderingContext2D, vortexes: NullstoneVortex[]): void {
  if (vortexes.length === 0) return;
  ctx.save();
  for (const v of vortexes) {
    const alpha = v.durationMs / v.maxDurationMs;
    const r = v.radiusPx;
    // Outer ring (glow only in high-graphics mode)
    ctx.globalAlpha = alpha * 0.6;
    if (!isLowGraphicsMode) {
      ctx.shadowBlur = r * 0.5; ctx.shadowColor = VORTEX_GLOW;
    }
    ctx.strokeStyle = VORTEX_COLOR; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(v.x, v.y, r, 0, Math.PI * 2); ctx.stroke();
    ctx.shadowBlur = 0;
    // Rotating concentric arcs showing spin
    const arcCount = 5;
    for (let j = 0; j < arcCount; j++) {
      const baseAngle = v.spinAngle + (j / arcCount) * Math.PI * 2;
      const scale     = 0.25 + j * 0.16;
      ctx.globalAlpha = alpha * 0.4 * (1 - j / arcCount);
      ctx.beginPath();
      ctx.arc(v.x, v.y, r * scale, baseAngle, baseAngle + Math.PI * 0.8);
      ctx.stroke();
    }
  }
  ctx.globalAlpha = 1; ctx.shadowBlur = 0; ctx.lineWidth = 1;
  ctx.restore();
}

// ── Diamond sword crescent constants ─────────────────────────────────────────
// Crescent arc profile: rises steeply to peak at 15% of the arc, then tapers
// slowly toward the back — creating a wider-front, thinner-back comet shape.
const DIAMOND_COMET_SEGS      = 20;
const DIAMOND_COMET_MIN_WIDTH = 0.5;
const DIAMOND_COMET_MAX_WIDTH = 7.0;
const DIAMOND_COMET_WID_RANGE = DIAMOND_COMET_MAX_WIDTH - DIAMOND_COMET_MIN_WIDTH;

/** Width at normalised arc position t [0,1]: thin → quick peak at t=0.15 → slow taper. */
function _diamondCometWidth(t: number): number {
  return t < 0.15
    ? DIAMOND_COMET_MIN_WIDTH + DIAMOND_COMET_WID_RANGE * (t / 0.15)
    : DIAMOND_COMET_MAX_WIDTH - DIAMOND_COMET_WID_RANGE * ((t - 0.15) / 0.85);
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
    const baseSwordLength = getSwordLength(tier);
    const isSpinCombo = state.phase === 'spin_combo';
    const swordLength = isSpinCombo ? baseSwordLength * SWORD_COMBO_RANGE_MULT : baseSwordLength;
    const dists = getShardDistances(swordLength);
    const nowMs = Date.now();

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
  const comboLength    = isSpinCombo ? swordLength * SWORD_COMBO_RANGE_MULT : swordLength;
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

// ── Sand drift pixels ─────────────────────────────────────────────────────────
//
// When the sand blade swings, 30 tiny 2×2 px sand-colored pixels are emitted
// along the swing arc.  Each drifts slowly in a random direction and fades
// out over 2 seconds.

/** Total lifetime of each sand drift pixel (ms). */
const SAND_PIXEL_LIFE_MS    = 2000;
/** Number of pixels spawned per swing. */
const SAND_PIXEL_SPAWN_COUNT = 30;
/** Pixel size in canvas px. */
const SAND_PIXEL_SIZE        = 2;
/** Max drift speed (px/ms). */
const SAND_PIXEL_MAX_SPEED   = 0.08;

interface SandDriftPixel {
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Remaining lifetime, counts down from SAND_PIXEL_LIFE_MS to 0. */
  lifeMs: number;
  color: string;
}

const _sandDriftPixels: SandDriftPixel[] = [];

/**
 * Spawn sand drift pixels along the sword arc when a new swing begins.
 * Called by rpg-render.ts on the first frame of each sand blade swing.
 */
export function spawnSandSwingPixels(
  mx: number, my: number,
  arcStart: number, arcEnd: number,
  swordLength: number,
): void {
  for (let i = 0; i < SAND_PIXEL_SPAWN_COUNT; i++) {
    const angle  = arcStart + Math.random() * (arcEnd - arcStart);
    const dist   = swordLength * (0.25 + Math.random() * 0.75);
    const x      = mx + Math.cos(angle) * dist;
    const y      = my + Math.sin(angle) * dist;
    const dir    = Math.random() * Math.PI * 2;
    const speed  = SAND_PIXEL_MAX_SPEED * (0.3 + Math.random() * 0.7);
    const color  = SAND_BLADE_COLORS[Math.floor(Math.random() * SAND_BLADE_COLORS.length)];
    _sandDriftPixels.push({ x, y, vx: Math.cos(dir) * speed, vy: Math.sin(dir) * speed, lifeMs: SAND_PIXEL_LIFE_MS, color });
  }
}

/** Advance sand drift pixels by deltaMs. Call once per frame when sand blade is active. */
export function updateSandDriftPixels(deltaMs: number): void {
  for (let i = _sandDriftPixels.length - 1; i >= 0; i--) {
    const p = _sandDriftPixels[i];
    p.x      += p.vx * deltaMs;
    p.y      += p.vy * deltaMs;
    p.lifeMs -= deltaMs;
    if (p.lifeMs <= 0) _sandDriftPixels.splice(i, 1);
  }
}

/** Draw all active sand drift pixels as 2×2 sand-colored squares that fade over time. */
export function drawSandDriftPixels(ctx: CanvasRenderingContext2D): void {
  if (_sandDriftPixels.length === 0) return;
  ctx.save();
  for (const p of _sandDriftPixels) {
    const alpha = p.lifeMs / SAND_PIXEL_LIFE_MS;
    ctx.globalAlpha = alpha * 0.9;
    ctx.fillStyle   = p.color;
    ctx.fillRect(Math.floor(p.x), Math.floor(p.y), SAND_PIXEL_SIZE, SAND_PIXEL_SIZE);
  }
  ctx.globalAlpha = 1;
  ctx.restore();
}
