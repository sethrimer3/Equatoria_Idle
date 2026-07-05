/**
 * life-draw.ts — Canvas rendering for Life zone colonies.
 *
 * Cells render as small glowing grid-aligned squares. Deliberately no
 * per-cell health bar (colonies can hold dozens of cells). Damaged cells
 * flash white briefly; dying cells shrink/fade using dyingMs.
 */

import { LIFE_CELL_SIZE } from './life-grid';
import { LIFE_CELL_DEATH_FADE_MS } from './life-controller';
import { lifeCellWorldCenter } from './life-updates';
import type { LifeColonyController } from './life-types';

const CELL_COLOR = '#7CFF9E';
const CELL_GLOW = '#3ad66b';
const CORE_COLOR = '#c9ffd8';

export function drawLifeColonies(canvas2d: CanvasRenderingContext2D, colonies: readonly LifeColonyController[]): void {
  for (const colony of colonies) {
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

      canvas2d.save();
      canvas2d.globalAlpha = alpha;
      if (cell.hitFlashMs > 0) {
        canvas2d.fillStyle = '#ffffff';
      } else {
        canvas2d.shadowColor = CELL_GLOW;
        canvas2d.shadowBlur = 4;
        canvas2d.fillStyle = CELL_COLOR;
      }
      canvas2d.fillRect(x - half, y - half, half * 2, half * 2);
      canvas2d.restore();
    }

    if (colony.coreHp > 0) {
      canvas2d.save();
      canvas2d.shadowColor = CORE_COLOR;
      canvas2d.shadowBlur = 8;
      canvas2d.fillStyle = CORE_COLOR;
      canvas2d.beginPath();
      canvas2d.arc(colony.x, colony.y, 5, 0, Math.PI * 2);
      canvas2d.fill();
      canvas2d.restore();
    }
  }
}
