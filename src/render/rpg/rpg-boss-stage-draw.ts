/**
 * rpg-boss-stage-draw.ts — Visual rendering for the boss-wave stage director.
 *
 * Draws:
 *   1. Luminous corridor from the bottom safe zone up to the boss.
 *   2. Wisp particles floating along the corridor.
 *   3. Stage hazards (vertical rain streams, sweep bars) with
 *      telegraph → active → fading visual states.
 *   4. Boss-contact flash when the player first reaches the boss.
 *   5. Developer debug overlay (corridor bounds, hitboxes, stage info).
 *
 * Called from drawRpgFrame in rpg-render-draw.ts.
 */

import type { BossEnemy } from './rpg-enemy-types';
import {
  type BossStageDirectorState,
  type WispParticle,
  type VerticalRainHazard,
  type SweepBarHazard,
  getCorridorCenterX,
  CORRIDOR_HALF_WIDTH_STAGE,
  BOSS_DAMAGE_WINDOW_RADIUS,
  CORRIDOR_SAFETY_MARGIN,
} from './rpg-boss-stage-director';
import { PLAYER_HIT_RADIUS, BOSS_BOTTOM_SAFE_ZONE_R } from './rpg-constants';

// ── Internal tuning ───────────────────────────────────────────────────────────

const CORRIDOR_SAMPLES = 40;

let _lowGraphics = false;
export function setStageDirLowGraphics(enabled: boolean): void {
  _lowGraphics = enabled;
}

// ── Main draw entry ───────────────────────────────────────────────────────────

/**
 * Renders the stage director visuals to the canvas.
 * Call this from drawRpgFrame, between drawBossProjectiles and drawBossEnemy,
 * only while a boss wave is active.
 */
export function drawBossStageDirector(
  c: CanvasRenderingContext2D,
  state: BossStageDirectorState,
  bossEnemy: BossEnemy,
  dim: { w: number; h: number },
  glowTimeS: number,
  isLowGraphics: boolean,
): void {
  if (!state.isActive) return;

  const safeZoneX = dim.w / 2;
  const safeZoneY = dim.h * 0.85;
  const bossX = bossEnemy.x;
  const bossY = bossEnemy.y;

  _drawCorridorGlow(c, state, bossX, bossY, safeZoneX, safeZoneY, dim, glowTimeS, isLowGraphics);
  _drawWisps(c, state.wisps, isLowGraphics);
  _drawHazards(c, state, isLowGraphics);
  _drawBossContactFlash(c, state, bossX, bossY, isLowGraphics);

  if (state.isDevMode) {
    _drawDebugOverlay(c, state, bossX, bossY, safeZoneX, safeZoneY, dim);
  }
}

// ── Corridor glow ─────────────────────────────────────────────────────────────

function _drawCorridorGlow(
  c: CanvasRenderingContext2D,
  state: BossStageDirectorState,
  bossX: number,
  bossY: number,
  safeZoneX: number,
  safeZoneY: number,
  dim: { w: number; h: number },
  glowTimeS: number,
  isLowGraphics: boolean,
): void {
  const samples = _lowGraphics || isLowGraphics ? 20 : CORRIDOR_SAMPLES;
  const halfW = state.corridorHalfWidth;
  const pulse = 0.55 + 0.15 * Math.sin(glowTimeS * 1.6);

  // Build left and right edge paths for the corridor fill
  c.save();
  c.beginPath();

  // Left edge (bottom → top)
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const worldY = safeZoneY + (bossY - safeZoneY) * t;
    const cx = getCorridorCenterX(worldY, bossX, bossY, safeZoneX, safeZoneY, state.stageIndex, dim.w);
    const lx = cx - halfW;
    if (i === 0) c.moveTo(lx, worldY);
    else c.lineTo(lx, worldY);
  }
  // Right edge (top → bottom)
  for (let i = samples; i >= 0; i--) {
    const t = i / samples;
    const worldY = safeZoneY + (bossY - safeZoneY) * t;
    const cx = getCorridorCenterX(worldY, bossX, bossY, safeZoneX, safeZoneY, state.stageIndex, dim.w);
    c.lineTo(cx + halfW, worldY);
  }
  c.closePath();

  // Faint golden fill
  const fillAlpha = _lowGraphics || isLowGraphics ? 0.04 : 0.06 * pulse;
  c.fillStyle = `rgba(255,220,100,${fillAlpha})`;
  c.fill();

  // Draw the left and right glowing edge lines
  if (!(_lowGraphics || isLowGraphics)) {
    _drawCorridorEdge(c, state, bossX, bossY, safeZoneX, safeZoneY, dim, samples, halfW, pulse, -1);
    _drawCorridorEdge(c, state, bossX, bossY, safeZoneX, safeZoneY, dim, samples, halfW, pulse, +1);
  }

  c.restore();
}

