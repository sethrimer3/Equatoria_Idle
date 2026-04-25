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
 *   - drawChainWhip     — quartz chain whip node chain
 *   - drawVortexes      — nullstone vortex rings
 *   - drawSwordCombos   — diamond sword prismatic shards + beam effects
 */

import type { ChainWhipState, NullstoneVortex, SwordComboState } from './rpg-types';
import {
  CHAIN_LINE_COLOR, CHAIN_NODE_COLOR, CHAIN_NODE_GLOW, CHAIN_NODES,
  VORTEX_COLOR, VORTEX_GLOW,
  SWORD_PRISMATIC_COLORS, SWORD_SHARD_COUNT, SWORD_SHARD_SHAPES,
  SWORD_COMBO_RANGE_MULT, SWORD_COMBO_SPIN_MS, SWORD_COMBO_SPIN_TURNS,
} from './rpg-constants';
import { chainNodeRadius, getSwordLength, getShardDistances, getShardStyle } from './rpg-helpers';

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
  ctx.shadowBlur  = 4; ctx.shadowColor = CHAIN_NODE_GLOW;
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
    ctx.shadowBlur  = r * 3; ctx.shadowColor = CHAIN_NODE_GLOW;
    ctx.fillStyle   = CHAIN_NODE_GLOW;
    ctx.beginPath();
    ctx.arc(ws.nodesX[i], ws.nodesY[i], r * 1.4, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
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
    // Outer ring glow
    ctx.globalAlpha = alpha * 0.6;
    ctx.shadowBlur = r * 0.5; ctx.shadowColor = VORTEX_GLOW;
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
        ctx.shadowBlur  = 14; ctx.shadowColor = SWORD_PRISMATIC_COLORS[ci];
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
      ctx.shadowBlur = (isSpinCombo ? 12 : 5) + (state.phase === 'swing' ? 4 : 0);
      ctx.shadowColor = color;
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

    // ── B. Draw disconnected swipe-arc visuals ─────────────────
    for (const fx of state.swipeEffects) {
      const elapsed = fx.maxTimerMs - fx.timerMs;
      const lifeRatio = elapsed / fx.maxTimerMs;
      const alpha = (1 - lifeRatio) * 0.85;
      const arcSpan = fx.arcEnd - fx.arcStart; // fixed 180° span
      const numArcs = SWORD_PRISMATIC_COLORS.length;
      ctx.lineWidth = 2;
      ctx.globalAlpha = alpha;
      for (let ci = 0; ci < numArcs; ci++) {
        const angOffset = (ci / numArcs) * arcSpan;
        const segStart = fx.arcStart + angOffset;
        const segEnd   = segStart + arcSpan / numArcs;
        ctx.strokeStyle = SWORD_PRISMATIC_COLORS[ci];
        ctx.shadowBlur  = 8; ctx.shadowColor = SWORD_PRISMATIC_COLORS[ci];
        ctx.beginPath();
        ctx.arc(fx.x, fx.y, fx.swordLength, segStart, segEnd);
        ctx.stroke();
        ctx.shadowBlur = 0;
      }
      ctx.lineWidth = 1;
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
      ctx.shadowBlur = 10; ctx.shadowColor = bColor;
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
