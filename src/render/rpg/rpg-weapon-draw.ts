/**
 * rpg-weapon-draw.ts — Canvas draw functions for chain-whip and vortex weapon visuals.
 *
 * Each function is a pure draw call: it takes an explicit
 * `ctx: CanvasRenderingContext2D` plus the state it needs, instead of
 * capturing closure variables from createRpgRender.
 *
 * Extracted from rpg-render.ts to reduce that closure's line count.
 * Sword combo and sand blade drawing moved to rpg-weapon-draw-sword.ts.
 *
 * Sections:
 *   - drawChainWhip  — quartz chain whip node chain
 *   - drawVortexes   — nullstone vortex rings
 */

import type { ChainWhipState, NullstoneVortex } from './rpg-types';
import {
  CHAIN_LINE_COLOR, CHAIN_NODE_COLOR, CHAIN_NODE_GLOW, CHAIN_NODES,
  CHAIN_REST_LENGTH, CHAIN_LINK_GAP_RATIO,
  VORTEX_COLOR, VORTEX_GLOW,
} from './rpg-weapon-constants';
import { chainNodeRadius } from './rpg-helpers';

// ── Low-graphics mode flag ────────────────────────────────────
let isLowGraphicsMode = false;

/** Sets low-graphics mode for RPG weapon draw functions (skips glow effects). */
export function setLowGraphicsMode(enabled: boolean): void {
  isLowGraphicsMode = enabled;
}

// ── Chain whip ────────────────────────────────────────────────────────────────

/**
 * Draws the quartz chain-whip as 30 small polygon links with visual gaps
 * between them.  Each link is a short parallelogram oriented along the
 * chain segment, visually similar to the sand / diamond sword polygon style.
 */
export function drawChainWhip(ctx: CanvasRenderingContext2D, ws: ChainWhipState): void {
  if (ws.phase === 'idle' && ws.phaseMs < ws.cooldownMs * 0.1) return;
  ctx.save();

  // Keep links compact/squarish/circular rather than elongated.
  const baseRadius = (CHAIN_REST_LENGTH * CHAIN_LINK_GAP_RATIO) * 0.52;

  for (let i = 0; i < CHAIN_NODES; i++) {
    const cx = ws.nodesX[i];
    const cy = ws.nodesY[i];

    // Determine orientation: align polygon along the chain direction.
    // Use vectors to adjacent nodes; fall back to zero angle at chain ends.
    let dirX = 0, dirY = 0;
    if (i < CHAIN_NODES - 1) {
      dirX += ws.nodesX[i + 1] - cx;
      dirY += ws.nodesY[i + 1] - cy;
    }
    if (i > 0) {
      dirX += cx - ws.nodesX[i - 1];
      dirY += cy - ws.nodesY[i - 1];
    }
    const dlen = Math.sqrt(dirX * dirX + dirY * dirY);
    const axX = dlen > 0.001 ? dirX / dlen : 1;
    const axY = dlen > 0.001 ? dirY / dlen : 0;
    const radiusScale = i === CHAIN_NODES - 1 ? 3 : 1;
    const r = Math.max(baseRadius, chainNodeRadius(i) * 0.95) * radiusScale;
    const sides = Math.max(3, Math.min(7, ws.linkSides[i] ?? 4));

    ctx.globalAlpha = 0.9;

    if (!isLowGraphicsMode) {
      ctx.shadowBlur  = r * 1.8;
      ctx.shadowColor = CHAIN_NODE_GLOW;
      ctx.fillStyle   = CHAIN_NODE_GLOW;
      ctx.beginPath();
      for (let s = 0; s < sides; s++) {
        const a = Math.atan2(axY, axX) + (s / sides) * Math.PI * 2;
        const px = cx + Math.cos(a) * r * 1.22;
        const py = cy + Math.sin(a) * r * 1.22;
        if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      ctx.fill();
      ctx.shadowBlur = 0;
    }

    // Main link polygon — tip link uses CHAIN_LINE_COLOR to mark the business end.
    ctx.fillStyle = i === CHAIN_NODES - 1 ? CHAIN_LINE_COLOR : CHAIN_NODE_COLOR;
    ctx.beginPath();
    for (let s = 0; s < sides; s++) {
      const a = Math.atan2(axY, axX) + (s / sides) * Math.PI * 2;
      const px = cx + Math.cos(a) * r;
      const py = cy + Math.sin(a) * r;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // White highlight core on each link
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    for (let s = 0; s < sides; s++) {
      const a = Math.atan2(axY, axX) + (s / sides) * Math.PI * 2;
      const px = cx + Math.cos(a) * r * 0.46;
      const py = cy + Math.sin(a) * r * 0.46;
      if (s === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    }
    ctx.closePath();
    ctx.fill();

    // Tip-only quartz comet trail similar to emerald missile, but quartz-colored.
    if (i === CHAIN_NODES - 1) {
      const vx = ws.nodesVx[i];
      const vy = ws.nodesVy[i];
      const vLen = Math.sqrt(vx * vx + vy * vy);
      if (vLen > 0.01) {
        const nx = vx / vLen;
        const ny = vy / vLen;
        const trailLen = Math.min(42, 10 + vLen * 2.6);
        const tx = cx - nx * trailLen;
        const ty = cy - ny * trailLen;
        const trailW = r * 0.95;
        const qx = -ny * trailW;
        const qy = nx * trailW;
        ctx.globalAlpha = 0.3;
        ctx.fillStyle = '#dff5ff';
        ctx.beginPath();
        ctx.moveTo(cx + qx, cy + qy);
        ctx.lineTo(cx - qx, cy - qy);
        ctx.lineTo(tx - qx * 0.2, ty - qy * 0.2);
        ctx.lineTo(tx + qx * 0.2, ty + qy * 0.2);
        ctx.closePath();
        ctx.fill();
      }
    }
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