function _drawCorridorEdge(
  c: CanvasRenderingContext2D,
  state: BossStageDirectorState,
  bossX: number,
  bossY: number,
  safeZoneX: number,
  safeZoneY: number,
  dim: { w: number; h: number },
  samples: number,
  halfW: number,
  pulse: number,
  side: -1 | 1,
): void {
  c.beginPath();
  for (let i = 0; i <= samples; i++) {
    const t = i / samples;
    const worldY = safeZoneY + (bossY - safeZoneY) * t;
    const cx = getCorridorCenterX(worldY, bossX, bossY, safeZoneX, safeZoneY, state.stageIndex, dim.w);
    const ex = cx + side * halfW;
    if (i === 0) c.moveTo(ex, worldY);
    else c.lineTo(ex, worldY);
  }
  c.strokeStyle = `rgba(255,210,80,${0.22 * pulse})`;
  c.lineWidth = 1.2;
  c.shadowColor = '#ffd764';
  c.shadowBlur = 6;
  c.stroke();
  c.shadowBlur = 0;
}

// ── Wisp particles ────────────────────────────────────────────────────────────

function _drawWisps(
  c: CanvasRenderingContext2D,
  wisps: WispParticle[],
  isLowGraphics: boolean,
): void {
  if (wisps.length === 0) return;
  c.save();
  for (const w of wisps) {
    const lifeRatio = w.lifeMs / w.maxLifeMs;
    const alpha = lifeRatio < 0.3
      ? lifeRatio / 0.3 * 0.75
      : lifeRatio > 0.8
        ? (1 - lifeRatio) / 0.2 * 0.75
        : 0.75;
    if (alpha < 0.01) continue;

    if (!isLowGraphics && !_lowGraphics) {
      c.shadowColor = w.color;
      c.shadowBlur = w.size * 3;
    }
    c.globalAlpha = alpha;
    c.fillStyle = w.color;
    c.beginPath();
    c.arc(w.x, w.y, w.size, 0, Math.PI * 2);
    c.fill();
  }
  c.shadowBlur = 0;
  c.globalAlpha = 1;
  c.restore();
}

// ── Hazard rendering ──────────────────────────────────────────────────────────

function _drawHazards(
  c: CanvasRenderingContext2D,
  state: BossStageDirectorState,
  isLowGraphics: boolean,
): void {
  for (const h of state.hazards) {
    const phaseRatio = Math.max(0, Math.min(1, h.phaseMs / (
      h.phase === 'telegraph' ? h.telegraphDuration
        : h.phase === 'active' ? h.activeDuration
          : h.fadingDuration
    )));

    let alpha: number;
    if (h.phase === 'telegraph') {
      // Flicker to warn the player
      alpha = 0.3 + 0.25 * Math.abs(Math.sin(phaseRatio * Math.PI * 6));
    } else if (h.phase === 'active') {
      alpha = 0.85;
    } else {
      alpha = phaseRatio * 0.85;
    }

    if (alpha < 0.01) continue;

    if (h.kind === 'verticalRain') {
      _drawVerticalRain(c, h, alpha, isLowGraphics);
    } else {
      _drawSweepBar(c, h, alpha, isLowGraphics);
    }
  }
}

