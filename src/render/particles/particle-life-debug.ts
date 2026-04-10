/**
 * Debug visualization tools for the Particle Life system.
 *
 * All tools are lightweight, toggleable, and have zero cost when disabled.
 * Call `drawParticleLifeDebug()` after normal particle rendering.
 */

import type { CanvasContext } from '../canvas';
import type { EquatoriaParticle } from './particle-types';
import { PL_INTERACTION_RADIUS, PL_GRID_CELL_SIZE } from '../../data/particles/particle-life-config';
import { getSizePixels } from '../../data/particles/size-tiers';

// ─── Debug state (global toggles) ───────────────────────────────

export interface ParticleLifeDebugState {
  /** Show interaction radius circles around active motes. */
  showInteractionRadius: boolean;
  /** Show spatial grid cell boundaries. */
  showSpatialGrid: boolean;
  /** Highlight 1×1 inert motes with a distinct marker. */
  highlightInertMotes: boolean;
  /** Display the current interaction matrix as a color-coded overlay. */
  showInteractionMatrix: boolean;
  /** Display sizeFactor values next to motes. */
  showSizeFactors: boolean;
}

export function createDefaultDebugState(): ParticleLifeDebugState {
  return {
    showInteractionRadius: false,
    showSpatialGrid: false,
    highlightInertMotes: false,
    showInteractionMatrix: false,
    showSizeFactors: false,
  };
}

// ─── Main debug draw entry point ─────────────────────────────────

export function drawParticleLifeDebug(
  cc: CanvasContext,
  particles: EquatoriaParticle[],
  interactionMatrix: number[][],
  enableSizeBias: boolean,
  debugState: ParticleLifeDebugState,
): void {
  if (!debugState.showInteractionRadius &&
      !debugState.showSpatialGrid &&
      !debugState.highlightInertMotes &&
      !debugState.showInteractionMatrix &&
      !debugState.showSizeFactors) {
    return; // No debug features active — zero cost
  }

  const ctx = cc.ctx;

  if (debugState.showSpatialGrid) {
    drawSpatialGrid(ctx, cc.widthPx, cc.heightPx);
  }

  if (debugState.showInteractionRadius) {
    drawInteractionRadii(ctx, particles);
  }

  if (debugState.highlightInertMotes) {
    drawInertHighlights(ctx, particles);
  }

  if (debugState.showSizeFactors && enableSizeBias) {
    drawSizeFactors(ctx, particles);
  }

  if (debugState.showInteractionMatrix) {
    drawInteractionMatrixOverlay(ctx, interactionMatrix, cc.widthPx);
  }
}

// ─── Spatial grid visualization ──────────────────────────────────

function drawSpatialGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
): void {
  ctx.strokeStyle = 'rgba(100, 100, 255, 0.15)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = 0; x <= width; x += PL_GRID_CELL_SIZE) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = 0; y <= height; y += PL_GRID_CELL_SIZE) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

// ─── Interaction radius circles ──────────────────────────────────

function drawInteractionRadii(
  ctx: CanvasRenderingContext2D,
  particles: EquatoriaParticle[],
): void {
  ctx.strokeStyle = 'rgba(255, 255, 0, 0.08)';
  ctx.lineWidth = 0.5;
  // Only draw for a subset to avoid visual noise
  const step = Math.max(1, Math.floor(particles.length / 50));
  for (let i = 0; i < particles.length; i += step) {
    const p = particles[i];
    if (getSizePixels(p.sizeIndex) === 1) continue; // skip inert
    ctx.beginPath();
    ctx.arc(p.x, p.y, PL_INTERACTION_RADIUS, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ─── Inert mote highlights ───────────────────────────────────────

function drawInertHighlights(
  ctx: CanvasRenderingContext2D,
  particles: EquatoriaParticle[],
): void {
  ctx.strokeStyle = 'rgba(255, 0, 0, 0.5)';
  ctx.lineWidth = 0.5;
  for (let i = 0, len = particles.length; i < len; i++) {
    const p = particles[i];
    if (getSizePixels(p.sizeIndex) !== 1) continue;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 3, 0, Math.PI * 2);
    ctx.stroke();
  }
}

// ─── Size factor labels ──────────────────────────────────────────

function drawSizeFactors(
  ctx: CanvasRenderingContext2D,
  particles: EquatoriaParticle[],
): void {
  ctx.font = '3px monospace';
  ctx.fillStyle = 'rgba(200, 200, 200, 0.7)';
  ctx.textAlign = 'left';
  const step = Math.max(1, Math.floor(particles.length / 30));
  for (let i = 0; i < particles.length; i += step) {
    const p = particles[i];
    const px = getSizePixels(p.sizeIndex);
    if (px === 1) continue;
    const factor = Math.sqrt(px).toFixed(1);
    ctx.fillText(factor, p.x + p.size + 1, p.y);
  }
}

// ─── Interaction matrix overlay ──────────────────────────────────

function drawInteractionMatrixOverlay(
  ctx: CanvasRenderingContext2D,
  matrix: number[][],
  canvasWidth: number,
): void {
  const n = matrix.length;
  const cellPx = Math.max(2, Math.floor(Math.min(canvasWidth * 0.4, 80) / n));
  const totalPx = cellPx * n;
  const ox = 4;
  const oy = 4;

  // Background
  ctx.fillStyle = 'rgba(0, 0, 0, 0.75)';
  ctx.fillRect(ox - 1, oy - 1, totalPx + 2, totalPx + 2);

  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const v = matrix[r][c];
      if (v > 0) {
        const intensity = Math.min(255, Math.floor(v * 400));
        ctx.fillStyle = `rgb(0, ${intensity}, 0)`;
      } else if (v < 0) {
        const intensity = Math.min(255, Math.floor(-v * 400));
        ctx.fillStyle = `rgb(${intensity}, 0, 0)`;
      } else {
        ctx.fillStyle = '#222';
      }
      ctx.fillRect(ox + c * cellPx, oy + r * cellPx, cellPx, cellPx);
    }
  }
}
