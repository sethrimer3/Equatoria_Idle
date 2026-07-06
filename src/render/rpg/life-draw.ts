/**
 * life-draw.ts — Canvas rendering for Life zone colonies.
 *
 * Cells render as small glowing grid-aligned squares. Deliberately no
 * per-cell health bar (colonies can hold dozens of cells). Damaged cells
 * flash white briefly; dying cells shrink/fade using dyingMs.
 */

import { LIFE_CELL_SIZE, type LifeGridBounds } from './life-grid';
import { LIFE_CELL_DEATH_FADE_MS } from './life-controller';
import { lifeCellWorldCenter } from './life-updates';
import type { LifeColonyController } from './life-types';

const CELL_COLOR = '#7CFF9E';
const CELL_GLOW = '#3ad66b';
const CORE_COLOR = '#c9ffd8';
const GRID_LINE_COLOR = 'rgba(124, 255, 158, 0.07)';
const GRID_PULSE_COLOR = 'rgba(124, 255, 158, 0.035)';

/** Life Without Death corruption cells: sickly yellow-green/white, never a health bar. */
const CORRUPTION_CELL_COLOR = '#d8ff5e';
const CORRUPTION_CELL_GLOW = '#f4fff0';
/** Generations ghost cells: pale, cool, flickering transitional state. */
const GHOST_CELL_COLOR = '#cfe8ff';
const GHOST_CELL_GLOW = '#8fb8e8';

/**
 * Draws the subtle grid background for the Life zone battlefield. Call only
 * when the active zone is 'life' and no boss override is active — this is a
 * cosmetic backdrop, not part of hit detection (which uses LifeGridBounds
 * directly via life-grid.ts).
 *
 * `pulsePhase` (0..1) drives a faint ambient brightness pulse so the grid
 * reads as "alive" rather than a static overlay.
 */
export function drawLifeGridBackground(
  canvas2d: CanvasRenderingContext2D,
  bounds: LifeGridBounds,
  pulsePhase: number,
): void {
  const left = bounds.originX + bounds.minCol * LIFE_CELL_SIZE;
  const top = bounds.originY + bounds.minRow * LIFE_CELL_SIZE;
  const width = (bounds.maxCol - bounds.minCol + 1) * LIFE_CELL_SIZE;
  const height = (bounds.maxRow - bounds.minRow + 1) * LIFE_CELL_SIZE;

  canvas2d.save();
  const pulse = 0.5 + 0.5 * Math.sin(pulsePhase * Math.PI * 2);
  canvas2d.fillStyle = GRID_PULSE_COLOR;
  canvas2d.globalAlpha = 0.4 + 0.6 * pulse;
  canvas2d.fillRect(left, top, width, height);
  canvas2d.globalAlpha = 1;

  canvas2d.strokeStyle = GRID_LINE_COLOR;
  canvas2d.lineWidth = 1;
  canvas2d.beginPath();
  for (let col = bounds.minCol; col <= bounds.maxCol + 1; col++) {
    const x = bounds.originX + col * LIFE_CELL_SIZE + 0.5;
    canvas2d.moveTo(x, top);
    canvas2d.lineTo(x, top + height);
  }
  for (let row = bounds.minRow; row <= bounds.maxRow + 1; row++) {
    const y = bounds.originY + row * LIFE_CELL_SIZE + 0.5;
    canvas2d.moveTo(left, y);
    canvas2d.lineTo(left + width, y);
  }
  canvas2d.stroke();
  canvas2d.restore();
}

export function drawLifeColonies(canvas2d: CanvasRenderingContext2D, colonies: readonly LifeColonyController[]): void {
  for (const colony of colonies) {
    // Life Without Death corruption colonies decay on a per-cell lifetime
    // (see cellDecayLifetimeMs) rather than the survival rule — give them a
    // distinct sickly palette so that decay reads visually as "corrupted"
    // rather than a normal Life colony.
    const isCorruption = colony.cellDecayLifetimeMs !== undefined;
    for (const cell of colony.cells.values()) {
      const { x, y } = lifeCellWorldCenter(colony, cell.col, cell.row);
      let scale = 1;
      let alpha = 1;
      if (cell.isDying) {
        const t = Math.max(0, cell.dyingMs / LIFE_CELL_DEATH_FADE_MS);
        scale = t;
        alpha = t;
      } else {
        // Brief grow-in on birth.
        const age = colony.generation - cell.bornAtGeneration;
        if (age <= 0) scale = 0.4;
      }
      const half = (LIFE_CELL_SIZE * 0.72 * scale) / 2;
      if (half <= 0.2) continue;

      const isGhost = cell.lifeState === 'ghost';
      if (isGhost) {
        // Transitional alive->ghost->dead state: pale, flickering, partly
        // transparent — visually distinct from both alive and dying cells.
        const flicker = 0.35 + 0.35 * Math.abs(Math.sin(cell.ghostMs * 0.02));
        alpha *= flicker;
      }

      canvas2d.save();
      canvas2d.globalAlpha = alpha;
      if (cell.hitFlashMs > 0) {
        canvas2d.fillStyle = '#ffffff';
      } else if (isGhost) {
        canvas2d.shadowColor = GHOST_CELL_GLOW;
        canvas2d.shadowBlur = 5;
        canvas2d.fillStyle = GHOST_CELL_COLOR;
      } else if (isCorruption) {
        canvas2d.shadowColor = CORRUPTION_CELL_GLOW;
        canvas2d.shadowBlur = 6;
        canvas2d.fillStyle = CORRUPTION_CELL_COLOR;
      } else {
        canvas2d.shadowColor = CELL_GLOW;
        canvas2d.shadowBlur = 4;
        canvas2d.fillStyle = CELL_COLOR;
      }
      canvas2d.fillRect(x - half, y - half, half * 2, half * 2);
      canvas2d.restore();
    }

    // Core visuals only ever draw for a possible future core-bearing variant
    // (coreHp is always 0 for every shipped Life field) — no default colony
    // renders a core.
    if (colony.coreHp > 0) {
      canvas2d.save();
      canvas2d.shadowColor = CORE_COLOR;
      canvas2d.shadowBlur = 8;
      canvas2d.fillStyle = CORE_COLOR;
      canvas2d.beginPath();
      canvas2d.arc(colony.x, colony.y, 5, 0, Math.PI * 2);
      canvas2d.fill();
      canvas2d.restore();

      // Compact colony health indicator for the core only — individual cells
      // never get one (see LifeCellEntity.hideHealthBar).
      const barWidth = 22, barHeight = 3;
      const barX = colony.x - barWidth / 2, barY = colony.y - 12;
      canvas2d.save();
      canvas2d.fillStyle = 'rgba(0, 0, 0, 0.5)';
      canvas2d.fillRect(barX, barY, barWidth, barHeight);
      canvas2d.fillStyle = CORE_COLOR;
      canvas2d.fillRect(barX, barY, barWidth * Math.max(0, colony.coreHp / colony.coreMaxHp), barHeight);
      canvas2d.restore();
    }
  }
}