function _drawVerticalRain(
  c: CanvasRenderingContext2D,
  h: VerticalRainHazard,
  alpha: number,
  isLowGraphics: boolean,
): void {
  c.save();
  c.globalAlpha = alpha;

  if (!isLowGraphics && !_lowGraphics) {
    c.shadowColor = h.particleGlow;
    c.shadowBlur = 8;
  }
  c.fillStyle = h.particleColor;

  for (const stream of h.streams) {
    for (const p of stream.particles) {
      const lifeRatio = p.lifeMs / 5500;
      const particleAlpha = lifeRatio < 0.15 ? lifeRatio / 0.15 : 1;
      if (particleAlpha < 0.05) continue;
      c.globalAlpha = alpha * particleAlpha;
      c.beginPath();
      c.arc(stream.x, p.y, h.particleRadius, 0, Math.PI * 2);
      c.fill();
    }
  }

  // During telegraph: draw faint vertical dashed lines where streams will be
  if (h.phase === 'telegraph') {
    c.globalAlpha = alpha * 0.35;
    c.strokeStyle = h.particleGlow;
    c.lineWidth = 1;
    c.setLineDash([4, 6]);
    for (const stream of h.streams) {
      c.beginPath();
      c.moveTo(stream.x, 0);
      c.lineTo(stream.x, 9999);
      c.stroke();
    }
    c.setLineDash([]);
  }

  c.shadowBlur = 0;
  c.globalAlpha = 1;
  c.restore();
}

function _drawSweepBar(
  c: CanvasRenderingContext2D,
  h: SweepBarHazard,
  alpha: number,
  isLowGraphics: boolean,
): void {
  c.save();
  c.globalAlpha = alpha;

  const barH = h.barHalfHeight * 2;
  const gapLeft  = h.gapCenterX - h.gapHalfWidth;
  const gapRight = h.gapCenterX + h.gapHalfWidth;
  const barY = h.y - h.barHalfHeight;

  if (!isLowGraphics && !_lowGraphics) {
    c.shadowColor = h.glowColor;
    c.shadowBlur = 12;
  }
  c.fillStyle = h.color;

  // Left segment (from x=0 to gap left)
  if (gapLeft > 0) {
    c.fillRect(0, barY, gapLeft, barH);
  }
  // Right segment (from gap right to screen edge)
  // We draw to a large value; canvas clips naturally
  if (gapRight < 99999) {
    c.fillRect(gapRight, barY, 99999, barH);
  }

  // Gap edge highlight lines
  if (!isLowGraphics && !_lowGraphics) {
    c.strokeStyle = h.glowColor;
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(gapLeft,  barY);
    c.lineTo(gapLeft,  barY + barH);
    c.stroke();
    c.beginPath();
    c.moveTo(gapRight, barY);
    c.lineTo(gapRight, barY + barH);
    c.stroke();
  }

  // During telegraph: show the gap outline as a dashed guide
  if (h.phase === 'telegraph') {
    c.globalAlpha = alpha * 0.5;
    c.strokeStyle = h.glowColor;
    c.lineWidth = 1;
    c.setLineDash([5, 5]);
    c.strokeRect(gapLeft, barY - 2, h.gapHalfWidth * 2, barH + 4);
    c.setLineDash([]);
  }

  c.shadowBlur = 0;
  c.globalAlpha = 1;
  c.restore();
}

// ── Boss-contact flash ────────────────────────────────────────────────────────

function _drawBossContactFlash(
  c: CanvasRenderingContext2D,
  state: BossStageDirectorState,
  bossX: number,
  bossY: number,
  isLowGraphics: boolean,
): void {
  if (state.bossConnectFlashMs <= 0) return;
  if (isLowGraphics || _lowGraphics) return;

  const ratio = state.bossConnectFlashMs / 500;
  const r = 30 + (1 - ratio) * 60;
  const alpha = ratio * 0.6;

  c.save();
  c.globalAlpha = alpha;
  const grad = c.createRadialGradient(bossX, bossY, 0, bossX, bossY, r);
  grad.addColorStop(0, '#ffffff');
  grad.addColorStop(0.4, '#ffd764');
  grad.addColorStop(1, 'rgba(255,215,100,0)');
  c.fillStyle = grad;
  c.beginPath();
  c.arc(bossX, bossY, r, 0, Math.PI * 2);
  c.fill();
  c.globalAlpha = 1;
  c.restore();
}

// ── Developer debug overlay ───────────────────────────────────────────────────

function _drawDebugOverlay(
  c: CanvasRenderingContext2D,
  state: BossStageDirectorState,
  bossX: number,
  bossY: number,
  safeZoneX: number,
  safeZoneY: number,
  dim: { w: number; h: number },
): void {
  c.save();
  c.globalAlpha = 0.8;

  // Corridor left/right bounds
  const samples = 30;
  c.strokeStyle = '#00ff88';
  c.lineWidth = 1;
  c.setLineDash([3, 3]);

  for (const side of [-1, 1] as const) {
    c.beginPath();
    for (let i = 0; i <= samples; i++) {
      const t = i / samples;
      const wy = safeZoneY + (bossY - safeZoneY) * t;
      const cx = getCorridorCenterX(wy, bossX, bossY, safeZoneX, safeZoneY, state.stageIndex, dim.w);
      const ex = cx + side * state.corridorHalfWidth;
      if (i === 0) c.moveTo(ex, wy);
      else c.lineTo(ex, wy);
    }
    c.stroke();
  }
  c.setLineDash([]);

  // Boss damage-window circle
  c.strokeStyle = '#ffff00';
  c.lineWidth = 1;
  c.beginPath();
  c.arc(bossX, bossY, BOSS_DAMAGE_WINDOW_RADIUS, 0, Math.PI * 2);
  c.stroke();

  // Safe zone circle
  c.strokeStyle = '#44ffff';
  c.lineWidth = 1;
  c.beginPath();
  c.arc(safeZoneX, safeZoneY, BOSS_BOTTOM_SAFE_ZONE_R + CORRIDOR_SAFETY_MARGIN, 0, Math.PI * 2);
  c.stroke();

  // Hazard hitboxes
  c.strokeStyle = '#ff4444';
  c.lineWidth = 0.8;
  for (const h of state.hazards) {
    if (h.kind === 'verticalRain' && h.phase === 'active') {
      for (const stream of h.streams) {
        for (const p of stream.particles) {
          c.beginPath();
          c.arc(stream.x, p.y, h.particleRadius, 0, Math.PI * 2);
          c.stroke();
        }
      }
    } else if (h.kind === 'sweepBar' && h.phase === 'active') {
      const gL = h.gapCenterX - h.gapHalfWidth;
      const gR = h.gapCenterX + h.gapHalfWidth;
      c.strokeRect(0, h.y - h.barHalfHeight, gL, h.barHalfHeight * 2);
      c.strokeRect(gR, h.y - h.barHalfHeight, dim.w - gR, h.barHalfHeight * 2);
    }
  }

  // Stage info text
  c.globalAlpha = 1;
  c.fillStyle = '#ffffff';
  c.font = '9px monospace';
  const info = [
    `Stage ${state.stageIndex} | t=${Math.round(state.stageTimerMs / 1000)}s`,
    `Cleared: ${state.stagesCompleted} | Hazards: ${state.hazards.length}`,
    `nearBoss: ${state.playerNearBoss} | flash: ${Math.round(state.bossConnectFlashMs)}`,
    `corrW: ${state.corridorHalfWidth}px | PR: ${PLAYER_HIT_RADIUS}px`,
  ];
  const baseX = 4;
  let baseY = 30;
  for (const line of info) {
    c.fillText(line, baseX, baseY);
    baseY += 12;
  }

  c.restore();
}

// ── Exports used outside this file ────────────────────────────────────────────

export { CORRIDOR_HALF_WIDTH_STAGE };
